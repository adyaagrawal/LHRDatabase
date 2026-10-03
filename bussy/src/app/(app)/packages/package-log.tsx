"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { RequestViewRow } from "@/lib/types";
import { dateShort, dateTime, daysBetween, money, reqNo, truncate } from "@/lib/format";
import { TEAM } from "@/lib/config";
import { StatusChip } from "@/components/StatusChip";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { checkIn, undoCheckIn } from "../requests/actions";

type Tab = "awaiting" | "received" | "all";

export function PackageLog({
  rows,
  userId,
  userName,
  isAdmin,
  currentSeasonId,
}: {
  rows: RequestViewRow[];
  userId: string;
  userName: string;
  isAdmin: boolean;
  currentSeasonId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("awaiting");
  const [quick, setQuick] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, start] = useTransition();

  const awaiting = rows.filter((r) => r.status === "submitted_to_esl");
  const received = rows.filter((r) => r.status === "received");
  const list = useMemo(() => {
    const base = tab === "awaiting" ? awaiting : tab === "received" ? received : rows;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((r) =>
      [r.request_number, r.items_description, r.vendor_name, r.requester_display, r.system_name]
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rows, search]);

  function doCheckIn(r: RequestViewRow) {
    start(async () => {
      const res = await checkIn(r.id);
      if (!res.ok) {
        toast({ message: res.error, tone: "error" });
        return;
      }
      toast({
        message: `${reqNo(r.request_number)} checked in as ${userName}.`,
        duration: 10_000,
        action: { label: "Undo", onClick: () => doUndo(r) },
      });
      router.refresh();
    });
  }

  function doUndo(r: RequestViewRow) {
    start(async () => {
      const res = await undoCheckIn(r.id);
      if (!res.ok) toast({ message: res.error, tone: "error" });
      else toast({ message: `${reqNo(r.request_number)} is back to Awaiting arrival.` });
      router.refresh();
    });
  }

  function quickCheckIn(e: React.FormEvent) {
    e.preventDefault();
    setQuickError(null);
    const n = Number(quick.replace(/[^\d]/g, ""));
    if (!n) {
      setQuickError("Type the request number from the label, like 512.");
      return;
    }
    const matches = rows.filter((r) => r.request_number === n);
    const match =
      matches.find((r) => r.status === "submitted_to_esl" && r.season_id === currentSeasonId) ??
      matches.find((r) => r.status === "submitted_to_esl") ??
      matches[0];
    if (!match) {
      setQuickError(`No order #${n} is waiting at ESL. Check the number, or look it up in Raw data.`);
      return;
    }
    if (match.status === "received") {
      setQuickError(
        `#${n} was already checked in${match.received_by_display ? ` by ${match.received_by_display}` : ""}${
          match.received_at ? ` on ${dateShort(match.received_at)}` : ""
        }.`,
      );
      return;
    }
    setQuick("");
    doCheckIn(match);
  }

  const canUndo = (r: RequestViewRow) =>
    r.status === "received" &&
    (isAdmin ||
      (r.received_by === userId && r.received_at !== null && Date.now() - new Date(r.received_at).getTime() < 10 * 60_000));

  return (
    <div className="space-y-5">
      <form onSubmit={quickCheckIn} className="card flex flex-wrap items-end gap-3 p-4" aria-label="Quick check-in">
        <label className="flex min-w-[200px] flex-1 flex-col">
          <span className="field-label">Quick check-in</span>
          <input
            className={`input font-mono text-lg ${quickError ? "input-error" : ""}`}
            inputMode="numeric"
            placeholder="Request #"
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            aria-invalid={quickError ? true : undefined}
            aria-describedby="quick-msg"
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          Check in as {userName.split(" ")[0]}
        </button>
        <p id="quick-msg" className={`w-full text-sm ${quickError ? "field-error" : "text-muted"}`} role={quickError ? "alert" : undefined}>
          {quickError ?? "Type the number written on the box or packing slip."}
        </p>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Packages" className="flex gap-1 rounded-md bg-line2 p-1">
          {(
            [
              ["awaiting", "Awaiting arrival", awaiting.length],
              ["received", "Received", received.length],
              ["all", "All", rows.length],
            ] as const
          ).map(([k, l, n]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-touch rounded px-3 text-sm font-semibold ${tab === k ? "bg-surface shadow-sm" : "text-muted hover:text-ink"}`}
            >
              {l} <span className="font-mono">({n})</span>
            </button>
          ))}
        </div>
        <input
          className="input w-full sm:w-72"
          type="search"
          placeholder="Search items, vendors, people"
          aria-label="Search packages"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {list.length === 0 ? (
        <EmptyState title={tab === "awaiting" ? "Nothing is waiting at ESL" : "No packages here yet"}>
          Orders appear here once an admin marks them Submitted to ESL.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Vendor</th>
                <th>System</th>
                <th>Requester</th>
                <th className="text-right">Total</th>
                <th>Sent to ESL</th>
                <th>Status</th>
                <th>Received</th>
                <th>Checked in by</th>
                <th>
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const waiting = r.status === "submitted_to_esl" ? daysBetween(r.submitted_to_esl_at) : null;
                const stuck = waiting !== null && waiting > TEAM.stuckAfterDays;
                const imported = r.status === "received" && !r.received_at;
                return (
                  <tr key={r.id} className={stuck ? "bg-chip-pendingBg/50" : ""}>
                    <td>
                      <Link href={`/requests/${r.id}`} className="mono font-semibold text-accent-ink underline-offset-4 hover:underline">
                        {reqNo(r.request_number)}
                      </Link>
                    </td>
                    <td className="max-w-[280px]">{truncate(r.items_description, 70)}</td>
                    <td>{r.vendor_name}</td>
                    <td>{r.system_name ?? "—"}</td>
                    <td>{r.requester_display}</td>
                    <td className="mono text-right">{money(r.nominal_total)}</td>
                    <td className="whitespace-nowrap">
                      {r.submitted_to_esl_at ? dateShort(r.submitted_to_esl_at) : <span className="text-muted">not recorded</span>}
                      {waiting !== null && (
                        <span className={`block text-xs ${stuck ? "font-semibold text-chip-pendingFg" : "text-muted"}`}>
                          {waiting} day{waiting === 1 ? "" : "s"} waiting{stuck ? " – follow up with ESL" : ""}
                        </span>
                      )}
                    </td>
                    <td>
                      <StatusChip status={r.status} />
                    </td>
                    <td className="whitespace-nowrap">
                      {r.received_at ? dateTime(r.received_at) : imported ? <span className="text-muted">not recorded</span> : "—"}
                    </td>
                    <td>{r.received_by_display ?? (imported ? <span className="text-muted">not recorded</span> : "—")}</td>
                    <td>
                      {r.status === "submitted_to_esl" && (
                        <button type="button" className="btn-primary" disabled={busy} onClick={() => doCheckIn(r)}>
                          Check in
                        </button>
                      )}
                      {canUndo(r) && (
                        <button type="button" className="btn-secondary" disabled={busy} onClick={() => doUndo(r)}>
                          Undo
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
