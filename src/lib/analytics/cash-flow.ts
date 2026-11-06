/**
 * Cash-flow report (what actually moved, not what was billed).
 *
 * Money in  = customer receipts (see cash-in-source.ts) + other income.
 * Money out = expenses marked paid (on the payment date, else the expense
 *             date) + payments recorded on purchase bills.
 *
 * Notes on what is and is not counted:
 * - "Partly paid" expenses do not record how much was paid, so they are left
 *   out and reported in `partialExpenses` until they are marked paid.
 * - An expense that was also posted as a purchase bill (bill.expenseId) is
 *   counted once, through the bill's payments.
 * - There is no bank balance in the app: "opening" is the net of everything
 *   recorded before the period, "closing" is opening + net.
 */
import { computeExpenseSummary } from "@/lib/expense-calc";
import { Dec, ZERO, toDec } from "@/lib/money";
import { monthKey, periodLabel, shiftPeriod } from "@/lib/period";
import type { Expense, Income, Purchase } from "@/lib/schema";
import { addDays, d2, type DateRange } from "./base";
import type { CashInEntry } from "./cash-in-source";

export interface CashFlowInput {
  receipts: readonly CashInEntry[];
  incomes: readonly Income[];
  expenses: readonly Expense[];
  purchases: readonly Purchase[];
}

export interface CashFlowMonth {
  month: string;
  label: string;
  /** Customer receipts. */
  receipts: string;
  otherIncome: string;
  moneyIn: string;
  /** Expenses paid. */
  expenses: string;
  /** Payments on purchase bills. */
  billPayments: string;
  moneyOut: string;
  net: string;
  opening: string;
  closing: string;
}

export interface CashFlowReport {
  range: DateRange;
  months: CashFlowMonth[];
  totals: Omit<CashFlowMonth, "month" | "label">;
  /** Partly-paid expenses in the range that are not counted (amount paid unknown). */
  partialExpenses: { count: number; total: string };
}

interface Flow {
  date: string;
  kind: "receipts" | "otherIncome" | "expenses" | "billPayments";
  amount: Dec;
}

/** All dated cash movements, positive amounts. */
export function cashMovements(input: CashFlowInput): {
  flows: Flow[];
  partial: { date: string; amount: Dec }[];
} {
  const flows: Flow[] = [];
  const partial: { date: string; amount: Dec }[] = [];
  for (const r of input.receipts)
    if (r.date) flows.push({ date: r.date, kind: "receipts", amount: toDec(r.amount) });
  for (const i of input.incomes)
    if (i.date) flows.push({ date: i.date, kind: "otherIncome", amount: toDec(i.amount) });

  const postedAsBill = new Set(input.purchases.map((p) => p.expenseId).filter(Boolean));
  for (const e of input.expenses) {
    if (!e.date || postedAsBill.has(e.id)) continue;
    const total = toDec(computeExpenseSummary(e).total);
    if (e.paymentStatus === "paid")
      flows.push({ date: e.paymentDate || e.date, kind: "expenses", amount: total });
    else if (e.paymentStatus === "partial") partial.push({ date: e.date, amount: total });
  }
  for (const p of input.purchases)
    for (const pay of p.payments)
      if (pay.date) flows.push({ date: pay.date, kind: "billPayments", amount: toDec(pay.amount) });
  return { flows, partial };
}

const isIn = (k: Flow["kind"]) => k === "receipts" || k === "otherIncome";

function monthsOf(range: DateRange): string[] {
  const out: string[] = [];
  let m = monthKey(range.start);
  const last = monthKey(range.end);
  while (m <= last && out.length < 600) {
    out.push(m);
    m = shiftPeriod(m, 1);
  }
  return out;
}

function sumKinds(flows: Flow[]) {
  const t = { receipts: ZERO, otherIncome: ZERO, expenses: ZERO, billPayments: ZERO };
  for (const f of flows) t[f.kind] = t[f.kind].plus(f.amount);
  const moneyIn = t.receipts.plus(t.otherIncome);
  const moneyOut = t.expenses.plus(t.billPayments);
  return { ...t, moneyIn, moneyOut, net: moneyIn.minus(moneyOut) };
}

const strings = (s: ReturnType<typeof sumKinds>, opening: Dec) => ({
  receipts: d2(s.receipts),
  otherIncome: d2(s.otherIncome),
  moneyIn: d2(s.moneyIn),
  expenses: d2(s.expenses),
  billPayments: d2(s.billPayments),
  moneyOut: d2(s.moneyOut),
  net: d2(s.net),
  opening: d2(opening),
  closing: d2(opening.plus(s.net)),
});

export function cashFlowReport(input: CashFlowInput, range: DateRange): CashFlowReport {
  const { flows, partial } = cashMovements(input);
  const before = flows.filter((f) => f.date < range.start);
  const inside = flows.filter((f) => f.date >= range.start && f.date <= range.end);
  const opening = before.reduce(
    (acc, f) => (isIn(f.kind) ? acc.plus(f.amount) : acc.minus(f.amount)),
    ZERO,
  );

  let running = opening;
  const months: CashFlowMonth[] = monthsOf(range).map((month) => {
    const rows = inside.filter((f) => f.date.slice(0, 7) === month);
    const s = sumKinds(rows);
    const open = running;
    running = running.plus(s.net);
    return { month, label: periodLabel(month), ...strings(s, open) };
  });

  const partialIn = partial.filter((p) => p.date >= range.start && p.date <= range.end);
  return {
    range,
    months,
    totals: strings(sumKinds(inside), opening),
    partialExpenses: {
      count: partialIn.length,
      total: d2(partialIn.reduce((a, p) => a.plus(p.amount), ZERO)),
    },
  };
}

/* ------------------------------------------------------------------ */
/* 30 / 60 / 90 day outlook                                            */
/* ------------------------------------------------------------------ */

export interface DueItem {
  /** Effective due date. */
  dueDate: string;
  balance: string;
}

export interface OutlookRow {
  days: number;
  /** Receivables due by then (overdue included). */
  receivables: string;
  /** Payables due by then (overdue included). */
  payables: string;
  /** receivables − payables. */
  net: string;
}

export const OUTLOOK_HORIZONS = [30, 60, 90] as const;

/**
 * What is expected to come in vs go out by each horizon, counting everything
 * already overdue plus items falling due within the next N days. Cumulative:
 * the 60-day row includes the 30-day row.
 */
export function cashOutlook(
  receivables: readonly DueItem[],
  payables: readonly DueItem[],
  todayISO: string,
  horizons: readonly number[] = OUTLOOK_HORIZONS,
): OutlookRow[] {
  const dueBy = (items: readonly DueItem[], limit: string) =>
    items.reduce((acc, i) => (i.dueDate <= limit ? acc.plus(toDec(i.balance)) : acc), ZERO);
  return horizons.map((days) => {
    const limit = addDays(todayISO, days);
    const r = dueBy(receivables, limit);
    const p = dueBy(payables, limit);
    return { days, receivables: d2(r), payables: d2(p), net: d2(r.minus(p)) };
  });
}
