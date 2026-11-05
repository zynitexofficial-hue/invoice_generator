import type { InvoiceTotals } from "@/lib/calc/engine";
import { computeSchedule } from "@/lib/calc/schedule";
import { DOC_TYPE_META } from "@/lib/documents";
import { checkGstin } from "@/lib/gst/gstin";
import { gstinStateMismatch, resolvePlaceOfSupply, sellerStateCode } from "@/lib/gst/tax";
import { isValidDecimal, toDec } from "@/lib/money";
import { currencyPrecision } from "@/lib/currency";
import { checkGstNumberRules } from "@/lib/numbering";
import type { Invoice } from "@/lib/schema";

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
  placeOfSupply: "field-place-of-supply",
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
    if (meta.hasTax) {
      const rate = toDec(line.gstRate);
      if (
        !isValidDecimal(line.gstRate, { maxDecimals: 3, allowEmpty: true }) ||
        rate.greaterThan(100)
      )
        err(fieldId.line(line.id, "rate"), `${label}: GST rate must be between 0 and 100.`);
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

  // Payment
  if (meta.hasPayment && inv.payment.amountReceived.trim()) {
    const received = toDec(inv.payment.amountReceived);
    if (!isValidDecimal(inv.payment.amountReceived, { maxDecimals: dp }))
      err(fieldId.amountReceived, "Enter a valid amount received.");
    else if (received.greaterThan(toDec(totals.grandTotal)))
      err(fieldId.amountReceived, "Amount received is more than the invoice total.");
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

  // ---- Warnings (download is still allowed) ----
  if (ctx.duplicateNumber)
    warn(
      fieldId.number,
      `Number ${inv.number} is already used by another document in this browser.`,
    );

  if (inv.docType === "tax_invoice") {
    const rules = checkGstNumberRules(inv.number);
    if (rules.tooLong)
      warn(fieldId.number, "GST rules allow at most 16 characters in a tax invoice number.");
    if (rules.invalidChars)
      warn(fieldId.number, "GST invoice numbers may only contain letters, digits, “-” and “/”.");
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

  if (meta.hasTax && inv.gstMode === "split" && inv.supplyType === "auto") {
    if (!sellerStateCode(inv.seller))
      hint(
        fieldId.sellerState,
        "Add your state so CGST/SGST vs IGST can be decided (assuming same-state).",
      );
    else if (!resolvePlaceOfSupply(inv))
      hint(
        fieldId.placeOfSupply,
        "Add the place of supply (customer state); assuming same-state supply.",
      );
  }

  return { errors, warnings };
}
