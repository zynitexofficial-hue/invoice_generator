import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { Gstr2bRow } from "@/lib/schema";

/**
 * Shared helpers for the GSTR-2B import and matching code. Pure; no React/Dexie.
 * Everything parsed from a portal file is a DRAFT of what the portal shows —
 * compare with the portal before claiming ITC.
 */

export interface ParsedGstr2b {
  /** Return month "YYYY-MM", or "" when the file does not say. */
  periodKey: string;
  /** Recipient GSTIN, or "". */
  gstin: string;
  rows: Gstr2bRow[];
  /** Plain-language problems found while reading (never thrown). */
  warnings: string[];
  /** Rows read per portal section, for the import summary. */
  sectionCounts: Record<string, number>;
}

export const money2 = (d: Dec): string => roundTo(d, 2).toFixed(2);
export const amountText = (v: unknown): string => money2(toDec(v as string | number | null));

export function cleanGstin(v: unknown): string {
  return typeof v === "string" ? v.trim().toUpperCase().replace(/\s+/g, "") : "";
}

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");

/**
 * Portal dates are dd-mm-yyyy (verify). Also accepts dd/mm/yyyy, yyyy-mm-dd and
 * dd-Mon-yyyy. Returns ISO "YYYY-MM-DD" or "" when unreadable.
 */
export function parsePortalDate(v: unknown): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  let y: number;
  let m: number;
  let d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (r) [y, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s)))
    [d, m, y] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[-/ ]([A-Za-z]{3})[a-z]*[-/ ,]+(\d{4})$/.exec(s))) {
    const idx = MONTHS.indexOf(r[2].toLowerCase());
    if (idx < 0) return "";
    [d, m, y] = [Number(r[1]), idx + 1, Number(r[3])];
  } else return "";
  if (m < 1 || m > 12 || d < 1 || d > 31) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Return period "MMYYYY" (portal `rtnprd`), "YYYY-MM" or "Oct-2026" → "YYYY-MM". */
export function parseReturnPeriod(v: unknown): string {
  if (typeof v !== "string" && typeof v !== "number") return "";
  const s = String(v).trim();
  let r = /^(0[1-9]|1[0-2])(\d{4})$/.exec(s);
  if (r) return `${r[2]}-${r[1]}`;
  r = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(s);
  if (r) return s;
  r = /^([A-Za-z]{3})[a-z]*[-/ ](\d{4})$/.exec(s);
  if (r) {
    const idx = MONTHS.indexOf(r[1].toLowerCase());
    if (idx >= 0) return `${r[2]}-${String(idx + 1).padStart(2, "0")}`;
  }
  return "";
}

/** Portal flags use "Y"/"N" (and sometimes true/false, "Yes"/"No"). */
export function yes(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") return /^(y|yes|true|1)$/i.test(v.trim());
  return false;
}

/**
 * Invoice-number key for matching: uppercase, leading zeros of every digit run
 * dropped, then punctuation removed ("INV/0012" and "inv-12" both → "INV12";
 * "INV/26-27/0012" and "INV/26-27/12" both → "INV262712").
 */
export function normalizeDocNo(v: string): string {
  // Trim zeros per digit run BEFORE dropping punctuation, otherwise
  // "INV/26-27/0012" would fuse into one run and never equal "INV/26-27/12".
  return v
    .toUpperCase()
    .replace(/\d+/g, (run) => run.replace(/^0+(?=\d)/, ""))
    .replace(/[^A-Z0-9]/g, "");
}

/** Last run of digits without leading zeros ("INV/26-27/0012" → "12"); "" if none. */
export function lastNumber(v: string): string {
  const runs = v.match(/\d+/g);
  if (!runs) return "";
  return runs[runs.length - 1].replace(/^0+(?=\d)/, "");
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

export const rowTax = (r: Pick<Gstr2bRow, "igst" | "cgst" | "sgst" | "cess">): Dec =>
  toDec(r.igst).plus(toDec(r.cgst)).plus(toDec(r.sgst)).plus(toDec(r.cess));

/** Credit notes reduce ITC; everything else adds. */
export const rowSign = (r: Pick<Gstr2bRow, "docType">): 1 | -1 =>
  r.docType === "credit_note" ? -1 : 1;

export { Dec, ZERO, toDec };
