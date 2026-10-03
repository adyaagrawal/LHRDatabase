import type { Metadata } from "next";
import { requireUser, getSeasons } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import type { RequestViewRow } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { RawTable } from "./raw-table";

export const metadata: Metadata = { title: "Raw data" };

export default async function RawPage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; mine?: string }>;
}) {
  const { supabase, user, profile } = await requireUser();
  const sp = await searchParams;
  const seasons = await getSeasons(supabase);
  const current = seasons.find((s) => s.is_current) ?? seasons[0];
  const seasonId = sp.season === "all" ? "all" : (seasons.find((s) => s.id === sp.season)?.id ?? current?.id ?? "all");

  const rows = await fetchAll<RequestViewRow>((f, t) => {
    let q = supabase.from("request_view").select("*");
    if (seasonId !== "all") q = q.eq("season_id", seasonId);
    return q.order("created_at", { ascending: false }).order("id", { ascending: false }).range(f, t);
  });

  // possible_duplicate_of stores the row id; show the request number instead
  const numberById = new Map(rows.map((r) => [r.id, r.request_number]));
  const display = rows.map((r) => ({
    ...r,
    possible_duplicate_of: r.possible_duplicate_of ? (numberById.get(r.possible_duplicate_of) ?? null) : null,
  }));

  return (
    <>
      <PageHeader
        title="Raw data"
        description={`Every submission and every field. ${rows.length} request${rows.length === 1 ? "" : "s"}${
          profile.role === "admin" ? " — turn on “Edit cells” to fix a value; every edit is logged." : "."
        }`}
      />
      <RawTable
        rows={display}
        isAdmin={profile.role === "admin"}
        userId={user.id}
        userEmail={(user.email ?? "").toLowerCase()}
        seasons={seasons.map((s) => ({ id: s.id, name: s.name }))}
        seasonId={seasonId}
        initialMine={sp.mine === "1"}
      />
    </>
  );
}
