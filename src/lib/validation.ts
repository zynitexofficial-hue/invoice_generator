import type { InvoiceTotals } from "@/lib/calc/engine";
import { computeSchedule } from "@/lib/calc/schedule";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { checkGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import {
  customerStateCode,
  gstinStateMismatch,
  invoiceHasTax,
  isIndia,
  isZeroRatedWithPayment,
  resolvePlaceOfSupply,
  sellerStateCode,
} from "@/lib/gst/tax";
import { isValidDecimal, toDec } from "@/lib/money";
import { currencyPrecision } from "@/lib/currency";
import { checkGstNumberRules, isGstNumberedDocType } from "@/lib/numbering";
import { fyLabel, fyStartYear } from "@/lib/period";
import { isNoteDocType, type Invoice } from "@/lib/schema";

export type Severity = "error" | "warning";

export interface Issue {
  /** Stable key; also the editor field id used to focus/scroll. */
  field: string;
  message: string;
  severity: Severity;
  /**
   * Advisory "something is missing" warnings. The editor keeps these quiet
   * while you type and only lists them when you press Download — invalid
   * input (e.g. a mistyped GSTIN) is still flagged immediately.
   */
  soft?: boolean;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

export interface ValidationContext {
  /** Another invoice in this browser already uses the same number. */
  duplicateNumber?: boolean;
  /**
   * Minimum HSN/SAC digits on taxed lines (settings.gst.hsnDigits: 4 when
   * the annual turnover is up to ₹5 crore, 6 above). Defaults to 4.
   */
  hsnDigits?: number;
}

/* ---------------- GST rules shared with the UI ---------------- */

/** GST rate rationalisation: the 12% and 28% slabs were removed for most goods from this date. */
export const GST_RATE_CHANGE_DATE = "2025-09-22";
export const GST_RATES_FROM_2025_09_22 = ["0", "0.25", "3", "5", "18", "40"] as const;
/** Older invoices may still carry the 12% and 28% slabs. */
export const GST_RATES_BEFORE_2025_09_22 = ["0", "0.25", "3", "5", "12", "18", "28", "40"] as const;

/** GST rates valid on a document date ("" = today's rules). */
export function allowedGstRates(dateISO: string): readonly string[] {
  return dateISO && dateISO < GST_RATE_CHANGE_DATE
    ? GST_RATES_BEFORE_2025_09_22
    : GST_RATES_FROM_2025_09_22;
}

export function isAllowedGstRate(rate: string, dateISO: string): boolean {
  const n = Number(rate.trim() || "0");
  return allowedGstRates(dateISO).some((r) => Number(r) === n);
}

/** Tax invoices to customers without a GSTIN at or above this value need name, address and state. */
export const UNREGISTERED_DETAILS_THRESHOLD = "50000";

/**
 * Last date to issue a credit note that reduces GST for an invoice (s.34):
 * 30 November after the end of the invoice's financial year.
 */
export function creditNoteDeadline(originalInvoiceDate: string): string {
  return `${fyStartYear(originalInvoiceDate) + 1}-11-30`;
}

const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
function plainDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${SHORT_MONTHS[m - 1]} ${y}`;
}

/** Editor element ids for fields; kept here so validation and UI agree. */
export const fieldId = {
  number: "field-number",
  invoiceDate: "field-invoice-date",
  dueDate: "field-due-date",
  sellerName: "field-seller-name",
  sellerGstin: "field-seller-gstin",
  sellerPan: "field-seller-pan",
  sellerState: "field-seller-state",
  customerName: "field-customer-name",
  customerGstin: "field-customer-gstin",
  customerAddress: "field-customer-address",
  customerState: "field-customer-state",
  placeOfSupply: "field-place-of-supply",
  supplyType: "field-supply-type",
  exportType: "field-export-type",
  lutNumber: "field-lut-number",
  exchangeRate: "field-exchange-rate",
  noteOriginal: "field-note-original",
  noteReason: "field-note-reason",
  lines: "field-lines",
  invoiceDiscount: "field-invoice-discount",
  amountReceived: "field-amount-received",
  paymentSchedule: "field-payment-schedule",
  line: (id: string, part: string) => `field-line-${id}-${part}`,
};

export function validateInvoice(
  inv: Invoice,
  totals: InvoiceTotals,
  ctx: ValidationContext = {},
): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const err = (field: string, message: string) =>
    errors.push({ field, message, severity: "error" });
  const warn = (field: string, message: string) =>
    warnings.push({ field, message, severity: "warning" });
  const hint = (field: string, message: string) =>
    warnings.push({ field, message, severity: "warning", soft: true });
  const meta = DOC_TYPE_META[inv.docType];
  const dp = currencyPrecision(inv.currency);
  // Exports and SEZ supplies with payment carry IGST although their document type alone doesn't.
  const hasTax = invoiceHasTax(inv);
  const money = (v: string) => formatMoney(v, inv.currency);

  // Identity & dates
  if (!inv.number.trim()) err(fieldId.number, "Add a document number.");
  if (!inv.invoiceDate) err(fieldId.invoiceDate, "Choose a document date.");
  if (inv.dueDate && inv.invoiceDate && inv.dueDate < inv.invoiceDate)
    err(fieldId.dueDate, `${meta.dueLabel} can't be before the document date.`);

  // Parties
  if (!inv.seller.name.trim()) err(fieldId.sellerName, "Add your business name (From).");
  if (!inv.customer.name.trim()) err(fieldId.customerName, "Add the customer's name (Bill to).");

  // Lines
  const filled = inv.lines.filter(
    (l) => l.name.trim() || l.description.trim() || toDec(l.unitPrice).greaterThan(0),
  );
  if (filled.length === 0) err(fieldId.lines, "Add at least one item.");
  for (const [index, line] of inv.lines.entries()) {
    const label = line.name.trim() || `Item ${index + 1}`;
    const isEmpty = !line.name.trim() && !line.description.trim() && !line.unitPrice.trim();
    if (isEmpty && inv.lines.length > 1) continue; // blank rows are ignored when others exist
    if (!line.name.trim() && !line.description.trim())
      err(fieldId.line(line.id, "name"), `${label}: add a name or description.`);
    if (
      !isValidDecimal(line.quantity, { maxDecimals: 3 }) ||
      toDec(line.quantity).lessThanOrEqualTo(0)
    )
      err(fieldId.line(line.id, "quantity"), `${label}: quantity must be greater than 0.`);
    if (!isValidDecimal(line.unitPrice, { maxDecimals: Math.max(dp, 2) + 2, allowEmpty: true }))
      err(fieldId.line(line.id, "price"), `${label}: enter a valid price.`);
    if (line.discount.value.trim()) {
      const d = toDec(line.discount.value);
      if (!isValidDecimal(line.discount.value, { maxDecimals: 4 }))
        err(fieldId.line(line.id, "discount"), `${label}: enter a valid discount.`);
      else if (line.discount.kind === "percent" && d.greaterThan(100))
        err(fieldId.line(line.id, "discount"), `${label}: discount can't exceed 100%.`);
      else if (line.discount.kind === "flat") {
        const base = toDec(line.quantity).mul(toDec(line.unitPrice));
        if (d.greaterThan(base))
          err(
            fieldId.line(line.id, "discount"),
            `${label}: discount is more than the line amount.`,
          );
      }
    }
    if (hasTax) {
      const rate = toDec(line.gstRate);
      if (
        !isValidDecimal(line.gstRate, { maxDecimals: 3, allowEmpty: true }) ||
        rate.greaterThan(100)
      )
        err(fieldId.line(line.id, "rate"), `${label}: GST rate must be between 0 and 100.`);
      else if (!isAllowedGstRate(line.gstRate, inv.invoiceDate))
        // Date-aware (B8): 12% and 28% are fine on documents dated before 22 Sep 2025.
        warn(
          fieldId.line(line.id, "rate"),
          `${label}: ${Number(line.gstRate)}% isn't a GST rate ${
            inv.invoiceDate && inv.invoiceDate < GST_RATE_CHANGE_DATE
              ? "for this date"
              : "since 22 Sep 2025"
          } (${allowedGstRates(inv.invoiceDate).join(", ")}%).`,
        );
    }
  }

  // Invoice-level discount
  if (inv.invoiceDiscount.value.trim()) {
    const d = toDec(inv.invoiceDiscount.value);
    if (!isValidDecimal(inv.invoiceDiscount.value, { maxDecimals: 4 }))
      err(fieldId.invoiceDiscount, "Enter a valid invoice discount.");
    else if (inv.invoiceDiscount.kind === "percent" && d.greaterThan(100))
      err(fieldId.invoiceDiscount, "Invoice discount can't exceed 100%.");
    else if (inv.invoiceDiscount.kind === "flat" && d.greaterThan(toDec(totals.subtotal)))
      err(fieldId.invoiceDiscount, "Invoice discount is more than the subtotal.");
  }

  // Payment. The calculation caps "received" at the total, so an overpayment would
  // disappear silently — say how much is extra instead (B13).
  if (meta.hasPayment && inv.payment.amountReceived.trim()) {
    if (!isValidDecimal(inv.payment.amountReceived, { maxDecimals: dp }))
      err(fieldId.amountReceived, "Enter a valid amount received.");
    else {
      const excess = overpayment(inv, totals);
      if (excess)
        warn(
          fieldId.amountReceived,
          `${money(excess)} more than the total — record the excess as an advance.`,
        );
    }
  }

  // Payment terms (advance / milestones)
  const stages = inv.paymentSchedule.filter(
    (s) => s.label.trim() || s.due.trim() || s.value.trim(),
  );
  if (stages.length > 0) {
    const bad = stages.find(
      (s) =>
        !isValidDecimal(s.value, { maxDecimals: s.kind === "percent" ? 2 : dp }) ||
        (s.kind === "percent" && toDec(s.value).greaterThan(100)),
    );
    if (bad)
      err(
        fieldId.paymentSchedule,
        `Payment terms: enter a valid ${bad.kind === "percent" ? "percentage" : "amount"} for ${bad.label.trim() || "each instalment"}.`,
      );
    else {
      const left = toDec(computeSchedule(stages, totals.grandTotal, totals.precision).unscheduled);
      if (!left.isZero())
        warn(
          fieldId.paymentSchedule,
          left.isNegative()
            ? "Payment terms add up to more than the total."
            : "Payment terms don't cover the full total yet.",
        );
    }
  }

  // Rule 46: GST document numbers are at most 16 letters, digits, "-" and "/" (A4).
  if (isGstNumberedDocType(inv.docType) && inv.number.trim()) {
    const number = inv.number.trim();
    const rules = checkGstNumberRules(number);
    if (rules.tooLong)
      err(
        fieldId.number,
        `GST allows at most 16 characters in the number (this one has ${number.length}).`,
      );
    if (rules.invalidChars)
      err(fieldId.number, "GST document numbers may only contain letters, digits, “-” and “/”.");
  }

  if (inv.docType === "tax_invoice") {
    // The tax head (CGST + SGST vs IGST) needs both states — never guess on a tax invoice (B7).
    if (!sellerStateCode(inv.seller))
      err(fieldId.sellerState, "Add your state — a tax invoice needs it to work out the GST.");
    else if (!resolvePlaceOfSupply(inv))
      err(
        fieldId.placeOfSupply,
        "Add the place of supply (the customer's state) — a tax invoice needs it.",
      );

    // Customers without GSTIN: name, address and state on invoices of ₹50,000 or more (B9).
    if (
      !inv.customer.gstin.trim() &&
      inv.currency === "INR" &&
      toDec(totals.grandTotal).greaterThanOrEqualTo(UNREGISTERED_DETAILS_THRESHOLD)
    ) {
      const why = "needed for customers without GSTIN on invoices of ₹50,000 or more";
      if (!inv.customer.billingAddress.trim())
        err(fieldId.customerAddress, `Customer address is ${why}.`);
      if (isIndia(inv.customer.country) && !customerStateCode(inv.customer))
        err(fieldId.customerState, `Customer state is ${why}.`);
    }
  }

  // HSN/SAC length on taxed lines (B11): 4 digits up to ₹5 crore turnover, 6 above.
  const minHsn = ctx.hsnDigits ?? 4;
  if (hasTax && inv.docType !== "proforma") {
    for (const [index, line] of inv.lines.entries()) {
      const code = line.hsnSac.trim();
      if (!code || toDec(line.gstRate).isZero()) continue;
      if (code.replace(/\D/g, "").length < minHsn)
        warn(
          fieldId.line(line.id, "hsn"),
          `${line.name.trim() || `Item ${index + 1}`}: HSN/SAC should have at least ${minHsn} digits.`,
        );
    }
  }

  // Credit/debit notes (B1, B2)
  if (isNoteDocType(inv.docType)) {
    if (!inv.note.originalInvoiceNumber.trim())
      err(fieldId.noteOriginal, "A note must name the original invoice it corrects.");
    if (!inv.note.reason) err(fieldId.noteReason, "Choose the reason for this note.");
    const original = inv.note.originalInvoiceDate;
    if (inv.docType === "credit_note" && original && inv.invoiceDate) {
      const deadline = creditNoteDeadline(original);
      if (inv.invoiceDate > deadline)
        warn(
          fieldId.invoiceDate,
          `Credit notes for FY ${fyLabel(fyStartYear(original))} invoices had to be issued by ${plainDate(deadline)}, so this note can't reduce the GST.`,
        );
    }
  }

  // Exports (B6)
  if (inv.docType === "export") {
    const ex = inv.exportDetails;
    if (ex.type === "wopay" && !ex.lutNumber.trim())
      err(fieldId.lutNumber, "Add your LUT/bond number — exports without IGST need it.");
    if (!ex.type)
      hint(fieldId.exportType, "Choose the export type: with IGST payment or under LUT.");
    if (inv.currency !== "INR") {
      if (!ex.exchangeRate.trim())
        err(
          fieldId.exchangeRate,
          `Add the exchange rate (₹ for 1 ${inv.currency}) — GST returns report exports in rupees.`,
        );
      else if (
        !isValidDecimal(ex.exchangeRate, { maxDecimals: 4 }) ||
        !toDec(ex.exchangeRate).greaterThan(0)
      )
        err(fieldId.exchangeRate, "Enter a valid exchange rate.");
    }
  }

  // ---- Warnings (download is still allowed) ----
  if (ctx.duplicateNumber)
    warn(
      fieldId.number,
      `Number ${inv.number} is already used by another document in this browser.`,
    );

  if (inv.docType === "tax_invoice") {
    if (!inv.seller.gstin.trim())
      hint(fieldId.sellerGstin, "A tax invoice normally shows your GSTIN.");
    if (inv.gstMode === "single")
      hint(
        "field-gst-mode",
        "Standard GST invoices show CGST/SGST or IGST separately (you're using single GST).",
      );
    const missingHsn = inv.lines.some((l) => l.name.trim() && !l.hsnSac.trim());
    if (missingHsn) hint(fieldId.lines, "Some items have no HSN/SAC code.");
  }

  if (inv.seller.gstin.trim()) {
    const check = checkGstin(inv.seller.gstin);
    if (!check.valid) warn(fieldId.sellerGstin, `Your GSTIN: ${check.message}.`);
    const mismatch = gstinStateMismatch(inv.seller.gstin, inv.seller.stateCode);
    if (mismatch) warn(fieldId.sellerState, mismatch);
  }
  if (inv.customer.gstin.trim()) {
    const check = checkGstin(inv.customer.gstin);
    if (!check.valid) warn(fieldId.customerGstin, `Customer GSTIN: ${check.message}.`);
    else {
      const mismatch = gstinStateMismatch(inv.customer.gstin, inv.customer.stateCode);
      if (mismatch) warn(fieldId.customerGstin, mismatch);
    }
  }

  const sellerState = sellerStateCode(inv.seller);
  const pos = resolvePlaceOfSupply(inv);
  // Tax invoices get a blocking error above; other taxed documents only a hint.
  if (
    hasTax &&
    inv.docType !== "tax_invoice" &&
    inv.gstMode === "split" &&
    inv.supplyType === "auto"
  ) {
    if (!sellerState)
      hint(
        fieldId.sellerState,
        "Add your state so CGST/SGST vs IGST can be decided (assuming same-state).",
      );
    else if (!pos)
      hint(
        fieldId.placeOfSupply,
        "Add the place of supply (customer state); assuming same-state supply.",
      );
  }

  // A manual Same state / Inter-state choice that contradicts the place of supply (B7).
  // SEZ supplies are always inter-state, so a manual "Inter-state" is right for them. Single-GST
  // documents ignore the manual choice, so there is nothing to contradict.
  const zeroRatedWithPayment = isZeroRatedWithPayment(inv.docType, {
    exportType: inv.exportDetails.type,
    sez: inv.sez,
  });
  if (
    hasTax &&
    inv.gstMode === "split" &&
    inv.supplyType !== "auto" &&
    sellerState &&
    pos &&
    !inv.sez.enabled &&
    !zeroRatedWithPayment
  ) {
    const expected = sellerState === pos ? "intra" : "inter";
    if (inv.supplyType !== expected)
      warn(
        fieldId.supplyType,
        expected === "inter"
          ? `Your state (${stateName(sellerState)}) and the place of supply (${stateName(pos)}) differ, so this is normally IGST — not CGST + SGST.`
          : `Your state and the place of supply are both ${stateName(pos)}, so this is normally CGST + SGST — not IGST.`,
      );
  }

  return { errors, warnings };
}

/**
 * Amount received above the grand total ("" when there is none). The totals
 * engine caps "received" at the total; the excess is an advance (B13).
 */
export function overpayment(inv: Invoice, totals: InvoiceTotals): string {
  if (!DOC_TYPE_META[inv.docType].hasPayment) return "";
  const raw = inv.payment.amountReceived.trim();
  if (!raw || !isValidDecimal(raw, { maxDecimals: totals.precision })) return "";
  const excess = toDec(raw).minus(toDec(totals.grandTotal));
  return excess.greaterThan(0) ? excess.toFixed(totals.precision) : "";
}
