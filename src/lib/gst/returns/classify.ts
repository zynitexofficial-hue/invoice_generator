import type { InvoiceTotals } from "@/lib/calc/engine";
import { checkGstin, normalizeGstin } from "@/lib/gst/gstin";
import { OTHER_COUNTRY_CODE } from "@/lib/gst/states";
import { isIndia, resolvePlaceOfSupply, sellerStateCode } from "@/lib/gst/tax";
import { computeTotals, isIssued } from "@/lib/invoice-calc";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { inPeriod } from "@/lib/period";
import { isNoteDocType, type AppSettings, type Invoice } from "@/lib/schema";
import { normRate, type DecHeads } from "./internal";
import type {
  B2bInvoiceType,
  CdnurType,
  ExcludedReason,
  ExcludedRecord,
  ExportType,
  NilKind,
  NoteType,
  Placement,
  ReturnIssue,
} from "./types";
import { uqcFor } from "./uqc";
import {
  B2CL_THRESHOLD,
  ISSUE_CODES,
  validExchangeRate,
  validateInvoice,
  validateNumbers,
} from "./validate";

/**
 * GSTR-1 placement of each invoice for a period (spec F3). Pure: invoices in,
 * placements out. All values are recomputed with computeTotals() from LINE
 * values and converted to INR; invoice.summary is never used.
 */

/** One invoice line in INR, ready for aggregation. */
export interface InrLine extends DecHeads {
  lineId: string;
  index: number;
  hsn: string;
  description: string;
  uqc: string;
  qty: Dec;
  /** Normalised rate ("18", "0.25"). "0" for NIL supplies. */
  rate: string;
}

export interface ClassifiedDoc {
  invoice: Invoice;
  placement: Placement;
  /** −1 for credit notes, +1 otherwise. */
  sign: 1 | -1;
  /** "C"/"D" for credit/debit notes, null for invoices. */
  noteType: NoteType | null;
  /** Notes: the original invoice when found in the records. */
  original: Invoice | null;
  /** Notes: where the original invoice sits (found or inferred). */
  originalPlacement: Placement | null;
  /** CDNUR only. */
  urType: CdnurType | null;
  registered: boolean;
  ctin: string;
  receiverName: string;
  pos: string;
  interState: boolean;
  invType: B2bInvoiceType;
  exportType: ExportType | null;
  nilKind: NilKind | null;
  /** Grand total in INR (positive). */
  value: Dec;
  lines: InrLine[];
}

export interface Classification {
  docs: ClassifiedDoc[];
  excluded: ExcludedRecord[];
  issues: ReturnIssue[];
  /** Issued GST documents dated in the period, cancelled included (DOCS input, record hashes). */
  issuedInPeriod: Invoice[];
}

export interface ClassifyInput {
  /** All invoices (originals of notes and duplicate numbers are looked up here). */
  invoices: Invoice[];
  settings: AppSettings;
  periodKey: string;
  /** Filing state; defaults to the settings profile state/GSTIN. */
  sellerState?: string;
}

const EXCLUDED_MESSAGES: Record<ExcludedReason, string> = {
  no_date: "No invoice date.",
  outside_period: "Dated outside this period.",
  proforma: "Quotations/proforma invoices are not reported.",
  non_gst_invoice: "Invoice without GST (not a GST document).",
  draft: "Draft — not issued yet.",
  cancelled: "Cancelled — counted only in the documents summary.",
  missing_exchange_rate: "Foreign-currency document without an INR exchange rate.",
};

function excludedRecord(inv: Invoice, reason: ExcludedReason): ExcludedRecord {
  return {
    invoiceId: inv.id,
    number: inv.number,
    date: inv.invoiceDate,
    docType: inv.docType,
    reason,
    message: EXCLUDED_MESSAGES[reason],
  };
}

/** Export: export doc type, export details set, or a customer outside India (SEZ is domestic). */
export function isExportInvoice(inv: Invoice): boolean {
  if (inv.sez.enabled) return false;
  return (
    inv.docType === "export" || inv.exportDetails.type !== "" || !isIndia(inv.customer.country)
  );
}

export function nilKindOf(inv: Invoice): NilKind | null {
  if (inv.supplyNature === "nil") return "nil";
  if (inv.supplyNature === "exempt") return "exempt";
  if (inv.supplyNature === "non_gst") return "non_gst";
  if (inv.docType === "bill_of_supply") return "exempt";
  return null;
}

/** INR conversion factor: null for INR, a positive Dec, or undefined when missing/invalid. */
function inrFactor(inv: Invoice): Dec | null | undefined {
  if (inv.currency === "INR") return null;
  return validExchangeRate(inv.exportDetails.exchangeRate)
    ? toDec(inv.exportDetails.exchangeRate)
    : undefined;
}

function toInr(value: string, factor: Dec | null): Dec {
  const d = toDec(value);
  return factor ? roundTo(d.mul(factor), 2) : d;
}

interface Facts {
  totals: InvoiceTotals;
  pos: string;
  sellerState: string;
  registered: boolean;
  ctin: string;
  interState: boolean;
  isExport: boolean;
  exportType: ExportType | null;
  nilKind: NilKind | null;
  invType: B2bInvoiceType;
  value: Dec;
  lines: InrLine[];
}

function factsOf(inv: Invoice, factor: Dec | null, fallbackState: string): Facts {
  const totals = computeTotals(inv);
  const isExport = isExportInvoice(inv);
  const sellerState = sellerStateCode(inv.seller) || fallbackState;
  const pos = isExport ? OTHER_COUNTRY_CODE : resolvePlaceOfSupply(inv);
  const gstin = normalizeGstin(inv.customer.gstin);
  const registered = !isExport && gstin !== "" && checkGstin(gstin).valid;
  let interState: boolean;
  if (isExport || inv.sez.enabled || totals.taxKind === "inter") interState = true;
  else if (totals.taxKind === "intra") interState = false;
  else if (inv.supplyType !== "auto") interState = inv.supplyType === "inter";
  else interState = Boolean(pos && sellerState && pos !== sellerState);
  const nilKind = isExport ? null : nilKindOf(inv);
  const exportType: ExportType | null = !isExport
    ? null
    : inv.exportDetails.type === "wpay" ||
        (inv.exportDetails.type === "" && toDec(totals.taxTotal).greaterThan(0))
      ? "WPAY"
      : "WOPAY";
  const invType: B2bInvoiceType = inv.sez.enabled ? (inv.sez.withPayment ? "SEWP" : "SEWOP") : "R";

  const lines: InrLine[] = inv.lines.map((line, index) => {
    const lt = totals.lines[index];
    let igst = toInr(lt.igst, factor);
    let cgst = toInr(lt.cgst, factor);
    let sgst = toInr(lt.sgst, factor);
    const gst = toInr(lt.gst, factor);
    if (!gst.isZero()) {
      // Single-GST mode: record the heads from the place of supply.
      if (interState) igst = igst.plus(gst);
      else {
        const half = roundTo(gst.div(2), 2);
        cgst = cgst.plus(half);
        sgst = sgst.plus(gst.minus(half));
      }
    }
    return {
      lineId: line.id,
      index,
      hsn: line.hsnSac.trim(),
      description: line.name.trim(),
      uqc: uqcFor(line),
      qty: Dec.max(toDec(line.quantity), ZERO),
      rate: nilKind ? "0" : normRate(lt.rate),
      taxable: toInr(lt.taxable, factor),
      igst,
      cgst,
      sgst,
      cess: ZERO,
    };
  });

  return {
    totals,
    pos,
    sellerState,
    registered,
    ctin: registered ? gstin : "",
    interState,
    isExport,
    exportType,
    nilKind,
    invType,
    value: toInr(totals.grandTotal, factor),
    lines,
  };
}

/** Placement of an invoice (or a note treated like an invoice, to infer its original's section). */
function basePlacement(f: Facts): Placement {
  if (f.isExport) return "exp";
  if (f.nilKind) return "nil";
  if (f.registered) return "b2b";
  if (f.interState && f.value.greaterThan(B2CL_THRESHOLD)) return "b2cl";
  return "b2cs";
}

function findOriginal(note: Invoice, all: Invoice[]): Invoice | null {
  const { originalInvoiceId, originalInvoiceNumber, originalInvoiceDate } = note.note;
  const candidates = all.filter((i) => i.id !== note.id && !isNoteDocType(i.docType));
  if (originalInvoiceId) {
    const byId = candidates.find((i) => i.id === originalInvoiceId);
    if (byId) return byId;
  }
  const num = originalInvoiceNumber.trim().toUpperCase();
  if (!num) return null;
  const byNumber = candidates.filter((i) => i.number.trim().toUpperCase() === num);
  return (
    byNumber.find((i) => originalInvoiceDate && i.invoiceDate === originalInvoiceDate) ??
    byNumber.find((i) => isIssued(i)) ??
    null
  );
}

function receiverName(inv: Invoice) {
  return (inv.customer.company || inv.customer.name).trim();
}

/** Classify every invoice for the period. */
export function classifyInvoices({
  invoices,
  settings,
  periodKey,
  sellerState,
}: ClassifyInput): Classification {
  const fallbackState =
    sellerState ??
    (settings.profile.stateCode || checkGstin(settings.profile.gstin).stateCode || "");
  const docs: ClassifiedDoc[] = [];
  const excluded: ExcludedRecord[] = [];
  const issues: ReturnIssue[] = [];
  const issuedInPeriod: Invoice[] = [];

  for (const inv of invoices) {
    if (!inv.invoiceDate) {
      excluded.push(excludedRecord(inv, "no_date"));
      continue;
    }
    if (!inPeriod(inv.invoiceDate, periodKey)) {
      excluded.push(excludedRecord(inv, "outside_period"));
      continue;
    }
    if (inv.docType === "proforma") {
      excluded.push(excludedRecord(inv, "proforma"));
      continue;
    }
    if (inv.docType === "invoice") {
      excluded.push(excludedRecord(inv, "non_gst_invoice"));
      continue;
    }
    if (!isIssued(inv)) {
      excluded.push(excludedRecord(inv, "draft"));
      continue;
    }
    issuedInPeriod.push(inv);
    if (inv.status === "cancelled") {
      excluded.push(excludedRecord(inv, "cancelled"));
      continue;
    }
    const factor = inrFactor(inv);
    if (factor === undefined) {
      excluded.push(excludedRecord(inv, "missing_exchange_rate"));
      issues.push({
        severity: "error",
        code: ISSUE_CODES.EXCHANGE_RATE_MISSING,
        message: `This ${inv.currency} document needs the INR exchange rate (₹ per 1 ${inv.currency}) to be reported.`,
        recordKind: "invoice",
        recordId: inv.id,
        field: "exportDetails.exchangeRate",
      });
      continue;
    }

    const f = factsOf(inv, factor, fallbackState);
    const isNote = isNoteDocType(inv.docType);
    let placement: Placement;
    let original: Invoice | null = null;
    let originalPlacement: Placement | null = null;
    let urType: CdnurType | null = null;
    let nilKind = f.nilKind;

    if (isNote) {
      original = findOriginal(inv, invoices);
      let origFacts: Facts = f;
      if (original) {
        const origFactor = inrFactor(original);
        origFacts = factsOf(original, origFactor ?? null, fallbackState);
      }
      originalPlacement = basePlacement(origFacts);
      nilKind = nilKind ?? (originalPlacement === "nil" ? origFacts.nilKind : null);
      if (f.registered) placement = "cdnr";
      else if (originalPlacement === "b2cl") {
        placement = "cdnur";
        urType = "B2CL";
      } else if (originalPlacement === "exp") {
        placement = "cdnur";
        urType = (origFacts.exportType ?? f.exportType) === "WPAY" ? "EXPWP" : "EXPWOP";
      } else if (originalPlacement === "nil" || nilKind) placement = "nil";
      else placement = "b2cs";
    } else {
      placement = basePlacement(f);
    }

    docs.push({
      invoice: inv,
      placement,
      sign: inv.docType === "credit_note" ? -1 : 1,
      noteType: isNote ? (inv.docType === "credit_note" ? "C" : "D") : null,
      original,
      originalPlacement,
      urType,
      registered: f.registered,
      ctin: f.ctin,
      receiverName: receiverName(inv),
      pos: f.pos || f.sellerState,
      interState: f.interState,
      invType: f.invType,
      exportType:
        f.exportType ?? (urType === "EXPWP" ? "WPAY" : urType === "EXPWOP" ? "WOPAY" : null),
      nilKind,
      value: f.value,
      lines: nilKind && !f.nilKind ? f.lines.map((l) => ({ ...l, rate: "0" })) : f.lines,
    });

    issues.push(
      ...validateInvoice({
        invoice: inv,
        settings,
        totals: f.totals,
        valueInr: f.value,
        registered: f.registered,
        interState: f.interState,
        pos: f.pos,
        sellerState: f.sellerState,
        isExport: f.isExport || urType === "EXPWP" || urType === "EXPWOP",
        exportType: f.exportType,
        nilKind,
        original: isNote ? original : undefined,
      }),
    );
  }

  issues.push(...validateNumbers(issuedInPeriod, invoices));
  return { docs, excluded, issues, issuedInPeriod };
}
