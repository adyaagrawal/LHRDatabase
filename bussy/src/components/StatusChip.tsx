import { STATUS_LABEL, type RequestStatus } from "@/lib/types";

const STYLES: Record<RequestStatus, string> = {
  pending_review: "bg-chip-pendingBg text-chip-pendingFg",
  approved: "bg-chip-approvedBg text-chip-approvedFg",
  submitted_to_esl: "bg-chip-eslBg text-white",
  received: "bg-chip-receivedBg text-white",
  returned_canceled: "bg-chip-returnedBg text-muted line-through",
  rejected: "bg-chip-rejectedBg text-chip-rejectedFg",
};

export function StatusChip({ status }: { status: RequestStatus }) {
  return (
    <span
      className={`inline-flex whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${STYLES[status]}`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
