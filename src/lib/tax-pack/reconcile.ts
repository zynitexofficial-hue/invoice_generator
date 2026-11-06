/**
 * GST reconciliation for the tax pack: your books for each return period next
 * to what was recorded when the return was marked filed (the totals snapshot
 * saved by the Filing tab). Differences point to documents changed after
 * filing. Draft: verify with your CA.
 */
import { computeMetrics, type AnalyticsData } from "@/lib/analytics";
import { ZERO, toDec } from "@/lib/money";
import { monthsInPeriod, periodLabel, quarterKey } from "@/lib/period";
import { d2 } from "@/lib/analytics";
import type { AppSettings, Filing, ReturnSnapshot } from "@/lib/schema";

export interface ReconcileRow {
  periodKey: string;
  label: string;
  gstr1Status: string;
  gstr3bStatus: string;
  booksTaxable: string;
  filedTaxable: string | null;
  taxableDiff: string | null;
  booksOutputTax: string;
  filedOutputTax: string | null;
  outputTaxDiff: string | null;
  booksItc: string;
  filedItc: string | null;
  itcDiff: string | null;
}

export const RECONCILE_HEADERS = [
  "Period",
  "GSTR-1 status",
  "GSTR-3B status",
  "Books taxable value",
  "Filed taxable value",
  "Difference",
  "Books output tax",
  "Filed output tax",
  "Difference",
  "Books eligible ITC",
  "Filed ITC (4C)",
  "Difference",
];

const STAGE_KEY = "_stage";

/** The snapshot taken when the return was marked filed, else the newest. `snapshots` any order. */
function pickSnapshot(snaps: ReturnSnapshot[]): ReturnSnapshot | undefined {
  const sorted = [...snaps].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return sorted.find((s) => s.totals[STAGE_KEY] === "filed");
}

const diff = (books: string, filed: string | null) =>
  filed === null ? null : d2(toDec(books).minus(toDec(filed)));

export function buildGstReconciliation(input: {
  data: AnalyticsData;
  settings: AppSettings;
  filings: Filing[];
  snapshots: ReturnSnapshot[];
  fyKey: string;
  today: string;
}): ReconcileRow[] {
  const { data, settings, filings, snapshots, fyKey, today } = input;
  const months = monthsInPeriod(fyKey);
  const keys =
    settings.gst.filingFrequency === "qrmp"
      ? [...new Set(months.map((m) => quarterKey(`${m}-01`)))]
      : months;
  return keys.map((key) => {
    const g1 = filings.find((f) => f.id === `${key}:GSTR-1`);
    const g3 = filings.find((f) => f.id === `${key}:GSTR-3B`);
    const m = computeMetrics(data, key, today);
    const snap1 =
      g1?.status === "filed"
        ? pickSnapshot(snapshots.filter((s) => s.filingId === g1.id))
        : undefined;
    const snap3 =
      g3?.status === "filed"
        ? pickSnapshot(snapshots.filter((s) => s.filingId === g3.id))
        : undefined;
    const filedTaxable = snap1?.totals["total.taxable"] ?? null;
    const filedTax1 = snap1
      ? d2(
          toDec(snap1.totals["total.igst"])
            .plus(toDec(snap1.totals["total.cgst"]))
            .plus(toDec(snap1.totals["total.sgst"])),
        )
      : null;
    const filedItc = snap3?.totals["4C.tax"] ?? null;
    return {
      periodKey: key,
      label: periodLabel(key),
      gstr1Status: g1?.status ?? "not recorded",
      gstr3bStatus: g3?.status ?? "not recorded",
      booksTaxable: m.salesRevenue,
      filedTaxable,
      taxableDiff: diff(m.salesRevenue, filedTaxable),
      booksOutputTax: m.outputTax.total,
      filedOutputTax: filedTax1,
      outputTaxDiff: diff(m.outputTax.total, filedTax1),
      booksItc: m.eligibleItc.total.total,
      filedItc,
      itcDiff: diff(m.eligibleItc.total.total, filedItc),
    };
  });
}

export function reconcileCsvRows(rows: ReconcileRow[]): string[][] {
  const dash = (v: string | null) => v ?? "";
  return rows.map((r) => [
    r.label,
    r.gstr1Status,
    r.gstr3bStatus,
    r.booksTaxable,
    dash(r.filedTaxable),
    dash(r.taxableDiff),
    r.booksOutputTax,
    dash(r.filedOutputTax),
    dash(r.outputTaxDiff),
    r.booksItc,
    dash(r.filedItc),
    dash(r.itcDiff),
  ]);
}

/** Total of the non-null differences (for a quick "all matched" indicator). */
export function totalAbsDifference(rows: ReconcileRow[]): string {
  let t = ZERO;
  for (const r of rows)
    for (const d of [r.taxableDiff, r.outputTaxDiff, r.itcDiff])
      if (d !== null) t = t.plus(toDec(d).abs());
  return d2(t);
}
