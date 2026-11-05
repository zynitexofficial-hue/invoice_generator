import { describe, expect, it } from "vitest";
import { computeExpenseSummary } from "@/lib/expense-calc";
import { expenseSchema, incomeSchema, type Expense, type Income } from "@/lib/schema";
import {
  categoryOptions,
  claimsItc,
  EXPENSE_CSV_HEADERS,
  expenseCsvRow,
  expenseTotals,
  filterExpenses,
  filterIncomes,
  incomeCsvRow,
  incomeTotals,
  inRange,
  itcClaimable,
  periodSlug,
  periodText,
  resolvePeriod,
  vendorSuggestions,
  type ExpenseFilters,
} from "./money-data";

let seq = 0;
function expense(partial: Partial<Expense>): Expense {
  const parsed = expenseSchema.parse({
    id: `e${++seq}`,
    createdAt: `2026-01-01T00:00:${String(seq).padStart(2, "0")}.000Z`,
    ...partial,
  });
  return { ...parsed, summary: computeExpenseSummary(parsed) };
}
function income(partial: Partial<Income>): Income {
  return incomeSchema.parse({ id: `i${++seq}`, createdAt: "2026-01-01T00:00:00.000Z", ...partial });
}

const ALL: ExpenseFilters = {
  period: { start: "", end: "" },
  category: "",
  gstOnly: false,
  itcOnly: false,
  status: "all",
};

describe("resolvePeriod", () => {
  const today = "2026-11-05";
  it("resolves presets against today", () => {
    expect(resolvePeriod({ preset: "this_month", from: "", to: "" }, today)).toEqual({
      start: "2026-11-01",
      end: "2026-11-30",
      key: "2026-11",
    });
    expect(resolvePeriod({ preset: "last_month", from: "", to: "" }, "2026-01-10").key).toBe(
      "2025-12",
    );
    expect(resolvePeriod({ preset: "this_quarter", from: "", to: "" }, today)).toEqual({
      start: "2026-10-01",
      end: "2026-12-31",
      key: "2026-Q3",
    });
    expect(resolvePeriod({ preset: "this_fy", from: "", to: "" }, "2026-02-01").key).toBe(
      "FY2025-26",
    );
    expect(resolvePeriod({ preset: "last_fy", from: "", to: "" }, today)).toEqual({
      start: "2025-04-01",
      end: "2026-03-31",
      key: "FY2025-26",
    });
  });

  it("handles custom and reversed ranges", () => {
    expect(
      resolvePeriod({ preset: "custom", from: "2026-03-01", to: "2026-01-01" }, today),
    ).toEqual({ start: "2026-01-01", end: "2026-03-01", key: "" });
    const open = resolvePeriod({ preset: "custom", from: "", to: "" }, today);
    expect(open).toEqual({ start: "", end: "", key: "" });
    expect(periodSlug(open)).toBe("all");
    expect(periodText(open, (d) => d)).toBe("All dates");
  });

  it("labels and slugs", () => {
    const fmt = (d: string) => d.split("-").reverse().join("/");
    expect(periodSlug({ start: "2026-11-01", end: "2026-11-30", key: "2026-11" })).toBe("2026-11");
    expect(periodText({ start: "2026-11-01", end: "2026-11-30", key: "2026-11" }, fmt)).toBe(
      "Nov 2026",
    );
    expect(periodSlug({ start: "2026-01-01", end: "", key: "" })).toBe("2026-01-01_to_today");
    expect(periodText({ start: "2026-01-01", end: "2026-02-01", key: "" }, fmt)).toBe(
      "01/01/2026 – 01/02/2026",
    );
  });

  it("inRange is inclusive and open-ended", () => {
    expect(inRange("2026-11-30", { start: "2026-11-01", end: "2026-11-30" })).toBe(true);
    expect(inRange("2026-12-01", { start: "2026-11-01", end: "2026-11-30" })).toBe(false);
    expect(inRange("2020-01-01", { start: "", end: "2026-11-30" })).toBe(true);
    expect(inRange("", { start: "2026-11-01", end: "" })).toBe(false);
  });
});

describe("expense filters & totals", () => {
  const rent = expense({
    date: "2026-11-02",
    category: "Rent",
    vendorName: "Landlord",
    vendorGstin: "29ABCDE1234F1Z5",
    invoiceNo: "R-1",
    amount: "11800",
    amountIncludesGst: true,
    gstRate: "18",
    gstMode: "intra",
    itcEligible: true,
  });
  const food = expense({
    date: "2026-11-20",
    category: "Food & entertainment",
    vendorName: "Cafe",
    amount: "1050",
    gstRate: "5",
    gstMode: "inter",
    itcEligible: false,
    itcType: "ineligible",
    paymentStatus: "unpaid",
  });
  const salary = expense({
    date: "2026-10-31",
    category: "Salaries & wages",
    vendorName: "landlord",
    amount: "50000",
    gstMode: "none",
  });
  const list = [salary, rent, food];

  it("filters by period, category, GST, ITC and status, newest first", () => {
    const nov = { start: "2026-11-01", end: "2026-11-30" };
    expect(filterExpenses(list, { ...ALL, period: nov }).map((e) => e.id)).toEqual([
      food.id,
      rent.id,
    ]);
    expect(filterExpenses(list, { ...ALL, category: "Rent" })).toEqual([rent]);
    expect(filterExpenses(list, { ...ALL, gstOnly: true }).map((e) => e.id)).toEqual([
      food.id,
      rent.id,
    ]);
    expect(filterExpenses(list, { ...ALL, itcOnly: true })).toEqual([rent]);
    expect(filterExpenses(list, { ...ALL, status: "unpaid" })).toEqual([food]);
  });

  it("computes ITC and totals with decimals", () => {
    expect(claimsItc(rent)).toBe(true);
    expect(itcClaimable(rent)).toBe("1800.00");
    expect(itcClaimable(food)).toBe("0.00");
    expect(itcClaimable({ ...rent, itcType: "ineligible" })).toBe("0.00");
    expect(expenseTotals(list)).toEqual({
      count: 3,
      taxable: "61000.00",
      gst: "1850.00",
      total: "62850.00",
      itc: "1800.00",
    });
    expect(expenseTotals([])).toEqual({
      count: 0,
      taxable: "0.00",
      gst: "0.00",
      total: "0.00",
      itc: "0.00",
    });
  });

  it("suggests distinct vendors, most recent first", () => {
    expect(vendorSuggestions(list)).toEqual([
      { name: "Cafe", gstin: "", stateCode: "" },
      { name: "Landlord", gstin: "29ABCDE1234F1Z5", stateCode: "" },
    ]);
  });

  it("builds CSV rows aligned with the headers", () => {
    const row = expenseCsvRow(rent);
    expect(row).toHaveLength(EXPENSE_CSV_HEADERS.length);
    const at = (h: string) => row[EXPENSE_CSV_HEADERS.indexOf(h)];
    expect(at("Vendor GSTIN")).toBe("29ABCDE1234F1Z5");
    expect(at("Taxable value")).toBe("10000.00");
    expect(at("CGST")).toBe("900.00");
    expect(at("SGST")).toBe("900.00");
    expect(at("IGST")).toBe("0.00");
    expect(at("ITC eligible")).toBe("Yes");
    expect(at("ITC type")).toBe("Inputs (goods)");
    expect(at("Reverse charge")).toBe("No");
    expect(at("Payment status")).toBe("Paid");
    const s = expenseCsvRow(salary);
    expect(s[EXPENSE_CSV_HEADERS.indexOf("GST rate (%)")]).toBe("");
    expect(s[EXPENSE_CSV_HEADERS.indexOf("Supply")]).toBe("No GST");
  });
});

describe("income helpers", () => {
  const a = income({ date: "2026-11-03", category: "Interest", amount: "120.5" });
  const b = income({ date: "2026-11-10", category: "Refund", amount: "79.5" });
  const c = income({ date: "2026-09-10", category: "Interest", amount: "1000" });

  it("filters, sorts and totals", () => {
    const nov = { start: "2026-11-01", end: "2026-11-30" };
    expect(filterIncomes([a, b, c], { period: nov, category: "" })).toEqual([b, a]);
    expect(
      filterIncomes([a, b, c], { period: { start: "", end: "" }, category: "Interest" }),
    ).toEqual([a, c]);
    expect(incomeTotals([a, b])).toEqual({ count: 2, total: "200.00" });
    expect(incomeCsvRow(a)).toEqual(["2026-11-03", "", "Interest", "120.50", ""]);
  });

  it("merges configured and used categories", () => {
    expect(categoryOptions(["Interest", "Other"], ["Other", "Old name", ""])).toEqual([
      "Interest",
      "Other",
      "Old name",
    ]);
  });
});
