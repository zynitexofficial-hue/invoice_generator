"use client";

import { Printer } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { compare, computeMetrics, METRIC_DEFINITIONS } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { Page } from "@/components/layout/page";
import { PeriodFilter } from "@/components/money/period-filter";
import type { PeriodSelection } from "@/components/money/money-data";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs";
import {
  ANALYTICS_TAB_LABELS,
  ANALYTICS_TABS,
  COMPARE_LABELS,
  COMPARE_MODES,
  compareText,
  fromSelection,
  parseCompare,
  parsePeriodParam,
  parseTab,
  resolveCompare,
  withPeriod,
  type AnalyticsTab,
  type CompareMode,
} from "./analytics-model";
import { CollectionsTab } from "./collections-tab";
import type { TabContext } from "./context";
import { ExpensesTab } from "./expenses-tab";
import { GstTab } from "./gst-tab";
import { ItcTab } from "./itc-tab";
import { OverviewTab } from "./overview-tab";
import { PayablesTab } from "./payables-tab";
import { useAnalyticsPrint, type PrintJob } from "./print-report";
import { ReceivablesTab } from "./receivables-tab";
import { RegistersTab } from "./registers-tab";
import { SalesTab } from "./sales-tab";
import { YoyTab } from "./yoy-tab";
import { DISCLAIMER, inrFormatter, pctText, useAnalyticsSource } from "./shared";

/** Update the query string without a navigation (keeps useSearchParams in sync). */
function setParams(patch: Record<string, string | null>) {
  const qs = new URLSearchParams(window.location.search);
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === "") qs.delete(k);
    else qs.set(k, v);
  }
  const s = qs.toString();
  window.history.replaceState(null, "", s ? `?${s}` : window.location.pathname);
}

export function AnalyticsView() {
  const params = useSearchParams();
  const { settings, data, filings, ready, today } = useAnalyticsSource();
  const dateFormat = settings?.formats.dateFormat ?? "dd/MM/yyyy";
  const fmtDate = useCallback((iso: string) => formatDate(iso, dateFormat), [dateFormat]);

  const tab = parseTab(params.get("tab"));
  const compareMode = parseCompare(params.get("compare"));
  const periodParam = params.get("period");
  const period = useMemo(
    () => parsePeriodParam(periodParam, today, fmtDate),
    [periodParam, today, fmtDate],
  );
  const compareSelector = useMemo(
    () => resolveCompare(period.selector, compareMode),
    [period.selector, compareMode],
  );
  const vsText = compareText(period.selector, compareMode, today);

  const metrics = useMemo(() => {
    if (!data) return null;
    const current = computeMetrics(data, period.selector, today);
    const previous = compareSelector ? computeMetrics(data, compareSelector, today) : null;
    return { current, previous, growth: previous ? compare(current, previous) : null };
  }, [data, period.selector, compareSelector, today]);

  const { print: printJob, node: printNode } = useAnalyticsPrint();
  const grouping = settings?.formats.numberGrouping ?? "indian";
  const money = useMemo(() => inrFormatter(grouping), [grouping]);

  const onPeriodChange = (next: PeriodSelection) => {
    // Switching to "Custom" starts from the dates currently shown.
    const sel =
      next.preset === "custom" && !next.from && !next.to && period.selection.preset !== "custom"
        ? { preset: "custom" as const, from: period.range.start, to: period.range.end }
        : next;
    setParams({ period: fromSelection(sel, today).param });
  };

  const hrefFor = useCallback(
    (href: string) => withPeriod(href, period.param, compareMode),
    [period.param, compareMode],
  );

  if (!ready || !settings || !data || !filings || !metrics) return <AnalyticsSkeleton />;

  const print = (job: Omit<PrintJob, "businessName" | "gstin" | "periodLabel">) =>
    printJob({
      ...job,
      businessName: settings.profile.name,
      gstin: settings.profile.gstin,
      periodLabel: period.label,
    });

  const ctx: TabContext = {
    data,
    settings,
    filings,
    today,
    period,
    compareMode,
    compareSelector,
    compareLabel: vsText ? `vs ${vsText}` : null,
    current: metrics.current,
    previous: metrics.previous,
    growth: metrics.growth,
    money,
    hrefFor,
    goToPeriod: (p) => setParams({ period: p }),
    print,
  };

  const printSummary = () => {
    const c = metrics.current;
    const p = metrics.previous;
    const row = (label: string, cur: string, prev: string | undefined, isMoney = true) => [
      label,
      isMoney ? money(cur) : cur,
      prev === undefined ? "" : isMoney ? money(prev) : prev,
    ];
    print({
      title: "Business summary",
      coverage: c.dataCoverage,
      sections: [
        {
          title: "Key figures",
          headers: ["Metric", period.label, vsText ? `Compared (${vsText})` : ""],
          numeric: [false, true, true],
          rows: [
            row("Sales revenue", c.salesRevenue, p?.salesRevenue),
            row("Other income", c.otherIncome, p?.otherIncome),
            row("Expenses", c.expenses, p?.expenses),
            row("Net profit", c.netProfit, p?.netProfit),
            row("Net margin", pctText(c.netMargin), p ? pctText(p.netMargin) : undefined, false),
            row("Output tax", c.outputTax.total, p?.outputTax.total),
            row("Eligible ITC", c.eligibleItc.total.total, p?.eligibleItc.total.total),
            row("Estimated GST payable", c.estimatedGstPayable.total, p?.estimatedGstPayable.total),
            row("Receivables outstanding (today)", c.receivablesOutstanding, undefined),
            row("Receivables overdue (today)", c.receivablesOverdue, undefined),
          ],
        },
      ],
    });
  };

  return (
    <Page
      width="wide"
      title="Analytics"
      description={`${period.label}${vsText ? ` · compared with ${vsText}` : ""}`}
      actions={
        <Button variant="secondary" onClick={printSummary}>
          <Printer />
          Print summary
        </Button>
      }
    >
      <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <PeriodFilter
          value={period.selection}
          onChange={onPeriodChange}
          dateFormat={dateFormat}
          className="w-full sm:w-auto"
        />
        <div className="flex w-full items-center gap-2 sm:w-auto">
          <span className="shrink-0 text-xs text-muted-foreground">Compare to</span>
          <Select<CompareMode>
            value={compareMode}
            onValueChange={(v) => setParams({ compare: v === "previous" ? null : v })}
            options={COMPARE_MODES.map((m) => ({ value: m, label: COMPARE_LABELS[m] }))}
            className="w-full sm:w-52"
            aria-label="Compare to"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "overview" ? null : v })}>
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <TabsList
            aria-label="Analytics sections"
            value={tab}
            className="min-w-max"
            tabs={ANALYTICS_TABS.map((t) => ({ value: t, label: ANALYTICS_TAB_LABELS[t] }))}
          />
        </div>
        <TabsContent value={tab} className="pt-5 outline-none">
          <TabBody tab={tab} ctx={ctx} />
        </TabsContent>
      </Tabs>

      <p className="mt-8 text-xs text-subtle-foreground">
        {DISCLAIMER} {METRIC_DEFINITIONS.growth}
      </p>
      {printNode}
    </Page>
  );
}

function TabBody({ tab, ctx }: { tab: AnalyticsTab; ctx: TabContext }) {
  switch (tab) {
    case "overview":
      return <OverviewTab ctx={ctx} />;
    case "sales":
      return <SalesTab ctx={ctx} />;
    case "expenses":
      return <ExpensesTab ctx={ctx} />;
    case "gst":
      return <GstTab ctx={ctx} />;
    case "receivables":
      return <ReceivablesTab ctx={ctx} />;
    case "registers":
      return <RegistersTab ctx={ctx} />;
    case "collections":
      return <CollectionsTab ctx={ctx} />;
    case "payables":
      return <PayablesTab ctx={ctx} />;
    case "itc":
      return <ItcTab ctx={ctx} />;
    case "yoy":
      return <YoyTab ctx={ctx} />;
  }
}

export function AnalyticsSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="mt-3 h-4 w-64" />
      <Skeleton className="mt-6 h-9 w-full max-w-md" />
      <Skeleton className="mt-5 h-10 w-full" />
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-5 h-72 rounded-xl" />
    </div>
  );
}
