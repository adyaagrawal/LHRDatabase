import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import type { RequestViewRow } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { PackageLog } from "./package-log";

export const metadata: Metadata = { title: "Package log" };

export default async function PackagesPage() {
  const { supabase, user, profile } = await requireUser();
  const rows = await fetchAll<RequestViewRow>((f, t) =>
    supabase
      .from("request_view")
      .select("*")
      .in("status", ["submitted_to_esl", "received"])
      .order("submitted_to_esl_at", { ascending: false, nullsFirst: false })
      .order("id", { ascending: false })
      .range(f, t),
  );
  const { data: seasons } = await supabase.from("seasons").select("id,is_current");
  const currentSeasonId = (seasons ?? []).find((s: { is_current: boolean }) => s.is_current)?.id ?? null;

  return (
    <>
      <PageHeader
        title="Package log"
        description="When a box shows up, check it in here. BUSSY records the date and who checked it in."
      />
      <PackageLog
        rows={rows}
        userId={user.id}
        userName={profile.full_name ?? user.email ?? "me"}
        isAdmin={profile.role === "admin"}
        currentSeasonId={currentSeasonId}
      />
    </>
  );
}
