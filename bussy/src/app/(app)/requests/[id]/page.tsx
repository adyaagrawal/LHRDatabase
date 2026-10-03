import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { COLUMNS } from "@/lib/columns";
import { dateShort, dateTime, money, reqNo } from "@/lib/format";
import { STATUS_LABEL, TYPE_LABEL, type RequestEvent, type RequestViewRow } from "@/lib/types";
import { StatusChip } from "@/components/StatusChip";
import { RequestActions } from "./request-actions";

export const metadata: Metadata = { title: "Request" };

const EVENT_LABEL: Record<string, string> = {
  created: "Submitted",
  edited: "Edited",
  approved: "Approved",
  rejected: "Rejected",
  status_changed: "Status changed",
  exported: "Sent to ESL",
  checked_in: "Package checked in",
  check_in_undone: "Check-in undone",
  imported: "Imported from Microsoft Forms",
};

export default async function RequestDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rid = Number(id);
  if (!Number.isInteger(rid)) notFound();
  const { supabase, user, profile } = await requireUser();

  const [{ data: r }, { data: events }] = await Promise.all([
    supabase.from("request_view").select("*").eq("id", rid).maybeSingle(),
    supabase.from("request_event_view").select("*").eq("request_id", rid).order("created_at", { ascending: false }),
  ]);
  if (!r) notFound();
  const row = r as RequestViewRow;

  let dupNumber: number | null = null;
  if (row.possible_duplicate_of) {
    const { data: d } = await supabase.from("requests").select("request_number").eq("id", row.possible_duplicate_of).maybeSingle();
    dupNumber = d?.request_number ?? null;
  }

  let receipt: string | null = null;
  if (row.receipt_path) {
    const { data } = await supabase.storage.from("receipts").createSignedUrl(row.receipt_path, 600);
    receipt = data?.signedUrl ?? null;
  }

  const fields = COLUMNS.filter((c) => !["request_number", "status"].includes(c.key as string));
  const show = (key: keyof RequestViewRow) => {
    const c = COLUMNS.find((x) => x.key === key)!;
    const v = row[key];
    if (v === null || v === undefined || v === "") return <span className="text-muted">—</span>;
    if (c.kind === "money") return <span className="mono">{money(Number(v))}</span>;
    if (c.kind === "date") return dateShort(String(v));
    if (c.kind === "datetime") return dateTime(String(v));
    if (c.kind === "bool") return v ? "Yes" : "No";
    if (c.kind === "link")
      return (
        <a href={String(v)} target="_blank" rel="noreferrer" className="break-all text-accent-ink underline">
          {String(v)}
        </a>
      );
    if (key === "request_type") return TYPE_LABEL[row.request_type];
    if (key === "possible_duplicate_of") return dupNumber ? reqNo(dupNumber) : "—";
    return <span className="whitespace-pre-wrap">{String(v)}</span>;
  };

  return (
    <div>
      <p className="mb-3 text-sm">
        <Link href="/raw" className="font-semibold text-accent-ink underline-offset-4 hover:underline">
          Raw data
        </Link>
      </p>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="page-title">Request {reqNo(row.request_number)}</h1>
            <StatusChip status={row.status} />
          </div>
          <p className="mt-2 max-w-[72ch] text-lg">{row.items_description}</p>
          <p className="mt-1 text-muted">
            {row.requester_display} · {row.system_name ?? "No system"} · {row.vendor_name} ·{" "}
            <span className="font-mono">{money(row.nominal_total)}</span> · {row.season_name}
          </p>
        </div>
      </header>

      {row.possible_duplicate_of && (
        <p className="mb-4 rounded-md bg-chip-rejectedBg px-4 py-3 font-semibold text-chip-rejectedFg">
          Possible duplicate of{" "}
          <Link className="underline" href={`/requests/${row.possible_duplicate_of}`}>
            {dupNumber ? reqNo(dupNumber) : "another request"}
          </Link>
        </p>
      )}
      {row.status === "rejected" && row.rejection_reason && (
        <p className="mb-4 rounded-md bg-chip-rejectedBg px-4 py-3 text-chip-rejectedFg">
          <strong>Rejected:</strong> {row.rejection_reason}
        </p>
      )}

      <RequestActions
        id={row.id}
        number={row.request_number}
        status={row.status}
        role={profile.role}
        isOwner={row.submitted_by === user.id}
        receivedByMe={row.received_by === user.id}
        receivedAt={row.received_at}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="card p-5">
          <h2 className="section-title mb-3">All fields</h2>
          {receipt && (
            <p className="mb-4">
              <a href={receipt} target="_blank" rel="noreferrer" className="btn-secondary">
                Open receipt
              </a>
            </p>
          )}
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {fields.map((c) => (
              <div key={c.key} className="min-w-0 border-b border-line2 pb-2">
                <dt className="text-xs font-semibold text-muted">{c.label}</dt>
                <dd className="mt-0.5 text-sm">{show(c.key)}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="card self-start p-5">
          <h2 className="section-title mb-3">Timeline</h2>
          <ol className="space-y-4">
            {((events ?? []) as RequestEvent[]).map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-sm font-semibold">
                  {EVENT_LABEL[e.event] ?? e.event}
                  {e.to_status && e.event !== "created" && e.event !== "imported" && (
                    <span className="font-normal text-muted">
                      {" "}
                      → {STATUS_LABEL[e.to_status]}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted">
                  {dateTime(e.created_at)} · {e.actor_name ?? (e.actor_id ? "Someone" : "System import")}
                </p>
                {e.note && <p className="mt-1 text-sm">“{e.note}”</p>}
                {e.event === "edited" && e.changes && (
                  <ul className="mt-1 space-y-0.5 text-xs text-muted">
                    {Object.entries(e.changes).map(([k, [from, to]]) => (
                      <li key={k}>
                        <span className="font-semibold text-ink">{COLUMNS.find((c) => c.key === k)?.label ?? k}</span>:{" "}
                        {String(from ?? "—")} → {String(to ?? "—")}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
