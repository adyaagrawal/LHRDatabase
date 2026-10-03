"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth";
import { COLUMNS } from "@/lib/columns";
import { errorMessage } from "@/lib/format";

export async function updateRequestField(
  id: number,
  field: string,
  value: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actionUser(["admin"]);
  if (!a.ok) return a;
  const col = COLUMNS.find((c) => c.key === field && c.editable);
  if (!col) return { ok: false, error: "That column can't be edited here." };

  let v: string | number | null = value.trim() === "" ? null : value.trim();
  if (v !== null && (col.editable === "number" || col.editable === "money")) {
    const n = Number(String(v).replace(/[$,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: `${col.label} must be a number ≥ 0` };
    v = col.editable === "money" ? Math.round(n * 100) / 100 : n;
  }
  if (field === "purchase_link" && v !== null && !/^https:\/\//i.test(String(v)))
    return { ok: false, error: "Links must start with https://" };

  const { error } = await a.supabase.from("requests").update({ [field]: v }).eq("id", id);
  if (error) return { ok: false, error: errorMessage(error) };
  revalidatePath("/raw");
  revalidatePath(`/requests/${id}`);
  return { ok: true };
}
