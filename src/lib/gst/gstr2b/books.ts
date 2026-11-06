import { computeExpenseSummary } from "@/lib/expense-calc";
import { toDec } from "@/lib/money";
import type { Expense, Purchase } from "@/lib/schema";
import { cleanGstin } from "./common";

/**
 * A purchase bill or GST expense seen as "what your books say", the shape the
 * 2B matcher and the ITC reconciliation work on.
 */
export interface BookDoc {
  /** `purchase:<id>` or `expense:<id>`. */
  key: string;
  targetType: "purchase" | "expense";
  targetId: string;
  /** Short text for lists, e.g. "Bill INV-12 · Acme". */
  label: string;
  gstin: string;
  name: string;
  docNo: string;
  /** Supplier invoice date (what 2B shows). */
  date: string;
  /** Date the 3B uses to place the ITC in a period (bill date / expense date). */
  periodDate: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  rcm: boolean;
  /** ITC claimed in your books (eligible and not typed "ineligible"). */
  itcEligible: boolean;
}

export const bookTax = (b: Pick<BookDoc, "igst" | "cgst" | "sgst" | "cess">) =>
  toDec(b.igst).plus(toDec(b.cgst)).plus(toDec(b.sgst)).plus(toDec(b.cess));

export function bookDocsFromExpenses(expenses: Expense[]): BookDoc[] {
  const out: BookDoc[] = [];
  for (const e of expenses) {
    const s = computeExpenseSummary(e);
    const tax = toDec(s.igst).plus(toDec(s.cgst)).plus(toDec(s.sgst));
    if (!tax.greaterThan(0) && !e.reverseCharge) continue;
    out.push({
      key: `expense:${e.id}`,
      targetType: "expense",
      targetId: e.id,
      label: `Expense ${e.invoiceNo || e.date} · ${e.vendorName || "No vendor"}`,
      gstin: cleanGstin(e.vendorGstin),
      name: e.vendorName,
      docNo: e.invoiceNo,
      date: e.invoiceDate || e.date,
      periodDate: e.date,
      taxable: s.taxable,
      igst: s.igst,
      cgst: s.cgst,
      sgst: s.sgst,
      cess: "0.00",
      rcm: e.reverseCharge,
      itcEligible: e.itcEligible && e.itcType !== "ineligible",
    });
  }
  return out;
}

/** Uses the stored `summary` (computed on save by feature D's writer). */
export function bookDocsFromPurchases(purchases: Purchase[]): BookDoc[] {
  const out: BookDoc[] = [];
  for (const p of purchases) {
    const s = p.summary;
    const tax = toDec(s.igst).plus(toDec(s.cgst)).plus(toDec(s.sgst));
    if (!tax.greaterThan(0) && !p.reverseCharge) continue;
    out.push({
      key: `purchase:${p.id}`,
      targetType: "purchase",
      targetId: p.id,
      label: `Bill ${p.billNo || p.billDate} · ${p.vendorName || "No vendor"}`,
      gstin: cleanGstin(p.vendorGstin),
      name: p.vendorName,
      docNo: p.billNo,
      date: p.billDate,
      periodDate: p.billDate,
      taxable: s.taxable,
      igst: s.igst,
      cgst: s.cgst,
      sgst: s.sgst,
      cess: "0.00",
      rcm: p.reverseCharge,
      itcEligible: p.itcEligible && p.itcType !== "ineligible",
    });
  }
  return out;
}

/**
 * Books side of the reconciliation. An expense that was also posted from a
 * purchase bill (`purchase.expenseId`) is left out so it is not counted twice.
 */
export function buildBookDocs(input: { purchases?: Purchase[]; expenses?: Expense[] }): BookDoc[] {
  const purchases = input.purchases ?? [];
  const linked = new Set(purchases.map((p) => p.expenseId).filter(Boolean));
  return [
    ...bookDocsFromPurchases(purchases),
    ...bookDocsFromExpenses((input.expenses ?? []).filter((e) => !linked.has(e.id))),
  ];
}
