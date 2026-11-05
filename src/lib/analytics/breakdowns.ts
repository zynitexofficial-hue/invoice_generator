/**
 * Breakdowns for donut/bar charts. Sales breakdowns use net taxable value
 * (credit notes subtract, debit notes add); expense breakdowns use cost
 * (total − eligible ITC), so each breakdown sums to the matching metric.
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import {
  SUPPLY_CLASS_LABELS,
  d2,
  pct,
  resolveRange,
  sliceData,
  type AnalyticsData,
  type InvoiceFact,
  type PeriodSelector,
} from "./base";

export interface BreakdownItem {
  /** Stable key for drill-down filters ("__other" for the grouped remainder). */
  key: string;
  label: string;
  value: string;
  /** Share of the breakdown total (%), null when the total is zero. */
  share: string | null;
  /** Records contributing (invoices/notes/lines/expenses). */
  count: number;
  /** For "Other": the keys it groups. */
  groupedKeys?: string[];
}

export interface Breakdown {
  total: string;
  items: BreakdownItem[];
}

export const OTHER_KEY = "__other";
export const DEFAULT_TOP_N = 5;

interface Acc {
  label: string;
  value: Dec;
  count: number;
}

function finish(map: Map<string, Acc>): Breakdown {
  let total = ZERO;
  for (const a of map.values()) total = total.plus(a.value);
  const items = [...map.entries()]
    .map(([key, a]) => ({ key, label: a.label, value: a.value, count: a.count }))
    .sort((a, b) => b.value.comparedTo(a.value) || a.label.localeCompare(b.label))
    .map((x) => ({
      key: x.key,
      label: x.label,
      value: d2(x.value),
      share: pct(x.value, total),
      count: x.count,
    }));
  return { total: d2(total), items };
}

function add(map: Map<string, Acc>, key: string, label: string, value: Dec) {
  const a = map.get(key) ?? { label, value: ZERO, count: 0 };
  a.value = a.value.plus(value);
  a.count++;
  map.set(key, a);
}

/**
 * Keep the `n` largest items and fold the rest into one "Other" item.
 * Nothing is folded when at most n + 1 items exist (an "Other" of one is
 * just that item).
 */
export function topN(breakdown: Breakdown, n = DEFAULT_TOP_N, otherLabel = "Other"): Breakdown {
  if (breakdown.items.length <= n + 1) return breakdown;
  const head = breakdown.items.slice(0, n);
  const rest = breakdown.items.slice(n);
  const value = rest.reduce((s, i) => s.plus(toDec(i.value)), ZERO);
  const total = toDec(breakdown.total);
  return {
    total: breakdown.total,
    items: [
      ...head,
      {
        key: OTHER_KEY,
        label: otherLabel,
        value: d2(value),
        share: pct(value, total),
        count: rest.reduce((s, i) => s + i.count, 0),
        groupedKeys: rest.map((i) => i.key),
      },
    ],
  };
}

function facts(data: AnalyticsData, period: PeriodSelector): InvoiceFact[] {
  return sliceData(data, resolveRange(period)).facts;
}

const signedTaxable = (f: InvoiceFact) => toDec(f.taxable).times(f.sign);

export function expensesByCategory(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const e of sliceData(data, resolveRange(period)).expenses)
    add(map, e.category, e.category, toDec(e.cost));
  return finish(map);
}

export function salesByCustomer(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const f of facts(data, period)) add(map, f.customerKey, f.customerName, signedTaxable(f));
  return finish(map);
}

export function salesByState(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const f of facts(data, period)) add(map, f.pos || "unknown", f.posName, signedTaxable(f));
  return finish(map);
}

export function salesByType(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const f of facts(data, period))
    add(map, f.supplyClass, SUPPLY_CLASS_LABELS[f.supplyClass], signedTaxable(f));
  return finish(map);
}

/** By HSN/SAC code (lines without a code are grouped as "No HSN/SAC"). */
export function salesByHsn(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const f of facts(data, period))
    for (const l of f.lines) {
      const key = l.hsn || "none";
      add(map, key, l.hsn || "No HSN/SAC", toDec(l.taxable).times(f.sign));
    }
  return finish(map);
}

/** By item name (case-insensitive). */
export function salesByItem(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, Acc>();
  for (const f of facts(data, period))
    for (const l of f.lines) {
      const name = l.name.trim() || "Unnamed item";
      add(map, name.toLowerCase(), name, toDec(l.taxable).times(f.sign));
    }
  return finish(map);
}
