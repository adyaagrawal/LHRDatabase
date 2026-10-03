"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { RequestViewRow } from "@/lib/types";
import { TYPE_LABEL } from "@/lib/types";
import { dateShort, dateTime, money, reqNo, truncate } from "@/lib/format";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { approveMany, rejectRequest, undoDecision } from "../../requests/actions";

export function ApprovalsQueue({ rows, dupNumbers }: { rows: RequestViewRow[]; dupNumbers: Record<number, number> }) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(rows[0]?.id ?? null);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
    setChecked((c) => new Set([...c].filter((id) => rows.some((r) => r.id === id))));
  }, [rows, selectedId]);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  function offerUndo(ids: number[], verb: string) {
    toast({
      message: `${ids.length === 1 ? reqNo(rows.find((r) => r.id === ids[0])?.request_number) : `${ids.length} requests`} ${verb}.`,
      duration: 10_000,
      action: {
        label: "Undo",
        onClick: () =>
          start(async () => {
            const r = await undoDecision(ids);
            if (!r.ok) toast({ message: r.error, tone: "error" });
            router.refresh();
          }),
      },
    });
  }

  function approve(ids: number[]) {
    start(async () => {
      const r = await approveMany(ids);
      if (!r.ok) {
        toast({ message: r.error, tone: "error" });
        return;
      }
      if (r.message) toast({ message: r.message, tone: "error" });
      setChecked(new Set());
      offerUndo(r.done ?? ids, "approved");
      router.refresh();
    });
  }

  function reject() {
    if (!selected) return;
    start(async () => {
      const r = await rejectRequest(selected.id, reason);
      if (!r.ok) {
        toast({ message: r.error, tone: "error" });
        return;
      }
      setRejecting(false);
      setReason("");
      offerUndo([selected.id], "rejected");
      router.refresh();
    });
  }

  if (rows.length === 0)
    return <EmptyState title="Nothing waiting">New requests show up here as soon as someone submits the form.</EmptyState>;

  const allChecked = checked.size === rows.length;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn-primary" disabled={busy || checked.size === 0} onClick={() => approve([...checked])}>
            Approve {checked.size || ""} selected
          </button>
          <span className="text-sm text-muted">Tick requests to approve several at once.</span>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all"
                    className="h-5 w-5 accent-[#BF5700]"
                    checked={allChecked}
                    onChange={(e) => setChecked(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th>ID</th>
                <th>Requester</th>
                <th>Item / cart</th>
                <th>Vendor</th>
                <th className="text-right">Total</th>
                <th>Urgency</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const urgent = (r.urgency ?? 0) >= 5;
                const active = r.id === selectedId;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer ${active ? "bg-chip-approvedBg/50" : urgent ? "bg-chip-pendingBg/60" : "hover:bg-ground"}`}
                    aria-selected={active}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${reqNo(r.request_number)}`}
                        className="h-5 w-5 accent-[#BF5700]"
                        checked={checked.has(r.id)}
                        onChange={(e) =>
                          setChecked((c) => {
                            const n = new Set(c);
                            if (e.target.checked) n.add(r.id);
                            else n.delete(r.id);
                            return n;
                          })
                        }
                      />
                    </td>
                    <td>
                      <button type="button" className="font-mono text-[13px] font-semibold text-accent-ink" onClick={() => setSelectedId(r.id)}>
                        {reqNo(r.request_number)}
                      </button>
                      {r.possible_duplicate_of && <span className="ml-1 rounded bg-chip-rejectedBg px-1 text-xs font-semibold text-chip-rejectedFg">dup?</span>}
                    </td>
                    <td>
                      <p className="font-medium">{r.requester_display}</p>
                      <p className="text-xs text-muted">
                        {r.system_name ?? "—"} · {dateTime(r.created_at)}
                      </p>
                    </td>
                    <td className="max-w-[280px]">
                      {r.cart_or_item === "cart" && <span className="mr-1 text-xs font-semibold text-muted">Cart</span>}
                      {truncate(r.items_description, 70)}
                    </td>
                    <td>{r.vendor_name}</td>
                    <td className="mono text-right">{money(r.nominal_total)}</td>
                    <td>
                      <span className={`font-mono ${urgent ? "font-bold text-chip-pendingFg" : ""}`}>{r.urgency ?? "—"}</span>
                    </td>
                    <td>
                      <StatusChip status={r.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <aside className="card self-start p-5 xl:sticky xl:top-6" aria-label={`Details for ${reqNo(selected.request_number)}`}>
          {selected.possible_duplicate_of && (
            <p className="mb-3 rounded-md bg-chip-rejectedBg px-3 py-2 text-sm font-semibold text-chip-rejectedFg">
              Possible duplicate of{" "}
              <Link className="underline" href={`/requests/${selected.possible_duplicate_of}`}>
                {reqNo(dupNumbers[selected.possible_duplicate_of])}
              </Link>
            </p>
          )}
          <div className="flex items-start justify-between gap-3">
            <h2 className="section-title">{reqNo(selected.request_number)}</h2>
            <Link href={`/requests/${selected.id}`} className="text-sm font-semibold text-accent-ink underline">
              Full page
            </Link>
          </div>
          <p className="mt-1 whitespace-pre-wrap">{selected.items_description}</p>
          <dl className="mt-4 space-y-2 text-sm">
            {[
              ["Type", TYPE_LABEL[selected.request_type] + (selected.cart_or_item ? ` · ${selected.cart_or_item}` : "")],
              ["Requester", `${selected.requester_display ?? ""} (${selected.requester_email ?? ""})`],
              ["System", selected.system_name],
              ["Account", (selected.expense_account_name ?? "—") + (selected.expense_account_other ? ` – ${selected.expense_account_other}` : "")],
              ["Car", selected.car_label],
              ["Date of purchase", dateShort(selected.date_of_purchase)],
              ["Vendor", selected.vendor_name],
              ["SKU", selected.sku],
              ["Quantity", selected.quantity?.toString()],
              ["Unit cost", money(selected.unit_cost)],
              ["Shipping", selected.shipping_cost === null ? null : money(selected.shipping_cost)],
              ["Total", money(selected.nominal_total)],
              ["Standard shipping", selected.standard_shipping === null ? null : selected.standard_shipping ? "Yes" : `No – ${selected.shipping_instructions ?? ""}`],
              ["Urgency", selected.urgency?.toString()],
              ["Reason", selected.reason],
              ["Why Other", selected.other_justification],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k as string} className="grid grid-cols-[110px_1fr] gap-2">
                  <dt className="text-muted">{k}</dt>
                  <dd className="whitespace-pre-wrap break-words">{v}</dd>
                </div>
              ))}
          </dl>
          {selected.purchase_link && (
            <a href={selected.purchase_link} target="_blank" rel="noreferrer" className="btn-secondary mt-4 w-full">
              Open link to purchase
            </a>
          )}
          {selected.receipt_path && (
            <Link href={`/requests/${selected.id}`} className="btn-secondary mt-2 w-full">
              View receipt
            </Link>
          )}

          <div className="mt-5 flex flex-wrap gap-2 border-t border-line2 pt-4">
            <button type="button" className="btn-primary flex-1" disabled={busy} onClick={() => approve([selected.id])}>
              Approve by TC/CE
            </button>
            <button type="button" className="btn-danger flex-1" disabled={busy} onClick={() => setRejecting((x) => !x)} aria-expanded={rejecting}>
              Reject
            </button>
          </div>
          {rejecting && (
            <div className="mt-3">
              <label htmlFor="reason" className="field-label">
                Reason (shown to the requester on their request)
              </label>
              <textarea id="reason" className="input" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn-danger mt-2" disabled={busy || !reason.trim()} onClick={reject}>
                Reject {reqNo(selected.request_number)}
              </button>
            </div>
          )}
        </aside>
      )}
    </div>
  );
}
