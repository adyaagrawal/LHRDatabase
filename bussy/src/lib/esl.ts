import type { RequestViewRow } from "./types";

/** Columns ESL already knows from last year's ESL ORDERS sheet — order matters (§10). */
export const ESL_COLUMNS = [
  "ID",
  "Item",
  "Quantity",
  "Cost per Item",
  "Total Cost",
  "Item/SKU Number",
  "Other Specs if Applicable",
  "Link",
  "Vendor",
  "System",
  "Requester",
  "Request Date",
] as const;

export type EslColumn = (typeof ESL_COLUMNS)[number];

export interface EslLine {
  ID: number | null;
  Item: string;
  Quantity: number | null;
  "Cost per Item": number | null;
  "Total Cost": number | null;
  "Item/SKU Number": string;
  "Other Specs if Applicable": string;
  Link: string;
  Vendor: string;
  System: string;
  Requester: string;
  "Request Date": string;
}

export type EslLayout = "single" | "per_vendor";

/** One request → exactly one ESL line. A cart is one line, qty 1, cart total, cart link. */
export function toEslLine(r: RequestViewRow): EslLine {
  const isCart = r.request_type === "purchase" && r.cart_or_item === "cart";
  const specs: string[] = [];
  if (isCart) specs.push("Cart");
  if (r.standard_shipping === false && r.shipping_instructions) specs.push(r.shipping_instructions);
  return {
    ID: r.request_number,
    Item: `${isCart ? "Cart: " : ""}${r.items_description ?? ""}`.trim(),
    Quantity: isCart ? 1 : r.quantity === null ? null : Number(r.quantity),
    "Cost per Item": r.unit_cost === null ? null : Number(r.unit_cost),
    "Total Cost": r.nominal_total === null ? null : Number(r.nominal_total),
    "Item/SKU Number": r.sku ?? "",
    "Other Specs if Applicable": specs.join(" — "),
    Link: r.purchase_link ?? "",
    Vendor: r.vendor_name ?? "",
    System: r.system_name ?? "",
    Requester: r.requester_display ?? "",
    "Request Date": r.date_of_purchase ?? "",
  };
}

/** Group lines by vendor (alphabetical), lines sorted by ID inside each group. */
export function groupByVendor(lines: EslLine[]): { vendor: string; lines: EslLine[]; total: number }[] {
  const map = new Map<string, EslLine[]>();
  for (const l of lines) {
    const k = l.Vendor || "Unknown";
    map.set(k, [...(map.get(k) ?? []), l]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, ls]) => ({
      vendor,
      lines: ls.sort((a, b) => (a.ID ?? 0) - (b.ID ?? 0)),
      total: Math.round(ls.reduce((s, l) => s + (l["Total Cost"] ?? 0), 0) * 100) / 100,
    }));
}

function cell(v: unknown, sep: string): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? String(v) : String(v);
  if (sep === "\t") return s.replace(/[\t\r\n]+/g, " ");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV (or TSV for "Copy rows"). Lines are grouped by vendor; no subtotal rows so it pastes cleanly. */
export function toDelimited(lines: EslLine[], sep: "," | "\t" = ","): string {
  const groups = groupByVendor(lines);
  const out = [ESL_COLUMNS.map((c) => cell(c, sep)).join(sep)];
  for (const g of groups)
    for (const l of g.lines) out.push(ESL_COLUMNS.map((c) => cell(l[c], sep)).join(sep));
  return out.join("\r\n");
}

export function exportFileName(ext: "xlsx" | "csv", when = new Date()): string {
  const d = when.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  return `LHR-Combustion_ESL-orders_${d}.${ext}`;
}

/** Generic CSV for any list of objects (dashboard + raw data downloads). */
export function rowsToCsv(rows: Record<string, unknown>[], headers?: string[]): string {
  const cols = headers ?? (rows[0] ? Object.keys(rows[0]) : []);
  const lines = [cols.map((c) => cell(c, ",")).join(",")];
  for (const r of rows) lines.push(cols.map((c) => cell(r[c], ",")).join(","));
  return lines.join("\r\n");
}
