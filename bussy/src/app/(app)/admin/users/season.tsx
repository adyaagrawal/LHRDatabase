"use client";

import { useState } from "react";
import type { Car, Season, SystemRow, Vendor } from "@/lib/types";
import { saveBudgets, startNewSeason, updateSeason } from "./actions";
import { useAction } from "./use-action";

export function SeasonSettings({ season, cars, vendors }: { season: Season; cars: Car[]; vendors: Vendor[] }) {
  const { busy, run } = useAction();
  const [s, setS] = useState({
    name: season.name,
    car_label: season.car_label ?? "",
    car_id: season.car_id ?? "",
    start_date: season.start_date,
    fee: String(Math.round(Number(season.jkeys_fee_pct) * 10000) / 100),
    cols: season.dashboard_vendor_ids,
  });
  const [next, setNext] = useState({ name: "", car: "", start: "" });
  const [addCol, setAddCol] = useState("");

  return (
    <section id="season" className="scroll-mt-6">
      <h2 className="section-title mb-3">Season</h2>
      <form
        className="card grid gap-4 p-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          run(() =>
            updateSeason({
              id: season.id,
              name: s.name,
              car_label: s.car_label,
              car_id: s.car_id || null,
              start_date: s.start_date,
              jkeys_fee_percent: Number(s.fee),
              dashboard_vendor_ids: s.cols,
            }),
          );
        }}
      >
        <label className="block">
          <span className="field-label">Current season name</span>
          <input className="input" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Car label</span>
          <input className="input" value={s.car_label} onChange={(e) => setS({ ...s, car_label: e.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Default car on the form</span>
          <select className="input" value={s.car_id} onChange={(e) => setS({ ...s, car_id: e.target.value })}>
            <option value="">None</option>
            {cars.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="field-label">Season start date (dashboard week 0)</span>
          <input className="input" type="date" value={s.start_date} onChange={(e) => setS({ ...s, start_date: e.target.value })} />
        </label>
        <label className="block">
          <span className="field-label">Jkeys fee %</span>
          <input className="input" inputMode="decimal" value={s.fee} onChange={(e) => setS({ ...s, fee: e.target.value })} />
        </label>
        <div>
          <span className="field-label">Dashboard vendor columns</span>
          <ul className="flex flex-wrap gap-2">
            {s.cols.map((id, i) => (
              <li key={id} className="flex items-center gap-1 rounded-md border border-line bg-ground pl-3 text-sm">
                {vendors.find((v) => v.id === id)?.name ?? "?"}
                <button
                  type="button"
                  aria-label="Move left"
                  className="min-h-[36px] px-2 text-muted hover:text-ink disabled:opacity-30"
                  disabled={i === 0}
                  onClick={() => {
                    const c = [...s.cols];
                    [c[i - 1], c[i]] = [c[i], c[i - 1]];
                    setS({ ...s, cols: c });
                  }}
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${vendors.find((v) => v.id === id)?.name}`}
                  className="min-h-[36px] px-2 text-muted hover:text-chip-rejectedFg"
                  onClick={() => setS({ ...s, cols: s.cols.filter((x) => x !== id) })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <select aria-label="Add vendor column" className="input" value={addCol} onChange={(e) => setAddCol(e.target.value)}>
              <option value="">Add a vendor column…</option>
              {vendors
                .filter((v) => !s.cols.includes(v.id))
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
            <button
              type="button"
              className="btn-secondary"
              disabled={!addCol}
              onClick={() => {
                setS({ ...s, cols: [...s.cols, addCol] });
                setAddCol("");
              }}
            >
              Add
            </button>
          </div>
        </div>
        <div className="md:col-span-2">
          <button type="submit" className="btn-primary" disabled={busy}>
            Save season
          </button>
        </div>
      </form>

      <details className="card mt-4 p-5">
        <summary className="min-h-touch cursor-pointer font-semibold">Start a new season</summary>
        <p className="mt-2 text-sm text-muted">
          Creates the next season, makes it current, and copies the Jkeys fee and dashboard columns. Old seasons stay
          available in every season picker.
        </p>
        <form
          className="mt-4 grid gap-4 md:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => startNewSeason(next.name, next.car, next.start), () => setNext({ name: "", car: "", start: "" }));
          }}
        >
          <label className="block">
            <span className="field-label">Name</span>
            <input className="input" placeholder="2027-28" value={next.name} onChange={(e) => setNext({ ...next, name: e.target.value })} />
          </label>
          <label className="block">
            <span className="field-label">Car label</span>
            <input className="input" placeholder="LHRd (27-28)" value={next.car} onChange={(e) => setNext({ ...next, car: e.target.value })} />
          </label>
          <label className="block">
            <span className="field-label">Start date</span>
            <input className="input" type="date" value={next.start} onChange={(e) => setNext({ ...next, start: e.target.value })} />
          </label>
          <div className="flex items-end">
            <button type="submit" className="btn-primary" disabled={busy || !next.name || !next.start}>
              Start season
            </button>
          </div>
        </form>
      </details>
    </section>
  );
}

export function Budgets({
  seasonId,
  seasonName,
  systems,
  budgets,
}: {
  seasonId: string;
  seasonName: string;
  systems: SystemRow[];
  budgets: { system_id: string; amount: number }[];
}) {
  const { busy, run } = useAction();
  const [vals, setVals] = useState<Record<string, string>>(() =>
    Object.fromEntries(systems.map((s) => [s.id, budgets.find((b) => b.system_id === s.id)?.amount?.toString() ?? ""])),
  );
  const total = Object.values(vals).reduce((a, v) => a + (Number(v.replace(/[$,\s]/g, "")) || 0), 0);
  return (
    <section id="budgets" className="scroll-mt-6">
      <h2 className="section-title mb-1">Budgets · {seasonName}</h2>
      <p className="mb-3 text-sm text-muted">Leave a system blank to show “[SET]” on the dashboard.</p>
      <form
        className="card p-5"
        onSubmit={(e) => {
          e.preventDefault();
          run(() => saveBudgets(seasonId, vals));
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {systems.map((s) => (
            <label key={s.id} className="block">
              <span className="field-label">{s.name}</span>
              <input
                className="input font-mono"
                inputMode="decimal"
                placeholder="[SET]"
                value={vals[s.id] ?? ""}
                onChange={(e) => setVals({ ...vals, [s.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="font-mono text-sm">
            Total{" "}
            {total.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </p>
          <button type="submit" className="btn-primary" disabled={busy}>
            Save budgets
          </button>
        </div>
      </form>
    </section>
  );
}
