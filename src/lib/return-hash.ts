import type { Expense, Invoice } from "@/lib/schema";

/**
 * Change detection for GST returns (spec A10/F7/F8).
 *
 * Each hash covers only the fields that can change a return. Downloads,
 * design, notes, payment and denormalised summaries are ignored, so
 * re-downloading a PDF never looks like an edit.
 */

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** JSON with object keys sorted, so equal data always gives the same text. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): Json {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const key of Object.keys(value as object).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = normalize(v);
    }
    return out;
  }
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string")
    return value;
  return String(value);
}

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

/** FNV-1a 64-bit over the UTF-8 bytes of `text`, as 16 hex characters. Not cryptographic. */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

/** The return-relevant part of an invoice (exported for tests/debugging). */
export function invoiceReturnFields(invoice: Invoice) {
  return {
    id: invoice.id,
    docType: invoice.docType,
    number: invoice.number,
    invoiceDate: invoice.invoiceDate,
    currency: invoice.currency,
    seller: {
      gstin: invoice.seller.gstin,
      stateCode: invoice.seller.stateCode,
      country: invoice.seller.country,
    },
    customer: {
      name: invoice.customer.name,
      company: invoice.customer.company,
      gstin: invoice.customer.gstin,
      stateCode: invoice.customer.stateCode,
      country: invoice.customer.country,
      billingAddress: invoice.customer.billingAddress,
    },
    placeOfSupply: invoice.placeOfSupply,
    lines: invoice.lines.map((l) => ({
      name: l.name,
      hsnSac: l.hsnSac,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discount: l.discount,
      gstRate: l.gstRate,
      itemType: l.itemType,
      uqc: l.uqc,
    })),
    invoiceDiscount: invoice.invoiceDiscount,
    pricesIncludeGst: invoice.pricesIncludeGst,
    gstMode: invoice.gstMode,
    supplyType: invoice.supplyType,
    roundOff: invoice.roundOff,
    issuedAt: invoice.issuedAt,
    status: invoice.status,
    cancelledAt: invoice.cancelledAt,
    supplyNature: invoice.supplyNature,
    reverseCharge: invoice.reverseCharge,
    sez: invoice.sez,
    exportDetails: invoice.exportDetails,
    note: invoice.note,
  };
}

/** The return-relevant part of an expense (exported for tests/debugging). */
export function expenseReturnFields(expense: Expense) {
  return {
    id: expense.id,
    date: expense.date,
    vendorName: expense.vendorName,
    vendorGstin: expense.vendorGstin,
    vendorStateCode: expense.vendorStateCode,
    category: expense.category,
    amount: expense.amount,
    amountIncludesGst: expense.amountIncludesGst,
    gstRate: expense.gstRate,
    gstMode: expense.gstMode,
    itcEligible: expense.itcEligible,
    itcType: expense.itcType,
    reverseCharge: expense.reverseCharge,
    invoiceNo: expense.invoiceNo,
    invoiceDate: expense.invoiceDate,
  };
}

export function invoiceReturnHash(invoice: Invoice): string {
  return fnv1a64(stableStringify(invoiceReturnFields(invoice)));
}

export function expenseReturnHash(expense: Expense): string {
  return fnv1a64(stableStringify(expenseReturnFields(expense)));
}
