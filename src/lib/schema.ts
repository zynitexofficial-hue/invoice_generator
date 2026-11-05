import { z } from "zod";
import { DEFAULT_NUMBER_PATTERN, LEGACY_NUMBER_PATTERN } from "@/lib/numbering";

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

export const DOC_TYPES = [
  "tax_invoice",
  "invoice",
  "bill_of_supply",
  "proforma",
  "export",
] as const;
export type DocType = (typeof DOC_TYPES)[number];

export const GST_MODES = ["single", "split"] as const;
export type GstMode = (typeof GST_MODES)[number];

export const SUPPLY_TYPES = ["auto", "intra", "inter"] as const;
export type SupplyType = (typeof SUPPLY_TYPES)[number];

export const TEMPLATE_IDS = [
  "minimal",
  "professional",
  "modern",
  "corporate",
  "creative",
  "service",
] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const FONT_IDS = [
  "inter",
  "roboto",
  "noto-sans",
  "poppins",
  "lato",
  "ibm-plex-sans",
  "dm-sans",
  "manrope",
  "merriweather",
  "source-serif",
] as const;
export type FontId = (typeof FONT_IDS)[number];

/** Blocks that follow the line-item table; their order is user-configurable. */
export const SECTION_IDS = [
  "totals",
  "schedule",
  "taxSummary",
  "payment",
  "notes",
  "terms",
  "signature",
] as const;
export type SectionId = (typeof SECTION_IDS)[number];

export const PAYMENT_MODES = [
  "",
  "upi",
  "bank_transfer",
  "cash",
  "cheque",
  "card",
  "other",
] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

/* ------------------------------------------------------------------ */
/* Primitives                                                          */
/* ------------------------------------------------------------------ */

const text = (max = 500) => z.string().max(max).default("");
const isoDate = z
  .string()
  .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Expected a date like 2026-10-22")
  .default("");
const isoDateTime = z.string().max(40).default("");
const decimalText = z
  .string()
  .max(24)
  .regex(/^-?[\d.,\s]*$/, "Expected a number")
  .default("");
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Expected a hex color like #4f46e5");
/** Data URL of a raster image (we never store SVG markup). */
const imageDataUrl = z
  .string()
  .max(4_000_000)
  .refine((v) => v === "" || /^data:image\/(png|jpeg|webp);base64,/.test(v), "Unsupported image")
  .default("");

export const discountSchema = z.object({
  kind: z.enum(["percent", "flat"]).default("percent"),
  value: decimalText,
});
export type Discount = z.infer<typeof discountSchema>;

/* ------------------------------------------------------------------ */
/* Parties                                                             */
/* ------------------------------------------------------------------ */

export const bankSchema = z.object({
  accountName: text(120),
  accountNumber: text(40),
  ifsc: text(20),
  bankName: text(120),
  branch: text(120),
  swift: text(20),
});
export type BankDetails = z.infer<typeof bankSchema>;

export const sellerSchema = z.object({
  name: text(160),
  address: text(500),
  stateCode: text(2),
  country: z.string().max(80).default("India"),
  gstin: text(15),
  pan: text(10),
  email: text(160),
  phone: text(40),
  website: text(160),
  logo: imageDataUrl,
  signature: imageDataUrl,
  signatoryName: text(120),
  bank: bankSchema.prefault({}),
  upiId: text(120),
  upiName: text(120),
  /** The seller's own payment QR (from their UPI/bank app); printed instead of a generated one. */
  paymentQr: imageDataUrl,
  /** Payment method listed first and marked "Preferred"; both are always shown. */
  preferredPayment: z.enum(["", "upi", "bank"]).default(""),
});
export type Seller = z.infer<typeof sellerSchema>;

export const customerFieldsSchema = z.object({
  name: text(160),
  company: text(160),
  email: text(160),
  phone: text(40),
  billingAddress: text(500),
  shippingAddress: text(500),
  stateCode: text(2),
  country: z.string().max(80).default("India"),
  gstin: text(15),
});
export type CustomerFields = z.infer<typeof customerFieldsSchema>;

export const customerSchema = customerFieldsSchema.extend({
  id: z.string().min(1),
  notes: text(1000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Customer = z.infer<typeof customerSchema>;

export const invoiceCustomerSchema = customerFieldsSchema.extend({
  customerId: text(64),
});
export type InvoiceCustomer = z.infer<typeof invoiceCustomerSchema>;

/* ------------------------------------------------------------------ */
/* Items                                                               */
/* ------------------------------------------------------------------ */

export const catalogItemSchema = z.object({
  id: z.string().min(1),
  name: text(200),
  description: text(1000),
  hsnSac: text(12),
  unit: text(20),
  price: decimalText,
  gstRate: decimalText,
  priceIncludesGst: z.boolean().default(false),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type CatalogItem = z.infer<typeof catalogItemSchema>;

export const lineItemSchema = z.object({
  id: z.string().min(1),
  name: text(200),
  description: text(1000),
  hsnSac: text(12),
  quantity: decimalText,
  unit: text(20),
  unitPrice: decimalText,
  discount: discountSchema.prefault({}),
  gstRate: decimalText,
});
export type LineItem = z.infer<typeof lineItemSchema>;

/* ------------------------------------------------------------------ */
/* Design                                                              */
/* ------------------------------------------------------------------ */

export const visibilitySchema = z.object({
  logo: z.boolean().default(true),
  itemIndex: z.boolean().default(true),
  hsnColumn: z.boolean().default(true),
  unitColumn: z.boolean().default(true),
  discountColumn: z.boolean().default(true),
  taxColumns: z.boolean().default(true),
  taxSummary: z.boolean().default(false),
  amountInWords: z.boolean().default(true),
  notes: z.boolean().default(true),
  terms: z.boolean().default(true),
  bankDetails: z.boolean().default(true),
  upiQr: z.boolean().default(true),
  /** "Tap to pay via UPI" link under the QR — clickable in the PDF. */
  payLink: z.boolean().default(true),
  signature: z.boolean().default(true),
  statusStamp: z.boolean().default(true),
  /** Print GST state codes for the customer and place of supply ("West Bengal (Code 19)"). */
  stateCodes: z.boolean().default(true),
  footer: z.boolean().default(true),
  pageNumbers: z.boolean().default(true),
});
export type Visibility = z.infer<typeof visibilitySchema>;

export const DEFAULT_SECTION_ORDER: SectionId[] = [...SECTION_IDS];

export const designSchema = z.object({
  primaryColor: hexColor.default("#4f46e5"),
  accentColor: hexColor.default("#0ea5e9"),
  fontFamily: z.enum(FONT_IDS).default("inter"),
  fontSize: z.number().min(8).max(12).default(9.5),
  logoSize: z.enum(["sm", "md", "lg"]).default("md"),
  logoPosition: z.enum(["left", "center", "right"]).default("left"),
  tableStyle: z.enum(["bordered", "striped", "minimal", "ruled"]).default("striped"),
  density: z.enum(["compact", "normal", "comfortable"]).default("normal"),
  footerAlign: z.enum(["left", "center", "right"]).default("center"),
  pageSize: z.enum(["A4", "Letter"]).default("A4"),
  margins: z.enum(["narrow", "normal", "wide"]).default("normal"),
  show: visibilitySchema.prefault({}),
  sectionOrder: z
    .array(z.enum(SECTION_IDS))
    .default(DEFAULT_SECTION_ORDER)
    .transform(normalizeSectionOrder),
});
export type DesignCustomization = z.infer<typeof designSchema>;

/**
 * Keep user order and drop unknown/duplicate ids. A missing id (one added in a
 * later version) goes right after its default predecessor, so older saved
 * orders pick it up where it belongs instead of at the very end.
 */
export function normalizeSectionOrder(order: readonly SectionId[]): SectionId[] {
  const seen = new Set<SectionId>();
  const result: SectionId[] = [];
  for (const id of order) {
    if ((SECTION_IDS as readonly string[]).includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  SECTION_IDS.forEach((id, i) => {
    if (seen.has(id)) return;
    const after = i === 0 ? -1 : result.indexOf(SECTION_IDS[i - 1]);
    result.splice(after + 1, 0, id);
  });
  return result;
}

export const invoiceDesignSchema = z.object({
  templateId: z.enum(TEMPLATE_IDS).default("professional"),
  templateVersion: z.number().int().min(1).default(1),
  customization: designSchema.prefault({}),
});
export type InvoiceDesign = z.infer<typeof invoiceDesignSchema>;

export const savedDesignSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(80),
  templateId: z.enum(TEMPLATE_IDS),
  customization: designSchema.prefault({}),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type SavedDesign = z.infer<typeof savedDesignSchema>;

/* ------------------------------------------------------------------ */
/* Invoice                                                             */
/* ------------------------------------------------------------------ */

export const INVOICE_SCHEMA_VERSION = 1;

export const paymentSchema = z.object({
  amountReceived: decimalText,
  date: isoDate,
  mode: z.enum(PAYMENT_MODES).default(""),
  note: text(200),
});
export type PaymentInfo = z.infer<typeof paymentSchema>;

/** One instalment of a payment plan: an advance, a milestone or the balance. */
export const paymentStageSchema = z.object({
  id: z.string().min(1),
  label: text(80),
  /** When it falls due, in words ("On order confirmation", "Within 7 days of delivery"). */
  due: text(120),
  kind: z.enum(["percent", "flat"]).default("percent"),
  value: decimalText,
});
export type PaymentStage = z.infer<typeof paymentStageSchema>;

/** Small denormalized summary kept on the record so lists don't recalculate. */
export const invoiceSummarySchema = z.object({
  grandTotal: z.string().default("0"),
  balanceDue: z.string().default("0"),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("unpaid"),
});
export type InvoiceSummary = z.infer<typeof invoiceSummarySchema>;

export const invoiceSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(INVOICE_SCHEMA_VERSION).default(INVOICE_SCHEMA_VERSION),
  docType: z.enum(DOC_TYPES).default("tax_invoice"),
  /** Displayed title, e.g. "Tax Invoice", "Quotation". */
  docTitle: text(60),
  number: text(60),
  invoiceDate: isoDate,
  /** Due date (invoices) or "valid until" (quotations). */
  dueDate: isoDate,
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("INR"),
  referenceNo: text(60),
  poNo: text(60),
  seller: sellerSchema.prefault({}),
  customer: invoiceCustomerSchema.prefault({}),
  /** Place-of-supply state code; empty = derive from the customer. */
  placeOfSupply: text(2),
  lines: z.array(lineItemSchema).max(500).default([]),
  invoiceDiscount: discountSchema.prefault({}),
  pricesIncludeGst: z.boolean().default(false),
  gstMode: z.enum(GST_MODES).default("split"),
  supplyType: z.enum(SUPPLY_TYPES).default("auto"),
  roundOff: z.boolean().default(true),
  payment: paymentSchema.prefault({}),
  /** Optional advance / milestone plan; empty = not used. */
  paymentSchedule: z.array(paymentStageSchema).max(12).default([]),
  notes: text(2000),
  terms: text(2000),
  paymentInstructions: text(1000),
  footer: text(300),
  /** LUT / bill-of-supply declaration printed on the document. */
  declaration: text(500),
  design: invoiceDesignSchema.prefault({}),
  summary: invoiceSummarySchema.prefault({}),
  /** The number as generated from the pattern (null when typed by hand or no {SEQ}). */
  autoNumber: z
    // key/seq are set only for {SEQ} patterns ("" / 0 otherwise).
    .object({ value: z.string(), key: z.string(), seq: z.number().int().min(0) })
    .nullable()
    .default(null),
  /** Set once the number has consumed a {SEQ} counter value. */
  seqCommitted: z.boolean().default(false),
  downloadedAt: isoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Invoice = z.infer<typeof invoiceSchema>;

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export const numberingRuleSchema = z.object({
  prefix: z.string().max(20).default("INV"),
  pattern: z
    .string()
    .max(80)
    .default(DEFAULT_NUMBER_PATTERN)
    // The earlier default could repeat within the same minute — upgrade it.
    .transform((p) => (p === LEGACY_NUMBER_PATTERN ? DEFAULT_NUMBER_PATTERN : p)),
});
export type NumberingRule = z.infer<typeof numberingRuleSchema>;

export const DATE_FORMAT_IDS = [
  "dd/MM/yyyy",
  "dd-MM-yyyy",
  "dd MMM yyyy",
  "MMM d, yyyy",
  "yyyy-MM-dd",
  "MM/dd/yyyy",
] as const;
export type DateFormatId = (typeof DATE_FORMAT_IDS)[number];

export const securitySettingsSchema = z.object({
  pinEnabled: z.boolean().default(false),
  pinHash: z.string().default(""),
  pinSalt: z.string().default(""),
  autoLockMinutes: z.number().int().min(0).max(120).default(15),
});
export type SecuritySettings = z.infer<typeof securitySettingsSchema>;

export const settingsSchema = z.object({
  id: z.literal("app").default("app"),
  profile: sellerSchema.prefault({}),
  invoiceDefaults: z
    .object({
      docType: z.enum(DOC_TYPES).default("tax_invoice"),
      currency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("INR"),
      exportCurrency: z
        .string()
        .regex(/^[A-Z]{3}$/)
        .default("USD"),
      paymentDays: z.number().int().min(0).max(365).default(15),
      quoteValidityDays: z.number().int().min(0).max(365).default(30),
      proformaTitle: z.string().max(60).default("Quotation"),
      notes: z.string().max(2000).default("Thank you for your business!"),
      terms: z.string().max(2000).default(""),
      paymentInstructions: z.string().max(1000).default(""),
      footer: z.string().max(300).default(""),
    })
    .prefault({}),
  gst: z
    .object({
      registered: z.boolean().default(true),
      mode: z.enum(GST_MODES).default("split"),
      defaultRate: z.string().max(8).default("18"),
      rates: z.array(z.string().max(8)).max(20).default(["0", "0.25", "3", "5", "18", "40"]),
      pricesIncludeGst: z.boolean().default(false),
      roundOff: z.boolean().default(true),
    })
    .prefault({}),
  numbering: z
    .object({
      tax_invoice: numberingRuleSchema.prefault({ prefix: "INV" }),
      invoice: numberingRuleSchema.prefault({ prefix: "INV" }),
      bill_of_supply: numberingRuleSchema.prefault({ prefix: "BOS" }),
      proforma: numberingRuleSchema.prefault({ prefix: "QTN" }),
      export: numberingRuleSchema.prefault({ prefix: "EXP" }),
    })
    .prefault({}),
  formats: z
    .object({
      dateFormat: z.enum(DATE_FORMAT_IDS).default("dd/MM/yyyy"),
      numberGrouping: z.enum(["indian", "international"]).default("indian"),
    })
    .prefault({}),
  declarations: z
    .object({
      lutNumber: z.string().max(60).default(""),
      exportText: z
        .string()
        .max(500)
        .default(
          "Supply meant for export under Letter of Undertaking without payment of integrated tax.",
        ),
      billOfSupplyText: z
        .string()
        .max(500)
        .default("Composition taxable person, not eligible to collect tax on supplies."),
    })
    .prefault({}),
  upi: z.object({ includeAmount: z.boolean().default(true) }).prefault({}),
  design: z
    .object({
      defaultDesignId: z.string().default(""),
      fallback: invoiceDesignSchema.prefault({}),
    })
    .prefault({}),
  backup: z
    .object({
      reminderDays: z.number().int().min(0).max(365).default(14),
      lastBackupAt: isoDateTime,
    })
    .prefault({}),
  security: securitySettingsSchema.prefault({}),
  onboarding: z
    .object({
      welcomeSeen: z.boolean().default(false),
      printTipSeen: z.boolean().default(false),
    })
    .prefault({}),
  updatedAt: isoDateTime,
});
export type AppSettings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: AppSettings = settingsSchema.parse({});

/* ------------------------------------------------------------------ */
/* Files                                                               */
/* ------------------------------------------------------------------ */

export const INVOICE_FILE_FORMAT = "invoice-generator/invoice";
export const BACKUP_FILE_FORMAT = "invoice-generator/backup";

export const invoiceFileSchema = z.object({
  format: z.literal(INVOICE_FILE_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  invoice: invoiceSchema,
});
export type InvoiceFile = z.infer<typeof invoiceFileSchema>;

export const counterSchema = z.object({ key: z.string().min(1), value: z.number().int().min(0) });
export type Counter = z.infer<typeof counterSchema>;

export const backupFileSchema = z.object({
  format: z.literal(BACKUP_FILE_FORMAT),
  schemaVersion: z.number().int().min(1),
  exportedAt: z.string(),
  data: z.object({
    settings: settingsSchema.optional(),
    customers: z.array(customerSchema).default([]),
    items: z.array(catalogItemSchema).default([]),
    invoices: z.array(invoiceSchema).default([]),
    designs: z.array(savedDesignSchema).default([]),
    counters: z.array(counterSchema).default([]),
  }),
});
export type BackupFile = z.infer<typeof backupFileSchema>;
