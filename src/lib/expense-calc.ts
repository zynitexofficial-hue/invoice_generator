import { Dec, HUNDRED, ZERO, roundTo, toDec } from "@/lib/money";
import type { Expense, ExpenseGstMode, ExpenseSummary } from "@/lib/schema";

export type ExpenseCalcInput = Pick<
  Expense,
  "amount" | "amountIncludesGst" | "gstRate" | "gstMode"
>;

const fmt = (d: Dec) => d.toFixed(2);

/**
 * Taxable value and GST heads of an expense, in rupees (2 dp, half-up).
 *
 * - none (or 0% rate): the amount is the taxable value; no GST.
 * - exclusive: taxable = amount; each head is rounded on its own
 *   (intra: CGST = SGST = round(taxable × rate/2)).
 * - inclusive: total = amount; GST = round(total × rate / (100 + rate));
 *   intra splits it as CGST = round(GST/2) and SGST = the remainder, so the
 *   heads always add back to the amount paid.
 */
export function computeExpenseSummary(input: ExpenseCalcInput): ExpenseSummary {
  const amount = roundTo(toDec(input.amount), 2);
  const rate = toDec(input.gstRate);
  if (input.gstMode === "none" || rate.lessThanOrEqualTo(0)) {
    return {
      taxable: fmt(amount),
      cgst: "0.00",
      sgst: "0.00",
      igst: "0.00",
      total: fmt(amount),
    };
  }

  let taxable: Dec;
  let cgst = ZERO;
  let sgst = ZERO;
  let igst = ZERO;

  if (input.amountIncludesGst) {
    const total = amount;
    const tax = roundTo(total.times(rate).dividedBy(HUNDRED.plus(rate)), 2);
    taxable = total.minus(tax);
    if (input.gstMode === "intra") {
      cgst = roundTo(tax.dividedBy(2), 2);
      sgst = tax.minus(cgst);
    } else {
      igst = tax;
    }
  } else {
    taxable = amount;
    if (input.gstMode === "intra") {
      cgst = roundTo(taxable.times(rate).dividedBy(2).dividedBy(HUNDRED), 2);
      sgst = cgst;
    } else {
      igst = roundTo(taxable.times(rate).dividedBy(HUNDRED), 2);
    }
  }

  return {
    taxable: fmt(taxable),
    cgst: fmt(cgst),
    sgst: fmt(sgst),
    igst: fmt(igst),
    total: fmt(taxable.plus(cgst).plus(sgst).plus(igst)),
  };
}

/**
 * Suggested GST head for a purchase: same state as the seller's registration
 * → CGST+SGST ("intra"), different state → IGST ("inter"). When either state
 * is unknown we assume a local (intra-state) purchase; the user can override.
 */
export function suggestGstMode(vendorStateCode: string, sellerStateCode: string): ExpenseGstMode {
  if (!vendorStateCode || !sellerStateCode) return "intra";
  return vendorStateCode === sellerStateCode ? "intra" : "inter";
}
