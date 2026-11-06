import { z } from "zod";
import { DEFAULT_NUMBER_PATTERN, LEGACY_NUMBER_PATTERN } from "@/lib/numbering";

/* ------------------------------------------------------------------ */
/* Enumerations                                                        */
/* ------------------------------------------------------------------ */

/** Document types a user can start from scratch. */
export const CREATABLE_DOC_TYPES = [
  "tax_invoice",
  "invoice",
  "bill_of_supply",
  "proforma",
  "export",
] as const;
export type CreatableDocType = (typeof CREATABLE_DOC_TYPES)[number];

/** Credit/debit notes are created from an invoice, never picked as a fresh document type. */
export const NOTE_DOC_TYPES = ["credit_note", "debit_note"] as const;
export type NoteDocType = (typeof NOTE_DOC_TYPES)[number];

export const DOC_TYPES = [...CREATABLE_DOC_TYPES, ...NOTE_DOC_TYPES] as const;
export type DocType = (typeof DOC_TYPES)[number];

export function isNoteDocType(docType: DocType): docType is NoteDocType {
  return docType === "credit_note" || docType === "debit_note";
}

export function isCreatableDocType(value: unknown): value is CreatableDocType {
  return (CREATABLE_DOC_TYPES as readonly unknown[]).includes(value);
}

export const INVOICE_STATUSES = ["active", "cancelled"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const SUPPLY_NATURES = ["taxable", "nil", "exempt", "non_gst", "zero_rated"] as const;
export type SupplyNature = (typeof SUPPLY_NATURES)[number];

export const EXPORT_TYPES = ["", "wpay", "wopay"] as const;
export type ExportType = (typeof EXPORT_TYPES)[number];

/** Reasons for issuing a credit/debit note (GSTR-1 CDN reasons). "" = not chosen yet. */
export const NOTE_REASONS = [
  "",
  "sales_return",
  "post_sale_discount",
  "deficiency_in_service",
  "correction_in_invoice",
  "change_in_pos",
  "finalization_of_provisional_assessment",
  "others",
] as const;
export type NoteReason = (typeof NOTE_REASONS)[number];
export const NOTE_REASON_LABELS: Record<NoteReason, string> = {
  "": "Not specified",
  sales_return: "Sales return",
  post_sale_discount: "Post-sale discount",
  deficiency_in_service: "Deficiency in service",
  correction_in_invoice: "Correction in invoice",
  change_in_pos: "Change in POS",
  finalization_of_provisional_assessment: "Finalization of provisional assessment",
  others: "Others",
};

export const E_INVOICE_STATUSES = ["not_applicable", "pending", "generated", "cancelled"] as const;
export type EInvoiceStatus = (typeof E_INVOICE_STATUSES)[number];

export const ITEM_TYPES = ["goods", "services"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

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
  /** Legal name as per PAN/GST registration (when it differs from the trading name). */
  legalName: text(160),
  tradeName: text(160),
  address: text(500),
  city: text(80),
  pincode: text(6),
  stateCode: text(2),
  country: z.string().max(80).default("India"),
  gstin: text(15),
  pan: text(10),
  /** MSME Udyam registration number (optional, printed). */
  udyam: text(30),
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
  city: text(80),
  pincode: text(6),
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
  itemType: z.enum(ITEM_TYPES).default("goods"),
  /** GST Unit Quantity Code (PCS, NOS, KGS, OTH…); "" = not set. */
  uqc: z
    .string()
    .max(8)
    .refine((v) => v === "" || v.length >= 3, "Expected a 3–8 letter unit code")
    .default(""),
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

export const INVOICE_SCHEMA_VERSION = 2;

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

export const sezSchema = z.object({
  enabled: z.boolean().default(false),
  /** SEZ supply with payment of IGST (otherwise under LUT/bond). */
  withPayment: z.boolean().default(false),
});
export type SezDetails = z.infer<typeof sezSchema>;

export const exportDetailsSchema = z.object({
  /** "wpay" = with IGST payment, "wopay" = under LUT/bond, "" = not set. */
  type: z.enum(EXPORT_TYPES).default(""),
  lutNumber: text(60),
  shippingBillNo: text(20),
  shippingBillDate: isoDate,
  portCode: text(10),
  /** INR per unit of the invoice currency (required for non-INR invoices in returns). */
  exchangeRate: decimalText,
});
export type ExportDetails = z.infer<typeof exportDetailsSchema>;

export const noteDetailsSchema = z.object({
  reason: z.enum(NOTE_REASONS).default(""),
  originalInvoiceId: text(64),
  originalInvoiceNumber: text(60),
  originalInvoiceDate: isoDate,
});
export type NoteDetails = z.infer<typeof noteDetailsSchema>;

export const eInvoiceSchema = z.object({
  irn: text(64),
  ackNo: text(30),
  ackDate: isoDateTime,
  status: z.enum(E_INVOICE_STATUSES).default("not_applicable"),
  /** Signed QR code text copied from the IRP response (feature B). */
  qr: text(6000),
  /** When the IRP bulk JSON was last exported for this document (feature B). */
  exportedAt: isoDateTime,
  /** IRN cancellation on the IRP (allowed within 24h of generation) (feature B). */
  cancelledAt: isoDateTime,
  cancelReason: text(300),
});
export type EInvoiceDetails = z.infer<typeof eInvoiceSchema>;

/** Stored/file versions 1 and 2 are accepted; output is always the current version. */
const invoiceSchemaVersion = z
  .union([z.literal(1), z.literal(2)])
  .default(INVOICE_SCHEMA_VERSION)
  .transform((): typeof INVOICE_SCHEMA_VERSION => INVOICE_SCHEMA_VERSION);

export const invoiceObjectSchema = z.object({
  id: z.string().min(1),
  schemaVersion: invoiceSchemaVersion,
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
  /** When the document was issued (downloaded/printed/shared or marked issued). "" = draft. */
  issuedAt: isoDateTime,
  status: z.enum(INVOICE_STATUSES).default("active"),
  cancelledAt: isoDateTime,
  cancelReason: text(300),
  supplyNature: z.enum(SUPPLY_NATURES).default("taxable"),
  /** Tax payable on reverse charge. */
  reverseCharge: z.boolean().default(false),
  sez: sezSchema.prefault({}),
  exportDetails: exportDetailsSchema.prefault({}),
  /** Credit/debit notes: the original invoice and the reason. */
  note: noteDetailsSchema.prefault({}),
  eInvoice: eInvoiceSchema.prefault({}),
  downloadedAt: isoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});

/**
 * v1 → v2 upgrade applied on every read path: documents downloaded before the
 * explicit issued state existed count as issued when they were downloaded.
 */
function upgradeInvoiceInput(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const version = obj.schemaVersion ?? 1;
  if (version === 1 && !obj.issuedAt && typeof obj.downloadedAt === "string" && obj.downloadedAt) {
    return { ...obj, issuedAt: obj.downloadedAt };
  }
  return raw;
}

export const invoiceSchema = z.preprocess(upgradeInvoiceInput, invoiceObjectSchema);
export type Invoice = z.infer<typeof invoiceObjectSchema>;

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

export const EXPENSE_ITC_DEFAULTS = ["eligible", "ineligible", "no_gst"] as const;
export type ExpenseItcDefault = (typeof EXPENSE_ITC_DEFAULTS)[number];

export const expenseCategorySchema = z.object({
  name: z.string().min(1).max(60),
  defaultItc: z.enum(EXPENSE_ITC_DEFAULTS).default("eligible"),
});
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

/** Default expense categories (spec D3); s.17(5) blocked credits default to ineligible. */
export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { name: "Rent", defaultItc: "eligible" },
  { name: "Salaries & wages", defaultItc: "no_gst" },
  { name: "Utilities", defaultItc: "eligible" },
  { name: "Internet & phone", defaultItc: "eligible" },
  { name: "Travel", defaultItc: "eligible" },
  { name: "Fuel", defaultItc: "ineligible" },
  { name: "Food & entertainment", defaultItc: "ineligible" },
  { name: "Office supplies", defaultItc: "eligible" },
  { name: "Software & subscriptions", defaultItc: "eligible" },
  { name: "Professional fees", defaultItc: "eligible" },
  { name: "Marketing", defaultItc: "eligible" },
  { name: "Repairs & maintenance", defaultItc: "eligible" },
  { name: "Raw materials", defaultItc: "eligible" },
  { name: "Purchases for resale", defaultItc: "eligible" },
  { name: "Freight", defaultItc: "eligible" },
  { name: "Bank charges", defaultItc: "no_gst" },
  { name: "Insurance", defaultItc: "ineligible" },
  { name: "Taxes & fees", defaultItc: "no_gst" },
  { name: "Equipment", defaultItc: "eligible" },
  { name: "Other", defaultItc: "eligible" },
];

/** Default other-income categories (spec E1). */
export const DEFAULT_INCOME_CATEGORIES = [
  "Interest",
  "Commission",
  "Rent received",
  "Refund",
  "Other",
];

export const settingsSchema = z.object({
  id: z.literal("app").default("app"),
  profile: sellerSchema.prefault({}),
  invoiceDefaults: z
    .object({
      docType: z.enum(CREATABLE_DOC_TYPES).default("tax_invoice"),
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
      registrationType: z.enum(["regular", "composition", "unregistered"]).default("regular"),
      filingFrequency: z.enum(["monthly", "qrmp"]).default("monthly"),
      /** Aggregate annual turnover (₹) of the previous FY, as decimal text. */
      aato: decimalText,
      eInvoiceApplicable: z.boolean().default(false),
      hsnDigits: z.union([z.literal(4), z.literal(6)]).default(4),
    })
    .prefault({}),
  numbering: z
    .object({
      tax_invoice: numberingRuleSchema.prefault({ prefix: "INV" }),
      // "BILL", not "INV": both series use {PREFIX}/{FY}/{SEQ} with separate counters, so a
      // shared prefix would print the same number twice. Stored settings keep their prefix.
      invoice: numberingRuleSchema.prefault({ prefix: "BILL" }),
      bill_of_supply: numberingRuleSchema.prefault({ prefix: "BOS" }),
      proforma: numberingRuleSchema.prefault({ prefix: "QTN" }),
      export: numberingRuleSchema.prefault({ prefix: "EXP" }),
      credit_note: numberingRuleSchema.prefault({ prefix: "CN" }),
      debit_note: numberingRuleSchema.prefault({ prefix: "DN" }),
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
      /** Automatic backups to a user-chosen folder (File System Access API). */
      autoFolderEnabled: z.boolean().default(false),
      keepCount: z.number().int().min(1).max(365).default(14),
      /** Encrypt backup files with a passphrase. */
      encrypt: z.boolean().default(false),
    })
    .prefault({}),
  privacy: z
    .object({
      /** Grievance/contact email the business shows its customers. */
      contactEmail: text(160),
      retentionYears: z.number().int().min(1).max(50).default(8),
    })
    .prefault({}),
  expenseCategories: z
    .array(expenseCategorySchema)
    .max(100)
    .default(() => DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ ...c }))),
  incomeCategories: z
    .array(z.string().min(1).max(60))
    .max(100)
    .default(() => [...DEFAULT_INCOME_CATEGORIES]),
  security: securitySettingsSchema.prefault({}),
  // ---- Phase 2-4 shared settings (defaults only; every field is optional in stored data) ----
  /** [A] Payment ledger defaults. */
  payments: z
    .object({
      defaultMode: z.enum(PAYMENT_MODES).default(""),
      receiptPrefix: z.string().max(10).default("RCT"),
    })
    .prefault({}),
  /** [B] E-invoice guidance. The applicability switch itself is gst.eInvoiceApplicable. */
  eInvoice: z
    .object({
      /** AATO (₹) at or above which e-invoicing applies, as decimal text (₹5 crore). */
      turnoverThreshold: z.string().max(16).default("50000000"),
      /** IRP reporting window (days) for businesses with AATO of ₹10 crore or more. */
      reportingWindowDays: z.number().int().min(0).max(365).default(30),
    })
    .prefault({}),
  /** [C] Recurring templates. */
  recurring: z
    .object({
      /** Create due documents when the app is opened. */
      generateOnOpen: z.boolean().default(true),
      /** Generated invoices stay drafts until reviewed (never auto-issued) unless a template says otherwise. */
      defaultAutoIssue: z.boolean().default(false),
      reminderDays: z.number().int().min(0).max(30).default(3),
    })
    .prefault({}),
  /** [D] Purchases and attachments. */
  purchases: z
    .object({
      defaultPaymentDays: z.number().int().min(0).max(365).default(30),
    })
    .prefault({}),
  attachments: z
    .object({
      /** Largest single file (KB) accepted by receipt/bill attachments. */
      maxFileKb: z.number().int().min(50).max(10240).default(2048),
      /** Warn when all attachments together pass this size (MB). */
      warnTotalMb: z.number().int().min(10).max(2000).default(100),
      /** Include attachment files in backups (can make backups large). */
      includeInBackup: z.boolean().default(true),
    })
    .prefault({}),
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
/* Expenses & other income                                             */
/* ------------------------------------------------------------------ */

export const EXPENSE_GST_MODES = ["none", "intra", "inter"] as const;
export type ExpenseGstMode = (typeof EXPENSE_GST_MODES)[number];
export const ITC_TYPES = ["inputs", "input_services", "capital_goods", "ineligible"] as const;
export type ItcType = (typeof ITC_TYPES)[number];

export const expenseSummarySchema = z.object({
  taxable: z.string().default("0.00"),
  cgst: z.string().default("0.00"),
  sgst: z.string().default("0.00"),
  igst: z.string().default("0.00"),
  total: z.string().default("0.00"),
});
export type ExpenseSummary = z.infer<typeof expenseSummarySchema>;

export const EXPENSE_SCHEMA_VERSION = 1;

export const expenseSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(EXPENSE_SCHEMA_VERSION).default(EXPENSE_SCHEMA_VERSION),
  date: isoDate,
  vendorName: text(160),
  vendorGstin: text(15),
  vendorStateCode: text(2),
  category: text(60),
  description: text(500),
  /** Amount as entered (see amountIncludesGst). */
  amount: decimalText,
  amountIncludesGst: z.boolean().default(true),
  gstRate: decimalText,
  gstMode: z.enum(EXPENSE_GST_MODES).default("none"),
  itcEligible: z.boolean().default(false),
  itcType: z.enum(ITC_TYPES).default("inputs"),
  reverseCharge: z.boolean().default(false),
  invoiceNo: text(60),
  invoiceDate: isoDate,
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).default("paid"),
  paymentDate: isoDate,
  paymentMode: z.enum(PAYMENT_MODES).default(""),
  notes: text(1000),
  /** Computed on save (see computeExpenseSummary); never trusted from input. */
  summary: expenseSummarySchema.prefault({}),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Expense = z.infer<typeof expenseSchema>;

export const INCOME_SCHEMA_VERSION = 1;

export const incomeSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(INCOME_SCHEMA_VERSION).default(INCOME_SCHEMA_VERSION),
  date: isoDate,
  source: text(160),
  category: text(60),
  amount: decimalText,
  notes: text(1000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Income = z.infer<typeof incomeSchema>;

/* ------------------------------------------------------------------ */
/* GST filings                                                         */
/* ------------------------------------------------------------------ */

export const RETURN_TYPES = [
  "GSTR-1",
  "IFF",
  "GSTR-3B",
  "GSTR-1A",
  "GSTR-9",
  "GSTR-9C",
  "GSTR-4",
] as const;
export type ReturnType = (typeof RETURN_TYPES)[number];
export const PERIOD_KINDS = ["month", "quarter", "fy"] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];
export const FILING_STATUSES = ["not_started", "data_ready", "exported", "filed"] as const;
export type FilingStatus = (typeof FILING_STATUSES)[number];

/** "2026-10" (month), "2026-Q3" (quarter), "FY2026-27" (financial year). */
export const PERIOD_KEY_RE = /^(\d{4}-(0[1-9]|1[0-2])|\d{4}-Q[1-4]|FY\d{4}-\d{2})$/;

export const filingSchema = z.object({
  /** `${periodKey}:${returnType}` */
  id: z.string().min(1),
  periodKey: z
    .string()
    .regex(PERIOD_KEY_RE, "Expected a period like 2026-10, 2026-Q3 or FY2026-27"),
  periodKind: z.enum(PERIOD_KINDS),
  returnType: z.enum(RETURN_TYPES),
  status: z.enum(FILING_STATUSES).default("not_started"),
  dueDate: isoDate,
  exportedAt: isoDateTime,
  filedAt: isoDateTime,
  arn: text(30),
  lateFee: decimalText,
  interest: decimalText,
  notes: text(1000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Filing = z.infer<typeof filingSchema>;

export function filingId(periodKey: string, returnType: ReturnType) {
  return `${periodKey}:${returnType}`;
}

export const snapshotRecordSchema = z.object({
  kind: z.enum(["invoice", "expense"]),
  id: z.string().min(1),
  hash: z.string(),
});
export type SnapshotRecord = z.infer<typeof snapshotRecordSchema>;

export const returnSnapshotSchema = z.object({
  id: z.string().min(1),
  filingId: z.string().min(1),
  periodKey: z.string().regex(PERIOD_KEY_RE),
  returnType: z.enum(RETURN_TYPES),
  generatedAt: isoDateTime,
  totals: z.record(z.string(), z.string()).default({}),
  records: z.array(snapshotRecordSchema).default([]),
  createdAt: isoDateTime,
});
export type ReturnSnapshot = z.infer<typeof returnSnapshotSchema>;

/* ------------------------------------------------------------------ */
/* Audit log                                                           */
/* ------------------------------------------------------------------ */

export const AUDIT_ENTITIES = [
  "invoice",
  "expense",
  "income",
  "customer",
  "item",
  "filing",
  "settings",
  // Phase 2-4 entities (see plans/PHASE2-4-OWNERSHIP.md)
  "payment",
  "vendor",
  "purchase",
  "recurring",
  "amendment",
  "gstr2b",
  "periodInput",
  "annualInput",
  "attachment",
] as const;
export type AuditEntity = (typeof AUDIT_ENTITIES)[number];
export const AUDIT_ACTIONS = [
  "create",
  "update",
  "issue",
  "cancel",
  "delete",
  "restore",
  "import",
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const auditChangeSchema = z.object({
  field: z.string().max(60),
  from: z.string().max(200).default(""),
  to: z.string().max(200).default(""),
});
export type AuditChange = z.infer<typeof auditChangeSchema>;

export const auditEntrySchema = z.object({
  id: z.string().min(1),
  entity: z.enum(AUDIT_ENTITIES),
  entityId: z.string().min(1),
  action: z.enum(AUDIT_ACTIONS),
  at: isoDateTime,
  summary: text(500),
  changes: z.array(auditChangeSchema).max(30).default([]),
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

/* ================================================================== */
/* PHASE 2-4 ENTITIES                                                  */
/*                                                                     */
/* One delimited section per feature (A-F). Each feature agent edits   */
/* ONLY its own section. Money is decimal text, dates are ISO strings, */
/* ids come from newId(). See plans/PHASE2-4-OWNERSHIP.md.            */
/* ================================================================== */

/** Optional period key: "" or 2026-10 / 2026-Q3 / FY2026-27. */
const optionalPeriodKey = z
  .string()
  .regex(/^(|\d{4}-(0[1-9]|1[0-2])|\d{4}-Q[1-4]|FY\d{4}-\d{2})$/, "Expected a period like 2026-10")
  .default("");
const fyKeyText = z.string().regex(/^FY\d{4}-\d{2}$/, "Expected a financial year like FY2026-27");
/** Free-form numeric inputs keyed by worksheet field (decimal text values). */
const numberMap = z.record(z.string().max(60), decimalText).default({});

/* ================================================================== */
/* BEGIN [A] PAYMENT LEDGER — owner: feature A                         */
/* Payments, advances and refunds against invoices; customer           */
/* statements and collection analytics read this table.               */
/* ================================================================== */

export const PAYMENT_ENTRY_KINDS = ["payment", "advance", "refund"] as const;
export type PaymentEntryKind = (typeof PAYMENT_ENTRY_KINDS)[number];

export const PAYMENT_ENTRY_SCHEMA_VERSION = 1;

/**
 * One receipt of money (or a refund). `invoiceId` "" = an unallocated advance
 * (allocate it later by splitting the row). The invoice's own `payment` field
 * stays as the legacy single-payment record; the ledger adds to it.
 */
export const paymentEntrySchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(PAYMENT_ENTRY_SCHEMA_VERSION).default(PAYMENT_ENTRY_SCHEMA_VERSION),
  kind: z.enum(PAYMENT_ENTRY_KINDS).default("payment"),
  invoiceId: text(64),
  /** Number of the invoice when recorded (kept readable if the invoice is renamed or removed). */
  invoiceNumber: text(60),
  customerId: text(64),
  customerName: text(160),
  date: isoDate,
  amount: decimalText,
  /** Currency of `amount` ("" = the invoice's currency, INR for advances). */
  currency: z.string().max(3).default(""),
  /** INR per unit of `currency` for advances in a foreign currency ("" = 1). */
  exchangeRate: decimalText,
  mode: z.enum(PAYMENT_MODES).default(""),
  /** UPI ref / cheque no. / bank UTR. */
  reference: text(80),
  receiptNo: text(60),
  /** Set when this row was split off an advance (the source row id). */
  splitFromId: text(64),
  notes: text(500),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type PaymentEntry = z.infer<typeof paymentEntrySchema>;

/* END [A] PAYMENT LEDGER */

/* ================================================================== */
/* BEGIN [B] AMENDMENTS & E-INVOICE — owner: feature B                 */
/* GSTR-1A / amendments after filing and cross-period cancellations.   */
/* E-invoice details live on Invoice.eInvoice (extended above).        */
/* ================================================================== */

export const AMENDMENT_KINDS = [
  "invoice_amendment",
  "note_amendment",
  "cancellation",
  "other",
] as const;
export type AmendmentKind = (typeof AMENDMENT_KINDS)[number];
export const AMENDMENT_STATUSES = ["draft", "ready", "reported"] as const;
export type AmendmentStatus = (typeof AMENDMENT_STATUSES)[number];

export const AMENDMENT_SCHEMA_VERSION = 1;

/** GSTR-1 table an amended document was originally reported in. */
export const AMEND_SECTIONS = ["", "b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur"] as const;
export type AmendSection = (typeof AMEND_SECTIONS)[number];

const amountText = z.string().max(24).default("0.00");

/** One rate row of an amended document (INR, 2 dp, decimal text). */
export const amendItemSchema = z.object({
  rate: z.string().max(8).default("0"),
  taxable: amountText,
  igst: amountText,
  cgst: amountText,
  sgst: amountText,
  cess: amountText,
});
export type AmendItem = z.infer<typeof amendItemSchema>;

/** A document as it appears (or appeared) in GSTR-1: the return-relevant values. */
export const amendDocSchema = z.object({
  number: text(60),
  date: isoDate,
  /** Receiver GSTIN (B2B/CDNR). */
  ctin: text(15),
  /** Place-of-supply state code ("96" = outside India). */
  pos: text(2),
  value: amountText,
  interState: z.boolean().default(false),
  reverseCharge: z.boolean().default(false),
  invType: z.enum(["R", "SEWP", "SEWOP"]).default("R"),
  noteType: z.enum(["", "C", "D"]).default(""),
  exportType: z.enum(["", "WPAY", "WOPAY"]).default(""),
  urType: z.enum(["", "B2CL", "EXPWP", "EXPWOP"]).default(""),
  items: z.array(amendItemSchema).max(30).default([]),
});
export type AmendDoc = z.infer<typeof amendDocSchema>;

export const amendmentSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(AMENDMENT_SCHEMA_VERSION).default(AMENDMENT_SCHEMA_VERSION),
  kind: z.enum(AMENDMENT_KINDS).default("invoice_amendment"),
  status: z.enum(AMENDMENT_STATUSES).default("draft"),
  originalInvoiceId: text(64),
  originalNumber: text(60),
  originalDate: isoDate,
  /** Period of the filed return that carried the original document. */
  originalPeriodKey: optionalPeriodKey,
  /** Open period in which the amendment is reported. */
  amendInPeriodKey: optionalPeriodKey,
  reason: text(300),
  /** GSTR-1 table of the original document. */
  section: z.enum(AMEND_SECTIONS).default(""),
  /** The document as originally reported (entered/confirmed by the user) and as it stands now (null = cancelled). */
  beforeDoc: amendDocSchema.nullable().default(null),
  afterDoc: amendDocSchema.nullable().default(null),
  /** True once the user confirmed that beforeDoc matches what was filed. */
  beforeConfirmed: z.boolean().default(false),
  /** Return-relevant values (taxable, tax heads, place of supply…) before and after. */
  before: z.record(z.string().max(60), z.string().max(200)).default({}),
  after: z.record(z.string().max(60), z.string().max(200)).default({}),
  reportedAt: isoDateTime,
  notes: text(1000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Amendment = z.infer<typeof amendmentSchema>;

/* END [B] AMENDMENTS & E-INVOICE */

/* ================================================================== */
/* BEGIN [C] RECURRING & IMPORT — owner: feature C                     */
/* Templates that generate invoices or expenses on a schedule.         */
/* ================================================================== */

export const RECURRING_KINDS = ["invoice", "expense"] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];
export const RECURRENCE_FREQUENCIES = [
  "weekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const RECURRING_SCHEMA_VERSION = 1;

export const recurringRunSchema = z.object({
  date: isoDate,
  recordId: z.string().min(1),
  recordNumber: text(60),
});
export type RecurringRun = z.infer<typeof recurringRunSchema>;

export const recurringSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(RECURRING_SCHEMA_VERSION).default(RECURRING_SCHEMA_VERSION),
  kind: z.enum(RECURRING_KINDS).default("invoice"),
  name: text(120),
  active: z.boolean().default(true),
  frequency: z.enum(RECURRENCE_FREQUENCIES).default("monthly"),
  /** Every N frequency units. */
  interval: z.number().int().min(1).max(12).default(1),
  startDate: isoDate,
  /** "" = no end. */
  endDate: isoDate,
  /** 0 = same day as the start date; 1-31 = fixed day of month (clamped to month end). */
  dayOfMonth: z.number().int().min(0).max(31).default(0),
  nextRunDate: isoDate,
  lastRunDate: isoDate,
  runCount: z.number().int().min(0).default(0),
  /** 0 = unlimited. */
  maxRuns: z.number().int().min(0).default(0),
  /** Issue generated invoices immediately instead of leaving them as drafts. */
  autoIssue: z.boolean().default(false),
  /**
   * Partial Invoice (kind "invoice") or Expense (kind "expense") to copy.
   * Validate with invoiceSchema/expenseSchema when generating.
   */
  template: z.record(z.string(), z.unknown()).default({}),
  /** Most recent generated records (capped by the writer). */
  runs: z.array(recurringRunSchema).max(200).default([]),
  notes: text(500),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Recurring = z.infer<typeof recurringSchema>;

/* END [C] RECURRING & IMPORT */

/* ================================================================== */
/* BEGIN [D] VENDORS, PURCHASES & ATTACHMENTS — owner: feature D       */
/* Vendor master, purchase bills with payments, receipt attachments.   */
/* ================================================================== */

export const VENDOR_SCHEMA_VERSION = 1;

export const vendorSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(VENDOR_SCHEMA_VERSION).default(VENDOR_SCHEMA_VERSION),
  name: text(160),
  tradeName: text(160),
  gstin: text(15),
  pan: text(10),
  stateCode: text(2),
  billingAddress: text(500),
  city: text(80),
  pincode: text(6),
  email: text(160),
  phone: text(40),
  /** Default credit period for new bills. */
  paymentTermsDays: z.number().int().min(0).max(365).default(30),
  /** Balance carried in when the vendor was added; positive = we owe the vendor. */
  openingBalance: decimalText,
  openingBalanceDate: isoDate,
  defaultCategory: text(60),
  notes: text(1000),
  archived: z.boolean().default(false),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Vendor = z.infer<typeof vendorSchema>;

export const purchaseLineSchema = z.object({
  id: z.string().min(1),
  description: text(300),
  hsn: text(8),
  itemType: z.enum(ITEM_TYPES).default("goods"),
  quantity: decimalText,
  unit: text(10),
  unitPrice: decimalText,
  gstRate: decimalText,
});
export type PurchaseLine = z.infer<typeof purchaseLineSchema>;

/** A payment made against one purchase bill. */
export const purchasePaymentSchema = z.object({
  id: z.string().min(1),
  date: isoDate,
  amount: decimalText,
  mode: z.enum(PAYMENT_MODES).default(""),
  reference: text(80),
  notes: text(300),
});
export type PurchasePayment = z.infer<typeof purchasePaymentSchema>;

export const purchaseSummarySchema = z.object({
  taxable: z.string().default("0.00"),
  cgst: z.string().default("0.00"),
  sgst: z.string().default("0.00"),
  igst: z.string().default("0.00"),
  total: z.string().default("0.00"),
  paid: z.string().default("0.00"),
  balance: z.string().default("0.00"),
});
export type PurchaseSummary = z.infer<typeof purchaseSummarySchema>;

export const PURCHASE_PAYMENT_STATUSES = ["unpaid", "partial", "paid"] as const;
export type PurchasePaymentStatus = (typeof PURCHASE_PAYMENT_STATUSES)[number];

export const PURCHASE_SCHEMA_VERSION = 1;

export const purchaseSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(PURCHASE_SCHEMA_VERSION).default(PURCHASE_SCHEMA_VERSION),
  vendorId: text(64),
  /** Snapshots so the bill stays readable if the vendor is edited or removed. */
  vendorName: text(160),
  vendorGstin: text(15),
  vendorStateCode: text(2),
  billNo: text(60),
  billDate: isoDate,
  dueDate: isoDate,
  placeOfSupply: text(2),
  lines: z.array(purchaseLineSchema).max(500).default([]),
  pricesIncludeGst: z.boolean().default(false),
  gstMode: z.enum(EXPENSE_GST_MODES).default("none"),
  reverseCharge: z.boolean().default(false),
  itcEligible: z.boolean().default(false),
  itcType: z.enum(ITC_TYPES).default("inputs"),
  category: text(60),
  payments: z.array(purchasePaymentSchema).max(200).default([]),
  paymentStatus: z.enum(PURCHASE_PAYMENT_STATUSES).default("unpaid"),
  /** Ids in the attachments table. */
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
  /** Optional link when the bill was also posted as an expense. */
  expenseId: text(64),
  /** Computed on save by the writer; never trusted from input. */
  summary: purchaseSummarySchema.prefault({}),
  notes: text(1000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Purchase = z.infer<typeof purchaseSchema>;

export const ATTACHMENT_OWNER_TYPES = [
  "purchase",
  "expense",
  "invoice",
  "payment",
  "other",
] as const;
export type AttachmentOwnerType = (typeof ATTACHMENT_OWNER_TYPES)[number];

/**
 * Attachment metadata. The file itself lives in `attachmentBlobs` (same id,
 * base64 text) so listing and data-health checks never load file contents.
 */
export const attachmentSchema = z.object({
  id: z.string().min(1),
  ownerType: z.enum(ATTACHMENT_OWNER_TYPES).default("other"),
  ownerId: text(64),
  name: text(200),
  /** MIME type, e.g. image/jpeg or application/pdf. */
  mime: text(100),
  /** Original file size in bytes. */
  size: z.number().int().min(0).default(0),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const attachmentBlobSchema = z.object({
  id: z.string().min(1),
  /** Base64 file contents (no data: prefix). */
  data: z.string().max(60_000_000).default(""),
});
export type AttachmentBlob = z.infer<typeof attachmentBlobSchema>;

/* END [D] VENDORS, PURCHASES & ATTACHMENTS */

/* ================================================================== */
/* BEGIN [E] GSTR-2B / IMS & ITC — owner: feature E                    */
/* Imported GSTR-2B statements, matches to purchases/expenses, and     */
/* manual GSTR-3B worksheet inputs per period.                         */
/* ================================================================== */

export const GSTR2B_DOC_TYPES = ["invoice", "credit_note", "debit_note", "other"] as const;
export type Gstr2bDocType = (typeof GSTR2B_DOC_TYPES)[number];
export const IMS_ACTIONS = ["none", "accepted", "rejected", "pending"] as const;
export type ImsAction = (typeof IMS_ACTIONS)[number];
export const GSTR2B_SOURCES = ["csv", "json", "manual"] as const;
/** Portal section a row came from (b2b, b2ba, cdnr, cdnra, isd, impg). */
export const GSTR2B_SECTIONS = ["b2b", "b2ba", "cdnr", "cdnra", "isd", "impg", "other"] as const;
export type Gstr2bSection = (typeof GSTR2B_SECTIONS)[number];

export const gstr2bRowSchema = z.object({
  id: z.string().min(1),
  supplierGstin: text(15),
  supplierName: text(160),
  docType: z.enum(GSTR2B_DOC_TYPES).default("invoice"),
  docNo: text(60),
  docDate: isoDate,
  /** Added by feature E (defaults keep older rows valid). */
  section: z.enum(GSTR2B_SECTIONS).default("b2b"),
  /** For amendments (b2ba / cdnra): the number of the document being amended. */
  origDocNo: text(60),
  pos: text(2),
  taxable: decimalText,
  igst: decimalText,
  cgst: decimalText,
  sgst: decimalText,
  cess: decimalText,
  rcm: z.boolean().default(false),
  itcAvailable: z.boolean().default(true),
  itcReason: text(200),
  imsAction: z.enum(IMS_ACTIONS).default("none"),
  notes: text(300),
});
export type Gstr2bRow = z.infer<typeof gstr2bRowSchema>;

export const GSTR2B_SCHEMA_VERSION = 1;

export const gstr2bImportSchema = z.object({
  id: z.string().min(1),
  schemaVersion: z.literal(GSTR2B_SCHEMA_VERSION).default(GSTR2B_SCHEMA_VERSION),
  /** Return month, e.g. 2026-10. */
  periodKey: optionalPeriodKey,
  source: z.enum(GSTR2B_SOURCES).default("csv"),
  fileName: text(200),
  /** Recipient GSTIN the statement was generated for. */
  gstin: text(15),
  importedAt: isoDateTime,
  rows: z.array(gstr2bRowSchema).max(20000).default([]),
  notes: text(500),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Gstr2bImport = z.infer<typeof gstr2bImportSchema>;

export const GSTR2B_MATCH_STATUSES = [
  "matched",
  "probable",
  "mismatch",
  "manual",
  "unmatched",
  "ignored",
] as const;
export type Gstr2bMatchStatus = (typeof GSTR2B_MATCH_STATUSES)[number];

/** Link between one imported 2B row and a purchase bill or expense. */
export const gstr2bMatchSchema = z.object({
  id: z.string().min(1),
  importId: z.string().min(1),
  rowId: z.string().min(1),
  targetType: z.enum(["", "purchase", "expense"]).default(""),
  targetId: text(64),
  status: z.enum(GSTR2B_MATCH_STATUSES).default("unmatched"),
  taxableDiff: decimalText,
  taxDiff: decimalText,
  note: text(300),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type Gstr2bMatch = z.infer<typeof gstr2bMatchSchema>;

/**
 * Manual GSTR-3B worksheet inputs for one period. `id` = periodKey (month or
 * quarter). Values use worksheet keys chosen by feature E (e.g. "4B1").
 */
export const periodInputSchema = z.object({
  id: z.string().min(1),
  periodKey: z.string().regex(PERIOD_KEY_RE),
  values: numberMap,
  /** Checkbox style flags (e.g. "ims_reviewed"). */
  flags: z.record(z.string().max(60), z.boolean()).default({}),
  setOffNotes: text(2000),
  notes: text(2000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type PeriodInput = z.infer<typeof periodInputSchema>;

/* END [E] GSTR-2B / IMS & ITC */

/* ================================================================== */
/* BEGIN [F] ANNUAL RETURNS & TAX PACK — owner: feature F              */
/* Manual GSTR-9 / 9C / GSTR-4 / annual P&L inputs keyed by FY.        */
/* ================================================================== */

export const annualInputSchema = z.object({
  /** `FY2026-27` (the financial year key). */
  id: fyKeyText,
  gstr9: numberMap,
  gstr9c: z
    .object({
      checklist: z.record(z.string().max(60), z.boolean()).default({}),
      values: numberMap,
      notes: text(2000),
    })
    .prefault({}),
  gstr4: z
    .object({
      values: numberMap,
      notes: text(2000),
    })
    .prefault({}),
  pnl: z
    .object({
      openingStock: decimalText,
      closingStock: decimalText,
      depreciation: decimalText,
      otherAdjustments: decimalText,
      notes: text(2000),
    })
    .prefault({}),
  /** Manual fields of the CA tax pack (all optional, defaults empty). */
  taxPack: z
    .object({
      /** Income-tax TDS deducted by your customers from your receipts. */
      tdsDeductedByCustomers: decimalText,
      /** GST TCS collected by e-commerce operators (s.52) on your sales. */
      tcsByEcommerce: decimalText,
      /** TDS you deducted from payments you made (to deposit/report). */
      tdsDeductedByYou: decimalText,
      fixedAssetNote: text(2000),
      notes: text(2000),
    })
    .prefault({}),
  notes: text(2000),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
});
export type AnnualInput = z.infer<typeof annualInputSchema>;

/* END [F] ANNUAL RETURNS & TAX PACK */

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
    /** Never contains real security settings: they are stripped on export and ignored on restore. */
    settings: settingsSchema.omit({ security: true }).optional(),
    customers: z.array(customerSchema).default([]),
    items: z.array(catalogItemSchema).default([]),
    invoices: z.array(invoiceSchema).default([]),
    designs: z.array(savedDesignSchema).default([]),
    counters: z.array(counterSchema).default([]),
    expenses: z.array(expenseSchema).default([]),
    incomes: z.array(incomeSchema).default([]),
    filings: z.array(filingSchema).default([]),
    returnSnapshots: z.array(returnSnapshotSchema).default([]),
    auditLog: z.array(auditEntrySchema).default([]),
    // ---- Backup v3 (Phase 2-4): absent in v1/v2 files and defaulted to empty ----
    payments: z.array(paymentEntrySchema).default([]),
    amendments: z.array(amendmentSchema).default([]),
    recurring: z.array(recurringSchema).default([]),
    vendors: z.array(vendorSchema).default([]),
    purchases: z.array(purchaseSchema).default([]),
    attachments: z.array(attachmentSchema).default([]),
    attachmentBlobs: z.array(attachmentBlobSchema).default([]),
    gstr2bImports: z.array(gstr2bImportSchema).default([]),
    gstr2bMatches: z.array(gstr2bMatchSchema).default([]),
    periodInputs: z.array(periodInputSchema).default([]),
    annualInputs: z.array(annualInputSchema).default([]),
  }),
});
export type BackupFile = z.infer<typeof backupFileSchema>;
