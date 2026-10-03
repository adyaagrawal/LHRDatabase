"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { issuesToErrors, requestSchema, stepOneSchema } from "@/lib/schemas";
import { computeTotals } from "@/lib/totals";
import { money, reqNo } from "@/lib/format";
import { TEAM } from "@/lib/config";
import type { Car, ExpenseAccount, RequestType, SystemRow, Vendor } from "@/lib/types";
import { submitRequest } from "./actions";

type FormState = {
  first_name: string;
  last_name: string;
  system_id: string;
  expense_account_id: string;
  expense_account_other: string;
  car_id: string;
  date_of_purchase: string;
  request_type: "" | RequestType;
  cart_or_item: "" | "cart" | "item";
  items_description: string;
  sku: string;
  quantity: string;
  unit_cost: string;
  shipping_cost: string;
  reimbursed_total: string;
  vendor_id: string;
  vendor_other: string;
  purchase_link: string;
  standard_shipping: "" | "yes" | "no";
  shipping_instructions: string;
  urgency: string;
  reason: string;
  other_justification: string;
  receipt_path: string;
  ess_form_ack: boolean;
  feedback: string;
};

interface Props {
  userId: string;
  email: string;
  defaults: Pick<FormState, "first_name" | "last_name" | "system_id" | "car_id" | "date_of_purchase">;
  systems: SystemRow[];
  accounts: ExpenseAccount[];
  cars: Car[];
  vendors: Vendor[];
  seasonName: string;
}

const MAX_RECEIPT = 10 * 1024 * 1024;
const RECEIPT_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "image/gif", "application/pdf"];

// ── small building blocks ───────────────────────────────────────────────────
function Field({
  id,
  label,
  help,
  error,
  required,
  children,
}: {
  id: string;
  label: string;
  help?: React.ReactNode;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="field-label">
        {label}
        {required && <span className="text-accent-ink"> *</span>}
      </label>
      {children}
      {help && !error && (
        <p id={`${id}-help`} className="field-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function ChipGroup({
  name,
  label,
  options,
  value,
  onChange,
  error,
  help,
}: {
  name: string;
  label: string;
  options: { value: string; label: string; description?: string | null }[];
  value: string;
  onChange: (v: string) => void;
  error?: string;
  help?: React.ReactNode;
}) {
  const withDesc = options.some((o) => o.description);
  return (
    <fieldset aria-describedby={error ? `${name}-error` : undefined}>
      <legend className="field-label">
        {label}
        <span className="text-accent-ink"> *</span>
      </legend>
      <div className={withDesc ? "grid grid-cols-1 gap-2 sm:grid-cols-2" : "flex flex-wrap gap-2"}>
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-touch cursor-pointer rounded-md border bg-surface px-3 py-2 text-sm transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[#F0B27A] ${
              value === o.value ? "border-ink bg-ink text-white" : "border-line hover:border-ink"
            } ${withDesc ? "flex-col justify-center" : "items-center"}`}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              className="sr-only"
            />
            <span className="font-semibold">{o.label}</span>
            {o.description && (
              <span className={`mt-0.5 text-[13px] ${value === o.value ? "text-[#D8D4CC]" : "text-muted"}`}>
                {o.description}
              </span>
            )}
          </label>
        ))}
      </div>
      {help && !error && <p className="field-help">{help}</p>}
      {error && (
        <p id={`${name}-error`} className="field-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}

// ── the form ────────────────────────────────────────────────────────────────
export function RequestForm(p: Props) {
  const blank: FormState = {
    ...p.defaults,
    expense_account_id: "",
    expense_account_other: "",
    request_type: "",
    cart_or_item: "",
    items_description: "",
    sku: "",
    quantity: "1",
    unit_cost: "",
    shipping_cost: "",
    reimbursed_total: "",
    vendor_id: "",
    vendor_other: "",
    purchase_link: "",
    standard_shipping: "",
    shipping_instructions: "",
    urgency: "",
    reason: "",
    other_justification: "",
    receipt_path: "",
    ess_form_ack: false,
    feedback: "",
  };
  const [f, setF] = useState<FormState>(blank);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState<{ number: number; duplicateOf: number | null } | null>(null);
  const [upload, setUpload] = useState<{ name: string; busy: boolean; error?: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setF((s) => ({ ...s, [k]: v }));
    if (errors[k as string]) setErrors((e) => ({ ...e, [k as string]: "" }));
  };

  const isOtherAccount =
    p.accounts.find((a) => a.id === f.expense_account_id)?.name.toLowerCase() === "other";
  const isCart = f.request_type === "purchase" && f.cart_or_item === "cart";
  const formVendors = p.vendors.filter((v) => v.show_on_form);
  const vendorSuggestions = useMemo(
    () => [...new Set(p.vendors.flatMap((v) => [v.name, ...(v.aliases ?? [])]))].sort(),
    [p.vendors],
  );

  const num = (s: string) => (s.trim() === "" ? null : Number(s.replace(/[$,\s]/g, "")));
  const totals = f.request_type
    ? computeTotals({
        request_type: f.request_type,
        cart_or_item: f.cart_or_item || null,
        quantity: num(f.quantity),
        unit_cost: num(f.unit_cost),
        shipping_cost: num(f.shipping_cost),
        reimbursed_total: num(f.reimbursed_total),
      })
    : null;

  function payload() {
    return {
      ...f,
      quantity: isCart ? "1" : f.quantity,
      expense_account_is_other: isOtherAccount,
    };
  }

  function nextStep() {
    const r = stepOneSchema.safeParse(payload());
    if (!r.success) {
      setErrors(issuesToErrors(r.error));
      focusFirstError();
      return;
    }
    setErrors({});
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function focusFirstError() {
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>("[aria-invalid='true'], fieldset[aria-describedby]");
      el?.scrollIntoView({ block: "center", behavior: "smooth" });
      (el?.querySelector("input") ?? el)?.focus?.();
    });
  }

  function submit() {
    setFormError(null);
    const r = requestSchema.safeParse(payload());
    if (!r.success) {
      setErrors(issuesToErrors(r.error));
      focusFirstError();
      return;
    }
    startTransition(async () => {
      const res = await submitRequest(payload());
      if (res.ok) {
        setDone({ number: res.number, duplicateOf: res.duplicateOf });
        setStep(3);
        window.scrollTo({ top: 0 });
      } else {
        if (res.errors) setErrors(res.errors);
        setFormError(res.formError ?? "Fix the highlighted fields and submit again.");
      }
    });
  }

  async function onReceipt(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_RECEIPT) {
      setUpload({ name: file.name, busy: false, error: "That file is over 10 MB. Take a smaller photo or compress the PDF." });
      return;
    }
    if (file.type && !RECEIPT_TYPES.includes(file.type)) {
      setUpload({ name: file.name, busy: false, error: "Receipts must be an image or a PDF." });
      return;
    }
    setUpload({ name: file.name, busy: true });
    const supabase = createClient();
    const safe = file.name.replace(/[^\w.-]+/g, "_").slice(-80);
    const path = `${p.userId}/${crypto.randomUUID()}-${safe}`;
    const { error } = await supabase.storage.from("receipts").upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) {
      setUpload({ name: file.name, busy: false, error: `Upload failed: ${error.message}` });
      return;
    }
    set("receipt_path", path);
    setUpload({ name: file.name, busy: false });
  }

  const inputProps = (k: keyof FormState) => ({
    id: k,
    name: k,
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `${k}-error` : `${k}-help`,
    className: `input ${errors[k] ? "input-error" : ""}`,
  });

  // ── Confirmation ──────────────────────────────────────────────────────────
  if (step === 3 && done) {
    return (
      <div className="max-w-2xl">
        <h1 className="page-title">Submitted for review</h1>
        <p className="mt-4 font-display text-6xl font-bold text-accent">Request {reqNo(done.number)}</p>
        <p className="mt-4 text-lg">
          {TEAM.approvers} will review it. Its status updates under See my requests as soon as it&apos;s
          approved, or if they need changes.
        </p>
        {done.duplicateOf && (
          <p className="mt-4 rounded-md bg-chip-pendingBg px-4 py-3 text-chip-pendingFg">
            Heads up: this looks like {reqNo(done.duplicateOf)}, which you already submitted. If it&apos;s a
            duplicate, cancel one of them from Raw data.
          </p>
        )}
        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setF({ ...blank, system_id: f.system_id, expense_account_id: f.expense_account_id, car_id: f.car_id });
              setDone(null);
              setUpload(null);
              setStep(1);
            }}
          >
            Submit another
          </button>
          <Link href="/raw?mine=1" className="btn-secondary">
            See my requests
          </Link>
        </div>
      </div>
    );
  }

  const typeLabel =
    f.request_type === "purchase"
      ? "Purchase request"
      : f.request_type === "reimbursement"
        ? "Reimbursement request"
        : f.request_type === "other"
          ? "Other"
          : "—";
  const vendorLabel =
    f.vendor_id === "other" ? f.vendor_other || "Other" : (p.vendors.find((v) => v.id === f.vendor_id)?.name ?? "—");

  return (
    <div>
      <header className="mb-6">
        <h1 className="page-title">New request</h1>
        <p className="mt-2 max-w-[72ch] font-semibold">All purchases must be recorded here.</p>
        <ul className="mt-2 max-w-[72ch] space-y-1 text-sm text-muted">
          <li>
            <strong className="text-ink">Purchase Request</strong> — any online purchase that needs to be sent
            to ESL.
          </li>
          <li>
            <strong className="text-ink">Reimbursement Request</strong> — you already made a purchase and need
            your money back.
          </li>
          <li>
            <strong className="text-ink">Other</strong> — must go through ESL but can&apos;t be a normal cart
            (vendor invoices, quotes, POs).
          </li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          If you&apos;re confused what section to put your request in, text {TEAM.treasurer} (
          <a className="font-semibold text-accent-ink underline" href={`sms:${TEAM.treasurerPhone.replace(/-/g, "")}`}>
            {TEAM.treasurerPhone}
          </a>
          ).
        </p>
        <ol className="mt-5 flex gap-2 text-sm" aria-label="Progress">
          {["General info", "Details"].map((s, i) => (
            <li
              key={s}
              aria-current={step === i + 1 ? "step" : undefined}
              className={`rounded-md px-3 py-1.5 font-semibold ${
                step === i + 1 ? "bg-ink text-white" : step > i + 1 ? "bg-line2 text-ink" : "bg-line2 text-muted"
              }`}
            >
              {i + 1}. {s}
            </li>
          ))}
        </ol>
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <form
          noValidate
          className="card space-y-6 p-5 md:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (step === 1) nextStep();
            else submit();
          }}
        >
          {step === 1 && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="first_name" label="First name" required error={errors.first_name}>
                  <input {...inputProps("first_name")} autoComplete="given-name" value={f.first_name} onChange={(e) => set("first_name", e.target.value)} />
                </Field>
                <Field id="last_name" label="Last name" required error={errors.last_name}>
                  <input {...inputProps("last_name")} autoComplete="family-name" value={f.last_name} onChange={(e) => set("last_name", e.target.value)} />
                </Field>
              </div>
              <Field id="email" label="Email" help="From your Google account.">
                <input id="email" className="input" value={p.email} readOnly disabled />
              </Field>

              <ChipGroup
                name="system_id"
                label="System"
                options={p.systems.map((s) => ({ value: s.id, label: s.name }))}
                value={f.system_id}
                onChange={(v) => set("system_id", v)}
                error={errors.system_id}
              />

              <ChipGroup
                name="expense_account_id"
                label="Expense account"
                options={p.accounts.map((a) => ({ value: a.id, label: a.name, description: a.description }))}
                value={f.expense_account_id}
                onChange={(v) => set("expense_account_id", v)}
                error={errors.expense_account_id}
              />
              {isOtherAccount && (
                <Field id="expense_account_other" label="Describe the expense account" required error={errors.expense_account_other}>
                  <input {...inputProps("expense_account_other")} value={f.expense_account_other} onChange={(e) => set("expense_account_other", e.target.value)} />
                </Field>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field id="car_id" label="What car are you purchasing for?" required error={errors.car_id}>
                  <select {...inputProps("car_id")} value={f.car_id} onChange={(e) => set("car_id", e.target.value)}>
                    <option value="">Choose a car</option>
                    {p.cars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field id="date_of_purchase" label="Date of purchase" required error={errors.date_of_purchase}>
                  <input {...inputProps("date_of_purchase")} type="date" value={f.date_of_purchase} onChange={(e) => set("date_of_purchase", e.target.value)} />
                </Field>
              </div>

              <ChipGroup
                name="request_type"
                label="What brings you here today?"
                options={[
                  { value: "purchase", label: "Purchase Request" },
                  { value: "reimbursement", label: "Reimbursement Request" },
                  { value: "other", label: "Other" },
                ]}
                value={f.request_type}
                onChange={(v) => set("request_type", v as RequestType)}
                error={errors.request_type}
              />

              <div className="flex justify-end">
                <button type="submit" className="btn-primary">
                  Continue to details
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="section-title">
                {f.request_type === "purchase"
                  ? "Purchase request (Pro-Card or through ESL)"
                  : f.request_type === "reimbursement"
                    ? "Reimbursement request"
                    : "Other"}
              </h2>

              {f.request_type === "other" && (
                <Field
                  id="other_justification"
                  label="Please describe, in detail, why your selection falls in the Other section"
                  required
                  error={errors.other_justification}
                >
                  <textarea {...inputProps("other_justification")} rows={3} value={f.other_justification} onChange={(e) => set("other_justification", e.target.value)} />
                </Field>
              )}

              {f.request_type === "purchase" && (
                <ChipGroup
                  name="cart_or_item"
                  label="Cart or item?"
                  options={[
                    { value: "cart", label: "Cart" },
                    { value: "item", label: "Item" },
                  ]}
                  value={f.cart_or_item}
                  onChange={(v) => {
                    set("cart_or_item", v as "cart" | "item");
                    if (v === "cart") set("quantity", "1");
                  }}
                  error={errors.cart_or_item}
                  help="A cart goes to ESL as one line item."
                />
              )}

              <Field
                id="items_description"
                label={isCart ? "Cart items" : "Part name"}
                required
                error={errors.items_description}
                help="Include size or specifications necessary for ordering. Include all items in cart; format: PART NAME 1; PART NAME 2; …"
              >
                <textarea {...inputProps("items_description")} rows={3} value={f.items_description} onChange={(e) => set("items_description", e.target.value)} />
              </Field>

              <Field
                id="sku"
                label="SKU / product number"
                error={errors.sku}
                help="If your product has a SKU, you must put it in. Separate multiple SKUs like cart items: SKU 1; SKU 2; …"
              >
                <input {...inputProps("sku")} className={`${inputProps("sku").className} font-mono`} value={f.sku} onChange={(e) => set("sku", e.target.value)} />
              </Field>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field
                  id="quantity"
                  label="Quantity"
                  required={f.request_type !== "reimbursement"}
                  error={errors.quantity}
                  help={isCart ? "Quantity is locked to 1 for carts so ESL doesn't order the cart more than once." : undefined}
                >
                  <input
                    {...inputProps("quantity")}
                    inputMode="numeric"
                    value={isCart ? "1" : f.quantity}
                    disabled={isCart}
                    onChange={(e) => set("quantity", e.target.value)}
                  />
                </Field>
                <Field
                  id="unit_cost"
                  label={isCart ? "Total cart cost" : "Unit cost"}
                  required={f.request_type !== "reimbursement"}
                  error={errors.unit_cost}
                >
                  <input {...inputProps("unit_cost")} inputMode="decimal" placeholder="0.00" value={f.unit_cost} onChange={(e) => set("unit_cost", e.target.value)} />
                </Field>
                {f.request_type !== "reimbursement" && (
                  <Field id="shipping_cost" label="Shipping cost" error={errors.shipping_cost} help="Leave blank or 0 if free.">
                    <input {...inputProps("shipping_cost")} inputMode="decimal" placeholder="0.00" value={f.shipping_cost} onChange={(e) => set("shipping_cost", e.target.value)} />
                  </Field>
                )}
              </div>

              {f.request_type === "reimbursement" ? (
                <Field
                  id="reimbursed_total"
                  label="Total amount being reimbursed"
                  required
                  error={errors.reimbursed_total}
                  help="Do NOT include tax unless told to do so; the University does NOT reimburse tax."
                >
                  <input {...inputProps("reimbursed_total")} inputMode="decimal" placeholder="0.00" value={f.reimbursed_total} onChange={(e) => set("reimbursed_total", e.target.value)} />
                </Field>
              ) : (
                <div className="rounded-md bg-ground px-4 py-3">
                  <p className="text-sm font-semibold">
                    {f.request_type === "other" ? "Total cost (exclude tax, include shipping)" : "Nominal total cost"}
                  </p>
                  <p className="font-mono text-2xl">{money(totals?.nominal_total ?? 0)}</p>
                  <p className="text-sm text-muted">
                    {f.request_type === "other"
                      ? "Calculated: quantity × unit cost + shipping."
                      : isCart
                        ? "Calculated: the cart total. Excludes tax and shipping."
                        : "Calculated: quantity × unit cost. Excludes tax and shipping."}
                  </p>
                </div>
              )}

              <Field id="vendor_id" label="Vendor" required error={errors.vendor_id}>
                <select {...inputProps("vendor_id")} value={f.vendor_id} onChange={(e) => set("vendor_id", e.target.value)}>
                  <option value="">Choose a vendor</option>
                  {formVendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                  <option value="other">Other (type it in)</option>
                </select>
              </Field>
              {f.vendor_id === "other" && (
                <Field id="vendor_other" label="Vendor name" required error={errors.vendor_other} help="Start typing; known vendors appear as suggestions.">
                  <input {...inputProps("vendor_other")} list="vendor-suggestions" value={f.vendor_other} onChange={(e) => set("vendor_other", e.target.value)} />
                  <datalist id="vendor-suggestions">
                    {vendorSuggestions.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </Field>
              )}

              {f.request_type !== "reimbursement" && (
                <>
                  <Field
                    id="purchase_link"
                    label="Link to purchase"
                    required
                    error={errors.purchase_link}
                    help="Enter an actual link otherwise your purchase will not be approved."
                  >
                    <input {...inputProps("purchase_link")} type="url" inputMode="url" placeholder="https://" value={f.purchase_link} onChange={(e) => set("purchase_link", e.target.value)} />
                  </Field>

                  <ChipGroup
                    name="standard_shipping"
                    label="Standard shipping?"
                    options={[
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ]}
                    value={f.standard_shipping}
                    onChange={(v) => set("standard_shipping", v as "yes" | "no")}
                    error={errors.standard_shipping}
                  />
                  {f.standard_shipping === "no" && (
                    <Field id="shipping_instructions" label="Shipping instructions" required error={errors.shipping_instructions}>
                      <textarea {...inputProps("shipping_instructions")} rows={2} value={f.shipping_instructions} onChange={(e) => set("shipping_instructions", e.target.value)} />
                    </Field>
                  )}

                  <ChipGroup
                    name="urgency"
                    label="Urgency"
                    options={["1", "2", "3", "4", "5"].map((n) => ({ value: n, label: n }))}
                    value={f.urgency}
                    onChange={(v) => set("urgency", v)}
                    error={errors.urgency}
                    help="1 = not urgent, 5 = very urgent."
                  />
                </>
              )}

              <Field id="reason" label="Reason for purchase" required error={errors.reason} help={`At least 15 characters (${f.reason.trim().length}/15).`}>
                <textarea {...inputProps("reason")} rows={3} value={f.reason} onChange={(e) => set("reason", e.target.value)} />
              </Field>

              {f.request_type === "reimbursement" && (
                <>
                  <Field
                    id="receipt"
                    label="Receipt"
                    required
                    error={errors.receipt_path || upload?.error}
                    help="Image or PDF, up to 10 MB."
                  >
                    <input
                      id="receipt"
                      type="file"
                      accept="image/*,application/pdf"
                      className="block min-h-touch w-full text-sm file:mr-3 file:min-h-touch file:rounded-md file:border file:border-line file:bg-surface file:px-4 file:font-semibold"
                      onChange={(e) => onReceipt(e.target.files?.[0])}
                    />
                    {upload && !upload.error && (
                      <p className="mt-1 text-sm" aria-live="polite">
                        {upload.busy ? `Uploading ${upload.name}…` : `Uploaded ${upload.name}`}
                      </p>
                    )}
                  </Field>

                  <div>
                    <label className="flex min-h-touch cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 accent-[#BF5700]"
                        checked={f.ess_form_ack}
                        onChange={(e) => set("ess_form_ack", e.target.checked)}
                        aria-invalid={errors.ess_form_ack ? true : undefined}
                      />
                      <span>
                        I have filled out the{" "}
                        {TEAM.essFormUrl ? (
                          <a href={TEAM.essFormUrl} target="_blank" rel="noreferrer" className="font-semibold text-accent-ink underline">
                            ESS reimbursement form
                          </a>
                        ) : (
                          "ESS reimbursement form"
                        )}{" "}
                        and set up UT direct deposit. <span className="text-accent-ink">*</span>
                      </span>
                    </label>
                    {errors.ess_form_ack && (
                      <p className="field-error" role="alert">
                        {errors.ess_form_ack}
                      </p>
                    )}
                  </div>

                  <Field id="feedback" label="Any questions/feedback?" error={errors.feedback}>
                    <textarea {...inputProps("feedback")} rows={2} value={f.feedback} onChange={(e) => set("feedback", e.target.value)} />
                  </Field>
                </>
              )}

              {formError && (
                <p role="alert" className="rounded-md bg-chip-rejectedBg px-4 py-3 text-sm text-chip-rejectedFg">
                  {formError}
                </p>
              )}

              <div className="flex flex-wrap justify-between gap-3">
                <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
                  Back
                </button>
                <button type="submit" className="btn-primary" disabled={pending || upload?.busy}>
                  {pending ? "Submitting…" : "Submit for review"}
                </button>
              </div>
            </>
          )}
        </form>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="card p-5">
            <h2 className="section-title text-xl">Summary</h2>
            <dl className="mt-3 space-y-2 text-sm">
              {[
                ["Type", typeLabel],
                ["System", p.systems.find((s) => s.id === f.system_id)?.name ?? "—"],
                ["Account", p.accounts.find((a) => a.id === f.expense_account_id)?.name ?? "—"],
                ["Car", p.cars.find((c) => c.id === f.car_id)?.label ?? "—"],
                ["Vendor", vendorLabel],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-medium">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-line2 pt-2">
                <dt className="text-muted">Total</dt>
                <dd className="font-mono text-base font-semibold">{totals ? money(totals.nominal_total) : "—"}</dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-muted">
              {f.request_type === "reimbursement"
                ? "After approval, Rohan processes your reimbursement through ESS."
                : `${TEAM.approvers} review it, then an admin sends it to ESL as one line item.`}
            </p>
            {p.seasonName && <p className="mt-2 text-xs text-muted">Season {p.seasonName}</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
