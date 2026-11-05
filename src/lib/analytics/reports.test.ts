import { describe, expect, it } from "vitest";
import {
  OTHER_KEY,
  expensesByCategory,
  salesByCustomer,
  salesByHsn,
  salesByItem,
  salesByState,
  salesByType,
  topN,
} from "./breakdowns";
import { computeMetrics } from "./metrics";
import { ageBucket, receivablesReport } from "./receivables";
import {
  expenseRegister,
  hsnSummary,
  incomeRegister,
  notesRegister,
  receivablesRegister,
  salesRegister,
} from "./registers";
import { toDec } from "@/lib/money";
import { data, exp, income, inv } from "./fixtures.test-utils";

const TODAY = "2026-11-05";

describe("breakdowns", () => {
  const d = data(
    [
      inv({ customer: "A", amount: "700", gstin: "27AAPFU0939F1ZV", hsn: "1001", item: "Rice" }),
      inv({ customer: "B", amount: "600", state: "29", hsn: "1002", item: "Wheat" }),
      inv({ customer: "C", amount: "500", hsn: "1001", item: "rice" }),
      inv({ customer: "D", amount: "400", docType: "export", country: "USA" }),
      inv({ customer: "E", amount: "300" }),
      inv({ customer: "F", amount: "200" }),
      inv({ customer: "G", amount: "100" }),
      inv({
        customer: "A",
        amount: "200",
        docType: "credit_note",
        hsn: "1001",
        item: "Rice",
        gstin: "27AAPFU0939F1ZV",
      }),
    ],
    [
      exp({ category: "Rent", amount: "1000" }),
      exp({ category: "Food", amount: "100", itc: false }),
    ],
  );

  it("groups sales by customer net of notes and folds top-5 + Other", () => {
    const b = salesByCustomer(d, "2026-10");
    expect(b.total).toBe("2600.00");
    expect(b.items[0]).toMatchObject({ key: "B", value: "600.00" });
    expect(b.items.find((i) => i.key === "A")?.value).toBe("500.00");
    const t = topN(b);
    expect(t.items).toHaveLength(6);
    expect(t.items[5]).toMatchObject({
      key: OTHER_KEY,
      label: "Other",
      value: "300.00",
      count: 2,
      groupedKeys: ["F", "G"],
    });
    expect(t.items.reduce((s, i) => s.plus(toDec(i.value)), toDec("0")).toFixed(2)).toBe(b.total);
    // n + 1 items: nothing to fold
    expect(topN(b, 6).items).toHaveLength(7);
  });

  it("breaks down by state, type, HSN and item", () => {
    expect(salesByState(d, "2026-10").items.map((i) => i.key)).toEqual(["27", "29", "96"]);
    expect(salesByType(d, "2026-10").items.map((i) => [i.key, i.label, i.value])).toEqual([
      ["b2c", "B2C", "1700.00"],
      ["b2b", "B2B", "500.00"],
      ["export", "Export", "400.00"],
    ]);
    expect(salesByHsn(d, "2026-10").items[0]).toMatchObject({ key: "1001", value: "1000.00" }); // tie → by label
    expect(salesByHsn(d, "2026-10").items.find((i) => i.key === "8471")?.value).toBe("1000.00");
    expect(salesByItem(d, "2026-10").items[0]).toMatchObject({
      key: "rice",
      label: "Rice",
      value: "1000.00",
    });
    expect(salesByItem(d, "2026-10").items.find((i) => i.key === "rice")?.count).toBe(3);
  });

  it("breaks down expenses by category using cost", () => {
    const b = expensesByCategory(d, "2026-10");
    expect(b.items).toEqual([
      expect.objectContaining({ key: "Rent", value: "1000.00", share: "89.45" }),
      expect.objectContaining({ key: "Food", value: "118.00" }),
    ]);
    expect(b.total).toBe(computeMetrics(d, "2026-10", TODAY).expenses);
  });

  it("handles empty data", () => {
    expect(salesByCustomer(data(), "2026-10")).toEqual({ total: "0.00", items: [] });
  });
});

describe("receivables ageing", () => {
  it("places boundaries correctly", () => {
    expect([0, 30, 31, 60, 61, 90, 91, -5].map(ageBucket)).toEqual([
      "0-30",
      "0-30",
      "31-60",
      "31-60",
      "61-90",
      "61-90",
      "90+",
      "0-30",
    ]);
  });

  it("ages by due date (fallback invoice date) as of today", () => {
    // TODAY 2026-11-05: due dates exactly 30/31/60/61/90/91 days earlier.
    const due = (days: number) =>
      new Date(Date.UTC(2026, 10, 5) - days * 86_400_000).toISOString().slice(0, 10);
    const d = data([
      inv({
        number: "A30",
        amount: "100",
        rate: "0",
        date: "2026-01-01",
        due: due(30),
        customer: "X",
      }),
      inv({
        number: "A31",
        amount: "200",
        rate: "0",
        date: "2026-01-01",
        due: due(31),
        customer: "X",
      }),
      inv({
        number: "A60",
        amount: "300",
        rate: "0",
        date: "2026-01-01",
        due: due(60),
        customer: "Y",
      }),
      inv({
        number: "A61",
        amount: "400",
        rate: "0",
        date: "2026-01-01",
        due: due(61),
        customer: "Y",
      }),
      inv({
        number: "A90",
        amount: "500",
        rate: "0",
        date: "2026-01-01",
        due: due(90),
        customer: "Z",
      }),
      inv({ number: "A91", amount: "600", rate: "0", date: due(91), customer: "Z" }), // no due date
      inv({ number: "NOTDUE", amount: "50", rate: "0", date: "2026-11-01", due: "2026-11-20" }),
      inv({ number: "PAID", amount: "50", rate: "0", date: "2026-01-01", received: "50" }),
      inv({ number: "FUTURE", amount: "50", rate: "0", date: "2026-12-01" }),
    ]);
    const r = receivablesReport(d, TODAY, 3);
    expect(r.buckets.map((b) => [b.key, b.amount, b.count])).toEqual([
      ["0-30", "150.00", 2],
      ["31-60", "500.00", 2],
      ["61-90", "900.00", 2],
      ["90+", "600.00", 1],
    ]);
    expect(r.outstanding).toBe("2150.00");
    expect(r.overdue).toBe("2100.00");
    expect(r.notYetDue).toBe("50.00");
    expect(r.overdueShare).toBe("97.67");
    expect(r.topOverdue.map((o) => o.number)).toEqual(["A91", "A90", "A61"]);
    expect(r.byCustomer[0]).toMatchObject({ key: "Z", outstanding: "1100.00", maxDaysPastDue: 91 });
    const reg = receivablesRegister(d, TODAY);
    expect(reg.totalsByKey.balance).toBe(r.outstanding);
    expect(reg.rows[0][4]).toBe("91");
  });
});

describe("registers reconcile with metrics", () => {
  const d = data(
    [
      inv({ amount: "10000.55", customer: "A", gstin: "27AAPFU0939F1ZV" }),
      inv({ amount: "5000", state: "29", customer: "B", rate: "5", hsn: "9983" }),
      inv({
        docType: "export",
        currency: "USD",
        exchangeRate: "83.1",
        amount: "123.45",
        country: "USA",
        exportType: "wpay",
      }),
      inv({ docType: "bill_of_supply", amount: "777" }),
      inv({ docType: "credit_note", amount: "1000", customer: "A" }),
      inv({
        docType: "debit_note",
        amount: "250",
        customer: "B",
        state: "29",
        rate: "5",
        hsn: "9983",
      }),
      inv({
        lines: [
          { amount: "100.10", rate: "5" },
          { amount: "200.20", rate: "12", hsn: "9983" },
        ],
      }),
    ],
    [
      exp({ amount: "2000" }),
      exp({ amount: "590", includesGst: true, itc: false }),
      exp({ amount: "1000", mode: "inter", rcm: true }),
    ],
    [income("300"), income("200", "2026-10-20", "Commission")],
  );
  const m = computeMetrics(d, "2026-10", TODAY);
  const sales = salesRegister(d, "2026-10", TODAY);
  const notes = notesRegister(d, "2026-10");
  const k = (r: { totalsByKey: Record<string, string> }, key: string) => toDec(r.totalsByKey[key]);

  it("sales − credit + debit = salesRevenue and output tax", () => {
    const rev = k(sales, "taxable").minus(k(notes, "creditTaxable")).plus(k(notes, "debitTaxable"));
    expect(rev.toFixed(2)).toBe(m.salesRevenue);
    for (const head of ["cgst", "sgst", "igst"] as const) {
      const cap = head.toUpperCase()[0] + head.slice(1);
      const v = k(sales, head)
        .minus(k(notes, `credit${cap}`))
        .plus(k(notes, `debit${cap}`));
      expect(v.toFixed(2)).toBe(m.outputTax[head]);
    }
    expect(sales.rows).toHaveLength(5);
    expect(sales.totals[0]).toBe("Total (5)");
    expect(sales.headers).toContain("GSTIN");
  });

  it("HSN summary equals revenue and output tax", () => {
    const h = hsnSummary(d, "2026-10");
    expect(h.totalsByKey.taxable).toBe(m.salesRevenue);
    expect(h.totalsByKey.tax).toBe(m.outputTax.total);
  });

  it("expense and income registers equal metrics", () => {
    const e = expenseRegister(d, "2026-10");
    expect(e.totalsByKey.cost).toBe(m.expenses);
    expect(e.totalsByKey.eligibleItc).toBe(m.eligibleItc.total.total);
    expect(incomeRegister(d, "2026-10").totalsByKey.amount).toBe(m.otherIncome);
    expect(expenseRegister(d, "2026-10", { category: "Nope" }).rows).toHaveLength(0);
  });

  it("filters for drill-down", () => {
    expect(salesRegister(d, "2026-10", TODAY, { customerKey: "B" }).rows).toHaveLength(1);
    expect(salesRegister(d, "2026-10", TODAY, { supplyClass: "export" }).rows).toHaveLength(1);
    expect(salesRegister(d, "2026-10", TODAY, { hsn: "9983" }).rows).toHaveLength(2);
  });
});
