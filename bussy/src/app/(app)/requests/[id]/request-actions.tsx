"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { STATUS_LABEL, STATUS_ORDER, type RequestStatus, type UserRole } from "@/lib/types";
import { reqNo } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { approveMany, checkIn, rejectRequest, transitionAction, undoCheckIn } from "../actions";

export function RequestActions(p: {
  id: number;
  number: number | null;
  status: RequestStatus;
  role: UserRole;
  isOwner: boolean;
  receivedByMe: boolean;
  receivedAt: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, start] = useTransition();
  const [mode, setMode] = useState<"none" | "reject" | "override" | "cancel">("none");
  const [note, setNote] = useState("");
  const [to, setTo] = useState<RequestStatus>(p.status);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, success: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast({ message: r.message ?? success });
        setMode("none");
        setNote("");
        router.refresh();
      } else toast({ message: r.error ?? "That didn't work.", tone: "error" });
    });

  const canDecide = (p.role === "approver" || p.role === "admin") && p.status === "pending_review";
  const canCancel = p.status === "pending_review" && (p.isOwner || p.role === "admin");
  const canCheckIn = p.status === "submitted_to_esl";
  const recentCheckIn = p.receivedAt ? Date.now() - new Date(p.receivedAt).getTime() < 10 * 60_000 : false;
  const canUndoCheckIn = p.status === "received" && (p.role === "admin" || (p.receivedByMe && recentCheckIn));
  const isAdmin = p.role === "admin";

  if (!canDecide && !canCancel && !canCheckIn && !canUndoCheckIn && !isAdmin) return null;

  return (
    <section className="card p-4" aria-label="Actions">
      <div className="flex flex-wrap gap-2">
        {canDecide && (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => approveMany([p.id]), `${reqNo(p.number)} approved`)}>
              Approve by TC/CE
            </button>
            <button type="button" className="btn-danger" disabled={busy} onClick={() => setMode(mode === "reject" ? "none" : "reject")}>
              Reject
            </button>
          </>
        )}
        {canCheckIn && (
          <button type="button" className="btn-primary" disabled={busy} onClick={() => run(() => checkIn(p.id), `${reqNo(p.number)} checked in`)}>
            Check in package
          </button>
        )}
        {canUndoCheckIn && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => run(() => undoCheckIn(p.id), "Check-in undone")}>
            Undo check-in
          </button>
        )}
        {canCancel && (
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => setMode(mode === "cancel" ? "none" : "cancel")}>
            Cancel request
          </button>
        )}
        {isAdmin && (
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => setMode(mode === "override" ? "none" : "override")}>
            Override status
          </button>
        )}
      </div>

      {mode === "reject" && (
        <div className="mt-4 max-w-xl">
          <label htmlFor="reject-reason" className="field-label">
            Reason (shown to the requester)
          </label>
          <textarea id="reject-reason" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <button type="button" className="btn-danger mt-2" disabled={busy || !note.trim()} onClick={() => run(() => rejectRequest(p.id, note), `${reqNo(p.number)} rejected`)}>
            Reject {reqNo(p.number)}
          </button>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-4 max-w-xl">
          <p className="text-sm">This marks the request Returned/Canceled. It won&apos;t be ordered.</p>
          <button
            type="button"
            className="btn-danger mt-2"
            disabled={busy}
            onClick={() => run(() => transitionAction(p.id, "returned_canceled", "Canceled by requester"), `${reqNo(p.number)} canceled`)}
          >
            Yes, cancel {reqNo(p.number)}
          </button>
        </div>
      )}

      {mode === "override" && (
        <div className="mt-4 grid max-w-xl gap-3">
          <label className="field-label" htmlFor="override-to">
            New status
          </label>
          <select id="override-to" className="input" value={to} onChange={(e) => setTo(e.target.value as RequestStatus)}>
            {STATUS_ORDER.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <label className="field-label" htmlFor="override-note">
            Note (required, logged)
          </label>
          <textarea id="override-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
          <button
            type="button"
            className="btn-primary justify-self-start"
            disabled={busy || !note.trim() || to === p.status}
            onClick={() => run(() => transitionAction(p.id, to, note), `Status set to ${STATUS_LABEL[to]}`)}
          >
            Set status
          </button>
        </div>
      )}
    </section>
  );
}
