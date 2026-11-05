/**
 * Shared types for the GST return engine (src/lib/gst/returns).
 *
 * Money values are plain decimal strings in rupees with exactly 2 decimals
 * ("1234.50"). Credit notes are stored with positive values and a note type;
 * section totals for CDNR/CDNUR are signed (debit notes add, credit notes
 * subtract) so that every section's totals can be added together.
 *
 * Everything here is a DRAFT prepared from the user's records — verify on the
 * GST portal (or with a CA) before filing.
 */

export type Severity = "error" | "warning" | "info";

/** "period" = a whole-period finding (e.g. a negative B2CS row or a gap in a number series). */
export type IssueRecordKind = "invoice" | "expense" | "settings" | "period";

export interface ReturnIssue {
  /** "error" blocks export; "warning" and "info" do not. */
  severity: Severity;
  /** Stable machine code (see ISSUE_CODES in validate.ts). */
  code: string;
  /** Plain-language explanation for the user. */
  message: string;
  recordKind: IssueRecordKind;
  /** Invoice/expense id, "app" for settings, or the period key for "period". */
  recordId: string;
  /** Field to focus when the user clicks "Fix" (e.g. "number", "customer.gstin", "lines.3.hsnSac"). */
  field?: string;
}

/** Tax values of a row (all in INR, 2 dp). */
export interface TaxValues {
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
}

/** One rate row of an invoice/note ("itms" in the portal JSON). */
export interface RateItem extends TaxValues {
  /** GST rate in percent, e.g. "18", "0.25". */
  rate: string;
}

export type B2bInvoiceType = "R" | "SEWP" | "SEWOP";
export type ExportType = "WPAY" | "WOPAY";
export type NoteType = "C" | "D";
export type CdnurType = "B2CL" | "EXPWP" | "EXPWOP";

interface DocBase {
  invoiceId: string;
  number: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  /** Document value in INR (grand total, incl. tax and round-off). */
  value: string;
  /** Place-of-supply state code ("96" = outside India). */
  pos: string;
  interState: boolean;
  items: RateItem[];
}

export interface B2bInvoice extends DocBase {
  ctin: string;
  receiverName: string;
  reverseCharge: boolean;
  invType: B2bInvoiceType;
}

export type B2clInvoice = DocBase;

export interface B2csRow extends TaxValues {
  supplyType: "INTRA" | "INTER";
  pos: string;
  rate: string;
}

export interface ExpInvoice extends DocBase {
  exportType: ExportType;
  portCode: string;
  shippingBillNo: string;
  shippingBillDate: string;
}

export interface CdnrNote extends DocBase {
  ctin: string;
  receiverName: string;
  noteType: NoteType;
  reverseCharge: boolean;
  invType: B2bInvoiceType;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
}

export interface CdnurNote extends DocBase {
  noteType: NoteType;
  urType: CdnurType;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
}

/** Kind of a non-taxable supply in the NIL table. */
export type NilKind = "nil" | "exempt" | "non_gst";

/** GSTR-1 placement of a document. Notes against B2CS/NIL supplies are netted there. */
export type Placement = "b2b" | "b2cl" | "b2cs" | "exp" | "nil" | "cdnr" | "cdnur";

export type NilSupplyType = "INTRB2B" | "INTRAB2B" | "INTRB2C" | "INTRAB2C";

export interface NilRow {
  supplyType: NilSupplyType;
  nil: string;
  exempt: string;
  nonGst: string;
}

export interface HsnRow extends TaxValues {
  hsn: string;
  description: string;
  uqc: string;
  qty: string;
  rate: string;
  /** taxable + all taxes. */
  totalValue: string;
}

/** GSTR-1 Table 13 document nature codes used by this app. */
export type DocNature = 1 | 4 | 5;

export interface DocSeries {
  nature: DocNature;
  natureLabel: string;
  /** Number with trailing digits removed ("INV/26-27/"); "" for numbers without trailing digits. */
  prefix: string;
  from: string;
  to: string;
  total: number;
  cancelled: number;
  net: number;
  /** Numbers missing between from and to (only for numeric series). */
  gaps: number;
}

export interface Gstr1Sections {
  b2b: B2bInvoice[];
  b2cl: B2clInvoice[];
  b2cs: B2csRow[];
  exp: ExpInvoice[];
  cdnr: CdnrNote[];
  cdnur: CdnurNote[];
  nil: NilRow[];
  hsnB2b: HsnRow[];
  hsnB2c: HsnRow[];
  docs: DocSeries[];
}

export type Gstr1SectionKey = keyof Gstr1Sections;

/** Sections that carry supply values (excludes the HSN and DOCS summaries). */
export const SUPPLY_SECTION_KEYS = ["b2b", "b2cl", "b2cs", "exp", "cdnr", "cdnur", "nil"] as const;
export type SupplySectionKey = (typeof SUPPLY_SECTION_KEYS)[number];

export interface SectionTotals extends TaxValues {
  /** Documents (B2B/B2CL/EXP/CDN), rows (B2CS/NIL/HSN) or documents issued (DOCS). */
  count: number;
}

export type ExcludedReason =
  | "no_date"
  | "outside_period"
  | "proforma"
  | "non_gst_invoice"
  | "draft"
  | "cancelled"
  | "missing_exchange_rate";

export interface ExcludedRecord {
  invoiceId: string;
  number: string;
  date: string;
  docType: string;
  reason: ExcludedReason;
  message: string;
}

export interface RecordHash {
  id: string;
  hash: string;
}

export interface Gstr1Result {
  periodKey: string;
  gstin: string;
  sections: Gstr1Sections;
  totals: Record<Gstr1SectionKey, SectionTotals>;
  /** Sum of the supply sections (B2B+B2CL+B2CS+EXP+CDNR+CDNUR+NIL), notes signed. */
  grandTotals: SectionTotals;
  issues: ReturnIssue[];
  /** True when at least one issue has severity "error" (export should be disabled). */
  hasErrors: boolean;
  excluded: ExcludedRecord[];
  /** Return hash per invoice that counts for this period (included + cancelled). */
  recordHashes: RecordHash[];
}
