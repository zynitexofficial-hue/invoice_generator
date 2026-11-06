import { classifyInvoices, type ClassifiedDoc } from "@/lib/gst/returns/classify";
import { rateItems } from "@/lib/gst/returns/gstr1";
import { fmt2 } from "@/lib/gst/returns/internal";
import { monthKey } from "@/lib/period";
import type { AmendDoc, AmendSection, AppSettings, Invoice } from "@/lib/schema";

/**
 * Return-relevant view of a document, for amendments. Pure: built with the
 * same classifier as GSTR-1 so amounts and sections always agree with it.
 */

const SECTIONS: Record<string, AmendSection> = {
  b2b: "b2b",
  b2cl: "b2cl",
  b2cs: "b2cs",
  exp: "exp",
  cdnr: "cdnr",
  cdnur: "cdnur",
};

export function amendDocFromClassified(d: ClassifiedDoc): AmendDoc {
  return {
    number: d.invoice.number.trim(),
    date: d.invoice.invoiceDate,
    ctin: d.ctin,
    pos: d.pos,
    value: fmt2(d.value),
    interState: d.interState,
    reverseCharge: d.invoice.reverseCharge,
    invType: d.invType,
    noteType: d.noteType ?? "",
    exportType: d.exportType && d.placement === "exp" ? d.exportType : "",
    urType: d.urType ?? "",
    items: rateItems(d.lines).map((i) => ({ ...i })),
  };
}

export interface CurrentDoc {
  section: AmendSection;
  /** The document as it stands, as if it were active (even when cancelled). */
  doc: AmendDoc | null;
  /** True when the document is cancelled, so it reports nothing now. */
  cancelled: boolean;
}

/**
 * How `invoice` is (or, if cancelled, would have been) placed in GSTR-1 today.
 * `doc` is null when the document is not a reportable GST document.
 */
export function currentDoc(
  invoice: Invoice,
  allInvoices: readonly Invoice[],
  settings: AppSettings,
): CurrentDoc {
  const cancelled = invoice.status === "cancelled";
  const asActive: Invoice = cancelled ? { ...invoice, status: "active" } : invoice;
  if (!invoice.invoiceDate) return { section: "", doc: null, cancelled };
  const invoices = allInvoices.map((i) => (i.id === invoice.id ? asActive : i));
  if (!invoices.some((i) => i.id === invoice.id)) invoices.push(asActive);
  const cls = classifyInvoices({ invoices, settings, periodKey: monthKey(invoice.invoiceDate) });
  const d = cls.docs.find((x) => x.invoice.id === invoice.id);
  if (!d) return { section: "", doc: null, cancelled };
  return { section: SECTIONS[d.placement] ?? "", doc: amendDocFromClassified(d), cancelled };
}
