import { toDec } from "@/lib/money";
import { UPI_PATTERN } from "@/lib/gst/gstin";

export interface UpiPaymentInput {
  upiId: string;
  payeeName: string;
  amount?: string;
  note?: string;
}

/**
 * Build a UPI deep link (NPCI "upi://pay" format) for a QR code.
 * Values are percent-encoded with encodeURIComponent so spaces become %20,
 * which every UPI app decodes correctly.
 */
export function buildUpiUri(input: UpiPaymentInput): string | null {
  const params = buildUpiParams(input);
  return params ? `upi://pay?${params}` : null;
}

/** The query part of a UPI link ("pa=…&pn=…&am=…"), or null for an invalid UPI ID. */
export function buildUpiParams({ upiId, payeeName, amount, note }: UpiPaymentInput): string | null {
  const pa = upiId.trim();
  if (!UPI_PATTERN.test(pa)) return null;
  const params: [string, string][] = [["pa", pa]];
  const pn = payeeName.trim();
  if (pn) params.push(["pn", pn.slice(0, 50)]);
  if (amount !== undefined) {
    const value = toDec(amount);
    if (value.greaterThan(0)) params.push(["am", value.toFixed(2)]);
  }
  params.push(["cu", "INR"]);
  const tn = note?.trim();
  if (tn) params.push(["tn", tn.slice(0, 80)]);
  return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
}

/** Page that opens the payer's UPI app; details travel in the #fragment, never to a server. */
export const PAY_PAGE_PATH = "/pay";

export function payPageHref(origin: string, upiParams: string) {
  return `${origin}${PAY_PAGE_PATH}#${upiParams}`;
}
