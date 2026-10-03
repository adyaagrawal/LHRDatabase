/**
 * Microsoft Forms → Supabase importer (§13).
 * Used by `pnpm import:forms` (scripts/import-forms.ts) and the admin upload on Users & settings.
 * Pure parsing lives here; DB writes go through `runImport` with a service-role client.
 *
 * Relative imports only (this file also runs under tsx outside Next.js).
 */
import * as XLSX from "xlsx";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CartOrItem, RequestStatus, RequestType } from "./types";
import { cents } from "./totals";

// ── Header matching ─────────────────────────────────────────────────────────
export interface HeaderInfo {
  index: number;
  raw: string;
  stem: string; // lowercased, without the trailing branch suffix
  suffix: "" | "1" | "2";
}

export function parseHeaders(headers: unknown[]): HeaderInfo[] {
  return headers.map((h, index) => {
    const raw = String(h ?? "").replace(/\s+/g, " ").trim();
    const m = raw.match(/^(.*\D)([12])$/);
    const stem = (m ? m[1] : raw).trim().toLowerCase();
    return { index, raw, stem, suffix: (m ? m[2] : "") as HeaderInfo["suffix"] };
  });
}

export function findCol(
  headers: HeaderInfo[],
  prefix: string,
  suffix: "" | "1" | "2" = "",
  exact = false,
): HeaderInfo | undefined {
  const p = prefix.toLowerCase();
  return headers.find(
    (h) => h.suffix === suffix && (exact ? h.stem === p : h.stem.startsWith(p)),
  );
}

/** Prefixes for each branch. Purchase = no suffix, Other = "1", Reimbursement = "2". */
const BRANCH_FIELDS = {
  items: "part name",
  sku: "sku",
  quantity: "quantity",
  unit_cost: "unit cost",
  nominal: "nominal total",
  shipping_cost: "shipping cost",
  vendor: "vendor",
  link: "link to purchase",
  standard_shipping: "standard shipping",
  shipping_instructions: "specify any shipping",
  urgency: "urgency",
  reason: "reason",
} as const;

// ── Value cleaning ──────────────────────────────────────────────────────────
export function cleanText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).trim();
  if (s === "" || s === "0" || s.toLowerCase() === "nan" || s.toLowerCase() === "none") return null;
  return s;
}

export function parseMoney(v: unknown): { value: number | null; warn?: string } {
  if (v === null || v === undefined || v === "") return { value: null };
  if (typeof v === "number") return { value: Number.isFinite(v) ? cents(v) : null };
  const s = String(v).trim();
  if (s === "" || s.toLowerCase() === "nan") return { value: null };
  if (/^free/i.test(s) || /^n\/?a$/i.test(s) || s === "-") return { value: 0 };
  const n = Number(s.replace(/[$,\s]/g, ""));
  if (Number.isFinite(n)) return { value: cents(n) };
  return { value: null, warn: `couldn't read "${s}" as money` };
}

export function parseNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function parseDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "" || v === 0 || v === "0") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, "0");
    const d = String(v.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof v === "number") {
    // Excel serial date
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = us[3].length === 2 ? `20${us[3]}` : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = new Date(s);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

export function parseTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return new Date(Date.UTC(d.y, d.m - 1, d.d, d.H, d.M, Math.floor(d.S))).toISOString();
  }
  const t = new Date(String(v));
  return Number.isNaN(t.getTime()) ? null : t.toISOString();
}

export function parseYesNo(v: unknown): boolean | null {
  const s = cleanText(v)?.toLowerCase();
  if (!s) return null;
  if (s.startsWith("y")) return true;
  if (s.startsWith("n")) return false;
  return null;
}

export function parseRequestType(v: unknown): RequestType | null {
  const s = cleanText(v)?.toLowerCase();
  if (!s) return null;
  if (s.includes("reimburse")) return "reimbursement";
  if (s.includes("purchase")) return "purchase";
  if (s.includes("other")) return "other";
  return null;
}

export function parseStatus(v: unknown): RequestStatus | null {
  const s = cleanText(v)?.toLowerCase().replace(/[^a-z]/g, "");
  if (!s) return null;
  if (s.startsWith("received")) return "received";
  if (s.includes("submitted") || s.includes("esl")) return "submitted_to_esl";
  if (s.startsWith("returned") || s.startsWith("cancel")) return "returned_canceled";
  if (s.startsWith("reject") || s.startsWith("denied")) return "rejected";
  if (s.startsWith("approved")) return "approved";
  if (s.startsWith("pending")) return "pending_review";
  return null;
}

// ── Lookups ─────────────────────────────────────────────────────────────────
export interface Lookups {
  systems: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  cars: { id: string; label: string }[];
  vendors: { id: string; name: string; aliases: string[] }[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const SYSTEM_ALIASES: Record<string, string> = { aerodynamics: "aero", "purchasing for ob": "purchasing for ob" };

export function matchSystem(text: string | null, L: Lookups): string | null {
  if (!text) return null;
  const t = SYSTEM_ALIASES[norm(text)] ?? norm(text);
  return L.systems.find((s) => norm(s.name) === t)?.id ?? null;
}

export function matchAccount(text: string | null, L: Lookups): { id: string | null; other: string | null } {
  if (!text) return { id: null, other: null };
  const hit = L.accounts.find((a) => norm(a.name) === norm(text) || norm(text).startsWith(norm(a.name)));
  if (hit) return { id: hit.id, other: null };
  const other = L.accounts.find((a) => norm(a.name) === "other");
  return { id: other?.id ?? null, other: text };
}

export function matchCar(text: string | null, L: Lookups): string | null {
  if (!text) return null;
  const t = norm(text);
  const direct = L.cars.find((c) => norm(c.label) === t);
  if (direct) return direct.id;
  // "LHRc 2025-2026" → Penguin (25-26), and generally "YYYY-YYYY" → "(yy-yy)"
  const yrs = t.match(/20(\d{2})\s*[-–]\s*20(\d{2})/) ?? t.match(/\b(\d{2})\s*[-–]\s*(\d{2})\b/);
  if (yrs) {
    const tag = `(${yrs[1]}-${yrs[2]})`;
    const byYear = L.cars.find((c) => c.label.includes(tag));
    if (byYear) return byYear.id;
  }
  const byName = L.cars.find((c) => t.startsWith(norm(c.label.split(" (")[0])));
  return byName?.id ?? null;
}

export function matchVendor(text: string | null, L: Lookups): string | null {
  if (!text) return null;
  const t = norm(text);
  for (const v of L.vendors) {
    if (norm(v.name) === t) return v.id;
    if (v.aliases.some((a) => norm(a) === t)) return v.id;
  }
  return null;
}

// ── Row mapping ─────────────────────────────────────────────────────────────
export interface ImportRow {
  legacy_form_id: number;
  request_number: number | null;
  form_started_at: string | null;
  created_at: string | null;
  requester_name: string | null;
  first_name: string | null;
  last_name: string | null;
  requester_email: string | null;
  system_id: string | null;
  expense_account_id: string | null;
  expense_account_other: string | null;
  car_id: string | null;
  date_of_purchase: string | null;
  request_type: RequestType;
  cart_or_item: CartOrItem | null;
  items_description: string | null;
  sku: string | null;
  quantity: number | null;
  unit_cost: number | null;
  nominal_total: number | null;
  shipping_cost: number | null;
  vendor_id: string | null;
  vendor_other: string | null;
  purchase_link: string | null;
  standard_shipping: boolean | null;
  shipping_instructions: string | null;
  urgency: number | null;
  reason: string | null;
  other_justification: string | null;
  ess_form_ack: boolean | null;
  feedback: string | null;
  status?: RequestStatus;
  admin_notes?: string | null;
}

export interface ImportReport {
  matchedColumns: Record<string, string>;
  rows: ImportRow[];
  skipped: { id: number | string; why: string }[];
  warnings: { id: number | string; msg: string }[];
  vendorMatches: Record<string, string>;
  unmatchedVendors: Record<string, number>;
  totalMismatches: { id: number; form: number; computed: number }[];
  inserted?: number;
  updated?: number;
}

/** Read the first sheet (OfficeForms.Table) as an array of arrays. */
export function readFormsWorkbook(buf: ArrayBuffer | Uint8Array): XLSX.WorkBook {
  return XLSX.read(buf, { type: "array", cellDates: true });
}

export function sheetToMatrix(wb: XLSX.WorkBook, sheetName?: string): unknown[][] {
  const name =
    sheetName && wb.SheetNames.includes(sheetName)
      ? sheetName
      : (wb.SheetNames.find((n) => /raw data/i.test(n)) ?? wb.SheetNames[0]);
  return XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });
}

export function mapFormsRows(matrix: unknown[][], L: Lookups): ImportReport {
  const headers = parseHeaders(matrix[0] ?? []);
  const rep: ImportReport = {
    matchedColumns: {},
    rows: [],
    skipped: [],
    warnings: [],
    vendorMatches: {},
    unmatchedVendors: {},
    totalMismatches: [],
  };
  const col = (key: string, prefix: string, suffix: "" | "1" | "2" = "", exact = false) => {
    const h = findCol(headers, prefix, suffix, exact);
    if (h) rep.matchedColumns[key] = h.raw;
    return h;
  };

  const C = {
    id: col("Id", "id", "", true),
    start: col("Start time", "start time"),
    completion: col("Completion time", "completion time"),
    name: col("Name", "name", "", true),
    first: col("First Name", "first name"),
    last: col("Last Name", "last name"),
    email1: col("Email1", "email", "1", true),
    email: col("Email", "email", "", true),
    system: col("System", "system"),
    account: col("Expense Account", "expense account"),
    car: col("Car", "what car"),
    type: col("What brings you here", "what brings you here"),
    date: col("Date of Purchase", "date of purchase"),
    cart: col("Cart or Item", "cart or item"),
    otherWhy: col("Other justification", "please describe"),
    otherTotal: col("Other total", "total cost (exclude", "1") ?? col("Other total", "total cost", "1"),
    reimbTotal: col("Reimbursed total", "total amount being reimbursed"),
    ess: col("ESS ack", "to fully process your reimbursement"),
    feedback: col("Feedback", "any questions"),
  };
  const branch = (suffix: "" | "1" | "2") =>
    Object.fromEntries(
      Object.entries(BRANCH_FIELDS).map(([k, p]) => [k, col(`${k}${suffix ? ` (${suffix})` : ""}`, p, suffix)]),
    ) as Record<keyof typeof BRANCH_FIELDS, HeaderInfo | undefined>;
  const B = { purchase: branch(""), other: branch("1"), reimbursement: branch("2") };

  if (!C.id) {
    rep.warnings.push({ id: "-", msg: 'No "Id" column found — is this a Microsoft Forms export?' });
    return rep;
  }

  for (let i = 1; i < matrix.length; i++) {
    const row = matrix[i];
    const get = (h?: HeaderInfo) => (h ? row[h.index] : null);
    const id = parseNumber(get(C.id));
    if (id === null) continue;

    const type = parseRequestType(get(C.type));
    if (!type) {
      rep.skipped.push({ id, why: `unknown request type "${String(get(C.type) ?? "")}"` });
      continue;
    }
    const b = B[type];
    const accountText = cleanText(get(C.account));
    const items = cleanText(get(b.items));
    if (accountText?.toLowerCase() === "test" || /\bexample\b/i.test(items ?? "")) {
      rep.skipped.push({ id, why: "test row" });
      continue;
    }

    const warn = (msg: string) => rep.warnings.push({ id, msg });
    const m = (h?: HeaderInfo) => {
      const r = parseMoney(get(h));
      if (r.warn) warn(r.warn);
      return r.value;
    };

    const systemText = cleanText(get(C.system));
    const system_id = matchSystem(systemText, L);
    if (systemText && !system_id) warn(`system "${systemText}" not found`);
    const acct = matchAccount(accountText, L);
    const carText = cleanText(get(C.car));
    const car_id = matchCar(carText, L);
    if (carText && !car_id) warn(`car "${carText}" not found`);
    if (!carText) warn("car is blank");

    const vendorText = cleanText(get(b.vendor));
    const vendor_id = matchVendor(vendorText, L);
    if (vendorText) {
      if (vendor_id) rep.vendorMatches[vendorText] = L.vendors.find((v) => v.id === vendor_id)!.name;
      else rep.unmatchedVendors[vendorText] = (rep.unmatchedVendors[vendorText] ?? 0) + 1;
    }

    const cartRaw = cleanText(get(C.cart))?.toLowerCase();
    const cart_or_item: CartOrItem | null =
      type === "purchase" ? (cartRaw?.startsWith("cart") ? "cart" : cartRaw ? "item" : null) : null;

    let quantity = parseNumber(get(b.quantity));
    let unit_cost = m(b.unit_cost);
    const shipping_cost = m(b.shipping_cost);
    let formTotal: number | null;
    if (type === "other") formTotal = m(C.otherTotal);
    else if (type === "reimbursement") formTotal = m(C.reimbTotal);
    else formTotal = m(b.nominal);

    // recompute with §5 rules
    let computed: number | null = null;
    if (type === "purchase") {
      if (cart_or_item === "cart") {
        // A cart is one ESL line: qty 1, unit cost = cart total
        const cartTotal = formTotal ?? cents((quantity ?? 1) * (unit_cost ?? 0));
        if ((quantity ?? 1) !== 1) warn(`cart had quantity ${quantity}; stored as 1 × ${cartTotal}`);
        quantity = 1;
        unit_cost = cartTotal;
        computed = cartTotal;
      } else computed = cents((quantity ?? 0) * (unit_cost ?? 0));
    } else if (type === "other") {
      computed = cents((quantity ?? 0) * (unit_cost ?? 0) + (shipping_cost ?? 0));
    } else computed = formTotal;

    let nominal_total = computed;
    if (formTotal !== null && computed !== null && Math.abs(formTotal - computed) > 0.01) {
      rep.totalMismatches.push({ id, form: formTotal, computed });
      nominal_total = formTotal; // keep the form's value
    } else if (formTotal !== null && computed === null) nominal_total = formTotal;

    const urgency = parseNumber(get(b.urgency));
    const first = cleanText(get(C.first));
    const last = cleanText(get(C.last));
    const name = cleanText(get(C.name)) ?? ([first, last].filter(Boolean).join(" ") || null);

    rep.rows.push({
      legacy_form_id: id,
      request_number: id,
      form_started_at: parseTimestamp(get(C.start)),
      created_at: parseTimestamp(get(C.completion)),
      requester_name: name,
      first_name: first,
      last_name: last,
      requester_email: (cleanText(get(C.email1)) ?? cleanText(get(C.email)))?.toLowerCase() ?? null,
      system_id,
      expense_account_id: acct.id,
      expense_account_other: acct.other,
      car_id,
      date_of_purchase: parseDate(get(C.date)),
      request_type: type,
      cart_or_item,
      items_description: items,
      sku: cleanText(get(b.sku)),
      quantity,
      unit_cost,
      nominal_total,
      shipping_cost,
      vendor_id,
      vendor_other: vendor_id ? null : vendorText,
      purchase_link: cleanText(get(b.link)),
      standard_shipping: parseYesNo(get(b.standard_shipping)),
      shipping_instructions: cleanText(get(b.shipping_instructions)),
      urgency: urgency && urgency >= 1 && urgency <= 5 ? Math.round(urgency) : null,
      reason: cleanText(get(b.reason)),
      other_justification: type === "other" ? cleanText(get(C.otherWhy)) : null,
      ess_form_ack: type === "reimbursement" ? cleanText(get(C.ess)) !== null : null,
      feedback: type === "reimbursement" ? cleanText(get(C.feedback)) : null,
    });
  }
  return rep;
}

// ── Statuses: optional CSV or last year's "ESL ORDERS" sheet ──────────────
export interface StatusEntry {
  status: RequestStatus;
  admin_notes: string | null;
}

/** CSV with header legacy_form_id,status,admin_notes */
export function parseStatusCsv(text: string): Map<number, StatusEntry> {
  const wb = XLSX.read(text, { type: "string" });
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], {
    defval: null,
  });
  const out = new Map<number, StatusEntry>();
  for (const r of rows) {
    const id = parseNumber(r.legacy_form_id ?? r.id ?? r.ID);
    const status = parseStatus(r.status ?? r.Status);
    if (id !== null && status) out.set(id, { status, admin_notes: cleanText(r.admin_notes ?? r.notes) });
  }
  return out;
}

/** Last year's workbook: ESL ORDERS has a header row with ID … Status, and notes in column P. */
export function parseEslOrdersSheet(wb: XLSX.WorkBook): Map<number, StatusEntry> | null {
  const name = wb.SheetNames.find((n) => /esl\s*orders/i.test(n));
  if (!name) return null;
  const m = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null, raw: true });
  const headerIdx = m.findIndex(
    (r, i) => i < 10 && r.some((c) => String(c ?? "").trim().toLowerCase() === "id") &&
      r.some((c) => String(c ?? "").trim().toLowerCase() === "status"),
  );
  if (headerIdx < 0) return null;
  const h = m[headerIdx].map((c) => String(c ?? "").trim().toLowerCase());
  const idCol = h.indexOf("id");
  const stCol = h.indexOf("status");
  const noteCol = h.findIndex((c) => c.includes("note")) >= 0 ? h.findIndex((c) => c.includes("note")) : 15;
  const out = new Map<number, StatusEntry>();
  for (const r of m.slice(headerIdx + 1)) {
    const id = parseNumber(r[idCol]);
    const status = parseStatus(r[stCol]);
    if (id !== null && status) out.set(id, { status, admin_notes: cleanText(r[noteCol]) });
  }
  return out;
}

export function applyStatuses(rep: ImportReport, statuses: Map<number, StatusEntry> | null) {
  if (!statuses) return;
  for (const row of rep.rows) {
    const s = statuses.get(row.legacy_form_id);
    if (s) {
      row.status = s.status;
      if (s.admin_notes) row.admin_notes = s.admin_notes;
    }
  }
}

// ── DB write ────────────────────────────────────────────────────────────────
export async function loadLookups(db: SupabaseClient): Promise<Lookups> {
  const [s, a, c, v] = await Promise.all([
    db.from("systems").select("id,name"),
    db.from("expense_accounts").select("id,name"),
    db.from("cars").select("id,label"),
    db.from("vendors").select("id,name,aliases"),
  ]);
  for (const r of [s, a, c, v]) if (r.error) throw r.error;
  return {
    systems: s.data ?? [],
    accounts: a.data ?? [],
    cars: c.data ?? [],
    vendors: (v.data ?? []).map((x: { id: string; name: string; aliases: string[] | null }) => ({
      ...x,
      aliases: x.aliases ?? [],
    })),
  };
}

export async function findSeason(db: SupabaseClient, name: string): Promise<{ id: string; name: string }> {
  const { data, error } = await db.from("seasons").select("id,name");
  if (error) throw error;
  const n = (s: string) => s.replace(/[–—]/g, "-").replace(/\s+/g, "").toLowerCase();
  const hit = (data ?? []).find((s: { name: string }) => n(s.name) === n(name));
  if (!hit) throw new Error(`Season "${name}" not found. Existing: ${(data ?? []).map((s: { name: string }) => s.name).join(", ")}`);
  return hit;
}

/**
 * Upsert on (season_id, legacy_form_id). Must be called with a SERVICE-ROLE client so the
 * database keeps the form's own totals and logs the rows as "imported".
 */
export async function runImport(
  db: SupabaseClient,
  seasonId: string,
  rep: ImportReport,
  opts: { dryRun?: boolean } = {},
): Promise<ImportReport> {
  const { data: existing, error } = await db
    .from("requests")
    .select("legacy_form_id,request_number")
    .eq("season_id", seasonId);
  if (error) throw error;
  const existingIds = new Set((existing ?? []).map((r: { legacy_form_id: number | null }) => r.legacy_form_id));
  const takenNumbers = new Map<number, number | null>(
    (existing ?? []).map((r: { request_number: number; legacy_form_id: number | null }) => [
      r.request_number,
      r.legacy_form_id,
    ]),
  );

  const payload = rep.rows.map((r) => {
    const owner = r.request_number !== null ? takenNumbers.get(r.request_number) : undefined;
    // If an app-created request already uses this number, let the DB assign the next free one.
    const request_number = owner === undefined || owner === r.legacy_form_id ? r.request_number : null;
    if (request_number === null && r.request_number !== null)
      rep.warnings.push({ id: r.legacy_form_id, msg: `request number ${r.request_number} already used; a new one will be assigned` });
    const out: Record<string, unknown> = { ...r, season_id: seasonId, request_number };
    if (!r.status) delete out.status;
    if (r.admin_notes === undefined) delete out.admin_notes;
    if (!r.created_at) delete out.created_at;
    return out;
  });

  rep.inserted = payload.filter((p) => !existingIds.has(p.legacy_form_id as number)).length;
  rep.updated = payload.length - rep.inserted;
  if (opts.dryRun) return rep;

  // PostgREST bulk upserts use the union of keys, so group rows that carry the same columns
  // (e.g. with/without status or notes) and upsert each group in chunks of 200.
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const p of payload) {
    const sig = Object.keys(p).sort().join(",");
    groups.set(sig, [...(groups.get(sig) ?? []), p]);
  }
  for (const group of groups.values()) {
    for (let i = 0; i < group.length; i += 200) {
      const chunk = group.slice(i, i + 200);
      const { error: e } = await db
        .from("requests")
        .upsert(chunk, { onConflict: "season_id,legacy_form_id" });
      if (e) throw e;
    }
  }
  return rep;
}

export function formatReport(rep: ImportReport, seasonName: string, dryRun: boolean): string {
  const lines: string[] = [];
  lines.push(`BUSSY import → season ${seasonName}${dryRun ? " (DRY RUN — nothing written)" : ""}`);
  lines.push(`Rows read: ${rep.rows.length + rep.skipped.length}`);
  lines.push(`Inserted: ${rep.inserted ?? 0} · Updated: ${rep.updated ?? 0} · Skipped: ${rep.skipped.length}`);
  lines.push("");
  lines.push("Matched columns:");
  for (const [k, v] of Object.entries(rep.matchedColumns)) lines.push(`  ${k.padEnd(28)} ← ${v}`);
  if (rep.skipped.length) {
    lines.push("", "Skipped:");
    for (const s of rep.skipped) lines.push(`  #${s.id}: ${s.why}`);
  }
  if (Object.keys(rep.unmatchedVendors).length) {
    lines.push("", "Vendors not in the vendor list (stored as free text — review in Users & settings → Vendors):");
    for (const [v, n] of Object.entries(rep.unmatchedVendors)) lines.push(`  ${v} (${n})`);
  }
  if (Object.keys(rep.vendorMatches).length) {
    lines.push("", "Vendor matches:");
    for (const [from, to] of Object.entries(rep.vendorMatches))
      if (from !== to) lines.push(`  "${from}" → ${to}`);
  }
  if (rep.totalMismatches.length) {
    lines.push("", "Totals that differ from the §5 rules (form value kept):");
    for (const t of rep.totalMismatches) lines.push(`  #${t.id}: form ${t.form.toFixed(2)} vs computed ${t.computed.toFixed(2)}`);
  }
  if (rep.warnings.length) {
    lines.push("", "Warnings:");
    for (const w of rep.warnings) lines.push(`  #${w.id}: ${w.msg}`);
  }
  return lines.join("\n");
}
