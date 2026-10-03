/**
 * pnpm import:forms --file reference/BUSSY_2025-2026.xlsx --season 2025-26 [--statuses s.csv] [--dry-run]
 *
 * Reads a Microsoft Forms export (or last year's workbook), maps columns by header text,
 * and upserts into Supabase on (season, legacy_form_id). Needs NEXT_PUBLIC_SUPABASE_URL and
 * SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  applyStatuses,
  findSeason,
  formatReport,
  loadLookups,
  mapFormsRows,
  parseEslOrdersSheet,
  parseStatusCsv,
  readFormsWorkbook,
  runImport,
  sheetToMatrix,
} from "../src/lib/importer";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = arg("file");
  const seasonName = arg("season");
  const statuses = arg("statuses");
  const sheet = arg("sheet");
  const dryRun = process.argv.includes("--dry-run");
  if (!file || !seasonName) {
    console.error(
      "Usage: pnpm import:forms --file <export.xlsx> --season <2026-27> [--statuses <csv>] [--sheet <name>] [--dry-run]",
    );
    process.exit(1);
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }
  const db = createClient(url, key, { auth: { persistSession: false } });

  const season = await findSeason(db, seasonName);
  const lookups = await loadLookups(db);
  const wb = readFormsWorkbook(readFileSync(file));
  const rep = mapFormsRows(sheetToMatrix(wb, sheet), lookups);
  if (statuses) applyStatuses(rep, parseStatusCsv(readFileSync(statuses, "utf8")));
  else applyStatuses(rep, parseEslOrdersSheet(wb));

  await runImport(db, season.id, rep, { dryRun });
  const text = formatReport(rep, season.name, dryRun);
  console.log(text);
  const out = `import-report_${season.name}_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
  writeFileSync(out, text);
  console.log(`\nReport saved to ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
