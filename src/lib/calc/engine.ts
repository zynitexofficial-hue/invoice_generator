import { currencyPrecision } from "@/lib/currency";
import { Dec, HUNDRED, ZERO, clampDec, roundTo, sumDec, toDec } from "@/lib/money";
import type { Discount } from "@/lib/schema";

/**
 * How tax applies to an invoice:
 * - none:   no GST (bill of supply, export under LUT)
 * - single: one "GST" component
 * - intra:  CGST + SGST/UTGST (place of supply = seller state)
 * - inter:  IGST
 */
export type TaxKind = "none" | "single" | "intra" | "inter";

export interface CalcLineInput {
  id: string;
  quantity: string;
  unitPrice: string;
  discount: Discount;
  gstRate: string;
}

export interface CalcInput {
  currency: string;
  lines: CalcLineInput[];
  invoiceDiscount: Discount;
  pricesIncludeGst: boolean;
  taxKind: TaxKind;
  roundOff: boolean;
  amountReceived: string;
}

/** All money values are fixed-point strings at the currency's precision. */
export interface LineTotals {
  id: string;
  /** qty × price (inclusive of GST when prices include GST). */
  base: string;
  lineDiscount: string;
  /** base − line discount: the "Amount" column on the document. */
  amount: string;
  /** Share of the invoice-level discount allocated to this line. */
  allocatedDiscount: string;
  taxable: string;
  rate: string;
  cgst: string;
  sgst: string;
  igst: string;
  gst: string;
  tax: string;
  total: string;
}

export interface TaxSummaryRow {
  rate: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  gst: string;
  tax: string;
}

export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface InvoiceTotals {
  currency: string;
  precision: number;
  taxKind: TaxKind;
  pricesIncludeGst: boolean;
  lines: LineTotals[];
  /** Σ line base amounts. */
  grossTotal: string;
  lineDiscountTotal: string;
  /** Σ line amounts (after line discounts, before invoice discount). */
  subtotal: string;
  invoiceDiscount: string;
  taxableTotal: string;
  cgstTotal: string;
  sgstTotal: string;
  igstTotal: string;
  gstTotal: string;
  taxTotal: string;
  totalBeforeRoundOff: string;
  roundOff: string;
  grandTotal: string;
  amountReceived: string;
  balanceDue: string;
  paymentStatus: PaymentStatus;
  taxSummary: TaxSummaryRow[];
}

interface WorkingLine {
  id: string;
  base: Dec;
  lineDiscount: Dec;
  amount: Dec;
  allocated: Dec;
  taxable: Dec;
  rate: Dec;
  cgst: Dec;
  sgst: Dec;
  igst: Dec;
  gst: Dec;
  tax: Dec;
  total: Dec;
}

function discountAmount(discount: Discount, base: Dec, dp: number): Dec {
  if (base.lessThanOrEqualTo(0)) return ZERO;
  const value = toDec(discount.value);
  if (value.lessThanOrEqualTo(0)) return ZERO;
  if (discount.kind === "percent") {
    const pct = clampDec(value, ZERO, HUNDRED);
    return roundTo(base.mul(pct).div(HUNDRED), dp);
  }
  return clampDec(roundTo(value, dp), ZERO, base);
}

/**
 * Split `total` across lines proportionally to `weights`, rounding each share
 * to the currency precision. The rounding remainder goes to the largest line,
 * so the shares always add up to exactly `total`.
 */
export function allocateProRata(total: Dec, weights: Dec[], dp: number): Dec[] {
  const weightSum = sumDec(weights);
  if (total.isZero() || weightSum.lessThanOrEqualTo(0)) return weights.map(() => ZERO);
  const shares = weights.map((w) => roundTo(total.mul(w).div(weightSum), dp));
  const remainder = total.minus(sumDec(shares));
  if (!remainder.isZero()) {
    let largest = 0;
    weights.forEach((w, i) => {
      if (w.greaterThan(weights[largest])) largest = i;
    });
    shares[largest] = shares[largest].plus(remainder);
  }
  return shares;
}

function applyTax(line: WorkingLine, kind: TaxKind, inclusive: boolean, gross: Dec, dp: number) {
  const rate = line.rate;
  if (kind === "none" || rate.isZero()) {
    line.taxable = gross;
    return;
  }
  if (inclusive) {
    // Tax is the remainder so the line total stays exactly what the user entered.
    line.taxable = roundTo(gross.mul(HUNDRED).div(HUNDRED.plus(rate)), dp);
    const tax = gross.minus(line.taxable);
    if (kind === "single") line.gst = tax;
    else if (kind === "inter") line.igst = tax;
    else {
      line.cgst = roundTo(tax.div(2), dp);
      line.sgst = tax.minus(line.cgst);
    }
    return;
  }
  line.taxable = gross;
  if (kind === "single") line.gst = roundTo(gross.mul(rate).div(HUNDRED), dp);
  else if (kind === "inter") line.igst = roundTo(gross.mul(rate).div(HUNDRED), dp);
  else {
    const half = rate.div(2);
    line.cgst = roundTo(gross.mul(half).div(HUNDRED), dp);
    line.sgst = roundTo(gross.mul(half).div(HUNDRED), dp);
  }
}

/**
 * The single source of truth for invoice arithmetic. Pure and deterministic:
 * the same input always yields the same output. See PRD §8 for the rules.
 */
export function calculateInvoice(input: CalcInput): InvoiceTotals {
  const dp = currencyPrecision(input.currency);
  const fmt = (d: Dec) => d.toFixed(dp);
  const inclusive = input.pricesIncludeGst && input.taxKind !== "none";

  // 1–3. Line base amounts and line discounts.
  const lines: WorkingLine[] = input.lines.map((l) => {
    const qty = Dec.max(toDec(l.quantity), ZERO);
    const price = Dec.max(toDec(l.unitPrice), ZERO);
    const base = roundTo(qty.mul(price), dp);
    const lineDiscount = discountAmount(l.discount, base, dp);
    return {
      id: l.id,
      base,
      lineDiscount,
      amount: base.minus(lineDiscount),
      allocated: ZERO,
      taxable: ZERO,
      rate: clampDec(toDec(l.gstRate), ZERO, HUNDRED),
      cgst: ZERO,
      sgst: ZERO,
      igst: ZERO,
      gst: ZERO,
      tax: ZERO,
      total: ZERO,
    };
  });

  // 4–6. Subtotal and pro-rata invoice discount.
  const subtotal = sumDec(lines.map((l) => l.amount));
  const invoiceDiscount = discountAmount(input.invoiceDiscount, subtotal, dp);
  const allocations = allocateProRata(
    invoiceDiscount,
    lines.map((l) => l.amount),
    dp,
  );

  // 7. Taxes per line, each component rounded on its own.
  lines.forEach((line, i) => {
    line.allocated = allocations[i];
    const gross = line.amount.minus(line.allocated);
    applyTax(line, input.taxKind, inclusive, gross, dp);
    line.tax = line.cgst.plus(line.sgst).plus(line.igst).plus(line.gst);
    line.total = line.taxable.plus(line.tax);
  });

  // 8–10. Totals and round-off.
  const taxableTotal = sumDec(lines.map((l) => l.taxable));
  const cgstTotal = sumDec(lines.map((l) => l.cgst));
  const sgstTotal = sumDec(lines.map((l) => l.sgst));
  const igstTotal = sumDec(lines.map((l) => l.igst));
  const gstTotal = sumDec(lines.map((l) => l.gst));
  const taxTotal = cgstTotal.plus(sgstTotal).plus(igstTotal).plus(gstTotal);
  const totalBeforeRoundOff = taxableTotal.plus(taxTotal);
  const grandTotal = input.roundOff ? roundTo(totalBeforeRoundOff, 0) : totalBeforeRoundOff;
  const roundOff = grandTotal.minus(totalBeforeRoundOff);

  // 11. Payment and balance.
  const amountReceived = clampDec(roundTo(toDec(input.amountReceived), dp), ZERO, grandTotal);
  const balanceDue = grandTotal.minus(amountReceived);
  const paymentStatus: PaymentStatus =
    amountReceived.isZero() || grandTotal.isZero()
      ? "unpaid"
      : balanceDue.isZero()
        ? "paid"
        : "partial";

  // Tax summary grouped by rate.
  const byRate = new Map<string, TaxSummaryRow & { _d: Dec[] }>();
  if (input.taxKind !== "none") {
    for (const line of lines) {
      const key = line.rate.toString();
      const row = byRate.get(key);
      const values = [line.taxable, line.cgst, line.sgst, line.igst, line.gst, line.tax];
      if (row) row._d = row._d.map((v, i) => v.plus(values[i]));
      else
        byRate.set(key, {
          rate: key,
          taxable: "",
          cgst: "",
          sgst: "",
          igst: "",
          gst: "",
          tax: "",
          _d: values,
        });
    }
  }
  const taxSummary: TaxSummaryRow[] = [...byRate.values()]
    .sort((a, b) => new Dec(a.rate).comparedTo(new Dec(b.rate)))
    .map(({ rate, _d }) => ({
      rate,
      taxable: fmt(_d[0]),
      cgst: fmt(_d[1]),
      sgst: fmt(_d[2]),
      igst: fmt(_d[3]),
      gst: fmt(_d[4]),
      tax: fmt(_d[5]),
    }));

  return {
    currency: input.currency,
    precision: dp,
    taxKind: input.taxKind,
    pricesIncludeGst: inclusive,
    lines: lines.map((l) => ({
      id: l.id,
      base: fmt(l.base),
      lineDiscount: fmt(l.lineDiscount),
      amount: fmt(l.amount),
      allocatedDiscount: fmt(l.allocated),
      taxable: fmt(l.taxable),
      rate: l.rate.toString(),
      cgst: fmt(l.cgst),
      sgst: fmt(l.sgst),
      igst: fmt(l.igst),
      gst: fmt(l.gst),
      tax: fmt(l.tax),
      total: fmt(l.total),
    })),
    grossTotal: fmt(sumDec(lines.map((l) => l.base))),
    lineDiscountTotal: fmt(sumDec(lines.map((l) => l.lineDiscount))),
    subtotal: fmt(subtotal),
    invoiceDiscount: fmt(invoiceDiscount),
    taxableTotal: fmt(taxableTotal),
    cgstTotal: fmt(cgstTotal),
    sgstTotal: fmt(sgstTotal),
    igstTotal: fmt(igstTotal),
    gstTotal: fmt(gstTotal),
    taxTotal: fmt(taxTotal),
    totalBeforeRoundOff: fmt(totalBeforeRoundOff),
    roundOff: fmt(roundOff),
    grandTotal: fmt(grandTotal),
    amountReceived: fmt(amountReceived),
    balanceDue: fmt(balanceDue),
    paymentStatus,
    taxSummary,
  };
}
