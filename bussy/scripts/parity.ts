/**
 * Phase 9 parity check against last year's workbook numbers.
 *   pnpm tsx --env-file=.env.local scripts/parity.ts --season 2025-26
 * Purchase requests only, excluding Returned/Canceled from the system split.
 */
import { createClient } from "@supabase/supabase-js";

const EXPECTED = {
  received: { total: 49132.84, count: 142 },
  submitted_to_esl: { total: 38891.69, count: 254 },
  returned_canceled: { total: 19642.73, count: 104 },
  bySystem: {
    Composites: 21233.94,
    Dynamics: 19830.01,
    Powertrain: 17613.29,
    Management: 9035.04,
    Body: 6748.28,
    Manufacturing: 3403.11,
    Aero: 332.2,
    "Purchasing for OB": 256.59,
    // Electronics ≈ 9,572–9,885 depending on rows with a blank status
  } as Record<string, number>,
};

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const seasonName = arg("season") ?? "2025-26";
  const { data: season } = await db.from("seasons").select("id,name").eq("name", seasonName).single();
  if (!season) throw new Error(`Season ${seasonName} not found`);

  const rows: { request_number: number; status: string; nominal_total: number | null; system_name: string | null }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("request_view")
      .select("request_number,status,nominal_total,system_name")
      .eq("season_id", season.id)
      .eq("request_type", "purchase")
      .range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }

  const sum = (rs: typeof rows) => Math.round(rs.reduce((a, r) => a + Number(r.nominal_total ?? 0), 0) * 100) / 100;
  const line = (label: string, got: number, want: number, extra = "") =>
    console.log(`${Math.abs(got - want) < 0.01 ? "OK  " : "DIFF"}  ${label.padEnd(22)} got ${got.toFixed(2).padStart(10)}  want ${want.toFixed(2).padStart(10)} ${extra}`);

  console.log(`Parity · ${season.name} · purchase requests (${rows.length} rows)\n`);
  for (const s of ["received", "submitted_to_esl", "returned_canceled"] as const) {
    const rs = rows.filter((r) => r.status === s);
    line(s, sum(rs), EXPECTED[s].total, `(${rs.length} vs ${EXPECTED[s].count} orders)`);
  }
  console.log("\nBy system (received + submitted to ESL):");
  const counted = rows.filter((r) => r.status === "received" || r.status === "submitted_to_esl");
  const systems = new Set([...counted.map((r) => r.system_name ?? "No system"), ...Object.keys(EXPECTED.bySystem)]);
  for (const s of [...systems].sort()) {
    const got = sum(counted.filter((r) => (r.system_name ?? "No system") === s));
    if (s in EXPECTED.bySystem) line(s, got, EXPECTED.bySystem[s]);
    else console.log(`INFO  ${s.padEnd(22)} got ${got.toFixed(2).padStart(10)}`);
  }
  const pending = rows.filter((r) => r.status === "pending_review");
  if (pending.length) {
    console.log(`\n${pending.length} rows have no status from ESL ORDERS (imported as Pending review):`);
    console.log(pending.map((r) => `#${r.request_number} ${r.system_name ?? ""} ${Number(r.nominal_total ?? 0).toFixed(2)}`).join("\n"));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
