import { computeExpenseSummary } from "@/lib/expense-calc";
import { toDec } from "@/lib/money";
import { inPeriod } from "@/lib/period";
import type { Expense, ItcType, Purchase } from "@/lib/schema";

/**
 * Where the GSTR-3B worksheet gets its purchase-side tax from.
 *
 * INTEGRATION POINT: the worksheet only knows `ItcSource`. Today the UI wires
 * `expensesItcSource`. Feature D's `eligibleItcFromPurchases(period)` selector
 * (or the `purchasesItcSource` adapter below) is combined with it through
 * `combineItcSources` in src/components/returns/gstr3b/use-itc-source.ts.
 */
export interface ItcLine {
  /** `expense:<id>` or `purchase:<id>`. */
  id: string;
  source: "expense" | "purchase";
  /** Date used to place the line in a return period. */
  date: string;
  supplierGstin: string;
  supplierName: string;
  docNo: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  /** Tax is payable by you under reverse charge (goes to 3.1(d) and 4A(3)). */
  reverseCharge: boolean;
  /** Claimable: marked eligible and not typed "ineligible". */
  eligible: boolean;
  itcType: ItcType;
}

/** Lines of one return period (month "2026-10" or quarter "2026-Q3"). */
export type ItcSource = (periodKey: string) => ItcLine[];

export function expensesItcSource(expenses: Expense[]): ItcSource {
  return (periodKey) => {
    const out: ItcLine[] = [];
    for (const e of expenses) {
      if (!inPeriod(e.date, periodKey)) continue;
      const s = computeExpenseSummary(e);
      const tax = toDec(s.igst).plus(toDec(s.cgst)).plus(toDec(s.sgst));
      if (!tax.greaterThan(0) && !e.reverseCharge) continue;
      out.push({
        id: `expense:${e.id}`,
        source: "expense",
        date: e.date,
        supplierGstin: e.vendorGstin,
        supplierName: e.vendorName,
        docNo: e.invoiceNo,
        taxable: s.taxable,
        igst: s.igst,
        cgst: s.cgst,
        sgst: s.sgst,
        cess: "0.00",
        reverseCharge: e.reverseCharge,
        eligible: e.itcEligible && e.itcType !== "ineligible",
        itcType: e.itcType,
      });
    }
    return out;
  };
}

/** Adapter over purchase bills (uses the stored `summary` computed by feature D's writer). */
export function purchasesItcSource(purchases: Purchase[]): ItcSource {
  return (periodKey) => {
    const out: ItcLine[] = [];
    for (const p of purchases) {
      if (!inPeriod(p.billDate, periodKey)) continue;
      const s = p.summary;
      const tax = toDec(s.igst).plus(toDec(s.cgst)).plus(toDec(s.sgst));
      if (!tax.greaterThan(0) && !p.reverseCharge) continue;
      out.push({
        id: `purchase:${p.id}`,
        source: "purchase",
        date: p.billDate,
        supplierGstin: p.vendorGstin,
        supplierName: p.vendorName,
        docNo: p.billNo,
        taxable: s.taxable,
        igst: s.igst,
        cgst: s.cgst,
        sgst: s.sgst,
        cess: "0.00",
        reverseCharge: p.reverseCharge,
        eligible: p.itcEligible && p.itcType !== "ineligible",
        itcType: p.itcType,
      });
    }
    return out;
  };
}

/** Concatenate sources. Drops expense lines that a purchase bill already posted (`expenseId`). */
export function combineItcSources(...sources: ItcSource[]): ItcSource {
  return (periodKey) => sources.flatMap((s) => s(periodKey));
}

/** Remove expense lines whose expense was posted from one of these purchases. */
export function withoutLinkedExpenses(lines: ItcLine[], purchases: Purchase[]): ItcLine[] {
  const linked = new Set(purchases.map((p) => p.expenseId).filter(Boolean));
  return lines.filter(
    (l) => !(l.source === "expense" && linked.has(l.id.slice("expense:".length))),
  );
}
