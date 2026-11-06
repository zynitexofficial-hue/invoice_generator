import { Dec, ZERO, roundTo, toDec } from "@/lib/money";
import type { Gstr3bResult } from "@/lib/gst/returns";
import type { ReconResult } from "@/lib/gst/gstr2b/match";
import type { Gstr2bRow, PeriodInput } from "@/lib/schema";
import type { ItcLine } from "./itc-source";

/**
 * FULL GSTR-3B WORKSHEET (spec F6, phase 3). Pure: takes the Phase 1 3B build
 * (outward side), the purchase-side ItcLines and the user's manual period
 * inputs, and returns Table 3.1(d), Table 4 (A-D), reverse-charge totals, an
 * ITC set-off simulation and cash-ledger shortfall.
 *
 * A worksheet is a DRAFT prepared from your records, not a filing. Rules marked
 * `verify` follow CGST Act s.49 / Rule 88A as remembered and must be checked
 * on the GST portal or with a CA.
 */

export type Head = "igst" | "cgst" | "sgst" | "cess";
export const HEADS: readonly Head[] = ["igst", "cgst", "sgst", "cess"];
export type Heads = Record<Head, string>;

export const zeroHeadsText = (): Heads => ({
  igst: "0.00",
  cgst: "0.00",
  sgst: "0.00",
  cess: "0.00",
});

/** Manual inputs saved in periodInputs.values as "<row>.<head>". */
export const INPUT_ROWS = [
  { id: "open", label: "Electronic credit ledger balance brought forward (ITC)" },
  { id: "cash", label: "Electronic cash ledger balance" },
  { id: "4A1", label: "4A(1) Import of goods" },
  { id: "4A2", label: "4A(2) Import of services" },
  { id: "4A4", label: "4A(4) Inward supplies from ISD" },
  { id: "4B1", label: "4B(1) Reversed: rules 38, 42, 43 and section 17(5)" },
  { id: "4B2", label: "4B(2) Reversed: others" },
  { id: "4D1", label: "4D(1) ITC reclaimed (reversed earlier under 4B(2))" },
  { id: "4D2", label: "4D(2) Ineligible ITC: section 16(4) / place of supply" },
] as const;
export type InputRowId = (typeof INPUT_ROWS)[number]["id"];

export const inputKey = (row: InputRowId, head: Head) => `${row}.${head}`;

export const WORKSHEET_FLAGS = {
  imsReviewed: "ims_reviewed",
  reconciled2b: "gstr2b_reconciled",
} as const;

const d = (v: string | undefined) => toDec(v ?? "");
const t = (x: Dec) => roundTo(x, 2).toFixed(2);

function sumLines(lines: ItcLine[]): Record<Head | "taxable", Dec> {
  return lines.reduce(
    (a, l) => ({
      taxable: a.taxable.plus(d(l.taxable)),
      igst: a.igst.plus(d(l.igst)),
      cgst: a.cgst.plus(d(l.cgst)),
      sgst: a.sgst.plus(d(l.sgst)),
      cess: a.cess.plus(d(l.cess)),
    }),
    { taxable: ZERO, igst: ZERO, cgst: ZERO, sgst: ZERO, cess: ZERO },
  );
}

export function readInputHeads(input: Pick<PeriodInput, "values"> | null, row: InputRowId): Heads {
  const v = input?.values ?? {};
  const out = zeroHeadsText();
  for (const h of HEADS) out[h] = t(d(v[inputKey(row, h)]));
  return out;
}

export interface WorksheetItcRow {
  id: string;
  label: string;
  heads: Heads;
  /** Where the figure comes from. */
  source: "books" | "manual" | "calculated" | "reference";
  note?: string;
}

export interface SetOffStep {
  from: Head;
  to: Head;
  amount: string;
}

export interface SetOffResult {
  /** ITC available per head: ledger balance brought forward + net ITC. */
  creditAvailable: Heads;
  /** Liability that ITC may pay (outward tax + amendments). */
  liabilityByItc: Heads;
  /** Liability that must be paid in cash (reverse-charge tax). */
  liabilityCashOnly: Heads;
  steps: SetOffStep[];
  /** Paid with ITC, by the head of the TAX being paid. */
  paidByItc: Heads;
  /** Payable in cash = liability left after ITC + reverse-charge tax. */
  payableCash: Heads;
  /** ITC left per head after set-off. */
  creditLeft: Heads;
  /** Cash ledger balance entered by the user. */
  cashBalance: Heads;
  /** Extra cash to deposit: payableCash − cash balance, floored at 0. */
  cashShortfall: Heads;
  /** Cash balance left over after paying. */
  cashLeft: Heads;
}

/**
 * ITC set-off (s.49 / Rule 88A, verify): IGST credit pays IGST, then CGST, then
 * SGST; CGST credit pays CGST, then IGST (never SGST); SGST credit pays SGST,
 * then IGST (never CGST); cess credit pays cess only. Reverse-charge tax,
 * interest and late fee can be paid only from the cash ledger.
 */
export function setOff(
  credit: Heads,
  liabilityByItc: Heads,
  liabilityCashOnly: Heads,
  cashBalance: Heads,
): SetOffResult {
  const cr: Record<Head, Dec> = {
    igst: d(credit.igst),
    cgst: d(credit.cgst),
    sgst: d(credit.sgst),
    cess: d(credit.cess),
  };
  const li: Record<Head, Dec> = {
    igst: d(liabilityByItc.igst),
    cgst: d(liabilityByItc.cgst),
    sgst: d(liabilityByItc.sgst),
    cess: d(liabilityByItc.cess),
  };
  const paid: Record<Head, Dec> = { igst: ZERO, cgst: ZERO, sgst: ZERO, cess: ZERO };
  const steps: SetOffStep[] = [];
  const ORDER: [Head, Head[]][] = [
    ["igst", ["igst", "cgst", "sgst"]],
    ["cgst", ["cgst", "igst"]],
    ["sgst", ["sgst", "igst"]],
    ["cess", ["cess"]],
  ];
  for (const [from, targets] of ORDER)
    for (const to of targets) {
      if (!cr[from].greaterThan(0) || !li[to].greaterThan(0)) continue;
      const use = Dec.min(cr[from], li[to]);
      cr[from] = cr[from].minus(use);
      li[to] = li[to].minus(use);
      paid[to] = paid[to].plus(use);
      steps.push({ from, to, amount: t(use) });
    }
  const cashOnly = (h: Head) => d(liabilityCashOnly[h]);
  const payable: Record<Head, Dec> = {
    igst: li.igst.plus(cashOnly("igst")),
    cgst: li.cgst.plus(cashOnly("cgst")),
    sgst: li.sgst.plus(cashOnly("sgst")),
    cess: li.cess.plus(cashOnly("cess")),
  };
  const fmt = (r: Record<Head, Dec>): Heads => ({
    igst: t(r.igst),
    cgst: t(r.cgst),
    sgst: t(r.sgst),
    cess: t(r.cess),
  });
  const short: Record<Head, Dec> = {
    igst: Dec.max(payable.igst.minus(d(cashBalance.igst)), ZERO),
    cgst: Dec.max(payable.cgst.minus(d(cashBalance.cgst)), ZERO),
    sgst: Dec.max(payable.sgst.minus(d(cashBalance.sgst)), ZERO),
    cess: Dec.max(payable.cess.minus(d(cashBalance.cess)), ZERO),
  };
  const left: Record<Head, Dec> = {
    igst: Dec.max(d(cashBalance.igst).minus(payable.igst), ZERO),
    cgst: Dec.max(d(cashBalance.cgst).minus(payable.cgst), ZERO),
    sgst: Dec.max(d(cashBalance.sgst).minus(payable.sgst), ZERO),
    cess: Dec.max(d(cashBalance.cess).minus(payable.cess), ZERO),
  };
  return {
    creditAvailable: credit,
    liabilityByItc,
    liabilityCashOnly,
    steps,
    paidByItc: fmt(paid),
    payableCash: fmt(payable),
    creditLeft: fmt(cr),
    cashBalance,
    cashShortfall: fmt(short),
    cashLeft: fmt(left),
  };
}

export interface BuildWorksheetInput {
  /** Phase 1 3B build: provides 3.1(a)-(c),(e), 3.2 and the outward tax. */
  base: Gstr3bResult;
  /** Purchase-side lines for the period (from an ItcSource). */
  itcLines: ItcLine[];
  /** Saved manual inputs for the period. */
  input: Pick<PeriodInput, "values" | "flags" | "setOffNotes" | "notes"> | null;
  /** Hook for Feature B: outward tax amendments from GSTR-1A (reads 0 until wired). */
  amendmentsFromGstr1a?: Heads;
  /** ITC available per the imported GSTR-2B for the period (non-RCM, eligible), if imported. */
  gstr2bAvailable?: Heads | null;
}

export interface Gstr3bWorksheet {
  periodKey: string;
  /** 3.1(d): inward supplies liable to reverse charge. */
  table31d: { taxable: string; heads: Heads };
  itcRows: WorksheetItcRow[];
  /** 4A total, 4B total, 4C. */
  totalA: Heads;
  totalB: Heads;
  netItc: Heads;
  /** GST on bills marked ineligible: already left out of 4A. */
  ineligibleInBooks: Heads;
  amendments: { label: string; heads: Heads };
  outputTax: Heads;
  rcmTax: Heads;
  setOff: SetOffResult;
  gstr2bAvailable: Heads | null;
  /** books 4A(5) − 2B available, per head; null without a 2B import. */
  gstr2bDifference: Heads | null;
  notes: string[];
  lockedRowNotes: string[];
  warnings: string[];
}

export const AMENDMENTS_LABEL = "Amendments (from GSTR-1A)";

/* Figures taken from imported GSTR-2B statements */

const rowHeads = (rows: Gstr2bRow[]): Heads => {
  const acc: Record<Head, Dec> = { igst: ZERO, cgst: ZERO, sgst: ZERO, cess: ZERO };
  for (const r of rows) {
    const s = r.docType === "credit_note" ? -1 : 1;
    for (const h of HEADS) acc[h] = acc[h].plus(d(r[h]).times(s));
  }
  return { igst: t(acc.igst), cgst: t(acc.cgst), sgst: t(acc.sgst), cess: t(acc.cess) };
};

/**
 * ITC "available" per the imported 2B for the 4A(5) comparison: invoices and
 * notes with ITC available, not reverse charge, not ignored by the user. Imports
 * and ISD rows are excluded (they belong to 4A(1) and 4A(4)).
 */
export function gstr2bAvailableHeads(results: ReconResult[]): Heads {
  const rows = results.flatMap((r) => [...r.matches.map((m) => m.row), ...r.missingInBooks]);
  return rowHeads(rows.filter((r) => r.itcAvailable && !r.rcm));
}

/** Suggested 4A(1) (imports of goods) and 4A(4) (ISD) from the imported 2B. */
export function gstr2bSuggestedInputs(results: ReconResult[]): { "4A1": Heads; "4A4": Heads } {
  const other = results.flatMap((r) => r.other).filter((r) => r.itcAvailable);
  return {
    "4A1": rowHeads(other.filter((r) => r.section === "impg")),
    "4A4": rowHeads(other.filter((r) => r.section === "isd")),
  };
}

const sub = (a: Heads, b: Heads): Heads => ({
  igst: t(d(a.igst).minus(d(b.igst))),
  cgst: t(d(a.cgst).minus(d(b.cgst))),
  sgst: t(d(a.sgst).minus(d(b.sgst))),
  cess: t(d(a.cess).minus(d(b.cess))),
});
const add = (...xs: Heads[]): Heads => ({
  igst: t(xs.reduce((s, x) => s.plus(d(x.igst)), ZERO)),
  cgst: t(xs.reduce((s, x) => s.plus(d(x.cgst)), ZERO)),
  sgst: t(xs.reduce((s, x) => s.plus(d(x.sgst)), ZERO)),
  cess: t(xs.reduce((s, x) => s.plus(d(x.cess)), ZERO)),
});
const headsOf = (s: Record<Head, Dec>): Heads => ({
  igst: t(s.igst),
  cgst: t(s.cgst),
  sgst: t(s.sgst),
  cess: t(s.cess),
});

export const WORKSHEET_NOTES = [
  "This worksheet is a draft prepared from your records; it is not a filing. Check every figure against the GST portal or with your CA before filing.",
  "ITC can be claimed only as shown in your GSTR-2B (and reviewed in IMS). Tax on a bill that is missing from 2B should normally wait until the supplier reports it.",
  "Set-off order used (verify): IGST credit pays IGST, then CGST, then SGST. CGST credit pays CGST, then IGST. SGST credit pays SGST, then IGST. CGST credit cannot pay SGST and SGST credit cannot pay CGST. Cess credit pays cess only.",
  "Reverse-charge tax, interest and late fee can be paid only from the cash ledger, never from ITC. The sheet adds reverse-charge tax to the cash payable.",
  "Rows 4A(1), 4A(2) and 4A(4), the reversals in 4B and the 4D lines are not in your books, so you enter them here. Imports and ISD credit are available in your imported GSTR-2B.",
  "4D lines are for information only. If you reclaim ITC reversed earlier, also add it to the ITC rows you claim (verify on the portal).",
  "The opening balances are your own figures from the portal (Ledgers). The app cannot read them.",
];

export const LOCKED_ROW_NOTES = [
  "Tables 3.1(a), 3.1(b), 3.1(c), 3.1(e) and 3.2 are auto-populated from your filed GSTR-1/IFF/GSTR-1A and are locked on the portal. If a figure here differs, fix the cause through GSTR-1A or a later GSTR-1, not in 3B (verify).",
  "ITC rows in Table 4 are auto-populated from your GSTR-2B after the supplier statements are generated, and some rows may be locked or limited to reductions (verify which rows on the current portal). Compare this sheet to the portal values and use IMS to accept, reject or keep documents pending.",
];

export function buildGstr3bWorksheet(input: BuildWorksheetInput): Gstr3bWorksheet {
  const { base, itcLines, input: manual } = input;
  const warnings: string[] = [];
  const rcmLines = itcLines.filter((l) => l.reverseCharge);
  const normal = itcLines.filter((l) => !l.reverseCharge);
  const rcmAll = sumLines(rcmLines);
  const rcmEligible = sumLines(rcmLines.filter((l) => l.eligible));
  const otherEligible = sumLines(normal.filter((l) => l.eligible));
  const ineligible = sumLines(itcLines.filter((l) => !l.eligible));

  const m = (row: InputRowId) => readInputHeads(manual, row);
  const a3 = headsOf(rcmEligible);
  const a5 = headsOf(otherEligible);
  const a1 = m("4A1");
  const a2 = m("4A2");
  const a4 = m("4A4");
  const b1 = m("4B1");
  const b2 = m("4B2");
  const totalA = add(a1, a2, a3, a4, a5);
  const totalB = add(b1, b2);
  const netItc = sub(totalA, totalB);
  for (const h of HEADS)
    if (d(netItc[h]).lessThan(0))
      warnings.push(
        `Net ${h.toUpperCase()} ITC is negative: reversals are higher than the ITC claimed. Check the 4B figures.`,
      );

  const itcRows: WorksheetItcRow[] = [
    { id: "4A(1)", label: "Import of goods", heads: a1, source: "manual" },
    { id: "4A(2)", label: "Import of services", heads: a2, source: "manual" },
    {
      id: "4A(3)",
      label: "Inward supplies liable to reverse charge (other than 1 and 2)",
      heads: a3,
      source: "books",
    },
    { id: "4A(4)", label: "Inward supplies from ISD", heads: a4, source: "manual" },
    { id: "4A(5)", label: "All other ITC", heads: a5, source: "books" },
    { id: "4A", label: "Total ITC available (A)", heads: totalA, source: "calculated" },
    {
      id: "4B(1)",
      label: "Reversed: rules 38, 42, 43 and section 17(5)",
      heads: b1,
      source: "manual",
    },
    { id: "4B(2)", label: "Reversed: others", heads: b2, source: "manual" },
    { id: "4B", label: "Total ITC reversed (B)", heads: totalB, source: "calculated" },
    { id: "4C", label: "Net ITC available (A − B)", heads: netItc, source: "calculated" },
    {
      id: "4D(1)",
      label: "ITC reclaimed (reversed earlier under 4B(2))",
      heads: m("4D1"),
      source: "manual",
      note: "Information only",
    },
    {
      id: "4D(2)",
      label: "Ineligible ITC: section 16(4) / place of supply",
      heads: m("4D2"),
      source: "manual",
      note: "Information only",
    },
  ];

  const ineligibleHeads = headsOf(ineligible);
  const amendments = {
    label: AMENDMENTS_LABEL,
    heads: input.amendmentsFromGstr1a ?? zeroHeadsText(),
  };
  const out = base.payable.outputTax;
  const outputTax = add(
    { igst: out.igst, cgst: out.cgst, sgst: out.sgst, cess: out.cess },
    amendments.heads,
  );
  const rcmTax = headsOf(rcmAll);
  const credit = add(m("open"), netItc);
  const so = setOff(credit, outputTax, rcmTax, m("cash"));

  const gstr2bAvailable = input.gstr2bAvailable ?? null;
  const diff = gstr2bAvailable ? sub(a5, gstr2bAvailable) : null;
  if (diff && HEADS.some((h) => d(diff[h]).greaterThan(1)))
    warnings.push(
      "You are claiming more 'other ITC' than your imported GSTR-2B shows. Review the GSTR-2B tab before filing.",
    );
  if (!itcLines.length)
    warnings.push("No purchase-side tax is recorded for this period, so ITC shows as zero.");

  const notes = [...WORKSHEET_NOTES];
  if (manual?.setOffNotes) notes.push(`Your note: ${manual.setOffNotes}`);

  return {
    periodKey: base.periodKey,
    table31d: { taxable: t(rcmAll.taxable), heads: rcmTax },
    itcRows,
    totalA,
    totalB,
    netItc,
    ineligibleInBooks: ineligibleHeads,
    amendments,
    outputTax,
    rcmTax,
    setOff: so,
    gstr2bAvailable,
    gstr2bDifference: diff,
    notes,
    lockedRowNotes: LOCKED_ROW_NOTES,
    warnings,
  };
}
