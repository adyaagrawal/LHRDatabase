import type { RequestViewRow } from "./types";

export type ColKind = "text" | "money" | "number" | "date" | "datetime" | "status" | "bool" | "link" | "id";

export interface ColDef {
  key: keyof RequestViewRow;
  label: string;
  kind: ColKind;
  /** shown by default in Raw data */
  default?: boolean;
  /** admins can edit inline */
  editable?: "text" | "number" | "money" | "longtext";
}

/** Human labels match the form questions. Order = Raw data column order. */
export const COLUMNS: ColDef[] = [
  { key: "request_number", label: "ID", kind: "id", default: true },
  { key: "status", label: "Status", kind: "status", default: true },
  { key: "created_at", label: "Submitted", kind: "datetime", default: true },
  { key: "requester_display", label: "Requester", kind: "text", default: true },
  { key: "requester_email", label: "Email", kind: "text" },
  { key: "system_name", label: "System", kind: "text", default: true },
  { key: "request_type", label: "What brings you here today?", kind: "text", default: true },
  { key: "expense_account_name", label: "Expense account", kind: "text" },
  { key: "expense_account_other", label: "Expense account (other)", kind: "text", editable: "text" },
  { key: "car_label", label: "Car", kind: "text" },
  { key: "date_of_purchase", label: "Date of purchase", kind: "date" },
  { key: "cart_or_item", label: "Cart or item?", kind: "text" },
  { key: "items_description", label: "Part name / cart items", kind: "text", default: true, editable: "longtext" },
  { key: "sku", label: "SKU / product number", kind: "text", editable: "text" },
  { key: "quantity", label: "Quantity", kind: "number", default: true, editable: "number" },
  { key: "unit_cost", label: "Unit cost", kind: "money", editable: "money" },
  { key: "nominal_total", label: "Total", kind: "money", default: true, editable: "money" },
  { key: "shipping_cost", label: "Shipping cost", kind: "money", editable: "money" },
  { key: "vendor_name", label: "Vendor", kind: "text", default: true },
  { key: "purchase_link", label: "Link to purchase", kind: "link", editable: "text" },
  { key: "standard_shipping", label: "Standard shipping?", kind: "bool" },
  { key: "shipping_instructions", label: "Shipping instructions", kind: "text", editable: "text" },
  { key: "urgency", label: "Urgency", kind: "number" },
  { key: "reason", label: "Reason for purchase", kind: "text", editable: "longtext" },
  { key: "other_justification", label: "Why Other?", kind: "text", editable: "longtext" },
  { key: "ess_form_ack", label: "ESS form done", kind: "bool" },
  { key: "feedback", label: "Questions/feedback", kind: "text" },
  { key: "approved_by_name", label: "Approved by", kind: "text" },
  { key: "approved_at", label: "Approved at", kind: "datetime" },
  { key: "rejection_reason", label: "Rejection reason", kind: "text" },
  { key: "submitted_to_esl_at", label: "Sent to ESL", kind: "datetime" },
  { key: "received_at", label: "Received", kind: "datetime" },
  { key: "received_by_display", label: "Checked in by", kind: "text" },
  { key: "admin_notes", label: "Admin notes", kind: "text", editable: "longtext" },
  { key: "esl_invoice_number", label: "ESL invoice #", kind: "text", editable: "text" },
  { key: "possible_duplicate_of", label: "Possible duplicate of", kind: "text" },
  { key: "legacy_form_id", label: "Forms ID", kind: "number" },
  { key: "season_name", label: "Season", kind: "text" },
];

export const EDITABLE_FIELDS = COLUMNS.filter((c) => c.editable).map((c) => c.key as string);
