import { computeExpenseSummary } from "@/lib/expense-calc";
import { OTHER_COUNTRY_CODE, stateName } from "@/lib/gst/states";
import { inPeriod } from "@/lib/period";
import { expenseReturnHash, invoiceReturnHash } from "@/lib/return-hash";
import type { AppSettings, Expense, Invoice, SnapshotRecord } from "@/lib/schema";
import { classifyInvoices, type ClassifiedDoc } from "./classify";
import {
  Dec,
  ZERO,
  addHeads,
  fmt2,
  headsToValues,
  taxOf,
  toDec,
  zeroHeads,
  type DecHeads,
} from "./internal";
import type { ReturnIssue, TaxValues } from "./types";
import { hasErrors, validateExpense, validateSettings } from "./validate";

/**
 * GSTR-3B WORKSHEET (spec F6) — not a filing engine. On the portal, Tables
 * 3.1/3.2 are auto-populated from GSTR-1 and locked; ITC must be reconciled
 * with GSTR-2B/IMS. Verify on portal.
 */

export const GSTR3B_ROW_IDS = [
  "3.1(a)",
  "3.1(b)",
  "3.1(c)",
  "3.1(d)",
  "3.1(e)",
  "outward-rcm",
  "4A(3)",
  "4A(5)",
  "4B(2)",
  "4C",
] as const;
export type Gstr3bRowId = (typeof GSTR3B_ROW_IDS)[number];

export const GSTR3B_ROW_LABELS: Record<Gstr3bRowId, string> = {
  "3.1(a)": "Outward taxable supplies (other than zero-rated, nil-rated and exempted)",
  "3.1(b)": "Outward taxable supplies (zero-rated)",
  "3.1(c)": "Other outward supplies (nil-rated, exempted)",
  "3.1(d)": "Inward supplies (liable to reverse charge)",
  "3.1(e)": "Non-GST outward supplies",
  "outward-rcm":
    "Your outward supplies on which the recipient pays tax (reverse charge) — for reference",
  "4A(3)": "ITC: inward supplies liable to reverse charge",
  "4A(5)": "ITC: all other ITC",
  "4B(2)": "GST paid but not claimed (ineligible / not marked eligible) — for reference",
  "4C": "Net ITC available (4A − 4B)",
};

export interface Gstr3bRow extends TaxValues {
  id: Gstr3bRowId;
  label: string;
  /** Shown for reference; not part of the return figures. */
  informational: boolean;
}

export interface Gstr3bInterStateRow {
  pos: string;
  posName: string;
  taxable: string;
  igst: string;
}

export interface TaxHeads {
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
}

export interface Gstr3bPayable {
  /** Tax on 3.1(a) + 3.1(b). */
  outputTax: TaxHeads;
  /** Tax on 3.1(d) — payable in cash, ITC cannot be used for it. */
  rcmTax: TaxHeads;
  /** 4C. */
  netItc: TaxHeads;
  /** max(0, output − ITC) + RCM, per head (no cross-utilisation). */
  cashPayable: TaxHeads;
  /** ITC left over per head after setting off output tax. */
  itcBalance: TaxHeads;
}

export interface Gstr3bResult {
  periodKey: string;
  rows: Gstr3bRow[];
  /** 3.2: inter-state supplies to unregistered persons by place of supply. */
  table32: Gstr3bInterStateRow[];
  payable: Gstr3bPayable;
  notes: string[];
  issues: ReturnIssue[];
  hasErrors: boolean;
  recordHashes: SnapshotRecord[];
}

export interface BuildGstr3bInput {
  invoices: Invoice[];
  expenses: Expense[];
  settings: AppSettings;
  periodKey: string;
}

export const GSTR3B_NOTES = [
  "This is a worksheet prepared from your records, not a filing. On the GST portal, Tables 3.1 and 3.2 are auto-populated from your GSTR-1/IFF and are locked; correct them through GSTR-1A or a later GSTR-1.",
  "ITC here comes from the expenses you recorded. Before claiming, reconcile it with GSTR-2B / IMS — only ITC shown there can be claimed.",
  "Ineligible GST (s.17(5) items, or expenses not marked ITC-eligible) is never added to 4A, so it is shown in 4B(2) for reference only and not subtracted again.",
  "Estimated payable is per tax head with no cross-utilisation between IGST, CGST and SGST (the portal applies the s.49 set-off order and may reduce cash payable). Reverse-charge tax must be paid in cash, so it is added after ITC set-off.",
  "Outward supplies on which your customer pays tax under reverse charge are not part of your liability; they are shown for reference.",
  "Cess is not supported and is always 0. Advances, amendments and e-commerce supplies are not included.",
];

const headsOf = (h: DecHeads): TaxHeads => ({
  igst: fmt2(h.igst),
  cgst: fmt2(h.cgst),
  sgst: fmt2(h.sgst),
  cess: fmt2(h.cess),
});

function docHeads(d: ClassifiedDoc): DecHeads {
  return d.lines.reduce((acc, l) => addHeads(acc, l, d.sign), zeroHeads());
}

function isZeroRated(d: ClassifiedDoc): boolean {
  if (d.placement === "exp") return true;
  if (d.placement === "cdnur") return d.urType === "EXPWP" || d.urType === "EXPWOP";
  return (d.placement === "b2b" || d.placement === "cdnr") && d.invType !== "R";
}

export function buildGstr3b({
  invoices,
  expenses,
  settings,
  periodKey,
}: BuildGstr3bInput): Gstr3bResult {
  const cls = classifyInvoices({ invoices, settings, periodKey });
  const issues: ReturnIssue[] = [...validateSettings(settings), ...cls.issues];
  const acc: Record<Gstr3bRowId, DecHeads> = Object.fromEntries(
    GSTR3B_ROW_IDS.map((id) => [id, zeroHeads()]),
  ) as Record<Gstr3bRowId, DecHeads>;
  const add = (id: Gstr3bRowId, h: DecHeads, sign: 1 | -1 = 1) =>
    (acc[id] = addHeads(acc[id], h, sign));
  const t32 = new Map<string, { taxable: Dec; igst: Dec }>();

  for (const d of cls.docs) {
    const h = docHeads(d);
    if (d.nilKind) {
      add(d.nilKind === "non_gst" ? "3.1(e)" : "3.1(c)", { ...zeroHeads(), taxable: h.taxable });
      continue;
    }
    if (isZeroRated(d)) {
      add("3.1(b)", h);
      continue;
    }
    if ((d.placement === "b2b" || d.placement === "cdnr") && d.invoice.reverseCharge) {
      add("outward-rcm", { ...zeroHeads(), taxable: h.taxable });
      continue;
    }
    add("3.1(a)", h);
    if (!d.registered && d.interState && d.pos && d.pos !== OTHER_COUNTRY_CODE) {
      const row = t32.get(d.pos) ?? { taxable: ZERO, igst: ZERO };
      t32.set(d.pos, { taxable: row.taxable.plus(h.taxable), igst: row.igst.plus(h.igst) });
    }
  }

  const periodExpenses = expenses.filter((e) => inPeriod(e.date, periodKey));
  for (const e of periodExpenses) {
    const s = computeExpenseSummary(e);
    const h: DecHeads = {
      taxable: toDec(s.taxable),
      igst: toDec(s.igst),
      cgst: toDec(s.cgst),
      sgst: toDec(s.sgst),
      cess: ZERO,
    };
    const gst = taxOf(h);
    issues.push(...validateExpense(e, gst));
    const eligible = e.itcEligible && e.itcType !== "ineligible";
    const taxOnly = { ...h, taxable: ZERO };
    if (e.reverseCharge) {
      add("3.1(d)", h);
      if (gst.greaterThan(0)) add(eligible ? "4A(3)" : "4B(2)", taxOnly);
    } else if (gst.greaterThan(0)) {
      add(eligible ? "4A(5)" : "4B(2)", taxOnly);
    }
  }
  acc["4C"] = addHeads(acc["4A(3)"], acc["4A(5)"]);

  const rows: Gstr3bRow[] = GSTR3B_ROW_IDS.map((id) => ({
    id,
    label: GSTR3B_ROW_LABELS[id],
    informational: id === "outward-rcm" || id === "4B(2)",
    ...headsToValues(acc[id]),
  }));

  const table32 = [...t32.entries()]
    .filter(([, r]) => !r.taxable.isZero() || !r.igst.isZero())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pos, r]) => ({
      pos,
      posName: stateName(pos),
      taxable: fmt2(r.taxable),
      igst: fmt2(r.igst),
    }));

  const output = addHeads(acc["3.1(a)"], acc["3.1(b)"]);
  const rcm = acc["3.1(d)"];
  const itc = acc["4C"];
  const perHead = (f: (o: Dec, i: Dec, r: Dec) => Dec): DecHeads => ({
    taxable: ZERO,
    igst: f(output.igst, itc.igst, rcm.igst),
    cgst: f(output.cgst, itc.cgst, rcm.cgst),
    sgst: f(output.sgst, itc.sgst, rcm.sgst),
    cess: f(output.cess, itc.cess, rcm.cess),
  });
  const cash = perHead((o, i, r) => Dec.max(o.minus(i), ZERO).plus(r));
  const balance = perHead((o, i) => Dec.max(i.minus(o), ZERO));

  const recordHashes: SnapshotRecord[] = [
    ...cls.issuedInPeriod.map((inv) => ({
      kind: "invoice" as const,
      id: inv.id,
      hash: invoiceReturnHash(inv),
    })),
    ...periodExpenses.map((e) => ({
      kind: "expense" as const,
      id: e.id,
      hash: expenseReturnHash(e),
    })),
  ];

  const notes = [...GSTR3B_NOTES];
  if (periodExpenses.length === 0)
    notes.push("No expenses are recorded for this period, so ITC and reverse charge show as zero.");

  return {
    periodKey,
    rows,
    table32,
    payable: {
      outputTax: headsOf(output),
      rcmTax: headsOf(rcm),
      netItc: headsOf(itc),
      cashPayable: headsOf(cash),
      itcBalance: headsOf(balance),
    },
    notes,
    issues,
    hasErrors: hasErrors(issues),
    recordHashes,
  };
}

/** Row by id (always present). */
export function gstr3bRow(result: Gstr3bResult, id: Gstr3bRowId): Gstr3bRow {
  return result.rows.find((r) => r.id === id)!;
}
