import { describe, expect, it } from "vitest";
import { bill, vendor } from "@/lib/purchases/fixtures.test-utils";
import { computeExpenseSummary } from "@/lib/expense-calc";
import { toDec } from "@/lib/money";
import { cashFlowReport, cashOutlook } from "./cash-flow";
import { cashInFromInvoices } from "./cash-in-source";
import { data, exp, income, inv, SELLER_STATE } from "./fixtures.test-utils";
import { openInvoices } from "./receivables";
import { MSME_DAYS, msmeAlerts, openBills, payablesReport, vendorConcentration } from "./payables";
import { vendorStatement } from "./vendor-statement";

const TODAY = "2026-11-20";

describe("payables ageing", () => {
  const v1 = vendor({ id: "v1", name: "Paper Co" });
  const bills = [
    bill({ id: "a", billDate: "2026-11-01", dueDate: "2026-12-01" }), // not yet due
    bill({ id: "b", billDate: "2026-10-01", dueDate: "2026-11-05" }), // 15 late
    bill({ id: "c", billDate: "2026-09-01", dueDate: "2026-10-01" }), // 50 late
    bill({ id: "d", billDate: "2026-07-01", dueDate: "2026-08-15" }), // 97 late
    bill({
      id: "e",
      billDate: "2026-10-01",
      dueDate: "2026-10-31",
      payments: [{ id: "p", date: "2026-11-01", amount: "1180" }],
    }), // paid
    bill({ id: "f", billDate: "2026-12-01", dueDate: "2026-12-31" }), // future
    bill({ id: "g", billDate: "2026-08-01", dueDate: "" }), // due = bill date, 111 late
  ];

  it("buckets balances by days past due and reconciles to the total", () => {
    const r = payablesReport(bills, [v1], TODAY);
    expect(r.open.map((o) => o.id).sort()).toEqual(["a", "b", "c", "d", "g"]);
    const byKey = Object.fromEntries(r.buckets.map((b) => [b.key, b.amount]));
    expect(byKey).toEqual({
      "0-30": "2360.00",
      "31-60": "1180.00",
      "61-90": "0.00",
      "90+": "2360.00",
    });
    expect(r.outstanding).toBe("5900.00");
    expect(r.overdue).toBe("4720.00");
    expect(r.notYetDue).toBe("1180.00");
    expect(r.buckets.reduce((a, b) => a.plus(b.amount), toDec(0)).toFixed(2)).toBe(r.outstanding);
    expect(r.byVendor).toHaveLength(1);
    expect(r.byVendor[0].outstanding).toBe(r.outstanding);
    expect(r.open[0].id).toBe("g"); // most overdue first
  });

  it("returns an empty report cleanly", () => {
    const r = payablesReport([], [], TODAY);
    expect(r.outstanding).toBe("0.00");
    expect(r.overdueShare).toBeNull();
  });

  it("reports vendor opening balances separately", () => {
    const r = payablesReport(
      [],
      [vendor({ openingBalance: "2500" }), vendor({ openingBalance: "-100" })],
      TODAY,
    );
    expect(r.openingBalances).toBe("2500.00");
  });
});

describe("MSME 45-day alerts", () => {
  const msme = vendor({ id: "m1", name: "Small Mills", msme: true });
  const normal = vendor({ id: "n1", name: "Big Corp" });

  it("flags only MSME vendors' unpaid bills near or past 45 days", () => {
    const bills = [
      bill({ id: "late", vendorId: "m1", billDate: "2026-09-20" }), // deadline 11-04: breached
      bill({ id: "soon", vendorId: "m1", billDate: "2026-10-12" }), // deadline 11-26: 6 days left
      bill({ id: "fine", vendorId: "m1", billDate: "2026-11-10" }), // deadline 12-25: 35 left
      bill({
        id: "paid",
        vendorId: "m1",
        billDate: "2026-09-01",
        payments: [{ id: "p", date: "2026-09-30", amount: "1180" }],
      }),
      bill({ id: "other", vendorId: "n1", billDate: "2026-08-01" }),
    ];
    const alerts = msmeAlerts(openBills(bills, [msme, normal], TODAY), TODAY);
    expect(alerts.map((a) => [a.billId, a.severity, a.daysLeft])).toEqual([
      ["late", "breached", -16],
      ["soon", "soon", 6],
    ]);
    expect(MSME_DAYS).toBe(45);
    expect(payablesReport(bills, [msme, normal], TODAY).msmeAlerts).toHaveLength(2);
  });
});

describe("vendor concentration", () => {
  it("ranks vendors and computes shares", () => {
    const bills = [
      bill({
        vendorId: "a",
        vendorName: "Alpha",
        billDate: "2026-10-05",
        gstMode: "none",
        lines: [{ id: "1", quantity: "1", unitPrice: "700", gstRate: "0" }],
      }),
      bill({
        vendorId: "b",
        vendorName: "Beta",
        billDate: "2026-10-06",
        gstMode: "none",
        lines: [{ id: "1", quantity: "1", unitPrice: "200", gstRate: "0" }],
      }),
      bill({
        vendorId: "c",
        vendorName: "Gamma",
        billDate: "2026-10-07",
        gstMode: "none",
        lines: [{ id: "1", quantity: "1", unitPrice: "100", gstRate: "0" }],
      }),
      bill({ vendorId: "a", vendorName: "Alpha", billDate: "2026-09-07" }), // other period
    ];
    const r = vendorConcentration(bills, "2026-10");
    expect(r.total).toBe("1000.00");
    expect(r.vendors.map((v) => [v.name, v.share])).toEqual([
      ["Alpha", "70.00"],
      ["Beta", "20.00"],
      ["Gamma", "10.00"],
    ]);
    expect(r.topShare).toBe("70.00");
    expect(r.top3Share).toBe("100.00");
    expect(r.concentrated).toBe(true);
    expect(vendorConcentration([], "2026-10").topShare).toBeNull();
  });
});

describe("vendor statement", () => {
  const v = vendor({
    id: "v1",
    name: "Paper Co",
    openingBalance: "1000",
    openingBalanceDate: "2026-04-01",
  });
  const bills = [
    bill({
      id: "a",
      vendorId: "v1",
      billNo: "A",
      billDate: "2026-09-15",
      payments: [{ id: "p1", date: "2026-09-25", amount: "400" }],
    }),
    bill({
      id: "b",
      vendorId: "v1",
      billNo: "B",
      billDate: "2026-10-10",
      payments: [{ id: "p2", date: "2026-10-30", amount: "1180" }],
    }),
    bill({ id: "x", vendorId: "other", billDate: "2026-10-10" }),
  ];

  it("carries opening balance and shows running balance", () => {
    const s = vendorStatement(v, bills, { start: "2026-10-01", end: "2026-10-31" });
    // opening: 1000 + 1180 (A) − 400 = 1780
    expect(s.opening).toBe("1780.00");
    expect(s.rows.map((r) => [r.kind, r.debit, r.credit, r.balance])).toEqual([
      ["bill", "0.00", "1180.00", "2960.00"],
      ["payment", "1180.00", "0.00", "1780.00"],
    ]);
    expect(s.billed).toBe("1180.00");
    expect(s.paid).toBe("1180.00");
    expect(s.closing).toBe("1780.00");
  });

  it("closing = opening + billed − paid, and shows the opening row inside the range", () => {
    const s = vendorStatement(v, bills, { start: "2026-04-01", end: "2026-12-31" });
    expect(s.opening).toBe("0.00");
    expect(s.rows[0]).toMatchObject({ kind: "opening", credit: "1000.00", balance: "1000.00" });
    expect(toDec(s.opening).plus(s.billed).minus(s.paid).toFixed(2)).toBe(s.closing);
    expect(s.closing).toBe("1780.00");
  });

  it("an undated opening balance is always carried in", () => {
    const s = vendorStatement({ ...v, openingBalanceDate: "" }, [], {
      start: "2026-10-01",
      end: "2026-10-31",
    });
    expect(s.opening).toBe("1000.00");
    expect(s.closing).toBe("1000.00");
  });
});

describe("cash flow", () => {
  const invoices = [
    inv({ id: "i1", number: "INV-1", date: "2026-09-10", amount: "10000", received: "11800" }),
    inv({ id: "i2", number: "INV-2", date: "2026-10-05", amount: "5000", received: "2000" }),
    inv({ id: "i3", number: "INV-3", date: "2026-10-06", amount: "1000" }), // nothing received
  ].map((i) => (i.id === "i2" ? { ...i, payment: { ...i.payment, date: "2026-10-20" } } : i));
  const expenses = [
    exp({ id: "e1", date: "2026-10-12", amount: "1000", rate: "18" }), // total 1180, paid
    {
      ...exp({ id: "e2", date: "2026-10-14", amount: "500", mode: "none" }),
      paymentStatus: "partial" as const,
    },
    {
      ...exp({ id: "e3", date: "2026-09-01", amount: "300", mode: "none" }),
      paymentDate: "2026-11-02",
    },
  ];
  const bills = [
    bill({
      id: "b1",
      billDate: "2026-09-15",
      payments: [{ id: "p1", date: "2026-10-03", amount: "400" }],
    }),
    bill({
      id: "b2",
      billDate: "2026-10-15",
      payments: [{ id: "p2", date: "2026-11-05", amount: "1180" }],
    }),
  ];
  const incomes = [income("250", "2026-10-15")];
  const receipts = cashInFromInvoices(invoices, SELLER_STATE);
  const input = { receipts, incomes, expenses, purchases: bills };

  it("cash-in adapter agrees with the receivables register (total − balance due)", () => {
    const d = data(invoices);
    const collected = d.facts.reduce(
      (a, f) => a.plus(toDec(f.total).minus(f.balanceDue)),
      toDec(0),
    );
    const adapter = receipts.reduce((a, r) => a.plus(r.amount), toDec(0));
    expect(adapter.toFixed(2)).toBe(collected.toFixed(2));
    expect(receipts.find((r) => r.invoiceId === "i2")?.date).toBe("2026-10-20");
    expect(receipts.map((r) => r.invoiceId).sort()).toEqual(["i1", "i2"]);
    // Everything still owed is in the receivables ageing.
    const open = openInvoices(d, "2026-12-31").reduce((a, o) => a.plus(o.balance), toDec(0));
    const billed = d.facts.reduce((a, f) => a.plus(f.total), toDec(0));
    expect(billed.minus(adapter).toFixed(2)).toBe(open.toFixed(2));
  });

  it("builds months with opening/closing that chain", () => {
    const r = cashFlowReport(input, { start: "2026-10-01", end: "2026-11-30" });
    expect(r.months.map((m) => m.month)).toEqual(["2026-10", "2026-11"]);
    const [oct, nov] = r.months;
    // before October: + 11800 (i1 receipt)
    expect(oct.opening).toBe("11800.00");
    expect(oct.receipts).toBe("2000.00");
    expect(oct.otherIncome).toBe("250.00");
    expect(oct.expenses).toBe("1180.00");
    expect(oct.billPayments).toBe("400.00");
    expect(oct.net).toBe(toDec("2250").minus("1580").toFixed(2));
    expect(nov.opening).toBe(oct.closing);
    expect(nov.expenses).toBe("300.00"); // e3 paid in November
    expect(nov.billPayments).toBe("1180.00");
    expect(r.totals.opening).toBe(oct.opening);
    expect(r.totals.closing).toBe(nov.closing);
    expect(r.partialExpenses).toEqual({ count: 1, total: "500.00" });
  });

  it("reconciles with the registers", () => {
    const range = { start: "2026-04-01", end: "2027-03-31" };
    const r = cashFlowReport(input, range);
    // Money out = paid expenses (expense register) + bill payments (bill register).
    const paidExpenses = expenses
      .filter((e) => e.paymentStatus === "paid")
      .reduce((a, e) => a.plus(computeExpenseSummary(e).total), toDec(0));
    const billPaid = bills.reduce((a, b) => a.plus(b.summary.paid), toDec(0));
    expect(r.totals.expenses).toBe(paidExpenses.toFixed(2));
    expect(r.totals.billPayments).toBe(billPaid.toFixed(2));
    expect(r.totals.moneyOut).toBe(paidExpenses.plus(billPaid).toFixed(2));
    // Money in = collected on invoices + other income.
    const collected = data(invoices).facts.reduce(
      (a, f) => a.plus(toDec(f.total).minus(f.balanceDue)),
      toDec(0),
    );
    expect(r.totals.moneyIn).toBe(collected.plus("250").toFixed(2));
    // Sum of months equals totals.
    const sum = (k: "moneyIn" | "moneyOut" | "net") =>
      r.months.reduce((a, m) => a.plus(m[k]), toDec(0)).toFixed(2);
    expect(sum("moneyIn")).toBe(r.totals.moneyIn);
    expect(sum("moneyOut")).toBe(r.totals.moneyOut);
    expect(sum("net")).toBe(r.totals.net);
    expect(r.totals.closing).toBe(toDec(r.totals.opening).plus(r.totals.net).toFixed(2));
  });

  it("counts an expense that was also posted as a bill only once", () => {
    const e = exp({ id: "dup", date: "2026-10-12", amount: "1000" });
    const b = bill({
      id: "bb",
      expenseId: "dup",
      billDate: "2026-10-12",
      payments: [{ id: "p", date: "2026-10-12", amount: "1180" }],
    });
    const r = cashFlowReport(
      { receipts: [], incomes: [], expenses: [e], purchases: [b] },
      { start: "2026-10-01", end: "2026-10-31" },
    );
    expect(r.totals.moneyOut).toBe("1180.00");
  });

  it("an empty book is all zeros", () => {
    const r = cashFlowReport(
      { receipts: [], incomes: [], expenses: [], purchases: [] },
      { start: "2026-10-01", end: "2026-10-31" },
    );
    expect(r.totals.net).toBe("0.00");
    expect(r.months).toHaveLength(1);
  });
});

describe("30/60/90 day outlook", () => {
  it("is cumulative and includes overdue items", () => {
    const rows = cashOutlook(
      [
        { dueDate: "2026-11-10", balance: "1000.00" }, // overdue
        { dueDate: "2026-12-10", balance: "500.00" }, // 20 days
        { dueDate: "2027-01-10", balance: "250.00" }, // 51 days
      ],
      [
        { dueDate: "2026-12-15", balance: "300.00" }, // 25 days
        { dueDate: "2027-02-01", balance: "400.00" }, // 73 days
      ],
      TODAY,
    );
    expect(rows).toEqual([
      { days: 30, receivables: "1500.00", payables: "300.00", net: "1200.00" },
      { days: 60, receivables: "1750.00", payables: "300.00", net: "1450.00" },
      { days: 90, receivables: "1750.00", payables: "700.00", net: "1050.00" },
    ]);
  });
});
