import { describe, expect, it } from "vitest";
import {
  bySystem,
  computeKpis,
  jkeysFee,
  linearFit,
  systemVendorMatrix,
  weeklyCumulative,
  withProjection,
  type FactRow,
} from "../src/lib/dashboard";

const row = (p: Partial<FactRow>): FactRow => ({
  id: Math.floor(Math.random() * 1e9),
  status: "approved",
  request_type: "purchase",
  nominal_total: 100,
  date_of_purchase: "2025-09-01",
  created_at: "2025-09-01T12:00:00Z",
  system_id: "s1",
  system_name: "Body",
  vendor_id: "v1",
  vendor_name: "McMaster",
  spender_key: "a",
  requester_display: "A",
  ...p,
});

describe("jkeysFee", () => {
  it("takes the fee share of a fee-inclusive total, not the full amount", () => {
    expect(jkeysFee(110, 0.1)).toBe(10);
    expect(jkeysFee(0, 0.1)).toBe(0);
    expect(jkeysFee(100, 0)).toBe(0);
  });
});

describe("weekly bucketing", () => {
  it("week k sums committed rows with date < start + 7k", () => {
    const rows = [
      row({ date_of_purchase: "2025-08-31", nominal_total: 10 }), // day 0 → week 1
      row({ date_of_purchase: "2025-09-06", nominal_total: 20 }), // day 6 → week 1
      row({ date_of_purchase: "2025-09-07", nominal_total: 30 }), // day 7 → week 2
      row({ date_of_purchase: "2025-09-07", nominal_total: 99, status: "pending_review" }), // not committed
      row({ date_of_purchase: "2025-09-08", nominal_total: 5, status: "returned_canceled" }), // not committed
    ];
    const w = weeklyCumulative(rows, "2025-08-31", "2025-09-10");
    expect(w.map((x) => x.actual)).toEqual([30, 60]);
    expect(w[0].date).toBe("2025-09-07");
  });

  it("returns nothing before the season starts", () => {
    expect(weeklyCumulative([row({})], "2026-08-30", "2026-08-01")).toEqual([]);
  });
});

describe("projection", () => {
  it("fits a least-squares line through the last 3 points and extends 7 weeks", () => {
    expect(linearFit([{ x: 1, y: 10 }, { x: 2, y: 20 }, { x: 3, y: 30 }])).toEqual({ a: 0, b: 10 });
    const pts = [1, 2, 3, 4].map((k) => ({ week: k, date: "", actual: k * 100, projection: null }));
    const out = withProjection(pts, "2025-08-31", 7);
    expect(out).toHaveLength(11);
    expect(out[3].projection).toBe(400); // joins at the last actual point
    expect(out[10].projection).toBe(1100);
    expect(out[10].actual).toBeNull();
  });
});

describe("matrix + KPIs", () => {
  const systems = [
    { id: "s1", name: "Body" },
    { id: "s2", name: "Aero" },
    { id: "s3", name: "Electronics" },
  ];
  const vendors = [
    { id: "v1", name: "McMaster" },
    { id: "jk", name: "Jkeys" },
  ];
  const rows = [
    row({ system_id: "s1", vendor_id: "v1", nominal_total: 100 }),
    row({ system_id: "s2", system_name: "Aero", vendor_id: "jk", nominal_total: 332.2, status: "received" }),
    row({ system_id: "s1", vendor_id: null, vendor_name: "Partzilla", nominal_total: 50, status: "submitted_to_esl" }),
    row({ system_id: null, system_name: null, vendor_id: "v1", nominal_total: 7 }),
    row({ system_id: "s1", nominal_total: 1000, status: "rejected" }),
  ];

  it("matrix total equals committed spend and every system appears", () => {
    const m = systemVendorMatrix(rows, systems, vendors);
    const k = computeKpis(rows, "jk", 0.1);
    expect(m.totals.total).toBe(k.committed);
    expect(m.rows.map((r) => r.label)).toEqual(["Body", "Aero", "Electronics", "No system"]);
    expect(m.rows.find((r) => r.label === "Aero")!.cells).toEqual([0, 332.2, 0]);
    expect(m.rows.find((r) => r.label === "Body")!.cells).toEqual([100, 0, 50]);
  });

  it("KPIs split by status and compute the Jkeys fee on committed Jkeys spend", () => {
    const k = computeKpis(rows, "jk", 0.1);
    expect(k.committed).toBe(489.2);
    expect(k.received).toBe(332.2);
    expect(k.atEsl).toBe(50);
    expect(k.jkeysFees).toBe(30.2);
  });

  it("bySystem lists systems with no spend", () => {
    expect(bySystem(rows, systems).map((s) => s.label)).toContain("Electronics");
  });
});
