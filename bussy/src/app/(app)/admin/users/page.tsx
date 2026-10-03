import type { Metadata } from "next";
import { requireUser, getSeasons } from "@/lib/auth";
import type { Car, Profile, SystemRow, Vendor } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { AccessRequests, Members } from "./people";
import { SeasonSettings, Budgets } from "./season";
import { Vendors } from "./vendors";
import { ImportPanel } from "./import-panel";

export const metadata: Metadata = { title: "Users & settings" };

export default async function UsersPage() {
  const { supabase, user } = await requireUser(["admin"]);
  const [profilesRes, systemsRes, carsRes, vendorsRes, seasons] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at", { ascending: false }),
    supabase.from("systems").select("*").order("sort_order"),
    supabase.from("cars").select("*").order("sort_order"),
    supabase.from("vendors").select("*").order("name"),
    getSeasons(supabase),
  ]);
  const current = seasons.find((s) => s.is_current) ?? seasons[0] ?? null;
  const { data: budgetRows } = current
    ? await supabase.from("budgets").select("system_id,amount").eq("season_id", current.id)
    : { data: [] };

  // Free-text vendors on requests that don't match any vendor yet
  const { data: freeText } = await supabase
    .from("requests")
    .select("vendor_other")
    .is("vendor_id", null)
    .not("vendor_other", "is", null)
    .limit(1000);
  const unmatched: Record<string, number> = {};
  for (const r of freeText ?? []) {
    const k = String(r.vendor_other).trim();
    if (k) unmatched[k] = (unmatched[k] ?? 0) + 1;
  }

  const profiles = (profilesRes.data ?? []) as Profile[];
  const systems = (systemsRes.data ?? []) as SystemRow[];
  const vendors = (vendorsRes.data ?? []) as Vendor[];

  return (
    <>
      <PageHeader title="Users & settings" description="Who can get in, what they can do, and how the season is set up." />
      <nav aria-label="On this page" className="mb-8 flex flex-wrap gap-2 text-sm">
        {[
          ["#access", "Access requests"],
          ["#members", "Members"],
          ["#season", "Season"],
          ["#budgets", "Budgets"],
          ["#vendors", "Vendors"],
          ["#import", "Import"],
        ].map(([href, label]) => (
          <a key={href} href={href} className="btn-secondary">
            {label}
          </a>
        ))}
      </nav>
      <div className="space-y-12">
        <AccessRequests people={profiles.filter((p) => p.access_status === "pending")} systems={systems} />
        <Members people={profiles.filter((p) => p.access_status !== "pending")} systems={systems} meId={user.id} />
        {current && (
          <SeasonSettings
            season={current}
            cars={(carsRes.data ?? []) as Car[]}
            vendors={vendors}
          />
        )}
        {current && (
          <Budgets
            seasonId={current.id}
            seasonName={current.name}
            systems={systems.filter((s) => s.active)}
            budgets={(budgetRows ?? []) as { system_id: string; amount: number }[]}
          />
        )}
        <Vendors vendors={vendors} unmatched={unmatched} />
        <ImportPanel seasons={seasons.map((s) => s.name)} current={current?.name ?? ""} />
      </div>
    </>
  );
}
