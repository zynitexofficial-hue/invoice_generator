import {
  dueDate,
  GSTR3B_ROW_LABELS,
  type ExcludedRecord,
  type Gstr1Result,
  type Gstr1SectionKey,
  type Gstr3bResult,
  type NilSupplyType,
  type RateItem,
  type ReturnIssue,
  type Severity,
} from "@/lib/gst/returns";
import { stateName } from "@/lib/gst/states";
import { toDec, ZERO } from "@/lib/money";
import { currentPeriod, periodKind, periodLabel, quarterKey, shiftPeriod } from "@/lib/period";
import {
  PERIOD_KEY_RE,
  type AppSettings,
  type Filing,
  type FilingStatus,
  type SnapshotRecord,
} from "@/lib/schema";
import type { CsvCell } from "@/lib/csv";

/**
 * View-model helpers for the GST Returns page. Pure (no React/Dexie), so they
 * can be unit-tested against the engine fixtures.
 */

export type Frequency = AppSettings["gst"]["filingFrequency"];
export type ReturnsTab = "gstr1" | "gstr3b" | "filing";
export const RETURNS_TABS: ReturnsTab[] = ["gstr1", "gstr3b", "filing"];
/** The two returns tracked per period on this page. */
export const PAGE_RETURNS = ["GSTR-1", "GSTR-3B"] as const;
export type PageReturn = (typeof PAGE_RETURNS)[number];

/* ---------------- Period ---------------- */

export const periodKindFor = (f: Frequency) => (f === "qrmp" ? "quarter" : "month");

/**
 * The period to show by default: the previous period while its GSTR-3B is
 * still due (that's the return being prepared now), otherwise the current one.
 */
export function defaultPeriod(frequency: Frequency, stateCode: string, today: string): string {
  const current = currentPeriod(periodKindFor(frequency), today);
  const previous = shiftPeriod(current, -1);
  const due = dueDate("GSTR-3B", previous, { frequency, stateCode });
  return due && due >= today ? previous : current;
}

/** Validate a `?period=` value for the filing frequency; null when unusable. */
export function parsePeriodParam(param: string | null, frequency: Frequency): string | null {
  if (!param || !PERIOD_KEY_RE.test(param)) return null;
  const kind = periodKind(param);
  const wanted = periodKindFor(frequency);
  if (kind === wanted) return param;
  // A month link for a quarterly filer opens the quarter containing it.
  if (kind === "month" && wanted === "quarter") return quarterKey(`${param}-01`);
  return null;
}

export function parseTab(param: string | null): ReturnsTab {
  return RETURNS_TABS.includes(param as ReturnsTab) ? (param as ReturnsTab) : "gstr1";
}

export function returnTitle(type: PageReturn, frequency: Frequency): string {
  if (type === "GSTR-1") return frequency === "qrmp" ? "GSTR-1 (quarterly)" : "GSTR-1";
  return frequency === "qrmp" ? "GSTR-3B (quarterly)" : "GSTR-3B";
}

/* ---------------- Due dates & status ---------------- */

/** "Due in 5 days", "Due today", "3 days overdue". */
export function dueText(daysLeft: number): string {
  if (daysLeft === 0) return "Due today";
  if (daysLeft > 0) return `Due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`;
  const n = -daysLeft;
  return `${n} day${n === 1 ? "" : "s"} overdue`;
}

export type FilingStep = FilingStatus;
export const FILING_STEPS: { id: FilingStep; label: string }[] = [
  { id: "not_started", label: "Not started" },
  { id: "data_ready", label: "Data ready" },
  { id: "exported", label: "Exported" },
  { id: "filed", label: "Filed" },
];
export const STEP_LABEL: Record<FilingStep, string> = Object.fromEntries(
  FILING_STEPS.map((s) => [s.id, s.label]),
) as Record<FilingStep, string>;

/**
 * Where a return stands. "Exported" and "Filed" come from the tracker row;
 * "Data ready" is derived (records exist and nothing blocks export).
 */
export function filingStep(filing: Pick<Filing, "status"> | undefined, ready: boolean): FilingStep {
  if (filing?.status === "filed") return "filed";
  if (filing?.status === "exported") return "exported";
  return ready ? "data_ready" : "not_started";
}

/** ARN: 15 letters/digits (e.g. AA2710260123456). Empty is allowed. */
export function arnError(arn: string): string | null {
  if (!arn) return null;
  if (!/^[A-Z0-9]+$/.test(arn)) return "Use letters and digits only.";
  if (arn.length !== 15) return `An ARN has 15 characters (this has ${arn.length}).`;
  return null;
}

/* ---------------- Issues ---------------- */

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function sortIssues(issues: readonly ReturnIssue[]): ReturnIssue[] {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

export function countIssues(issues: readonly ReturnIssue[]) {
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  for (const i of issues) {
    if (i.severity === "error") errors++;
    else if (i.severity === "warning") warnings++;
    else infos++;
  }
  return { errors, warnings, infos };
}

/** Settings section that holds a settings field ("profile.gstin" → "business"). */
export function settingsSectionFor(field: string | undefined): string {
  const head = (field ?? "").split(".")[0];
  if (head === "gst") return "gst";
  if (head === "declarations" || head === "invoiceDefaults") return "defaults";
  if (head === "numbering") return "numbering";
  return "business";
}

/** Where the "Fix" link of an issue goes; undefined for whole-period findings. */
export function issueHref(issue: ReturnIssue): string | undefined {
  switch (issue.recordKind) {
    case "invoice":
      return `/invoice?id=${encodeURIComponent(issue.recordId)}`;
    case "expense":
      // The Money page has no deep link to a single expense yet.
      return "/money?tab=out";
    case "settings":
      return `/settings?section=${settingsSectionFor(issue.field)}`;
    default:
      return undefined;
  }
}

/* ---------------- Excluded documents ---------------- */

/** Excluded documents that belong to this period (drafts, quotations, cancelled…). */
export function excludedForPeriod(excluded: readonly ExcludedRecord[]): ExcludedRecord[] {
  return excluded.filter((e) => e.reason !== "outside_period");
}

/* ---------------- GSTR-1 summary rows ---------------- */

export interface DetailItem {
  id: string;
  title: string;
  subtitle: string;
  href?: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
}

export interface SectionRow {
  key: Gstr1SectionKey;
  label: string;
  hint: string;
  count: number;
  /** Values are summed in a section that only lists documents (no tax columns for docs). */
  hasValues: boolean;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  details: DetailItem[];
}

export const SECTION_META: Record<Gstr1SectionKey, { label: string; hint: string }> = {
  b2b: { label: "B2B", hint: "Sales to GST-registered customers" },
  b2cl: { label: "B2CL", hint: "Inter-state sales over ₹1 lakh to unregistered customers" },
  b2cs: { label: "B2CS", hint: "Other sales to unregistered customers (by state and rate)" },
  exp: { label: "Exports", hint: "Exports with or without IGST" },
  cdnr: { label: "Credit/debit notes (registered)", hint: "Notes issued to registered customers" },
  cdnur: {
    label: "Credit/debit notes (unregistered)",
    hint: "Notes against B2CL invoices and exports",
  },
  nil: { label: "Nil / Exempt / Non-GST", hint: "Supplies without GST" },
  hsnB2b: { label: "HSN summary — B2B", hint: "Goods and services sold to registered customers" },
  hsnB2c: { label: "HSN summary — B2C", hint: "Goods and services sold to everyone else" },
  docs: { label: "Documents issued", hint: "Number series used this period" },
};

export const SECTION_ORDER: Gstr1SectionKey[] = [
  "b2b",
  "b2cl",
  "b2cs",
  "exp",
  "cdnr",
  "cdnur",
  "nil",
  "hsnB2b",
  "hsnB2c",
  "docs",
];

const NIL_LABEL: Record<NilSupplyType, string> = {
  INTRB2B: "Inter-state, to registered",
  INTRAB2B: "Intra-state, to registered",
  INTRB2C: "Inter-state, to unregistered",
  INTRAB2C: "Intra-state, to unregistered",
};

const fmt = (d: ReturnType<typeof toDec>) => d.toFixed(2);

function sumItems(items: readonly RateItem[]) {
  let taxable = ZERO;
  let igst = ZERO;
  let cgst = ZERO;
  let sgst = ZERO;
  for (const it of items) {
    taxable = taxable.plus(toDec(it.taxable));
    igst = igst.plus(toDec(it.igst));
    cgst = cgst.plus(toDec(it.cgst));
    sgst = sgst.plus(toDec(it.sgst));
  }
  return { taxable, igst, cgst, sgst };
}

function docAmounts(items: readonly RateItem[], sign: 1 | -1 = 1) {
  const s = sumItems(items);
  return {
    taxable: fmt(s.taxable.mul(sign)),
    igst: fmt(s.igst.mul(sign)),
    cgst: fmt(s.cgst.mul(sign)),
    sgst: fmt(s.sgst.mul(sign)),
  };
}

const ZERO_AMOUNTS = { taxable: "0.00", igst: "0.00", cgst: "0.00", sgst: "0.00" };
const invoiceHref = (id: string) => `/invoice?id=${encodeURIComponent(id)}`;
const posText = (pos: string) => (pos === "96" ? "Outside India" : stateName(pos) || pos);

export interface DetailContext {
  /** Customer name of an invoice id (for sections without a receiver name). */
  partyOf: (invoiceId: string) => string;
  /** Format an ISO date for display. */
  formatDate: (iso: string) => string;
}

function detailsFor(key: Gstr1SectionKey, result: Gstr1Result, ctx: DetailContext): DetailItem[] {
  const s = result.sections;
  const sub = (...parts: string[]) => parts.filter(Boolean).join(" · ");
  switch (key) {
    case "b2b":
      return s.b2b.map((d) => ({
        id: d.invoiceId,
        title: d.number,
        subtitle: sub(ctx.formatDate(d.date), d.receiverName || ctx.partyOf(d.invoiceId), d.ctin),
        href: invoiceHref(d.invoiceId),
        ...docAmounts(d.items),
      }));
    case "b2cl":
    case "exp":
      return s[key].map((d) => ({
        id: d.invoiceId,
        title: d.number,
        subtitle: sub(ctx.formatDate(d.date), ctx.partyOf(d.invoiceId), posText(d.pos)),
        href: invoiceHref(d.invoiceId),
        ...docAmounts(d.items),
      }));
    case "cdnr":
      return s.cdnr.map((d) => ({
        id: d.invoiceId,
        title: d.number,
        subtitle: sub(
          d.noteType === "C" ? "Credit note" : "Debit note",
          ctx.formatDate(d.date),
          d.receiverName || ctx.partyOf(d.invoiceId),
          d.originalInvoiceNumber ? `against ${d.originalInvoiceNumber}` : "",
        ),
        href: invoiceHref(d.invoiceId),
        ...docAmounts(d.items, d.noteType === "C" ? -1 : 1),
      }));
    case "cdnur":
      return s.cdnur.map((d) => ({
        id: d.invoiceId,
        title: d.number,
        subtitle: sub(
          d.noteType === "C" ? "Credit note" : "Debit note",
          ctx.formatDate(d.date),
          ctx.partyOf(d.invoiceId),
          d.originalInvoiceNumber ? `against ${d.originalInvoiceNumber}` : "",
        ),
        href: invoiceHref(d.invoiceId),
        ...docAmounts(d.items, d.noteType === "C" ? -1 : 1),
      }));
    case "b2cs":
      return s.b2cs.map((r) => ({
        id: `${r.supplyType}|${r.pos}|${r.rate}`,
        title: `${posText(r.pos)} · ${r.rate}%`,
        subtitle: r.supplyType === "INTER" ? "Inter-state" : "Within state",
        taxable: r.taxable,
        igst: r.igst,
        cgst: r.cgst,
        sgst: r.sgst,
      }));
    case "nil":
      return s.nil.map((r) => ({
        id: r.supplyType,
        title: NIL_LABEL[r.supplyType],
        subtitle: `Nil ₹${r.nil} · Exempt ₹${r.exempt} · Non-GST ₹${r.nonGst}`,
        ...ZERO_AMOUNTS,
        taxable: fmt(toDec(r.nil).plus(toDec(r.exempt)).plus(toDec(r.nonGst))),
      }));
    case "hsnB2b":
    case "hsnB2c":
      return s[key].map((r) => ({
        id: `${r.hsn}|${r.uqc}|${r.rate}`,
        title: [r.hsn, r.description].filter(Boolean).join(" — "),
        subtitle: sub(`${r.qty} ${r.uqc}`, `${r.rate}%`),
        taxable: r.taxable,
        igst: r.igst,
        cgst: r.cgst,
        sgst: r.sgst,
      }));
    case "docs":
      return s.docs.map((d) => ({
        id: `${d.nature}|${d.prefix}|${d.from}`,
        title: d.natureLabel,
        subtitle: sub(
          d.from === d.to ? d.from : `${d.from} to ${d.to}`,
          `${d.total} issued`,
          d.cancelled ? `${d.cancelled} cancelled` : "",
        ),
        ...ZERO_AMOUNTS,
      }));
  }
}

/** One summary row per GSTR-1 section, with its document/row list for expanding. */
export function sectionRows(result: Gstr1Result, ctx: DetailContext): SectionRow[] {
  return SECTION_ORDER.map((key) => {
    const t = result.totals[key];
    return {
      key,
      ...SECTION_META[key],
      count: t.count,
      hasValues: key !== "docs",
      taxable: t.taxable,
      igst: t.igst,
      cgst: t.cgst,
      sgst: t.sgst,
      details: detailsFor(key, result, ctx),
    };
  });
}

/* ---------------- Snapshots ---------------- */

export type SnapshotStage = "exported" | "filed";
/** Key in ReturnSnapshot.totals that records why the snapshot was taken. */
export const STAGE_KEY = "_stage";

export function gstr1SnapshotRecords(result: Gstr1Result): SnapshotRecord[] {
  return result.recordHashes.map((r) => ({ kind: "invoice", id: r.id, hash: r.hash }));
}

export function gstr1SnapshotTotals(
  result: Gstr1Result,
  stage: SnapshotStage,
): Record<string, string> {
  const out: Record<string, string> = { [STAGE_KEY]: stage };
  for (const key of SECTION_ORDER) {
    const t = result.totals[key];
    out[`${key}.count`] = String(t.count);
    out[`${key}.taxable`] = t.taxable;
  }
  const g = result.grandTotals;
  Object.assign(out, {
    "total.count": String(g.count),
    "total.taxable": g.taxable,
    "total.igst": g.igst,
    "total.cgst": g.cgst,
    "total.sgst": g.sgst,
  });
  return out;
}

export function gstr3bSnapshotTotals(
  result: Gstr3bResult,
  stage: SnapshotStage,
): Record<string, string> {
  const out: Record<string, string> = { [STAGE_KEY]: stage };
  for (const r of result.rows) {
    out[`${r.id}.taxable`] = r.taxable;
    out[`${r.id}.tax`] = fmt(toDec(r.igst).plus(toDec(r.cgst)).plus(toDec(r.sgst)));
  }
  const c = result.payable.cashPayable;
  out["cash.igst"] = c.igst;
  out["cash.cgst"] = c.cgst;
  out["cash.sgst"] = c.sgst;
  return out;
}

/**
 * The snapshot to compare against for "changed since filed": the newest one
 * taken when the return was marked filed, else the newest snapshot.
 * `snapshots` is newest first.
 */
export function filedSnapshot<T extends { totals: Record<string, string> }>(
  snapshots: readonly T[] | undefined,
): T | undefined {
  if (!snapshots?.length) return undefined;
  return snapshots.find((s) => s.totals[STAGE_KEY] === "filed") ?? snapshots[0];
}

/* ---------------- GSTR-3B ---------------- */

/** Total of the cash payable heads (for the late-fee interest estimate). */
export function cashPayableTotal(result: Gstr3bResult): string {
  const c = result.payable.cashPayable;
  return fmt(toDec(c.igst).plus(toDec(c.cgst)).plus(toDec(c.sgst)).plus(toDec(c.cess)));
}

export const GSTR3B_GROUPS: { title: string; ids: Gstr3bResult["rows"][number]["id"][] }[] = [
  {
    title: "3.1 Outward supplies and inward supplies liable to reverse charge",
    ids: ["3.1(a)", "3.1(b)", "3.1(c)", "3.1(d)", "3.1(e)", "outward-rcm"],
  },
  { title: "4 Eligible ITC", ids: ["4A(3)", "4A(5)", "4B(2)", "4C"] },
];

export const GSTR3B_CSV_HEADERS = [
  "Table",
  "Description",
  "Taxable Value",
  "Integrated Tax",
  "Central Tax",
  "State/UT Tax",
  "Cess",
];

export function gstr3bCsvRows(
  result: Gstr3bResult,
  meta: { gstin: string; generatedAt: string; draftNote: string },
): CsvCell[][] {
  const rows: CsvCell[][] = result.rows.map((r) => [
    r.id,
    GSTR3B_ROW_LABELS[r.id],
    r.taxable,
    r.igst,
    r.cgst,
    r.sgst,
    r.cess,
  ]);
  for (const r of result.table32)
    rows.push([
      "3.2",
      `Inter-state supplies to unregistered persons — ${r.posName || r.pos}`,
      r.taxable,
      r.igst,
      "",
      "",
      "",
    ]);
  const p = result.payable;
  const heads = (label: string, h: typeof p.cashPayable): CsvCell[] => [
    "Estimate",
    label,
    "",
    h.igst,
    h.cgst,
    h.sgst,
    h.cess,
  ];
  rows.push(heads("Output tax (3.1(a) + 3.1(b))", p.outputTax));
  rows.push(heads("Reverse charge tax (3.1(d), cash only)", p.rcmTax));
  rows.push(heads("Net ITC (4C)", p.netItc));
  rows.push(heads("Estimated tax payable in cash", p.cashPayable));
  rows.push(heads("ITC balance carried forward", p.itcBalance));
  rows.push([]);
  rows.push(["GSTIN", meta.gstin]);
  rows.push(["Period", periodLabel(result.periodKey)]);
  rows.push(["Generated", meta.generatedAt]);
  rows.push([meta.draftNote]);
  return rows;
}

/** True when 3.1/3.2/4 have any value or there are expenses (for empty-state copy). */
export function amountIsZero(v: string): boolean {
  return toDec(v).isZero();
}
