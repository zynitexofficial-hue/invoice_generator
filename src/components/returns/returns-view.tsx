"use client";

import { FileText } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { useExpenses, useFilings, useInvoices, useReturnSnapshots, useSettings } from "@/db/hooks";
import { formatDate, todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { checkGstin } from "@/lib/gst/gstin";
import {
  buildGstr1,
  buildGstr3b,
  dueDate,
  settingsStateCode,
  upcomingDeadlines,
} from "@/lib/gst/returns";
import { currentPeriod } from "@/lib/period";
import { filingId, type AppSettings, type Expense, type Invoice } from "@/lib/schema";
import { Page } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import { FilingTab, type FilingItem } from "./filing-tab";
import { Gstr1Tab, type Formatters } from "./gstr1-tab";
import { Gstr3bTab } from "./gstr3b-tab";
import { PeriodBar, StatusCard } from "./period-bar";
import { usePrintSummary } from "./print-portal";
import {
  cashPayableTotal,
  defaultPeriod,
  filedSnapshot,
  filingStep,
  gstr1SnapshotRecords,
  gstr1SnapshotTotals,
  gstr3bSnapshotTotals,
  parsePeriodParam,
  parseTab,
  periodKindFor,
  returnTitle,
  type ReturnsTab,
} from "./returns-data";
import { ChangedSinceFiledCard, DeadlinesCard, NotApplicableCard } from "./side-cards";
import { diffSnapshot, mergeChanges } from "./snapshot-diff";

const DRAFT_BANNER = "Draft prepared from your records — verify on the GST portal or with your CA.";

function DraftBanner() {
  return (
    <p className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-surface-2/60 px-3 py-2 text-xs text-muted-foreground">
      <FileText className="size-3.5 shrink-0" aria-hidden />
      {DRAFT_BANNER}
    </p>
  );
}

/**
 * Builds are memoized on their inputs (a separate hook so the memo keys are
 * plain parameters, which the React Compiler can preserve).
 */
function useReturnBuilds(
  invoices: Invoice[] | undefined,
  expenses: Expense[] | undefined,
  settings: AppSettings | undefined,
  period: string,
  today: string,
) {
  const gstr1 = useMemo(
    () =>
      settings && invoices && period
        ? buildGstr1({ invoices, settings, periodKey: period })
        : undefined,
    [invoices, settings, period],
  );
  const gstr3b = useMemo(
    () =>
      settings && invoices && expenses && period
        ? buildGstr3b({ invoices, expenses, settings, periodKey: period })
        : undefined,
    [invoices, expenses, settings, period],
  );
  const deadlines = useMemo(
    () => (settings ? upcomingDeadlines(settings, today, 4) : []),
    [settings, today],
  );

  return { gstr1, gstr3b, deadlines };
}

export function ReturnsView() {
  const params = useSearchParams();
  const router = useRouter();
  const settings = useSettings();
  const invoices = useInvoices();
  const expenses = useExpenses();
  const filings = useFilings();
  const today = todayISO();
  const { print, portal } = usePrintSummary();

  const frequency = settings?.gst.filingFrequency ?? "monthly";
  const stateCode = settings ? settingsStateCode(settings) : "";
  const period = settings
    ? (parsePeriodParam(params.get("period"), frequency) ??
      defaultPeriod(frequency, stateCode, today))
    : "";
  const tab = parseTab(params.get("tab"));

  const g1Id = period ? filingId(period, "GSTR-1") : undefined;
  const g3Id = period ? filingId(period, "GSTR-3B") : undefined;
  const g1Snapshots = useReturnSnapshots(g1Id);
  const g3Snapshots = useReturnSnapshots(g3Id);

  const { gstr1, gstr3b, deadlines } = useReturnBuilds(invoices, expenses, settings, period, today);

  const grouping = settings?.formats.numberGrouping;
  const dateFormat = settings?.formats.dateFormat;
  const money = useCallback((v: string) => formatMoney(v, "INR", grouping), [grouping]);
  const date = useCallback(
    (iso: string) => (dateFormat ? formatDate(iso, dateFormat) : iso),
    [dateFormat],
  );
  const f: Formatters = useMemo(() => ({ money, date }), [money, date]);

  const setQuery = (next: { period?: string; tab?: ReturnsTab }) => {
    const q = new URLSearchParams(params.toString());
    if (next.period) q.set("period", next.period);
    if (next.tab) q.set("tab", next.tab);
    router.replace(`/returns?${q.toString()}`, { scroll: false });
  };

  const g1Filing = filings?.find((x) => x.id === g1Id);
  const g3Filing = filings?.find((x) => x.id === g3Id);

  const changes = useMemo(() => {
    const diffs = [];
    if (gstr1 && g1Filing?.status === "filed") {
      const snap = filedSnapshot(g1Snapshots);
      if (snap) diffs.push(diffSnapshot(snap.records, gstr1SnapshotRecords(gstr1)));
    }
    if (gstr3b && g3Filing?.status === "filed") {
      const snap = filedSnapshot(g3Snapshots);
      if (snap) diffs.push(diffSnapshot(snap.records, gstr3b.recordHashes));
    }
    return mergeChanges(diffs);
  }, [gstr1, gstr3b, g1Filing, g3Filing, g1Snapshots, g3Snapshots]);

  if (!settings || !invoices || !expenses || !filings || !gstr1 || !gstr3b) {
    return (
      <Page title="GST Returns" width="wide">
        <Skeleton className="h-9 w-full rounded-lg" />
        <Skeleton className="mt-4 h-10 w-72 rounded-xl" />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-28 rounded-2xl" />
          <Skeleton className="h-28 rounded-2xl" />
        </div>
        <Skeleton className="mt-6 h-96 w-full rounded-2xl" />
      </Page>
    );
  }

  const regType = settings.gst.registrationType;
  const gstin = settings.profile.gstin.trim();
  const notApplicable =
    regType === "composition"
      ? "composition"
      : regType === "unregistered"
        ? "unregistered"
        : !gstin
          ? "no_gstin"
          : !checkGstin(gstin).valid
            ? "bad_gstin"
            : null;

  if (notApplicable) {
    return (
      <Page title="GST Returns" width="narrow">
        <DraftBanner />
        <NotApplicableCard kind={notApplicable} />
      </Page>
    );
  }

  const kind = periodKindFor(frequency);
  const opts = { frequency, stateCode };
  const g1Due = dueDate("GSTR-1", period, opts);
  const g3Due = dueDate("GSTR-3B", period, opts);
  const g1Step = filingStep(g1Filing, !gstr1.hasErrors);
  const g3Step = filingStep(g3Filing, !gstr3b.hasErrors);
  const filedDates = [g1Filing, g3Filing]
    .filter((x) => x?.status === "filed" && x.filedAt)
    .map((x) => x!.filedAt.slice(0, 10))
    .sort();

  const filingItems: FilingItem[] = [
    {
      type: "GSTR-1",
      title: returnTitle("GSTR-1", frequency),
      due: g1Due,
      step: g1Step,
      filing: g1Filing,
      cashTax: "0",
      snapshot: () => ({
        records: gstr1SnapshotRecords(gstr1),
        totals: gstr1SnapshotTotals(gstr1, "filed"),
      }),
    },
    {
      type: "GSTR-3B",
      title: returnTitle("GSTR-3B", frequency),
      due: g3Due,
      step: g3Step,
      filing: g3Filing,
      cashTax: cashPayableTotal(gstr3b),
      snapshot: () => ({
        records: gstr3b.recordHashes,
        totals: gstr3bSnapshotTotals(gstr3b, "filed"),
      }),
    },
  ];

  const deadlinesCard = <DeadlinesCard deadlines={deadlines} filings={filings} formatDate={date} />;

  return (
    <Page
      title="GST Returns"
      width="wide"
      description="GSTR-1 and GSTR-3B prepared from your invoices and expenses."
    >
      <DraftBanner />
      {changes.length > 0 && (
        <div className="mb-4">
          <ChangedSinceFiledCard
            changes={changes}
            filedOn={filedDates[0] ?? ""}
            invoices={invoices}
            expenses={expenses}
            formatDate={date}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <PeriodBar
            period={period}
            current={currentPeriod(kind, today)}
            kindLabel={kind === "quarter" ? "quarter" : "month"}
            onChange={(p) => setQuery({ period: p })}
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <StatusCard
              today={today}
              formatDate={date}
              data={{
                title: returnTitle("GSTR-1", frequency),
                hint:
                  frequency === "qrmp"
                    ? "Sales for the quarter. IFF for months 1–2 is optional."
                    : "Sales details",
                due: g1Due,
                step: g1Step,
              }}
            />
            <StatusCard
              today={today}
              formatDate={date}
              data={{
                title: returnTitle("GSTR-3B", frequency),
                hint:
                  frequency === "qrmp"
                    ? "Summary and tax payment (pay monthly via PMT-06)"
                    : "Summary and tax payment",
                due: g3Due,
                step: g3Step,
              }}
            />
          </div>

          <Tabs
            value={tab}
            onValueChange={(t) => setQuery({ tab: t as ReturnsTab })}
            className="mt-6"
          >
            <TabsList
              aria-label="Return"
              value={tab}
              className="mb-4"
              tabs={[
                { value: "gstr1", label: "GSTR-1" },
                { value: "gstr3b", label: "GSTR-3B" },
                { value: "filing", label: "Filing" },
              ]}
            />
            <TabsContent value="gstr1" className="outline-none">
              <Gstr1Tab
                result={gstr1}
                invoices={invoices}
                filing={g1Filing}
                due={g1Due}
                f={f}
                onPrint={print}
              />
            </TabsContent>
            <TabsContent value="gstr3b" className="outline-none">
              <Gstr3bTab
                result={gstr3b}
                gstin={gstr1.gstin}
                invoices={invoices}
                filing={g3Filing}
                due={g3Due}
                f={f}
                onPrint={print}
              />
            </TabsContent>
            <TabsContent value="filing" className="outline-none">
              <FilingTab
                // Remount per period so the estimator inputs start fresh.
                key={period}
                items={filingItems}
                period={period}
                today={today}
                aato={settings.gst.aato}
                dateFormat={settings.formats.dateFormat}
                f={f}
              />
            </TabsContent>
          </Tabs>
        </div>
        <aside className="min-w-0 lg:pt-0">{deadlinesCard}</aside>
      </div>
      {portal}
    </Page>
  );
}
