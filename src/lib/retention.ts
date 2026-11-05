import { isDraft, isIssued } from "@/lib/invoice-calc";
import { fyStartYear } from "@/lib/period";
import type { Invoice } from "@/lib/schema";

/**
 * Retention helper (spec H5). Pure counting only — nothing is ever deleted
 * automatically, and issued documents are never offered for deletion.
 *
 * GST law (CGST Act s.36) requires keeping records for 72 months from the due
 * date of the annual return for the year — roughly 6¾ years after the
 * financial year ends — so the minimum setting is 6 full financial years and
 * the default is 8.
 */

export const MIN_RETENTION_YEARS = 6;
export const DEFAULT_RETENTION_YEARS = 8;
export const OLD_DRAFT_DAYS = 365;

/**
 * True when the document's financial year ended more than `years` full
 * financial years before the current one began. Example with 8 years in
 * FY 2026-27: documents dated in FY 2017-18 or earlier.
 */
export function isPastRetention(dateISO: string, todayISO: string, years: number): boolean {
  if (!dateISO) return false;
  const keep = Math.max(MIN_RETENTION_YEARS, Math.floor(years) || DEFAULT_RETENTION_YEARS);
  return fyStartYear(todayISO) - fyStartYear(dateISO) > keep;
}

/** Last-touched date of a draft (YYYY-MM-DD). */
function draftDate(inv: Invoice): string {
  return (inv.updatedAt || inv.createdAt || inv.invoiceDate || "").slice(0, 10);
}

export function isOldDraft(inv: Invoice, now: Date, days = OLD_DRAFT_DAYS): boolean {
  if (!isDraft(inv) || inv.status === "cancelled") return false;
  const d = draftDate(inv);
  if (!d) return false;
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  return d < cutoff;
}

export interface RetentionReport {
  /** Issued documents older than the retention period (kept; informational). */
  issuedPastRetention: number;
  /** Drafts not touched for a year — can be exported and then deleted. */
  oldDrafts: Invoice[];
}

export function retentionReport(
  invoices: Invoice[],
  years: number,
  now = new Date(),
): RetentionReport {
  const today = now.toISOString().slice(0, 10);
  let issuedPastRetention = 0;
  const oldDrafts: Invoice[] = [];
  for (const inv of invoices) {
    if (isIssued(inv) && isPastRetention(inv.invoiceDate, today, years)) issuedPastRetention++;
    if (isOldDraft(inv, now)) oldDrafts.push(inv);
  }
  return { issuedPastRetention, oldDrafts };
}
