import type { Gstr2bDocType, Gstr2bRow, Gstr2bSection } from "@/lib/schema";
import { toDec } from "@/lib/money";
import {
  cleanGstin,
  money2,
  parsePortalDate,
  parseReturnPeriod,
  yes,
  type ParsedGstr2b,
} from "./common";

/**
 * CSV fallback for GSTR-2B. Reads a CSV saved from the portal's Excel
 * download (one sheet at a time, e.g. "B2B" or "B2B-CDNR") or from our own
 * template. Header names are matched loosely (case, spaces and punctuation
 * ignored). The portal's Excel column titles used for the aliases are from
 * memory of the downloaded workbook — verify against your file.
 *
 * A document that spans several rate rows (same supplier, number, date) is
 * merged into ONE row: taxable value and taxes are added, the value is not.
 */

/** RFC 4180 reader: quotes, escaped quotes, CRLF/LF, BOM; comma, semicolon or tab separated. */
export function parseCsvText(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const counts: [string, number][] = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length]);
  const delim = counts.sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

const ALIASES = {
  gstin: ["gstinofsupplier", "supplier gstin", "gstin", "ctin", "suppliergstin"],
  name: ["tradelegalname", "tradename", "legalname", "suppliername", "name", "trdnm"],
  docNo: [
    "invoicenumber",
    "invoiceno",
    "invoicenum",
    "notenumber",
    "noteno",
    "documentnumber",
    "docno",
    "billno",
    "inum",
    "ntnum",
  ],
  noteType: ["notetype", "documenttype", "doctype", "invoicetype", "typ"],
  date: ["invoicedate", "notedate", "documentdate", "docdate", "billdate", "date", "dt"],
  value: ["invoicevalue", "invoicevalue", "notevalue", "documentvalue", "value", "val"],
  pos: ["placeofsupply", "pos"],
  rcm: ["supplyattractreversecharge", "reversecharge", "rcm", "rev"],
  taxable: ["taxablevalue", "taxable", "txval"],
  igst: ["integratedtax", "igst"],
  cgst: ["centraltax", "cgst"],
  sgst: ["stateuttax", "statetax", "sgst", "sgstutgst"],
  cess: ["cess"],
  itc: ["itcavailability", "itcavailable", "itcavl", "eligibleforitc"],
  reason: ["reason", "rsn", "itcreason"],
  origNo: [
    "originalinvoicenumber",
    "originalnotenumber",
    "originaldocumentnumber",
    "oinum",
    "ontnum",
  ],
} as const;
type Field = keyof typeof ALIASES;

function mapHeader(cells: string[]): Partial<Record<Field, number>> {
  const idx: Partial<Record<Field, number>> = {};
  cells.forEach((c, i) => {
    const n = norm(c);
    if (!n) return;
    for (const f of Object.keys(ALIASES) as Field[]) {
      if (idx[f] !== undefined) continue;
      if ((ALIASES[f] as readonly string[]).map(norm).includes(n)) {
        idx[f] = i;
        break;
      }
    }
  });
  return idx;
}

function docTypeOf(raw: string, headerSaysNote: boolean): Gstr2bDocType {
  const s = raw.trim().toLowerCase();
  if (/^(c|credit)/.test(s)) return "credit_note";
  if (/^(d|debit)/.test(s)) return "debit_note";
  if (headerSaysNote) return "credit_note";
  return "invoice";
}

function sectionOf(docType: Gstr2bDocType, amended: boolean): Gstr2bSection {
  if (docType === "invoice") return amended ? "b2ba" : "b2b";
  return amended ? "cdnra" : "cdnr";
}

export function parseGstr2bCsv(text: string, opts: { periodKey?: string } = {}): ParsedGstr2b {
  const out: ParsedGstr2b = {
    periodKey: parseReturnPeriod(opts.periodKey ?? ""),
    gstin: "",
    rows: [],
    warnings: [],
    sectionCounts: {},
  };
  const table = parseCsvText(text);
  let headerAt = -1;
  let idx: Partial<Record<Field, number>> = {};
  for (let i = 0; i < Math.min(table.length, 15); i++) {
    const m = mapHeader(table[i]);
    if (m.gstin !== undefined && m.docNo !== undefined) {
      headerAt = i;
      idx = m;
      break;
    }
  }
  if (headerAt < 0) {
    out.warnings.push(
      "Could not find the header row. The CSV needs at least 'GSTIN of supplier' and 'Invoice number' (or 'Note number') columns.",
    );
    return out;
  }
  const noteSheet = /note/i.test(table[headerAt].join(" ")) && idx.noteType !== undefined;
  const get = (r: string[], f: Field) => (idx[f] === undefined ? "" : (r[idx[f]!] ?? "").trim());
  if (idx.taxable === undefined) out.warnings.push("No 'Taxable value' column was found.");
  if (idx.igst === undefined && idx.cgst === undefined && idx.sgst === undefined)
    out.warnings.push("No tax columns (Integrated / Central / State tax) were found.");

  const merged = new Map<string, Gstr2bRow>();
  let skipped = 0;
  for (const r of table.slice(headerAt + 1)) {
    const docNo = get(r, "docNo");
    const gstin = cleanGstin(get(r, "gstin"));
    if (!docNo && !gstin) continue;
    // Portal sheets end with total/blank rows that have no document number.
    if (!docNo) {
      skipped++;
      continue;
    }
    const docType = docTypeOf(get(r, "noteType"), noteSheet);
    const docDate = parsePortalDate(get(r, "date"));
    const origDocNo = get(r, "origNo");
    const key = [gstin, docType, docNo.toUpperCase(), docDate].join("|");
    const add = {
      taxable: toDec(get(r, "taxable")),
      igst: toDec(get(r, "igst")),
      cgst: toDec(get(r, "cgst")),
      sgst: toDec(get(r, "sgst")),
      cess: toDec(get(r, "cess")),
    };
    const prev = merged.get(key);
    if (prev) {
      prev.taxable = money2(toDec(prev.taxable).plus(add.taxable));
      prev.igst = money2(toDec(prev.igst).plus(add.igst));
      prev.cgst = money2(toDec(prev.cgst).plus(add.cgst));
      prev.sgst = money2(toDec(prev.sgst).plus(add.sgst));
      prev.cess = money2(toDec(prev.cess).plus(add.cess));
      continue;
    }
    const itcRaw = get(r, "itc");
    const section = sectionOf(docType, origDocNo !== "");
    const value = get(r, "value");
    merged.set(key, {
      id: `r${merged.size + 1}`,
      section,
      supplierGstin: gstin,
      supplierName: get(r, "name"),
      docType,
      docNo,
      docDate,
      origDocNo,
      pos: get(r, "pos").slice(0, 2),
      taxable: money2(add.taxable),
      igst: money2(add.igst),
      cgst: money2(add.cgst),
      sgst: money2(add.sgst),
      cess: money2(add.cess),
      rcm: yes(get(r, "rcm")),
      // Blank = available. "No"/"N" = not available (verify wording in your file).
      itcAvailable: itcRaw === "" ? true : yes(itcRaw),
      itcReason: get(r, "reason"),
      imsAction: "none",
      notes: value ? `Invoice value ${money2(toDec(value))}` : "",
    });
  }
  out.rows = [...merged.values()];
  for (const row of out.rows)
    out.sectionCounts[row.section] = (out.sectionCounts[row.section] ?? 0) + 1;
  if (skipped) out.warnings.push(`${skipped} row(s) without a document number were skipped.`);
  const bad = out.rows.filter((r) => !r.docDate).length;
  if (bad) out.warnings.push(`${bad} row(s) have no readable date.`);
  if (!out.rows.length) out.warnings.push("No documents were found in the CSV.");
  return out;
}
