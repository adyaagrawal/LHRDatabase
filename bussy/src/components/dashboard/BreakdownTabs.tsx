"use client";
import { useState } from "react";
import type { Slice } from "@/lib/dashboard";
import { money, pct } from "@/lib/format";

const TABS = ["System", "Vendor", "Spender"] as const;

export function BreakdownTabs({
  system,
  vendor,
  spender,
}: {
  system: Slice[];
  vendor: Slice[];
  spender: Slice[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("System");
  const data = tab === "System" ? system : tab === "Vendor" ? vendor : spender;
  const max = Math.max(1, ...data.map((d) => d.total));

  return (
    <div>
      <div role="tablist" aria-label="Spending by" className="mb-4 flex gap-1 rounded-md bg-ground p-1">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-touch flex-1 rounded px-3 text-sm font-semibold ${
              tab === t ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
            }`}
          >
            {t}
          </button>
        ))}
      </div>
      <ul role="tabpanel" className="space-y-2.5">
        {data.length === 0 && <li className="text-sm text-muted">No committed spend yet.</li>}
        {data.map((d) => (
          <li key={d.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium">{d.label}</span>
              <span className="shrink-0 font-mono text-[13px]">
                {money(d.total)} <span className="text-muted">· {pct(d.share)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 rounded-sm bg-line2">
              <div className="h-2 rounded-sm bg-data" style={{ width: `${(d.total / max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
