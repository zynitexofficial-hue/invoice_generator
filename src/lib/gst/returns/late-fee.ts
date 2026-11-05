import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { daysFromTo } from "./due-dates";

/**
 * Late fee and interest ESTIMATE (spec F10). Not a demand computation — the
 * portal computes the actual amounts. Verify on portal; caps follow
 * Notification 19/2021-CT (GSTR-3B) and are applied to the total, split
 * equally between CGST and SGST.
 */

export const LATE_FEE_PER_DAY = 50;
export const NIL_LATE_FEE_PER_DAY = 20;
export const INTEREST_RATE_PA = 18;

/** Total caps (CGST + SGST) by AATO. */
export const LATE_FEE_CAPS = {
  nil: 500,
  upTo1_5Cr: 2000,
  upTo5Cr: 5000,
  above5Cr: 10000,
} as const;

const CRORE = new Dec(10_000_000);

export interface LateFeeInput {
  dueDate: string;
  /** Filing date, or today for a not-yet-filed return. */
  filedDate: string;
  /** Nil return (no outward supplies and no liability). */
  nil?: boolean;
  /** Aggregate annual turnover (₹) as decimal text. Empty = unknown (highest cap used). */
  aato?: string;
  /** Tax paid in cash late (net of ITC), for interest. */
  netCashTax?: string;
}

export interface LateFeeEstimate {
  daysLate: number;
  perDay: number;
  /** Total cap applied (₹). */
  cap: string;
  lateFee: { cgst: string; sgst: string; total: string };
  interest: string;
  total: string;
  notes: string[];
}

export function lateFeeCap(nil: boolean, aato: string | undefined): Dec {
  if (nil) return new Dec(LATE_FEE_CAPS.nil);
  const text = (aato ?? "").trim();
  if (!text) return new Dec(LATE_FEE_CAPS.above5Cr);
  const value = toDec(text);
  if (value.lessThanOrEqualTo(CRORE.mul(1.5))) return new Dec(LATE_FEE_CAPS.upTo1_5Cr);
  if (value.lessThanOrEqualTo(CRORE.mul(5))) return new Dec(LATE_FEE_CAPS.upTo5Cr);
  return new Dec(LATE_FEE_CAPS.above5Cr);
}

export function estimateLateFee(input: LateFeeInput): LateFeeEstimate {
  const nil = Boolean(input.nil);
  const daysLate =
    input.dueDate && input.filedDate ? Math.max(0, daysFromTo(input.dueDate, input.filedDate)) : 0;
  const perDay = nil ? NIL_LATE_FEE_PER_DAY : LATE_FEE_PER_DAY;
  const cap = lateFeeCap(nil, input.aato);
  const fee = Dec.min(new Dec(perDay).mul(daysLate), cap);
  const cgst = roundTo(fee.div(2), 2);
  const sgst = fee.minus(cgst);
  const tax = Dec.max(toDec(input.netCashTax), ZERO);
  const interest = roundTo(tax.mul(INTEREST_RATE_PA).div(100).mul(daysLate).div(365), 2);
  const notes = [
    "Estimate only — the GST portal computes the actual late fee and interest.",
    `Late fee ₹${perDay}/day (₹${perDay / 2} CGST + ₹${perDay / 2} SGST), capped at ₹${cap.toFixed(0)} in total.`,
    `Interest ${INTEREST_RATE_PA}% a year on tax paid late in cash, for ${daysLate} day(s).`,
  ];
  if (!nil && !(input.aato ?? "").trim())
    notes.push("Turnover (AATO) is not set, so the highest cap is used.");
  return {
    daysLate,
    perDay,
    cap: cap.toFixed(2),
    lateFee: { cgst: cgst.toFixed(2), sgst: sgst.toFixed(2), total: fee.toFixed(2) },
    interest: interest.toFixed(2),
    total: fee.plus(interest).toFixed(2),
    notes,
  };
}
