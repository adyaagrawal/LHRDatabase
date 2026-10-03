import { describe, expect, it } from "vitest";
import { computeTotals } from "../src/lib/totals";
import { ESL_COLUMNS, toDelimited, toEslLine } from "../src/lib/esl";
import { requestSchema } from "../src/lib/schemas";
import type { RequestViewRow } from "../src/lib/types";

describe("§5 total rules", () => {
  it("item = qty × unit; cart forces qty 1; other adds shipping; reimbursement is entered", () => {
    expect(computeTotals({ request_type: "purchase", cart_or_item: "item", quantity: 3, unit_cost: 2.5 })).toEqual({ quantity: 3, nominal_total: 7.5 });
    expect(computeTotals({ request_type: "purchase", cart_or_item: "cart", quantity: 5, unit_cost: 120 })).toEqual({ quantity: 1, nominal_total: 120 });
    expect(computeTotals({ request_type: "other", quantity: 2, unit_cost: 10, shipping_cost: 4.99 }).nominal_total).toBe(24.99);
    expect(computeTotals({ request_type: "reimbursement", reimbursed_total: 42.1 }).nominal_total).toBe(42.1);
    expect(computeTotals({ request_type: "purchase", cart_or_item: "item", quantity: 3, unit_cost: 0.1 }).nominal_total).toBe(0.3);
  });
});

const base = {
  request_type: "purchase",
  cart_or_item: "item",
  request_number: 1,
  items_description: "M5 bolts",
  quantity: 2,
  unit_cost: 3,
  nominal_total: 6,
  sku: "91290A",
  standard_shipping: true,
  shipping_instructions: null,
  purchase_link: "https://mcmaster.com/x",
  vendor_name: "McMaster",
  system_name: "Body",
  requester_display: "Dev S",
  date_of_purchase: "2026-09-14",
} as unknown as RequestViewRow;

describe("ESL export", () => {
  it("a cart + an item produce exactly 2 rows in the agreed column order", () => {
    const cart = { ...base, request_number: 2, cart_or_item: "cart", quantity: 1, unit_cost: 250, nominal_total: 250, items_description: "A; B; C" } as RequestViewRow;
    const csv = toDelimited([toEslLine(base), toEslLine(cart)]);
    const lines = csv.split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(ESL_COLUMNS.join(","));
    const c = toEslLine(cart);
    expect(c.Item).toBe("Cart: A; B; C");
    expect(c.Quantity).toBe(1);
    expect(c["Cost per Item"]).toBe(250);
    expect(c["Other Specs if Applicable"]).toBe("Cart");
  });

  it("puts shipping instructions in Other Specs when shipping isn't standard", () => {
    const l = toEslLine({ ...base, standard_shipping: false, shipping_instructions: "2-day" } as RequestViewRow);
    expect(l["Other Specs if Applicable"]).toBe("2-day");
  });
});

describe("form validation", () => {
  const ok = {
    first_name: "Dev",
    last_name: "S",
    system_id: "6f9619ff-8b86-4011-b42d-00c04fc964ff",
    expense_account_id: "6f9619ff-8b86-4011-b42d-00c04fc964fe",
    expense_account_is_other: false,
    car_id: "6f9619ff-8b86-4011-b42d-00c04fc964fd",
    date_of_purchase: "2026-09-14",
    request_type: "purchase",
    cart_or_item: "item",
    items_description: "Bolts",
    sku: "",
    quantity: "2",
    unit_cost: "3.50",
    shipping_cost: "",
    vendor_id: "6f9619ff-8b86-4011-b42d-00c04fc964fc",
    vendor_other: "",
    purchase_link: "https://www.mcmaster.com/91290A",
    standard_shipping: "yes",
    shipping_instructions: "",
    urgency: "3",
    reason: "Mounting the seat to the chassis",
  };
  it("accepts a valid purchase", () => {
    expect(requestSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects throwaway reasons, bad links and missing shipping instructions", () => {
    const r = requestSchema.safeParse({ ...ok, reason: "adsf", purchase_link: "mcmaster", standard_shipping: "no" });
    expect(r.success).toBe(false);
    const paths = r.success ? [] : r.error.issues.map((i) => i.path[0]);
    expect(paths).toEqual(expect.arrayContaining(["reason", "purchase_link", "shipping_instructions"]));
  });
  it("rejects http:// links", () => {
    expect(requestSchema.safeParse({ ...ok, purchase_link: "http://example.com" }).success).toBe(false);
  });
  it("blank optional money is fine; text in money fields is not", () => {
    expect(requestSchema.safeParse({ ...ok, shipping_cost: "" }).success).toBe(true);
    expect(requestSchema.safeParse({ ...ok, shipping_cost: "Free" }).success).toBe(false);
  });
});
