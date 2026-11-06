/**
 * The CA "tax pack" for a financial year: a list of CSV files plus the numbers
 * for a printable summary. Pure; the UI downloads the files one after another.
 * Draft prepared from your records: verify with your CA.
 */
import {
  computeMetrics,
  expenseRegister,
  hsnSummary,
  incomeRegister,
  notesRegister,
  salesRegister,
  type AnalyticsData,
  type PeriodMetrics,
  type Register,
} from "@/lib/analytics";
import { periodRange } from "@/lib/period";
import type { AnnualInput, AppSettings, Filing, ReturnSnapshot } from "@/lib/schema";
import { buildAnnualPnl, pnlCsvRows, type AnnualPnl } from "./pnl";
import {
  RECONCILE_HEADERS,
  buildGstReconciliation,
  reconcileCsvRows,
  type ReconcileRow,
} from "./reconcile";

export interface PackFile {
  /** File name without extension (prefixed with a sequence number). */
  name: string;
  title: string;
  headers: string[];
  rows: string[][];
}

export interface TaxPack {
  fyKey: string;
  range: { start: string; end: string };
  metrics: PeriodMetrics;
  pnl: AnnualPnl;
  reconciliation: ReconcileRow[];
  files: PackFile[];
  registers: {
    sales: Register;
    notes: Register;
    expenses: Register;
    income: Register;
    hsn: Register;
  };
  manual: { label: string; value: string }[];
  fixedAssetNote: string;
}

const fromRegister = (name: string, r: Register): PackFile => ({
  name,
  title: r.title,
  headers: r.headers,
  rows: r.rows.length ? [...r.rows, r.totals] : [],
});

export function buildTaxPack(input: {
  data: AnalyticsData;
  settings: AppSettings;
  filings: Filing[];
  snapshots: ReturnSnapshot[];
  fyKey: string;
  annual: AnnualInput | null | undefined;
  today: string;
}): TaxPack {
  const { data, settings, filings, snapshots, fyKey, annual, today } = input;
  const metrics = computeMetrics(data, fyKey, today);
  const pnl = buildAnnualPnl(data, fyKey, annual, today);
  const reconciliation = buildGstReconciliation({
    data,
    settings,
    filings,
    snapshots,
    fyKey,
    today,
  });
  const registers = {
    sales: salesRegister(data, fyKey, today),
    notes: notesRegister(data, fyKey),
    expenses: expenseRegister(data, fyKey),
    income: incomeRegister(data, fyKey),
    hsn: hsnSummary(data, fyKey),
  };
  const tp = annual?.taxPack;
  const manual = [
    {
      label: "TDS deducted by customers from your receipts",
      value: tp?.tdsDeductedByCustomers ?? "",
    },
    { label: "GST TCS collected by e-commerce operators", value: tp?.tcsByEcommerce ?? "" },
    { label: "TDS deducted by you on payments", value: tp?.tdsDeductedByYou ?? "" },
    { label: "Opening stock", value: annual?.pnl.openingStock ?? "" },
    { label: "Closing stock", value: annual?.pnl.closingStock ?? "" },
    { label: "Depreciation", value: annual?.pnl.depreciation ?? "" },
  ];
  const fixedAssetNote = tp?.fixedAssetNote ?? "";

  const files: PackFile[] = [
    fromRegister("01-sales-register", registers.sales),
    fromRegister("02-credit-debit-note-register", registers.notes),
    fromRegister("03-expense-register", registers.expenses),
    fromRegister("04-other-income", registers.income),
    fromRegister("05-hsn-summary", registers.hsn),
    {
      name: "06-gst-reconciliation",
      title: "GST reconciliation: books vs returns filed",
      headers: RECONCILE_HEADERS,
      rows: reconcileCsvRows(reconciliation),
    },
    {
      name: "07-annual-pnl",
      title: "Annual profit and loss (management view)",
      headers: ["Section", "Line", "Amount"],
      rows: pnlCsvRows(pnl),
    },
    {
      name: "08-manual-notes",
      title: "Manual entries: TDS/TCS, stock, depreciation, fixed assets",
      headers: ["Item", "Value / note"],
      rows: [
        ...manual.map((m) => [m.label, m.value]),
        ["Fixed asset note", fixedAssetNote],
        ["Other notes for CA", tp?.notes ?? ""],
      ],
    },
  ];
  return {
    fyKey,
    range: periodRange(fyKey),
    metrics,
    pnl,
    reconciliation,
    files,
    registers,
    manual,
    fixedAssetNote,
  };
}
