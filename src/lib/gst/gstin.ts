import { isValidStateCode } from "./states";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

/** 2-digit state, 10-char PAN, entity number, "Z", check character. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normalizeGstin(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Compute the GSTIN check character for the first 14 characters (mod-36 Luhn variant). */
export function gstinCheckChar(first14: string): string {
  const body = first14.toUpperCase();
  if (body.length !== 14) throw new Error("GSTIN body must be 14 characters");
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const value = CHARSET.indexOf(body[i]);
    if (value < 0) throw new Error(`Invalid GSTIN character: ${body[i]}`);
    const factor = i % 2 === 0 ? 1 : 2;
    const product = value * factor;
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export type GstinProblem = "empty" | "length" | "format" | "state" | "checksum";

export interface GstinCheck {
  valid: boolean;
  problem?: GstinProblem;
  stateCode?: string;
  message?: string;
}

export function checkGstin(raw: string): GstinCheck {
  const value = normalizeGstin(raw);
  if (!value) return { valid: false, problem: "empty", message: "GSTIN is empty" };
  if (value.length !== 15)
    return { valid: false, problem: "length", message: "GSTIN must be 15 characters" };
  if (!GSTIN_PATTERN.test(value))
    return { valid: false, problem: "format", message: "GSTIN format looks incorrect" };
  const stateCode = value.slice(0, 2);
  if (!isValidStateCode(stateCode))
    return {
      valid: false,
      problem: "state",
      stateCode,
      message: `GSTIN starts with an unknown state code (${stateCode})`,
    };
  if (gstinCheckChar(value.slice(0, 14)) !== value[14])
    return {
      valid: false,
      problem: "checksum",
      stateCode,
      message: "GSTIN check digit doesn't match — please re-check for typos",
    };
  return { valid: true, stateCode };
}

/** State code derived from a GSTIN, if the prefix is a known state. */
export function stateFromGstin(raw: string): string | undefined {
  const value = normalizeGstin(raw);
  const code = value.slice(0, 2);
  return /^\d{2}$/.test(code) && isValidStateCode(code) ? code : undefined;
}

export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;
export const UPI_PATTERN = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;
