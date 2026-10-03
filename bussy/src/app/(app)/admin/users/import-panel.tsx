"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importForms } from "./actions";

export function ImportPanel({ seasons, current }: { seasons: string[]; current: string }) {
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();

  return (
    <section id="import" className="scroll-mt-6">
      <h2 className="section-title mb-1">Import Microsoft Forms export</h2>
      <p className="mb-3 max-w-[72ch] text-sm text-muted">
        Upload the .xlsx from Microsoft Forms (or last year&apos;s BUSSY workbook — its ESL ORDERS statuses are picked up
        automatically). Re-importing the same file updates rows instead of duplicating them. Run a dry run first.
      </p>
      <form
        className="card grid gap-4 p-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          setError(null);
          setReport(null);
          start(async () => {
            const r = await importForms(fd);
            if (r.ok) {
              setReport(r.report);
              router.refresh();
            } else setError(r.error);
          });
        }}
      >
        <label className="block">
          <span className="field-label">Forms export (.xlsx) *</span>
          <input name="file" type="file" accept=".xlsx,.xls" required className="block min-h-touch w-full text-sm file:mr-3 file:min-h-touch file:rounded-md file:border file:border-line file:bg-surface file:px-4 file:font-semibold" />
        </label>
        <label className="block">
          <span className="field-label">Statuses CSV (optional)</span>
          <input name="statuses" type="file" accept=".csv,text/csv" className="block min-h-touch w-full text-sm file:mr-3 file:min-h-touch file:rounded-md file:border file:border-line file:bg-surface file:px-4 file:font-semibold" />
          <span className="field-help">Columns: legacy_form_id, status, admin_notes</span>
        </label>
        <label className="block">
          <span className="field-label">Into season</span>
          <select name="season" className="input" defaultValue={current}>
            {seasons.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-touch items-center gap-2 self-end text-sm font-medium">
          <input name="dry_run" type="checkbox" defaultChecked className="h-5 w-5 accent-[#BF5700]" />
          Dry run (show the report, write nothing)
        </label>
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            {busy ? "Importing…" : "Run import"}
          </button>
        </div>
      </form>
      {error && (
        <p role="alert" className="mt-3 rounded-md bg-chip-rejectedBg px-4 py-3 text-sm text-chip-rejectedFg">
          {error}
        </p>
      )}
      {report && <pre className="mt-3 max-h-[480px] overflow-auto rounded-lg bg-side p-4 font-mono text-xs leading-relaxed text-[#EDEAE4]">{report}</pre>}
    </section>
  );
}
