import { checkGstin, normalizeGstin } from "@/lib/gst/gstin";
import { isExportInvoice } from "@/lib/gst/returns/classify";
import { isIssued } from "@/lib/invoice-calc";
import { Dec, toDec } from "@/lib/money";
import type { AppSettings, Invoice } from "@/lib/schema";

/**
 * E-invoice applicability and time windows (feature B). Pure.
 *
 * Rules encoded here come from plans/business-gst-suite.md §3.2 and change
 * by notification: VERIFY THEM ON THE E-INVOICE PORTAL before relying on them.
 */

/** AATO (₹) from which the IRP reporting window of 30 days applies (₹10 crore). */
export const REPORTING_WINDOW_AATO = new Dec(100_000_000);

/** An IRN can be cancelled on the IRP within 24 hours of generation. */
export const CANCEL_WINDOW_HOURS = 24;

const aatoOf = (settings: AppSettings): Dec => toDec(settings.gst.aato);

/** True when the taxpayer's AATO reaches the e-invoice threshold (₹5 crore by default). */
export function aatoAboveThreshold(settings: AppSettings): boolean {
  const aato = aatoOf(settings);
  return (
    aato.greaterThan(0) && aato.greaterThanOrEqualTo(toDec(settings.eInvoice.turnoverThreshold))
  );
}

/** E-invoicing tab shows only when the user said it applies, or AATO is above the threshold. */
export function isEInvoiceApplicable(settings: AppSettings): boolean {
  if (settings.gst.registrationType !== "regular") return false;
  return settings.gst.eInvoiceApplicable || aatoAboveThreshold(settings);
}

/** Days within which an invoice must be reported (null = no mandatory window known). */
export function reportingWindowDays(settings: AppSettings): number | null {
  const aato = aatoOf(settings);
  return aato.greaterThanOrEqualTo(REPORTING_WINDOW_AATO)
    ? settings.eInvoice.reportingWindowDays
    : null;
}

export type IneligibleReason =
  "not_issued" | "wrong_type" | "export" | "not_b2b" | "foreign_currency";

export const INELIGIBLE_MESSAGES: Record<IneligibleReason, string> = {
  not_issued: "Not issued yet (draft).",
  wrong_type: "Only tax invoices, credit notes and debit notes are e-invoiced.",
  export: "Exports are not covered by this tool.",
  not_b2b: "The customer has no valid GSTIN, so this is a B2C document (no e-invoice).",
  foreign_currency: "Foreign-currency documents are not covered by this tool.",
};

const TYPES: Invoice["docType"][] = ["tax_invoice", "credit_note", "debit_note"];

/**
 * Why a document cannot be e-invoiced with this tool, or null when it is a
 * B2B tax invoice / credit note / debit note. Cancelled documents are still
 * eligible here (their IRN may need cancelling).
 */
export function ineligibleReason(inv: Invoice): IneligibleReason | null {
  if (!TYPES.includes(inv.docType)) return "wrong_type";
  if (!isIssued(inv)) return "not_issued";
  if (isExportInvoice(inv)) return "export";
  if (inv.currency !== "INR") return "foreign_currency";
  const gstin = normalizeGstin(inv.customer.gstin);
  if (!gstin || !checkGstin(gstin).valid) return "not_b2b";
  return null;
}

export const isEInvoiceEligible = (inv: Invoice) => ineligibleReason(inv) === null;

/* ---------------- Windows ---------------- */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole calendar days from `fromISO` to `toISO` (both YYYY-MM-DD). */
export function daysBetween(fromISO: string, toISO: string): number {
  const a = Date.parse(`${fromISO}T00:00:00Z`);
  const b = Date.parse(`${toISO}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export interface ReportingStatus {
  /** Last date to report (invoice date + window), or "" with no window. */
  deadline: string;
  /** Days left (negative = overdue). null when no window applies. */
  daysLeft: number | null;
  state: "none" | "ok" | "soon" | "overdue";
}

/** 30-day reporting window (AATO ≥ ₹10 crore). "soon" = 5 days or fewer left. */
export function reportingStatus(
  inv: Pick<Invoice, "invoiceDate">,
  settings: AppSettings,
  today: string,
): ReportingStatus {
  const days = reportingWindowDays(settings);
  if (days === null || !inv.invoiceDate) return { deadline: "", daysLeft: null, state: "none" };
  const dl = new Date(Date.parse(`${inv.invoiceDate}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const daysLeft = daysBetween(today, dl);
  return {
    deadline: dl,
    daysLeft,
    state: daysLeft < 0 ? "overdue" : daysLeft <= 5 ? "soon" : "ok",
  };
}

/**
 * Parse an IRP acknowledgement date ("2026-10-05 14:32:10", ISO, or
 * "05/10/2026 14:32:10") to epoch ms. IRP times are IST (UTC+5:30) when no
 * offset is given. NaN when unreadable.
 */
export function parseAckDate(text: string): number {
  const t = text.trim();
  if (!t) return NaN;
  const dmy = /^(\d{2})[/-](\d{2})[/-](\d{4})(?:[ T](\d{2}:\d{2}(?::\d{2})?))?$/.exec(t);
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}T${dmy[4] ?? "00:00:00"}` : t.replace(" ", "T");
  const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(iso);
  const withSecs = /T\d{2}:\d{2}$/.test(iso) ? `${iso}:00` : iso;
  return Date.parse(hasZone ? withSecs : `${withSecs}+05:30`);
}

export interface CancelWindow {
  state: "none" | "open" | "closed";
  /** Hours left while open (rounded down). */
  hoursLeft: number;
  /** ISO timestamp when the window closes. */
  closesAt: string;
}

/** 24-hour IRN cancellation window from the acknowledgement time. */
export function cancelWindow(ackDate: string, nowMs: number): CancelWindow {
  const ack = parseAckDate(ackDate);
  if (Number.isNaN(ack)) return { state: "none", hoursLeft: 0, closesAt: "" };
  const closes = ack + CANCEL_WINDOW_HOURS * 60 * 60 * 1000;
  const left = closes - nowMs;
  return {
    state: left > 0 ? "open" : "closed",
    hoursLeft: left > 0 ? Math.floor(left / 3_600_000) : 0,
    closesAt: new Date(closes).toISOString(),
  };
}
