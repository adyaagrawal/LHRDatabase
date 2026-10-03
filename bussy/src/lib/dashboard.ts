import type { RequestStatus, RequestType } from "./types";
import { cents } from "./totals";

/** Minimal slice of request_view the dashboard needs. */
export interface FactRow {
  id: number;
  status: RequestStatus;
  request_type: RequestType;
  nominal_total: number | null;
  date_of_purchase: string | null;
  created_at: string;
  system_id: string | null;
  system_name: string | null;
  vendor_id: string | null;
  vendor_name: string;
  spender_key: string | null;
  requester_display: string | null;
}

export const COMMITTED: RequestStatus[] = ["approved", "submitted_to_esl", "received"];
export const STAGES: RequestStatus[] = ["pending_review", "approved", "submitted_to_esl", "received"];

const amt = (r: FactRow) => Number(r.nominal_total ?? 0);
const sum = (rows: FactRow[]) => cents(rows.reduce((a, r) => a + amt(r), 0));

export function filterByType<T extends FactRow>(rows: T[], includeAll: boolean): T[] {
  return includeAll ? rows : rows.filter((r) => r.request_type === "purchase");
}

export const isCommitted = (r: FactRow) => COMMITTED.includes(r.status);

/** Jkeys charges a fee on top; the fee share of a fee-inclusive total is 1 − 1/(1+pct). */
export function jkeysFee(totalInclFee: number, feePct: number): number {
  if (!feePct || feePct <= 0) return 0;
  return cents((1 - 1 / (1 + feePct)) * totalInclFee);
}

export interface Kpis {
  committed: number;
  committedOrders: number;
  committedRequesters: number;
  received: number;
  receivedCount: number;
  atEsl: number;
  atEslCount: number;
  awaiting: number;
  awaitingCount: number;
  returned: number;
  returnedCount: number;
  jkeysFees: number;
}

export function computeKpis(rows: FactRow[], jkeysVendorId: string | null, feePct: number): Kpis {
  const committed = rows.filter(isCommitted);
  const by = (s: RequestStatus) => rows.filter((r) => r.status === s);
  const jk = jkeysVendorId ? committed.filter((r) => r.vendor_id === jkeysVendorId) : [];
  return {
    committed: sum(committed),
    committedOrders: committed.length,
    committedRequesters: new Set(committed.map((r) => r.spender_key ?? `row-${r.id}`)).size,
    received: sum(by("received")),
    receivedCount: by("received").length,
    atEsl: sum(by("submitted_to_esl")),
    atEslCount: by("submitted_to_esl").length,
    awaiting: sum(by("pending_review")),
    awaitingCount: by("pending_review").length,
    returned: sum(by("returned_canceled")),
    returnedCount: by("returned_canceled").length,
    jkeysFees: jkeysFee(sum(jk), feePct),
  };
}

export function stageTotals(rows: FactRow[]): { status: RequestStatus; total: number; count: number }[] {
  return STAGES.map((s) => {
    const rs = rows.filter((r) => r.status === s);
    return { status: s, total: sum(rs), count: rs.length };
  });
}

// ── Cumulative spend by week ────────────────────────────────────────────────
const DAY = 86_400_000;
const toUTC = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
const isoFromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);

export interface WeekPoint {
  week: number;
  /** week end date (exclusive bound) as YYYY-MM-DD */
  date: string;
  actual: number | null;
  projection: number | null;
}

/**
 * Week k (k = 1 … ceil((today − start)/7)) = Σ committed with date_of_purchase < start + 7k.
 * Rows without a purchase date fall back to their submission date.
 */
export function weeklyCumulative(rows: FactRow[], startDate: string, todayISO: string): WeekPoint[] {
  const start = toUTC(startDate);
  const today = toUTC(todayISO);
  const weeks = Math.ceil((today - start) / DAY / 7);
  if (weeks <= 0) return [];
  const committed = rows.filter(isCommitted).map((r) => ({
    t: toUTC(r.date_of_purchase ?? r.created_at.slice(0, 10)),
    a: amt(r),
  }));
  const out: WeekPoint[] = [];
  for (let k = 1; k <= weeks; k++) {
    const bound = start + 7 * k * DAY;
    const v = committed.reduce((acc, c) => (c.t < bound ? acc + c.a : acc), 0);
    out.push({ week: k, date: isoFromUTC(bound), actual: cents(v), projection: null });
  }
  return out;
}

/** Ordinary least squares y = a + b·x */
export function linearFit(points: { x: number; y: number }[]): { a: number; b: number } {
  const n = points.length;
  if (n === 0) return { a: 0, b: 0 };
  if (n === 1) return { a: points[0].y, b: 0 };
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  const b = den === 0 ? 0 : num / den;
  return { a: my - b * mx, b };
}

/**
 * Adds a dashed projection: least-squares line through the last 3 weekly points, extended
 * `ahead` weeks (same as last year's LINEST/TAKE block). The last actual point also gets a
 * projection value so the dashed line connects.
 */
export function withProjection(points: WeekPoint[], startDate: string, ahead = 7): WeekPoint[] {
  if (points.length < 2) return points;
  const last3 = points.slice(-3).map((p) => ({ x: p.week, y: p.actual ?? 0 }));
  const { a, b } = linearFit(last3);
  const start = toUTC(startDate);
  const lastWeek = points[points.length - 1].week;
  const out = points.map((p, i) =>
    i === points.length - 1 ? { ...p, projection: p.actual } : { ...p },
  );
  for (let k = lastWeek + 1; k <= lastWeek + ahead; k++) {
    out.push({
      week: k,
      date: isoFromUTC(start + 7 * k * DAY),
      actual: null,
      projection: cents(Math.max(0, a + b * k)),
    });
  }
  return out;
}

// ── Breakdown lists ─────────────────────────────────────────────────────────
export interface Slice {
  key: string;
  label: string;
  total: number;
  share: number;
  count: number;
}

export function groupBy(
  rows: FactRow[],
  keyOf: (r: FactRow) => string,
  labelOf: (r: FactRow) => string,
): Slice[] {
  const map = new Map<string, Slice>();
  for (const r of rows) {
    const k = keyOf(r);
    const s = map.get(k) ?? { key: k, label: labelOf(r), total: 0, share: 0, count: 0 };
    s.total += amt(r);
    s.count += 1;
    map.set(k, s);
  }
  const all = [...map.values()];
  const grand = all.reduce((a, s) => a + s.total, 0);
  return all
    .map((s) => ({ ...s, total: cents(s.total), share: grand ? s.total / grand : 0 }))
    .sort((x, y) => y.total - x.total);
}

export function bySystem(rows: FactRow[], systems: { id: string; name: string }[]): Slice[] {
  const committed = rows.filter(isCommitted);
  const slices = groupBy(
    committed,
    (r) => r.system_id ?? "none",
    (r) => r.system_name ?? "No system",
  );
  // every system appears, even at $0
  for (const s of systems) {
    if (!slices.some((x) => x.key === s.id))
      slices.push({ key: s.id, label: s.name, total: 0, share: 0, count: 0 });
  }
  return slices.sort((x, y) => y.total - x.total);
}

export function byVendor(rows: FactRow[], top = 9): Slice[] {
  const slices = groupBy(
    rows.filter(isCommitted),
    (r) => r.vendor_id ?? `other:${r.vendor_name.toLowerCase()}`,
    (r) => r.vendor_name,
  );
  if (slices.length <= top + 1) return slices;
  const head = slices.slice(0, top);
  const tail = slices.slice(top);
  const t = tail.reduce((a, s) => a + s.total, 0);
  head.push({
    key: "__rest",
    label: `${tail.length} other vendors`,
    total: cents(t),
    share: tail.reduce((a, s) => a + s.share, 0),
    count: tail.reduce((a, s) => a + s.count, 0),
  });
  return head;
}

export function bySpender(rows: FactRow[], top = 10): Slice[] {
  return groupBy(
    rows.filter(isCommitted),
    (r) => r.spender_key ?? `row-${r.id}`,
    (r) => r.requester_display ?? "Unknown",
  ).slice(0, top);
}

// ── Budget by system ────────────────────────────────────────────────────────
export interface BudgetLine {
  system_id: string;
  system: string;
  spent: number;
  budget: number | null;
  remaining: number | null;
  used: number | null;
}

export function budgetLines(
  rows: FactRow[],
  systems: { id: string; name: string }[],
  budgets: { system_id: string; amount: number }[],
): BudgetLine[] {
  const committed = rows.filter(isCommitted);
  return systems.map((s) => {
    const spent = sum(committed.filter((r) => r.system_id === s.id));
    const b = budgets.find((x) => x.system_id === s.id);
    const budget = b ? Number(b.amount) : null;
    return {
      system_id: s.id,
      system: s.name,
      spent,
      budget,
      remaining: budget === null ? null : cents(budget - spent),
      used: budget ? spent / budget : null,
    };
  });
}

// ── System × vendor matrix ──────────────────────────────────────────────────
export interface MatrixRow {
  key: string;
  label: string;
  cells: number[]; // one per vendor column, then Other
  total: number;
  share: number;
}

export interface Matrix {
  columns: { id: string; name: string }[];
  rows: MatrixRow[];
  totals: MatrixRow;
}

export function systemVendorMatrix(
  rows: FactRow[],
  systems: { id: string; name: string }[],
  vendorColumns: { id: string; name: string }[],
): Matrix {
  const committed = rows.filter(isCommitted);
  const colIndex = new Map(vendorColumns.map((v, i) => [v.id, i]));
  const width = vendorColumns.length + 1; // + Other
  const lines = new Map<string, MatrixRow>();
  for (const s of systems)
    lines.set(s.id, { key: s.id, label: s.name, cells: Array(width).fill(0), total: 0, share: 0 });

  for (const r of committed) {
    const key = r.system_id ?? "none";
    if (!lines.has(key))
      lines.set(key, {
        key,
        label: r.system_name ?? "No system",
        cells: Array(width).fill(0),
        total: 0,
        share: 0,
      });
    const line = lines.get(key)!;
    const idx = r.vendor_id && colIndex.has(r.vendor_id) ? colIndex.get(r.vendor_id)! : width - 1;
    line.cells[idx] += amt(r);
    line.total += amt(r);
  }

  const grand = [...lines.values()].reduce((a, l) => a + l.total, 0);
  const out = [...lines.values()].map((l) => ({
    ...l,
    cells: l.cells.map(cents),
    total: cents(l.total),
    share: grand ? l.total / grand : 0,
  }));
  const totals: MatrixRow = {
    key: "__total",
    label: "Total",
    cells: Array.from({ length: width }, (_, i) => cents(out.reduce((a, l) => a + l.cells[i], 0))),
    total: cents(grand),
    share: grand ? 1 : 0,
  };
  return { columns: vendorColumns, rows: out, totals };
}
