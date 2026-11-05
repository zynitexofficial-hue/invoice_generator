import { describe, expect, it } from "vitest";
import { compare, computeMetrics, growth, metricsWithComparison, previousOf } from "./metrics";
import { lastNMonths, monthlyTrend, fyMonths } from "./trends";
import { data, exp, income, inv } from "./fixtures.test-utils";

const TODAY = "2026-11-05";

describe("computeMetrics", () => {
  it("returns zeros and nulls for empty data", () => {
    const m = computeMetrics(data(), "2026-10", TODAY);
    expect(m).toMatchObject({
      salesRevenue: "0.00",
      otherIncome: "0.00",
      expenses: "0.00",
      netProfit: "0.00",
      netMargin: null,
      effectiveGstRate: null,
      itcCoverage: null,
      expenseRatio: null,
      topCustomer: null,
      topCustomerShare: null,
      receivablesOutstanding: "0.00",
    });
    expect(m.outputTax).toEqual({ cgst: "0.00", sgst: "0.00", igst: "0.00", total: "0.00" });
    expect(m.dataCoverage).toMatchObject({
      invoicesIncluded: 0,
      invoicesExcluded: 0,
      expensesIncluded: 0,
    });
  });

  it("computes a single period with sales, notes, income and expenses", () => {
    const d = data(
      [
        inv({ amount: "10000", customer: "A" }), // intra 18%: 900/900
        inv({ amount: "5000", state: "29", customer: "B" }), // inter: 900 IGST
        inv({ docType: "credit_note", amount: "1000", customer: "A" }), // −1000, −90/−90
        inv({ docType: "debit_note", amount: "500", customer: "B", state: "29" }), // +500, +90 IGST
        inv({ amount: "999", date: "2026-09-30" }), // other period
      ],
      [
        exp({ amount: "2000" }), // eligible: 180/180 ITC, cost 2000
        exp({ amount: "1000", itc: false, category: "Food & entertainment" }), // cost 1180
        exp({ amount: "1000", mode: "inter", rcm: true }), // RCM: IGST 180 liability + ITC, cost 1000
      ],
      [income("300")],
    );
    const m = computeMetrics(d, "2026-10", TODAY);
    expect(m.grossSales).toBe("15000.00");
    expect(m.creditNotes).toBe("1000.00");
    expect(m.debitNotes).toBe("500.00");
    expect(m.salesRevenue).toBe("14500.00");
    expect(m.otherIncome).toBe("300.00");
    expect(m.totalIncome).toBe("14800.00");
    expect(m.expenses).toBe("4180.00");
    expect(m.netProfit).toBe("10620.00");
    expect(m.netMargin).toBe("71.76");
    expect(m.outputTax).toEqual({
      cgst: "810.00",
      sgst: "810.00",
      igst: "990.00",
      total: "2610.00",
    });
    expect(m.eligibleItc.normal).toEqual({
      cgst: "180.00",
      sgst: "180.00",
      igst: "0.00",
      total: "360.00",
    });
    expect(m.eligibleItc.rcm).toEqual({
      cgst: "0.00",
      sgst: "0.00",
      igst: "180.00",
      total: "180.00",
    });
    expect(m.rcmLiability.igst).toBe("180.00");
    // cgst 810−180, sgst 810−180, igst max(0, 990−180)+180
    expect(m.estimatedGstPayable).toEqual({
      cgst: "630.00",
      sgst: "630.00",
      igst: "990.00",
      total: "2250.00",
    });
    expect(m.effectiveGstRate).toBe("18.00");
    expect(m.itcCoverage).toBe("20.69");
    expect(m.expenseRatio).toBe("28.83");
    // A: 10000 − 1000 = 9000; B: 5500
    expect(m.topCustomer).toEqual({ key: "A", name: "A", amount: "9000.00", share: "62.07" });
    expect(m.counts).toEqual({
      invoices: 2,
      creditNotes: 1,
      debitNotes: 1,
      expenses: 3,
      incomes: 1,
    });
  });

  it("handles negative profit", () => {
    const m = computeMetrics(
      data([inv({ amount: "100" })], [exp({ amount: "1000", itc: false })]),
      "2026-10",
      TODAY,
    );
    expect(m.netProfit).toBe("-1080.00");
    expect(m.netMargin).toBe("-1080.00");
  });

  it("floors estimated payable at zero per head (no cross-head set-off)", () => {
    const m = computeMetrics(
      data([inv({ amount: "100" })], [exp({ amount: "10000", mode: "inter" })]),
      "2026-10",
      TODAY,
    );
    expect(m.estimatedGstPayable).toEqual({
      cgst: "9.00",
      sgst: "9.00",
      igst: "0.00",
      total: "18.00",
    });
  });

  it("converts foreign currency and reports exclusions in data coverage", () => {
    const d = data([
      inv({
        docType: "export",
        currency: "USD",
        exchangeRate: "80",
        amount: "100",
        country: "USA",
      }),
      inv({ docType: "export", currency: "USD", exchangeRate: "", amount: "100", country: "USA" }),
      inv({ issued: false }),
    ]);
    const m = computeMetrics(d, "2026-10", TODAY);
    expect(m.salesRevenue).toBe("8000.00");
    expect(m.effectiveGstRate).toBeNull(); // LUT export charges no GST
    expect(m.dataCoverage).toMatchObject({
      invoicesIncluded: 1,
      invoicesExcluded: 2,
      missingData: 1,
      reasons: { "missing exchange rate": 1, draft: 1 },
    });
  });

  it("supports custom ranges", () => {
    const d = data([inv({ date: "2026-10-05" }), inv({ date: "2026-10-25" })]);
    expect(computeMetrics(d, { start: "2026-10-01", end: "2026-10-10" }, TODAY).salesRevenue).toBe(
      "1000.00",
    );
  });

  it("computes receivables as of today across periods", () => {
    const d = data([
      inv({ amount: "1000", date: "2026-08-01", due: "2026-08-15" }),
      inv({ amount: "1000", date: "2026-11-01", due: "2026-11-30" }),
      inv({ amount: "1000", date: "2026-10-01", received: "1180" }),
    ]);
    const m = computeMetrics(d, "2026-10", TODAY);
    expect(m.receivablesOutstanding).toBe("2360.00");
    expect(m.receivablesOverdue).toBe("1180.00");
  });
});

describe("growth & compare", () => {
  it("returns null when previous is zero and handles negatives", () => {
    expect(growth("100", "0")).toBeNull();
    expect(growth("120", "100")).toBe("20.00");
    expect(growth("-50", "-100")).toBe("50.00");
    expect(growth("0", "100")).toBe("-100.00");
  });

  it("compares two periods", () => {
    const d = data([inv({ amount: "2000" }), inv({ amount: "1000", date: "2026-09-10" })]);
    const { growth: g, previous } = metricsWithComparison(d, "2026-10", TODAY);
    expect(previous.salesRevenue).toBe("1000.00");
    expect(g.salesRevenue).toBe("100.00");
    expect(g.expenses).toBeNull();
    const c = compare(computeMetrics(d, "2026-10", TODAY), computeMetrics(d, "2026-08", TODAY));
    expect(c.salesRevenue).toBeNull();
    expect(previousOf("2026-Q3")).toBe("2026-Q2");
  });
});

describe("trends", () => {
  it("builds monthly series", () => {
    expect(lastNMonths("2026-02-10", 3)).toEqual(["2025-12", "2026-01", "2026-02"]);
    expect(fyMonths("FY2026-27")).toHaveLength(12);
    const d = data([inv({ amount: "1000" })], [exp({ amount: "100", date: "2026-09-01" })]);
    const t = monthlyTrend(d, ["2026-09", "2026-10"], TODAY);
    expect(t).toEqual([
      expect.objectContaining({
        month: "2026-09",
        label: "Sep 2026",
        shortLabel: "Sep",
        revenue: "0.00",
        expenses: "100.00",
        profit: "-100.00",
        itc: "18.00",
      }),
      expect.objectContaining({
        month: "2026-10",
        revenue: "1000.00",
        outputTax: "180.00",
        profit: "1000.00",
      }),
    ]);
  });
});
