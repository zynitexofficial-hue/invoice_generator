import { Dec, toDec } from "@/lib/money";

/**
 * Date-aware GST rate lists (spec B8). Verify on portal — rates change by
 * notification. Rates are in percent.
 */

/** First day of the rationalised rate structure (56th GST Council meeting). */
export const RATE_CHANGE_DATE = "2025-09-22";

export const RATES_BEFORE_CHANGE = [
  "0",
  "0.1",
  "0.25",
  "1.5",
  "3",
  "5",
  "6",
  "7.5",
  "12",
  "18",
  "28",
] as const;

export const RATES_FROM_CHANGE = ["0", "0.25", "1.5", "3", "5", "18", "28", "40"] as const;

/** Rates still accepted after the change but only with a warning. */
export const LEGACY_RATES_FROM_CHANGE = ["28"] as const;

export type RateCheck = "ok" | "warn" | "error";

/** Allowed rates for a document date ("" = today's structure). */
export function allowedRates(dateISO: string): readonly string[] {
  return dateISO && dateISO < RATE_CHANGE_DATE ? RATES_BEFORE_CHANGE : RATES_FROM_CHANGE;
}

function sameRate(a: string, b: string) {
  return toDec(a).equals(new Dec(b));
}

/**
 * "ok" when the rate is valid for the date, "warn" for 28% on/after
 * 22 Sep 2025 (legacy / tobacco transition), "error" otherwise.
 */
export function isRateAllowed(rate: string, dateISO: string): RateCheck {
  const text = rate.trim() === "" ? "0" : rate;
  if (!/^\s*\d+(\.\d+)?\s*$/.test(text)) return "error";
  const list = allowedRates(dateISO);
  if (!list.some((r) => sameRate(text, r))) return "error";
  if (list === RATES_FROM_CHANGE && LEGACY_RATES_FROM_CHANGE.some((r) => sameRate(text, r)))
    return "warn";
  return "ok";
}

export const RATE_WARNING_LABEL = "legacy/tobacco transition";
