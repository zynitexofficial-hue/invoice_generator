/**
 * Pure helpers for the analytics page and dashboard: URL period parsing,
 * compare-to resolution, trend month windows, drill-down filter mapping,
 * filing deadlines and small aggregations not covered by the analytics
 * engine. No React, no IndexedDB.
 */
import {
  OTHER_KEY,
  d2,
  previousOf,
  resolveRange,
  sliceData,
  type AnalyticsData,
  type Breakdown,
  type BreakdownItem,
  type DateRange,
  type FilingDeadline,
  type InvoiceFact,
  type PeriodSelector,
  type Register,
  type RegisterFilter,
  type SupplyClass,
} from "@/lib/analytics";
import { dueDate, upcomingDeadlines, settingsStateCode } from "@/lib/gst/returns";
import { ZERO, toDec, type Dec } from "@/lib/money";
import {
  monthKey,
  monthsInPeriod,
  periodKind,
  periodLabel,
  quarterKey,
  shiftPeriod,
} from "@/lib/period";
import {
  filingId,
  type AppSettings,
  type Filing,
  type FilingStatus,
  type ReturnType,
} from "@/lib/schema";
import {
  isPeriodPreset,
  resolvePeriod,
  type PeriodPreset,
  type PeriodSelection,
} from "@/components/money/money-data";

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export const ANALYTICS_TABS = [
  "overview",
  "sales",
  "expenses",
  "gst",
  "receivables",
  "registers",
  // Phase 2-4 tabs (stubs until their feature lands; see plans/PHASE2-4-OWNERSHIP.md)
  "collections",
  "payables",
  "itc",
  "yoy",
] as const;
export type AnalyticsTab = (typeof ANALYTICS_TABS)[number];

export const ANALYTICS_TAB_LABELS: Record<AnalyticsTab, string> = {
  overview: "Overview",
  sales: "Sales",
  expenses: "Expenses",
  gst: "GST",
  receivables: "Receivables",
  registers: "Registers",
  collections: "Collections",
  payables: "Payables & cash flow",
  itc: "ITC reconciliation",
  yoy: "Year over year",
};

export function parseTab(v: string | null | undefined): AnalyticsTab {
  return (ANALYTICS_TABS as readonly string[]).includes(v ?? "") ? (v as AnalyticsTab) : "overview";
}

/* ------------------------------------------------------------------ */
/* Period in the URL                                                   */
/* ------------------------------------------------------------------ */

const ISO_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const QUARTER_RE = /^\d{4}-Q[1-4]$/;
const FY_RE = /^FY\d{4}-\d{2}$/;

export function isPeriodKey(v: string): boolean {
  if (MONTH_RE.test(v) || QUARTER_RE.test(v)) return true;
  if (!FY_RE.test(v)) return false;
  const start = Number(v.slice(2, 6));
  return Number(v.slice(7)) === (start + 1) % 100;
}

/** The analytics period: what the filter shows plus the resolved selector. */
export interface AnalyticsPeriod {
  /** Value for <PeriodFilter>. */
  selection: PeriodSelection;
  /** Period key or inclusive range passed to the analytics engine. */
  selector: PeriodSelector;
  range: DateRange;
  /** Human label ("Nov 2026", "FY 2026-27", "1 Apr 2026 – 30 Jun 2026"). */
  label: string;
  /** Value for the `?period=` URL parameter. */
  param: string;
}

const PRESET_FOR_KEY = (key: string, todayISO: string): PeriodPreset | null => {
  for (const p of ["this_month", "last_month", "this_quarter", "this_fy", "last_fy"] as const)
    if (resolvePeriod({ preset: p, from: "", to: "" }, todayISO).key === key) return p;
  return null;
};

/**
 * Parse `?period=`: a preset id ("this_month"), a period key ("2026-10",
 * "2026-Q3", "FY2026-27") or an inclusive ISO range ("2026-04-01..2026-06-30").
 * Anything else → this month.
 */
export function parsePeriodParam(
  param: string | null | undefined,
  todayISO: string,
  formatDate: (iso: string) => string = (iso) => iso,
): AnalyticsPeriod {
  const raw = (param ?? "").trim();
  if (isPeriodPreset(raw) && raw !== "custom") {
    return fromSelection({ preset: raw, from: "", to: "" }, todayISO, formatDate);
  }
  if (isPeriodKey(raw)) {
    const preset = PRESET_FOR_KEY(raw, todayISO);
    if (preset) {
      const p = fromSelection({ preset, from: "", to: "" }, todayISO, formatDate);
      return { ...p, param: raw };
    }
    const range = resolveRange(raw);
    return {
      selection: { preset: "custom", from: range.start, to: range.end },
      selector: raw,
      range,
      label: periodLabel(raw),
      param: raw,
    };
  }
  const m = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/.exec(raw);
  if (m && (!m[1] || ISO_RE.test(m[1])) && (!m[2] || ISO_RE.test(m[2]))) {
    return fromSelection(
      { preset: "custom", from: m[1] ?? "", to: m[2] ?? "" },
      todayISO,
      formatDate,
    );
  }
  return fromSelection({ preset: "this_month", from: "", to: "" }, todayISO, formatDate);
}

/** Earliest date used when a custom range has no start. */
export const OPEN_START = "2017-07-01"; // GST came into force

/** Resolve a filter selection into an analytics period. */
export function fromSelection(
  selection: PeriodSelection,
  todayISO: string,
  formatDate: (iso: string) => string = (iso) => iso,
): AnalyticsPeriod {
  const r = resolvePeriod(selection, todayISO);
  if (r.key) {
    return {
      selection,
      selector: r.key,
      range: { start: r.start, end: r.end },
      label: periodLabel(r.key),
      param: selection.preset,
    };
  }
  const start = r.start || OPEN_START;
  const end = r.end || (todayISO >= start ? todayISO : start);
  const range = { start, end };
  const label =
    r.start && r.end
      ? `${formatDate(start)} – ${formatDate(end)}`
      : r.start
        ? `From ${formatDate(start)}`
        : r.end
          ? `Until ${formatDate(end)}`
          : "All dates";
  return { selection, selector: range, range, label, param: `${r.start}..${r.end}` };
}

/* ------------------------------------------------------------------ */
/* Compare to                                                          */
/* ------------------------------------------------------------------ */

export const COMPARE_MODES = ["previous", "year", "none"] as const;
export type CompareMode = (typeof COMPARE_MODES)[number];

export const COMPARE_LABELS: Record<CompareMode, string> = {
  previous: "Previous period",
  year: "Same period last year",
  none: "No comparison",
};

export function parseCompare(v: string | null | undefined): CompareMode {
  return (COMPARE_MODES as readonly string[]).includes(v ?? "") ? (v as CompareMode) : "previous";
}

/** Same calendar date one year earlier (29 Feb → 28 Feb). */
export function minusOneYear(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const yy = y - 1;
  const last = new Date(Date.UTC(yy, m, 0)).getUTCDate();
  return `${yy}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The comparison period for a mode, or null for "none". */
export function resolveCompare(period: PeriodSelector, mode: CompareMode): PeriodSelector | null {
  if (mode === "none") return null;
  if (mode === "previous") return previousOf(period);
  if (typeof period === "string") {
    const kind = periodKind(period);
    return shiftPeriod(period, kind === "month" ? -12 : kind === "quarter" ? -4 : -1);
  }
  return { start: minusOneYear(period.start), end: minusOneYear(period.end) };
}

/** Wording after "vs" for a comparison ("last month", "Oct 2025", "previous period"). */
export function compareText(
  period: PeriodSelector,
  mode: CompareMode,
  todayISO: string,
): string | null {
  const other = resolveCompare(period, mode);
  if (!other) return null;
  if (typeof other === "string") {
    if (mode === "previous" && typeof period === "string") {
      const kind = periodKind(period);
      const current = kind === "month" ? monthKey(todayISO) : null;
      if (current && period === current) return "last month";
    }
    return periodLabel(other);
  }
  return mode === "year" ? "same period last year" : "previous period";
}

/* ------------------------------------------------------------------ */
/* Trend windows                                                       */
/* ------------------------------------------------------------------ */

export const MAX_TREND_MONTHS = 24;

/** Month keys from the month of `start` to the month of `end`, inclusive. */
export function monthsBetween(start: string, end: string): string[] {
  const out: string[] = [];
  let m = monthKey(start);
  const last = monthKey(end);
  while (m <= last && out.length < 600) {
    out.push(m);
    m = shiftPeriod(m, 1);
  }
  return out;
}

/**
 * Months for trend charts: every month in the range (at most the last 24);
 * a single-month range shows the six months ending with it.
 */
export function trendMonths(range: DateRange, n = 6): string[] {
  const months = monthsBetween(range.start, range.end);
  if (months.length <= 1) {
    const end = months[0] ?? monthKey(range.end);
    return Array.from({ length: n }, (_, i) => shiftPeriod(end, i - n + 1));
  }
  return months.slice(-MAX_TREND_MONTHS);
}

/* ------------------------------------------------------------------ */
/* Drill-down                                                          */
/* ------------------------------------------------------------------ */

export type SalesDimension = "customer" | "state" | "type" | "hsn" | "item";

export const SALES_DIMENSION_LABELS: Record<SalesDimension, string> = {
  customer: "Customer",
  state: "Place of supply",
  type: "Supply type",
  hsn: "HSN/SAC",
  item: "Item",
};

export interface Drill {
  dimension: SalesDimension;
  key: string;
  label: string;
  /** Keys grouped under "Other". */
  groupedKeys?: string[];
}

export function drillFromItem(dimension: SalesDimension, item: BreakdownItem): Drill {
  return { dimension, key: item.key, label: item.label, groupedKeys: item.groupedKeys };
}

function factMatches(f: InvoiceFact, dimension: SalesDimension, keys: string[]): boolean {
  switch (dimension) {
    case "customer":
      return keys.includes(f.customerKey);
    case "state":
      return keys.includes(f.pos || "unknown");
    case "type":
      return keys.includes(f.supplyClass);
    case "hsn":
      return f.lines.some((l) => keys.includes(l.hsn || "none"));
    case "item":
      return f.lines.some((l) => keys.includes((l.name.trim() || "Unnamed item").toLowerCase()));
  }
}

/**
 * Register filter for a clicked chart segment. Single keys map straight onto
 * RegisterFilter fields; "Other" and item segments (which RegisterFilter
 * cannot express) become an explicit invoice-id list.
 */
export function drillToFilter(drill: Drill, facts: InvoiceFact[]): RegisterFilter {
  const isOther = drill.key === OTHER_KEY;
  if (!isOther) {
    switch (drill.dimension) {
      case "customer":
        return { customerKey: drill.key };
      case "state":
        if (drill.key !== "unknown") return { pos: drill.key };
        break;
      case "type":
        return { supplyClass: drill.key as SupplyClass };
      case "hsn":
        return { hsn: drill.key };
      case "item":
        break;
    }
  }
  const keys = isOther ? (drill.groupedKeys ?? []) : [drill.key];
  return {
    invoiceIds: facts.filter((f) => factMatches(f, drill.dimension, keys)).map((f) => f.id),
  };
}

export function drillText(drill: Drill): string {
  return `${SALES_DIMENSION_LABELS[drill.dimension]}: ${drill.label}`;
}

/** Keep only the rows whose id is in `ids`, recomputing the numeric totals. */
export function subsetRegister(reg: Register, ids: string[], skipTotals: number[] = []): Register {
  const keep = new Set(ids);
  const idx = reg.rowIds.map((id, i) => (keep.has(id) ? i : -1)).filter((i) => i >= 0);
  const rows = idx.map((i) => reg.rows[i]);
  const totals = reg.numeric.map((num, col) =>
    !num || skipTotals.includes(col)
      ? ""
      : d2(rows.reduce((s, r) => s.plus(toDec(r[col])), ZERO as Dec)),
  );
  totals[0] = `Total (${rows.length})`;
  return { ...reg, rows, rowIds: idx.map((i) => reg.rowIds[i]), totals };
}

/* ------------------------------------------------------------------ */
/* Expense helpers                                                     */
/* ------------------------------------------------------------------ */

/** Top vendors by cost (total − eligible ITC) within a period. */
export function expensesByVendor(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, { label: string; value: Dec; count: number }>();
  for (const e of sliceData(data, resolveRange(period)).expenses) {
    const label = e.vendorName || "No vendor";
    const key = label.toLowerCase();
    const a = map.get(key) ?? { label, value: ZERO, count: 0 };
    a.value = a.value.plus(toDec(e.cost));
    a.count++;
    map.set(key, a);
  }
  return finishBreakdown(map);
}

function finishBreakdown(
  map: Map<string, { label: string; value: Dec; count: number }>,
): Breakdown {
  let total = ZERO;
  for (const a of map.values()) total = total.plus(a.value);
  const items = [...map.entries()]
    .sort((a, b) => b[1].value.comparedTo(a[1].value) || a[1].label.localeCompare(b[1].label))
    .map(([key, a]) => ({
      key,
      label: a.label,
      value: d2(a.value),
      share: total.isZero() ? null : d2(a.value.dividedBy(total).times(100)),
      count: a.count,
    }));
  return { total: d2(total), items };
}

/** ITC split: eligible on normal purchases, reverse charge, and GST that cannot be claimed. */
export function itcSummary(data: AnalyticsData, period: PeriodSelector) {
  let normal = ZERO;
  let rcm = ZERO;
  let blocked = ZERO;
  for (const e of sliceData(data, resolveRange(period)).expenses) {
    const itc = toDec(e.eligibleItc.total);
    if (e.itcEligible) {
      if (e.reverseCharge) rcm = rcm.plus(itc);
      else normal = normal.plus(itc);
    } else blocked = blocked.plus(toDec(e.tax));
  }
  return { normal: d2(normal), rcm: d2(rcm), blocked: d2(blocked) };
}

/** Net taxable value by GST rate (lines of documents that charge GST). */
export function salesByRate(data: AnalyticsData, period: PeriodSelector): Breakdown {
  const map = new Map<string, { label: string; value: Dec; count: number }>();
  for (const f of sliceData(data, resolveRange(period)).facts) {
    if (!f.hasTax) continue;
    for (const l of f.lines) {
      const rate = toDec(l.rate).toString();
      const a = map.get(rate) ?? { label: `${rate}%`, value: ZERO, count: 0 };
      a.value = a.value.plus(toDec(l.taxable).times(f.sign));
      a.count++;
      map.set(rate, a);
    }
  }
  return finishBreakdown(map);
}

/* ------------------------------------------------------------------ */
/* Filing deadlines & status                                           */
/* ------------------------------------------------------------------ */

export const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  not_started: "Not started",
  data_ready: "Data ready",
  exported: "Exported",
  filed: "Filed",
};

export interface FilingRow {
  id: string;
  returnType: string;
  periodKey: string;
  periodLabel: string;
  dueDate: string;
  status: FilingStatus;
  overdue: boolean;
}

const filingStatus = (filings: Filing[], periodKey: string, type: string): FilingStatus => {
  const id = filingId(periodKey, type as ReturnType);
  return filings.find((f) => f.id === id)?.status ?? "not_started";
};

/** True when GST returns apply (regular registration). */
export function filesGstReturns(settings: AppSettings): boolean {
  return settings.gst.registered !== false && settings.gst.registrationType === "regular";
}

/**
 * GSTR-1 and GSTR-3B rows for the months (monthly) or quarters (QRMP) that
 * overlap `months`, with status from the filing tracker.
 */
export function filingRowsFor(
  settings: AppSettings,
  filings: Filing[],
  months: string[],
  todayISO: string,
): FilingRow[] {
  if (!filesGstReturns(settings)) return [];
  const frequency = settings.gst.filingFrequency;
  const opts = { frequency, stateCode: settingsStateCode(settings) };
  const periods = [
    ...new Set(months.map((m) => (frequency === "monthly" ? m : quarterKey(`${m}-01`)))),
  ];
  const rows: FilingRow[] = [];
  for (const p of periods) {
    // Only periods that have started; future returns are not due yet.
    if (resolveRange(p).start > todayISO) continue;
    for (const type of ["GSTR-1", "GSTR-3B"] as const) {
      const due = dueDate(type, p, opts);
      if (!due) continue;
      const status = filingStatus(filings, p, type);
      rows.push({
        id: filingId(p, type),
        returnType: type,
        periodKey: p,
        periodLabel: periodLabel(p),
        dueDate: due,
        status,
        overdue: status !== "filed" && due < todayISO,
      });
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
}

/**
 * Deadlines for insights: upcoming deadlines (with tracker status), plus
 * unfiled returns from the last two months that are past due — only for
 * periods with issued sales, so a new user is not flooded with alerts.
 */
export function insightDeadlines(
  settings: AppSettings,
  filings: Filing[],
  data: AnalyticsData,
  todayISO: string,
): FilingDeadline[] {
  if (!filesGstReturns(settings)) return [];
  const upcoming = upcomingDeadlines(settings, todayISO, 6).map((d) => ({
    label: `${d.returnType} for ${d.periodLabel}`,
    dueDate: d.dueDate,
    status: filingStatus(filings, d.periodKey, d.returnType),
  }));
  const thisMonth = monthKey(todayISO);
  const recent = [shiftPeriod(thisMonth, -2), shiftPeriod(thisMonth, -1)];
  const overdue = filingRowsFor(settings, filings, recent, todayISO)
    .filter((r) => r.overdue)
    .filter((r) => {
      const range = resolveRange(r.periodKey);
      return data.facts.some((f) => f.date >= range.start && f.date <= range.end);
    })
    .map((r) => ({
      label: `${r.returnType} for ${r.periodLabel}`,
      dueDate: r.dueDate,
      status: r.status,
    }));
  return [...overdue, ...upcoming];
}

/** The next unfiled deadline on or after today, with its tracker status. */
export function nextDeadline(settings: AppSettings, filings: Filing[], todayISO: string) {
  if (!filesGstReturns(settings)) return null;
  for (const d of upcomingDeadlines(settings, todayISO, 8)) {
    const status =
      d.returnType === "PMT-06" ? null : filingStatus(filings, d.periodKey, d.returnType);
    if (status === "filed") continue;
    return { ...d, status };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/** The month key when the period is a single month (for highlighting a bar), else null. */
export function selectedMonthKey(period: PeriodSelector): string | null {
  return typeof period === "string" && periodKind(period) === "month" ? period : null;
}

/** Months in a period key, or between a range's bounds. */
export function monthsOf(period: PeriodSelector): string[] {
  return typeof period === "string"
    ? monthsInPeriod(period)
    : monthsBetween(period.start, period.end);
}

/** Add `?period=` (and keep other params) to an /analytics link. */
export function withPeriod(href: string, periodParam: string, compare?: CompareMode): string {
  if (!href.startsWith("/analytics")) return href;
  const [path, query = ""] = href.split("?");
  const qs = new URLSearchParams(query);
  if (periodParam && periodParam !== "this_month") qs.set("period", periodParam);
  if (compare && compare !== "previous") qs.set("compare", compare);
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

/** Plain number for charts (display only). */
export const num = (v: string | null | undefined): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};
