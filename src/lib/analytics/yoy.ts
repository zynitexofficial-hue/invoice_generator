/**
 * Year-over-year comparison of two financial years. Built on computeMetrics so
 * it reconciles with the registers (sales register − notes = revenue; expense
 * register cost = expenses). Pure.
 */
import { ZERO, toDec } from "@/lib/money";
import { shiftPeriod } from "@/lib/period";
import { d2, resolveRange, sliceData, type AnalyticsData } from "./base";
import {
  compare,
  computeMetrics,
  growth,
  type MetricComparison,
  type PeriodMetrics,
} from "./metrics";
import { fyMonths, monthlyTrend, type TrendPoint } from "./trends";

export interface CustomerStats {
  /** Customers with at least one sale in the year. */
  active: number;
  /** Customers whose first sale ever falls in the year. */
  newCustomers: number;
  /** Active this year and also active in the previous year. */
  retained: number;
}

export interface YoyMonth {
  /** 1 = April … 12 = March. */
  index: number;
  label: string;
  current: TrendPoint;
  previous: TrendPoint;
}

export interface YoyResult {
  fyKey: string;
  previousFyKey: string;
  current: PeriodMetrics;
  previous: PeriodMetrics;
  growth: MetricComparison;
  customers: { current: CustomerStats; previous: CustomerStats; growth: string | null };
  months: YoyMonth[];
}

function activeCustomers(data: AnalyticsData, fyKey: string): Set<string> {
  const keys = new Set<string>();
  for (const f of sliceData(data, resolveRange(fyKey)).facts)
    if (f.kind === "sale") keys.add(f.customerKey);
  return keys;
}

export function computeYoy(data: AnalyticsData, fyKey: string, todayISO: string): YoyResult {
  const previousFyKey = shiftPeriod(fyKey, -1);
  const current = computeMetrics(data, fyKey, todayISO);
  const previous = computeMetrics(data, previousFyKey, todayISO);

  const curActive = activeCustomers(data, fyKey);
  const prevActive = activeCustomers(data, previousFyKey);
  const start = resolveRange(fyKey).start;
  const before = new Set<string>();
  for (const f of data.facts) if (f.kind === "sale" && f.date < start) before.add(f.customerKey);
  const prevStart = resolveRange(previousFyKey).start;
  const beforePrev = new Set<string>();
  for (const f of data.facts)
    if (f.kind === "sale" && f.date < prevStart) beforePrev.add(f.customerKey);
  const stats = (active: Set<string>, earlier: Set<string>, other: Set<string>): CustomerStats => ({
    active: active.size,
    newCustomers: [...active].filter((k) => !earlier.has(k)).length,
    retained: [...active].filter((k) => other.has(k)).length,
  });

  const cm = fyMonths(fyKey);
  const pm = fyMonths(previousFyKey);
  const ct = monthlyTrend(data, cm, todayISO);
  const pt = monthlyTrend(data, pm, todayISO);

  return {
    fyKey,
    previousFyKey,
    current,
    previous,
    growth: compare(current, previous),
    customers: {
      current: stats(curActive, before, prevActive),
      previous: stats(prevActive, beforePrev, new Set()),
      growth: growth(String(curActive.size), String(prevActive.size)),
    },
    months: ct.map((c, i) => ({
      index: i + 1,
      label: c.shortLabel,
      current: c,
      previous: pt[i],
    })),
  };
}

/** Sum of a TrendPoint field over the months (for reconciliation with the annual figure). */
export function sumTrend(
  points: TrendPoint[],
  field: "revenue" | "expenses" | "profit" | "outputTax" | "itc",
): string {
  return d2(points.reduce((a, p) => a.plus(toDec(p[field])), ZERO));
}
