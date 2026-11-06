/**
 * Turns a recurring template plus a due date into a draft invoice or an
 * expense entry. Pure: numbering and saving are done by src/db/recurring.ts.
 *
 * Templates keep only the content that should repeat. Seller details and
 * the number come from today's settings and numbering, so a stale logo,
 * old bank details or a used number are never copied.
 */

import { addDays, dayDiff } from "@/lib/recurring/schedule";
import { createInvoice, newId, type GeneratedNumber } from "@/lib/invoice-factory";
import {
  invoiceSchema,
  type AppSettings,
  type Expense,
  type Invoice,
  type Recurring,
  type SavedDesign,
} from "@/lib/schema";

const INVOICE_TEMPLATE_KEYS = [
  "docType",
  "docTitle",
  "currency",
  "referenceNo",
  "poNo",
  "customer",
  "placeOfSupply",
  "lines",
  "invoiceDiscount",
  "pricesIncludeGst",
  "gstMode",
  "supplyType",
  "roundOff",
  "notes",
  "terms",
  "paymentInstructions",
  "footer",
  "declaration",
  "design",
  "supplyNature",
  "reverseCharge",
  "sez",
  "exportDetails",
] as const satisfies readonly (keyof Invoice)[];

const EXPENSE_TEMPLATE_KEYS = [
  "vendorName",
  "vendorGstin",
  "vendorStateCode",
  "category",
  "description",
  "amount",
  "amountIncludesGst",
  "gstRate",
  "gstMode",
  "itcEligible",
  "itcType",
  "reverseCharge",
  "paymentStatus",
  "paymentMode",
  "notes",
] as const satisfies readonly (keyof Expense)[];

function pick(source: object, keys: readonly string[]): Record<string, unknown> {
  const src = source as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of keys) if (k in src) out[k] = structuredClone(src[k]);
  return out;
}

/** What to remember from an existing invoice. Credit/debit notes can't repeat. */
export function templateFromInvoice(inv: Invoice): Record<string, unknown> {
  const gap = inv.dueDate && inv.invoiceDate ? dayDiff(inv.invoiceDate, inv.dueDate) : undefined;
  return {
    ...pick(inv, INVOICE_TEMPLATE_KEYS),
    ...(gap !== undefined && gap >= 0 ? { dueDays: gap } : {}),
  };
}

/** What to remember from an existing expense. */
export function templateFromExpense(e: Expense): Record<string, unknown> {
  return pick(e, EXPENSE_TEMPLATE_KEYS);
}

export interface InvoiceBuildContext {
  settings: AppSettings;
  designs: SavedDesign[];
  generated: GeneratedNumber;
  now?: Date;
}

/** Document type of an invoice template; credit/debit notes can't repeat, so they fall back to a tax invoice. */
export function templateDocType(rec: Pick<Recurring, "template">): Invoice["docType"] {
  const t = rec.template.docType;
  if (typeof t !== "string" || t === "credit_note" || t === "debit_note") return "tax_invoice";
  return t as Invoice["docType"];
}

/** A draft invoice for the occurrence on `date`. Never issued. */
export function buildInvoiceDraft(
  rec: Pick<Recurring, "template">,
  date: string,
  { settings, designs, generated, now = new Date() }: InvoiceBuildContext,
): Invoice {
  const t = rec.template;
  const docType = templateDocType(rec);
  const base = createInvoice({ settings, designs, docType, generated, now });
  const dueDays =
    typeof t.dueDays === "number" && t.dueDays >= 0
      ? t.dueDays
      : settings.invoiceDefaults.paymentDays;
  const content = pick(t, INVOICE_TEMPLATE_KEYS);
  const lines = Array.isArray(content.lines)
    ? (content.lines as object[]).map((l) => ({ ...l, id: newId() }))
    : base.lines;
  return invoiceSchema.parse({
    ...base,
    ...content,
    docType,
    lines: lines.length ? lines : base.lines,
    id: base.id,
    number: base.number,
    autoNumber: base.autoNumber,
    seqCommitted: false,
    seller: base.seller,
    invoiceDate: date,
    dueDate:
      base.docType === "proforma"
        ? addDays(date, settings.invoiceDefaults.quoteValidityDays)
        : addDays(date, dueDays),
    payment: {},
    issuedAt: "",
    status: "active",
    downloadedAt: "",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
}

/** Expense fields (without id or summary) for the occurrence on `date`. */
export function buildExpenseInput(
  rec: Pick<Recurring, "template">,
  date: string,
): Partial<Expense> {
  const content = pick(rec.template, EXPENSE_TEMPLATE_KEYS) as Partial<Expense>;
  const paid = content.paymentStatus !== "unpaid";
  return {
    ...content,
    date,
    invoiceNo: "",
    invoiceDate: "",
    paymentDate: paid ? date : "",
  };
}

/** Short description of what the template creates, for lists. */
export function templateSummary(rec: Pick<Recurring, "kind" | "template">): string {
  const t = rec.template;
  if (rec.kind === "expense") {
    const who = typeof t.vendorName === "string" && t.vendorName ? t.vendorName : "";
    const what = typeof t.category === "string" && t.category ? t.category : "";
    return [who, what].filter(Boolean).join(" · ") || "Expense";
  }
  const c = t.customer as { name?: string; company?: string } | undefined;
  return c?.company || c?.name || "Invoice";
}
