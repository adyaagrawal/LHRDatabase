"use client";

import { useState } from "react";
import type { Vendor } from "@/lib/types";
import { adoptVendor, mergeVendors, saveVendor } from "./actions";
import { useAction } from "./use-action";

function VendorRow({ v }: { v: Vendor }) {
  const { busy, run } = useAction();
  const [d, setD] = useState({ name: v.name, aliases: (v.aliases ?? []).join(", "), show: v.show_on_form, active: v.active });
  const dirty =
    d.name !== v.name || d.aliases !== (v.aliases ?? []).join(", ") || d.show !== v.show_on_form || d.active !== v.active;
  return (
    <tr>
      <td>
        <input aria-label="Vendor name" className="input min-w-[160px]" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </td>
      <td>
        <input
          aria-label={`Aliases for ${v.name}`}
          className="input min-w-[220px]"
          placeholder="Other spellings, comma-separated"
          value={d.aliases}
          onChange={(e) => setD({ ...d, aliases: e.target.value })}
        />
      </td>
      <td className="text-center">
        <input
          type="checkbox"
          aria-label={`Show ${v.name} on the form`}
          className="h-5 w-5 accent-[#BF5700]"
          checked={d.show}
          onChange={(e) => setD({ ...d, show: e.target.checked })}
        />
      </td>
      <td className="text-center">
        <input
          type="checkbox"
          aria-label={`${v.name} active`}
          className="h-5 w-5 accent-[#BF5700]"
          checked={d.active}
          onChange={(e) => setD({ ...d, active: e.target.checked })}
        />
      </td>
      <td>
        <button
          type="button"
          className="btn-secondary"
          disabled={!dirty || busy}
          onClick={() => run(() => saveVendor({ id: v.id, name: d.name, aliases: d.aliases, show_on_form: d.show, active: d.active }))}
        >
          Save
        </button>
      </td>
    </tr>
  );
}

export function Vendors({ vendors, unmatched }: { vendors: Vendor[]; unmatched: Record<string, number> }) {
  const { busy, run } = useAction();
  const [add, setAdd] = useState({ name: "", aliases: "", show: true });
  const [merge, setMerge] = useState({ keep: "", drop: "" });
  const unmatchedList = Object.entries(unmatched).sort((a, b) => b[1] - a[1]);

  return (
    <section id="vendors" className="scroll-mt-6">
      <h2 className="section-title mb-1">Vendors</h2>
      <p className="mb-3 text-sm text-muted">
        Aliases catch other spellings (“McMaster-Carr” → McMaster) on the form and on imports. Only vendors with “On form”
        ticked appear in the vendor list; everyone can still type any vendor under Other.
      </p>

      {unmatchedList.length > 0 && (
        <div className="card mb-4 border-chip-pendingFg/40 p-4">
          <h3 className="font-semibold">Typed-in vendors to review</h3>
          <p className="text-sm text-muted">
            These came in as free text. Add one as a vendor, or add it as an alias of an existing vendor above.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unmatchedList.map(([name, n]) => (
              <li key={name} className="flex items-center gap-2 rounded-md border border-line bg-ground pl-3 text-sm">
                {name} <span className="font-mono text-muted">×{n}</span>
                <button type="button" className="btn-ghost min-h-[36px]" disabled={busy} onClick={() => run(() => adoptVendor(name))}>
                  Add as vendor
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Aliases</th>
              <th className="text-center">On form</th>
              <th className="text-center">Active</th>
              <th>
                <span className="sr-only">Save</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {vendors.map((v) => (
              <VendorRow key={v.id} v={v} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <form
          className="card space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => saveVendor({ name: add.name, aliases: add.aliases, show_on_form: add.show, active: true }),
              () => setAdd({ name: "", aliases: "", show: true }),
            );
          }}
        >
          <h3 className="font-semibold">Add a vendor</h3>
          <input aria-label="New vendor name" className="input" placeholder="Name" value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} />
          <input
            aria-label="New vendor aliases"
            className="input"
            placeholder="Aliases (optional, comma-separated)"
            value={add.aliases}
            onChange={(e) => setAdd({ ...add, aliases: e.target.value })}
          />
          <label className="flex min-h-touch items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[#BF5700]" checked={add.show} onChange={(e) => setAdd({ ...add, show: e.target.checked })} />
            Show on the form
          </label>
          <button type="submit" className="btn-primary" disabled={busy || !add.name.trim()}>
            Add vendor
          </button>
        </form>

        <form
          className="card space-y-3 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => mergeVendors(merge.keep, merge.drop), () => setMerge({ keep: "", drop: "" }));
          }}
        >
          <h3 className="font-semibold">Merge two vendors</h3>
          <p className="text-sm text-muted">Moves every request to the vendor you keep and saves the other name as an alias.</p>
          <label className="block">
            <span className="field-label">Merge this vendor…</span>
            <select className="input" value={merge.drop} onChange={(e) => setMerge({ ...merge, drop: e.target.value })}>
              <option value="">Choose</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="field-label">…into this one (kept)</span>
            <select className="input" value={merge.keep} onChange={(e) => setMerge({ ...merge, keep: e.target.value })}>
              <option value="">Choose</option>
              {vendors
                .filter((v) => v.id !== merge.drop)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="submit" className="btn-secondary" disabled={busy || !merge.keep || !merge.drop}>
            Merge vendors
          </button>
        </form>
      </div>
    </section>
  );
}
