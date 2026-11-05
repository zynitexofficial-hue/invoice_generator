/** Monthly series for trend charts. */
import { monthsInPeriod, periodLabel, shiftPeriod } from "@/lib/period";
import type { AnalyticsData } from "./base";
import { computeMetrics } from "./metrics";

export interface TrendPoint {
  /** "YYYY-MM" */
  month: string;
  /** "Oct 2026" */
  label: string;
  /** "Oct" — for narrow axes. */
  shortLabel: string;
  revenue: string;
  otherIncome: string;
  expenses: string;
  profit: string;
  outputTax: string;
  itc: string;
}

/** The last `n` calendar months ending with the month of `todayISO`, oldest first. */
export function lastNMonths(todayISO: string, n: number): string[] {
  const end = todayISO.slice(0, 7);
  return Array.from({ length: Math.max(0, n) }, (_, i) => shiftPeriod(end, i - n + 1));
}

/** The 12 months of a financial year key ("FY2026-27"). */
export function fyMonths(fyKey: string): string[] {
  return monthsInPeriod(fyKey);
}

/** Revenue, expenses, profit, output tax and ITC for each month key. */
export function monthlyTrend(
  data: AnalyticsData,
  months: string[],
  todayISO: string,
): TrendPoint[] {
  return months.map((month) => {
    const m = computeMetrics(data, month, todayISO);
    const label = periodLabel(month);
    return {
      month,
      label,
      shortLabel: label.slice(0, 3),
      revenue: m.salesRevenue,
      otherIncome: m.otherIncome,
      expenses: m.expenses,
      profit: m.netProfit,
      outputTax: m.outputTax.total,
      itc: m.eligibleItc.total.total,
    };
  });
}
