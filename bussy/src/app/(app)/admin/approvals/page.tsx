import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import type { RequestViewRow } from "@/lib/types";
import { money } from "@/lib/format";
import { PageHeader } from "@/components/PageHeader";
import { ApprovalsQueue } from "./approvals-queue";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const { supabase } = await requireUser(["approver", "admin"]);
  const rows = await fetchAll<RequestViewRow>((f, t) =>
    supabase
      .from("request_view")
      .select("*")
      .eq("status", "pending_review")
      .order("created_at", { ascending: true })
      .range(f, t),
  );

  // Map duplicate row ids → request numbers for the banner
  const dupIds = rows.map((r) => r.possible_duplicate_of).filter((x): x is number => Boolean(x));
  const dupNumbers: Record<number, number> = {};
  if (dupIds.length) {
    const { data } = await supabase.from("requests").select("id,request_number").in("id", dupIds);
    for (const d of data ?? []) dupNumbers[d.id] = d.request_number;
  }

  const total = rows.reduce((a, r) => a + Number(r.nominal_total ?? 0), 0);
  return (
    <>
      <PageHeader
        title="Approvals"
        description={`${rows.length} pending · ${money(total)}. Oldest first; urgency 5 is highlighted.`}
      />
      <ApprovalsQueue rows={rows} dupNumbers={dupNumbers} />
    </>
  );
}
