/**
 * GSTR-9 WORKSHEET (annual return). Built from a whole financial year of
 * invoices and expenses using the existing GSTR-1 classifier and GSTR-3B
 * builder, plus manual inputs for what the app cannot know (advances, imports,
 * ISD credit, reversals, GSTR-2B totals, previous-year adjustments, refunds…).
 *
 * This is NOT a filing. Table numbers follow the GSTR-9 form as we know it;
 * rows marked `verify` need to be checked against the live form on the GST
 * portal before you rely on them. Every books number carries the records
 * behind it (`drill`); every number can be replaced by a manual entry
 * (key `${rowId}.${head}` in annualInputs.gstr9).
 */
import { computeExpenseSummary } from "@/lib/expense-calc";
import { checkGstin } from "@/lib/gst/gstin";
import {
  buildGstr3b,
  buildHsnSummary,
  classifyInvoices,
  dueDate,
  type ClassifiedDoc,
} from "@/lib/gst/returns";
import { Dec, ZERO, toDec } from "@/lib/money";
import { fyKey as fyKeyOf, inPeriod, monthsInPeriod, periodLabel } from "@/lib/period";
import type { AppSettings, Expense, Filing, Invoice } from "@/lib/schema";
import {
  Sheet,
  TAX_HEADS,
  VALUE_HEADS,
  fmt2,
  makeCheck,
  type AnnualRow,
  type DrillRef,
  type WorksheetCheck,
} from "./common";

const TAX = [...TAX_HEADS];
const VAL = [...VALUE_HEADS];

export interface Gstr9TableDef {
  id: string;
  part: string;
  title: string;
  /** Plain-language help for the table. */
  help?: string;
}

export const GSTR9_TABLES: Gstr9TableDef[] = [
  {
    id: "4",
    part: "Part II",
    title: "Table 4 · Outward and inward supplies on which tax is payable",
    help: "Taxable supplies you made in the year, taken from your issued invoices, credit and debit notes.",
  },
  {
    id: "5",
    part: "Part II",
    title: "Table 5 · Outward supplies on which tax is not payable",
    help: "Exports without payment of tax, SEZ without payment, reverse-charge supplies, exempt, nil-rated and non-GST supplies.",
  },
  {
    id: "6",
    part: "Part III",
    title: "Table 6 · Input tax credit availed",
    help: "ITC from the expenses you marked eligible. Imports, ISD credit and re-claimed ITC are not tracked, so enter them by hand.",
  },
  {
    id: "7",
    part: "Part III",
    title: "Table 7 · ITC reversed and ineligible",
    help: "Reversals (Rule 37/39/42/43, section 17(5), other) are entered by hand.",
  },
  {
    id: "8",
    part: "Part III",
    title: "Table 8 · Other ITC related information",
    help: "Compare ITC on your books with ITC shown in GSTR-2B for the year. Enter the GSTR-2B total by hand.",
  },
  {
    id: "9",
    part: "Part IV",
    title: "Table 9 · Tax paid",
    help: "Estimated from your books for the whole year. Replace with the figures from your filed GSTR-3B returns.",
  },
  {
    id: "10-14",
    part: "Part V",
    title: "Tables 10–14 · Previous year's transactions declared in this year",
    help: "Amendments and ITC for the previous financial year that were declared between April and September (or until the previous year's annual return was filed). Enter by hand.",
  },
  {
    id: "15",
    part: "Part VI",
    title: "Table 15 · Refunds and demands",
    help: "Refund claimed/sanctioned/rejected/pending and demands. Enter by hand.",
  },
  {
    id: "16",
    part: "Part VI",
    title: "Table 16 · Composition supplies, deemed supply and goods on approval",
    help: "Enter by hand.",
  },
  { id: "19", part: "Part VI", title: "Table 19 · Late fee payable and paid" },
];

export interface Gstr9HsnRow {
  hsn: string;
  uqc: string;
  qty: string;
  rate: string;
  taxable: string;
  igst: string;
  cgst: string;
  sgst: string;
  cess: string;
  drill: DrillRef[];
}

export interface Gstr9InwardSummaryRow {
  id: string;
  label: string;
  count: number;
  taxable: string;
  tax: string;
  drill: DrillRef[];
}

export interface Gstr9Result {
  fyKey: string;
  fyLabel: string;
  gstin: string;
  rows: AnnualRow[];
  hsnOutward: Gstr9HsnRow[];
  /** Table 18 stand-in: your expenses carry no HSN code, so only totals by ITC type are shown. */
  inwardSummary: Gstr9InwardSummaryRow[];
  checks: WorksheetCheck[];
  /** Turnover per Table 5N (taxable + not-taxable outward supplies, net of notes). */
  totalTurnover: string;
  /** Records skipped because data is missing (no date, no exchange rate). */
  dataGaps: { id: string; number: string; message: string }[];
  dueDate: string | null;
  counts: { invoices: number; expenses: number };
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

interface Acc {
  taxable: Dec;
  igst: Dec;
  cgst: Dec;
  sgst: Dec;
  cess: Dec;
  drill: DrillRef[];
}
const newAcc = (): Acc => ({
  taxable: ZERO,
  igst: ZERO,
  cgst: ZERO,
  sgst: ZERO,
  cess: ZERO,
  drill: [],
});

function docTotals(d: ClassifiedDoc) {
  return d.lines.reduce(
    (a, l) => ({
      taxable: a.taxable.plus(l.taxable),
      igst: a.igst.plus(l.igst),
      cgst: a.cgst.plus(l.cgst),
      sgst: a.sgst.plus(l.sgst),
      cess: a.cess.plus(l.cess),
    }),
    { taxable: ZERO, igst: ZERO, cgst: ZERO, sgst: ZERO, cess: ZERO },
  );
}

function addDoc(map: Map<string, Acc>, rowId: string, d: ClassifiedDoc, sign: 1 | -1) {
  const t = docTotals(d);
  const a = map.get(rowId) ?? newAcc();
  a.taxable = a.taxable.plus(t.taxable.times(sign));
  a.igst = a.igst.plus(t.igst.times(sign));
  a.cgst = a.cgst.plus(t.cgst.times(sign));
  a.sgst = a.sgst.plus(t.sgst.times(sign));
  a.cess = a.cess.plus(t.cess.times(sign));
  a.drill.push({
    kind: "invoice",
    id: d.invoice.id,
    number: d.invoice.number,
    date: d.invoice.invoiceDate,
    party: d.receiverName,
    taxable: fmt2(t.taxable.times(sign)),
    tax: fmt2(t.igst.plus(t.cgst).plus(t.sgst).plus(t.cess).times(sign)),
  });
  map.set(rowId, a);
}

/**
 * Where a document lands in Tables 4/5. Notes against consumers (B2C and
 * B2CL) are netted into 4A as GSTR-1 does; notes against registered persons,
 * exports and SEZ go to 4I/4J (taxable) or 5H/5I (not taxable).
 */
export function gstr9RowFor(d: ClassifiedDoc): { id: string; sign: 1 | -1 } {
  if (d.noteType === null) {
    if (d.nilKind)
      return { id: d.nilKind === "exempt" ? "5D" : d.nilKind === "nil" ? "5E" : "5F", sign: 1 };
    if (d.placement === "exp") return { id: d.exportType === "WPAY" ? "4C" : "5A", sign: 1 };
    if (d.placement === "b2b") {
      if (d.invType === "SEWP") return { id: "4D", sign: 1 };
      if (d.invType === "SEWOP") return { id: "5B", sign: 1 };
      if (d.invoice.reverseCharge) return { id: "5C", sign: 1 };
      return { id: "4B", sign: 1 };
    }
    return { id: "4A", sign: 1 };
  }
  const credit = d.noteType === "C";
  const notTaxable = (cr: boolean) => ({ id: cr ? "5H" : "5I", sign: 1 as const });
  const taxable = (cr: boolean) => ({ id: cr ? "4I" : "4J", sign: 1 as const });
  if (d.nilKind) return notTaxable(credit);
  if (d.placement === "cdnr") {
    if (d.invType === "SEWOP" || d.invoice.reverseCharge) return notTaxable(credit);
    return taxable(credit);
  }
  if (d.placement === "cdnur") {
    if (d.urType === "EXPWOP") return notTaxable(credit);
    if (d.urType === "EXPWP") return taxable(credit);
  }
  // B2C / B2CL notes are netted in 4A.
  return { id: "4A", sign: d.sign };
}

const isEligible = (e: Expense) => e.itcEligible && e.itcType !== "ineligible";

function expenseRef(e: Expense, taxable: Dec, tax: Dec): DrillRef {
  return {
    kind: "expense",
    id: e.id,
    number: e.invoiceNo,
    date: e.date,
    party: e.vendorName,
    taxable: fmt2(taxable),
    tax: fmt2(tax),
  };
}

const hasVendorGstin = (e: Expense) =>
  e.vendorGstin.trim() !== "" && checkGstin(e.vendorGstin).valid;

/* ------------------------------------------------------------------ */
/* builder                                                             */
/* ------------------------------------------------------------------ */

export interface BuildGstr9Input {
  invoices: Invoice[];
  expenses: Expense[];
  settings: AppSettings;
  /** "FY2026-27". */
  fyKey: string;
  /** annualInputs.gstr9 (manual entries). */
  inputs?: Record<string, string>;
  filings?: Filing[];
}

export function buildGstr9({
  invoices,
  expenses,
  settings,
  fyKey,
  inputs = {},
  filings = [],
}: BuildGstr9Input): Gstr9Result {
  const sheet = new Sheet(inputs);
  const cls = classifyInvoices({ invoices, settings, periodKey: fyKey });
  const fyExpenses = expenses.filter((e) => inPeriod(e.date, fyKey));

  /* ---- Tables 4 and 5 from invoices ---- */
  const acc = new Map<string, Acc>();
  for (const d of cls.docs) {
    const { id, sign } = gstr9RowFor(d);
    addDoc(acc, id, d, sign);
  }
  const bookRow = (id: string) => acc.get(id) ?? newAcc();
  const invRow = (
    id: string,
    label: string,
    heads: string[],
    extra: { note?: string; verify?: boolean; sign?: "-" | "+" } = {},
  ) => {
    const a = bookRow(id);
    sheet.add({
      id,
      table: id.startsWith("4") ? "4" : "5",
      label,
      heads,
      books: a,
      drill: a.drill,
      ...extra,
    });
  };
  const manual4 = (id: string, label: string, note: string, sign?: "-" | "+") =>
    sheet.add({ id, table: "4", label, heads: VAL, note, sign, verify: true });

  invRow("4A", "Supplies to unregistered persons (B2C), net of their credit/debit notes", VAL, {
    note: "Includes large B2C invoices; credit and debit notes against consumers are netted here, as in GSTR-1.",
    verify: true,
  });
  invRow("4B", "Supplies to registered persons (B2B)", VAL);
  invRow("4C", "Zero-rated supply (export) on payment of tax (except supplies to SEZ)", VAL);
  invRow("4D", "Supply to SEZ on payment of tax", VAL);
  manual4("4E", "Deemed exports", "The app does not mark deemed exports. Enter from your records.");
  manual4(
    "4F",
    "Advances on which tax has been paid but invoice not issued",
    "The app does not track advances. Enter from your records.",
  );
  // 4G: inward supplies on reverse charge, from expenses.
  const rcm = newAcc();
  for (const e of fyExpenses.filter((x) => x.reverseCharge)) {
    const s = computeExpenseSummary(e);
    const t = { igst: toDec(s.igst), cgst: toDec(s.cgst), sgst: toDec(s.sgst) };
    rcm.taxable = rcm.taxable.plus(s.taxable);
    rcm.igst = rcm.igst.plus(t.igst);
    rcm.cgst = rcm.cgst.plus(t.cgst);
    rcm.sgst = rcm.sgst.plus(t.sgst);
    rcm.drill.push(expenseRef(e, toDec(s.taxable), t.igst.plus(t.cgst).plus(t.sgst)));
  }
  sheet.add({
    id: "4G",
    table: "4",
    label: "Inward supplies on which tax is payable on reverse charge",
    heads: VAL,
    books: rcm,
    drill: rcm.drill,
    note: "From expenses marked reverse charge.",
  });
  sheet.derive(
    { id: "4H", table: "4", label: "Sub-total (A to G)", heads: VAL },
    ["4A", "4B", "4C", "4D", "4E", "4F", "4G"].map((id) => ({ id })),
  );
  invRow("4I", "Credit notes against B, C, D and E above", VAL, {
    sign: "-",
    note: "Shown as positive amounts; they are subtracted in the sub-total.",
  });
  invRow("4J", "Debit notes against B, C, D and E above", VAL, { sign: "+" });
  manual4("4K", "Supplies/tax declared through amendments", "Enter from your amendments.", "+");
  manual4("4L", "Supplies/tax reduced through amendments", "Enter from your amendments.", "-");
  sheet.derive({ id: "4M", table: "4", label: "Sub-total (I to L)", heads: VAL }, [
    { id: "4I", sign: -1 },
    { id: "4J" },
    { id: "4K" },
    { id: "4L", sign: -1 },
  ]);
  sheet.derive(
    {
      id: "4N",
      table: "4",
      label: "Supplies and advances on which tax is payable (H + M)",
      heads: VAL,
    },
    [{ id: "4H" }, { id: "4M" }],
  );

  // Table 5 (taxable value only).
  const T = ["taxable"];
  invRow("5A", "Zero-rated supply (export) without payment of tax", T);
  invRow("5B", "Supply to SEZ without payment of tax", T);
  invRow("5C", "Supplies on which tax is payable by the recipient on reverse charge", T);
  invRow("5D", "Exempted", T);
  invRow("5E", "Nil rated", T);
  invRow("5F", "Non-GST supply", T);
  sheet.derive(
    { id: "5G", table: "5", label: "Sub-total (A to F)", heads: T },
    ["5A", "5B", "5C", "5D", "5E", "5F"].map((id) => ({ id })),
  );
  invRow("5H", "Credit notes against A to F above", T, { sign: "-" });
  invRow("5I", "Debit notes against A to F above", T, { sign: "+" });
  sheet.add({
    id: "5J",
    table: "5",
    label: "Supplies declared through amendments",
    heads: T,
    sign: "+",
    verify: true,
  });
  sheet.add({
    id: "5K",
    table: "5",
    label: "Supplies reduced through amendments",
    heads: T,
    sign: "-",
    verify: true,
  });
  sheet.derive({ id: "5L", table: "5", label: "Sub-total (H to K)", heads: T }, [
    { id: "5H", sign: -1 },
    { id: "5I" },
    { id: "5J" },
    { id: "5K", sign: -1 },
  ]);
  sheet.derive(
    { id: "5M", table: "5", label: "Turnover on which tax is not to be paid (G + L)", heads: T },
    [{ id: "5G" }, { id: "5L" }],
  );
  sheet.derive(
    {
      id: "5N",
      table: "5",
      label: "Total turnover including advances (4N + 5M − 4G)",
      heads: T,
    },
    [{ id: "4N" }, { id: "5M" }, { id: "4G", sign: -1 }],
  );

  /* ---- Table 6 / 7 / 8 from expenses ---- */
  const gstr3b = buildGstr3b({ invoices, expenses, settings, periodKey: fyKey });
  const itc4c = gstr3b.rows.find((r) => r.id === "4C")!;
  sheet.add({
    id: "6A",
    table: "6",
    label: "ITC availed as per GSTR-3B (sum of Table 4A)",
    heads: TAX,
    books: {
      igst: toDec(itc4c.igst),
      cgst: toDec(itc4c.cgst),
      sgst: toDec(itc4c.sgst),
      cess: toDec(itc4c.cess),
    },
    note: "Books estimate: eligible ITC on expenses. Replace with the total of Table 4A across your filed GSTR-3B returns.",
  });
  const itcAcc = new Map<string, Acc>();
  const ineligible = newAcc();
  const addExp = (map: Map<string, Acc>, key: string, e: Expense) => {
    const s = computeExpenseSummary(e);
    const a = map.get(key) ?? newAcc();
    const t = { igst: toDec(s.igst), cgst: toDec(s.cgst), sgst: toDec(s.sgst) };
    a.taxable = a.taxable.plus(s.taxable);
    a.igst = a.igst.plus(t.igst);
    a.cgst = a.cgst.plus(t.cgst);
    a.sgst = a.sgst.plus(t.sgst);
    a.drill.push(expenseRef(e, toDec(s.taxable), t.igst.plus(t.cgst).plus(t.sgst)));
    map.set(key, a);
  };
  const suffix = { inputs: "1", capital_goods: "2", input_services: "3", ineligible: "1" } as const;
  for (const e of fyExpenses) {
    const s = computeExpenseSummary(e);
    const gst = toDec(s.igst).plus(s.cgst).plus(s.sgst);
    if (gst.lessThanOrEqualTo(0)) continue;
    if (!isEligible(e)) {
      addExp(new Map([["x", ineligible]]), "x", e);
      continue;
    }
    const prefix = e.reverseCharge ? (hasVendorGstin(e) ? "6D" : "6C") : "6B";
    addExp(itcAcc, `${prefix}${suffix[e.itcType]}`, e);
  }
  const itcRow = (id: string, label: string) => {
    const a = itcAcc.get(id) ?? newAcc();
    sheet.add({ id, table: "6", label, heads: TAX, books: a, drill: a.drill });
  };
  const manual6 = (id: string, label: string, note?: string) =>
    sheet.add({ id, table: "6", label, heads: TAX, note, verify: true });
  itcRow("6B1", "Inward supplies (not import/RCM): inputs");
  itcRow("6B2", "Inward supplies (not import/RCM): capital goods");
  itcRow("6B3", "Inward supplies (not import/RCM): input services");
  itcRow("6C1", "RCM supplies from unregistered persons: inputs");
  itcRow("6C2", "RCM supplies from unregistered persons: capital goods");
  itcRow("6C3", "RCM supplies from unregistered persons: input services");
  itcRow("6D1", "RCM supplies from registered persons: inputs");
  itcRow("6D2", "RCM supplies from registered persons: capital goods");
  itcRow("6D3", "RCM supplies from registered persons: input services");
  manual6(
    "6E1",
    "Import of goods (including from SEZ): inputs",
    "Imports are not tracked. Enter from your bills of entry.",
  );
  manual6("6E2", "Import of goods (including from SEZ): capital goods");
  manual6("6F", "Import of services (excluding from SEZ)");
  manual6("6G", "ITC received from Input Service Distributor (ISD)");
  manual6("6H", "ITC reclaimed (other than B above) under the Act");
  sheet.derive(
    { id: "6I", table: "6", label: "Sub-total (B to H)", heads: TAX },
    [
      "6B1",
      "6B2",
      "6B3",
      "6C1",
      "6C2",
      "6C3",
      "6D1",
      "6D2",
      "6D3",
      "6E1",
      "6E2",
      "6F",
      "6G",
      "6H",
    ].map((id) => ({ id })),
  );
  sheet.derive({ id: "6J", table: "6", label: "Difference (I − A)", heads: TAX }, [
    { id: "6I" },
    { id: "6A", sign: -1 },
  ]);
  manual6("6K", "Transition credit through TRAN-I", "Mostly zero today. Verify on the form.");
  manual6("6L", "Transition credit through TRAN-II");
  manual6("6M", "Any other ITC availed but not specified above");
  sheet.derive({ id: "6N", table: "6", label: "Sub-total (K to M)", heads: TAX }, [
    { id: "6K" },
    { id: "6L" },
    { id: "6M" },
  ]);
  sheet.derive({ id: "6O", table: "6", label: "Total ITC availed (I + N)", heads: TAX }, [
    { id: "6I" },
    { id: "6N" },
  ]);

  const man7 = (id: string, label: string) =>
    sheet.add({ id, table: "7", label, heads: TAX, verify: true });
  man7("7A", "As per Rule 37");
  man7("7B", "As per Rule 39");
  man7("7C", "As per Rule 42");
  man7("7D", "As per Rule 43");
  man7("7E", "As per section 17(5)");
  man7("7F", "Reversal of TRAN-I credit");
  man7("7G", "Reversal of TRAN-II credit");
  man7("7H", "Other reversals");
  sheet.derive(
    { id: "7I", table: "7", label: "Total ITC reversed (A to H)", heads: TAX },
    ["7A", "7B", "7C", "7D", "7E", "7F", "7G", "7H"].map((id) => ({ id })),
  );
  sheet.derive(
    { id: "7J", table: "7", label: "Net ITC available for utilization (6O − 7I)", heads: TAX },
    [{ id: "6O" }, { id: "7I", sign: -1 }],
  );

  sheet.add({
    id: "8A",
    table: "8",
    label: "ITC as per GSTR-2B for the year",
    heads: TAX,
    note: "Enter the annual total from your downloaded GSTR-2B statements. (GSTR-2A was used in older years; verify which the form asks for.)",
    verify: true,
  });
  sheet.derive(
    { id: "8B", table: "8", label: "ITC as per 6(B) and 6(H) above", heads: TAX },
    ["6B1", "6B2", "6B3", "6H"].map((id) => ({ id })),
  );
  sheet.derive({ id: "8D", table: "8", label: "Difference (A − B)", heads: TAX }, [
    { id: "8A" },
    { id: "8B", sign: -1 },
  ]);
  sheet.add({
    id: "8E",
    table: "8",
    label: "ITC available but not availed",
    heads: TAX,
    verify: true,
  });
  sheet.add({
    id: "8F",
    table: "8",
    label: "ITC available but ineligible",
    heads: TAX,
    books: ineligible,
    drill: ineligible.drill,
    note: "GST on expenses you did not mark ITC-eligible.",
  });
  sheet.add({
    id: "8G",
    table: "8",
    label: "IGST paid on import of goods (including from SEZ)",
    heads: ["igst"],
    verify: true,
  });
  sheet.derive(
    { id: "8H", table: "8", label: "IGST credit availed on import of goods (6E)", heads: ["igst"] },
    [{ id: "6E1" }, { id: "6E2" }],
  );
  sheet.derive({ id: "8I", table: "8", label: "Difference (G − H)", heads: ["igst"] }, [
    { id: "8G" },
    { id: "8H", sign: -1 },
  ]);
  sheet.derive(
    {
      id: "8J",
      table: "8",
      label: "ITC available but not availed on import of goods",
      heads: ["igst"],
    },
    [{ id: "8I" }],
  );
  sheet.derive({ id: "8K", table: "8", label: "Total ITC to lapse (E + F + J)", heads: TAX }, [
    { id: "8E" },
    { id: "8F" },
    { id: "8J" },
  ]);

  /* ---- Table 9: tax paid (books estimate, per-head, no cross-utilisation) ---- */
  const out = gstr3b.payable.outputTax;
  const rcmTax = gstr3b.payable.rcmTax;
  const itc = gstr3b.payable.netItc;
  const gstr3bFilings = filings.filter(
    (f) => f.returnType === "GSTR-3B" && f.periodKind !== "fy" && filingInFy(f.periodKey, fyKey),
  );
  const sumF = (k: "interest" | "lateFee") =>
    gstr3bFilings.reduce((a, f) => a.plus(toDec(f[k])), ZERO);
  for (const [head, label] of [
    ["igst", "Integrated tax"],
    ["cgst", "Central tax"],
    ["sgst", "State/UT tax"],
    ["cess", "Cess"],
  ] as const) {
    const payable = toDec(out[head]).plus(rcmTax[head]);
    const used = Dec.min(toDec(out[head]), toDec(itc[head]));
    sheet.add({
      id: `9-${head}`,
      table: "9",
      label,
      heads: ["payable", "cash", "itc"],
      books: { payable, itc: used, cash: payable.minus(used) },
      note: "Whole-year estimate per head. Cross-utilisation between heads and month-wise set-off are not modelled.",
    });
  }
  sheet.add({
    id: "9-interest",
    table: "9",
    label: "Interest",
    heads: ["payable", "cash"],
    books: { payable: sumF("interest"), cash: sumF("interest") },
    note: "Sum of interest recorded on your GSTR-3B filing entries.",
  });
  sheet.add({
    id: "9-latefee",
    table: "9",
    label: "Late fee",
    heads: ["payable", "cash"],
    books: { payable: sumF("lateFee"), cash: sumF("lateFee") },
    note: "Sum of late fee recorded on your GSTR-3B filing entries.",
  });
  sheet.add({ id: "9-penalty", table: "9", label: "Penalty", heads: ["payable", "cash"] });
  sheet.add({ id: "9-other", table: "9", label: "Other", heads: ["payable", "cash"] });

  /* ---- Tables 10 to 16, 19: manual ---- */
  const man = (id: string, table: string, label: string, heads: string[], sign?: "-" | "+") =>
    sheet.add({ id, table, label, heads, sign, verify: true });
  man("10", "10-14", "Supplies/tax declared through amendments (net of debit notes)", VAL, "+");
  man("11", "10-14", "Supplies/tax reduced through amendments (net of credit notes)", VAL, "-");
  man("12", "10-14", "Reversal of ITC availed during the previous financial year", TAX);
  man("13", "10-14", "ITC availed for the previous financial year", TAX);
  man("14", "10-14", "Differential tax paid on account of 10 and 11 above", [...TAX, "interest"]);
  const refund = [...TAX, "interest"];
  man("15A", "15", "Total refund claimed", refund);
  man("15B", "15", "Total refund sanctioned", refund);
  man("15C", "15", "Total refund rejected", refund);
  man("15D", "15", "Total refund pending", refund);
  man("15E", "15", "Total demand of taxes", [...refund, "penalty"]);
  man("15F", "15", "Total taxes paid in respect of 15E", [...refund, "penalty"]);
  man("15G", "15", "Total demands pending out of 15E", [...refund, "penalty"]);
  man("16A", "16", "Supplies received from composition taxpayers", ["taxable"]);
  man("16B", "16", "Deemed supply under section 143", VAL);
  man("16C", "16", "Goods sent on approval basis but not returned", VAL);
  man("19A", "19", "Late fee: Central tax", ["payable", "paid"]);
  man("19B", "19", "Late fee: State tax", ["payable", "paid"]);

  /* ---- Tables 17 and 18 ---- */
  const hsnMap = new Map<string, Gstr9HsnRow>();
  const hsn = buildHsnSummary(cls.docs);
  for (const r of [...hsn.b2b, ...hsn.b2c]) {
    const key = `${r.hsn}|${r.uqc}|${r.rate}`;
    const cur = hsnMap.get(key);
    if (!cur) {
      hsnMap.set(key, {
        hsn: r.hsn,
        uqc: r.uqc,
        qty: r.qty,
        rate: r.rate,
        taxable: r.taxable,
        igst: r.igst,
        cgst: r.cgst,
        sgst: r.sgst,
        cess: r.cess,
        drill: [],
      });
    } else {
      const add = (a: string, b: string) => fmt2(toDec(a).plus(b));
      cur.qty = add(cur.qty, r.qty);
      cur.taxable = add(cur.taxable, r.taxable);
      cur.igst = add(cur.igst, r.igst);
      cur.cgst = add(cur.cgst, r.cgst);
      cur.sgst = add(cur.sgst, r.sgst);
      cur.cess = add(cur.cess, r.cess);
    }
  }
  for (const d of cls.docs) {
    const seen = new Set<string>();
    for (const l of d.lines) {
      const key = `${l.hsn}|${l.uqc}|${l.rate}`;
      const row = hsnMap.get(key);
      if (!row) continue;
      row.drill.push({
        kind: "invoice",
        id: d.invoice.id,
        number: d.invoice.number,
        date: d.invoice.invoiceDate,
        party: d.receiverName,
        taxable: fmt2(l.taxable.times(d.sign)),
        tax: fmt2(l.igst.plus(l.cgst).plus(l.sgst).times(d.sign)),
      });
      seen.add(key);
    }
  }
  const hsnOutward = [...hsnMap.values()].sort(
    (a, b) => a.hsn.localeCompare(b.hsn) || toDec(a.rate).comparedTo(toDec(b.rate)),
  );

  const inwardSummary: Gstr9InwardSummaryRow[] = (
    [
      ["inputs", "Inputs (goods)"],
      ["input_services", "Input services"],
      ["capital_goods", "Capital goods"],
      ["ineligible", "Not eligible for ITC"],
    ] as const
  ).map(([type, label]) => {
    const list = fyExpenses.filter((e) => (isEligible(e) ? e.itcType : "ineligible") === type);
    let taxable = ZERO;
    let tax = ZERO;
    const drill: DrillRef[] = [];
    for (const e of list) {
      const s = computeExpenseSummary(e);
      const t = toDec(s.igst).plus(s.cgst).plus(s.sgst);
      taxable = taxable.plus(s.taxable);
      tax = tax.plus(t);
      drill.push(expenseRef(e, toDec(s.taxable), t));
    }
    return { id: type, label, count: list.length, taxable: fmt2(taxable), tax: fmt2(tax), drill };
  });

  /* ---- Checks (books-only consistency) ---- */
  const booksOnly = (id: string, head: string) => toDec(sheet.get(id).books?.[head]);
  let booksTax = ZERO;
  for (const head of TAX)
    booksTax = booksTax
      .plus(booksOnly("4A", head))
      .plus(booksOnly("4B", head))
      .plus(booksOnly("4C", head))
      .plus(booksOnly("4D", head))
      .plus(booksOnly("4J", head))
      .minus(booksOnly("4I", head));
  const outputTax3b = TAX.reduce((a, h) => a.plus(out[h]), ZERO);
  const checks: WorksheetCheck[] = [
    makeCheck(
      "tax-vs-3b",
      "Tax in Table 4 (books, excluding reverse charge) equals output tax in your GSTR-3B build",
      outputTax3b,
      booksTax,
      "A difference usually means a document is classified differently in the two builds. Open the drill-down to find it.",
    ),
    makeCheck(
      "itc-vs-6",
      "ITC in Table 6 (books) equals eligible ITC in your GSTR-3B build",
      TAX.reduce((a, h) => a.plus(itc[h]), ZERO),
      TAX.reduce(
        (a, h) =>
          a.plus(
            ["6B1", "6B2", "6B3", "6C1", "6C2", "6C3", "6D1", "6D2", "6D3"].reduce(
              (s, id) => s.plus(booksOnly(id, h)),
              ZERO,
            ),
          ),
        ZERO,
      ),
    ),
  ];

  const gaps = cls.excluded.filter(
    (x) => x.reason === "missing_exchange_rate" || x.reason === "no_date",
  );

  return {
    fyKey,
    fyLabel: periodLabel(fyKey),
    gstin: settings.profile.gstin.trim(),
    rows: sheet.rows,
    hsnOutward,
    inwardSummary,
    checks,
    totalTurnover: sheet.get("5N").values.taxable,
    dataGaps: gaps.map((g) => ({ id: g.invoiceId, number: g.number, message: g.message })),
    dueDate: dueDate("GSTR-9", fyKey, {
      frequency: settings.gst.filingFrequency,
      stateCode: settings.profile.stateCode,
    }),
    counts: { invoices: cls.docs.length, expenses: fyExpenses.length },
  };
}

/** Whether a filing's period key (month/quarter) falls inside a financial year. */
function filingInFy(periodKey: string, fyKey: string): boolean {
  if (periodKey === fyKey) return true;
  return monthsInPeriod(periodKey).every((m) => inPeriod(`${m}-01`, fyKey));
}

/** Rows of one table, in order. */
export function gstr9RowsOf(result: Gstr9Result, table: string): AnnualRow[] {
  return result.rows.filter((r) => r.table === table);
}

/** Look up a row by id. */
export function gstr9Row(result: Gstr9Result, id: string): AnnualRow {
  const r = result.rows.find((x) => x.id === id);
  if (!r) throw new Error(`Unknown GSTR-9 row ${id}`);
  return r;
}

/** The financial years that have any invoice or expense, newest first, plus the current one. */
export function financialYearsWithData(dates: string[], todayISO: string): string[] {
  const set = new Set<string>([fyKeyOf(todayISO)]);
  for (const d of dates) if (d) set.add(fyKeyOf(d));
  return [...set].sort().reverse();
}
