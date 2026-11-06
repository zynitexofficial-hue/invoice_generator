/**
 * Annual profit and loss for a financial year, built on the analytics engine so
 * it reconciles with the registers. A management view with a few manual
 * adjustments (stock, depreciation, other): NOT a statutory financial
 * statement. Draft: verify with your CA.
 */
import { computeMetrics, d2, resolveRange, sliceData, type AnalyticsData } from "@/lib/analytics";
import { ZERO, toDec } from "@/lib/money";
import type { AnnualInput } from "@/lib/schema";

export interface PnlLine {
  label: string;
  amount: string;
  /** Number of records behind the line. */
  count?: number;
}

export interface AnnualPnl {
  fyKey: string;
  sales: PnlLine[];
  netSales: string;
  otherIncome: PnlLine[];
  otherIncomeTotal: string;
  totalIncome: string;
  expenses: PnlLine[];
  expensesTotal: string;
  /** totalIncome − expensesTotal (equals analytics net profit). */
  managementProfit: string;
  adjustments: PnlLine[];
  /** Profit after the manual adjustments. */
  adjustedProfit: string;
  notes: string[];
}

export const PNL_NOTES = [
  "Management view on an accrual basis from your invoices, expenses and income entries; not a statutory financial statement.",
  "Expenses are shown at taxable value plus any GST you cannot claim back as ITC.",
  "Stock change = opening stock − closing stock (a fall in stock adds to cost). Enter depreciation and other adjustments from your CA's working.",
];

export function buildAnnualPnl(
  data: AnalyticsData,
  fyKey: string,
  input: Pick<AnnualInput, "pnl"> | null | undefined,
  todayISO: string,
): AnnualPnl {
  const m = computeMetrics(data, fyKey, todayISO);
  const slice = sliceData(data, resolveRange(fyKey));

  const byCategory = new Map<string, { amount: typeof ZERO; count: number }>();
  for (const e of slice.expenses) {
    const c = byCategory.get(e.category) ?? { amount: ZERO, count: 0 };
    c.amount = c.amount.plus(toDec(e.cost));
    c.count++;
    byCategory.set(e.category, c);
  }
  const expenses = [...byCategory.entries()]
    .sort((a, b) => b[1].amount.comparedTo(a[1].amount) || a[0].localeCompare(b[0]))
    .map(([label, v]) => ({ label, amount: d2(v.amount), count: v.count }));

  const incomeByCat = new Map<string, { amount: typeof ZERO; count: number }>();
  for (const i of slice.incomes) {
    const c = incomeByCat.get(i.category) ?? { amount: ZERO, count: 0 };
    c.amount = c.amount.plus(toDec(i.amount));
    c.count++;
    incomeByCat.set(i.category, c);
  }
  const otherIncome = [...incomeByCat.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, v]) => ({ label, amount: d2(v.amount), count: v.count }));

  const p = input?.pnl;
  const opening = toDec(p?.openingStock);
  const closing = toDec(p?.closingStock);
  const stockChange = opening.minus(closing);
  const dep = toDec(p?.depreciation);
  const other = toDec(p?.otherAdjustments);
  const adjustments: PnlLine[] = [
    { label: "Change in stock (opening − closing)", amount: d2(stockChange) },
    { label: "Depreciation", amount: d2(dep) },
    { label: "Other adjustments (positive = extra cost)", amount: d2(other) },
  ];
  const adjusted = toDec(m.netProfit).minus(stockChange).minus(dep).minus(other);

  return {
    fyKey,
    sales: [
      { label: "Sales (taxable value)", amount: m.grossSales, count: m.counts.invoices },
      { label: "Less: credit notes", amount: m.creditNotes, count: m.counts.creditNotes },
      { label: "Add: debit notes", amount: m.debitNotes, count: m.counts.debitNotes },
    ],
    netSales: m.salesRevenue,
    otherIncome,
    otherIncomeTotal: m.otherIncome,
    totalIncome: m.totalIncome,
    expenses,
    expensesTotal: m.expenses,
    managementProfit: m.netProfit,
    adjustments,
    adjustedProfit: d2(adjusted),
    notes: PNL_NOTES,
  };
}

/** Flat rows for CSV: section, line, amount. */
export function pnlCsvRows(p: AnnualPnl): string[][] {
  const rows: string[][] = [];
  for (const l of p.sales) rows.push(["Income", l.label, l.amount]);
  rows.push(["Income", "Net sales", p.netSales]);
  for (const l of p.otherIncome) rows.push(["Income", `Other income: ${l.label}`, l.amount]);
  rows.push(["Income", "Total income", p.totalIncome]);
  for (const l of p.expenses) rows.push(["Expenses", l.label, l.amount]);
  rows.push(["Expenses", "Total expenses", p.expensesTotal]);
  rows.push(["Result", "Profit (management view)", p.managementProfit]);
  for (const l of p.adjustments) rows.push(["Adjustments", l.label, l.amount]);
  rows.push(["Result", "Profit after adjustments", p.adjustedProfit]);
  return rows;
}
