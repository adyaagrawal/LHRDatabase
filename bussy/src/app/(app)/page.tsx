import Link from "next/link";
import type { Metadata } from "next";
import { requireUser, getSeasons } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import {
  budgetLines,
  bySpender,
  bySystem,
  byVendor,
  computeKpis,
  filterByType,
  stageTotals,
  systemVendorMatrix,
  weeklyCumulative,
  withProjection,
  type FactRow,
} from "@/lib/dashboard";
import { money, pct, todayISO } from "@/lib/format";
import { STATUS_LABEL, type SystemRow, type Vendor } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { CumulativeChart } from "@/components/dashboard/CumulativeChart";
import { BreakdownTabs } from "@/components/dashboard/BreakdownTabs";
import { DashboardControls } from "@/components/dashboard/DashboardControls";

export const metadata: Metadata = { title: "Dashboard" };

const FACT_COLS =
  "id,request_number,status,request_type,nominal_total,date_of_purchase,created_at,system_id,system_name,vendor_id,vendor_name,spender_key,requester_display,items_description";

const STAGE_COLORS: Record<string, string> = {
  pending_review: "#F2B66D",
  approved: "#8FB3D9",
  submitted_to_esl: "#2F5D8A",
  received: "#1A1A18",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; all?: string }>;
}) {
  const { supabase, profile } = await requireUser();
  const sp = await searchParams;
  const seasons = await getSeasons(supabase);
  const season = seasons.find((s) => s.id === sp.season) ?? seasons.find((s) => s.is_current) ?? seasons[0];
  const includeAll = sp.all !== "0";

  if (!season) {
    return (
      <PageHeader
        title="Dashboard"
        description="No season exists yet. An admin can create one in Users & settings → Season."
      />
    );
  }

  const [rowsAll, systemsRes, vendorsRes, budgetsRes] = await Promise.all([
    fetchAll<FactRow & { request_number: number; items_description: string | null }>((f, t) =>
      supabase.from("request_view").select(FACT_COLS).eq("season_id", season.id).order("id").range(f, t),
    ),
    supabase.from("systems").select("id,name,sort_order,active").order("sort_order"),
    supabase.from("vendors").select("id,name"),
    supabase.from("budgets").select("system_id,amount").eq("season_id", season.id),
  ]);

  const systems = ((systemsRes.data ?? []) as SystemRow[]).filter((s) => s.active);
  const vendors = (vendorsRes.data ?? []) as Pick<Vendor, "id" | "name">[];
  const budgets = (budgetsRes.data ?? []) as { system_id: string; amount: number }[];
  const rows = filterByType(rowsAll, includeAll);

  const jkeys = vendors.find((v) => v.name.toLowerCase() === "jkeys")?.id ?? null;
  const k = computeKpis(rows, jkeys, Number(season.jkeys_fee_pct));
  const stages = stageTotals(rows);
  const stageSum = stages.reduce((a, s) => a + s.total, 0);
  const totalBudget = budgets.length ? budgets.reduce((a, b) => a + Number(b.amount), 0) : null;
  const weeks = withProjection(weeklyCumulative(rows, season.start_date, todayISO()), season.start_date, 7);
  const vendorCols = season.dashboard_vendor_ids
    .map((id) => vendors.find((v) => v.id === id))
    .filter((v): v is Pick<Vendor, "id" | "name"> => Boolean(v));
  const matrix = systemVendorMatrix(rows, systems, vendorCols);
  const budget = budgetLines(rows, systems, budgets);
  const isAdmin = profile.role === "admin";

  const csvRows = rows.map((r) => ({
    ID: r.request_number,
    Status: STATUS_LABEL[r.status],
    Type: r.request_type,
    System: r.system_name ?? "",
    Vendor: r.vendor_name,
    Requester: r.requester_display ?? "",
    Item: r.items_description ?? "",
    "Date of purchase": r.date_of_purchase ?? "",
    Total: r.nominal_total ?? "",
  }));

  const tiles = [
    {
      label: "Committed spend",
      value: money(k.committed),
      sub: `${k.committedOrders} orders · ${k.committedRequesters} requesters`,
    },
    { label: "Received", value: money(k.received), sub: `${k.receivedCount} orders` },
    {
      label: "At ESL, not received",
      value: money(k.atEsl),
      sub: `${k.atEslCount} orders`,
      href: "/packages",
      linkText: "Package log",
    },
    {
      label: "Awaiting approval",
      value: money(k.awaiting),
      sub: `${k.awaitingCount} requests`,
      href: profile.role === "member" ? undefined : "/admin/approvals",
      linkText: "Approvals",
    },
    {
      label: "Returned / canceled",
      value: money(k.returned),
      sub: `${k.returnedCount} orders · not counted`,
    },
    {
      label: "Jkeys processing fees",
      value: money(k.jkeysFees),
      sub: `${pct(Number(season.jkeys_fee_pct))} fee on committed Jkeys orders`,
    },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${season.name}${season.car_label ? ` · ${season.car_label}` : ""} · ${
          includeAll ? "all request types" : "purchase requests only"
        }`}
        actions={
          <DashboardControls
            seasons={seasons.map((s) => ({ id: s.id, name: s.name }))}
            seasonId={season.id}
            includeAll={includeAll}
            csvRows={csvRows}
            seasonName={season.name}
          />
        }
      />

      <section aria-label="Key numbers" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="card p-4">
            <p className="text-sm font-medium text-muted">{t.label}</p>
            <p className="mt-1 font-display text-4xl font-bold leading-none">{t.value}</p>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
              <span>{t.sub}</span>
              {t.href && (
                <Link href={t.href} className="font-semibold text-accent-ink underline-offset-4 hover:underline">
                  {t.linkText}
                </Link>
              )}
            </p>
          </div>
        ))}
      </section>

      <section className="card mt-6 p-5">
        <h2 className="section-title">Where&apos;s the money at</h2>
        <div
          className="mt-4 flex h-8 w-full overflow-hidden rounded-sm bg-line2"
          role="img"
          aria-label={stages.map((s) => `${STATUS_LABEL[s.status]} ${money(s.total)}`).join(", ")}
        >
          {stageSum > 0 &&
            stages.map((s) =>
              s.total > 0 ? (
                <div
                  key={s.status}
                  style={{ width: `${(s.total / stageSum) * 100}%`, background: STAGE_COLORS[s.status] }}
                  title={`${STATUS_LABEL[s.status]}: ${money(s.total)}`}
                />
              ) : null,
            )}
        </div>
        <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {stages.map((s) => (
            <li key={s.status} className="flex items-center gap-2">
              <span className="inline-block h-3 w-3 rounded-sm" style={{ background: STAGE_COLORS[s.status] }} />
              <span className="text-muted">{STATUS_LABEL[s.status]}</span>
              <span className="font-mono text-[13px] font-medium">{money(s.total)}</span>
              <span className="text-muted">({s.count})</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-5">
        <section className="card p-5 xl:col-span-3">
          <h2 className="section-title">Cumulative spend</h2>
          <p className="mb-3 text-sm text-muted">
            Committed spend by week since {season.start_date}. Dashed line projects the last 3 weeks
            forward 7 weeks.
          </p>
          <CumulativeChart data={weeks} budget={totalBudget} />
        </section>
        <section className="card p-5 xl:col-span-2">
          <h2 className="section-title mb-3">Spending by</h2>
          <BreakdownTabs
            system={bySystem(rows, systems).filter((s) => s.total > 0)}
            vendor={byVendor(rows)}
            spender={bySpender(rows)}
          />
        </section>
      </div>

      <section className="mt-6">
        <h2 className="section-title mb-3">Budget by system</h2>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>System</th>
                <th className="text-right">Spent</th>
                <th className="text-right">Budget</th>
                <th className="text-right">Remaining</th>
                <th className="text-right">% used</th>
              </tr>
            </thead>
            <tbody>
              {budget.map((b) => {
                const tone =
                  b.used === null ? "" : b.used >= 1 ? "bg-chip-rejectedBg text-chip-rejectedFg" : b.used >= 0.8 ? "bg-chip-pendingBg text-chip-pendingFg" : "";
                return (
                  <tr key={b.system_id}>
                    <td className="font-medium">{b.system}</td>
                    <td className="mono text-right">{money(b.spent)}</td>
                    <td className="mono text-right">
                      {b.budget === null ? (
                        isAdmin ? (
                          <Link href="/admin/users#budgets" className="font-sans font-semibold text-accent-ink underline">
                            [SET]
                          </Link>
                        ) : (
                          "[SET]"
                        )
                      ) : (
                        money(b.budget)
                      )}
                    </td>
                    <td className="mono text-right">{b.remaining === null ? "—" : money(b.remaining)}</td>
                    <td className="text-right">
                      {b.used === null ? (
                        "—"
                      ) : (
                        <span className={`rounded px-2 py-0.5 font-mono text-[13px] ${tone}`}>{pct(b.used)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="section-title mb-1">System × vendor</h2>
        <p className="mb-3 text-sm text-muted">
          Committed spend. Every system is listed, so the total always matches committed spend
          ({money(k.committed)}).
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>System</th>
                {matrix.columns.map((c) => (
                  <th key={c.id} className="text-right">
                    {c.name}
                  </th>
                ))}
                <th className="text-right">Other</th>
                <th className="text-right">Total</th>
                <th className="text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {[...matrix.rows, matrix.totals].map((r) => (
                <tr key={r.key} className={r.key === "__total" ? "bg-ground font-semibold" : ""}>
                  <td className={r.key === "__total" ? "font-semibold" : "font-medium"}>{r.label}</td>
                  {r.cells.map((c, i) => (
                    <td key={i} className={`mono text-right ${c === 0 ? "text-muted" : ""}`}>
                      {c === 0 ? "—" : money(c)}
                    </td>
                  ))}
                  <td className="mono text-right font-semibold">{money(r.total)}</td>
                  <td className="mono text-right">{pct(r.share)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
