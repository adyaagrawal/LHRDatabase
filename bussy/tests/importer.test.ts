import { describe, expect, it } from "vitest";
import { cleanText, mapFormsRows, parseHeaders, parseMoney, parseStatus, type Lookups } from "../src/lib/importer";

const L: Lookups = {
  systems: [
    { id: "s-aero", name: "Aero" },
    { id: "s-body", name: "Body" },
  ],
  accounts: [
    { id: "a-dm", name: "Direct Materials" },
    { id: "a-other", name: "Other" },
  ],
  cars: [{ id: "c-penguin", label: "Penguin (25-26)" }],
  vendors: [
    { id: "v-mc", name: "McMaster", aliases: ["McMaster-Carr"] },
    { id: "v-rw", name: "Rock West", aliases: ["Rock West Composites"] },
  ],
};

describe("header parsing", () => {
  it("splits branch suffixes 1/2 off the header text", () => {
    const h = parseHeaders(["Id", "Email1", "Quantity", "Quantity1", "Quantity2", "Urgency (1-5)"]);
    expect(h.map((x) => [x.stem, x.suffix])).toEqual([
      ["id", ""],
      ["email", "1"],
      ["quantity", ""],
      ["quantity", "1"],
      ["quantity", "2"],
      ["urgency (1-5)", ""],
    ]);
  });
});

describe("value cleaning", () => {
  it("treats 0 / blank / nan as null and parses money text", () => {
    expect(cleanText(0)).toBeNull();
    expect(cleanText("nan")).toBeNull();
    expect(cleanText(" x ")).toBe("x");
    expect(parseMoney("Free").value).toBe(0);
    expect(parseMoney("$1,234.5").value).toBe(1234.5);
    expect(parseMoney("lots").warn).toBeTruthy();
  });
  it("maps workbook status labels", () => {
    expect(parseStatus("Received")).toBe("received");
    expect(parseStatus("Submitted to ESL")).toBe("submitted_to_esl");
    expect(parseStatus("Returned/Canceled")).toBe("returned_canceled");
    expect(parseStatus("Approved by TC/CE")).toBe("approved");
  });
});

describe("row mapping", () => {
  const header = [
    "Id", "Start time", "Completion time", "Email", "Name", "First Name", "Last Name", "Email1",
    "System?", "Expense Account", "What Car are you purchasing for?", "What brings you here today?",
    "Date of Purchase", "Cart or Item?", "Part Name/Cart Items?", "SKU/Product Number - IF YOUR PRODUCT HAS A SKU",
    "Quantity", "Unit Cost", "Nominal Total Cost (Quantity x Unit Cost)", "Shipping Cost (if there is)",
    "Vendor", "Link to Purchase", "Standard Shipping?", "Specify any shipping instructions", "Urgency (1-5)",
    "Reason for Purchase",
  ];
  const r = (o: Record<string, unknown>) => header.map((h) => o[h] ?? null);

  it("maps a purchase row, normalizes vendor aliases and Aerodynamics → Aero", () => {
    const rep = mapFormsRows(
      [
        header,
        r({
          Id: 7, "First Name": "Dev", "Last Name": "S", Email1: "Dev@X.com", "System?": "Aerodynamics",
          "Expense Account": "Direct Materials", "What Car are you purchasing for?": "LHRc 2025-2026",
          "What brings you here today?": "Purchase Request", "Cart or Item?": "Item",
          "Part Name/Cart Items?": "Bolts", Quantity: 2, "Unit Cost": 3, "Nominal Total Cost (Quantity x Unit Cost)": 6,
          "Shipping Cost (if there is)": "Free", Vendor: "mcmaster-carr", "Standard Shipping?": "Yes", "Urgency (1-5)": 3,
        }),
      ],
      L,
    );
    expect(rep.rows).toHaveLength(1);
    const x = rep.rows[0];
    expect(x.system_id).toBe("s-aero");
    expect(x.car_id).toBe("c-penguin");
    expect(x.vendor_id).toBe("v-mc");
    expect(x.shipping_cost).toBe(0);
    expect(x.requester_email).toBe("dev@x.com");
    expect(x.nominal_total).toBe(6);
  });

  it("forces carts to qty 1, keeps the form total and flags mismatches", () => {
    const rep = mapFormsRows(
      [
        header,
        r({
          Id: 8, "What brings you here today?": "Purchase Request", "Cart or Item?": "Cart",
          "Part Name/Cart Items?": "A; B", Quantity: 3, "Unit Cost": 10, "Nominal Total Cost (Quantity x Unit Cost)": 30,
          Vendor: "Some New Shop",
        }),
      ],
      L,
    );
    const x = rep.rows[0];
    expect(x.quantity).toBe(1);
    expect(x.unit_cost).toBe(30);
    expect(x.nominal_total).toBe(30);
    expect(rep.unmatchedVendors["Some New Shop"]).toBe(1);
  });

  it("skips test rows", () => {
    const rep = mapFormsRows([header, r({ Id: 9, "Expense Account": "test", "What brings you here today?": "Purchase Request" })], L);
    expect(rep.rows).toHaveLength(0);
    expect(rep.skipped[0].why).toBe("test row");
  });
});
