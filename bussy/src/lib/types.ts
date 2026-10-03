// Hand-written row types matching supabase/migrations. After linking the CLI you can also run
// `pnpm db:types` to generate src/lib/database.types.ts; these stay as the app's source of truth.

export type UserRole = "member" | "approver" | "admin";
export type AccessStatus = "pending" | "approved" | "denied";
export type RequestType = "purchase" | "reimbursement" | "other";
export type CartOrItem = "cart" | "item";
export type RequestStatus =
  | "pending_review"
  | "approved"
  | "submitted_to_esl"
  | "received"
  | "returned_canceled"
  | "rejected";

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending_review: "Pending review",
  approved: "Approved by TC/CE",
  submitted_to_esl: "Submitted to ESL",
  received: "Received",
  returned_canceled: "Returned/Canceled",
  rejected: "Rejected",
};

export const STATUS_ORDER: RequestStatus[] = [
  "pending_review",
  "approved",
  "submitted_to_esl",
  "received",
  "returned_canceled",
  "rejected",
];

export const TYPE_LABEL: Record<RequestType, string> = {
  purchase: "Purchase Request",
  reimbursement: "Reimbursement Request",
  other: "Other",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  member: "Member",
  approver: "Approver",
  admin: "Admin",
};

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  system_id: string | null;
  role: UserRole;
  access_status: AccessStatus;
  approved_by: string | null;
  approved_at: string | null;
  last_seen_at: string | null;
  created_at: string;
}

export interface Season {
  id: string;
  name: string;
  car_label: string | null;
  car_id: string | null;
  start_date: string;
  is_current: boolean;
  jkeys_fee_pct: number;
  dashboard_vendor_ids: string[];
}

export interface SystemRow {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
}

export interface ExpenseAccount {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
}

export interface Car {
  id: string;
  label: string;
  sort_order: number;
  active: boolean;
}

export interface Vendor {
  id: string;
  name: string;
  aliases: string[];
  show_on_form: boolean;
  active: boolean;
  notes: string | null;
}

export interface RequestRow {
  id: number;
  season_id: string;
  request_number: number | null;
  legacy_form_id: number | null;
  submitted_by: string | null;
  requester_name: string | null;
  requester_email: string | null;
  first_name: string | null;
  last_name: string | null;
  system_id: string | null;
  expense_account_id: string | null;
  expense_account_other: string | null;
  car_id: string | null;
  date_of_purchase: string | null;
  request_type: RequestType;
  cart_or_item: CartOrItem | null;
  items_description: string | null;
  sku: string | null;
  quantity: number | null;
  unit_cost: number | null;
  nominal_total: number | null;
  shipping_cost: number | null;
  vendor_id: string | null;
  vendor_other: string | null;
  purchase_link: string | null;
  standard_shipping: boolean | null;
  shipping_instructions: string | null;
  urgency: number | null;
  reason: string | null;
  other_justification: string | null;
  receipt_path: string | null;
  ess_form_ack: boolean | null;
  feedback: string | null;
  status: RequestStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  submitted_to_esl_at: string | null;
  submitted_to_esl_by: string | null;
  esl_batch_id: string | null;
  received_at: string | null;
  received_by: string | null;
  received_by_name: string | null;
  returned_at: string | null;
  admin_notes: string | null;
  esl_invoice_number: string | null;
  possible_duplicate_of: number | null;
  created_at: string;
  updated_at: string;
  form_started_at: string | null;
}

/** Row of public.request_view */
export interface RequestViewRow extends RequestRow {
  system_name: string | null;
  expense_account_name: string | null;
  car_label: string | null;
  vendor_name: string;
  season_name: string | null;
  requester_display: string | null;
  approved_by_name: string | null;
  rejected_by_name: string | null;
  received_by_profile_name: string | null;
  received_by_display: string | null;
  spender_key: string | null;
}

export interface RequestEvent {
  id: number;
  request_id: number;
  actor_id: string | null;
  actor_name: string | null;
  event: string;
  from_status: RequestStatus | null;
  to_status: RequestStatus | null;
  changes: Record<string, [unknown, unknown]> | null;
  note: string | null;
  created_at: string;
}

export interface EslBatch {
  id: string;
  season_id: string | null;
  created_by: string | null;
  created_at: string;
  layout: "single" | "per_vendor";
  line_count: number;
  total: number;
  file_path: string | null;
}
