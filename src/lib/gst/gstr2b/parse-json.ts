import type { Gstr2bDocType, Gstr2bRow, Gstr2bSection } from "@/lib/schema";
import { Dec, ZERO, toDec } from "@/lib/money";
import {
  amountText,
  cleanGstin,
  money2,
  parsePortalDate,
  parseReturnPeriod,
  yes,
  type ParsedGstr2b,
} from "./common";

/**
 * GSTR-2B JSON reader.
 *
 * SCHEMA STATUS: the official GSTN JSON schema could not be fetched while
 * building this (network restricted), so the field names below come from the
 * commonly published structure of the file downloaded from the GST portal and
 * are all marked `verify`. The reader is deliberately tolerant: it accepts
 * several wrappers, skips what it cannot read and reports warnings instead of
 * throwing.
 *
 * Structure assumed (verify):
 *   { data: { gstin, rtnprd: "MMYYYY", data: { docdata: {
 *       b2b:  [{ ctin, trdnm, inv: [{ inum, typ, dt, val, pos, rev, itcavl, rsn,
 *                 txval, igst, cgst, sgst, cess, items?: [{ txval, igst, cgst, sgst, cess }] }] }],
 *       b2ba: like b2b, with `oinum`/`oidt` (original invoice) on each invoice,
 *       cdnr: [{ ctin, trdnm, nt: [{ ntnum, typ: "C"|"D", dt, val, pos, rev, itcavl, rsn, txval, igst, cgst, sgst, cess }] }],
 *       cdnra: like cdnr, with `ontnum`/`ontdt`,
 *       isd:  [{ ctin, trdnm, docnum, docdt, isd_docty, itcelg, igst, cgst, sgst, cess }],
 *       impg: [{ refdt, portcode, boenum, boedt, txval, igst, cess, isamd }] } } } }
 * Other wrappers accepted: { data: { docdata } }, { docdata }, { data } or the
 * sections at the top level. Amounts may sit on the document or on `items`/`itms`.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter(isObj) : []);
const str = (v: unknown): string =>
  typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";

const SECTION_KEYS = ["b2b", "b2ba", "cdnr", "cdnra", "isd", "impg"];

function findDocdata(root: unknown): Obj | undefined {
  let level: unknown[] = [root];
  for (let depth = 0; depth < 4 && level.length; depth++) {
    const next: unknown[] = [];
    for (const node of level) {
      if (!isObj(node)) continue;
      if (isObj(node.docdata)) return node.docdata;
      if (SECTION_KEYS.some((k) => Array.isArray(node[k]))) return node;
      next.push(node.data);
    }
    level = next;
  }
  return undefined;
}

function findMeta(root: unknown): { gstin: string; rtnprd: string } {
  let node: unknown = root;
  for (let i = 0; i < 4 && isObj(node); i++) {
    if (node.gstin || node.rtnprd)
      return { gstin: cleanGstin(node.gstin), rtnprd: str(node.rtnprd) };
    node = node.data;
  }
  return { gstin: "", rtnprd: "" };
}

interface Amounts {
  taxable: Dec;
  igst: Dec;
  cgst: Dec;
  sgst: Dec;
  cess: Dec;
}

/** Document-level amounts, or the sum of `items`/`itms` when the document has none. */
function amountsOf(doc: Obj): Amounts {
  const direct = ["txval", "igst", "cgst", "sgst", "cess"].some((k) => doc[k] !== undefined);
  const lines = arr(doc.items).length ? arr(doc.items) : arr(doc.itms);
  const src = direct || !lines.length ? [doc] : lines;
  const acc: Amounts = { taxable: ZERO, igst: ZERO, cgst: ZERO, sgst: ZERO, cess: ZERO };
  for (const l of src) {
    const det = isObj(l.itm_det) ? l.itm_det : l;
    acc.taxable = acc.taxable.plus(toDec(det.txval as string));
    acc.igst = acc.igst.plus(toDec(det.igst as string));
    acc.cgst = acc.cgst.plus(toDec(det.cgst as string));
    acc.sgst = acc.sgst.plus(toDec(det.sgst as string));
    acc.cess = acc.cess.plus(toDec(det.cess as string));
  }
  return acc;
}

export function parseGstr2bJson(text: string): ParsedGstr2b {
  const out: ParsedGstr2b = { periodKey: "", gstin: "", rows: [], warnings: [], sectionCounts: {} };
  let root: unknown;
  try {
    root = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    out.warnings.push(
      "This file is not valid JSON. Download the GSTR-2B JSON again from the GST portal.",
    );
    return out;
  }
  const meta = findMeta(root);
  out.gstin = meta.gstin;
  out.periodKey = parseReturnPeriod(meta.rtnprd);
  const docdata = findDocdata(root);
  if (!docdata) {
    out.warnings.push(
      "No GSTR-2B sections (b2b, cdnr, isd, impg…) were found. Check that this is the GSTR-2B JSON file.",
    );
    return out;
  }
  if (!out.periodKey)
    out.warnings.push("The return period was not found in the file; pick it manually.");

  let n = 0;
  const push = (
    section: Gstr2bSection,
    r: Omit<Gstr2bRow, "id" | "section" | "notes" | "imsAction"> & { notes?: string },
  ) => {
    n += 1;
    out.rows.push({ id: `r${n}`, section, imsAction: "none", notes: "", ...r });
    out.sectionCounts[section] = (out.sectionCounts[section] ?? 0) + 1;
  };

  const common = (sup: Obj, d: Obj, a: Amounts) => ({
    supplierGstin: cleanGstin(sup.ctin),
    supplierName: str(sup.trdnm),
    pos: str(d.pos).slice(0, 2),
    taxable: money2(a.taxable),
    igst: money2(a.igst),
    cgst: money2(a.cgst),
    sgst: money2(a.sgst),
    cess: money2(a.cess),
    rcm: yes(d.rev),
    // `itcavl` "Y"/"N" (verify). When absent we assume available.
    itcAvailable: d.itcavl === undefined ? true : yes(d.itcavl),
    itcReason: str(d.rsn),
  });

  for (const section of ["b2b", "b2ba"] as const) {
    for (const sup of arr(docdata[section]))
      for (const inv of arr(sup.inv)) {
        const a = amountsOf(inv);
        push(section, {
          ...common(sup, inv, a),
          docType: "invoice",
          docNo: str(inv.inum),
          docDate: parsePortalDate(inv.dt),
          origDocNo: section === "b2ba" ? str(inv.oinum) : "",
          notes: inv.val !== undefined ? `Invoice value ${amountText(inv.val)}` : "",
        });
      }
  }
  for (const section of ["cdnr", "cdnra"] as const) {
    for (const sup of arr(docdata[section]))
      for (const nt of arr(sup.nt)) {
        const a = amountsOf(nt);
        const docType: Gstr2bDocType = /^d/i.test(str(nt.typ)) ? "debit_note" : "credit_note";
        push(section, {
          ...common(sup, nt, a),
          docType,
          docNo: str(nt.ntnum),
          docDate: parsePortalDate(nt.dt),
          origDocNo: section === "cdnra" ? str(nt.ontnum) : "",
        });
      }
  }
  for (const d of arr(docdata.isd)) {
    const a = amountsOf(d);
    const docty = str(d.isd_docty);
    push("isd", {
      ...common(d, {}, a),
      docType: /credit|cn/i.test(docty) ? "credit_note" : "other",
      docNo: str(d.docnum),
      docDate: parsePortalDate(d.docdt),
      origDocNo: str(d.oinvnum),
      itcAvailable: d.itcelg === undefined ? true : yes(d.itcelg),
      notes: "Input Service Distributor credit",
    });
  }
  for (const d of arr(docdata.impg)) {
    const a = amountsOf(d);
    push("impg", {
      ...common({ ctin: "" }, {}, a),
      supplierName: str(d.portcode) ? `Port ${str(d.portcode)}` : "Import of goods",
      docType: "other",
      docNo: str(d.boenum),
      docDate: parsePortalDate(d.boedt),
      origDocNo: "",
      notes: "Import of goods (bill of entry)",
    });
  }

  for (const k of SECTION_KEYS)
    if (docdata[k] !== undefined && !Array.isArray(docdata[k]))
      out.warnings.push(`Section ${k} was not in the expected list form and was skipped.`);
  const bad = out.rows.filter((r) => !r.docDate).length;
  if (bad) out.warnings.push(`${bad} row(s) have no readable date.`);
  const noNo = out.rows.filter((r) => !r.docNo).length;
  if (noNo) out.warnings.push(`${noNo} row(s) have no document number.`);
  if (!out.rows.length) out.warnings.push("The file has no GSTR-2B documents.");
  return out;
}
