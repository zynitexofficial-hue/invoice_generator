import { normalizeGstin } from "@/lib/gst/gstin";
import { stateName } from "@/lib/gst/states";
import { invoiceReturnHash } from "@/lib/return-hash";
import type { AppSettings, Invoice } from "@/lib/schema";
import { classifyInvoices, type ClassifiedDoc, type InrLine } from "./classify";
import { buildDocSeries } from "./docs";
import { buildHsnSummary } from "./hsn";
import {
  addHeads,
  compareRate,
  fmt2,
  headsFromValues,
  headsToValues,
  isZeroHeads,
  sumItems,
  totalsOf,
  zeroHeads,
  type DecHeads,
} from "./internal";
import { Dec, ZERO } from "@/lib/money";
import {
  SUPPLY_SECTION_KEYS,
  type B2bInvoice,
  type B2clInvoice,
  type B2csRow,
  type CdnrNote,
  type CdnurNote,
  type ExpInvoice,
  type Gstr1Result,
  type Gstr1SectionKey,
  type Gstr1Sections,
  type NilRow,
  type NilSupplyType,
  type RateItem,
  type ReturnIssue,
  type SectionTotals,
} from "./types";
import { ISSUE_CODES, hasErrors, validateSettings } from "./validate";

/**
 * GSTR-1 builder (spec F3). A DRAFT prepared from your records — verify on
 * the GST portal before filing.
 */

export interface BuildGstr1Input {
  /** All invoices; the period filter, drafts etc. are applied here. */
  invoices: Invoice[];
  settings: AppSettings;
  /** Month ("2026-10") for monthly filers, quarter ("2026-Q3") for QRMP. */
  periodKey: string;
}

/** Line values aggregated by rate, rows that are entirely zero dropped. */
export function rateItems(lines: InrLine[]): RateItem[] {
  const byRate = new Map<string, DecHeads>();
  for (const l of lines) byRate.set(l.rate, addHeads(byRate.get(l.rate) ?? zeroHeads(), l));
  return [...byRate.entries()]
    .filter(([, h]) => !isZeroHeads(h))
    .sort(([a], [b]) => compareRate(a, b))
    .map(([rate, h]) => ({ rate, ...headsToValues(h) }));
}

function docBase(d: ClassifiedDoc) {
  return {
    invoiceId: d.invoice.id,
    number: d.invoice.number.trim(),
    date: d.invoice.invoiceDate,
    value: fmt2(d.value),
    pos: d.pos,
    interState: d.interState,
    items: rateItems(d.lines),
  };
}

function nilSupplyType(d: ClassifiedDoc): NilSupplyType {
  return `${d.interState ? "INTR" : "INTRA"}${d.registered ? "B2B" : "B2C"}` as NilSupplyType;
}

const NIL_ORDER: NilSupplyType[] = ["INTRB2B", "INTRAB2B", "INTRB2C", "INTRAB2C"];

function docTotals(rows: { items: RateItem[] }[], signs?: (1 | -1)[]): SectionTotals {
  let sum = zeroHeads();
  rows.forEach((r, i) => (sum = addHeads(sum, sumItems(r.items), signs?.[i] ?? 1)));
  return { count: rows.length, ...headsToValues(sum) };
}

export function buildGstr1({ invoices, settings, periodKey }: BuildGstr1Input): Gstr1Result {
  const cls = classifyInvoices({ invoices, settings, periodKey });
  const issues: ReturnIssue[] = [...validateSettings(settings), ...cls.issues];

  const b2b: B2bInvoice[] = [];
  const b2cl: B2clInvoice[] = [];
  const exp: ExpInvoice[] = [];
  const cdnr: CdnrNote[] = [];
  const cdnur: CdnurNote[] = [];
  const cdnrSigns: (1 | -1)[] = [];
  const cdnurSigns: (1 | -1)[] = [];
  const b2csMap = new Map<
    string,
    { supplyType: "INTRA" | "INTER"; pos: string; rate: string; h: DecHeads }
  >();
  const nilMap = new Map<NilSupplyType, { nil: Dec; exempt: Dec; nonGst: Dec }>();

  for (const d of cls.docs) {
    const inv = d.invoice;
    switch (d.placement) {
      case "b2b":
        b2b.push({
          ...docBase(d),
          ctin: d.ctin,
          receiverName: d.receiverName,
          reverseCharge: inv.reverseCharge,
          invType: d.invType,
        });
        break;
      case "b2cl":
        b2cl.push(docBase(d));
        break;
      case "exp":
        exp.push({
          ...docBase(d),
          exportType: d.exportType ?? "WOPAY",
          portCode: inv.exportDetails.portCode.trim(),
          shippingBillNo: inv.exportDetails.shippingBillNo.trim(),
          shippingBillDate: inv.exportDetails.shippingBillDate,
        });
        break;
      case "cdnr":
        cdnr.push({
          ...docBase(d),
          ctin: d.ctin,
          receiverName: d.receiverName,
          noteType: d.noteType ?? "C",
          reverseCharge: inv.reverseCharge,
          invType: d.invType,
          originalInvoiceId: d.original?.id ?? inv.note.originalInvoiceId,
          originalInvoiceNumber: d.original?.number ?? inv.note.originalInvoiceNumber,
        });
        cdnrSigns.push(d.sign);
        break;
      case "cdnur":
        cdnur.push({
          ...docBase(d),
          noteType: d.noteType ?? "C",
          urType: d.urType ?? "B2CL",
          originalInvoiceId: d.original?.id ?? inv.note.originalInvoiceId,
          originalInvoiceNumber: d.original?.number ?? inv.note.originalInvoiceNumber,
        });
        cdnurSigns.push(d.sign);
        break;
      case "b2cs": {
        const supplyType = d.interState ? "INTER" : "INTRA";
        for (const l of d.lines) {
          const key = `${supplyType}|${d.pos}|${l.rate}`;
          const row = b2csMap.get(key) ?? { supplyType, pos: d.pos, rate: l.rate, h: zeroHeads() };
          row.h = addHeads(row.h, l, d.sign);
          b2csMap.set(key, row);
        }
        break;
      }
      case "nil": {
        const type = nilSupplyType(d);
        const row = nilMap.get(type) ?? { nil: ZERO, exempt: ZERO, nonGst: ZERO };
        const taxable = d.lines.reduce((acc, l) => acc.plus(l.taxable), ZERO).mul(d.sign);
        if (d.nilKind === "nil") row.nil = row.nil.plus(taxable);
        else if (d.nilKind === "non_gst") row.nonGst = row.nonGst.plus(taxable);
        else row.exempt = row.exempt.plus(taxable);
        nilMap.set(type, row);
        break;
      }
    }
  }

  const b2cs: B2csRow[] = [...b2csMap.values()]
    .filter((r) => !isZeroHeads(r.h))
    .sort((a, b) =>
      a.pos !== b.pos
        ? a.pos.localeCompare(b.pos)
        : a.supplyType !== b.supplyType
          ? a.supplyType.localeCompare(b.supplyType)
          : compareRate(a.rate, b.rate),
    )
    .map((r) => ({ supplyType: r.supplyType, pos: r.pos, rate: r.rate, ...headsToValues(r.h) }));
  for (const r of b2cs) {
    if (Number(r.taxable) < 0)
      issues.push({
        severity: "warning",
        code: ISSUE_CODES.B2CS_NEGATIVE,
        message: `B2CS for ${stateName(r.pos) || r.pos} at ${r.rate}% is negative after credit notes (₹${r.taxable}). Check that the credit notes belong to this period.`,
        recordKind: "period",
        recordId: periodKey,
      });
  }

  const nil: NilRow[] = NIL_ORDER.filter((t) => nilMap.has(t))
    .map((t) => {
      const r = nilMap.get(t)!;
      return { supplyType: t, nil: fmt2(r.nil), exempt: fmt2(r.exempt), nonGst: fmt2(r.nonGst) };
    })
    .filter((r) => Number(r.nil) !== 0 || Number(r.exempt) !== 0 || Number(r.nonGst) !== 0);

  const hsn = buildHsnSummary(cls.docs);
  const docs = buildDocSeries(cls.issuedInPeriod);
  for (const s of docs) {
    if (s.gaps > 0)
      issues.push({
        severity: "warning",
        code: ISSUE_CODES.DOCS_GAP,
        message: `${s.natureLabel} ${s.from} to ${s.to}: ${s.gaps} number(s) in between are not in your records (deleted or not issued?). Report them as cancelled if they were issued.`,
        recordKind: "period",
        recordId: periodKey,
      });
  }

  const sections: Gstr1Sections = {
    b2b,
    b2cl,
    b2cs,
    exp,
    cdnr,
    cdnur,
    nil,
    hsnB2b: hsn.b2b,
    hsnB2c: hsn.b2c,
    docs,
  };

  const nilTotal = nil.reduce((acc, r) => acc.plus(r.nil).plus(r.exempt).plus(r.nonGst), ZERO);
  const totals: Record<Gstr1SectionKey, SectionTotals> = {
    b2b: docTotals(b2b),
    b2cl: docTotals(b2cl),
    b2cs: totalsOf(b2cs),
    exp: docTotals(exp),
    cdnr: docTotals(cdnr, cdnrSigns),
    cdnur: docTotals(cdnur, cdnurSigns),
    nil: { count: nil.length, ...headsToValues({ ...zeroHeads(), taxable: nilTotal }) },
    hsnB2b: totalsOf(hsn.b2b),
    hsnB2c: totalsOf(hsn.b2c),
    docs: { count: docs.reduce((n, s) => n + s.total, 0), ...headsToValues(zeroHeads()) },
  };

  let grand = zeroHeads();
  let grandCount = 0;
  for (const key of SUPPLY_SECTION_KEYS) {
    grand = addHeads(grand, headsFromValues(totals[key]));
    grandCount += totals[key].count;
  }

  const recordHashes = cls.issuedInPeriod.map((inv) => ({
    id: inv.id,
    hash: invoiceReturnHash(inv),
  }));

  return {
    periodKey,
    gstin: normalizeGstin(settings.profile.gstin),
    sections,
    totals,
    grandTotals: { count: grandCount, ...headsToValues(grand) },
    issues,
    hasErrors: hasErrors(issues),
    excluded: cls.excluded,
    recordHashes,
  };
}
