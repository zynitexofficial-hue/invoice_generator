"use client";

import { Download, Printer } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";
import { patchAnnualGroup } from "@/db/annual-inputs";
import { useAnnualInput } from "@/db/hooks";
import { useAllReturnSnapshots } from "@/db/hooks-annual";
import { Page } from "@/components/layout/page";
import { ManualInput } from "@/components/returns/annual/annual-table";
import { FySelect } from "@/components/returns/annual/fy-select";
import { usePrintSummary } from "@/components/returns/print-portal";
import { inrFormatter, useAnalyticsSource, StatTile } from "@/components/analytics/shared";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { downloadCsv } from "@/lib/csv";
import { formatDate } from "@/lib/dates";
import { fyKey as fyKeyOf, periodLabel } from "@/lib/period";
import { buildTaxPack } from "@/lib/tax-pack/pack";
import { totalAbsDifference } from "@/lib/tax-pack/reconcile";

const FY_RE = /^FY\d{4}-\d{2}$/;
const DISCLAIMER = "Draft prepared from your records. Verify with your CA before relying on it.";

/** A multi-line note saved when you leave the field. */
function NoteField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <Textarea
        value={draft ?? value}
        maxLength={2000}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft !== value) onSave(draft);
          setDraft(null);
        }}
      />
    </label>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function TaxPackView() {
  const params = useSearchParams();
  const router = useRouter();
  const src = useAnalyticsSource();
  const snapshots = useAllReturnSnapshots();
  const { print, portal } = usePrintSummary();
  const [downloading, setDownloading] = useState(false);

  const today = src.today;
  const raw = params.get("fy") ?? "";
  const fy = FY_RE.test(raw) ? raw : fyKeyOf(today);
  const annual = useAnnualInput(fy);

  const pack = useMemo(
    () =>
      src.settings && src.data && src.filings && snapshots && annual !== undefined
        ? buildTaxPack({
            data: src.data,
            settings: src.settings,
            filings: src.filings,
            snapshots,
            fyKey: fy,
            annual,
            today,
          })
        : undefined,
    [src.settings, src.data, src.filings, snapshots, annual, fy, today],
  );

  if (!src.settings || !pack || !src.invoices) {
    return (
      <Page title="Tax pack" width="narrow">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="mt-4 h-72 w-full rounded-2xl" />
      </Page>
    );
  }

  const settings = src.settings;
  const money = inrFormatter(settings.formats.numberGrouping);
  const dateText = (iso: string) => formatDate(iso, settings.formats.dateFormat);
  const dates = [
    ...src.invoices.map((i) => i.invoiceDate),
    ...(src.data?.expenses.map((e) => e.date) ?? []),
  ];
  const m = pack.metrics;
  const tp = annual?.taxPack;
  const business = settings.profile.legalName || settings.profile.name || "Your business";
  const diffTotal = totalAbsDifference(pack.reconciliation);
  const anyFiled = pack.reconciliation.some((r) => r.filedTaxable !== null || r.filedItc !== null);

  const downloadPack = async () => {
    setDownloading(true);
    try {
      for (const file of pack.files) {
        downloadCsv(`${file.name}-${fy}`, file.headers, file.rows);
        await sleep(500);
      }
    } finally {
      setDownloading(false);
    }
  };

  const printSummary = () => {
    const row = (label: string, value: string): ReactNode => (
      <tr key={label}>
        <td>{label}</td>
        <td className="num">{value}</td>
      </tr>
    );
    print(
      `Tax pack ${fy}`,
      <div>
        <h1>Tax pack for your CA · {periodLabel(fy)}</h1>
        <p className="muted">
          {business}
          {settings.profile.gstin ? ` · GSTIN ${settings.profile.gstin}` : ""} ·{" "}
          {dateText(pack.range.start)} to {dateText(pack.range.end)}
        </p>
        <p className="note">{DISCLAIMER}</p>
        <h2>Profit and loss (management view)</h2>
        <table>
          <tbody>
            {pack.pnl.sales.map((l) => row(l.label, money(l.amount)))}
            {row("Net sales", money(pack.pnl.netSales))}
            {pack.pnl.otherIncome.map((l) => row(`Other income: ${l.label}`, money(l.amount)))}
            {row("Total income", money(pack.pnl.totalIncome))}
            {pack.pnl.expenses.map((l) => row(l.label, money(l.amount)))}
            {row("Total expenses", money(pack.pnl.expensesTotal))}
            {row("Profit (management view)", money(pack.pnl.managementProfit))}
            {pack.pnl.adjustments.map((l) => row(l.label, money(l.amount)))}
            {row("Profit after adjustments", money(pack.pnl.adjustedProfit))}
          </tbody>
        </table>
        <h2>GST for the year</h2>
        <table>
          <tbody>
            {row("Output tax (net of notes)", money(m.outputTax.total))}
            {row("Eligible ITC", money(m.eligibleItc.total.total))}
            {row("Reverse-charge tax paid in cash", money(m.rcmLiability.total))}
            {row("Estimated GST payable", money(m.estimatedGstPayable.total))}
          </tbody>
        </table>
        <h2>GST reconciliation: books vs returns filed</h2>
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>GSTR-1</th>
              <th>GSTR-3B</th>
              <th className="num">Taxable (books)</th>
              <th className="num">Taxable diff</th>
              <th className="num">Tax diff</th>
              <th className="num">ITC diff</th>
            </tr>
          </thead>
          <tbody>
            {pack.reconciliation.map((r) => (
              <tr key={r.periodKey}>
                <td>{r.label}</td>
                <td>{r.gstr1Status}</td>
                <td>{r.gstr3bStatus}</td>
                <td className="num">{money(r.booksTaxable)}</td>
                <td className="num">{r.taxableDiff === null ? "—" : money(r.taxableDiff)}</td>
                <td className="num">{r.outputTaxDiff === null ? "—" : money(r.outputTaxDiff)}</td>
                <td className="num">{r.itcDiff === null ? "—" : money(r.itcDiff)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <h2>Entered by hand</h2>
        <table>
          <tbody>
            {pack.manual.map((x) => row(x.label, x.value ? money(x.value) : "—"))}
            {row("Fixed assets note", pack.fixedAssetNote || "—")}
          </tbody>
        </table>
      </div>,
    );
  };

  const savePnl = (patch: Parameters<typeof patchAnnualGroup<"pnl">>[2]) =>
    void patchAnnualGroup(fy, "pnl", patch);
  const saveTp = (patch: Parameters<typeof patchAnnualGroup<"taxPack">>[2]) =>
    void patchAnnualGroup(fy, "taxPack", patch);

  return (
    <Page
      title="Tax pack"
      width="narrow"
      description="Everything your CA needs for a financial year, in one place."
      actions={
        <>
          <FySelect
            value={fy}
            onChange={(v) => router.replace(`/tax-pack?fy=${v}`, { scroll: false })}
            dates={dates}
            today={today}
          />
          <Button variant="primary" onClick={downloadPack} loading={downloading}>
            <Download aria-hidden />
            Download pack
          </Button>
          <Button variant="secondary" onClick={printSummary}>
            <Printer aria-hidden />
            Print summary
          </Button>
        </>
      }
    >
      <p className="mb-4 text-xs text-muted-foreground">
        {DISCLAIMER} Your browser may ask permission to download several files.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile label="Net sales" value={money(pack.pnl.netSales)} />
        <StatTile label="Expenses" value={money(pack.pnl.expensesTotal)} />
        <StatTile
          label="Profit"
          value={money(pack.pnl.adjustedProfit)}
          note="After your adjustments"
        />
        <StatTile label="Output GST" value={money(m.outputTax.total)} />
        <StatTile label="Eligible ITC" value={money(m.eligibleItc.total.total)} />
        <StatTile label="Estimated GST payable" value={money(m.estimatedGstPayable.total)} />
      </div>

      <div className="mt-4 space-y-4">
        <Card>
          <CardHeader
            title="What is in the pack"
            description="Files download one after another, named with a number and the year."
          />
          <CardContent>
            <ul className="divide-y divide-border text-sm">
              {pack.files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate">{file.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {file.name}-{fy}.csv ·{" "}
                      {Math.max(0, file.rows.length - (file.name < "06" ? 1 : 0))} rows
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => downloadCsv(`${file.name}-${fy}`, file.headers, file.rows)}
                  >
                    <Download aria-hidden />
                    CSV
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Annual profit and loss"
            description="A management view from your invoices, expenses and income entries, with your own stock and depreciation entries below. Not a statutory statement."
          />
          <CardContent className="space-y-3">
            <PnlTable pnl={pack.pnl} money={money} />
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["openingStock", "Opening stock"],
                  ["closingStock", "Closing stock"],
                  ["depreciation", "Depreciation"],
                  ["otherAdjustments", "Other adjustments (positive = extra cost)"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block font-medium">{label}</span>
                  <ManualInput
                    label={label}
                    value={annual?.pnl[key] ?? ""}
                    placeholder="0.00"
                    onCommit={(v) => savePnl({ [key]: v })}
                    className="h-9 text-sm"
                  />
                </label>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="GST reconciliation: books vs returns filed"
            description={
              anyFiled
                ? `Compared with the totals saved when you marked each return filed. Total absolute difference: ${money(diffTotal)}.`
                : "No filed returns with saved totals yet, so only your books are shown. Mark a return filed on the Filing tab to compare."
            }
          />
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[640px] border-collapse text-xs">
                <caption className="sr-only">Books against returns filed</caption>
                <thead className="bg-surface-2 text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-2.5 py-2 text-left font-medium">
                      Period
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-left font-medium">
                      GSTR-1
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-left font-medium">
                      GSTR-3B
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right font-medium">
                      Taxable (books)
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right font-medium">
                      Diff vs filed
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right font-medium">
                      Tax diff
                    </th>
                    <th scope="col" className="px-2.5 py-2 text-right font-medium">
                      ITC diff
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pack.reconciliation.map((r) => (
                    <tr key={r.periodKey} className="border-t border-border/70">
                      <td className="px-2.5 py-1.5">{r.label}</td>
                      <td className="px-2.5 py-1.5">{r.gstr1Status}</td>
                      <td className="px-2.5 py-1.5">{r.gstr3bStatus}</td>
                      <td className="px-2.5 py-1.5 text-right tabular-nums">
                        {money(r.booksTaxable)}
                      </td>
                      <Diff v={r.taxableDiff} money={money} />
                      <Diff v={r.outputTaxDiff} money={money} />
                      <Diff v={r.itcDiff} money={money} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            title="Entered by hand"
            description="The app cannot know these. Fill what applies; they go into the pack and the printed summary."
          />
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              {(
                [
                  ["tdsDeductedByCustomers", "TDS deducted by customers from your receipts"],
                  ["tcsByEcommerce", "GST TCS collected by e-commerce operators"],
                  ["tdsDeductedByYou", "TDS you deducted on payments"],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  <span className="mb-1 block font-medium">{label}</span>
                  <ManualInput
                    label={label}
                    value={tp?.[key] ?? ""}
                    placeholder="0.00"
                    onCommit={(v) => saveTp({ [key]: v })}
                    className="h-9 text-sm"
                  />
                </label>
              ))}
            </div>
            <NoteField
              label="Fixed assets note (additions, disposals, depreciation)"
              value={tp?.fixedAssetNote ?? ""}
              onSave={(v) => saveTp({ fixedAssetNote: v })}
            />
            <NoteField
              label="Other notes for your CA"
              value={tp?.notes ?? ""}
              onSave={(v) => saveTp({ notes: v })}
            />
          </CardContent>
        </Card>

        {pack.metrics.dataCoverage.missingData > 0 && (
          <Alert tone="warning" title="Some records are not counted">
            {pack.metrics.dataCoverage.missingData} document(s) lack a date or an exchange rate, so
            they are missing from every register in this pack.
          </Alert>
        )}
      </div>
      {portal}
    </Page>
  );
}

function Diff({ v, money }: { v: string | null; money: (v: string) => string }) {
  const bad = v !== null && Number(v) !== 0;
  return (
    <td
      className={`px-2.5 py-1.5 text-right tabular-nums ${bad ? "font-medium text-warning-foreground" : ""}`}
    >
      {v === null ? "—" : money(v)}
    </td>
  );
}

function PnlRow({
  label,
  value,
  strong,
  money,
}: {
  label: string;
  value: string;
  strong?: boolean;
  money: (v: string) => string;
}) {
  return (
    <tr className={`border-t border-border/70 ${strong ? "bg-surface-2/60 font-semibold" : ""}`}>
      <th scope="row" className="px-2.5 py-1.5 text-left font-normal">
        {label}
      </th>
      <td className="px-2.5 py-1.5 text-right tabular-nums">{money(value)}</td>
    </tr>
  );
}

function PnlTable({
  pnl,
  money,
}: {
  pnl: ReturnType<typeof buildTaxPack>["pnl"];
  money: (v: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">Annual profit and loss</caption>
        <tbody>
          {pnl.sales.map((l) => (
            <PnlRow money={money} key={l.label} label={l.label} value={l.amount} />
          ))}
          <PnlRow money={money} strong label="Net sales" value={pnl.netSales} />
          {pnl.otherIncome.map((l) => (
            <PnlRow
              money={money}
              key={l.label}
              label={`Other income: ${l.label}`}
              value={l.amount}
            />
          ))}
          <PnlRow money={money} strong label="Total income" value={pnl.totalIncome} />
          {pnl.expenses.map((l) => (
            <PnlRow money={money} key={l.label} label={l.label} value={l.amount} />
          ))}
          <PnlRow money={money} strong label="Total expenses" value={pnl.expensesTotal} />
          <PnlRow
            money={money}
            strong
            label="Profit (management view)"
            value={pnl.managementProfit}
          />
          {pnl.adjustments.map((l) => (
            <PnlRow money={money} key={l.label} label={l.label} value={l.amount} />
          ))}
          <PnlRow
            money={money}
            strong
            label="Profit after adjustments"
            value={pnl.adjustedProfit}
          />
        </tbody>
      </table>
    </div>
  );
}
