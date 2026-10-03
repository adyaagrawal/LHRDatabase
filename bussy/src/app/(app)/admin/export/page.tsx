import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { fetchAll } from "@/lib/fetch-all";
import type { EslBatch, RequestViewRow } from "@/lib/types";
import { PageHeader } from "@/components/PageHeader";
import { ExportClient } from "./export-client";

export const metadata: Metadata = { title: "ESL export" };

export default async function ExportPage() {
  const { supabase } = await requireUser(["admin"]);
  const rows = await fetchAll<RequestViewRow>((f, t) =>
    supabase.from("request_view").select("*").eq("status", "approved").order("vendor_name").order("request_number").range(f, t),
  );

  const { data: batches } = await supabase
    .from("esl_batches")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);
  const { data: people } = await supabase.from("profiles").select("id,full_name");
  const nameOf = new Map((people ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]));

  const past = await Promise.all(
    ((batches ?? []) as EslBatch[]).map(async (b) => {
      let url: string | null = null;
      if (b.file_path) {
        const { data } = await supabase.storage.from("esl-exports").createSignedUrl(b.file_path, 3600, {
          download: b.file_path.split("/").pop(),
        });
        url = data?.signedUrl ?? null;
      }
      return { ...b, url, created_by_name: b.created_by ? (nameOf.get(b.created_by) ?? null) : null };
    }),
  );

  return (
    <>
      <PageHeader
        title="ESL export"
        description="Approved requests not yet sent to ESL. One row per request; a cart is one row. Downloading never changes a status — use “Mark as submitted” after you send the file."
      />
      <ExportClient rows={rows} past={past} />
    </>
  );
}
