import { describe, expect, it } from "vitest";
import { expenseRegister, salesRegister, notesRegister } from "@/lib/analytics";
import { data, exp, inv, income } from "@/lib/analytics/fixtures.test-utils";
import { computeYoy, sumTrend } from "@/lib/analytics/yoy";
import { buildGstr4 } from "@/lib/gst/annual/gstr4";
import {
  DEFAULT_SETTINGS,
  annualInputSchema,
  filingSchema,
  returnSnapshotSchema,
} from "@/lib/schema";
import { buildAnnualPnl } from "./pnl";
import { buildTaxPack } from "./pack";
import { buildGstReconciliation } from "./reconcile";

const FY = "FY2026-27";
const TODAY = "2027-02-01";

const invoices = [
  inv({ date: "2026-05-10", amount: "10000", customer: "A" }),
  inv({ date: "2026-10-10", amount: "20000", customer: "B" }),
  inv({ date: "2026-12-10", amount: "30000", customer: "A" }),
  inv({ docType: "credit_note", date: "2026-12-20", amount: "5000", customer: "A" }),
  inv({ date: "2025-06-10", amount: "8000", customer: "A" }),
  inv({ date: "2025-09-10", amount: "4000", customer: "C" }),
];
const expenses = [
  exp({ date: "2026-06-01", amount: "1000", category: "Rent" }),
  exp({ date: "2026-11-01", amount: "2000", category: "Travel", itc: false }),
  exp({ date: "2025-06-01", amount: "500", category: "Rent" }),
];
const incomes = [income("300", "2026-08-01", "Interest")];
const d = data(invoices, expenses, incomes);

describe("annual P&L", () => {
  const pnl = buildAnnualPnl(d, FY, null, TODAY);
  it("reconciles with the registers", () => {
    const sales = salesRegister(d, FY, TODAY).totalsByKey.taxable;
    const notes = notesRegister(d, FY).totalsByKey;
    expect(
      (Number(sales) - Number(notes.creditTaxable) + Number(notes.debitTaxable)).toFixed(2),
    ).toBe(pnl.netSales);
    expect(pnl.expensesTotal).toBe(expenseRegister(d, FY).totalsByKey.cost);
    expect(pnl.otherIncomeTotal).toBe("300.00");
    expect(pnl.managementProfit).toBe(
      (Number(pnl.netSales) + 300 - Number(pnl.expensesTotal)).toFixed(2),
    );
    expect(pnl.adjustedProfit).toBe(pnl.managementProfit);
  });
  it("applies manual adjustments", () => {
    const a = annualInputSchema.parse({
      id: FY,
      pnl: {
        openingStock: "1000",
        closingStock: "400",
        depreciation: "100",
        otherAdjustments: "-50",
      },
    });
    const p = buildAnnualPnl(d, FY, a, TODAY);
    // stock fell by 600 (cost +600), depreciation +100, other -50 (cost -50)
    expect(p.adjustedProfit).toBe((Number(p.managementProfit) - 600 - 100 + 50).toFixed(2));
  });
});

describe("tax pack", () => {
  it("bundles eight files and the reconciliation by month", () => {
    const pack = buildTaxPack({
      data: d,
      settings: DEFAULT_SETTINGS,
      filings: [],
      snapshots: [],
      fyKey: FY,
      annual: null,
      today: TODAY,
    });
    expect(pack.files.map((f) => f.name.slice(0, 2))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
    ]);
    expect(pack.reconciliation).toHaveLength(12);
    expect(pack.files[0].rows.at(-1)?.[0]).toMatch(/^Total/);
  });

  it("compares books with the totals saved when a return was filed", () => {
    const filing = filingSchema.parse({
      id: "2026-10:GSTR-1",
      periodKey: "2026-10",
      periodKind: "month",
      returnType: "GSTR-1",
      status: "filed",
      filedAt: "2026-11-10T10:00:00.000Z",
    });
    const snap = returnSnapshotSchema.parse({
      id: "s1",
      filingId: filing.id,
      periodKey: "2026-10",
      returnType: "GSTR-1",
      totals: {
        _stage: "filed",
        "total.taxable": "19000.00",
        "total.igst": "0",
        "total.cgst": "1710",
        "total.sgst": "1710",
      },
    });
    const rows = buildGstReconciliation({
      data: d,
      settings: DEFAULT_SETTINGS,
      filings: [filing],
      snapshots: [snap],
      fyKey: FY,
      today: TODAY,
    });
    const oct = rows.find((r) => r.periodKey === "2026-10")!;
    expect(oct.booksTaxable).toBe("20000.00");
    expect(oct.taxableDiff).toBe("1000.00");
    expect(oct.outputTaxDiff).toBe("180.00");
    expect(rows.find((r) => r.periodKey === "2026-11")!.taxableDiff).toBeNull();
  });
});

describe("year over year", () => {
  const y = computeYoy(d, FY, TODAY);
  it("reconciles the monthly series with the annual figures and registers", () => {
    expect(
      sumTrend(
        y.months.map((m) => m.current),
        "revenue",
      ),
    ).toBe(y.current.salesRevenue);
    expect(
      sumTrend(
        y.months.map((m) => m.previous),
        "revenue",
      ),
    ).toBe(y.previous.salesRevenue);
    expect(
      sumTrend(
        y.months.map((m) => m.current),
        "expenses",
      ),
    ).toBe(y.current.expenses);
    expect(y.current.expenses).toBe(expenseRegister(d, FY).totalsByKey.cost);
    expect(y.previous.expenses).toBe(expenseRegister(d, "FY2025-26").totalsByKey.cost);
    expect(y.current.salesRevenue).toBe("55000.00");
    expect(y.previous.salesRevenue).toBe("12000.00");
  });
  it("counts customers", () => {
    expect(y.customers.current).toEqual({ active: 2, newCustomers: 1, retained: 1 });
    expect(y.customers.previous.active).toBe(2);
    expect(y.customers.growth).toBe("0.00");
  });
  it("growth is null when the previous year is empty", () => {
    expect(computeYoy(d, "FY2025-26", TODAY).growth.salesRevenue).toBeNull();
  });
});

describe("GSTR-4", () => {
  const settings = {
    ...DEFAULT_SETTINGS,
    gst: { ...DEFAULT_SETTINGS.gst, registrationType: "composition" as const },
  };
  const comp = buildGstr4({
    data: d,
    expenses: [exp({ date: "2026-07-01", amount: "1000", rcm: true })],
    settings,
    fyKey: FY,
    values: { "cmp08.q1": "100", defaultRate: "1" },
    today: "2027-03-01",
  });
  it("taxes net turnover at the composition rate, half CGST and half SGST", () => {
    expect(comp.booksTurnover).toBe("55000.00");
    const r1 = comp.rates.find((r) => r.rate === "1")!;
    expect(r1.tax).toBe("550.00");
    expect(r1.cgst).toBe("275.00");
  });
  it("adds reverse-charge tax and subtracts CMP-08 payments", () => {
    expect(comp.rcmTax).toBe("180.00");
    expect(comp.totalPayable).toBe("730.00");
    expect(comp.balance).toBe("630.00");
    expect(comp.dueDate).toBe("2027-04-30");
  });
  it("overrides per-rate turnover and warns on mismatch", () => {
    const o = buildGstr4({
      data: d,
      expenses: [],
      settings,
      fyKey: FY,
      values: { "turnover.6": "1000" },
      today: TODAY,
    });
    expect(o.rates.find((r) => r.rate === "6")!.tax).toBe("60.00");
    expect(o.warnings.some((w) => w.includes("differs"))).toBe(true);
  });
  it("estimates a late fee once past the due date", () => {
    expect(comp.lateFee.daysLate).toBe(0);
    const late = buildGstr4({ data: d, expenses: [], settings, fyKey: FY, today: "2027-05-30" });
    expect(late.lateFee.daysLate).toBe(30);
    expect(Number(late.lateFee.lateFee.total)).toBe(1500);
  });
});
