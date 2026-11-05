import { nanoid } from "nanoid";
import { DOC_TYPE_META } from "@/lib/documents";
import { addDaysISO, todayISO } from "@/lib/dates";
import {
  invoiceSchema,
  lineItemSchema,
  type AppSettings,
  type CatalogItem,
  type Customer,
  type DocType,
  type Invoice,
  type InvoiceCustomer,
  type InvoiceDesign,
  type LineItem,
  type NoteDocType,
  type SavedDesign,
} from "@/lib/schema";
import { getTemplateMeta } from "@/lib/templates-meta";

export const newId = () => nanoid(12);

/** A document number plus how it was generated (see db/invoices peekNumber). */
export interface GeneratedNumber {
  number: string;
  autoNumber: Invoice["autoNumber"];
}

export function resolveDefaultDesign(settings: AppSettings, designs: SavedDesign[]): InvoiceDesign {
  const saved = designs.find((d) => d.id === settings.design.defaultDesignId);
  if (saved) {
    return {
      templateId: saved.templateId,
      templateVersion: getTemplateMeta(saved.templateId).version,
      customization: structuredClone(saved.customization),
    };
  }
  const fallback = settings.design.fallback;
  return {
    ...structuredClone(fallback),
    templateVersion: getTemplateMeta(fallback.templateId).version,
  };
}

export function declarationFor(docType: DocType, settings: AppSettings): string {
  const d = settings.declarations;
  if (docType === "export") {
    return [d.exportText.trim(), d.lutNumber.trim() ? `LUT/Bond No: ${d.lutNumber.trim()}` : ""]
      .filter(Boolean)
      .join(" ");
  }
  if (docType === "bill_of_supply") return d.billOfSupplyText.trim();
  return "";
}

export function titleFor(docType: DocType, settings: AppSettings) {
  return docType === "proforma"
    ? settings.invoiceDefaults.proformaTitle || DOC_TYPE_META.proforma.defaultTitle
    : DOC_TYPE_META[docType].defaultTitle;
}

export function dueDateFor(docType: DocType, invoiceDate: string, settings: AppSettings) {
  const days =
    docType === "proforma"
      ? settings.invoiceDefaults.quoteValidityDays
      : settings.invoiceDefaults.paymentDays;
  return addDaysISO(invoiceDate, days);
}

export function newLineItem(settings: AppSettings, partial: Partial<LineItem> = {}): LineItem {
  return lineItemSchema.parse({
    id: newId(),
    quantity: "1",
    gstRate: settings.gst.defaultRate,
    ...partial,
  });
}

export function lineFromCatalog(item: CatalogItem, settings: AppSettings): LineItem {
  return newLineItem(settings, {
    name: item.name,
    description: item.description,
    hsnSac: item.hsnSac,
    unit: item.unit,
    unitPrice: item.price,
    gstRate: item.gstRate || settings.gst.defaultRate,
  });
}

export function toInvoiceCustomer(c: Customer): InvoiceCustomer {
  return {
    customerId: c.id,
    name: c.name,
    company: c.company,
    email: c.email,
    phone: c.phone,
    billingAddress: c.billingAddress,
    shippingAddress: c.shippingAddress,
    city: c.city,
    pincode: c.pincode,
    stateCode: c.stateCode,
    country: c.country,
    gstin: c.gstin,
  };
}

export interface CreateInvoiceOptions {
  settings: AppSettings;
  designs: SavedDesign[];
  docType?: DocType;
  generated: GeneratedNumber;
  now?: Date;
}

export function createInvoice({
  settings,
  designs,
  docType,
  generated,
  now = new Date(),
}: CreateInvoiceOptions): Invoice {
  const type = docType ?? (settings.gst.registered ? settings.invoiceDefaults.docType : "invoice");
  const invoiceDate = todayISO(now);
  const currency =
    type === "export" ? settings.invoiceDefaults.exportCurrency : settings.invoiceDefaults.currency;
  const stamp = now.toISOString();
  return invoiceSchema.parse({
    id: newId(),
    docType: type,
    docTitle: titleFor(type, settings),
    number: generated.number,
    autoNumber: generated.autoNumber,
    invoiceDate,
    dueDate: dueDateFor(type, invoiceDate, settings),
    currency,
    seller: structuredClone(settings.profile),
    customer: { country: type === "export" ? "" : "India" },
    lines: [newLineItem(settings)],
    pricesIncludeGst: settings.gst.pricesIncludeGst,
    gstMode: settings.gst.mode,
    roundOff: settings.gst.roundOff && currency === "INR",
    notes: settings.invoiceDefaults.notes,
    terms: settings.invoiceDefaults.terms,
    paymentInstructions: settings.invoiceDefaults.paymentInstructions,
    footer: settings.invoiceDefaults.footer,
    declaration: declarationFor(type, settings),
    design: resolveDefaultDesign(settings, designs),
    createdAt: stamp,
    updatedAt: stamp,
  });
}

/** Switch document type, keeping all content; adjusts title, dates, currency and declaration. */
export function withDocType(
  invoice: Invoice,
  docType: DocType,
  settings: AppSettings,
  generated: GeneratedNumber,
): Invoice {
  if (invoice.docType === docType) return invoice;
  const wasExport = invoice.docType === "export";
  const isExport = docType === "export";
  const currency = isExport
    ? invoice.currency === "INR"
      ? settings.invoiceDefaults.exportCurrency
      : invoice.currency
    : wasExport
      ? settings.invoiceDefaults.currency
      : invoice.currency;
  return {
    ...invoice,
    docType,
    docTitle: titleFor(docType, settings),
    number: generated.number,
    autoNumber: generated.autoNumber,
    seqCommitted: false,
    currency,
    roundOff: currency === "INR" ? invoice.roundOff || settings.gst.roundOff : false,
    dueDate: dueDateFor(docType, invoice.invoiceDate || todayISO(), settings),
    declaration: declarationFor(docType, settings),
    payment: DOC_TYPE_META[docType].hasPayment
      ? invoice.payment
      : { ...invoice.payment, amountReceived: "" },
  };
}

/** A fresh copy with a new identity, number and dates; payment cleared. */
export function duplicateInvoice(
  source: Invoice,
  settings: AppSettings,
  generated: GeneratedNumber,
  docType = source.docType,
  now = new Date(),
): Invoice {
  const invoiceDate = todayISO(now);
  const stamp = now.toISOString();
  const base: Invoice = {
    ...structuredClone(source),
    id: newId(),
    number: generated.number,
    autoNumber: generated.autoNumber,
    seqCommitted: false,
    invoiceDate,
    dueDate: dueDateFor(docType, invoiceDate, settings),
    lines: source.lines.map((l) => ({ ...structuredClone(l), id: newId() })),
    payment: { amountReceived: "", date: "", mode: "", note: "" },
    downloadedAt: "",
    issuedAt: "",
    status: "active",
    cancelledAt: "",
    cancelReason: "",
    eInvoice: { irn: "", ackNo: "", ackDate: "", status: "not_applicable" },
    createdAt: stamp,
    updatedAt: stamp,
  };
  if (docType === source.docType) return base;
  return {
    ...withDocType({ ...base, docType: source.docType }, docType, settings, generated),
    // Converting keeps the customer/currency of the quote.
    currency: base.currency,
  };
}

/**
 * A credit or debit note against an issued invoice: copies the parties, place
 * of supply, tax settings, currency and lines (new ids), and records the
 * original invoice. Amounts stay positive; returns subtract (credit) or add
 * (debit) them. Payment is cleared — notes carry no payment.
 */
export function createNoteFromInvoice(
  original: Invoice,
  kind: NoteDocType,
  settings: AppSettings,
  generated: GeneratedNumber,
  now = new Date(),
): Invoice {
  const stamp = now.toISOString();
  const invoiceDate = todayISO(now);
  return invoiceSchema.parse({
    id: newId(),
    docType: kind,
    docTitle: titleFor(kind, settings),
    number: generated.number,
    autoNumber: generated.autoNumber,
    seqCommitted: false,
    invoiceDate,
    dueDate: "",
    currency: original.currency,
    seller: structuredClone(original.seller),
    customer: structuredClone(original.customer),
    placeOfSupply: original.placeOfSupply,
    lines: original.lines.map((l) => ({ ...structuredClone(l), id: newId() })),
    invoiceDiscount: structuredClone(original.invoiceDiscount),
    pricesIncludeGst: original.pricesIncludeGst,
    gstMode: original.gstMode,
    supplyType: original.supplyType,
    roundOff: original.roundOff,
    payment: {},
    paymentSchedule: [],
    notes: "",
    terms: "",
    paymentInstructions: "",
    footer: original.footer,
    declaration: "",
    design: structuredClone(original.design),
    supplyNature: original.supplyNature,
    reverseCharge: original.reverseCharge,
    sez: structuredClone(original.sez),
    exportDetails: structuredClone(original.exportDetails),
    note: {
      reason: "",
      originalInvoiceId: original.id,
      originalInvoiceNumber: original.number,
      originalInvoiceDate: original.invoiceDate,
    },
    createdAt: stamp,
    updatedAt: stamp,
  });
}
