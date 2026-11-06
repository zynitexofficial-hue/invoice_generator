import { Dec, toDec } from "@/lib/money";
import type { Gstr2bMatch, Gstr2bRow } from "@/lib/schema";
import { bookTax, type BookDoc } from "./books";
import { levenshtein, lastNumber, normalizeDocNo, rowTax } from "./common";

/**
 * Pure GSTR-2B ↔ books matcher. Each 2B row is matched to at most one book
 * document (purchase bill or GST expense) and each book document to at most
 * one row. Order of attempts:
 *   1. exact key: same supplier GSTIN + normalised document number
 *      → "matched" when value, taxes and date agree within tolerance,
 *        otherwise "mismatch" (with the differences listed);
 *   2. probable: same GSTIN, similar number (fuzzy) or same amounts and date,
 *      amounts within tolerance → "probable" (user should confirm);
 *   3. what is left: rows → "missing in books", book documents → "missing in 2B".
 * Manual decisions (stored in gstr2bMatches) are applied before 1.
 */

export interface MatchOptions {
  /** Largest accepted difference per amount (taxable, each tax head), in rupees. */
  amountTolerance: string;
  /** Largest date difference for an exact-number match. */
  dateToleranceDays: number;
  /** Largest date difference for a probable (fuzzy) match. */
  fuzzyDateDays: number;
}

export const DEFAULT_MATCH_OPTIONS: MatchOptions = {
  amountTolerance: "1.00",
  dateToleranceDays: 3,
  fuzzyDateDays: 15,
};

export type PairStatus = "matched" | "probable" | "mismatch" | "manual";

export interface RowMatch {
  row: Gstr2bRow;
  book: BookDoc;
  status: PairStatus;
  /** books − 2B, rupees (2 dp text). */
  taxableDiff: string;
  taxDiff: string;
  /** Absolute days between the two dates; null if either date is missing. */
  dateDiffDays: number | null;
  /** Plain-language reasons (what differs, or why it is only probable). */
  reasons: string[];
}

export interface ReconResult {
  matches: RowMatch[];
  /** 2B rows with no book document (includes rows the user unlinked). */
  missingInBooks: Gstr2bRow[];
  /** Book documents (ITC claimed) that are not in 2B, within `missingWindow`. */
  missingIn2B: BookDoc[];
  /** Rows the user chose to ignore. */
  ignored: Gstr2bRow[];
  /** Import of goods and ISD rows: no supplier invoice to match; claimed via 3B 4A(1)/4A(4). */
  other: Gstr2bRow[];
}

/** A user decision, as stored in gstr2bMatches. */
export type MatchOverride = Pick<Gstr2bMatch, "rowId" | "status" | "targetType" | "targetId">;

export function daysBetween(a: string, b: string): number | null {
  if (!a || !b) return null;
  const t = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const d = Math.abs(t(a) - t(b)) / 86_400_000;
  return Number.isFinite(d) ? Math.round(d) : null;
}

const abs = (d: Dec) => d.abs();

interface Compare {
  taxableDiff: Dec;
  taxDiff: Dec;
  heads: { name: string; diff: Dec }[];
  dateDiff: number | null;
}

function compare(row: Gstr2bRow, book: BookDoc): Compare {
  const heads = (["igst", "cgst", "sgst", "cess"] as const).map((h) => ({
    name: h.toUpperCase(),
    diff: toDec(book[h]).minus(toDec(row[h])),
  }));
  return {
    taxableDiff: toDec(book.taxable).minus(toDec(row.taxable)),
    taxDiff: bookTax(book).minus(rowTax(row)),
    heads,
    dateDiff: daysBetween(row.docDate, book.date),
  };
}

const rupees = (d: Dec) => d.toFixed(2);

function differences(c: Compare, tol: Dec, dateTol: number): string[] {
  const out: string[] = [];
  if (abs(c.taxableDiff).greaterThan(tol))
    out.push(`Taxable value differs by ₹${rupees(c.taxableDiff.abs())}`);
  for (const h of c.heads)
    if (abs(h.diff).greaterThan(tol)) out.push(`${h.name} differs by ₹${rupees(h.diff.abs())}`);
  if (c.dateDiff !== null && c.dateDiff > dateTol) out.push(`Dates are ${c.dateDiff} days apart`);
  return out;
}

const gstinKey = (g: string) => g.trim().toUpperCase();

function fuzzyNumber(a: string, b: string): boolean {
  const na = normalizeDocNo(a);
  const nb = normalizeDocNo(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const la = lastNumber(a);
  if (la && la === lastNumber(b)) return true;
  const min = Math.min(na.length, nb.length);
  if (min >= 4 && (na.includes(nb) || nb.includes(na))) return true;
  return levenshtein(na, nb) <= Math.max(1, Math.floor(min * 0.25));
}

function pair(row: Gstr2bRow, book: BookDoc, status: PairStatus, reasons: string[], c: Compare) {
  return {
    row,
    book,
    status,
    taxableDiff: rupees(c.taxableDiff),
    taxDiff: rupees(c.taxDiff),
    dateDiffDays: c.dateDiff,
    reasons,
  } satisfies RowMatch;
}

export interface ReconcileInput {
  rows: Gstr2bRow[];
  books: BookDoc[];
  overrides?: MatchOverride[];
  options?: Partial<MatchOptions>;
  /** Only book documents whose periodDate is in this range are reported as missing in 2B. */
  missingWindow?: { start: string; end: string };
}

export function reconcile(input: ReconcileInput): ReconResult {
  const opt = { ...DEFAULT_MATCH_OPTIONS, ...input.options };
  const tol = toDec(opt.amountTolerance);
  const overrides = new Map((input.overrides ?? []).map((o) => [o.rowId, o]));
  const used = new Set<string>();
  const matches: RowMatch[] = [];
  const missingInBooks: Gstr2bRow[] = [];
  const ignored: Gstr2bRow[] = [];
  const other: Gstr2bRow[] = [];
  const byKey = new Map(input.books.map((b) => [b.key, b]));

  // Amendments first, so an amended row claims the book document before the original does.
  const amendFirst = [...input.rows].sort(
    (a, b) =>
      Number(b.section === "b2ba" || b.section === "cdnra") -
      Number(a.section === "b2ba" || a.section === "cdnra"),
  );
  const pending: Gstr2bRow[] = [];

  for (const row of amendFirst) {
    const ov = overrides.get(row.id);
    if (ov?.status === "ignored") {
      ignored.push(row);
      continue;
    }
    if (row.section === "impg" || row.section === "isd") {
      other.push(row);
      continue;
    }
    if (ov?.status === "unmatched") {
      missingInBooks.push(row);
      continue;
    }
    if (ov?.status === "manual" && ov.targetId) {
      const book = byKey.get(`${ov.targetType}:${ov.targetId}`);
      if (book && !used.has(book.key)) {
        used.add(book.key);
        const c = compare(row, book);
        matches.push(pair(row, book, "manual", differences(c, tol, opt.dateToleranceDays), c));
        continue;
      }
    }
    pending.push(row);
  }

  // 1. exact number
  const index = new Map<string, BookDoc[]>();
  for (const b of input.books) {
    if (used.has(b.key) || !b.gstin || !b.docNo) continue;
    const k = `${gstinKey(b.gstin)}|${normalizeDocNo(b.docNo)}`;
    index.set(k, [...(index.get(k) ?? []), b]);
  }
  const afterExact: Gstr2bRow[] = [];
  for (const row of pending) {
    const keys = [row.docNo, row.origDocNo]
      .filter(Boolean)
      .map((n) => `${gstinKey(row.supplierGstin)}|${normalizeDocNo(n)}`);
    let best: { book: BookDoc; c: Compare } | undefined;
    for (const k of keys)
      for (const book of index.get(k) ?? []) {
        if (used.has(book.key)) continue;
        const c = compare(row, book);
        if (!best || abs(c.taxDiff).lessThan(abs(best.c.taxDiff))) best = { book, c };
      }
    if (!row.supplierGstin || !best) {
      afterExact.push(row);
      continue;
    }
    used.add(best.book.key);
    const reasons = differences(best.c, tol, opt.dateToleranceDays);
    matches.push(pair(row, best.book, reasons.length ? "mismatch" : "matched", reasons, best.c));
  }

  // 2. probable
  for (const row of afterExact) {
    let best: { book: BookDoc; c: Compare; score: number; why: string } | undefined;
    if (row.supplierGstin) {
      for (const book of input.books) {
        if (used.has(book.key) || gstinKey(book.gstin) !== gstinKey(row.supplierGstin)) continue;
        const c = compare(row, book);
        const amountsOk =
          abs(c.taxableDiff).lessThanOrEqualTo(tol) &&
          c.heads.every((h) => abs(h.diff).lessThanOrEqualTo(tol));
        if (!amountsOk) continue;
        const dd = c.dateDiff ?? 999;
        const fuzzy = fuzzyNumber(row.docNo, book.docNo);
        let why = "";
        if (fuzzy && dd <= opt.fuzzyDateDays)
          why = `Invoice numbers look alike ("${row.docNo}" vs "${book.docNo}")`;
        else if (dd <= opt.dateToleranceDays && bookTax(book).greaterThan(0))
          why = `Same supplier, date and amounts, but a different number ("${row.docNo}" vs "${book.docNo || "none"}")`;
        if (!why) continue;
        const score = levenshtein(normalizeDocNo(row.docNo), normalizeDocNo(book.docNo)) + dd / 10;
        if (!best || score < best.score) best = { book, c, score, why };
      }
    }
    if (!best) {
      missingInBooks.push(row);
      continue;
    }
    used.add(best.book.key);
    matches.push(pair(row, best.book, "probable", [best.why], best.c));
  }

  const w = input.missingWindow;
  const missingIn2B = input.books.filter(
    (b) =>
      !used.has(b.key) &&
      b.itcEligible &&
      !b.rcm &&
      (!w || (b.periodDate >= w.start && b.periodDate <= w.end)),
  );
  return { matches, missingInBooks, missingIn2B, ignored, other };
}

/** The stored match row for a manual decision on one 2B row. */
export function overrideRecord(
  importId: string,
  row: Gstr2bRow,
  decision: { kind: "accept"; book: BookDoc } | { kind: "unlink" } | { kind: "ignore" },
  note = "",
): Partial<Gstr2bMatch> {
  const base = { id: `${importId}:${row.id}`, importId, rowId: row.id, note };
  if (decision.kind === "accept") {
    const c = compare(row, decision.book);
    return {
      ...base,
      status: "manual",
      targetType: decision.book.targetType,
      targetId: decision.book.targetId,
      taxableDiff: rupees(c.taxableDiff),
      taxDiff: rupees(c.taxDiff),
    };
  }
  return {
    ...base,
    status: decision.kind === "ignore" ? "ignored" : "unmatched",
    targetType: "",
    targetId: "",
    taxableDiff: "0.00",
    taxDiff: "0.00",
  };
}

export const matchRowId = (importId: string, rowId: string) => `${importId}:${rowId}`;

/** Counts per bucket for the summary strip. */
export function reconSummary(r: ReconResult) {
  const count = (s: PairStatus) => r.matches.filter((m) => m.status === s).length;
  return {
    matched: count("matched"),
    probable: count("probable"),
    mismatch: count("mismatch"),
    manual: count("manual"),
    missingInBooks: r.missingInBooks.length,
    missingIn2B: r.missingIn2B.length,
    ignored: r.ignored.length,
    other: r.other.length,
  };
}
