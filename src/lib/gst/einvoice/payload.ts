import { checkGstin, normalizeGstin } from "@/lib/gst/gstin";
import { classifyInvoices, type ClassifiedDoc } from "@/lib/gst/returns/classify";
import { fmt2 } from "@/lib/gst/returns/internal";
import { isUqcCode, uqcFor } from "@/lib/gst/returns/uqc";
import { isValidStateCode } from "@/lib/gst/states";
import { customerStateCode } from "@/lib/gst/tax";
import { computeTotals } from "@/lib/invoice-calc";
import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import { monthKey } from "@/lib/period";
import type { AppSettings, Invoice } from "@/lib/schema";
import type { ReturnIssue } from "@/lib/gst/returns/types";
import { ineligibleReason } from "./applicability";

/**
 * IRP e-invoice payload (INV-1, schema "1.1" style) built locally from an
 * invoice. NO API call is ever made.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ VERIFY AGAINST THE PORTAL. The official schema documents on          │
 * │ einvoice1.gst.gov.in could not be fetched while building this (host  │
 * │ not reachable from the build environment). Field names, lengths and  │
 * │ rules below are from the author's knowledge of the published INV-1   │
 * │ v1.1 schema and are UNCONFIRMED: check against the current schema    │
 * │ and the bulk-generation tool help before uploading anything.         │
 * │ Items marked (unconfirmed) are the least certain.                    │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Mapping (portal key ← source):
 *   Version "1.1"
 *   TranDtls  TaxSch "GST", SupTyp ← B2B | SEZWP | SEZWOP, RegRev ← Y/N, IgstOnIntra "N"
 *   DocDtls   Typ ← INV | CRN | DBN, No (max 16, no leading 0, letters/digits/"/"/"-"), Dt DD/MM/YYYY
 *   SellerDtls Gstin, LglNm, TrdNm?, Addr1, Addr2?, Loc, Pin (number), Stcd
 *   BuyerDtls  Gstin, LglNm, TrdNm?, Pos, Addr1, Addr2?, Loc, Pin (number), Stcd
 *   ItemList  [{ SlNo, PrdDesc, IsServc, HsnCd, Qty, Unit, UnitPrice, TotAmt, Discount, AssAmt,
 *              GstRt, IgstAmt, CgstAmt, SgstAmt, CesRt, CesAmt, TotItemVal }]
 *   ValDtls   AssVal, CgstVal, SgstVal, IgstVal, CesVal, RndOffAmt, TotInvVal
 *   RefDtls   (credit/debit notes) PrecDocDtls [{ InvNo, InvDt }]  (unconfirmed)
 *
 * Document-level discounts are allocated to lines, so ValDtls.Discount is omitted.
 * Prices are written as (taxable + discount) / quantity, so TotAmt = Qty × UnitPrice
 * to within rounding of a 3-decimal unit price (unconfirmed tolerance).
 */
export const EINVOICE_SCHEMA_VERSION = "1.1";

export const DRAFT_DISCLAIMER =
  "Draft prepared from your records. Check every field against the e-invoice portal's current schema and bulk-upload instructions before uploading.";

/** Where the bulk-upload instructions live (portal home; navigate to its help/tools). Verify the link. */
export const PORTAL_URL = "https://einvoice1.gst.gov.in/";
export const PORTAL_LINK_TEXT = "e-invoice portal (bulk generation help and schema)";

export interface EInvoiceItem {
  SlNo: string;
  PrdDesc: string;
  IsServc: "Y" | "N";
  HsnCd: string;
  Qty: number;
  Unit: string;
  UnitPrice: number;
  TotAmt: number;
  Discount: number;
  AssAmt: number;
  GstRt: number;
  IgstAmt: number;
  CgstAmt: number;
  SgstAmt: number;
  CesRt: number;
  CesAmt: number;
  TotItemVal: number;
}

export interface EInvoiceParty {
  Gstin: string;
  LglNm: string;
  TrdNm?: string;
  Pos?: string;
  Addr1: string;
  Addr2?: string;
  Loc: string;
  Pin: number;
  Stcd: string;
}

export interface EInvoiceDoc {
  Version: string;
  TranDtls: {
    TaxSch: "GST";
    SupTyp: "B2B" | "SEZWP" | "SEZWOP";
    RegRev: "Y" | "N";
    IgstOnIntra: "Y" | "N";
  };
  DocDtls: { Typ: "INV" | "CRN" | "DBN"; No: string; Dt: string };
  SellerDtls: EInvoiceParty;
  BuyerDtls: EInvoiceParty;
  ItemList: EInvoiceItem[];
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    CesVal: number;
    RndOffAmt: number;
    TotInvVal: number;
  };
  RefDtls?: { PrecDocDtls: { InvNo: string; InvDt: string }[] };
}

export interface EInvoiceBuild {
  invoiceId: string;
  number: string;
  /** Always present for eligible documents; check `issues` for blockers before exporting. */
  payload: EInvoiceDoc | null;
  issues: ReturnIssue[];
  /** True when at least one issue is an error. */
  blocked: boolean;
}

const num = (v: string | Dec, dp = 2): number => Number(roundTo(toDec(String(v)), dp).toFixed(dp));

/** "2026-10-05" → "05/10/2026". */
export function irpDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const DOC_NO_RE = /^[A-Za-z1-9][A-Za-z0-9/-]{0,15}$/;
const PIN_RE = /^[1-9]\d{5}$/;

/** Collapse whitespace/newlines and split into Addr1/Addr2 of at most 100 characters each. */
export function splitAddress(address: string): { addr1: string; addr2: string } {
  const flat = address
    .replace(/\s*[\r\n]+\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
  if (flat.length <= 100) return { addr1: flat, addr2: "" };
  const cut = flat.lastIndexOf(" ", 100);
  const at = cut > 40 ? cut : 100;
  return { addr1: flat.slice(0, at).trim(), addr2: flat.slice(at).trim().slice(0, 100) };
}

type Party = Invoice["seller"] | Invoice["customer"];

interface PartyCheck {
  who: "Seller" | "Buyer";
  recordKind: "invoice" | "settings";
  prefix: string;
}

function checkParty(
  p: {
    name: string;
    address: string;
    city: string;
    pincode: string;
    stateCode: string;
    gstin: string;
  },
  c: PartyCheck,
  id: string,
  issues: ReturnIssue[],
) {
  const add = (code: string, message: string, field: string) =>
    issues.push({
      severity: "error",
      code,
      message: `${c.who}: ${message}`,
      recordKind: c.recordKind,
      recordId: c.recordKind === "settings" ? "app" : id,
      field: `${c.prefix}${field === "address" && c.who === "Buyer" ? "billingAddress" : field}`,
    });
  if (!checkGstin(p.gstin).valid) add("EINV_GSTIN", "GSTIN is missing or invalid.", "gstin");
  if (!p.name.trim()) add("EINV_NAME", "legal name is missing.", "name");
  else if (p.name.trim().length > 100)
    add("EINV_NAME_LEN", "legal name is over 100 characters (portal limit).", "name");
  if (!p.address.trim()) add("EINV_ADDR", "address is missing.", "address");
  if (p.city.trim().length < 3)
    add("EINV_CITY", "city/location is missing (3 to 50 characters).", "city");
  else if (p.city.trim().length > 50) add("EINV_CITY_LEN", "city is over 50 characters.", "city");
  if (!PIN_RE.test(p.pincode.trim())) add("EINV_PIN", "PIN code must be 6 digits.", "pincode");
  if (!isValidStateCode(p.stateCode)) add("EINV_STATE", "state code is missing.", "stateCode");
}

function party(
  p: { name: string; address: string; city: string; pincode: string; stateCode: string },
  gstin: string,
  trade: string,
): EInvoiceParty {
  const { addr1, addr2 } = splitAddress(p.address);
  const out: EInvoiceParty = {
    Gstin: gstin,
    LglNm: p.name.trim().slice(0, 100),
    Addr1: addr1,
    Loc: p.city.trim().slice(0, 50),
    Pin: Number(p.pincode.trim()) || 0,
    Stcd: p.stateCode,
  };
  if (trade && trade !== out.LglNm) out.TrdNm = trade.slice(0, 100);
  if (addr2) out.Addr2 = addr2;
  return out;
}

const sellerView = (inv: Invoice, settings: AppSettings) => {
  const s: Party = inv.seller;
  const prof = settings.profile;
  const pick = (a: string, b: string) => (a.trim() ? a : b);
  return {
    name: pick(inv.seller.legalName, pick(inv.seller.name, pick(prof.legalName, prof.name))),
    trade: pick(inv.seller.tradeName, prof.tradeName),
    address: pick(s.address, prof.address),
    city: pick(s.city, prof.city),
    pincode: pick(s.pincode, prof.pincode),
    stateCode: pick(s.stateCode, prof.stateCode) || checkGstin(s.gstin).stateCode || "",
    gstin: normalizeGstin(pick(s.gstin, prof.gstin)),
  };
};

/** Build the payload (and blockers) for one classified document. */
function buildOne(
  inv: Invoice,
  settings: AppSettings,
  d: ClassifiedDoc | undefined,
): EInvoiceBuild {
  const issues: ReturnIssue[] = [];
  const addInv = (
    severity: "error" | "warning",
    code: string,
    message: string,
    field?: string,
  ): void => {
    issues.push({ severity, code, message, recordKind: "invoice", recordId: inv.id, field });
  };

  const seller = sellerView(inv, settings);
  checkParty(seller, { who: "Seller", recordKind: "settings", prefix: "profile." }, inv.id, issues);

  const buyerGstin = normalizeGstin(inv.customer.gstin);
  const buyerState = customerStateCode(inv.customer) || checkGstin(buyerGstin).stateCode || "";
  const buyerName = (inv.customer.company || inv.customer.name).trim();
  checkParty(
    {
      name: buyerName,
      address: inv.customer.billingAddress,
      city: inv.customer.city,
      pincode: inv.customer.pincode,
      stateCode: buyerState,
      gstin: buyerGstin,
    },
    { who: "Buyer", recordKind: "invoice", prefix: "customer." },
    inv.id,
    issues,
  );
  // The editor names the name field "name"/"company"; point at the company when set.
  for (const i of issues)
    if (i.field === "customer.name" && inv.customer.company) i.field = "customer.company";

  if (!inv.number.trim() || !DOC_NO_RE.test(inv.number.trim()))
    addInv(
      "error",
      "EINV_DOC_NO",
      `Number "${inv.number}" can't be used: at most 16 characters, letters, digits, "/" and "-" only, and it can't start with 0 or a symbol.`,
      "number",
    );
  if (!inv.invoiceDate)
    addInv("error", "EINV_DOC_DATE", "Document date is missing.", "invoiceDate");

  if (inv.docType !== "tax_invoice" && !inv.note.originalInvoiceNumber.trim() && !d?.original)
    addInv(
      "warning",
      "EINV_REF",
      "No original invoice is linked to this note. The portal expects the preceding document reference (verify).",
      "note.originalInvoiceNumber",
    );

  const totals = computeTotals(inv);
  const items: EInvoiceItem[] = [];
  inv.lines.forEach((line, index) => {
    const lt = totals.lines[index];
    const cl = d?.lines.find((l) => l.index === index);
    const field = (f: string) => `lines.${index}.${f}`;
    const label = line.name.trim() || `Line ${index + 1}`;
    const hsn = line.hsnSac.replace(/\s/g, "");
    if (!/^\d{4}$|^\d{6}$|^\d{8}$/.test(hsn))
      addInv("error", "EINV_HSN", `"${label}": HSN/SAC must be 4, 6 or 8 digits.`, field("hsnSac"));
    const uqc = uqcFor(line);
    if (!isUqcCode(uqc))
      addInv("error", "EINV_UQC", `"${label}": set a unit the portal recognises.`, field("uqc"));
    const qty = toDec(line.quantity);
    if (!qty.greaterThan(0))
      addInv("error", "EINV_QTY", `"${label}": quantity must be above zero.`, field("quantity"));
    if (!line.name.trim())
      addInv("error", "EINV_DESC", `Line ${index + 1} has no item name.`, field("name"));

    const heads = cl ?? { taxable: toDec(lt.taxable), igst: ZERO, cgst: ZERO, sgst: ZERO };
    const discount = toDec(lt.lineDiscount).plus(toDec(lt.allocatedDiscount));
    const taxable = roundTo(heads.taxable, 2);
    const totAmt = taxable.plus(discount);
    const unitPrice = qty.greaterThan(0) ? roundTo(totAmt.div(qty), 3) : ZERO;
    const tax = heads.igst.plus(heads.cgst).plus(heads.sgst);
    items.push({
      SlNo: String(index + 1),
      PrdDesc: line.name.trim().slice(0, 300),
      IsServc: line.itemType === "services" || hsn.startsWith("99") ? "Y" : "N",
      HsnCd: hsn,
      Qty: num(qty, 3),
      Unit: uqc,
      UnitPrice: num(unitPrice, 3),
      TotAmt: num(totAmt),
      Discount: num(discount),
      AssAmt: num(taxable),
      GstRt: Number(toDec(lt.rate).toString()),
      IgstAmt: num(heads.igst),
      CgstAmt: num(heads.cgst),
      SgstAmt: num(heads.sgst),
      CesRt: 0,
      CesAmt: 0,
      TotItemVal: num(taxable.plus(tax)),
    });
  });
  if (inv.lines.length === 0) addInv("error", "EINV_NO_LINES", "No line items.", "lines");

  const sum = (key: "AssAmt" | "CgstAmt" | "SgstAmt" | "IgstAmt") =>
    items.reduce((acc, i) => acc.plus(i[key]), ZERO);
  const assVal = sum("AssAmt");
  const cgst = sum("CgstAmt");
  const sgst = sum("SgstAmt");
  const igst = sum("IgstAmt");
  const roundOff = toDec(totals.roundOff);
  const totInv = toDec(totals.grandTotal);
  const drift = assVal.plus(cgst).plus(sgst).plus(igst).plus(roundOff).minus(totInv).abs();
  if (drift.greaterThan("0.05"))
    addInv(
      "warning",
      "EINV_TOTAL_DRIFT",
      `Item values add up to ₹${fmt2(assVal.plus(cgst).plus(sgst).plus(igst).plus(roundOff))} but the document total is ₹${fmt2(totInv)}. Check rounding before uploading.`,
    );

  const pos = d?.pos || buyerState;
  const buyer = party(
    {
      name: buyerName,
      address: inv.customer.billingAddress,
      city: inv.customer.city,
      pincode: inv.customer.pincode,
      stateCode: buyerState,
    },
    buyerGstin,
    inv.customer.company && inv.customer.name ? inv.customer.name : "",
  );
  buyer.Pos = pos;
  if (!isValidStateCode(pos))
    addInv("error", "EINV_POS", "Place of supply is missing.", "placeOfSupply");

  const supTyp = inv.sez.enabled ? (inv.sez.withPayment ? "SEZWP" : "SEZWOP") : "B2B";
  const original = d?.original;
  const refNo = original?.number ?? inv.note.originalInvoiceNumber;
  const refDate = original?.invoiceDate ?? inv.note.originalInvoiceDate;
  const payload: EInvoiceDoc = {
    Version: EINVOICE_SCHEMA_VERSION,
    TranDtls: {
      TaxSch: "GST",
      SupTyp: supTyp,
      RegRev: inv.reverseCharge ? "Y" : "N",
      IgstOnIntra: "N",
    },
    DocDtls: {
      Typ: inv.docType === "credit_note" ? "CRN" : inv.docType === "debit_note" ? "DBN" : "INV",
      No: inv.number.trim(),
      Dt: irpDate(inv.invoiceDate),
    },
    SellerDtls: party(seller, seller.gstin, seller.trade),
    BuyerDtls: buyer,
    ItemList: items,
    ValDtls: {
      AssVal: num(assVal),
      CgstVal: num(cgst),
      SgstVal: num(sgst),
      IgstVal: num(igst),
      CesVal: 0,
      RndOffAmt: num(roundOff),
      TotInvVal: num(totInv),
    },
  };
  if (inv.docType !== "tax_invoice" && refNo.trim())
    payload.RefDtls = { PrecDocDtls: [{ InvNo: refNo.trim(), InvDt: irpDate(refDate) }] };

  return {
    invoiceId: inv.id,
    number: inv.number,
    payload,
    issues,
    blocked: issues.some((i) => i.severity === "error"),
  };
}

/**
 * Payloads for every e-invoice-eligible document in `invoices` (or just `ids`).
 * Ineligible documents are skipped; use ineligibleReason() to explain why.
 */
export function buildEInvoices(input: {
  invoices: Invoice[];
  settings: AppSettings;
  ids?: readonly string[];
}): EInvoiceBuild[] {
  const { invoices, settings, ids } = input;
  const want = ids ? new Set(ids) : null;
  const eligible = invoices.filter(
    (i) => (!want || want.has(i.id)) && ineligibleReason(i) === null && i.invoiceDate,
  );
  // Classify once per month (classification needs the whole book to find originals).
  const months = new Set(eligible.map((i) => monthKey(i.invoiceDate)));
  const classified = new Map<string, ClassifiedDoc>();
  for (const m of months)
    for (const d of classifyInvoices({ invoices, settings, periodKey: m }).docs)
      classified.set(d.invoice.id, d);
  return eligible.map((inv) => buildOne(inv, settings, classified.get(inv.id)));
}

/** Bulk-upload file text: a JSON array of documents (array form is unconfirmed; verify). */
export function einvoiceBulkJson(
  builds: readonly EInvoiceBuild[],
  opts: { pretty?: boolean } = {},
): string {
  const docs = builds.flatMap((b) => (b.payload ? [b.payload] : []));
  return JSON.stringify(docs, null, opts.pretty ? 2 : undefined);
}

/** File name for the export ("EINV_27AAPFU0939F1ZV_DRAFT_2026-11-05"). */
export function einvoiceFileBase(gstin: string, today: string): string {
  return `EINV_${gstin || "NOGSTIN"}_DRAFT_${today}`;
}
