/**
 * GSTR-9C RECONCILIATION WORKSHEET. A checklist plus a books-vs-GSTR-9
 * reconciliation with manual inputs and reasons for differences. It is NOT a
 * filing and NOT a certification: where a CA/auditor certificate or
 * self-certification is required, that is done outside this app. Section and
 * row names follow the idea of the portal statement, not its exact numbering;
 * verify on the portal.
 */
import { Dec, ZERO, toDec } from "@/lib/money";
import { TAX_HEADS, fmt2 } from "./common";
import { gstr9Row, type Gstr9Result } from "./gstr9";

export interface Gstr9cRow {
  id: string;
  section: "A" | "B" | "C";
  label: string;
  value: string;
  kind: "books" | "gstr9" | "manual" | "derived";
  /** Manual rows can be edited; the value comes from `values[id]`. */
  editable: boolean;
  note?: string;
  /** Difference rows: true when the difference is (nearly) zero. */
  reconciled?: boolean;
}

export const GSTR9C_CHECKLIST: { id: string; label: string }[] = [
  {
    id: "afs-ready",
    label: "Annual financial statements (P&L and balance sheet) are final for the year",
  },
  {
    id: "turnover-tied",
    label: "Turnover in the accounts is tied to GSTR-9 Table 5N, differences explained",
  },
  {
    id: "tax-tied",
    label: "Tax paid per GSTR-9 Table 9 is tied to the tax liability in the accounts",
  },
  {
    id: "itc-tied",
    label: "ITC availed per GSTR-9 Table 6 is tied to ITC in the accounts and to GSTR-2B",
  },
  { id: "rate-wise", label: "Rate-wise taxable value and tax were reviewed" },
  { id: "ineligible", label: "Ineligible and blocked ITC (section 17(5)) reviewed" },
  { id: "late-fee", label: "Late fee and interest reviewed" },
  {
    id: "cert",
    label:
      "Certification or self-certification arranged with your CA where applicable (done outside this app)",
  },
];

export const GSTR9C_ADJUSTMENTS: { id: string; label: string; note: string }[] = [
  { id: "A3", label: "Unbilled revenue at the start of the year", note: "Usually added." },
  { id: "A4", label: "Unadjusted advances at the end of the year", note: "Usually added." },
  { id: "A5", label: "Deemed supply (Schedule I)", note: "Usually added." },
  { id: "A6", label: "Credit notes issued after year-end for this year", note: "Usually added." },
  { id: "A7", label: "Trade discounts or value not covered in returns", note: "Usually added." },
  {
    id: "A8",
    label: "Unbilled revenue at the end of the year",
    note: "Usually subtracted: enter a negative number.",
  },
  { id: "A9", label: "Other adjustments", note: "Enter + or −." },
];

export interface Gstr9cResult {
  rows: Gstr9cRow[];
  unreconciledTurnover: string;
  checklistDone: number;
  checklistTotal: number;
}

const val = (m: Record<string, string>, id: string): Dec | undefined => {
  const v = m[id];
  return v === undefined || v.trim() === "" ? undefined : toDec(v);
};

const sumHeads = (g: Gstr9Result, id: string, field: "values" | "books" = "values") => {
  const row = gstr9Row(g, id);
  const src = row[field] ?? row.values;
  return TAX_HEADS.reduce((a, h) => a.plus(toDec(src[h])), ZERO);
};

export function buildGstr9c(input: {
  gstr9: Gstr9Result;
  /** Turnover per your sales records for the year (analytics net revenue). */
  booksTurnover: string;
  values?: Record<string, string>;
  checklist?: Record<string, boolean>;
}): Gstr9cResult {
  const { gstr9 } = input;
  const m = input.values ?? {};
  const rows: Gstr9cRow[] = [];
  const push = (r: Omit<Gstr9cRow, "editable"> & { editable?: boolean }) =>
    rows.push({ editable: false, ...r });
  const near0 = (d: Dec) => d.abs().lessThan(0.5);

  /* A: turnover */
  const booksTurnover = toDec(input.booksTurnover);
  push({
    id: "A1",
    section: "A",
    label: "Turnover per your sales records",
    value: fmt2(booksTurnover),
    kind: "books",
  });
  const afsManual = val(m, "A2");
  const afs = afsManual ?? booksTurnover;
  push({
    id: "A2",
    section: "A",
    label: "Turnover per audited/final annual accounts",
    value: fmt2(afs),
    kind: "manual",
    editable: true,
    note: afsManual
      ? undefined
      : "Blank: your sales records are used. Enter the figure from your final accounts.",
  });
  let adj = ZERO;
  for (const a of GSTR9C_ADJUSTMENTS) {
    const v = val(m, a.id) ?? ZERO;
    adj = adj.plus(v);
    push({
      id: a.id,
      section: "A",
      label: a.label,
      value: fmt2(v),
      kind: "manual",
      editable: true,
      note: a.note,
    });
  }
  const adjusted = afs.plus(adj);
  push({
    id: "A10",
    section: "A",
    label: "Adjusted turnover (A2 plus adjustments)",
    value: fmt2(adjusted),
    kind: "derived",
  });
  const turnover9 = toDec(gstr9.totalTurnover);
  push({
    id: "A11",
    section: "A",
    label: "Turnover per GSTR-9 (Table 5N)",
    value: fmt2(turnover9),
    kind: "gstr9",
  });
  const diffT = adjusted.minus(turnover9);
  push({
    id: "A12",
    section: "A",
    label: "Unreconciled turnover (A10 − A11)",
    value: fmt2(diffT),
    kind: "derived",
    reconciled: near0(diffT),
    note: "Explain any difference in the reasons box. Tax may be due on unreconciled turnover.",
  });

  /* B: tax */
  const liability = sumHeads(gstr9, "4N");
  const rcmTax = sumHeads(gstr9, "4G");
  push({
    id: "B1",
    section: "B",
    label: "Tax liability declared in GSTR-9 Table 4 (incl. reverse charge)",
    value: fmt2(liability),
    kind: "gstr9",
    note: `Includes ${fmt2(rcmTax)} of reverse-charge tax.`,
  });
  const payable = ["igst", "cgst", "sgst", "cess"].reduce(
    (a, h) => a.plus(toDec(gstr9Row(gstr9, `9-${h}`).values.payable)),
    ZERO,
  );
  push({
    id: "B2",
    section: "B",
    label: "Tax payable per GSTR-9 Table 9",
    value: fmt2(payable),
    kind: "gstr9",
  });
  const diffTax = liability.minus(payable);
  push({
    id: "B3",
    section: "B",
    label: "Difference (B1 − B2)",
    value: fmt2(diffTax),
    kind: "derived",
    reconciled: near0(diffTax),
  });
  for (const [id, label] of [
    ["B4", "Tax per your accounts or rate-wise working"],
    ["B5", "Additional tax payable (for example through DRC-03) on differences"],
    ["B6", "Interest or penalty paid on B5"],
  ] as const)
    push({
      id,
      section: "B",
      label,
      value: fmt2(val(m, id) ?? ZERO),
      kind: "manual",
      editable: true,
    });

  /* C: ITC */
  const itc9 = sumHeads(gstr9, "6O");
  push({
    id: "C1",
    section: "C",
    label: "ITC availed per GSTR-9 (Table 6O)",
    value: fmt2(itc9),
    kind: "gstr9",
  });
  const itcBooks = ["6B1", "6B2", "6B3", "6C1", "6C2", "6C3", "6D1", "6D2", "6D3"].reduce(
    (a, id) => a.plus(sumHeads(gstr9, id, "books")),
    ZERO,
  );
  push({
    id: "C2",
    section: "C",
    label: "ITC per your expense records",
    value: fmt2(itcBooks),
    kind: "books",
  });
  const d1 = itc9.minus(itcBooks);
  push({
    id: "C3",
    section: "C",
    label: "Difference (C1 − C2)",
    value: fmt2(d1),
    kind: "derived",
    reconciled: near0(d1),
  });
  push({
    id: "C4",
    section: "C",
    label: "ITC per audited/final accounts",
    value: fmt2(val(m, "C4") ?? ZERO),
    kind: "manual",
    editable: true,
  });
  const d2 = (val(m, "C4") ?? ZERO).minus(itc9);
  push({
    id: "C5",
    section: "C",
    label: "Difference (C4 − C1)",
    value: fmt2(d2),
    kind: "derived",
    reconciled: near0(d2),
  });
  const itc2b = sumHeads(gstr9, "8A");
  push({
    id: "C6",
    section: "C",
    label: "ITC per GSTR-2B (Table 8A)",
    value: fmt2(itc2b),
    kind: "gstr9",
  });
  const d3 = itc2b.minus(sumHeads(gstr9, "8B"));
  push({
    id: "C7",
    section: "C",
    label: "GSTR-2B ITC not availed, or excess availed (8A − 8B)",
    value: fmt2(d3),
    kind: "derived",
    reconciled: near0(d3),
  });
  push({
    id: "C8",
    section: "C",
    label: "ITC reversed per GSTR-9 (Table 7I)",
    value: fmt2(sumHeads(gstr9, "7I")),
    kind: "gstr9",
  });

  const done = GSTR9C_CHECKLIST.filter((c) => input.checklist?.[c.id]).length;
  return {
    rows,
    unreconciledTurnover: fmt2(diffT),
    checklistDone: done,
    checklistTotal: GSTR9C_CHECKLIST.length,
  };
}
