import { fmt2, sumItems } from "@/lib/gst/returns/internal";
import type { RateItem } from "@/lib/gst/returns/types";
import {
  isNoteDocType,
  type Amendment,
  type AmendDoc,
  type AppSettings,
  type Invoice,
} from "@/lib/schema";
import { currentDoc } from "./doc";

/** Short before/after summary stored in Amendment.before / .after (for lists and the audit log). */
export function docSummary(doc: AmendDoc | null): Record<string, string> {
  if (!doc) return { status: "Cancelled", taxable: "0.00", tax: "0.00", value: "0.00" };
  const h = sumItems(doc.items as RateItem[]);
  return {
    number: doc.number,
    date: doc.date,
    taxable: fmt2(h.taxable),
    tax: fmt2(h.igst.plus(h.cgst).plus(h.sgst).plus(h.cess)),
    value: doc.value,
  };
}

export type AmendmentDraft = Omit<Amendment, "id" | "createdAt" | "updatedAt">;

/**
 * A new draft amendment for a document that changed after its return was
 * filed. For a cancellation the original values are exactly the document's
 * current lines, so they are marked confirmed. For an edit the filed values
 * are not stored anywhere (only a hash), so `beforeDoc` starts as today's
 * values and the user must correct it to what they actually filed.
 */
export function draftAmendment(input: {
  invoice: Invoice;
  invoices: readonly Invoice[];
  settings: AppSettings;
  originalPeriodKey: string;
  amendInPeriodKey: string;
}): AmendmentDraft {
  const { invoice, invoices, settings } = input;
  const cur = currentDoc(invoice, invoices, settings);
  const cancelled = cur.cancelled;
  const afterDoc = cancelled ? null : cur.doc;
  return {
    schemaVersion: 1,
    kind: cancelled
      ? "cancellation"
      : isNoteDocType(invoice.docType)
        ? "note_amendment"
        : "invoice_amendment",
    status: "draft",
    originalInvoiceId: invoice.id,
    originalNumber: invoice.number,
    originalDate: invoice.invoiceDate,
    originalPeriodKey: input.originalPeriodKey,
    amendInPeriodKey: input.amendInPeriodKey,
    reason: cancelled ? invoice.cancelReason : "",
    section: cur.section,
    beforeDoc: cur.doc,
    afterDoc,
    beforeConfirmed: cancelled,
    before: docSummary(cur.doc),
    after: docSummary(afterDoc),
    reportedAt: "",
    notes: "",
  };
}

/** Refresh the "after" side from the live document (before reporting). */
export function refreshAfter(
  a: Amendment,
  invoice: Invoice | undefined,
  invoices: readonly Invoice[],
  settings: AppSettings,
): Pick<Amendment, "afterDoc" | "after" | "section"> {
  if (!invoice) return { afterDoc: a.afterDoc, after: a.after, section: a.section };
  const cur = currentDoc(invoice, invoices, settings);
  const afterDoc = cur.cancelled ? null : cur.doc;
  return { afterDoc, after: docSummary(afterDoc), section: a.section || cur.section };
}
