"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import type { EslBatch, RequestViewRow } from "@/lib/types";
import { ESL_COLUMNS, groupByVendor, toDelimited, toEslLine, type EslLayout } from "@/lib/esl";
import { dateTime, money, reqNo, truncate } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { useToast } from "@/components/Toast";
import { markSubmitted } from "./actions";

type Past = EslBatch & { url: string | null; created_by_name: string | null };

export function ExportClient({ rows, past }: { rows: RequestViewRow[]; past: Past[] }) {
  const router = useRouter();
  const toast = useToast();
  const [selected, setSelected] = useState<Set<number>>(() => new Set(rows.map((r) => r.id)));
  const [layout, setLayout] = useState<EslLayout>("single");
  const [confirming, setConfirming] = useState(false);
  const [busy, start] = useTransition();

  useEffect(() => {
    setSelected(new Set(rows.map((r) => r.id)));
  }, [rows]);

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const lines = useMemo(() => rows.map((r) => ({ id: r.id, line: toEslLine(r) })), [rows]);
  const groups = useMemo(() => groupByVendor(lines.map((l) => l.line)), [lines]);
  const idOfLine = useMemo(() => new Map(lines.map((l) => [l.line, l.id])), [lines]);
  const chosen = rows.filter((r) => selected.has(r.id));
  const chosenTotal = chosen.reduce((a, r) => a + Number(r.nominal_total ?? 0), 0);
  const query = `ids=${chosen.map((r) => r.id).join(",")}&layout=${layout}`;

  const toggle = (ids: number[], on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      ids.forEach((id) => (on ? n.add(id) : n.delete(id)));
      return n;
    });

  async function copyRows() {
    const tsv = toDelimited(chosen.map(toEslLine), "\t");
    try {
      await navigator.clipboard.writeText(tsv);
      toast({ message: `Copied ${chosen.length} row${chosen.length === 1 ? "" : "s"} with headers. Paste into Excel or an email.` });
    } catch {
      toast({ message: "Your browser blocked the clipboard. Download the CSV instead.", tone: "error" });
    }
  }

  function submit() {
    start(async () => {
      const r = await markSubmitted(chosen.map((x) => x.id), layout);
      if (!r.ok) {
        toast({ message: r.error, tone: "error" });
        return;
      }
      setConfirming(false);
      toast({ message: `${r.count} request${r.count === 1 ? "" : "s"} marked Submitted to ESL. The file is saved under Past batches.` });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {rows.length === 0 ? (
        <EmptyState title="Nothing approved is waiting">
          Approve requests on the Approvals page and they&apos;ll be ready to export here.
        </EmptyState>
      ) : (
        <>
          <div className="card flex flex-wrap items-center justify-between gap-4 p-4">
            <fieldset className="flex flex-wrap gap-2">
              <legend className="sr-only">File layout</legend>
              {(
                [
                  ["single", "One file, grouped by vendor"],
                  ["per_vendor", "One sheet per vendor"],
                ] as const
              ).map(([v, l]) => (
                <label
                  key={v}
                  className={`flex min-h-touch cursor-pointer items-center rounded-md border px-3 text-sm font-semibold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[#F0B27A] ${
                    layout === v ? "border-ink bg-ink text-white" : "border-line bg-surface"
                  }`}
                >
                  <input type="radio" name="layout" className="sr-only" checked={layout === v} onChange={() => setLayout(v)} />
                  {l}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap gap-2">
              <a className={`btn-secondary ${chosen.length ? "" : "pointer-events-none opacity-50"}`} href={`/admin/export/file?${query}&format=xlsx`} aria-disabled={!chosen.length}>
                Download .xlsx
              </a>
              <a className={`btn-secondary ${chosen.length ? "" : "pointer-events-none opacity-50"}`} href={`/admin/export/file?${query}&format=csv`} aria-disabled={!chosen.length}>
                Download .csv
              </a>
              <button type="button" className="btn-secondary" disabled={!chosen.length} onClick={copyRows}>
                Copy rows
              </button>
              <button type="button" className="btn-primary" disabled={!chosen.length || busy} onClick={() => setConfirming(true)}>
                Mark {chosen.length} as Submitted to ESL
              </button>
            </div>
          </div>

          {confirming && (
            <div role="alertdialog" aria-labelledby="confirm-title" className="card border-accent p-5">
              <h2 id="confirm-title" className="section-title">
                Mark {chosen.length} requests as Submitted to ESL?
              </h2>
              <p className="mt-2 text-sm">
                Total {money(chosenTotal)}. BUSSY saves a copy of the file it sends and moves these requests to the
                Package log. Only do this after ESL has the file.
              </p>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn-primary" disabled={busy} onClick={submit}>
                  {busy ? "Saving…" : `Yes, mark ${chosen.length} submitted`}
                </button>
                <button type="button" className="btn-secondary" onClick={() => setConfirming(false)}>
                  Not yet
                </button>
              </div>
            </div>
          )}

          <p className="text-sm text-muted">
            {chosen.length} of {rows.length} selected · {money(chosenTotal)}
            <button
              type="button"
              className="ml-3 min-h-touch font-semibold text-accent-ink underline"
              onClick={() => toggle(rows.map((r) => r.id), chosen.length !== rows.length)}
            >
              {chosen.length === rows.length ? "Select none" : "Select all"}
            </button>
          </p>

          {groups.map((g) => {
            const ids = g.lines.map((l) => idOfLine.get(l)!).filter(Boolean);
            const allOn = ids.every((id) => selected.has(id));
            return (
              <section key={g.vendor}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="flex min-h-touch cursor-pointer items-center gap-3">
                    <input type="checkbox" className="h-5 w-5 accent-[#BF5700]" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} />
                    <span className="section-title text-xl">{g.vendor}</span>
                  </label>
                  <span className="font-mono text-sm">
                    {g.lines.length} line{g.lines.length === 1 ? "" : "s"} · {money(g.total)}
                  </span>
                </div>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="w-10">
                          <span className="sr-only">Include</span>
                        </th>
                        {ESL_COLUMNS.filter((c) => c !== "Vendor").map((c) => (
                          <th key={c} className={["Quantity", "Cost per Item", "Total Cost"].includes(c) ? "text-right" : ""}>
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.lines.map((l) => {
                        const id = idOfLine.get(l)!;
                        const r = byId.get(id)!;
                        return (
                          <tr key={id} className={selected.has(id) ? "" : "opacity-50"}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Include ${reqNo(l.ID)}`}
                                className="h-5 w-5 accent-[#BF5700]"
                                checked={selected.has(id)}
                                onChange={(e) => toggle([id], e.target.checked)}
                              />
                            </td>
                            <td className="mono font-semibold">{reqNo(l.ID)}</td>
                            <td className="max-w-[320px]">{truncate(l.Item, 90)}</td>
                            <td className="mono text-right">{l.Quantity ?? "—"}</td>
                            <td className="mono text-right">{money(l["Cost per Item"])}</td>
                            <td className="mono text-right">{money(l["Total Cost"])}</td>
                            <td className="mono">{l["Item/SKU Number"] || "—"}</td>
                            <td>{l["Other Specs if Applicable"] || "—"}</td>
                            <td>
                              {l.Link ? (
                                <a href={l.Link} target="_blank" rel="noreferrer" className="text-accent-ink underline">
                                  {truncate(l.Link.replace(/^https?:\/\/(www\.)?/, ""), 28)}
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td>{l.System}</td>
                            <td>{l.Requester}</td>
                            <td className="whitespace-nowrap">{l["Request Date"]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {dupWarning(g.lines.map((l) => byId.get(idOfLine.get(l)!)!))}
              </section>
            );
          })}
        </>
      )}

      <section>
        <h2 className="section-title mb-3">Past batches</h2>
        {past.length === 0 ? (
          <p className="text-sm text-muted">No batches yet. Each “Mark as submitted” saves its file here.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>By</th>
                  <th>Layout</th>
                  <th className="text-right">Lines</th>
                  <th className="text-right">Total</th>
                  <th>File</th>
                </tr>
              </thead>
              <tbody>
                {past.map((b) => (
                  <tr key={b.id}>
                    <td>{dateTime(b.created_at)}</td>
                    <td>{b.created_by_name ?? "—"}</td>
                    <td>{b.layout === "single" ? "Grouped by vendor" : "Sheet per vendor"}</td>
                    <td className="mono text-right">{b.line_count}</td>
                    <td className="mono text-right">{money(b.total)}</td>
                    <td>
                      {b.url ? (
                        <a href={b.url} className="font-semibold text-accent-ink underline">
                          Download
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

/** Shows a note under a vendor group when any request in it is flagged as a possible duplicate. */
function dupWarning(rs: RequestViewRow[]) {
  const flagged = rs.filter((r) => r.possible_duplicate_of);
  if (!flagged.length) return null;
  return (
    <p className="mt-2 text-sm font-semibold text-chip-rejectedFg">
      {flagged.map((r) => reqNo(r.request_number)).join(", ")} {flagged.length === 1 ? "is" : "are"} flagged as a possible
      duplicate — check before sending.
    </p>
  );
}
