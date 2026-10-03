"use client";

import { useState } from "react";
import type { Profile, SystemRow, UserRole } from "@/lib/types";
import { ROLE_LABEL } from "@/lib/types";
import { dateShort, dateTime } from "@/lib/format";
import { EmptyState } from "@/components/EmptyState";
import { decideAccess, revokeAccess, setRole, setSystem } from "./actions";
import { useAction } from "./use-action";

function SystemSelect({
  systems,
  value,
  onChange,
  label,
}: {
  systems: SystemRow[];
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <select aria-label={label} className="input w-auto min-w-[160px]" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">No system</option>
      {systems.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </select>
  );
}

export function AccessRequests({ people, systems }: { people: Profile[]; systems: SystemRow[] }) {
  const { busy, run } = useAction();
  const [sys, setSys] = useState<Record<string, string>>({});
  return (
    <section id="access" className="scroll-mt-6">
      <h2 className="section-title mb-3">
        Access requests <span className="font-mono text-lg text-muted">({people.length})</span>
      </h2>
      {people.length === 0 ? (
        <EmptyState title="No one is waiting">New Google sign-ins show up here for approval.</EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Google email</th>
                <th>Requested</th>
                <th>System</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.full_name ?? "—"}</td>
                  <td className="mono">{p.email}</td>
                  <td>{dateShort(p.created_at)}</td>
                  <td>
                    <SystemSelect
                      label={`System for ${p.full_name ?? p.email}`}
                      systems={systems}
                      value={sys[p.id] ?? p.system_id ?? ""}
                      onChange={(v) => setSys((s) => ({ ...s, [p.id]: v }))}
                    />
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => decideAccess(p.id, true, sys[p.id] ?? p.system_id ?? null))}>
                        Approve as member
                      </button>
                      <button type="button" className="btn-danger" disabled={busy} onClick={() => run(() => decideAccess(p.id, false, null))}>
                        Deny
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function Members({ people, systems, meId }: { people: Profile[]; systems: SystemRow[]; meId: string }) {
  const { busy, run } = useAction();
  const approved = people.filter((p) => p.access_status === "approved");
  const denied = people.filter((p) => p.access_status === "denied");
  return (
    <section id="members" className="scroll-mt-6">
      <h2 className="section-title mb-1">
        Members <span className="font-mono text-lg text-muted">({approved.length})</span>
      </h2>
      <p className="mb-3 text-sm text-muted">
        Approvers can approve and reject requests. Admins can also export to ESL, override statuses and change settings.
        BUSSY won&apos;t let you remove the last admin.
      </p>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>System</th>
              <th>Role</th>
              <th>Last active</th>
              <th>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {approved.map((p) => (
              <tr key={p.id}>
                <td className="font-medium">
                  {p.full_name ?? "—"}
                  {p.id === meId && <span className="ml-2 text-xs text-muted">(you)</span>}
                </td>
                <td className="mono">{p.email}</td>
                <td>
                  <SystemSelect
                    label={`System for ${p.full_name ?? p.email}`}
                    systems={systems}
                    value={p.system_id ?? ""}
                    onChange={(v) => run(() => setSystem(p.id, v || null))}
                  />
                </td>
                <td>
                  <select
                    aria-label={`Role for ${p.full_name ?? p.email}`}
                    className="input w-auto"
                    value={p.role}
                    disabled={busy}
                    onChange={(e) => run(() => setRole(p.id, e.target.value as UserRole))}
                  >
                    {(Object.keys(ROLE_LABEL) as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="whitespace-nowrap">{p.last_seen_at ? dateTime(p.last_seen_at) : "—"}</td>
                <td>
                  {p.id !== meId && (
                    <button type="button" className="btn-ghost text-chip-rejectedFg" disabled={busy} onClick={() => run(() => revokeAccess(p.id))}>
                      Remove access
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {denied.length > 0 && (
        <details className="mt-4">
          <summary className="min-h-touch cursor-pointer py-2 text-sm font-semibold">Denied ({denied.length})</summary>
          <ul className="mt-2 space-y-2">
            {denied.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {p.full_name ?? "—"} <span className="mono text-muted">{p.email}</span>
                </span>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => decideAccess(p.id, true, p.system_id))}>
                  Approve as member
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
