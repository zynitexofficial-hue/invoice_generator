import { normalizeGstin } from "@/lib/gst/gstin";
import type { Invoice } from "@/lib/schema";

/**
 * Read an IRP response file (JSON) saved by the user and pull IRN / ack
 * details out of it. Local only; nothing is sent anywhere.
 *
 * The response layout of the portal's bulk tool is NOT confirmed (verify
 * against a real response file). To be forgiving this accepts:
 *   - a single object or an array of objects, optionally wrapped in
 *     { data | Data | result | Result | InvoiceList | response }
 *   - keys Irn / IRN, AckNo, AckDt, SignedQRCode, SignedInvoice, Status
 *   - the document number from DocNo / InvNo / DocumentNumber, from
 *     DocDtls.No, or from the payload inside a SignedInvoice token (a
 *     base64url JWT whose payload carries `data` = the invoice JSON).
 * Rows without an IRN are reported as problems, never guessed.
 */

export interface IrpEntry {
  docNo: string;
  docDate: string; // ISO date when known
  sellerGstin: string;
  irn: string;
  ackNo: string;
  /** As written in the file, e.g. "2026-10-05 14:32:10". */
  ackDate: string;
  signedQr: string;
  status: string;
}

export interface ParsedResponse {
  entries: IrpEntry[];
  /** Plain-language problems (unreadable file, rows without an IRN…). */
  problems: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
const pick = (o: Obj, ...keys: string[]): string => {
  for (const k of keys) {
    const v = str(o[k]);
    if (v) return v;
  }
  return "";
};

/** Decode the payload of a JWT without verifying it (display/matching only). */
export function decodeJwtPayload(token: string): Obj | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return isObj(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function fromDdMmYyyy(s: string): string {
  const m = /^(\d{2})[/-](\d{2})[/-](\d{4})$/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

function entryFrom(o: Obj): IrpEntry | null {
  const irn = pick(o, "Irn", "IRN", "irn");
  if (!irn) return null;
  const signedInvoice = pick(o, "SignedInvoice", "signedInvoice");
  let docNo = pick(o, "DocNo", "InvNo", "DocumentNumber", "docNo");
  let docDate = fromDdMmYyyy(pick(o, "DocDt", "DocDate", "InvDt"));
  let seller = normalizeGstin(pick(o, "SellerGstin", "Gstin"));
  const docDtls = isObj(o.DocDtls) ? o.DocDtls : null;
  if (docDtls) {
    docNo ||= pick(docDtls, "No");
    docDate ||= fromDdMmYyyy(pick(docDtls, "Dt"));
  }
  if (!docNo && signedInvoice) {
    const payload = decodeJwtPayload(signedInvoice);
    let data: unknown = payload?.data;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        data = null;
      }
    }
    if (isObj(data)) {
      if (isObj(data.DocDtls)) {
        docNo = pick(data.DocDtls, "No");
        docDate ||= fromDdMmYyyy(pick(data.DocDtls, "Dt"));
      }
      if (isObj(data.SellerDtls)) seller ||= normalizeGstin(pick(data.SellerDtls, "Gstin"));
    }
  }
  return {
    docNo,
    docDate,
    sellerGstin: seller,
    irn,
    ackNo: pick(o, "AckNo", "ackNo"),
    ackDate: pick(o, "AckDt", "AckDate", "ackDt"),
    signedQr: pick(o, "SignedQRCode", "SignedQrCode", "signedQRCode"),
    status: pick(o, "Status", "status"),
  };
}

function collect(node: unknown, out: Obj[], depth = 0): void {
  if (depth > 4) return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, out, depth + 1);
    return;
  }
  if (!isObj(node)) return;
  if (pick(node, "Irn", "IRN", "irn")) {
    out.push(node);
    return;
  }
  for (const key of [
    "data",
    "Data",
    "result",
    "Result",
    "InvoiceList",
    "response",
    "Response",
    "invoices",
  ])
    if (key in node) collect(node[key], out, depth + 1);
}

export function parseIrpResponse(text: string): ParsedResponse {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { entries: [], problems: ["This file is not valid JSON."] };
  }
  const objs: Obj[] = [];
  collect(json, objs);
  const entries: IrpEntry[] = [];
  const problems: string[] = [];
  for (const o of objs) {
    const e = entryFrom(o);
    if (e) entries.push(e);
  }
  if (objs.length === 0)
    problems.push("No IRN was found in this file. Is it the response file from the portal?");
  const unnamed = entries.filter((e) => !e.docNo).length;
  if (unnamed)
    problems.push(
      `${unnamed} row(s) carry an IRN but no document number, so they can't be matched automatically. Enter those by hand.`,
    );
  return { entries, problems };
}

export interface ResponseMatch {
  entry: IrpEntry;
  invoice: Invoice | null;
  reason: "matched" | "no_document" | "ambiguous" | "no_number" | "already_has_irn";
}

/** Match response rows to invoices by document number (and date when both are known). */
export function matchResponse(entries: readonly IrpEntry[], invoices: readonly Invoice[]) {
  const out: ResponseMatch[] = [];
  for (const entry of entries) {
    if (!entry.docNo) {
      out.push({ entry, invoice: null, reason: "no_number" });
      continue;
    }
    const key = entry.docNo.toUpperCase();
    let cands = invoices.filter((i) => i.number.trim().toUpperCase() === key);
    if (cands.length > 1 && entry.docDate)
      cands = cands.filter((i) => i.invoiceDate === entry.docDate);
    if (cands.length === 0) out.push({ entry, invoice: null, reason: "no_document" });
    else if (cands.length > 1) out.push({ entry, invoice: null, reason: "ambiguous" });
    else {
      const inv = cands[0];
      const has = inv.eInvoice.irn && inv.eInvoice.irn !== entry.irn;
      out.push({ entry, invoice: inv, reason: has ? "already_has_irn" : "matched" });
    }
  }
  return out;
}
