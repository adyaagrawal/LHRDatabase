import { z } from "zod";

/**
 * Shared Zod schemas for the request form. The browser uses them for inline errors and the
 * server action re-validates with the exact same schema before inserting.
 *
 * Form state is strings (inputs), so numbers are preprocessed from "" → undefined.
 */

const blankToUndefined = (v: unknown) =>
  v === "" || v === null || v === undefined ? undefined : typeof v === "string" ? v.trim() : v;

const reqText = (msg = "Required") => z.string({ required_error: msg }).trim().min(1, msg);
const optText = z.preprocess(blankToUndefined, z.string().trim().optional());

const toMoney = (v: unknown) => {
  const b = blankToUndefined(v);
  if (b === undefined) return undefined;
  return typeof b === "number" ? b : Number(String(b).replace(/[$,\s]/g, ""));
};

const moneyNumber = (label: string) =>
  z
    .number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
    .finite(`${label} must be a number`)
    .min(0, `${label} can't be negative`)
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, {
      message: `${label} can have at most 2 decimals`,
    });

/** Required money field ("12.50", "$1,200", 12.5). */
const money = (label: string) => z.preprocess(toMoney, moneyNumber(label));
/** Optional money field: blank is fine. (Optional must sit inside the preprocess.) */
const optMoney = (label: string) => z.preprocess(toMoney, moneyNumber(label).optional());

const quantity = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    return b === undefined ? undefined : Number(b);
  },
  z
    .number({ required_error: "Quantity is required", invalid_type_error: "Quantity must be a whole number" })
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1"),
);

const optQuantity = z.preprocess(
  (v) => {
    const b = blankToUndefined(v);
    return b === undefined ? undefined : Number(b);
  },
  z.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").optional(),
);

const httpsLink = z
  .string({ required_error: "Link is required" })
  .trim()
  .min(1, "Enter an actual link otherwise your purchase will not be approved")
  .url("That isn't a valid link. Paste the full address, starting with https://")
  .refine((s) => s.toLowerCase().startsWith("https://"), "Links must start with https://");

const reason = z
  .string({ required_error: "Reason is required" })
  .trim()
  .min(15, "Give a real reason (at least 15 characters) so approvers know what this is for");

const urgency = z.preprocess(
  (v) => (blankToUndefined(v) === undefined ? undefined : Number(v)),
  z
    .number({ required_error: "Pick an urgency from 1 to 5" })
    .int()
    .min(1, "Pick an urgency from 1 to 5")
    .max(5, "Pick an urgency from 1 to 5"),
);

const yesNo = z.enum(["yes", "no"], { errorMap: () => ({ message: "Choose Yes or No" }) });

const uuid = (msg: string) => z.string({ required_error: msg }).uuid(msg);

/** Vendor is a vendor id, or "other" plus free text. */
const vendorFields = {
  vendor_id: z.string({ required_error: "Pick a vendor" }).min(1, "Pick a vendor"),
  vendor_other: optText,
};

export const generalSchema = z.object({
  first_name: reqText("First name is required"),
  last_name: reqText("Last name is required"),
  system_id: uuid("Pick a system"),
  expense_account_id: uuid("Pick an expense account"),
  expense_account_is_other: z.boolean().default(false),
  expense_account_other: optText,
  car_id: uuid("Pick a car"),
  date_of_purchase: z
    .string({ required_error: "Pick a date" })
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date"),
});

export const purchaseSchema = generalSchema.extend({
  request_type: z.literal("purchase"),
  cart_or_item: z.enum(["cart", "item"], { errorMap: () => ({ message: "Choose Cart or Item" }) }),
  items_description: reqText("List the part name or cart items"),
  sku: optText,
  quantity,
  unit_cost: money("Cost"),
  shipping_cost: optMoney("Shipping cost"),
  ...vendorFields,
  purchase_link: httpsLink,
  standard_shipping: yesNo,
  shipping_instructions: optText,
  urgency,
  reason,
});

export const reimbursementSchema = generalSchema.extend({
  request_type: z.literal("reimbursement"),
  items_description: reqText("Part name is required"),
  sku: optText,
  quantity: optQuantity,
  unit_cost: optMoney("Unit cost"),
  reimbursed_total: money("Total amount being reimbursed"),
  ...vendorFields,
  reason,
  receipt_path: z
    .string({ required_error: "Upload your receipt" })
    .min(1, "Upload your receipt (image or PDF, up to 10 MB)"),
  ess_form_ack: z.literal(true, {
    errorMap: () => ({
      message: "Confirm you've filled out the ESS form and set up UT direct deposit",
    }),
  }),
  feedback: optText,
});

export const otherSchema = generalSchema.extend({
  request_type: z.literal("other"),
  other_justification: reqText("Explain why this belongs in Other"),
  items_description: reqText("Part name is required"),
  sku: optText,
  quantity,
  unit_cost: money("Unit cost"),
  shipping_cost: optMoney("Shipping cost"),
  ...vendorFields,
  purchase_link: httpsLink,
  standard_shipping: yesNo,
  shipping_instructions: optText,
  urgency,
  reason,
});

export const requestSchema = z
  .discriminatedUnion("request_type", [purchaseSchema, reimbursementSchema, otherSchema])
  .superRefine((v, ctx) => {
    if (v.expense_account_is_other && !v.expense_account_other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expense_account_other"],
        message: "Describe the expense account",
      });
    }
    if (v.vendor_id === "other" && !v.vendor_other) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vendor_other"], message: "Type the vendor name" });
    }
    if (v.vendor_id !== "other" && !z.string().uuid().safeParse(v.vendor_id).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["vendor_id"], message: "Pick a vendor" });
    }
    if ((v.request_type === "purchase" || v.request_type === "other") && v.standard_shipping === "no" && !v.shipping_instructions) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shipping_instructions"],
        message: "Add shipping instructions",
      });
    }
  });

export type RequestInput = z.infer<typeof requestSchema>;

/** Validate only step 1 (with the "Other" expense account rule). */
export const stepOneSchema = generalSchema
  .extend({
    request_type: z.enum(["purchase", "reimbursement", "other"], {
      errorMap: () => ({ message: "Pick what brings you here" }),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.expense_account_is_other && !v.expense_account_other) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expense_account_other"],
        message: "Describe the expense account",
      });
    }
  });

/** Flatten Zod issues to { field: firstMessage }. */
export function issuesToErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
