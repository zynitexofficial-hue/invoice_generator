/**
 * Period metrics (definitions: plans/business-gst-suite.md §7.6, spec G4).
 *
 * Accrual based. Money values are INR fixed 2-dp strings; ratios are
 * percentages as 2-dp strings ("12.50" = 12.5 %), null when undefined.
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import { shiftPeriod } from "@/lib/period";
import {
  DATA_GAP_REASONS,
  addHeads,
  d2,
  headsToStrings,
  pct,
  previousPeriod,
  resolveRange,
  signed,
  sliceData,
  zeroHeads,
  type AnalyticsData,
  type DateRange,
  type DecHeads,
  type ExclusionReason,
  type HeadAmounts,
  type PeriodSelector,
} from "./base";
import { receivablesSummary } from "./receivables";

export interface TopCustomer {
  key: string;
  name: string;
  amount: string;
  /** Share of sales revenue (%). */
  share: string | null;
}

export interface DataCoverage {
  invoicesIncluded: number;
  invoicesExcluded: number;
  expensesIncluded: number;
  expensesExcluded: number;
  /** Invoices excluded because data is missing (exchange rate, date). */
  missingData: number;
  reasons: Partial<Record<ExclusionReason | "expense missing date", number>>;
}

export interface PeriodMetrics {
  range: DateRange;
  /** Sales invoices' taxable value (before notes). */
  grossSales: string;
  creditNotes: string;
  debitNotes: string;
  /** Taxable value of issued sales, − credit notes, + debit notes (INR). */
  salesRevenue: string;
  /** Net taxable value of documents that charge GST (denominator of the effective rate). */
  taxableTurnover: string;
  otherIncome: string;
  /** salesRevenue + otherIncome. */
  totalIncome: string;
  /** Taxable value + GST not claimable as ITC (= total − eligible ITC). */
  expenses: string;
  netProfit: string;
  netMargin: string | null;
  /** Output tax by head, net of notes. */
  outputTax: HeadAmounts;
  eligibleItc: {
    /** Eligible ITC on normal (forward-charge) purchases. */
    normal: HeadAmounts;
    /** ITC on reverse-charge purchases (claimable after paying the RCM tax). */
    rcm: HeadAmounts;
    total: HeadAmounts;
  };
  /** Tax payable in cash on reverse-charge purchases. */
  rcmLiability: HeadAmounts;
  /**
   * Per head: max(0, output − eligible ITC (normal + RCM)) + RCM liability.
   * No cross-head set-off — an estimate, not a return computation.
   */
  estimatedGstPayable: HeadAmounts;
  effectiveGstRate: string | null;
  itcCoverage: string | null;
  receivablesOutstanding: string;
  receivablesOverdue: string;
  topCustomer: TopCustomer | null;
  topCustomerShare: string | null;
  expenseRatio: string | null;
  counts: {
    invoices: number;
    creditNotes: number;
    debitNotes: number;
    expenses: number;
    incomes: number;
  };
  dataCoverage: DataCoverage;
}

const floor0 = (d: Dec) => (d.isNegative() ? ZERO : d);
const headTotal = (h: DecHeads) => h.cgst.plus(h.sgst).plus(h.igst);

/**
 * Metrics for a period key or custom range. Receivables are a point-in-time
 * figure as of `todayISO` (all issued sales up to today, regardless of period).
 */
export function computeMetrics(
  data: AnalyticsData,
  period: PeriodSelector,
  todayISO: string,
): PeriodMetrics {
  const range = resolveRange(period);
  const slice = sliceData(data, range);

  let gross = ZERO;
  let credit = ZERO;
  let debit = ZERO;
  let turnover = ZERO;
  let output = zeroHeads();
  const byCustomer = new Map<string, { name: string; amount: Dec }>();
  const counts = { invoices: 0, creditNotes: 0, debitNotes: 0, expenses: 0, incomes: 0 };

  for (const f of slice.facts) {
    const t = toDec(f.taxable);
    if (f.kind === "sale") {
      gross = gross.plus(t);
      counts.invoices++;
    } else if (f.kind === "credit_note") {
      credit = credit.plus(t);
      counts.creditNotes++;
    } else {
      debit = debit.plus(t);
      counts.debitNotes++;
    }
    if (f.hasTax) turnover = turnover.plus(t.times(f.sign));
    output = addHeads(
      output,
      { cgst: toDec(f.cgst), sgst: toDec(f.sgst), igst: toDec(f.igst) },
      f.sign,
    );
    const c = byCustomer.get(f.customerKey) ?? { name: f.customerName, amount: ZERO };
    c.amount = c.amount.plus(signed(f, "taxable"));
    byCustomer.set(f.customerKey, c);
  }
  const salesRevenue = gross.minus(credit).plus(debit);

  let otherIncome = ZERO;
  for (const i of slice.incomes) {
    otherIncome = otherIncome.plus(toDec(i.amount));
    counts.incomes++;
  }

  let expenses = ZERO;
  let itcNormal = zeroHeads();
  let itcRcm = zeroHeads();
  let rcmLiability = zeroHeads();
  for (const e of slice.expenses) {
    counts.expenses++;
    expenses = expenses.plus(toDec(e.cost));
    const itc = {
      cgst: toDec(e.eligibleItc.cgst),
      sgst: toDec(e.eligibleItc.sgst),
      igst: toDec(e.eligibleItc.igst),
    };
    if (e.reverseCharge) {
      itcRcm = addHeads(itcRcm, itc);
      rcmLiability = addHeads(rcmLiability, {
        cgst: toDec(e.cgst),
        sgst: toDec(e.sgst),
        igst: toDec(e.igst),
      });
    } else {
      itcNormal = addHeads(itcNormal, itc);
    }
  }
  const itcTotal = addHeads(itcNormal, itcRcm);
  const payable: DecHeads = {
    cgst: floor0(output.cgst.minus(itcTotal.cgst)).plus(rcmLiability.cgst),
    sgst: floor0(output.sgst.minus(itcTotal.sgst)).plus(rcmLiability.sgst),
    igst: floor0(output.igst.minus(itcTotal.igst)).plus(rcmLiability.igst),
  };

  const totalIncome = salesRevenue.plus(otherIncome);
  const netProfit = totalIncome.minus(expenses);

  let top: TopCustomer | null = null;
  const ranked = [...byCustomer.entries()].sort(
    (a, b) => b[1].amount.comparedTo(a[1].amount) || a[1].name.localeCompare(b[1].name),
  );
  if (ranked.length && ranked[0][1].amount.greaterThan(0)) {
    const [key, v] = ranked[0];
    top = {
      key,
      name: v.name,
      amount: d2(v.amount),
      share: salesRevenue.greaterThan(0) ? pct(v.amount, salesRevenue) : null,
    };
  }

  const reasons: DataCoverage["reasons"] = {};
  for (const x of slice.excluded) reasons[x.reason] = (reasons[x.reason] ?? 0) + 1;
  if (data.expensesExcluded.length) reasons["expense missing date"] = data.expensesExcluded.length;

  const recv = receivablesSummary(data, todayISO);

  return {
    range,
    grossSales: d2(gross),
    creditNotes: d2(credit),
    debitNotes: d2(debit),
    salesRevenue: d2(salesRevenue),
    taxableTurnover: d2(turnover),
    otherIncome: d2(otherIncome),
    totalIncome: d2(totalIncome),
    expenses: d2(expenses),
    netProfit: d2(netProfit),
    netMargin: totalIncome.isZero() ? null : pct(netProfit, totalIncome),
    outputTax: headsToStrings(output),
    eligibleItc: {
      normal: headsToStrings(itcNormal),
      rcm: headsToStrings(itcRcm),
      total: headsToStrings(itcTotal),
    },
    rcmLiability: headsToStrings(rcmLiability),
    estimatedGstPayable: headsToStrings(payable),
    effectiveGstRate: turnover.isZero() ? null : pct(headTotal(output), turnover),
    itcCoverage: headTotal(output).isZero() ? null : pct(headTotal(itcTotal), headTotal(output)),
    receivablesOutstanding: recv.outstanding,
    receivablesOverdue: recv.overdue,
    topCustomer: top,
    topCustomerShare: top?.share ?? null,
    expenseRatio: salesRevenue.isZero() ? null : pct(expenses, salesRevenue),
    counts,
    dataCoverage: {
      invoicesIncluded: slice.facts.length,
      invoicesExcluded: slice.excluded.length,
      expensesIncluded: slice.expenses.length,
      expensesExcluded: data.expensesExcluded.length,
      missingData: slice.excluded.filter((x) => DATA_GAP_REASONS.includes(x.reason)).length,
      reasons,
    },
  };
}

/** The period before `period`: previous key of the same kind, or a same-length range. */
export function previousOf(period: PeriodSelector): PeriodSelector {
  return previousPeriod(period, (k) => shiftPeriod(k, -1));
}

/** Growth % `(current − previous) / |previous|`; null when previous is zero. */
export function growth(current: string, previous: string): string | null {
  const g = growthExact(current, previous);
  return g === null ? null : d2(g);
}

/** Unrounded growth % (for threshold checks). */
export function growthExact(current: string, previous: string): Dec | null {
  const p = toDec(previous);
  if (p.isZero()) return null;
  return toDec(current).minus(p).dividedBy(p.abs()).times(100);
}

export interface MetricComparison {
  salesRevenue: string | null;
  otherIncome: string | null;
  totalIncome: string | null;
  expenses: string | null;
  netProfit: string | null;
  outputTax: string | null;
  eligibleItc: string | null;
  estimatedGstPayable: string | null;
}

export function compare(current: PeriodMetrics, previous: PeriodMetrics): MetricComparison {
  return {
    salesRevenue: growth(current.salesRevenue, previous.salesRevenue),
    otherIncome: growth(current.otherIncome, previous.otherIncome),
    totalIncome: growth(current.totalIncome, previous.totalIncome),
    expenses: growth(current.expenses, previous.expenses),
    netProfit: growth(current.netProfit, previous.netProfit),
    outputTax: growth(current.outputTax.total, previous.outputTax.total),
    eligibleItc: growth(current.eligibleItc.total.total, previous.eligibleItc.total.total),
    estimatedGstPayable: growth(
      current.estimatedGstPayable.total,
      previous.estimatedGstPayable.total,
    ),
  };
}

/** One-line definitions for tooltips (spec G4: every metric shows its definition). */
export const METRIC_DEFINITIONS = {
  salesRevenue:
    "Taxable value of issued invoices, bills of supply and exports (in ₹), minus credit notes, plus debit notes. Drafts, quotations and cancelled documents are excluded.",
  otherIncome: "Sum of income entries without an invoice (interest, commission, rent…).",
  expenses: "Taxable value of expenses plus any GST you cannot claim as input tax credit.",
  netProfit:
    "Sales revenue + other income − expenses. A simple management view, not a statutory P&L.",
  netMargin: "Net profit ÷ (sales revenue + other income). Shown as — when there is no revenue.",
  growth:
    "(This period − previous period) ÷ previous period. Shown as — when the previous period is zero.",
  outputTax: "CGST, SGST and IGST charged on your invoices, net of credit and debit notes.",
  eligibleItc:
    "GST on expenses marked ITC-eligible, split by head. Reverse-charge ITC is shown separately.",
  estimatedGstPayable:
    "Per head: output tax − eligible ITC (not below zero) plus reverse-charge tax. No cross-head set-off — an estimate only.",
  effectiveGstRate: "Output tax ÷ taxable turnover of documents that charge GST.",
  itcCoverage: "Eligible ITC ÷ output tax.",
  receivables:
    "Balance due on issued invoices, aged from the due date (or invoice date when there is none).",
  topCustomerShare: "Revenue from your largest customer ÷ total sales revenue.",
  expenseRatio: "Expenses ÷ sales revenue.",
  dataCoverage: "How many records were included, and why any were left out.",
} as const;

export type MetricId = keyof typeof METRIC_DEFINITIONS;

/** Convenience: current, previous and growth in one call. */
export function metricsWithComparison(
  data: AnalyticsData,
  period: PeriodSelector,
  todayISO: string,
  compareTo: PeriodSelector = previousOf(period),
) {
  const current = computeMetrics(data, period, todayISO);
  const previous = computeMetrics(data, compareTo, todayISO);
  return { current, previous, growth: compare(current, previous) };
}
