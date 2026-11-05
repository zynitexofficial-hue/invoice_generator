/**
 * Pure helpers for the Money page (expenses & other income): period
 * resolution, filtering, totals and CSV rows. No React, no IndexedDB — easy
 * to test and reuse (dashboard, analytics, returns).
 */
import { PAYMENT_MODE_LABELS } from "@/lib/documents";
import { stateName } from "@/lib/gst/states";
import { sumDec, toDec, ZERO } from "@/lib/money";
import { currentPeriod, periodLabel, periodRange, shiftPeriod } from "@/lib/period";
import type { CsvCell } from "@/lib/csv";
import type { Expense, ExpenseGstMode, Income, ItcType } from "@/lib/schema";

/* ------------------------------------------------------------------ */
/* Periods                                                             */
/* ------------------------------------------------------------------ */

export const PERIOD_PRESETS = [
  "this_month",
  "last_month",
  "this_quarter",
  "this_fy",
  "last_fy",
  "custom",
] as const;
export type PeriodPreset = (typeof PERIOD_PRESETS)[number];

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  this_month: "This month",
  last_month: "Last month",
  this_quarter: "This quarter",
  this_fy: "This FY",
  last_fy: "Last FY",
  custom: "Custom range",
};

export interface PeriodSelection {
  preset: PeriodPreset;
  /** Custom range bounds (ISO dates); "" = open-ended. */
  from: string;
  to: string;
}

export const DEFAULT_PERIOD: PeriodSelection = { preset: "this_month", from: "", to: "" };

export interface ResolvedPeriod {
  /** Inclusive ISO bounds; "" = open-ended. */
  start: string;
  end: string;
  /** Period key (month / quarter / FY) for presets; "" for a custom range. */
  key: string;
}

export function isPeriodPreset(v: string | null | undefined): v is PeriodPreset {
  return Boolean(v) && (PERIOD_PRESETS as readonly string[]).includes(v as string);
}

/** Turn a preset (or custom range) into concrete dates for `todayISO`. */
export function resolvePeriod(sel: PeriodSelection, todayISO: string): ResolvedPeriod {
  let key = "";
  switch (sel.preset) {
    case "this_month":
      key = currentPeriod("month", todayISO);
      break;
    case "last_month":
      key = shiftPeriod(currentPeriod("month", todayISO), -1);
      break;
    case "this_quarter":
      key = currentPeriod("quarter", todayISO);
      break;
    case "this_fy":
      key = currentPeriod("fy", todayISO);
      break;
    case "last_fy":
      key = shiftPeriod(currentPeriod("fy", todayISO), -1);
      break;
    case "custom": {
      // Tolerate reversed bounds instead of showing nothing.
      const [start, end] =
        sel.from && sel.to && sel.from > sel.to ? [sel.to, sel.from] : [sel.from, sel.to];
      return { start, end, key: "" };
    }
  }
  return { ...periodRange(key), key };
}

/** "Nov 2026", "FY 2026-27", or the custom range via `formatDate`. */
export function periodText(period: ResolvedPeriod, formatDate: (iso: string) => string): string {
  if (period.key) return periodLabel(period.key);
  if (period.start && period.end) return `${formatDate(period.start)} – ${formatDate(period.end)}`;
  if (period.start) return `From ${formatDate(period.start)}`;
  if (period.end) return `Until ${formatDate(period.end)}`;
  return "All dates";
}

/** File-name friendly period: "2026-11", "FY2026-27", "2026-01-01_to_2026-03-31", "all". */
export function periodSlug(period: ResolvedPeriod): string {
  if (period.key) return period.key;
  if (!period.start && !period.end) return "all";
  return `${period.start || "start"}_to_${period.end || "today"}`;
}

export function inRange(dateISO: string, period: Pick<ResolvedPeriod, "start" | "end">): boolean {
  if (!dateISO) return !period.start && !period.end;
  if (period.start && dateISO < period.start) return false;
  if (period.end && dateISO > period.end) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* Expense facts                                                       */
/* ------------------------------------------------------------------ */

export type PaymentStatus = Expense["paymentStatus"];

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  paid: "Paid",
  unpaid: "Unpaid",
  partial: "Partly paid",
};

export const ITC_TYPE_LABELS: Record<ItcType, string> = {
  inputs: "Inputs (goods)",
  input_services: "Input services",
  capital_goods: "Capital goods",
  ineligible: "Ineligible (blocked)",
};

export const GST_MODE_LABELS: Record<ExpenseGstMode, string> = {
  none: "No GST",
  intra: "Intra-state (CGST + SGST)",
  inter: "Inter-state (IGST)",
};

export const hasGst = (e: Pick<Expense, "gstMode">) => e.gstMode !== "none";

/** GST on the bill (CGST + SGST + IGST) as a 2-dp string. */
export function expenseGst(e: Pick<Expense, "summary">): string {
  return sumDec([e.summary.cgst, e.summary.sgst, e.summary.igst].map(toDec)).toFixed(2);
}

/** True when the expense's GST counts as claimable input tax credit. */
export function claimsItc(e: Pick<Expense, "gstMode" | "itcEligible" | "itcType">): boolean {
  return hasGst(e) && e.itcEligible && e.itcType !== "ineligible";
}

/** Claimable ITC in rupees (2 dp): the bill's GST when ITC applies, otherwise 0. */
export function itcClaimable(e: Pick<Expense, "gstMode" | "itcEligible" | "itcType" | "summary">) {
  return claimsItc(e) ? expenseGst(e) : "0.00";
}

/* ------------------------------------------------------------------ */
/* Filtering & totals                                                  */
/* ------------------------------------------------------------------ */

export interface ExpenseFilters {
  period: Pick<ResolvedPeriod, "start" | "end">;
  /** "" = all categories. */
  category: string;
  gstOnly: boolean;
  itcOnly: boolean;
  status: PaymentStatus | "all";
}

export interface IncomeFilters {
  period: Pick<ResolvedPeriod, "start" | "end">;
  category: string;
}

/** Newest date first; same date → most recently created first. */
export function byDateDesc<T extends { date: string; createdAt: string }>(a: T, b: T): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
}

export function filterExpenses(list: readonly Expense[], f: ExpenseFilters): Expense[] {
  return list
    .filter((e) => {
      if (!inRange(e.date, f.period)) return false;
      if (f.category && e.category !== f.category) return false;
      if (f.gstOnly && !hasGst(e)) return false;
      if (f.itcOnly && !claimsItc(e)) return false;
      if (f.status !== "all" && e.paymentStatus !== f.status) return false;
      return true;
    })
    .sort(byDateDesc);
}

export function filterIncomes(list: readonly Income[], f: IncomeFilters): Income[] {
  return list
    .filter((i) => inRange(i.date, f.period) && (!f.category || i.category === f.category))
    .sort(byDateDesc);
}

export interface ExpenseTotals {
  count: number;
  taxable: string;
  gst: string;
  total: string;
  itc: string;
}

export function expenseTotals(list: readonly Expense[]): ExpenseTotals {
  let taxable = ZERO;
  let gst = ZERO;
  let total = ZERO;
  let itc = ZERO;
  for (const e of list) {
    taxable = taxable.plus(toDec(e.summary.taxable));
    gst = gst.plus(toDec(expenseGst(e)));
    total = total.plus(toDec(e.summary.total));
    itc = itc.plus(toDec(itcClaimable(e)));
  }
  return {
    count: list.length,
    taxable: taxable.toFixed(2),
    gst: gst.toFixed(2),
    total: total.toFixed(2),
    itc: itc.toFixed(2),
  };
}

export function incomeTotals(list: readonly Income[]): { count: number; total: string } {
  return { count: list.length, total: sumDec(list.map((i) => toDec(i.amount))).toFixed(2) };
}

/** Categories for a filter: configured ones first, then any extra names found in records. */
export function categoryOptions(configured: readonly string[], used: readonly string[]): string[] {
  const out = [...configured];
  const seen = new Set(configured);
  for (const c of used) {
    if (c && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

export interface VendorSuggestion {
  name: string;
  gstin: string;
  stateCode: string;
}

/** Distinct vendors (case-insensitive), most recent first, with their last GSTIN/state. */
export function vendorSuggestions(list: readonly Expense[]): VendorSuggestion[] {
  const seen = new Map<string, VendorSuggestion>();
  for (const e of [...list].sort(byDateDesc)) {
    const name = e.vendorName.trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (!seen.has(k)) seen.set(k, { name, gstin: e.vendorGstin, stateCode: e.vendorStateCode });
  }
  return [...seen.values()];
}

/* ------------------------------------------------------------------ */
/* CSV                                                                 */
/* ------------------------------------------------------------------ */

export const EXPENSE_CSV_HEADERS = [
  "Date",
  "Paid to",
  "Vendor GSTIN",
  "Vendor state",
  "Vendor invoice no",
  "Vendor invoice date",
  "Category",
  "Description",
  "GST rate (%)",
  "Supply",
  "Amount includes GST",
  "Taxable value",
  "CGST",
  "SGST",
  "IGST",
  "Total",
  "ITC eligible",
  "ITC type",
  "ITC claimable",
  "Reverse charge",
  "Payment status",
  "Payment date",
  "Payment mode",
  "Notes",
];

const yesNo = (v: boolean) => (v ? "Yes" : "No");

export function expenseCsvRow(e: Expense): CsvCell[] {
  const gst = hasGst(e);
  return [
    e.date,
    e.vendorName,
    e.vendorGstin,
    e.vendorStateCode ? stateName(e.vendorStateCode) : "",
    e.invoiceNo,
    e.invoiceDate,
    e.category,
    e.description,
    gst ? e.gstRate || "0" : "",
    GST_MODE_LABELS[e.gstMode],
    gst ? yesNo(e.amountIncludesGst) : "",
    e.summary.taxable,
    e.summary.cgst,
    e.summary.sgst,
    e.summary.igst,
    e.summary.total,
    yesNo(claimsItc(e)),
    gst ? ITC_TYPE_LABELS[e.itcType] : "",
    itcClaimable(e),
    yesNo(e.reverseCharge),
    PAYMENT_STATUS_LABELS[e.paymentStatus],
    e.paymentStatus === "unpaid" ? "" : e.paymentDate,
    e.paymentStatus === "unpaid" || !e.paymentMode ? "" : PAYMENT_MODE_LABELS[e.paymentMode],
    e.notes,
  ];
}

export const INCOME_CSV_HEADERS = ["Date", "Source", "Category", "Amount", "Notes"];

export function incomeCsvRow(i: Income): CsvCell[] {
  return [i.date, i.source, i.category, toDec(i.amount).toFixed(2), i.notes];
}
