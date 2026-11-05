import { calculateInvoice, type InvoiceTotals } from "@/lib/calc/engine";
import { DOC_TYPE_META } from "@/lib/documents";
import { taxKindForInvoice } from "@/lib/gst/tax";
import { isNoteDocType, type Invoice, type InvoiceSummary } from "@/lib/schema";

/** Totals for an invoice record. Always recomputed — never trusted from storage or files. */
export function computeTotals(invoice: Invoice): InvoiceTotals {
  return calculateInvoice({
    currency: invoice.currency,
    lines: invoice.lines,
    invoiceDiscount: invoice.invoiceDiscount,
    pricesIncludeGst: invoice.pricesIncludeGst,
    taxKind: taxKindForInvoice(invoice),
    roundOff: invoice.roundOff,
    amountReceived: DOC_TYPE_META[invoice.docType].hasPayment ? invoice.payment.amountReceived : "",
  });
}

export function summarize(totals: InvoiceTotals): InvoiceSummary {
  return {
    grandTotal: totals.grandTotal,
    balanceDue: totals.balanceDue,
    paymentStatus: totals.paymentStatus,
  };
}

export type DisplayStatus =
  "draft" | "unpaid" | "partial" | "paid" | "overdue" | "quote" | "cancelled" | "note";

/** Issued = has an explicit issue timestamp (set on download/print/share or "Mark issued"). */
export function isIssued(invoice: Pick<Invoice, "issuedAt">): boolean {
  return Boolean(invoice.issuedAt);
}

/**
 * Not yet issued. Quotations are never "issued" for GST, so a downloaded
 * quotation counts as sent (not a draft).
 */
export function isDraft(invoice: Pick<Invoice, "issuedAt" | "downloadedAt" | "docType">): boolean {
  if (invoice.docType === "proforma") return !invoice.issuedAt && !invoice.downloadedAt;
  return !invoice.issuedAt;
}

/** Status shown in lists: derived from issue state, cancellation, payment and due date. */
export function displayStatus(invoice: Invoice, todayISO: string): DisplayStatus {
  if (invoice.status === "cancelled") return "cancelled";
  if (isDraft(invoice)) return "draft";
  if (isNoteDocType(invoice.docType)) return "note";
  if (!DOC_TYPE_META[invoice.docType].hasPayment) return "quote";
  const s = invoice.summary.paymentStatus;
  if (s === "paid") return "paid";
  if (invoice.dueDate && invoice.dueDate < todayISO && Number(invoice.summary.balanceDue) > 0)
    return "overdue";
  return s;
}
