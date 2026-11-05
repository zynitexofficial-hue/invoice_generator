import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { RateItem, SectionTotals, TaxValues } from "./types";

/** Internal helpers shared by the return modules (not re-exported from index.ts). */

export const fmt2 = (d: Dec) => roundTo(d, 2).toFixed(2);

/** Normalised rate text: "18.00" → "18", "0.250" → "0.25". */
export function normRate(rate: string): string {
  const d = toDec(rate);
  return d.isZero() ? "0" : d.toString();
}

export interface DecHeads {
  taxable: Dec;
  igst: Dec;
  cgst: Dec;
  sgst: Dec;
  cess: Dec;
}

export const zeroHeads = (): DecHeads => ({
  taxable: ZERO,
  igst: ZERO,
  cgst: ZERO,
  sgst: ZERO,
  cess: ZERO,
});

export function addHeads(acc: DecHeads, v: DecHeads, sign: 1 | -1 = 1): DecHeads {
  return {
    taxable: acc.taxable.plus(v.taxable.mul(sign)),
    igst: acc.igst.plus(v.igst.mul(sign)),
    cgst: acc.cgst.plus(v.cgst.mul(sign)),
    sgst: acc.sgst.plus(v.sgst.mul(sign)),
    cess: acc.cess.plus(v.cess.mul(sign)),
  };
}

export function headsFromValues(v: TaxValues): DecHeads {
  return {
    taxable: toDec(v.taxable),
    igst: toDec(v.igst),
    cgst: toDec(v.cgst),
    sgst: toDec(v.sgst),
    cess: toDec(v.cess),
  };
}

export function headsToValues(h: DecHeads): TaxValues {
  return {
    taxable: fmt2(h.taxable),
    igst: fmt2(h.igst),
    cgst: fmt2(h.cgst),
    sgst: fmt2(h.sgst),
    cess: fmt2(h.cess),
  };
}

export function isZeroHeads(h: DecHeads): boolean {
  return (
    h.taxable.isZero() && h.igst.isZero() && h.cgst.isZero() && h.sgst.isZero() && h.cess.isZero()
  );
}

export const taxOf = (h: DecHeads) => h.igst.plus(h.cgst).plus(h.sgst).plus(h.cess);

export function totalsOf(rows: TaxValues[], count = rows.length, sign: 1 | -1 = 1): SectionTotals {
  const sum = rows.reduce((acc, r) => addHeads(acc, headsFromValues(r), sign), zeroHeads());
  return { count, ...headsToValues(sum) };
}

export function sumItems(items: RateItem[]): DecHeads {
  return items.reduce((acc, r) => addHeads(acc, headsFromValues(r)), zeroHeads());
}

export function compareRate(a: string, b: string) {
  return toDec(a).comparedTo(toDec(b));
}

export const toNum2 = (v: string | Dec) => Number(toDec(String(v)).toFixed(2));

export { Dec, ZERO, toDec, roundTo };
