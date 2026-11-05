import type { InvoiceTotals } from "@/lib/calc/engine";
import { checkGstin, normalizeGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { gstinStateMismatch, invoiceHasTax } from "@/lib/gst/tax";
import { Dec, toDec } from "@/lib/money";
import { fyStartYear } from "@/lib/period";
import { isNoteDocType, type AppSettings, type Expense, type Invoice } from "@/lib/schema";
import { checkHsn, requiredHsnDigits } from "./hsn";
import { isRateAllowed, RATE_WARNING_LABEL } from "./rates";
import type { ExportType, NilKind, ReturnIssue, Severity } from "./types";

/**
 * Return-specific validation (business-gst-suite §7.4, feature list B4–B11).
 * Errors block exporting a return; warnings and info do not.
 */

export const ISSUE_CODES = {
  SELLER_GSTIN_MISSING: "SELLER_GSTIN_MISSING",
  SELLER_GSTIN_INVALID: "SELLER_GSTIN_INVALID",
  SELLER_GSTIN_DIFFERS: "SELLER_GSTIN_DIFFERS",
  SELLER_STATE_MISSING: "SELLER_STATE_MISSING",
  NOT_REGULAR: "NOT_REGULAR",
  CURRENCY_NOT_INR: "CURRENCY_NOT_INR",
  EXCHANGE_RATE_MISSING: "EXCHANGE_RATE_MISSING",
  NUMBER_MISSING: "NUMBER_MISSING",
  NUMBER_DUPLICATE: "NUMBER_DUPLICATE",
  NUMBER_TOO_LONG: "NUMBER_TOO_LONG",
  NUMBER_INVALID_CHARS: "NUMBER_INVALID_CHARS",
  CUSTOMER_GSTIN_INVALID: "CUSTOMER_GSTIN_INVALID",
  POS_MISSING: "POS_MISSING",
  HSN_MISSING: "HSN_MISSING",
  HSN_INVALID: "HSN_INVALID",
  HSN_TOO_SHORT: "HSN_TOO_SHORT",
  SAC_SHORT: "SAC_SHORT",
  RATE_NOT_ALLOWED: "RATE_NOT_ALLOWED",
  RATE_LEGACY: "RATE_LEGACY",
  NOTE_ORIGINAL_MISSING: "NOTE_ORIGINAL_MISSING",
  NOTE_ORIGINAL_NOT_FOUND: "NOTE_ORIGINAL_NOT_FOUND",
  NOTE_TIME_LIMIT: "NOTE_TIME_LIMIT",
  EXPORT_TYPE_MISSING: "EXPORT_TYPE_MISSING",
  EXPORT_SHIPPING_MISSING: "EXPORT_SHIPPING_MISSING",
  EXPORT_LUT_MISSING: "EXPORT_LUT_MISSING",
  EXPORT_WOPAY_TAX: "EXPORT_WOPAY_TAX",
  SEZ_GSTIN_MISSING: "SEZ_GSTIN_MISSING",
  SEZ_LUT_MISSING: "SEZ_LUT_MISSING",
  B2C_DETAILS_MISSING: "B2C_DETAILS_MISSING",
  STATE_GSTIN_MISMATCH: "STATE_GSTIN_MISMATCH",
  B2CL_NEAR_THRESHOLD: "B2CL_NEAR_THRESHOLD",
  ZERO_RATED_NOT_EXPORT: "ZERO_RATED_NOT_EXPORT",
  NIL_WITH_TAX: "NIL_WITH_TAX",
  SUPPLY_TYPE_OVERRIDE: "SUPPLY_TYPE_OVERRIDE",
  B2CS_NEGATIVE: "B2CS_NEGATIVE",
  DOCS_GAP: "DOCS_GAP",
  EXPENSE_ITC_NO_GSTIN: "EXPENSE_ITC_NO_GSTIN",
  EXPENSE_ITC_NO_INVOICE: "EXPENSE_ITC_NO_INVOICE",
  EXPENSE_RCM_NO_GST: "EXPENSE_RCM_NO_GST",
} as const;
export type IssueCode = (typeof ISSUE_CODES)[keyof typeof ISSUE_CODES];

export const B2CL_THRESHOLD = new Dec(100_000);
export const B2CL_NEAR_FROM = new Dec(90_000);
export const B2C_DETAILS_THRESHOLD = new Dec(50_000);
/** Rule 46: at most 16 characters: letters, digits, "-" and "/". */
export const MAX_NUMBER_LENGTH = 16;
const NUMBER_CHARS = /^[A-Za-z0-9/-]+$/;

const issue = (
  severity: Severity,
  code: IssueCode,
  message: string,
  recordKind: ReturnIssue["recordKind"],
  recordId: string,
  field?: string,
): ReturnIssue =>
  field
    ? { severity, code, message, recordKind, recordId, field }
    : { severity, code, message, recordKind, recordId };

export const hasErrors = (issues: ReturnIssue[]) => issues.some((i) => i.severity === "error");

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export function validateSettings(settings: AppSettings): ReturnIssue[] {
  const out: ReturnIssue[] = [];
  const gstin = settings.profile.gstin;
  if (settings.gst.registrationType !== "regular") {
    out.push(
      issue(
        "info",
        ISSUE_CODES.NOT_REGULAR,
        `Your GST registration type is "${settings.gst.registrationType}". GSTR-1 and GSTR-3B apply to regular taxpayers only — this draft is for reference.`,
        "settings",
        "app",
        "gst.registrationType",
      ),
    );
  }
  if (!gstin.trim()) {
    out.push(
      issue(
        "error",
        ISSUE_CODES.SELLER_GSTIN_MISSING,
        "Add your GSTIN in Settings → Business profile before preparing a return.",
        "settings",
        "app",
        "profile.gstin",
      ),
    );
  } else {
    const check = checkGstin(gstin);
    if (!check.valid)
      out.push(
        issue(
          "error",
          ISSUE_CODES.SELLER_GSTIN_INVALID,
          `Your GSTIN looks wrong: ${check.message}.`,
          "settings",
          "app",
          "profile.gstin",
        ),
      );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Numbers                                                             */
/* ------------------------------------------------------------------ */

/** Number series group for uniqueness: outward invoices, credit notes, debit notes. */
export function numberGroup(docType: Invoice["docType"]): string {
  return isNoteDocType(docType) ? docType : "outward";
}

/**
 * Number checks for the issued GST documents of the period (cancelled
 * included): missing, too long, invalid characters, and duplicates within
 * the same financial year and series group among `allInvoices`.
 */
export function validateNumbers(periodDocs: Invoice[], allInvoices: Invoice[]): ReturnIssue[] {
  const out: ReturnIssue[] = [];
  const keyOf = (inv: Invoice) =>
    `${numberGroup(inv.docType)}|${inv.invoiceDate ? fyStartYear(inv.invoiceDate) : ""}|${inv.number.trim().toUpperCase()}`;
  const counts = new Map<string, number>();
  for (const inv of allInvoices) {
    if (!inv.issuedAt || inv.docType === "proforma" || inv.docType === "invoice") continue;
    if (!inv.number.trim()) continue;
    const k = keyOf(inv);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const inv of periodDocs) {
    const num = inv.number.trim();
    if (!num) {
      out.push(
        issue(
          "error",
          ISSUE_CODES.NUMBER_MISSING,
          "This document has no number.",
          "invoice",
          inv.id,
          "number",
        ),
      );
      continue;
    }
    if (num.length > MAX_NUMBER_LENGTH)
      out.push(
        issue(
          "error",
          ISSUE_CODES.NUMBER_TOO_LONG,
          `Number "${num}" has ${num.length} characters; GST allows at most ${MAX_NUMBER_LENGTH}.`,
          "invoice",
          inv.id,
          "number",
        ),
      );
    if (!NUMBER_CHARS.test(num))
      out.push(
        issue(
          "error",
          ISSUE_CODES.NUMBER_INVALID_CHARS,
          `Number "${num}" may only contain letters, digits, "-" and "/".`,
          "invoice",
          inv.id,
          "number",
        ),
      );
    if ((counts.get(keyOf(inv)) ?? 0) > 1)
      out.push(
        issue(
          "error",
          ISSUE_CODES.NUMBER_DUPLICATE,
          `Number "${num}" is used more than once in this financial year.`,
          "invoice",
          inv.id,
          "number",
        ),
      );
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Invoices                                                            */
/* ------------------------------------------------------------------ */

export interface InvoiceCheckContext {
  invoice: Invoice;
  settings: AppSettings;
  totals: InvoiceTotals;
  /** Grand total in INR (null when it cannot be converted). */
  valueInr: Dec | null;
  registered: boolean;
  interState: boolean;
  pos: string;
  sellerState: string;
  isExport: boolean;
  exportType: ExportType | null;
  nilKind: NilKind | null;
  /** Notes: whether a reference was given and whether the original was found. */
  original?: Invoice | null;
}

function lutNumber(ctx: InvoiceCheckContext) {
  return ctx.invoice.exportDetails.lutNumber.trim() || ctx.settings.declarations.lutNumber.trim();
}

/** Validity of an exchange rate text (positive decimal). */
export function validExchangeRate(text: string): boolean {
  return toDec(text).greaterThan(0);
}

export function validateInvoice(ctx: InvoiceCheckContext): ReturnIssue[] {
  const { invoice: inv, settings, totals } = ctx;
  const out: ReturnIssue[] = [];
  const add = (severity: Severity, code: IssueCode, message: string, field?: string) =>
    out.push(issue(severity, code, message, "invoice", inv.id, field));
  const hasTax = invoiceHasTax(inv);
  const taxTotal = toDec(totals.taxTotal);
  const isNote = isNoteDocType(inv.docType);

  // Seller
  const sellerGstin = normalizeGstin(inv.seller.gstin);
  const filingGstin = normalizeGstin(settings.profile.gstin);
  if (sellerGstin && filingGstin && sellerGstin !== filingGstin)
    add(
      "warning",
      ISSUE_CODES.SELLER_GSTIN_DIFFERS,
      `This document was issued under GSTIN ${sellerGstin}, not your current GSTIN ${filingGstin}.`,
      "seller.gstin",
    );
  if (hasTax && !ctx.sellerState)
    add(
      "error",
      ISSUE_CODES.SELLER_STATE_MISSING,
      "Your state is unknown, so CGST/SGST vs IGST cannot be decided. Add your state or GSTIN.",
      "seller.stateCode",
    );

  // Currency
  if (inv.currency !== "INR" && !ctx.isExport)
    add(
      "error",
      ISSUE_CODES.CURRENCY_NOT_INR,
      `Domestic GST documents must be in INR (this one is in ${inv.currency}).`,
      "currency",
    );

  // Customer
  const custGstin = inv.customer.gstin.trim();
  if (custGstin) {
    const check = checkGstin(custGstin);
    if (!check.valid)
      add(
        "error",
        ISSUE_CODES.CUSTOMER_GSTIN_INVALID,
        `Customer GSTIN looks wrong: ${check.message}. Fix it, or remove it to report as unregistered.`,
        "customer.gstin",
      );
    else if (inv.customer.stateCode) {
      const mismatch = gstinStateMismatch(custGstin, inv.customer.stateCode);
      if (mismatch)
        add("warning", ISSUE_CODES.STATE_GSTIN_MISMATCH, mismatch, "customer.stateCode");
    }
  }

  // Place of supply
  if (hasTax && !ctx.pos)
    add(
      "error",
      ISSUE_CODES.POS_MISSING,
      "Place of supply is missing. Choose the customer's state or the place of supply.",
      "placeOfSupply",
    );

  // Manual intra/inter override that contradicts the place of supply
  if (
    inv.supplyType !== "auto" &&
    ctx.pos &&
    ctx.sellerState &&
    !ctx.isExport &&
    !inv.sez.enabled &&
    (inv.supplyType === "inter") !== (ctx.pos !== ctx.sellerState)
  )
    add(
      "warning",
      ISSUE_CODES.SUPPLY_TYPE_OVERRIDE,
      `Supply is set to ${inv.supplyType}-state, but the place of supply (${stateName(ctx.pos) || ctx.pos}) says otherwise.`,
      "supplyType",
    );

  // Lines: HSN and rate
  const minDigits = requiredHsnDigits(settings);
  inv.lines.forEach((line, i) => {
    const lt = totals.lines[i];
    if (!lt || toDec(lt.taxable).isZero()) return;
    if (ctx.nilKind !== "non_gst") {
      const hsnCheck = checkHsn(line.hsnSac, minDigits);
      const label = line.name || `Line ${i + 1}`;
      if (hsnCheck === "missing")
        add(
          "error",
          ISSUE_CODES.HSN_MISSING,
          `${label}: HSN/SAC code is missing.`,
          `lines.${i}.hsnSac`,
        );
      else if (hsnCheck === "invalid")
        add(
          "error",
          ISSUE_CODES.HSN_INVALID,
          `${label}: HSN/SAC "${line.hsnSac}" should be digits only.`,
          `lines.${i}.hsnSac`,
        );
      else if (hsnCheck === "too_short")
        add(
          "error",
          ISSUE_CODES.HSN_TOO_SHORT,
          `${label}: HSN/SAC "${line.hsnSac}" is too short — at least ${minDigits} digits are required for your turnover.`,
          `lines.${i}.hsnSac`,
        );
      else if (hsnCheck === "sac_short")
        add(
          "warning",
          ISSUE_CODES.SAC_SHORT,
          `${label}: service code (SAC) "${line.hsnSac}" — 6 digits are recommended.`,
          `lines.${i}.hsnSac`,
        );
    }
    if (!ctx.nilKind) {
      const rateCheck = isRateAllowed(line.gstRate, inv.invoiceDate);
      if (rateCheck === "error")
        add(
          "error",
          ISSUE_CODES.RATE_NOT_ALLOWED,
          `${line.name || `Line ${i + 1}`}: GST rate ${line.gstRate || "0"}% is not a valid rate on ${inv.invoiceDate}.`,
          `lines.${i}.gstRate`,
        );
      else if (rateCheck === "warn")
        add(
          "warning",
          ISSUE_CODES.RATE_LEGACY,
          `${line.name || `Line ${i + 1}`}: ${line.gstRate}% is only valid in limited cases after 22 Sep 2025 (${RATE_WARNING_LABEL}).`,
          `lines.${i}.gstRate`,
        );
    }
  });

  // Supply nature
  if (inv.supplyNature === "zero_rated" && !ctx.isExport && !inv.sez.enabled)
    add(
      "error",
      ISSUE_CODES.ZERO_RATED_NOT_EXPORT,
      "Marked zero-rated but it is neither an export nor an SEZ supply. Set the export/SEZ details or change the supply nature.",
      "supplyNature",
    );
  if (ctx.nilKind && taxTotal.greaterThan(0))
    add(
      "error",
      ISSUE_CODES.NIL_WITH_TAX,
      "This is a nil-rated/exempt/non-GST supply but it charges GST. Set the GST rate to 0 or change the supply nature.",
      "supplyNature",
    );

  // Notes
  if (isNote) {
    const ref = inv.note.originalInvoiceId || inv.note.originalInvoiceNumber.trim();
    if (!ref)
      add(
        "error",
        ISSUE_CODES.NOTE_ORIGINAL_MISSING,
        "Credit/debit notes must refer to the original invoice (number and date).",
        "note.originalInvoiceNumber",
      );
    else if (!ctx.original)
      add(
        "warning",
        ISSUE_CODES.NOTE_ORIGINAL_NOT_FOUND,
        `The original invoice ${inv.note.originalInvoiceNumber || ""} was not found in your records, so its return section was inferred from this note.`,
        "note.originalInvoiceNumber",
      );
    const originalDate = ctx.original?.invoiceDate || inv.note.originalInvoiceDate;
    if (originalDate && inv.docType === "credit_note" && inv.invoiceDate) {
      const limit = `${fyStartYear(originalDate) + 1}-11-30`;
      if (inv.invoiceDate > limit)
        add(
          "warning",
          ISSUE_CODES.NOTE_TIME_LIMIT,
          `Credit notes for invoices of this financial year had to be issued by ${limit} (s.34). Tax cannot be reduced after that.`,
          "invoiceDate",
        );
    }
  }

  // Exports
  if (ctx.isExport) {
    if (!inv.exportDetails.type)
      add(
        "warning",
        ISSUE_CODES.EXPORT_TYPE_MISSING,
        `Export type is not set; reported as ${ctx.exportType === "WPAY" ? "with IGST payment" : "under LUT (without payment)"}.`,
        "exportDetails.type",
      );
    if (ctx.exportType === "WOPAY" && !isNote && !lutNumber(ctx))
      add(
        "error",
        ISSUE_CODES.EXPORT_LUT_MISSING,
        "Export without payment of IGST needs your LUT/bond number.",
        "exportDetails.lutNumber",
      );
    if (ctx.exportType === "WOPAY" && taxTotal.greaterThan(0))
      add(
        "error",
        ISSUE_CODES.EXPORT_WOPAY_TAX,
        "Export under LUT (without payment) should not charge GST.",
        "exportDetails.type",
      );
    const hasGoods = inv.lines.some((l) => l.itemType === "goods" && !/^99/.test(l.hsnSac.trim()));
    if (
      hasGoods &&
      !isNote &&
      (!inv.exportDetails.shippingBillNo.trim() ||
        !inv.exportDetails.shippingBillDate ||
        !inv.exportDetails.portCode.trim())
    )
      add(
        "warning",
        ISSUE_CODES.EXPORT_SHIPPING_MISSING,
        "Shipping bill number/date and port code are missing. Add them when available (they can also be added later in an amendment).",
        "exportDetails.shippingBillNo",
      );
  }

  // SEZ
  if (inv.sez.enabled) {
    if (!ctx.registered)
      add(
        "error",
        ISSUE_CODES.SEZ_GSTIN_MISSING,
        "SEZ supplies are reported with the SEZ unit's GSTIN. Add a valid customer GSTIN.",
        "customer.gstin",
      );
    if (!inv.sez.withPayment && !isNote && !lutNumber(ctx))
      add(
        "error",
        ISSUE_CODES.SEZ_LUT_MISSING,
        "SEZ supply without payment of IGST needs your LUT/bond number.",
        "exportDetails.lutNumber",
      );
  }

  // Unregistered recipients
  if (!ctx.registered && !ctx.isExport && ctx.valueInr) {
    if (ctx.valueInr.greaterThanOrEqualTo(B2C_DETAILS_THRESHOLD) && !isNote) {
      const c = inv.customer;
      const missing: [string, string][] = [];
      if (!(c.name.trim() || c.company.trim())) missing.push(["name", "customer.name"]);
      if (!c.billingAddress.trim()) missing.push(["address", "customer.billingAddress"]);
      if (!(c.stateCode || inv.placeOfSupply)) missing.push(["state", "customer.stateCode"]);
      if (missing.length)
        add(
          "error",
          ISSUE_CODES.B2C_DETAILS_MISSING,
          `For unregistered customers with invoices of ₹50,000 or more, the customer's ${missing.map((m) => m[0]).join(", ")} must be on the invoice.`,
          missing[0][1],
        );
    }
    if (
      ctx.interState &&
      !isNote &&
      ctx.valueInr.greaterThanOrEqualTo(B2CL_NEAR_FROM) &&
      ctx.valueInr.lessThanOrEqualTo(B2CL_THRESHOLD)
    )
      add(
        "warning",
        ISSUE_CODES.B2CL_NEAR_THRESHOLD,
        `Invoice value ₹${ctx.valueInr.toFixed(2)} is just under the ₹1,00,000 B2CL limit — it is reported in B2CS. Check the value if this looks wrong.`,
        "lines",
      );
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Expenses (GSTR-3B)                                                  */
/* ------------------------------------------------------------------ */

export function validateExpense(expense: Expense, gst: Dec): ReturnIssue[] {
  const out: ReturnIssue[] = [];
  const add = (severity: Severity, code: IssueCode, message: string, field?: string) =>
    out.push(issue(severity, code, message, "expense", expense.id, field));
  const claimsItc = expense.itcEligible && expense.itcType !== "ineligible" && gst.greaterThan(0);
  if (claimsItc && !expense.reverseCharge) {
    if (!checkGstin(expense.vendorGstin).valid)
      add(
        "warning",
        ISSUE_CODES.EXPENSE_ITC_NO_GSTIN,
        "ITC is claimed but the vendor GSTIN is missing or invalid. ITC needs a valid tax invoice from a registered vendor.",
        "vendorGstin",
      );
    if (!expense.invoiceNo.trim())
      add(
        "warning",
        ISSUE_CODES.EXPENSE_ITC_NO_INVOICE,
        "ITC is claimed but the vendor invoice number is missing.",
        "invoiceNo",
      );
  }
  if (expense.reverseCharge && gst.isZero())
    add(
      "warning",
      ISSUE_CODES.EXPENSE_RCM_NO_GST,
      "Marked reverse charge, but no GST rate/head is set, so no tax is computed for it.",
      "gstRate",
    );
  return out;
}
