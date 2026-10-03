"use server";

import { revalidatePath } from "next/cache";
import { actionUser, getCurrentSeason } from "@/lib/auth";
import { exportFileName, toEslLine, type EslLayout } from "@/lib/esl";
import { buildEslWorkbook } from "@/lib/esl-xlsx";
import { errorMessage } from "@/lib/format";
import type { RequestViewRow } from "@/lib/types";

export async function markSubmitted(
  ids: number[],
  layout: EslLayout,
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  if (!ids.length) return { ok: false, error: "Select at least one request." };
  const { supabase } = a;

  const { data, error } = await supabase.from("request_view").select("*").in("id", ids);
  if (error) return { ok: false, error: errorMessage(error) };
  const rows = (data ?? []) as RequestViewRow[];
  const notApproved = rows.filter((r) => r.status !== "approved");
  if (notApproved.length || rows.length !== ids.length)
    return { ok: false, error: "Some selected requests are no longer Approved. Refresh the page and try again." };

  const season = await getCurrentSeason(supabase);
  const batchId = crypto.randomUUID();
  const file = await buildEslWorkbook(rows.map(toEslLine), layout);
  const path = `${season?.name ?? "season"}/${exportFileName("xlsx").replace(".xlsx", "")}_${batchId.slice(0, 8)}.xlsx`;

  const up = await supabase.storage.from("esl-exports").upload(path, file, {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (up.error) return { ok: false, error: `Couldn't store the ESL file: ${up.error.message}` };

  const { error: rpcErr } = await supabase.rpc("mark_submitted_to_esl", {
    p_batch_id: batchId,
    p_season_id: season?.id ?? null,
    p_layout: layout,
    p_file_path: path,
    p_request_ids: ids,
  });
  if (rpcErr) {
    await supabase.storage.from("esl-exports").remove([path]);
    return { ok: false, error: errorMessage(rpcErr) };
  }

  revalidatePath("/", "layout");
  return { ok: true, count: ids.length };
}
