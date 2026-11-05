import Decimal from "decimal.js";

/**
 * Decimal constructor used for every monetary calculation.
 * High precision for intermediate steps; explicit half-up (away from zero)
 * rounding whenever we round to a currency's minor unit.
 */
export const Dec = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Dec = InstanceType<typeof Dec>;

export const ZERO = new Dec(0);
export const HUNDRED = new Dec(100);

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Normalize user-typed numeric text ("1,234.50", " 12 ") to a plain decimal string. */
export function normalizeNumeric(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "";
  return String(input)
    .replace(/[,\s_]/g, "")
    .trim();
}

/** Parse leniently: anything that isn't a finite decimal becomes 0. */
export function toDec(input: string | number | null | undefined): Dec {
  const s = normalizeNumeric(input);
  if (s === "" || s === "-" || s === ".") return ZERO;
  const candidate = s.startsWith(".") ? `0${s}` : s.endsWith(".") ? s.slice(0, -1) : s;
  if (!DECIMAL_RE.test(candidate)) return ZERO;
  return new Dec(candidate);
}

export interface DecimalCheckOptions {
  maxDecimals?: number;
  allowNegative?: boolean;
  allowEmpty?: boolean;
}

/** Strict check used by validation: is this a well-formed decimal string? */
export function isValidDecimal(input: string, opts: DecimalCheckOptions = {}): boolean {
  const { maxDecimals = 10, allowNegative = false, allowEmpty = false } = opts;
  const s = normalizeNumeric(input);
  if (s === "") return allowEmpty;
  const candidate = s.startsWith(".") ? `0${s}` : s;
  if (!DECIMAL_RE.test(candidate)) return false;
  if (!allowNegative && candidate.startsWith("-")) return false;
  const decimals = candidate.split(".")[1]?.length ?? 0;
  return decimals <= maxDecimals;
}

/** Characters allowed while typing a decimal into an input. */
export function sanitizeDecimalInput(raw: string, maxDecimals: number): string {
  let s = raw.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
    if (maxDecimals === 0) return s.slice(0, firstDot);
    const [int, frac] = s.split(".");
    s = `${int}.${frac.slice(0, maxDecimals)}`;
  }
  return s;
}

export function roundTo(value: Dec, decimals: number): Dec {
  return value.toDecimalPlaces(decimals, Dec.ROUND_HALF_UP);
}

export function clampDec(value: Dec, min: Dec, max: Dec): Dec {
  if (value.lessThan(min)) return min;
  if (value.greaterThan(max)) return max;
  return value;
}

export function sumDec(values: Dec[]): Dec {
  return values.reduce((acc, v) => acc.plus(v), ZERO);
}
