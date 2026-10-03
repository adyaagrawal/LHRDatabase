"use server";

import { revalidatePath } from "next/cache";
import { actionUser, getCurrentSeason } from "@/lib/auth";
import { issuesToErrors, requestSchema } from "@/lib/schemas";
import { computeTotals } from "@/lib/totals";
import { errorMessage } from "@/lib/format";

export type SubmitResult =
  | { ok: true; id: number; number: number; duplicateOf: number | null }
  | { ok: false; errors?: Record<string, string>; formError?: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

export async function submitRequest(raw: Record<string, unknown>): Promise<SubmitResult> {
  const a = await actionUser();
  if (!a.ok) return { ok: false, formError: a.error };
  const { supabase, user } = a;

  // Never trust the client about which expense account is "Other".
  const acctId = String(raw.expense_account_id ?? "");
  const { data: acct } = acctId
    ? await supabase.from("expense_accounts").select("name").eq("id", acctId).maybeSingle()
    : { data: null };
  const parsed = requestSchema.safeParse({
    ...raw,
    expense_account_is_other: (acct?.name ?? "").toLowerCase() === "other",
  });
  if (!parsed.success) return { ok: false, errors: issuesToErrors(parsed.error) };
  const v = parsed.data;

  const season = await getCurrentSeason(supabase);
  if (!season) return { ok: false, formError: "No current season is set. Ask an admin to set one in Users & settings." };

  // Vendor: id, or "Other" free text matched against names + aliases
  let vendor_id: string | null = null;
  let vendor_other: string | null = null;
  if (v.vendor_id === "other") {
    const text = v.vendor_other ?? "";
    const { data: vendors } = await supabase.from("vendors").select("id,name,aliases");
    const hit = (vendors ?? []).find(
      (x: { name: string; aliases: string[] | null }) =>
        norm(x.name) === norm(text) || (x.aliases ?? []).some((al) => norm(al) === norm(text)),
    );
    if (hit) vendor_id = hit.id;
    else vendor_other = text.trim();
  } else vendor_id = v.vendor_id;

  const base = {
    season_id: season.id,
    submitted_by: user.id,
    requester_email: user.email,
    first_name: v.first_name,
    last_name: v.last_name,
    requester_name: `${v.first_name} ${v.last_name}`.trim(),
    system_id: v.system_id,
    expense_account_id: v.expense_account_id,
    expense_account_other: v.expense_account_is_other ? (v.expense_account_other ?? null) : null,
    car_id: v.car_id,
    date_of_purchase: v.date_of_purchase,
    request_type: v.request_type,
    vendor_id,
    vendor_other,
    items_description: v.items_description,
    sku: v.sku ?? null,
    reason: v.reason,
  };

  let row: Record<string, unknown>;
  if (v.request_type === "purchase") {
    const t = computeTotals({
      request_type: "purchase",
      cart_or_item: v.cart_or_item,
      quantity: v.quantity,
      unit_cost: v.unit_cost,
    });
    row = {
      ...base,
      cart_or_item: v.cart_or_item,
      quantity: t.quantity,
      unit_cost: v.unit_cost,
      nominal_total: t.nominal_total,
      shipping_cost: v.shipping_cost ?? null,
      purchase_link: v.purchase_link,
      standard_shipping: v.standard_shipping === "yes",
      shipping_instructions: v.standard_shipping === "no" ? (v.shipping_instructions ?? null) : null,
      urgency: v.urgency,
    };
  } else if (v.request_type === "other") {
    const t = computeTotals({
      request_type: "other",
      quantity: v.quantity,
      unit_cost: v.unit_cost,
      shipping_cost: v.shipping_cost,
    });
    row = {
      ...base,
      other_justification: v.other_justification,
      quantity: v.quantity,
      unit_cost: v.unit_cost,
      shipping_cost: v.shipping_cost ?? null,
      nominal_total: t.nominal_total,
      purchase_link: v.purchase_link,
      standard_shipping: v.standard_shipping === "yes",
      shipping_instructions: v.standard_shipping === "no" ? (v.shipping_instructions ?? null) : null,
      urgency: v.urgency,
    };
  } else {
    if (!v.receipt_path.startsWith(`${user.id}/`))
      return { ok: false, errors: { receipt_path: "Upload the receipt again" } };
    row = {
      ...base,
      quantity: v.quantity ?? null,
      unit_cost: v.unit_cost ?? null,
      nominal_total: v.reimbursed_total,
      receipt_path: v.receipt_path,
      ess_form_ack: v.ess_form_ack,
      feedback: v.feedback ?? null,
    };
  }

  const { data, error } = await supabase
    .from("requests")
    .insert(row)
    .select("id,request_number,possible_duplicate_of")
    .single();
  if (error || !data) return { ok: false, formError: `Couldn't save the request: ${errorMessage(error)}` };

  let duplicateOf: number | null = null;
  if (data.possible_duplicate_of) {
    const { data: d } = await supabase
      .from("requests")
      .select("request_number")
      .eq("id", data.possible_duplicate_of)
      .maybeSingle();
    duplicateOf = d?.request_number ?? null;
  }

  revalidatePath("/", "layout");
  return { ok: true, id: data.id, number: data.request_number, duplicateOf };
}
