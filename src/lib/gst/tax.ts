import type { TaxKind } from "@/lib/calc/engine";
import type { DocType, GstMode, Invoice, SupplyType } from "@/lib/schema";
import { stateFromGstin } from "./gstin";
import { OTHER_COUNTRY_CODE, isUtgstTerritory, stateName } from "./states";

export function docTypeHasTax(docType: DocType) {
  return docType === "tax_invoice" || docType === "proforma";
}

export function isIndia(country: string) {
  const c = country.trim().toLowerCase();
  return c === "" || c === "india" || c === "in" || c === "bharat";
}

/** Customer state: explicit state, else derived from GSTIN, else "outside India". */
export function customerStateCode(customer: Invoice["customer"]): string {
  if (!isIndia(customer.country)) return OTHER_COUNTRY_CODE;
  if (customer.stateCode) return customer.stateCode;
  return stateFromGstin(customer.gstin) ?? "";
}

/** Place of supply: explicit override, else the customer's state. */
export function resolvePlaceOfSupply(invoice: Pick<Invoice, "placeOfSupply" | "customer">): string {
  return invoice.placeOfSupply || customerStateCode(invoice.customer);
}

export function sellerStateCode(seller: Invoice["seller"]): string {
  return seller.stateCode || stateFromGstin(seller.gstin) || "";
}

export interface TaxKindInput {
  docType: DocType;
  gstMode: GstMode;
  supplyType: SupplyType;
  sellerState: string;
  placeOfSupply: string;
}

/**
 * Decide how GST is applied. In split mode, intra-state supplies get CGST+SGST
 * and inter-state supplies get IGST. When either state is unknown we assume
 * intra-state (the common local-business case); validation warns about it.
 */
export function determineTaxKind(input: TaxKindInput): TaxKind {
  if (!docTypeHasTax(input.docType)) return "none";
  if (input.gstMode === "single") return "single";
  if (input.supplyType === "intra") return "intra";
  if (input.supplyType === "inter") return "inter";
  if (!input.sellerState || !input.placeOfSupply) return "intra";
  return input.sellerState === input.placeOfSupply ? "intra" : "inter";
}

export function taxKindForInvoice(invoice: Invoice): TaxKind {
  return determineTaxKind({
    docType: invoice.docType,
    gstMode: invoice.gstMode,
    supplyType: invoice.supplyType,
    sellerState: sellerStateCode(invoice.seller),
    placeOfSupply: resolvePlaceOfSupply(invoice),
  });
}

/** "SGST" or "UTGST" depending on the seller's territory. */
export function stateTaxLabel(sellerState: string) {
  return isUtgstTerritory(sellerState) ? "UTGST" : "SGST";
}

/** Format a rate for display: "18", "0.25", "2.5". */
export function formatRate(rate: string) {
  const n = Number(rate);
  if (!Number.isFinite(n)) return "0";
  return String(Number(n.toFixed(4)));
}

export function halfRate(rate: string) {
  const n = Number(rate) / 2;
  return String(Number(n.toFixed(4)));
}

/** Keep only letters and digits in an HSN/SAC code (max 12 characters). */
export function sanitizeHsnSac(value: string) {
  return value.replace(/[^\dA-Za-z]/g, "").slice(0, 12);
}

/**
 * Plain-language warning when a GSTIN belongs to a different state than the
 * one selected (the first two GSTIN digits are the state code).
 */
export function gstinStateMismatch(gstin: string, stateCode: string): string | null {
  const fromGstin = stateFromGstin(gstin);
  if (!fromGstin || !stateCode || fromGstin === stateCode) return null;
  return `This GSTIN starts with ${fromGstin} (${stateName(fromGstin)}), but the state is ${stateName(stateCode)} (${stateCode}). Check the GSTIN or the state.`;
}
