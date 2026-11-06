/**
 * Pure maths for purchase bills. Decimal only; money is returned as 2-dp strings.
 *
 * Per line: amount = quantity × unit price (rounded to paise), then the same
 * GST split as an expense (see computeExpenseSummary). Heads are summed over
 * the lines, so the bill always adds back to its lines.
 *
 * Reverse charge: the vendor does not charge GST, so the GST heads are what you
 * owe the government and the bill `total` (what you pay the vendor) is the
 * taxable value only. Prices are treated as GST-exclusive in that case.
 */
import { computeExpenseSummary, suggestGstMode } from "@/lib/expense-calc";
import { checkGstin } from "@/lib/gst/gstin";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type {
  ExpenseGstMode,
  Purchase,
  PurchaseLine,
  PurchasePayment,
  PurchasePaymentStatus,
  PurchaseSummary,
} from "@/lib/schema";

const fmt = (d: Dec) => roundTo(d, 2).toFixed(2);

export type PurchaseCalcInput = Pick<
  Purchase,
  "lines" | "pricesIncludeGst" | "gstMode" | "reverseCharge" | "payments"
>;

/** quantity × unit price for one line (2 dp). */
export function lineAmount(line: Pick<PurchaseLine, "quantity" | "unitPrice">): string {
  return fmt(toDec(line.quantity).times(toDec(line.unitPrice)));
}

export interface PurchaseLineAmounts {
  amount: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export function computeLineAmounts(
  line: Pick<PurchaseLine, "quantity" | "unitPrice" | "gstRate">,
  opts: Pick<PurchaseCalcInput, "pricesIncludeGst" | "gstMode" | "reverseCharge">,
): PurchaseLineAmounts {
  const amount = lineAmount(line);
  const s = computeExpenseSummary({
    amount,
    amountIncludesGst: opts.pricesIncludeGst && !opts.reverseCharge,
    gstRate: line.gstRate,
    gstMode: opts.gstMode,
  });
  return { amount, ...s };
}

/** Sum of payments, 2 dp. */
export function paidAmount(payments: Pick<PurchasePayment, "amount">[]): string {
  return fmt(payments.reduce((acc, p) => acc.plus(toDec(p.amount)), ZERO));
}

export function computePurchaseSummary(input: PurchaseCalcInput): PurchaseSummary {
  let taxable = ZERO;
  let cgst = ZERO;
  let sgst = ZERO;
  let igst = ZERO;
  for (const line of input.lines) {
    const l = computeLineAmounts(line, input);
    taxable = taxable.plus(l.taxable);
    cgst = cgst.plus(l.cgst);
    sgst = sgst.plus(l.sgst);
    igst = igst.plus(l.igst);
  }
  const gst = cgst.plus(sgst).plus(igst);
  const total = input.reverseCharge ? taxable : taxable.plus(gst);
  const paid = toDec(paidAmount(input.payments));
  const balance = Dec.max(total.minus(paid), ZERO);
  return {
    taxable: fmt(taxable),
    cgst: fmt(cgst),
    sgst: fmt(sgst),
    igst: fmt(igst),
    total: fmt(total),
    paid: fmt(paid),
    balance: fmt(balance),
  };
}

/** unpaid: nothing paid; paid: paid ≥ total; otherwise partial. */
export function purchasePaymentStatus(total: string, paid: string): PurchasePaymentStatus {
  const t = toDec(total);
  const p = toDec(paid);
  if (p.lessThanOrEqualTo(0)) return "unpaid";
  return p.greaterThanOrEqualTo(t) ? "paid" : "partial";
}

/** Same guard as expenses: a GST bill needs the vendor's valid GSTIN and the bill number. */
export function canClaimItc(p: Pick<Purchase, "gstMode" | "vendorGstin" | "billNo">): boolean {
  return p.gstMode !== "none" && checkGstin(p.vendorGstin).valid && Boolean(p.billNo.trim());
}

/** True when the bill's GST counts as claimable ITC. */
export function claimsItc(
  p: Pick<Purchase, "gstMode" | "itcEligible" | "itcType" | "vendorGstin" | "billNo">,
): boolean {
  return p.itcEligible && p.itcType !== "ineligible" && canClaimItc(p);
}

export interface ItcHeads {
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

export const ZERO_ITC: ItcHeads = { cgst: "0.00", sgst: "0.00", igst: "0.00", total: "0.00" };

/** ITC the bill can claim (all zero when it does not qualify). */
export function purchaseItc(
  p: Pick<Purchase, "gstMode" | "itcEligible" | "itcType" | "vendorGstin" | "billNo" | "summary">,
): ItcHeads {
  if (!claimsItc(p)) return ZERO_ITC;
  const { cgst, sgst, igst } = p.summary;
  return { cgst, sgst, igst, total: fmt(toDec(cgst).plus(sgst).plus(igst)) };
}

/** GST on the bill (all heads), 2 dp. */
export function purchaseGst(p: Pick<Purchase, "summary">): string {
  return fmt(toDec(p.summary.cgst).plus(p.summary.sgst).plus(p.summary.igst));
}

/** CGST+SGST when the vendor is in the seller's state, otherwise IGST. */
export function purchaseGstMode(
  vendorStateCode: string,
  sellerStateCode: string,
  hasGst: boolean,
): ExpenseGstMode {
  return hasGst ? suggestGstMode(vendorStateCode, sellerStateCode) : "none";
}

/** Bill due date from the bill date and a credit period ("" when no bill date). */
export function dueDateFrom(billDate: string, days: number): string {
  if (!billDate) return "";
  const [y, m, d] = billDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Recompute everything derived on a bill: summary, payment status and the ITC
 * flag (cleared when the GSTIN / bill number guard fails). Never trust these
 * from input or a backup.
 */
export function preparePurchase(p: Purchase): Purchase {
  const summary = computePurchaseSummary(p);
  const itcEligible = p.itcEligible && p.itcType !== "ineligible" && canClaimItc(p);
  return {
    ...p,
    summary,
    paymentStatus: purchasePaymentStatus(summary.total, summary.paid),
    itcEligible,
  };
}
