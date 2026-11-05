/**
 * Register builders (spec G6). Each returns headers, string rows and a totals
 * row, ready for an HTML table and downloadCsv. Dates are ISO; money is INR
 * 2-dp; document amounts are shown as on the document (unsigned).
 *
 * Reconciliation (G8): sales register taxable − notes register credit +
 * debit = metrics.salesRevenue; expense register cost = metrics.expenses;
 * income register = metrics.otherIncome; HSN summary (signed) taxable =
 * salesRevenue; receivables register balance = receivablesOutstanding.
 */
import { DOC_TYPE_META } from "@/lib/documents";
import { Dec, ZERO, toDec } from "@/lib/money";
import { NOTE_REASON_LABELS, type NoteReason } from "@/lib/schema";
import {
  SUPPLY_CLASS_LABELS,
  d2,
  resolveRange,
  sliceData,
  type AnalyticsData,
  type InvoiceFact,
  type PeriodSelector,
  type SupplyClass,
} from "./base";
import { AGE_BUCKETS, openInvoices } from "./receivables";

export interface Register {
  title: string;
  headers: string[];
  /** Per column: right-align numbers. */
  numeric: boolean[];
  rows: string[][];
  /** Record id behind each row (for drill-down/open links); HSN rows use the HSN key. */
  rowIds: string[];
  /** Totals row aligned with headers ("" for non-summed columns). */
  totals: string[];
  /** Named totals for reconciliation and summaries. */
  totalsByKey: Record<string, string>;
}

/** Drill-down filter applied to a register (from a clicked chart datum). */
export interface RegisterFilter {
  customerKey?: string;
  /** Place-of-supply state code. */
  pos?: string;
  supplyClass?: SupplyClass;
  hsn?: string;
  category?: string;
  invoiceIds?: string[];
}

function matches(f: InvoiceFact, filter?: RegisterFilter): boolean {
  if (!filter) return true;
  if (filter.customerKey && f.customerKey !== filter.customerKey) return false;
  if (filter.pos && f.pos !== filter.pos) return false;
  if (filter.supplyClass && f.supplyClass !== filter.supplyClass) return false;
  if (filter.hsn && !f.lines.some((l) => (l.hsn || "none") === filter.hsn)) return false;
  if (filter.invoiceIds && !filter.invoiceIds.includes(f.id)) return false;
  return true;
}

function sumColumns(rows: string[][], numeric: boolean[], skip: number[] = []): string[] {
  return numeric.map((isNum, col) => {
    if (!isNum || skip.includes(col)) return "";
    return d2(rows.reduce((s, r) => s.plus(toDec(r[col])), ZERO as Dec));
  });
}

function build(
  title: string,
  cols: [header: string, numeric: boolean][],
  rows: string[][],
  rowIds: string[],
  keys: Record<string, number>,
  skipTotals: number[] = [],
): Register {
  const headers = cols.map((c) => c[0]);
  const numeric = cols.map((c) => c[1]);
  const totals = sumColumns(rows, numeric, skipTotals);
  totals[0] = `Total (${rows.length})`;
  const totalsByKey: Record<string, string> = {};
  for (const [k, col] of Object.entries(keys)) totalsByKey[k] = totals[col];
  return { title, headers, numeric, rows, rowIds, totals, totalsByKey };
}

function saleStatus(f: InvoiceFact, todayISO: string): string {
  if (f.paymentStatus === "paid") return "Paid";
  const due = f.dueDate;
  if (due && due < todayISO && toDec(f.balanceDue).greaterThan(0)) return "Overdue";
  return f.paymentStatus === "partial" ? "Partly paid" : "Unpaid";
}

/** Sales register: issued sales documents (not notes) in the period. */
export function salesRegister(
  data: AnalyticsData,
  period: PeriodSelector,
  todayISO: string,
  filter?: RegisterFilter,
): Register {
  const facts = sliceData(data, resolveRange(period)).facts.filter(
    (f) => f.kind === "sale" && matches(f, filter),
  );
  return build(
    "Sales register",
    [
      ["Invoice no", false],
      ["Date", false],
      ["Customer", false],
      ["GSTIN", false],
      ["Place of supply", false],
      ["Document type", false],
      ["Taxable value", true],
      ["CGST", true],
      ["SGST/UTGST", true],
      ["IGST", true],
      ["Total", true],
      ["Status", false],
    ],
    facts.map((f) => [
      f.number,
      f.date,
      f.customerName,
      f.customerGstin,
      f.pos ? `${f.posName} (${f.pos})` : "",
      DOC_TYPE_META[f.docType].shortLabel,
      f.taxable,
      f.cgst,
      f.sgst,
      f.igst,
      f.total,
      saleStatus(f, todayISO),
    ]),
    facts.map((f) => f.id),
    { taxable: 6, cgst: 7, sgst: 8, igst: 9, total: 10 },
  );
}

/** Credit/debit note register. Totals: `credit*` and `debit*` keys plus the unsigned column totals. */
export function notesRegister(
  data: AnalyticsData,
  period: PeriodSelector,
  filter?: RegisterFilter,
): Register {
  const facts = sliceData(data, resolveRange(period)).facts.filter(
    (f) => f.kind !== "sale" && matches(f, filter),
  );
  const reg = build(
    "Credit & debit note register",
    [
      ["Note no", false],
      ["Date", false],
      ["Type", false],
      ["Original invoice", false],
      ["Customer", false],
      ["GSTIN", false],
      ["Place of supply", false],
      ["Reason", false],
      ["Taxable value", true],
      ["CGST", true],
      ["SGST/UTGST", true],
      ["IGST", true],
      ["Total", true],
    ],
    facts.map((f) => [
      f.number,
      f.date,
      f.kind === "credit_note" ? "Credit note" : "Debit note",
      f.originalInvoiceNumber,
      f.customerName,
      f.customerGstin,
      f.pos ? `${f.posName} (${f.pos})` : "",
      NOTE_REASON_LABELS[f.noteReason as NoteReason] ?? "",
      f.taxable,
      f.cgst,
      f.sgst,
      f.igst,
      f.total,
    ]),
    facts.map((f) => f.id),
    { taxable: 8, cgst: 9, sgst: 10, igst: 11, total: 12 },
  );
  for (const kind of ["credit_note", "debit_note"] as const) {
    const prefix = kind === "credit_note" ? "credit" : "debit";
    const sub = facts.filter((f) => f.kind === kind);
    for (const field of ["taxable", "cgst", "sgst", "igst", "total"] as const) {
      const key = `${prefix}${field[0].toUpperCase()}${field.slice(1)}`;
      reg.totalsByKey[key] = d2(sub.reduce((s, f) => s.plus(toDec(f[field])), ZERO as Dec));
    }
  }
  return reg;
}

/** Expense register. `cost` = total − eligible ITC (matches metrics.expenses). */
export function expenseRegister(
  data: AnalyticsData,
  period: PeriodSelector,
  filter?: Pick<RegisterFilter, "category">,
): Register {
  const rows = sliceData(data, resolveRange(period)).expenses.filter(
    (e) => !filter?.category || e.category === filter.category,
  );
  return build(
    "Expense register",
    [
      ["Date", false],
      ["Vendor", false],
      ["Vendor GSTIN", false],
      ["Bill no", false],
      ["Category", false],
      ["Taxable value", true],
      ["CGST", true],
      ["SGST/UTGST", true],
      ["IGST", true],
      ["Total", true],
      ["ITC", false],
      ["Eligible ITC", true],
      ["Cost", true],
    ],
    rows.map((e) => [
      e.date,
      e.vendorName,
      e.vendorGstin,
      e.invoiceNo,
      e.category,
      e.taxable,
      e.cgst,
      e.sgst,
      e.igst,
      e.total,
      e.itcEligible
        ? e.reverseCharge
          ? "Eligible (RCM)"
          : "Eligible"
        : e.reverseCharge
          ? "Not eligible (RCM)"
          : "Not eligible",
      e.eligibleItc.total,
      e.cost,
    ]),
    rows.map((e) => e.id),
    { taxable: 5, cgst: 6, sgst: 7, igst: 8, total: 9, eligibleItc: 11, cost: 12 },
  );
}

export function incomeRegister(data: AnalyticsData, period: PeriodSelector): Register {
  const rows = sliceData(data, resolveRange(period)).incomes;
  return build(
    "Income register",
    [
      ["Date", false],
      ["Source", false],
      ["Category", false],
      ["Notes", false],
      ["Amount", true],
    ],
    rows.map((i) => [i.date, i.source, i.category, i.notes, i.amount]),
    rows.map((i) => i.id),
    { amount: 4 },
  );
}

/**
 * HSN/SAC summary grouped by code and rate, net of notes (credit notes
 * subtract). Quantity is summed per UQC-agnostic group.
 */
export function hsnSummary(
  data: AnalyticsData,
  period: PeriodSelector,
  filter?: RegisterFilter,
): Register {
  const groups = new Map<
    string,
    {
      hsn: string;
      desc: string;
      rate: string;
      qty: Dec;
      taxable: Dec;
      cgst: Dec;
      sgst: Dec;
      igst: Dec;
    }
  >();
  for (const f of sliceData(data, resolveRange(period)).facts.filter((x) => matches(x, filter))) {
    for (const l of f.lines) {
      const rate = toDec(l.rate).toString();
      const key = `${l.hsn || "none"}|${rate}`;
      const g = groups.get(key) ?? {
        hsn: l.hsn,
        desc: l.name,
        rate,
        qty: ZERO,
        taxable: ZERO,
        cgst: ZERO,
        sgst: ZERO,
        igst: ZERO,
      };
      g.qty = g.qty.plus(toDec(l.quantity).times(f.sign));
      g.taxable = g.taxable.plus(toDec(l.taxable).times(f.sign));
      g.cgst = g.cgst.plus(toDec(l.cgst).times(f.sign));
      g.sgst = g.sgst.plus(toDec(l.sgst).times(f.sign));
      g.igst = g.igst.plus(toDec(l.igst).times(f.sign));
      groups.set(key, g);
    }
  }
  const list = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  return build(
    "HSN/SAC summary",
    [
      ["HSN/SAC", false],
      ["Description", false],
      ["Rate %", false],
      ["Quantity", true],
      ["Taxable value", true],
      ["CGST", true],
      ["SGST/UTGST", true],
      ["IGST", true],
      ["Total tax", true],
    ],
    list.map(([, g]) => [
      g.hsn || "—",
      g.desc,
      g.rate,
      g.qty.toString(),
      d2(g.taxable),
      d2(g.cgst),
      d2(g.sgst),
      d2(g.igst),
      d2(g.cgst.plus(g.sgst).plus(g.igst)),
    ]),
    list.map(([k]) => k),
    { taxable: 4, cgst: 5, sgst: 6, igst: 7, tax: 8 },
    [3], // quantities of different units are not summed
  );
}

export function receivablesRegister(data: AnalyticsData, todayISO: string): Register {
  const open = openInvoices(data, todayISO).sort(
    (a, b) => b.daysPastDue - a.daysPastDue || a.number.localeCompare(b.number),
  );
  const label = (k: string) => AGE_BUCKETS.find((b) => b.key === k)?.label ?? k;
  return build(
    "Receivables",
    [
      ["Invoice no", false],
      ["Date", false],
      ["Due date", false],
      ["Customer", false],
      ["Days overdue", false],
      ["Age", false],
      ["Total", true],
      ["Balance due", true],
    ],
    open.map((o) => [
      o.number,
      o.date,
      o.dueDate,
      o.customerName,
      String(Math.max(0, o.daysPastDue)),
      label(o.bucket),
      o.total,
      o.balance,
    ]),
    open.map((o) => o.id),
    { total: 6, balance: 7 },
  );
}

/** Supply-class label helper for UIs filtering registers. */
export const supplyClassLabel = (c: SupplyClass) => SUPPLY_CLASS_LABELS[c];
