import { describe, expect, it } from "vitest";
import { invoiceFacts, previousPeriod, resolveRange, daysBetween } from "./base";
import { SELLER_STATE, data, exp, inv } from "./fixtures.test-utils";
import { shiftPeriod } from "@/lib/period";

const fact = (i: Parameters<typeof inv>[0]) => {
  const r = invoiceFacts(inv(i), SELLER_STATE);
  if (!("fact" in r)) throw new Error(`excluded: ${r.excluded.reason}`);
  return r.fact;
};

describe("invoiceFacts", () => {
  it("normalizes an intra-state tax invoice", () => {
    const f = fact({ amount: "1000", rate: "18", gstin: "27AAPFU0939F1ZV" });
    expect(f).toMatchObject({
      kind: "sale",
      sign: 1,
      taxable: "1000.00",
      cgst: "90.00",
      sgst: "90.00",
      igst: "0.00",
      tax: "180.00",
      total: "1180.00",
      balanceDue: "1180.00",
      supplyClass: "b2b",
      pos: "27",
      posName: "Maharashtra",
    });
    expect(f.lines).toEqual([
      expect.objectContaining({ hsn: "8471", taxable: "1000.00", rate: "18", cgst: "90.00" }),
    ]);
  });

  it("uses IGST for inter-state and classifies B2C without GSTIN", () => {
    const f = fact({ state: "29" });
    expect(f).toMatchObject({ igst: "180.00", cgst: "0.00", supplyClass: "b2c", pos: "29" });
  });

  it("gives credit notes a negative sign and no balance", () => {
    const f = fact({ docType: "credit_note", amount: "200" });
    expect(f).toMatchObject({
      kind: "credit_note",
      sign: -1,
      taxable: "200.00",
      balanceDue: "0.00",
    });
    expect(fact({ docType: "debit_note" }).sign).toBe(1);
  });

  it("counts plain invoices and bills of supply as sales with zero tax", () => {
    for (const docType of ["invoice", "bill_of_supply"] as const) {
      const f = fact({ docType, amount: "500" });
      expect(f).toMatchObject({
        kind: "sale",
        taxable: "500.00",
        tax: "0.00",
        total: "500.00",
        hasTax: false,
      });
    }
  });

  it("converts foreign currency with the exchange rate", () => {
    const f = fact({
      docType: "export",
      currency: "USD",
      exchangeRate: "83.25",
      amount: "100.10",
      country: "USA",
      exportType: "wopay",
    });
    expect(f).toMatchObject({
      supplyClass: "export",
      pos: "96",
      taxable: "8333.33",
      tax: "0.00",
      total: "8333.33",
    });
    const wpay = fact({
      docType: "export",
      currency: "USD",
      exchangeRate: "80",
      amount: "100",
      country: "USA",
      exportType: "wpay",
    });
    expect(wpay).toMatchObject({ taxable: "8000.00", igst: "1440.00", total: "9440.00" });
  });

  it("excludes drafts, quotations, cancelled and missing exchange rates", () => {
    const reason = (o: Parameters<typeof inv>[0]) => {
      const r = invoiceFacts(inv(o), SELLER_STATE);
      return "excluded" in r ? r.excluded.reason : null;
    };
    expect(reason({ issued: false })).toBe("draft");
    expect(reason({ docType: "proforma" })).toBe("quotation");
    expect(reason({ status: "cancelled" })).toBe("cancelled");
    expect(reason({ docType: "export", currency: "USD", exchangeRate: "" })).toBe(
      "missing exchange rate",
    );
    expect(reason({ docType: "export", currency: "USD", exchangeRate: "0" })).toBe(
      "missing exchange rate",
    );
  });

  it("splits single-mode GST into heads by place of supply", () => {
    expect(fact({ gstMode: "single", amount: "100.10", rate: "5" })).toMatchObject({
      cgst: "2.51",
      sgst: "2.50",
      igst: "0.00",
      tax: "5.01",
    });
    expect(fact({ gstMode: "single", state: "29" })).toMatchObject({
      igst: "180.00",
      cgst: "0.00",
    });
  });

  it("subtracts payments from balance due", () => {
    expect(fact({ amount: "1000", received: "180" }).balanceDue).toBe("1000.00");
    expect(fact({ amount: "1000", received: "180" }).paymentStatus).toBe("partial");
  });
});

describe("prepareAnalytics", () => {
  it("collects exclusions and sorts facts by date", () => {
    const d = data(
      [inv({ date: "2026-10-20" }), inv({ date: "2026-10-01" }), inv({ issued: false })],
      [exp({ date: "" })],
    );
    expect(d.facts.map((f) => f.date)).toEqual(["2026-10-01", "2026-10-20"]);
    expect(d.excluded).toHaveLength(1);
    expect(d.expensesExcluded).toHaveLength(1);
  });
});

describe("ranges", () => {
  it("resolves keys and custom ranges, and finds the previous period", () => {
    expect(resolveRange("2026-Q3")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
    expect(previousPeriod("2026-10", (k) => shiftPeriod(k, -1))).toBe("2026-09");
    expect(previousPeriod({ start: "2026-10-11", end: "2026-10-20" }, (k) => k)).toEqual({
      start: "2026-10-01",
      end: "2026-10-10",
    });
    expect(daysBetween("2026-02-28", "2026-03-01")).toBe(1);
  });
});
