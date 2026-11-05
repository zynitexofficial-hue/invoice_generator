/**
 * Deterministic insights (spec G5). Same input → same output, same order.
 * Thresholds are strict ("more than"): a change of exactly 20 % does not fire.
 */
import { toDec } from "@/lib/money";
import { formatMoney } from "@/lib/format";
import { daysBetween } from "./base";
import { growthExact, type PeriodMetrics } from "./metrics";

export const REVENUE_CHANGE_THRESHOLD_PCT = 20;
export const EXPENSE_CHANGE_THRESHOLD_PCT = 20;
export const TOP_CUSTOMER_SHARE_THRESHOLD_PCT = 40;
export const OVERDUE_SHARE_THRESHOLD_PCT = 30;
export const FILING_DUE_WITHIN_DAYS = 5;
export const DASHBOARD_INSIGHT_LIMIT = 3;

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export const SEVERITY_ORDER: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  positive: 2,
  info: 3,
};

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  action?: { label: string; href: string };
}

export interface FilingDeadline {
  label: string;
  /** ISO date. */
  dueDate: string;
  /** Filing status; "filed" deadlines never produce an insight. */
  status: string;
}

export interface InsightInput {
  current: PeriodMetrics;
  /** Comparison period; growth rules are skipped without it. */
  previous?: PeriodMetrics;
  deadlines?: FilingDeadline[];
  todayISO: string;
  /** Wording for the comparison ("last month"). */
  previousLabel?: string;
}

const inr = (v: string) => formatMoney(v, "INR");
const pctText = (v: string) => `${Number(toDec(v).abs().toFixed(1))}%`;

/** All insights that apply, sorted by severity (stable within a severity), capped at `limit`. */
export function buildInsights(input: InsightInput, limit = Infinity): Insight[] {
  const { current: c, previous: p, todayISO } = input;
  const vs = input.previousLabel ?? "the previous period";
  const out: Insight[] = [];

  // Filing due soon / overdue.
  for (const d of input.deadlines ?? []) {
    if (d.status === "filed" || !d.dueDate) continue;
    const days = daysBetween(todayISO, d.dueDate);
    if (days < 0) {
      out.push({
        id: `filing-overdue:${d.label}:${d.dueDate}`,
        severity: "critical",
        title: `${d.label} is overdue`,
        detail: `It was due on ${d.dueDate} (${days * -1} day${days === -1 ? "" : "s"} ago). Late fees and interest may apply.`,
        action: { label: "Open GST returns", href: "/returns" },
      });
    } else if (days <= FILING_DUE_WITHIN_DAYS) {
      out.push({
        id: `filing-due:${d.label}:${d.dueDate}`,
        severity: "warning",
        title:
          days === 0
            ? `${d.label} is due today`
            : `${d.label} is due in ${days} day${days === 1 ? "" : "s"}`,
        detail: `Due on ${d.dueDate}. Review your records and export the return data.`,
        action: { label: "Open GST returns", href: "/returns" },
      });
    }
  }

  // Net profit negative.
  if (toDec(c.netProfit).isNegative()) {
    out.push({
      id: "profit-negative",
      severity: "critical",
      title: "Expenses are higher than income",
      detail: `Net loss of ${inr(toDec(c.netProfit).abs().toFixed(2))} this period (income ${inr(c.totalIncome)}, expenses ${inr(c.expenses)}).`,
      action: { label: "Review expenses", href: "/analytics?tab=expenses" },
    });
  }

  // Overdue share of receivables.
  const outstanding = toDec(c.receivablesOutstanding);
  if (outstanding.greaterThan(0)) {
    const share = toDec(c.receivablesOverdue).dividedBy(outstanding).times(100);
    if (share.greaterThan(OVERDUE_SHARE_THRESHOLD_PCT)) {
      out.push({
        id: "overdue-share",
        severity: "warning",
        title: `${pctText(share.toFixed(2))} of receivables are overdue`,
        detail: `${inr(c.receivablesOverdue)} of ${inr(c.receivablesOutstanding)} outstanding is past due. Follow up with these customers.`,
        action: { label: "See receivables", href: "/analytics?tab=receivables" },
      });
    }
  }

  // Growth rules.
  if (p) {
    const rev = growthExact(c.salesRevenue, p.salesRevenue);
    if (rev !== null && rev.abs().greaterThan(REVENUE_CHANGE_THRESHOLD_PCT)) {
      const up = rev.isPositive();
      out.push({
        id: up ? "revenue-up" : "revenue-down",
        severity: up ? "positive" : "warning",
        title: `Sales ${up ? "up" : "down"} ${pctText(rev.toFixed(2))} vs ${vs}`,
        detail: `${inr(c.salesRevenue)} this period against ${inr(p.salesRevenue)}.`,
        action: { label: "See sales", href: "/analytics?tab=sales" },
      });
    }
    const exp = growthExact(c.expenses, p.expenses);
    if (exp !== null && exp.greaterThan(EXPENSE_CHANGE_THRESHOLD_PCT)) {
      out.push({
        id: "expenses-up",
        severity: "warning",
        title: `Expenses up ${pctText(exp.toFixed(2))} vs ${vs}`,
        detail: `${inr(c.expenses)} this period against ${inr(p.expenses)}. Check which categories grew.`,
        action: { label: "See expenses", href: "/analytics?tab=expenses" },
      });
    }
  }

  // Customer concentration.
  if (
    c.topCustomer?.share &&
    toDec(c.topCustomer.share).greaterThan(TOP_CUSTOMER_SHARE_THRESHOLD_PCT)
  ) {
    out.push({
      id: "customer-concentration",
      severity: "info",
      title: `${c.topCustomer.name} is ${pctText(c.topCustomer.share)} of sales`,
      detail: `Relying on one customer for more than ${TOP_CUSTOMER_SHARE_THRESHOLD_PCT}% of sales is a risk if they slow down or pay late.`,
      action: { label: "See sales by customer", href: "/analytics?tab=sales" },
    });
  }

  // Records left out for missing data.
  if (c.dataCoverage.missingData > 0) {
    const n = c.dataCoverage.missingData;
    out.push({
      id: "missing-data",
      severity: "warning",
      title: `${n} invoice${n === 1 ? "" : "s"} left out of these figures`,
      detail:
        "Some invoices are missing data needed for reporting (for example an exchange rate on a foreign-currency invoice). Add it to include them.",
      action: { label: "Open history", href: "/history" },
    });
  }

  return out
    .map((x, i) => ({ x, i }))
    .sort((a, b) => SEVERITY_ORDER[a.x.severity] - SEVERITY_ORDER[b.x.severity] || a.i - b.i)
    .map(({ x }) => x)
    .slice(0, limit);
}

/** Dashboard variant: the top `limit` (default 3). */
export function dashboardInsights(input: InsightInput, limit = DASHBOARD_INSIGHT_LIMIT) {
  return buildInsights(input, limit);
}
