"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/format";
import type { UserRole } from "@/lib/types";
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
} from "@/lib/importer";

type R = { ok: true; message?: string } | { ok: false; error: string };
const done = (message?: string): R => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// ── People ──────────────────────────────────────────────────────────────────
export async function decideAccess(userId: string, approve: boolean, systemId: string | null): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const { error } = await a.supabase
    .from("profiles")
    .update(
      approve
        ? {
            access_status: "approved",
            role: "member",
            system_id: systemId || null,
            approved_by: a.user.id,
            approved_at: new Date().toISOString(),
          }
        : { access_status: "denied" },
    )
    .eq("id", userId);
  if (error) return { ok: false, error: errorMessage(error) };
  return done(approve ? "Approved — they're in." : "Access denied.");
}

export async function setRole(userId: string, role: UserRole): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const { error } = await a.supabase.from("profiles").update({ role }).eq("id", userId);
  if (error) return { ok: false, error: errorMessage(error) };
  return done("Role updated.");
}

export async function setSystem(userId: string, systemId: string | null): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const { error } = await a.supabase.from("profiles").update({ system_id: systemId || null }).eq("id", userId);
  if (error) return { ok: false, error: errorMessage(error) };
  return done("System updated.");
}

export async function revokeAccess(userId: string): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  if (userId === a.user.id) return { ok: false, error: "You can't remove your own access." };
  const { error } = await a.supabase.from("profiles").update({ access_status: "denied" }).eq("id", userId);
  if (error) return { ok: false, error: errorMessage(error) };
  return done("Access removed.");
}

// ── Season ──────────────────────────────────────────────────────────────────
export async function updateSeason(input: {
  id: string;
  name: string;
  car_label: string;
  car_id: string | null;
  start_date: string;
  jkeys_fee_percent: number;
  dashboard_vendor_ids: string[];
}): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.start_date)) return { ok: false, error: "Pick a start date." };
  if (!(input.jkeys_fee_percent >= 0 && input.jkeys_fee_percent < 100))
    return { ok: false, error: "Jkeys fee must be a percent between 0 and 100." };
  const { error } = await a.supabase
    .from("seasons")
    .update({
      name: input.name.trim(),
      car_label: input.car_label.trim() || null,
      car_id: input.car_id || null,
      start_date: input.start_date,
      jkeys_fee_pct: Math.round(input.jkeys_fee_percent * 100) / 10000,
      dashboard_vendor_ids: input.dashboard_vendor_ids,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: errorMessage(error) };
  return done("Season saved.");
}

export async function startNewSeason(name: string, carLabel: string, startDate: string): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  if (!name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(startDate))
    return { ok: false, error: "Give the season a name and a start date." };
  const { error } = await a.supabase.rpc("start_new_season", {
    p_name: name,
    p_car_label: carLabel,
    p_start_date: startDate,
  });
  if (error) return { ok: false, error: errorMessage(error) };
  return done(`Season ${name} started and set as current.`);
}

export async function saveBudgets(seasonId: string, amounts: Record<string, string>): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const upserts: { season_id: string; system_id: string; amount: number }[] = [];
  const clears: string[] = [];
  for (const [systemId, raw] of Object.entries(amounts)) {
    const t = raw.replace(/[$,\s]/g, "");
    if (t === "") {
      clears.push(systemId);
      continue;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `"${raw}" isn't a valid budget.` };
    upserts.push({ season_id: seasonId, system_id: systemId, amount: Math.round(n * 100) / 100 });
  }
  if (upserts.length) {
    const { error } = await a.supabase.from("budgets").upsert(upserts, { onConflict: "season_id,system_id" });
    if (error) return { ok: false, error: errorMessage(error) };
  }
  if (clears.length) {
    const { error } = await a.supabase.from("budgets").delete().eq("season_id", seasonId).in("system_id", clears);
    if (error) return { ok: false, error: errorMessage(error) };
  }
  return done("Budgets saved.");
}

// ── Vendors ─────────────────────────────────────────────────────────────────
export async function saveVendor(input: {
  id?: string;
  name: string;
  aliases: string;
  show_on_form: boolean;
  active: boolean;
}): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  if (!input.name.trim()) return { ok: false, error: "Vendor needs a name." };
  const row = {
    name: input.name.trim(),
    aliases: input.aliases
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
    show_on_form: input.show_on_form,
    active: input.active,
  };
  const { error } = input.id
    ? await a.supabase.from("vendors").update(row).eq("id", input.id)
    : await a.supabase.from("vendors").insert(row);
  if (error) return { ok: false, error: errorMessage(error) };
  return done(input.id ? "Vendor saved." : "Vendor added.");
}

export async function mergeVendors(keepId: string, mergeId: string): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const { error } = await a.supabase.rpc("merge_vendors", { p_keep: keepId, p_merge: mergeId });
  if (error) return { ok: false, error: errorMessage(error) };
  return done("Vendors merged. Requests now point at the one you kept.");
}

/** Turn a free-text vendor seen on requests into a real vendor and re-point those requests. */
export async function adoptVendor(text: string): Promise<R> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const name = text.trim();
  const { data: v, error } = await a.supabase
    .from("vendors")
    .insert({ name, show_on_form: false })
    .select("id")
    .single();
  if (error || !v) return { ok: false, error: errorMessage(error) };
  const { error: e2 } = await a.supabase
    .from("requests")
    .update({ vendor_id: v.id, vendor_other: null })
    .is("vendor_id", null)
    .ilike("vendor_other", name);
  if (e2) return { ok: false, error: errorMessage(e2) };
  return done(`${name} added as a vendor.`);
}

// ── Import ──────────────────────────────────────────────────────────────────
export async function importForms(fd: FormData): Promise<{ ok: true; report: string } | { ok: false; error: string }> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const file = fd.get("file");
  const statusFile = fd.get("statuses");
  const seasonName = String(fd.get("season") ?? "");
  const dryRun = fd.get("dry_run") === "on";
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Choose the Microsoft Forms .xlsx export." };

  try {
    const db = createAdminClient();
    const season = await findSeason(db, seasonName);
    const lookups = await loadLookups(db);
    const wb = readFormsWorkbook(new Uint8Array(await file.arrayBuffer()));
    const rep = mapFormsRows(sheetToMatrix(wb), lookups);

    if (statusFile instanceof File && statusFile.size > 0) applyStatuses(rep, parseStatusCsv(await statusFile.text()));
    else applyStatuses(rep, parseEslOrdersSheet(wb));

    await runImport(db, season.id, rep, { dryRun });
    if (!dryRun) revalidatePath("/", "layout");
    return { ok: true, report: formatReport(rep, season.name, dryRun) };
  } catch (e) {
    return { ok: false, error: errorMessage(e) };
  }
}
