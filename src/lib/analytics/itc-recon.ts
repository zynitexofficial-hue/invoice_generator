import { bookTax, type BookDoc } from "@/lib/gst/gstr2b/books";
import { rowSign, rowTax } from "@/lib/gst/gstr2b/common";
import type { ReconResult } from "@/lib/gst/gstr2b/match";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { Gstr2bRow } from "@/lib/schema";

/**
 * ITC reconciliation analytics: turns the matcher's output for one or more
 * GSTR-2B imports into totals (matched, mismatched, missing in 2B, missing in
 * books, ineligible), by supplier and by period, plus a bridge that explains
 * the difference between ITC claimed in books and ITC available in GSTR-2B.
 * Amounts are tax (IGST + CGST + SGST + cess) in rupees; credit notes count
 * negative. Pure; money is Decimal and exposed as 2 dp text.
 */

export interface ItcReconImport {
  importId: string;
  /** "YYYY-MM". */
  periodKey: string;
  result: ReconResult;
}

export interface Bucket {
  count: number;
  /** 2B tax for 2B-based buckets, books tax for "missingIn2B". */
  itc: string;
}

export interface ItcReconTotals {
  matched: Bucket;
  probable: Bucket;
  mismatched: Bucket & { /** books − 2B on those documents. */ difference: string };
  missingIn2B: Bucket;
  missingInBooks: Bucket;
  /** 2B documents on which ITC is not available (and not reverse charge). */
  ineligible2B: Bucket;
  /** Bills in your books marked ineligible (not claimed). Supplied by the caller. */
  ineligibleBooks: Bucket;
}

export interface SupplierRecon {
  gstin: string;
  name: string;
  matched: string;
  mismatched: string;
  missingIn2B: string;
  missingInBooks: string;
  ineligible2B: string;
  /** Documents that need attention (mismatch + probable + missing). */
  needsAttention: number;
}

export interface PeriodRecon {
  periodKey: string;
  matched: string;
  mismatched: string;
  missingIn2B: string;
  missingInBooks: string;
  ineligible2B: string;
}

export interface BridgeLine {
  id: "pairs" | "missingIn2B" | "missingInBooks";
  label: string;
  amount: string;
}

export interface ItcReconReport {
  totals: ItcReconTotals;
  bySupplier: SupplierRecon[];
  byPeriod: PeriodRecon[];
  /** ITC claimed in books (eligible, not reverse charge) for the compared documents. */
  booksClaimed: string;
  /** ITC available per GSTR-2B (eligible, not reverse charge, not ignored). */
  available2B: string;
  /** booksClaimed − available2B. */
  difference: string;
  /** Lines that add up exactly to `difference`. */
  bridge: BridgeLine[];
  /** Largest first, for "what to chase". */
  needsAttention: number;
}

const t = (x: Dec) => roundTo(x, 2).toFixed(2);
const signedTax = (r: Gstr2bRow) => rowTax(r).times(rowSign(r));
/** ITC counted from a 2B row: zero when ITC is not available or the row is reverse charge. */
const availableTax = (r: Gstr2bRow) => (r.itcAvailable && !r.rcm ? signedTax(r) : ZERO);
const bookClaim = (b: BookDoc) => (b.itcEligible && !b.rcm ? bookTax(b) : ZERO);

interface Acc {
  matched: Dec;
  mismatched: Dec;
  missingIn2B: Dec;
  missingInBooks: Dec;
  ineligible2B: Dec;
  attention: number;
  name: string;
}
const newAcc = (name = ""): Acc => ({
  matched: ZERO,
  mismatched: ZERO,
  missingIn2B: ZERO,
  missingInBooks: ZERO,
  ineligible2B: ZERO,
  attention: 0,
  name,
});

export function itcReconReport(
  imports: ItcReconImport[],
  opts: { ineligibleBooks?: BookDoc[] } = {},
): ItcReconReport {
  let matched = { count: 0, itc: ZERO };
  let probable = { count: 0, itc: ZERO };
  let mismatched = { count: 0, itc: ZERO, diff: ZERO };
  let miss2B = { count: 0, itc: ZERO };
  let missBooks = { count: 0, itc: ZERO };
  let inel2B = { count: 0, itc: ZERO };
  let pairsDiff = ZERO;
  let booksClaimed = ZERO;
  let available = ZERO;
  const suppliers = new Map<string, Acc>();
  const periods = new Map<string, Acc>();
  const sup = (gstin: string, name: string) => {
    const k = gstin || name || "—";
    let a = suppliers.get(k);
    if (!a) suppliers.set(k, (a = newAcc(name)));
    if (!a.name && name) a.name = name;
    return a;
  };
  const per = (k: string) => {
    let a = periods.get(k);
    if (!a) periods.set(k, (a = newAcc()));
    return a;
  };

  for (const imp of imports) {
    const p = per(imp.periodKey);
    const countIneligible = (r: Gstr2bRow) => {
      if (r.itcAvailable || r.rcm) return;
      const v = signedTax(r);
      inel2B = { count: inel2B.count + 1, itc: inel2B.itc.plus(v) };
      sup(r.supplierGstin, r.supplierName).ineligible2B = sup(
        r.supplierGstin,
        r.supplierName,
      ).ineligible2B.plus(v);
      p.ineligible2B = p.ineligible2B.plus(v);
    };
    for (const m of imp.result.matches) {
      const row = m.row;
      const s = sup(row.supplierGstin, row.supplierName || m.book.name);
      const twoB = availableTax(row);
      const claim = bookClaim(m.book);
      available = available.plus(twoB);
      booksClaimed = booksClaimed.plus(claim);
      pairsDiff = pairsDiff.plus(claim.minus(twoB));
      const v = signedTax(row);
      countIneligible(row);
      if (m.status === "matched" || m.status === "manual") {
        matched = { count: matched.count + 1, itc: matched.itc.plus(twoB) };
        s.matched = s.matched.plus(twoB);
        p.matched = p.matched.plus(twoB);
      } else if (m.status === "probable") {
        probable = { count: probable.count + 1, itc: probable.itc.plus(twoB) };
        s.attention += 1;
      } else {
        const diff = bookTax(m.book).minus(rowTax(row));
        mismatched = {
          count: mismatched.count + 1,
          itc: mismatched.itc.plus(v),
          diff: mismatched.diff.plus(diff),
        };
        s.mismatched = s.mismatched.plus(diff);
        p.mismatched = p.mismatched.plus(diff);
        s.attention += 1;
      }
    }
    for (const r of imp.result.missingInBooks) {
      const v = availableTax(r);
      available = available.plus(v);
      countIneligible(r);
      if (r.itcAvailable && !r.rcm) {
        missBooks = { count: missBooks.count + 1, itc: missBooks.itc.plus(v) };
        const s = sup(r.supplierGstin, r.supplierName);
        s.missingInBooks = s.missingInBooks.plus(v);
        s.attention += 1;
        p.missingInBooks = p.missingInBooks.plus(v);
      }
    }
    for (const b of imp.result.missingIn2B) {
      const v = bookClaim(b);
      booksClaimed = booksClaimed.plus(v);
      miss2B = { count: miss2B.count + 1, itc: miss2B.itc.plus(v) };
      const s = sup(b.gstin, b.name);
      s.missingIn2B = s.missingIn2B.plus(v);
      s.attention += 1;
      p.missingIn2B = p.missingIn2B.plus(v);
    }
    // Other (imports/ISD) rows: ITC is available but claimed through 4A(1)/4A(4); not part of the bridge.
  }

  const ib = opts.ineligibleBooks ?? [];
  const ineligibleBooks = {
    count: ib.length,
    itc: ib.reduce((a, b) => a.plus(bookTax(b)), ZERO),
  };
  const diff = booksClaimed.minus(available);
  const attention = [...suppliers.values()].reduce((a, s) => a + s.attention, 0);
  const sup2 = [...suppliers.entries()]
    .map(([k, a]): SupplierRecon => ({
      gstin: /^\d{2}[A-Z0-9]{13}$/.test(k) ? k : "",
      name: a.name,
      matched: t(a.matched),
      mismatched: t(a.mismatched),
      missingIn2B: t(a.missingIn2B),
      missingInBooks: t(a.missingInBooks),
      ineligible2B: t(a.ineligible2B),
      needsAttention: a.attention,
    }))
    .sort(
      (x, y) =>
        y.needsAttention - x.needsAttention ||
        toDec(y.missingIn2B).abs().comparedTo(toDec(x.missingIn2B).abs()) ||
        (x.name || x.gstin).localeCompare(y.name || y.gstin),
    );

  return {
    totals: {
      matched: { count: matched.count, itc: t(matched.itc) },
      probable: { count: probable.count, itc: t(probable.itc) },
      mismatched: {
        count: mismatched.count,
        itc: t(mismatched.itc),
        difference: t(mismatched.diff),
      },
      missingIn2B: { count: miss2B.count, itc: t(miss2B.itc) },
      missingInBooks: { count: missBooks.count, itc: t(missBooks.itc) },
      ineligible2B: { count: inel2B.count, itc: t(inel2B.itc) },
      ineligibleBooks: { count: ineligibleBooks.count, itc: t(ineligibleBooks.itc) },
    },
    bySupplier: sup2,
    byPeriod: [...periods.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([periodKey, a]) => ({
        periodKey,
        matched: t(a.matched),
        mismatched: t(a.mismatched),
        missingIn2B: t(a.missingIn2B),
        missingInBooks: t(a.missingInBooks),
        ineligible2B: t(a.ineligible2B),
      })),
    booksClaimed: t(booksClaimed),
    available2B: t(available),
    difference: t(diff),
    bridge: [
      {
        id: "pairs",
        label: "Matched documents where your books and 2B differ",
        amount: t(pairsDiff),
      },
      { id: "missingIn2B", label: "Claimed in books but missing in 2B", amount: t(miss2B.itc) },
      {
        id: "missingInBooks",
        label: "In 2B but not in your books",
        amount: t(missBooks.itc.negated()),
      },
    ],
    needsAttention: attention,
  };
}
