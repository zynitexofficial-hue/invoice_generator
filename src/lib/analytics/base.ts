/**
 * Normalized, INR-denominated facts for analytics, registers and insights.
 *
 * Everything here is pure and deterministic. Money is computed with Dec and
 * exposed as fixed 2-dp strings. Invoice amounts are always recomputed with
 * computeTotals (never read from invoice.summary).
 */
import { DOC_TYPE_META } from "@/lib/documents";
import { computeExpenseSummary } from "@/lib/expense-calc";
import { computeTotals, isIssued } from "@/lib/invoice-calc";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { periodRange } from "@/lib/period";
import {
  invoiceHasTax,
  isIndia,
  resolvePlaceOfSupply,
  sellerStateCode,
  taxKindForInvoice,
} from "@/lib/gst/tax";
import { OTHER_COUNTRY_CODE, stateName } from "@/lib/gst/states";
import type { DocType, Expense, Income, Invoice, SupplyNature } from "@/lib/schema";

/* ------------------------------------------------------------------ */
/* Small shared helpers                                                */
/* ------------------------------------------------------------------ */

/** Fixed 2-dp string (half-up, the Dec default rounding). */
export const d2 = (value: Dec): string => roundTo(value, 2).toFixed(2);

/** Sum fixed-point strings as Dec. */
export const sumStr = (values: string[]): Dec =>
  values.reduce((acc, v) => acc.plus(toDec(v)), ZERO);

export interface HeadAmounts {
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export interface DecHeads {
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
}

export const zeroHeads = (): DecHeads => ({ cgst: ZERO, sgst: ZERO, igst: ZERO });

export function addHeads(a: DecHeads, b: DecHeads, factor = 1): DecHeads {
  return {
    cgst: a.cgst.plus(b.cgst.times(factor)),
    sgst: a.sgst.plus(b.sgst.times(factor)),
    igst: a.igst.plus(b.igst.times(factor)),
  };
}

export function headsToStrings(h: DecHeads): HeadAmounts {
  return {
    cgst: d2(h.cgst),
    sgst: d2(h.sgst),
    igst: d2(h.igst),
    total: d2(h.cgst.plus(h.sgst).plus(h.igst)),
  };
}

/** Percentage (2 dp string) of `part / whole`; null when `whole` is zero. */
export function pct(part: Dec, whole: Dec): string | null {
  if (whole.isZero()) return null;
  return d2(part.dividedBy(whole).times(100));
}

/* ------------------------------------------------------------------ */
/* Date ranges                                                         */
/* ------------------------------------------------------------------ */

/** Inclusive ISO date range. */
export interface DateRange {
  start: string;
  end: string;
}

/** A period key ("2026-10", "2026-Q3", "FY2026-27") or a custom inclusive range. */
export type PeriodSelector = string | DateRange;

export function resolveRange(period: PeriodSelector): DateRange {
  return typeof period === "string" ? periodRange(period) : period;
}

export function inRange(dateISO: string, range: DateRange): boolean {
  return Boolean(dateISO) && dateISO >= range.start && dateISO <= range.end;
}

const DAY_MS = 86_400_000;
const utc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

/** Whole days from `fromISO` to `toISO` (positive when `toISO` is later). */
export function daysBetween(fromISO: string, toISO: string): number {
  return Math.round((utc(toISO) - utc(fromISO)) / DAY_MS);
}

export function addDays(dateISO: string, days: number): string {
  return new Date(utc(dateISO) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The period immediately before: the previous period key, or a same-length range. */
export function previousPeriod(
  period: PeriodSelector,
  shift: (k: string) => string,
): PeriodSelector {
  if (typeof period === "string") return shift(period);
  const len = daysBetween(period.start, period.end);
  const end = addDays(period.start, -1);
  return { start: addDays(end, -len), end };
}

/* ------------------------------------------------------------------ */
/* Invoice facts                                                       */
/* ------------------------------------------------------------------ */

export type FactKind = "sale" | "credit_note" | "debit_note";
export type SupplyClass = "b2b" | "b2c" | "export";

export const SUPPLY_CLASS_LABELS: Record<SupplyClass, string> = {
  b2b: "B2B",
  b2c: "B2C",
  export: "Export",
};

export type ExclusionReason =
  "draft" | "quotation" | "cancelled" | "missing invoice date" | "missing exchange rate";

/** Reasons that mean a record is incomplete (as opposed to legitimately not counted). */
export const DATA_GAP_REASONS: ExclusionReason[] = [
  "missing invoice date",
  "missing exchange rate",
];

export interface Exclusion {
  id: string;
  number: string;
  /** Document date ("" when missing); used to scope exclusions to a period. */
  date: string;
  reason: ExclusionReason;
}

export interface LineFact {
  hsn: string;
  name: string;
  uqc: string;
  quantity: string;
  rate: string;
  /** INR, unsigned (as on the document). */
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
}

export interface InvoiceFact {
  id: string;
  number: string;
  docType: DocType;
  kind: FactKind;
  /** +1 for sales and debit notes, −1 for credit notes. */
  sign: 1 | -1;
  date: string;
  /** Due date; "" when none. */
  dueDate: string;
  customerKey: string;
  customerName: string;
  customerGstin: string;
  /** Place-of-supply state code ("96" = outside India, "" = unknown). */
  pos: string;
  posName: string;
  supplyClass: SupplyClass;
  supplyNature: SupplyNature;
  reverseCharge: boolean;
  /** Whether the document charges GST (tax invoice, WPAY export, notes on those). */
  hasTax: boolean;
  currency: string;
  /** INR per unit of `currency` ("1" for INR). */
  exchangeRate: string;
  /** All amounts INR and unsigned; multiply by `sign` to aggregate. */
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
  /** INR still to be received (sales only; notes carry no payment → "0.00"). */
  balanceDue: string;
  paymentStatus: "unpaid" | "partial" | "paid";
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  noteReason: string;
  lines: LineFact[];
}

export type InvoiceFactResult = { fact: InvoiceFact } | { excluded: Exclusion };

export function customerIdentity(invoice: Invoice) {
  const c = invoice.customer;
  const gstin = c.gstin.trim().toUpperCase();
  const name = (c.company || c.name).trim();
  const key = c.customerId || gstin || (name ? `name:${name.toLowerCase()}` : "unknown");
  return { key, name: name || "Unnamed customer", gstin };
}

function classify(invoice: Invoice, gstin: string): SupplyClass {
  if (invoice.docType === "export" || !isIndia(invoice.customer.country)) return "export";
  return gstin ? "b2b" : "b2c";
}

/**
 * Normalize one invoice into INR facts, or say why it is not counted.
 *
 * Counted: issued, active tax invoices, plain invoices (no GST), bills of
 * supply, exports and credit/debit notes. Not counted: drafts, quotations
 * (proforma) and cancelled documents. Non-INR documents need
 * exportDetails.exchangeRate.
 *
 * Line values are converted one by one and the document taxable/tax figures
 * are the sums of the converted lines, so HSN and register totals always
 * reconcile. With gstMode "single" the one GST figure is split into heads by
 * place of supply (same state → CGST/SGST halves, else IGST).
 */
export function invoiceFacts(invoice: Invoice, sellerState: string): InvoiceFactResult {
  const base = { id: invoice.id, number: invoice.number, date: invoice.invoiceDate };
  if (invoice.docType === "proforma") return { excluded: { ...base, reason: "quotation" } };
  if (invoice.status === "cancelled") return { excluded: { ...base, reason: "cancelled" } };
  if (!isIssued(invoice)) return { excluded: { ...base, reason: "draft" } };
  if (!invoice.invoiceDate) return { excluded: { ...base, reason: "missing invoice date" } };

  let rate: Dec = new Dec(1);
  if (invoice.currency !== "INR") {
    rate = toDec(invoice.exportDetails.exchangeRate);
    if (rate.lessThanOrEqualTo(0))
      return { excluded: { ...base, reason: "missing exchange rate" } };
  }
  const inr = (v: string) => roundTo(toDec(v).times(rate), 2);

  const totals = computeTotals(invoice);
  const seller = sellerState || sellerStateCode(invoice.seller);
  const pos =
    invoice.docType === "export" || !isIndia(invoice.customer.country)
      ? OTHER_COUNTRY_CODE
      : resolvePlaceOfSupply(invoice);
  const singleIsInter = Boolean(seller && pos && seller !== pos);
  const taxKind = taxKindForInvoice(invoice);

  const lines: LineFact[] = [];
  let taxable = ZERO;
  let heads = zeroHeads();
  totals.lines.forEach((lt, i) => {
    const src = invoice.lines[i];
    const lineTaxable = inr(lt.taxable);
    let cgst = inr(lt.cgst);
    let sgst = inr(lt.sgst);
    let igst = inr(lt.igst);
    if (taxKind === "single") {
      const gst = inr(lt.gst);
      if (singleIsInter) igst = igst.plus(gst);
      else {
        const half = roundTo(gst.dividedBy(2), 2);
        cgst = cgst.plus(half);
        sgst = sgst.plus(gst.minus(half));
      }
    }
    taxable = taxable.plus(lineTaxable);
    heads = addHeads(heads, { cgst, sgst, igst });
    lines.push({
      hsn: src?.hsnSac ?? "",
      name: src?.name ?? "",
      uqc: src?.uqc ?? "",
      quantity: src?.quantity || "0",
      rate: lt.rate || "0",
      taxable: d2(lineTaxable),
      cgst: d2(cgst),
      sgst: d2(sgst),
      igst: d2(igst),
    });
  });

  const kind: FactKind =
    invoice.docType === "credit_note"
      ? "credit_note"
      : invoice.docType === "debit_note"
        ? "debit_note"
        : "sale";
  const hasPayment = DOC_TYPE_META[invoice.docType].hasPayment;
  const who = customerIdentity(invoice);
  const tax = heads.cgst.plus(heads.sgst).plus(heads.igst);

  return {
    fact: {
      id: invoice.id,
      number: invoice.number,
      docType: invoice.docType,
      kind,
      sign: kind === "credit_note" ? -1 : 1,
      date: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      customerKey: who.key,
      customerName: who.name,
      customerGstin: who.gstin,
      pos,
      posName: stateName(pos) || "Unknown",
      supplyClass: classify(invoice, who.gstin),
      supplyNature: invoice.supplyNature,
      reverseCharge: invoice.reverseCharge,
      hasTax: invoiceHasTax(invoice),
      currency: invoice.currency,
      exchangeRate: rate.toString(),
      taxable: d2(taxable),
      cgst: d2(heads.cgst),
      sgst: d2(heads.sgst),
      igst: d2(heads.igst),
      tax: d2(tax),
      total: d2(inr(totals.grandTotal)),
      balanceDue: hasPayment ? d2(inr(totals.balanceDue)) : "0.00",
      paymentStatus: totals.paymentStatus,
      originalInvoiceId: invoice.note.originalInvoiceId,
      originalInvoiceNumber: invoice.note.originalInvoiceNumber,
      noteReason: invoice.note.reason,
      lines,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Expense & income facts                                              */
/* ------------------------------------------------------------------ */

export interface ExpenseFact {
  id: string;
  date: string;
  vendorName: string;
  vendorGstin: string;
  invoiceNo: string;
  category: string;
  description: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
  reverseCharge: boolean;
  /** ITC eligible and not typed "ineligible". */
  itcEligible: boolean;
  /** GST claimable as ITC (all heads zero when not eligible). */
  eligibleItc: HeadAmounts;
  /** What the expense costs the business: total − eligible ITC. */
  cost: string;
  paymentStatus: Expense["paymentStatus"];
}

export function expenseFact(expense: Expense): ExpenseFact {
  // Recomputed (same function used on save) so analytics never depends on stale summaries.
  const s = computeExpenseSummary(expense);
  const eligible = expense.itcEligible && expense.itcType !== "ineligible";
  const itc: DecHeads = eligible
    ? { cgst: toDec(s.cgst), sgst: toDec(s.sgst), igst: toDec(s.igst) }
    : zeroHeads();
  const itcTotal = itc.cgst.plus(itc.sgst).plus(itc.igst);
  return {
    id: expense.id,
    date: expense.date,
    vendorName: expense.vendorName.trim(),
    vendorGstin: expense.vendorGstin.trim().toUpperCase(),
    invoiceNo: expense.invoiceNo,
    category: expense.category.trim() || "Uncategorised",
    description: expense.description,
    taxable: s.taxable,
    cgst: s.cgst,
    sgst: s.sgst,
    igst: s.igst,
    tax: d2(toDec(s.cgst).plus(toDec(s.sgst)).plus(toDec(s.igst))),
    total: s.total,
    reverseCharge: expense.reverseCharge,
    itcEligible: eligible,
    eligibleItc: headsToStrings(itc),
    cost: d2(toDec(s.total).minus(itcTotal)),
    paymentStatus: expense.paymentStatus,
  };
}

export interface IncomeFact {
  id: string;
  date: string;
  source: string;
  category: string;
  amount: string;
  notes: string;
}

export function incomeFact(income: Income): IncomeFact {
  return {
    id: income.id,
    date: income.date,
    source: income.source.trim(),
    category: income.category.trim() || "Other",
    amount: d2(toDec(income.amount)),
    notes: income.notes,
  };
}

/* ------------------------------------------------------------------ */
/* Prepared data set                                                   */
/* ------------------------------------------------------------------ */

export interface AnalyticsInput {
  invoices: Invoice[];
  expenses: Expense[];
  incomes: Income[];
  /** Seller's registered state code (settings profile); "" → taken from each invoice. */
  sellerState: string;
}

export interface AnalyticsData {
  facts: InvoiceFact[];
  excluded: Exclusion[];
  expenses: ExpenseFact[];
  /** Expenses without a date (cannot be placed in any period). */
  expensesExcluded: { id: string; reason: "missing date" }[];
  incomes: IncomeFact[];
}

/** Normalize everything once; pass the result to the metric/register builders. */
export function prepareAnalytics(input: AnalyticsInput): AnalyticsData {
  const facts: InvoiceFact[] = [];
  const excluded: Exclusion[] = [];
  for (const inv of input.invoices) {
    const r = invoiceFacts(inv, input.sellerState);
    if ("fact" in r) facts.push(r.fact);
    else excluded.push(r.excluded);
  }
  const byDateThenNumber = (a: { date: string; id: string }, b: { date: string; id: string }) =>
    a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date);
  facts.sort((a, b) =>
    a.date === b.date
      ? a.number.localeCompare(b.number) || a.id.localeCompare(b.id)
      : a.date.localeCompare(b.date),
  );
  const expenses: ExpenseFact[] = [];
  const expensesExcluded: AnalyticsData["expensesExcluded"] = [];
  for (const e of input.expenses) {
    if (!e.date) expensesExcluded.push({ id: e.id, reason: "missing date" });
    else expenses.push(expenseFact(e));
  }
  expenses.sort(byDateThenNumber);
  const incomes = input.incomes
    .filter((i) => i.date)
    .map(incomeFact)
    .sort(byDateThenNumber);
  return { facts, excluded, expenses, expensesExcluded, incomes };
}

/** Facts, expenses and incomes dated inside a range. */
export function sliceData(data: AnalyticsData, range: DateRange) {
  return {
    facts: data.facts.filter((f) => inRange(f.date, range)),
    expenses: data.expenses.filter((e) => inRange(e.date, range)),
    incomes: data.incomes.filter((i) => inRange(i.date, range)),
    // Exclusions without a date can't be placed; they count in every period.
    excluded: data.excluded.filter((x) => !x.date || inRange(x.date, range)),
  };
}

/** Signed INR value of a fact field. */
export const signed = (
  f: InvoiceFact,
  field: "taxable" | "cgst" | "sgst" | "igst" | "tax" | "total",
) => toDec(f[field]).times(f.sign);
