import { calculateInvoice, type InvoiceTotals } from "@/lib/calc/engine";
import { DOC_TYPE_META } from "@/lib/documents";
import { taxKindForInvoice } from "@/lib/gst/tax";
import type { Invoice, InvoiceSummary } from "@/lib/schema";

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

export type DisplayStatus = "draft" | "unpaid" | "partial" | "paid" | "overdue" | "quote";

/** Status shown in lists: derived from download state, payment and due date. */
export function displayStatus(invoice: Invoice, todayISO: string): DisplayStatus {
  if (!invoice.downloadedAt) return "draft";
  if (!DOC_TYPE_META[invoice.docType].hasPayment) return "quote";
  const s = invoice.summary.paymentStatus;
  if (s === "paid") return "paid";
  if (invoice.dueDate && invoice.dueDate < todayISO && Number(invoice.summary.balanceDue) > 0)
    return "overdue";
  return s;
}
