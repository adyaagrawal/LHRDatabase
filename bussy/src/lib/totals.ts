import type { CartOrItem, RequestType } from "./types";

/** Round to cents without float drift. */
export function cents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export interface TotalInput {
  request_type: RequestType;
  cart_or_item?: CartOrItem | null;
  quantity?: number | null;
  unit_cost?: number | null;
  shipping_cost?: number | null;
  reimbursed_total?: number | null;
}

/**
 * §5 total rules. Mirrors the SQL trigger requests_compute_totals() so the form preview
 * matches what the database stores.
 */
export function computeTotals(i: TotalInput): { quantity: number | null; nominal_total: number } {
  const q = i.quantity ?? 0;
  const u = i.unit_cost ?? 0;
  const s = i.shipping_cost ?? 0;
  switch (i.request_type) {
    case "purchase":
      if (i.cart_or_item === "cart") return { quantity: 1, nominal_total: cents(u) };
      return { quantity: i.quantity ?? null, nominal_total: cents(q * u) };
    case "other":
      return { quantity: i.quantity ?? null, nominal_total: cents(q * u + s) };
    case "reimbursement":
      return { quantity: i.quantity ?? null, nominal_total: cents(i.reimbursed_total ?? 0) };
  }
}
