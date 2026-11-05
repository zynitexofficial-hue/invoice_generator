import type { CsvCell } from "@/lib/csv";
import { OTHER_COUNTRY_CODE, stateName } from "@/lib/gst/states";
import { monthsInPeriod } from "@/lib/period";
import { toNum2 } from "./internal";
import { DOC_NATURE_LABELS } from "./docs";
import { uqcLabel } from "./uqc";
import type {
  B2bInvoiceType,
  CdnurNote,
  Gstr1Result,
  HsnRow,
  NilSupplyType,
  RateItem,
} from "./types";

/**
 * Adapter: Gstr1Result → GST portal offline-utility JSON and CSV.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ALL portal key names live in this file. The offline-utility schema   │
 * │ is not a stable public API: VERIFY THIS MAPPING AGAINST THE CURRENT  │
 * │ OFFLINE UTILITY (and bump FORMAT_VERSION) BEFORE EVERY RELEASE.      │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Key mapping (portal key ← engine field):
 *   root     gstin ← result.gstin, fp ← "MMYYYY" (last month of the period),
 *            version ← FORMAT_VERSION, hash ← "hash"
 *   b2b      [{ ctin, inv: [{ inum ← number, idt ← dd-mm-yyyy, val ← value, pos,
 *            rchrg ← "Y"/"N", inv_typ ← "R"/"SEWP"/"SEWOP",
 *            itms: [{ num, itm_det: { txval, rt, iamt|camt+samt, csamt } }] }] }]
 *   b2cl     [{ pos, inv: [{ inum, idt, val, itms }] }]
 *   b2cs     [{ sply_ty ← "INTRA"/"INTER", pos, typ ← "OE", txval, rt, iamt|camt+samt, csamt }]
 *   exp      [{ exp_typ ← "WPAY"/"WOPAY", inv: [{ inum, idt, val, sbpcode, sbnum, sbdt,
 *            itms: [{ txval, rt, iamt, csamt }] }] }]
 *   cdnr     [{ ctin, nt: [{ ntty ← "C"/"D", nt_num, nt_dt, val, pos, rchrg, inv_typ, itms }] }]
 *   cdnur    [{ typ ← "B2CL"/"EXPWP"/"EXPWOP", ntty, nt_num, nt_dt, val, pos (B2CL only), itms }]
 *   nil      { inv: [{ sply_ty ← INTRB2B/INTRAB2B/INTRB2C/INTRAB2C, nil_amt, expt_amt, ngsup_amt }] }
 *   hsn      { hsn_b2b: [...], hsn_b2c: [...] } each
 *            { num, hsn_sc, desc, uqc, qty, rt, txval, iamt, camt, samt, csamt }
 *   doc_issue { doc_det: [{ doc_num ← 1/4/5, docs: [{ num, from, to, totnum, cancel, net_issue }] }] }
 *
 * Numbers are JSON numbers rounded to 2 dp. Empty sections are omitted.
 */
export const FORMAT_VERSION = "GST3.2.4";

/** "2026-10-05" → "05-10-2026". */
export function portalDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-05" → "05-Oct-2026" (offline utility CSV date format). */
export function csvDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/** "27-Maharashtra" (offline utility CSV place of supply). */
export function csvPos(code: string): string {
  if (!code) return "";
  if (code === OTHER_COUNTRY_CODE) return "96-Other Countries";
  return `${code}-${stateName(code) || code}`;
}

/** Return period "MMYYYY"; for a quarter the last month. */
export function returnPeriod(periodKey: string): string {
  const months = monthsInPeriod(periodKey);
  const last = months[months.length - 1];
  return `${last.slice(5, 7)}${last.slice(0, 4)}`;
}

const yn = (b: boolean) => (b ? "Y" : "N");
const n2 = toNum2;

function itmDet(item: RateItem, interState: boolean) {
  return interState
    ? { txval: n2(item.taxable), rt: Number(item.rate), iamt: n2(item.igst), csamt: n2(item.cess) }
    : {
        txval: n2(item.taxable),
        rt: Number(item.rate),
        camt: n2(item.cgst),
        samt: n2(item.sgst),
        csamt: n2(item.cess),
      };
}

const itms = (items: RateItem[], interState: boolean) =>
  items.map((item, i) => ({ num: i + 1, itm_det: itmDet(item, interState) }));

function groupBy<T, K extends string>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const r of rows) map.set(key(r), [...(map.get(key(r)) ?? []), r]);
  return map;
}

function hsnJson(rows: HsnRow[]) {
  return rows.map((r, i) => ({
    num: i + 1,
    hsn_sc: r.hsn,
    desc: r.description.slice(0, 30),
    uqc: r.uqc,
    qty: n2(r.qty),
    rt: Number(r.rate),
    txval: n2(r.taxable),
    iamt: n2(r.igst),
    camt: n2(r.cgst),
    samt: n2(r.sgst),
    csamt: n2(r.cess),
  }));
}

/** The portal/offline-utility JSON object (see the mapping above). */
export function gstr1Json(result: Gstr1Result): Record<string, unknown> {
  const s = result.sections;
  const out: Record<string, unknown> = {
    gstin: result.gstin,
    fp: returnPeriod(result.periodKey),
    version: FORMAT_VERSION,
    hash: "hash",
  };

  if (s.b2b.length)
    out.b2b = [...groupBy(s.b2b, (r) => r.ctin)].map(([ctin, invs]) => ({
      ctin,
      inv: invs.map((r) => ({
        inum: r.number,
        idt: portalDate(r.date),
        val: n2(r.value),
        pos: r.pos,
        rchrg: yn(r.reverseCharge),
        inv_typ: r.invType,
        itms: itms(r.items, r.interState),
      })),
    }));

  if (s.b2cl.length)
    out.b2cl = [...groupBy(s.b2cl, (r) => r.pos)].map(([pos, invs]) => ({
      pos,
      inv: invs.map((r) => ({
        inum: r.number,
        idt: portalDate(r.date),
        val: n2(r.value),
        itms: itms(r.items, true),
      })),
    }));

  if (s.b2cs.length)
    out.b2cs = s.b2cs.map((r) => {
      const inter = r.supplyType === "INTER";
      return {
        sply_ty: r.supplyType,
        pos: r.pos,
        typ: "OE",
        txval: n2(r.taxable),
        rt: Number(r.rate),
        ...(inter ? { iamt: n2(r.igst) } : { camt: n2(r.cgst), samt: n2(r.sgst) }),
        csamt: n2(r.cess),
      };
    });

  if (s.exp.length)
    out.exp = [...groupBy(s.exp, (r) => r.exportType)].map(([exp_typ, invs]) => ({
      exp_typ,
      inv: invs.map((r) => ({
        inum: r.number,
        idt: portalDate(r.date),
        val: n2(r.value),
        ...(r.portCode ? { sbpcode: r.portCode } : {}),
        ...(r.shippingBillNo ? { sbnum: r.shippingBillNo } : {}),
        ...(r.shippingBillDate ? { sbdt: portalDate(r.shippingBillDate) } : {}),
        itms: r.items.map((it) => ({
          txval: n2(it.taxable),
          rt: Number(it.rate),
          iamt: n2(it.igst),
          csamt: n2(it.cess),
        })),
      })),
    }));

  if (s.cdnr.length)
    out.cdnr = [...groupBy(s.cdnr, (r) => r.ctin)].map(([ctin, notes]) => ({
      ctin,
      nt: notes.map((r) => ({
        ntty: r.noteType,
        nt_num: r.number,
        nt_dt: portalDate(r.date),
        val: n2(r.value),
        pos: r.pos,
        rchrg: yn(r.reverseCharge),
        inv_typ: r.invType satisfies B2bInvoiceType,
        itms: itms(r.items, r.interState),
      })),
    }));

  if (s.cdnur.length)
    out.cdnur = s.cdnur.map((r: CdnurNote) => ({
      typ: r.urType,
      ntty: r.noteType,
      nt_num: r.number,
      nt_dt: portalDate(r.date),
      val: n2(r.value),
      ...(r.urType === "B2CL" ? { pos: r.pos } : {}),
      itms: itms(r.items, true),
    }));

  if (s.nil.length)
    out.nil = {
      inv: s.nil.map((r) => ({
        sply_ty: r.supplyType,
        nil_amt: n2(r.nil),
        expt_amt: n2(r.exempt),
        ngsup_amt: n2(r.nonGst),
      })),
    };

  if (s.hsnB2b.length || s.hsnB2c.length)
    out.hsn = {
      ...(s.hsnB2b.length ? { hsn_b2b: hsnJson(s.hsnB2b) } : {}),
      ...(s.hsnB2c.length ? { hsn_b2c: hsnJson(s.hsnB2c) } : {}),
    };

  if (s.docs.length)
    out.doc_issue = {
      doc_det: [...groupBy(s.docs, (d) => String(d.nature))].map(([nature, series]) => ({
        doc_num: Number(nature),
        docs: series.map((d, i) => ({
          num: i + 1,
          from: d.from,
          to: d.to,
          totnum: d.total,
          cancel: d.cancelled,
          net_issue: d.net,
        })),
      })),
    };

  return out;
}

export const DRAFT_NOTE =
  "Draft prepared from your records — verify on the GST portal before filing.";

export interface Gstr1FileMeta {
  /** ISO timestamp of generation. */
  generatedAt: string;
  appVersion?: string;
  /**
   * Add a top-level "_meta" block (generator, time, draft note). Off by
   * default because the offline utility may reject unknown keys.
   */
  withMeta?: boolean;
  pretty?: boolean;
}

/** The JSON file contents as a string. */
export function gstr1JsonFile(result: Gstr1Result, meta: Gstr1FileMeta): string {
  const json = gstr1Json(result);
  if (meta.withMeta)
    json._meta = {
      generator: "invoice-generator",
      appVersion: meta.appVersion ?? "",
      generatedAt: meta.generatedAt,
      formatVersion: FORMAT_VERSION,
      note: DRAFT_NOTE,
    };
  return JSON.stringify(json, null, meta.pretty ? 2 : undefined);
}

/** "GSTR1_27ABCDE1234F1Z5_102026" (no extension). */
export function gstr1FileBase(result: Gstr1Result): string {
  return `GSTR1_${result.gstin || "NOGSTIN"}_${returnPeriod(result.periodKey)}`;
}

/* ------------------------------------------------------------------ */
/* CSV (mirrors the offline utility import templates; verify)          */
/* ------------------------------------------------------------------ */

export interface CsvFile {
  section: string;
  filename: string;
  headers: string[];
  rows: CsvCell[][];
}

const INV_TYPE_LABEL: Record<B2bInvoiceType, string> = {
  R: "Regular B2B",
  SEWP: "SEZ supplies with payment",
  SEWOP: "SEZ supplies without payment",
};

const NIL_LABEL: Record<NilSupplyType, string> = {
  INTRB2B: "Inter-State supplies to registered persons",
  INTRAB2B: "Intra-State supplies to registered persons",
  INTRB2C: "Inter-State supplies to unregistered persons",
  INTRAB2C: "Intra-State supplies to unregistered persons",
};

const HSN_HEADERS = [
  "HSN",
  "Description",
  "UQC",
  "Total Quantity",
  "Total Value",
  "Rate",
  "Taxable Value",
  "Integrated Tax Amount",
  "Central Tax Amount",
  "State/UT Tax Amount",
  "Cess Amount",
];

const hsnRows = (rows: HsnRow[]): CsvCell[][] =>
  rows.map((r) => [
    r.hsn,
    r.description,
    uqcLabel(r.uqc),
    r.qty,
    r.totalValue,
    r.rate,
    r.taxable,
    r.igst,
    r.cgst,
    r.sgst,
    r.cess,
  ]);

/**
 * One CSV per non-empty section (plus a summary), with the offline-utility
 * column headers. Each rate row of a document is one CSV row.
 */
export function gstr1Csv(result: Gstr1Result): CsvFile[] {
  const s = result.sections;
  const base = gstr1FileBase(result);
  const files: CsvFile[] = [];
  const add = (section: string, headers: string[], rows: CsvCell[][]) => {
    if (rows.length) files.push({ section, filename: `${base}_${section}.csv`, headers, rows });
  };

  add(
    "summary",
    ["Section", "Count", "Taxable Value", "Integrated Tax", "Central Tax", "State/UT Tax", "Cess"],
    [
      ...Object.entries(result.totals).map(([k, t]): CsvCell[] => [
        k,
        t.count,
        t.taxable,
        t.igst,
        t.cgst,
        t.sgst,
        t.cess,
      ]),
      [
        "total (supply sections)",
        result.grandTotals.count,
        result.grandTotals.taxable,
        result.grandTotals.igst,
        result.grandTotals.cgst,
        result.grandTotals.sgst,
        result.grandTotals.cess,
      ],
      [DRAFT_NOTE, "", "", "", "", "", ""],
    ],
  );

  add(
    "b2b",
    [
      "GSTIN/UIN of Recipient",
      "Receiver Name",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Reverse Charge",
      "Applicable % of Tax Rate",
      "Invoice Type",
      "E-Commerce GSTIN",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ],
    s.b2b.flatMap((r) =>
      r.items.map((it): CsvCell[] => [
        r.ctin,
        r.receiverName,
        r.number,
        csvDate(r.date),
        r.value,
        csvPos(r.pos),
        yn(r.reverseCharge),
        "",
        INV_TYPE_LABEL[r.invType],
        "",
        it.rate,
        it.taxable,
        it.cess,
      ]),
    ),
  );

  add(
    "b2cl",
    [
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Place Of Supply",
      "Applicable % of Tax Rate",
      "Rate",
      "Taxable Value",
      "Cess Amount",
      "E-Commerce GSTIN",
    ],
    s.b2cl.flatMap((r) =>
      r.items.map((it): CsvCell[] => [
        r.number,
        csvDate(r.date),
        r.value,
        csvPos(r.pos),
        "",
        it.rate,
        it.taxable,
        it.cess,
        "",
      ]),
    ),
  );

  add(
    "b2cs",
    [
      "Type",
      "Place Of Supply",
      "Applicable % of Tax Rate",
      "Rate",
      "Taxable Value",
      "Cess Amount",
      "E-Commerce GSTIN",
    ],
    s.b2cs.map((r): CsvCell[] => ["OE", csvPos(r.pos), "", r.rate, r.taxable, r.cess, ""]),
  );

  add(
    "exp",
    [
      "Export Type",
      "Invoice Number",
      "Invoice date",
      "Invoice Value",
      "Port Code",
      "Shipping Bill Number",
      "Shipping Bill Date",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ],
    s.exp.flatMap((r) =>
      r.items.map((it): CsvCell[] => [
        r.exportType,
        r.number,
        csvDate(r.date),
        r.value,
        r.portCode,
        r.shippingBillNo,
        csvDate(r.shippingBillDate),
        it.rate,
        it.taxable,
        it.cess,
      ]),
    ),
  );

  add(
    "cdnr",
    [
      "GSTIN/UIN of Recipient",
      "Receiver Name",
      "Note Number",
      "Note Date",
      "Note Type",
      "Place Of Supply",
      "Reverse Charge",
      "Note Supply Type",
      "Note Value",
      "Applicable % of Tax Rate",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ],
    s.cdnr.flatMap((r) =>
      r.items.map((it): CsvCell[] => [
        r.ctin,
        r.receiverName,
        r.number,
        csvDate(r.date),
        r.noteType,
        csvPos(r.pos),
        yn(r.reverseCharge),
        INV_TYPE_LABEL[r.invType],
        r.value,
        "",
        it.rate,
        it.taxable,
        it.cess,
      ]),
    ),
  );

  add(
    "cdnur",
    [
      "UR Type",
      "Note Number",
      "Note Date",
      "Note Type",
      "Place Of Supply",
      "Note Value",
      "Applicable % of Tax Rate",
      "Rate",
      "Taxable Value",
      "Cess Amount",
    ],
    s.cdnur.flatMap((r) =>
      r.items.map((it): CsvCell[] => [
        r.urType,
        r.number,
        csvDate(r.date),
        r.noteType,
        r.urType === "B2CL" ? csvPos(r.pos) : "",
        r.value,
        "",
        it.rate,
        it.taxable,
        it.cess,
      ]),
    ),
  );

  add(
    "exemp",
    [
      "Description",
      "Nil Rated Supplies",
      "Exempted(other than nil rated/non GST supply)",
      "Non-GST Supplies",
    ],
    s.nil.map((r): CsvCell[] => [NIL_LABEL[r.supplyType], r.nil, r.exempt, r.nonGst]),
  );

  add("hsn_b2b", HSN_HEADERS, hsnRows(s.hsnB2b));
  add("hsn_b2c", HSN_HEADERS, hsnRows(s.hsnB2c));

  add(
    "docs",
    ["Nature of Document", "Sr. No. From", "Sr. No. To", "Total Number", "Cancelled"],
    s.docs.map((d): CsvCell[] => [DOC_NATURE_LABELS[d.nature], d.from, d.to, d.total, d.cancelled]),
  );

  return files;
}
