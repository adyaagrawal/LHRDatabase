"use server";

import { revalidatePath } from "next/cache";
import { actionUser } from "@/lib/auth";
import { errorMessage } from "@/lib/format";
import type { RequestStatus } from "@/lib/types";

type Result = { ok: true; message?: string } | { ok: false; error: string };

function refresh(ids: number[] = []) {
  revalidatePath("/", "layout");
  for (const id of ids) revalidatePath(`/requests/${id}`);
}

/** Generic status change through transition_request() — the DB enforces who may do what. */
export async function transitionAction(id: number, to: RequestStatus, note?: string): Promise<Result> {
  const a = await actionUser();
  if (!a.ok) return a;
  const { error } = await a.supabase.rpc("transition_request", {
    p_request_id: id,
    p_to: to,
    p_note: note ?? null,
  });
  if (error) return { ok: false, error: errorMessage(error) };
  refresh([id]);
  return { ok: true };
}

export async function approveMany(ids: number[]): Promise<Result & { done?: number[] }> {
  const a = await actionUser(["approver", "admin"]);
  if (!a.ok) return a;
  const done: number[] = [];
  const failed: string[] = [];
  for (const id of ids) {
    const { error } = await a.supabase.rpc("transition_request", { p_request_id: id, p_to: "approved", p_note: null });
    if (error) failed.push(errorMessage(error));
    else done.push(id);
  }
  refresh(done);
  if (failed.length && !done.length) return { ok: false, error: failed[0] };
  return { ok: true, done, message: failed.length ? `${failed.length} couldn't be approved: ${failed[0]}` : undefined };
}

export async function rejectRequest(id: number, reason: string): Promise<Result> {
  if (!reason.trim()) return { ok: false, error: "Write a reason so the requester knows what to fix." };
  const a = await actionUser(["approver", "admin"]);
  if (!a.ok) return a;
  const { error } = await a.supabase.rpc("transition_request", { p_request_id: id, p_to: "rejected", p_note: reason });
  if (error) return { ok: false, error: errorMessage(error) };
  refresh([id]);
  return { ok: true };
}

/** "Undo" toast in Approvals: puts just-decided requests back in the queue (2-minute window). */
export async function undoDecision(ids: number[]): Promise<Result> {
  const a = await actionUser(["approver", "admin"]);
  if (!a.ok) return a;
  for (const id of ids) {
    const { error } = await a.supabase.rpc("transition_request", {
      p_request_id: id,
      p_to: "pending_review",
      p_note: "Undo",
    });
    if (error) return { ok: false, error: errorMessage(error) };
  }
  refresh(ids);
  return { ok: true };
}

export async function checkIn(id: number): Promise<Result> {
  const a = await actionUser();
  if (!a.ok) return a;
  const { error } = await a.supabase.rpc("check_in_package", { p_request_id: id });
  if (error) return { ok: false, error: errorMessage(error) };
  refresh([id]);
  return { ok: true };
}

export async function undoCheckIn(id: number): Promise<Result> {
  return transitionAction(id, "submitted_to_esl", "Undo check-in");
}

/** Signed link to a private receipt (owner or admin; Storage RLS decides). */
export async function receiptUrl(path: string): Promise<{ url: string | null }> {
  const a = await actionUser();
  if (!a.ok) return { url: null };
  const { data } = await a.supabase.storage.from("receipts").createSignedUrl(path, 60 * 10);
  return { url: data?.signedUrl ?? null };
}
