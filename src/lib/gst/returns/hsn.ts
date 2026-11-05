import type { AppSettings } from "@/lib/schema";
import type { ClassifiedDoc } from "./classify";
import {
  addHeads,
  compareRate,
  fmt2,
  headsToValues,
  taxOf,
  zeroHeads,
  type DecHeads,
} from "./internal";
import { Dec, ZERO, toDec } from "@/lib/money";
import type { HsnRow } from "./types";

/**
 * GSTR-1 Table 12 (HSN summary), split into B2B and B2C tabs (advisory
 * 1 May 2025). Verify on portal.
 */

const FIVE_CRORE = new Dec(50_000_000);

/** Minimum HSN digits: settings.gst.hsnDigits, raised to 6 when AATO > ₹5 crore (spec B11). */
export function requiredHsnDigits(settings: AppSettings): 4 | 6 {
  const aato = settings.gst.aato.trim();
  if (settings.gst.hsnDigits === 6) return 6;
  if (aato && toDec(aato).greaterThan(FIVE_CRORE)) return 6;
  return 4;
}

export type HsnCheck = "ok" | "missing" | "invalid" | "too_short" | "sac_short";

/** SAC codes (services) start with 99. */
export function isSac(hsn: string): boolean {
  return /^99/.test(hsn.trim());
}

/**
 * Check one HSN/SAC code: digits only, at least the required digits;
 * "sac_short" = a service code shorter than the recommended 6 digits.
 */
export function checkHsn(hsn: string, minDigits: number): HsnCheck {
  const code = hsn.trim();
  if (!code) return "missing";
  if (!/^\d{2,8}$/.test(code)) return "invalid";
  if (code.length < minDigits) return "too_short";
  if (isSac(code) && code.length < 6) return "sac_short";
  return "ok";
}

interface Acc extends DecHeads {
  hsn: string;
  description: string;
  uqc: string;
  rate: string;
  qty: Dec;
}

function toRows(map: Map<string, Acc>): HsnRow[] {
  return [...map.values()]
    .sort((a, b) =>
      a.hsn !== b.hsn
        ? a.hsn.localeCompare(b.hsn)
        : a.uqc !== b.uqc
          ? a.uqc.localeCompare(b.uqc)
          : compareRate(a.rate, b.rate),
    )
    .map((a) => ({
      hsn: a.hsn,
      description: a.description,
      uqc: a.uqc,
      qty: a.qty.toFixed(2),
      rate: a.rate,
      ...headsToValues(a),
      totalValue: fmt2(a.taxable.plus(taxOf(a))),
    }));
}

/**
 * Aggregate all lines of the classified documents by HSN + UQC + rate.
 * Documents to registered recipients (B2B, CDNR, NIL-registered) go to the
 * B2B tab; everything else to B2C. Credit notes subtract values (and
 * quantity only for sales returns); debit notes add values only.
 */
export function buildHsnSummary(docs: ClassifiedDoc[]): { b2b: HsnRow[]; b2c: HsnRow[] } {
  const tabs = { b2b: new Map<string, Acc>(), b2c: new Map<string, Acc>() };
  for (const doc of docs) {
    const map = tabs[doc.registered ? "b2b" : "b2c"];
    const isNote = doc.noteType !== null;
    const qtySign = !isNote
      ? 1
      : doc.noteType === "C" && doc.invoice.note.reason === "sales_return"
        ? -1
        : 0;
    for (const line of doc.lines) {
      const key = `${line.hsn}|${line.uqc}|${line.rate}`;
      let acc = map.get(key);
      if (!acc) {
        acc = {
          hsn: line.hsn,
          description: line.description,
          uqc: line.uqc,
          rate: line.rate,
          qty: ZERO,
          ...zeroHeads(),
        };
        map.set(key, acc);
      }
      if (!acc.description && line.description) acc.description = line.description;
      Object.assign(acc, addHeads(acc, line, doc.sign));
      acc.qty = acc.qty.plus(line.qty.mul(qtySign));
    }
  }
  return { b2b: toRows(tabs.b2b), b2c: toRows(tabs.b2c) };
}
