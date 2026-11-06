"use client";

import { RecurringDueNotice } from "@/components/recurring/recurring-boot";
import {
  ArrowRight,
  ArrowUpRight,
  Building,
  ChevronDown,
  CircleCheck,
  Circle,
  DatabaseBackup,
  Landmark,
  Plus,
  Receipt,
  Clock,
  HandCoins,
  ReceiptText,
  FileSpreadsheet,
  ChartColumn,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import {
  computeMetrics,
  compare,
  dashboardInsights,
  lastNMonths,
  METRIC_DEFINITIONS,
  monthlyTrend,
  receivablesReport,
} from "@/lib/analytics";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { displayStatus, isDraft } from "@/lib/invoice-calc";
import { monthKey, periodLabel, shiftPeriod } from "@/lib/period";
import { CREATABLE_DOC_TYPES, type AppSettings, type Invoice } from "@/lib/schema";
import { cn, plural } from "@/lib/utils";
import {
  FILING_STATUS_LABELS,
  filesGstReturns,
  insightDeadlines,
  nextDeadline,
  num,
} from "@/components/analytics/analytics-model";
import {
  CoverageLine,
  delta,
  inrFormatter,
  InsightList,
  useAnalyticsSource,
} from "@/components/analytics/shared";
import { BarChart, ChartFrame, KpiCard, type CategoryDatum } from "@/components/charts";
import { Page } from "@/components/layout/page";
import { OpenInvoiceFileButton } from "@/components/open-invoice-file";
import { StatusBadge } from "@/components/status-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";

export function HomeView() {
  const router = useRouter();
  const { settings, invoices, data, filings, ready, today } = useAnalyticsSource();
  const month = monthKey(today);

  const dash = useMemo(() => {
    if (!data || !settings || !filings) return null;
    const current = computeMetrics(data, month, today);
    const previous = computeMetrics(data, shiftPeriod(month, -1), today);
    const trend = monthlyTrend(data, lastNMonths(today, 6), today);
    const recv = receivablesReport(data, today);
    const insights = dashboardInsights({
      current,
      previous,
      deadlines: insightDeadlines(settings, filings, data, today),
      todayISO: today,
      previousLabel: "last month",
    });
    return {
      current,
      growth: compare(current, previous),
      trend,
      overdueCount: recv.open.filter((o) => o.overdue).length,
      insights,
      next: nextDeadline(settings, filings, today),
    };
  }, [data, settings, filings, month, today]);

  if (!ready || !settings || !invoices || !dash) return <HomeSkeleton />;

  const name = settings.profile.name.trim();
  const draft = invoices.find((i) => isDraft(i));
  const recent = invoices.slice(0, 6);
  const grouping = settings.formats.numberGrouping;
  const money = inrFormatter(grouping);
  const hasInvoices = invoices.length > 0;
  const c = dash.current;
  const g = dash.growth;
  const spark = (k: "revenue" | "expenses" | "profit") => dash.trend.map((t) => num(t[k]));
  const bars: CategoryDatum[] = dash.trend.map((t) => ({
    key: t.month,
    label: t.label,
    shortLabel: t.shortLabel,
    values: { revenue: num(t.revenue), expenses: num(t.expenses) },
  }));
  const trendEmpty = bars.every((b) => !b.values.revenue && !b.values.expenses);

  return (
    <Page
      title={name ? `Welcome back, ${name.split(" ")[0]}` : "Welcome"}
      description={
        name
          ? `${name} · ${periodLabel(month)} at a glance, from records in this browser.`
          : `${periodLabel(month)} at a glance, from records in this browser.`
      }
      actions={<OpenInvoiceFileButton />}
    >
      <RecurringDueNotice />
      <nav aria-label="Quick actions" className="-mt-2 mb-6 flex flex-wrap gap-2">
        <NewDocumentButton />
        <Button variant="secondary" asChild>
          <Link href="/money?tab=out&new=1">
            <ReceiptText />
            Add expense
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/money?tab=in&new=1">
            <HandCoins />
            Add income
          </Link>
        </Button>
        <Button variant="secondary" asChild>
          <Link href="/returns">
            <FileSpreadsheet />
            GST returns
          </Link>
        </Button>
      </nav>

      {!hasInvoices && <SetupChecklist settings={settings} hasInvoices={hasInvoices} />}

      <section aria-labelledby="this-month">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2 id="this-month" className="text-[15px] font-semibold tracking-[-0.01em]">
            This month
          </h2>
          <Link
            href="/analytics"
            className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:focus-ring"
          >
            <ChartColumn className="size-3.5" aria-hidden="true" />
            Full analytics
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <KpiCard
            label="Sales"
            value={money(c.salesRevenue)}
            delta={delta(g.salesRevenue)}
            deltaLabel="vs last month"
            definition={METRIC_DEFINITIONS.salesRevenue}
            sparkline={spark("revenue")}
            sparklineLabel="Sales, last 6 months"
          />
          <KpiCard
            label="Expenses"
            value={money(c.expenses)}
            delta={delta(g.expenses)}
            deltaLabel="vs last month"
            positiveIsGood={false}
            definition={METRIC_DEFINITIONS.expenses}
            sparkline={spark("expenses")}
            sparklineLabel="Expenses, last 6 months"
          />
          <KpiCard
            label="Net profit"
            value={money(c.netProfit)}
            delta={delta(g.netProfit)}
            deltaLabel="vs last month"
            definition={METRIC_DEFINITIONS.netProfit}
            sparkline={spark("profit")}
            sparklineLabel="Net profit, last 6 months"
          />
          <ReceivablesCard
            outstanding={money(c.receivablesOutstanding)}
            overdue={money(c.receivablesOverdue)}
            overdueCount={dash.overdueCount}
          />
        </div>
        <CoverageLine coverage={c.dataCoverage} className="mt-2" />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <GstCard
          settings={settings}
          money={money}
          payable={c.estimatedGstPayable}
          output={c.outputTax}
          itc={c.eligibleItc.total}
          next={dash.next}
          today={today}
        />
        <Card>
          <CardHeader title="Worth a look" description="The most important things right now." />
          <CardContent>
            <InsightList
              insights={dash.insights}
              empty={
                hasInvoices
                  ? "Nothing needs your attention right now."
                  : "Insights appear once you issue invoices and add expenses."
              }
            />
          </CardContent>
        </Card>
      </div>

      <ChartFrame
        className="mt-4"
        title="Sales vs expenses"
        description="Last 6 months. Click a month to see its details."
        empty={trendEmpty}
        emptyMessage="Your monthly sales and expenses will show here."
        table={{
          headers: ["Month", "Sales (₹)", "Expenses (₹)"],
          rows: dash.trend.map((t) => [t.label, t.revenue, t.expenses]),
        }}
        csvName="sales-vs-expenses-last-6-months"
      >
        <BarChart
          data={bars}
          height={200}
          series={[
            { key: "revenue", label: "Sales" },
            { key: "expenses", label: "Expenses" },
          ]}
          onSelect={(d) => router.push(`/analytics?period=${d.key}`)}
        />
      </ChartFrame>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader
            title="Recent documents"
            action={
              invoices.length > 0 ? (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/history">
                    View all
                    <ArrowRight />
                  </Link>
                </Button>
              ) : undefined
            }
          />
          <CardContent className="px-2 pb-2 sm:px-3">
            {recent.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No invoices yet"
                description="Create your first invoice — it takes about a minute."
                action={
                  <Button variant="primary" asChild>
                    <Link href="/invoice?new=1">
                      <Plus />
                      Create invoice
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {recent.map((inv, i) => (
                  <motion.li
                    key={inv.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.25 }}
                  >
                    <RecentRow
                      invoice={inv}
                      grouping={grouping}
                      dateFormat={settings.formats.dateFormat}
                      today={today}
                    />
                  </motion.li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {draft && (
            <Card className="overflow-hidden">
              <div className="bg-[linear-gradient(135deg,var(--primary-soft),transparent)] p-5">
                <div className="flex items-center gap-2 text-xs font-medium text-primary-soft-foreground">
                  <Clock className="size-3.5" />
                  Continue where you left off
                </div>
                <div className="mt-2 text-base font-semibold">
                  {draft.number || "Untitled draft"}
                </div>
                <div className="text-sm text-muted-foreground">
                  {draft.customer.name || "No customer yet"} · edited{" "}
                  {relativeTime(draft.updatedAt)}
                </div>
                <Button variant="primary" size="sm" className="mt-4" asChild>
                  <Link href={`/invoice?id=${draft.id}`}>
                    Resume draft
                    <ArrowRight />
                  </Link>
                </Button>
              </div>
            </Card>
          )}
          <Card>
            <CardHeader title="Quick links" />
            <CardContent className="grid gap-1 px-3 pb-3">
              <QuickLink
                href="/customers"
                icon={<Building />}
                label="Customers"
                hint="Save details once, reuse everywhere"
              />
              <QuickLink
                href="/templates"
                icon={<Receipt />}
                label="Templates & branding"
                hint="6 templates, colours and fonts"
              />
              <QuickLink
                href="/settings?section=data"
                icon={<DatabaseBackup />}
                label="Back up your data"
                hint={
                  settings.backup.lastBackupAt
                    ? `Last backup ${relativeTime(settings.backup.lastBackupAt)}`
                    : "No backup yet"
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      {hasInvoices && (
        <div className="mt-6">
          <SetupChecklist settings={settings} hasInvoices={hasInvoices} />
        </div>
      )}
    </Page>
  );
}

function ReceivablesCard({
  outstanding,
  overdue,
  overdueCount,
}: {
  outstanding: string;
  overdue: string;
  overdueCount: number;
}) {
  return (
    <Link
      href="/analytics?tab=receivables"
      className="group flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-xs transition-colors hover:border-border-strong focus-visible:focus-ring"
    >
      <span className="flex items-center justify-between text-[13px] font-medium text-muted-foreground">
        To receive
        <ArrowUpRight className="size-4 text-subtle-foreground transition-colors group-hover:text-foreground" />
      </span>
      <span className="truncate text-2xl leading-tight font-semibold tracking-tight tabular-nums">
        {outstanding}
      </span>
      <span
        className={cn(
          "text-xs",
          overdueCount ? "font-medium text-danger-foreground" : "text-muted-foreground",
        )}
      >
        {overdueCount
          ? `${plural(overdueCount, "invoice")} overdue · ${overdue}`
          : "Nothing overdue"}
      </span>
      <span className="text-xs text-muted-foreground">Unpaid balance on issued invoices</span>
    </Link>
  );
}

type Heads = { cgst: string; sgst: string; igst: string; total: string };

function GstCard({
  settings,
  money,
  payable,
  output,
  itc,
  next,
  today,
}: {
  settings: AppSettings;
  money: (v: string) => string;
  payable: Heads;
  output: Heads;
  itc: Heads;
  next: ReturnType<typeof nextDeadline>;
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const detailId = useId();
  if (!filesGstReturns(settings)) {
    return (
      <Card>
        <CardHeader title="GST" />
        <CardContent className="text-sm text-muted-foreground">
          {settings.gst.registrationType === "composition"
            ? "You're set up as a composition taxpayer, so there's no output tax or ITC estimate here."
            : "You're set up as not registered for GST, so there's nothing to estimate or file."}{" "}
          <Link
            href="/settings?section=gst"
            className="font-medium text-primary hover:underline focus-visible:focus-ring"
          >
            GST settings
          </Link>
        </CardContent>
      </Card>
    );
  }
  const days = next ? Math.round((Date.parse(next.dueDate) - Date.parse(today)) / 86_400_000) : 0;
  const rows: [string, keyof Heads][] = [
    ["CGST", "cgst"],
    ["SGST/UTGST", "sgst"],
    ["IGST", "igst"],
  ];
  return (
    <Card>
      <CardHeader
        title="GST this month"
        action={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/returns">
              Returns
              <ArrowRight />
            </Link>
          </Button>
        }
      />
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">Estimated GST payable</div>
          <div className="text-2xl font-semibold tracking-tight tabular-nums">
            {money(payable.total)}
          </div>
          <div className="text-xs text-muted-foreground">
            Output tax {money(output.total)} − eligible ITC {money(itc.total)}
          </div>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((v) => !v)}
            className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:focus-ring"
          >
            {open ? "Hide" : "Show"} by tax head
            <ChevronDown
              className={cn("size-3.5 transition-transform", open && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          <div id={detailId} hidden={!open} className="mt-2 overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">GST by head this month</caption>
              <thead>
                <tr className="text-muted-foreground">
                  <th scope="col" className="py-1 text-left font-medium">
                    Head
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Output
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    ITC
                  </th>
                  <th scope="col" className="py-1 text-right font-medium">
                    Payable
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map(([label, k]) => (
                  <tr key={k} className="border-t border-border">
                    <th scope="row" className="py-1 text-left font-normal">
                      {label}
                    </th>
                    <td className="py-1 text-right tabular-nums">{money(output[k])}</td>
                    <td className="py-1 text-right tabular-nums">{money(itc[k])}</td>
                    <td className="py-1 text-right font-medium tabular-nums">
                      {money(payable[k])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {METRIC_DEFINITIONS.estimatedGstPayable}
            </p>
          </div>
        </div>
        {next && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-surface-2 px-3 py-2 text-sm">
            <span className="font-medium">Next due:</span>
            <span>
              {next.returnType} for {next.periodLabel} ·{" "}
              {formatDate(next.dueDate, settings.formats.dateFormat)}
            </span>
            <span className="text-xs text-muted-foreground">
              ({days === 0 ? "today" : `in ${plural(days, "day")}`})
            </span>
            {next.status && (
              <Badge size="sm" tone={days <= 5 ? "warning" : "neutral"}>
                {FILING_STATUS_LABELS[next.status]}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NewDocumentButton() {
  return (
    <div className="flex">
      <Button variant="primary" asChild className="rounded-r-none">
        <Link href="/invoice?new=1">
          <Plus />
          New invoice
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            className="rounded-l-none border-l border-white/20 px-2"
            aria-label="Choose document type"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>New document</DropdownMenuLabel>
          {CREATABLE_DOC_TYPES.map((t) => (
            <DropdownMenuItem key={t} asChild>
              <Link href={`/invoice?new=1&type=${t}`} className="!items-start">
                <span>
                  <span className="block font-medium">{DOC_TYPE_META[t].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {DOC_TYPE_META[t].description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function RecentRow({
  invoice: inv,
  grouping,
  dateFormat,
  today,
}: {
  invoice: Invoice;
  grouping: "indian" | "international";
  dateFormat: Parameters<typeof formatDate>[1];
  today: string;
}) {
  return (
    <Link
      href={`/invoice?id=${inv.id}`}
      className="group flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-surface-2 focus-visible:focus-ring"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-xs font-semibold text-muted-foreground ring-1 ring-border">
        {(inv.customer.name || inv.customer.company || "?").slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">
            {inv.customer.name || inv.customer.company || "No customer"}
          </span>
          <StatusBadge status={displayStatus(inv, today)} docType={inv.docType} />
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {inv.number} · {DOC_TYPE_META[inv.docType].shortLabel} ·{" "}
          {formatDate(inv.invoiceDate, dateFormat)}
        </div>
      </div>
      <div className="text-right">
        <div className="text-sm font-semibold tabular-nums">
          {formatMoney(inv.summary.grandTotal, inv.currency, grouping)}
        </div>
      </div>
      <ArrowUpRight className="size-4 text-subtle-foreground opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

function QuickLink({
  href,
  icon,
  label,
  hint,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-surface-2 focus-visible:focus-ring"
    >
      <span className="flex size-9 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground ring-1 ring-border transition-colors group-hover:text-primary [&_svg]:size-4">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        <span className="block truncate text-xs text-muted-foreground">{hint}</span>
      </span>
      <ArrowRight className="size-4 text-subtle-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function SetupChecklist({
  settings,
  hasInvoices,
}: {
  settings: AppSettings;
  hasInvoices: boolean;
}) {
  const p = settings.profile;
  const steps = [
    {
      done: Boolean(p.name.trim() && p.address.trim()),
      label: "Add your business details",
      href: "/settings?section=business",
      icon: <Building />,
    },
    {
      done: Boolean(p.bank.accountNumber.trim() || p.upiId.trim()),
      label: "Add bank or UPI details",
      href: "/settings?section=payments",
      icon: <Landmark />,
    },
    {
      done: hasInvoices,
      label: "Create your first invoice",
      href: "/invoice?new=1",
      icon: <Receipt />,
    },
    {
      done: Boolean(settings.backup.lastBackupAt),
      label: "Download a backup",
      href: "/settings?section=data",
      icon: <DatabaseBackup />,
    },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;
  return (
    <Card className="mb-6 overflow-hidden">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <div className="sm:w-56">
          <div className="text-sm font-semibold">Get set up</div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {done} of {steps.length} done
          </div>
          <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-surface-3">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${(done / steps.length) * 100}%` }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
        </div>
        <ul className="grid flex-1 gap-2 sm:grid-cols-2">
          {steps.map((s) => (
            <li key={s.label}>
              <Link
                href={s.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-sm transition-colors focus-visible:focus-ring",
                  s.done
                    ? "border-transparent bg-surface-2/60 text-muted-foreground line-through decoration-subtle-foreground/50"
                    : "border-border hover:border-primary/40 hover:bg-primary-soft/40",
                )}
              >
                {s.done ? (
                  <CircleCheck className="size-4 text-success" />
                ) : (
                  <Circle className="size-4 text-subtle-foreground" />
                )}
                {s.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function HomeSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-6 lg:px-10 lg:pt-10">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="mt-3 h-4 w-80 max-w-full" />
      <div className="mt-6 flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-9 w-32" />
        ))}
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="mt-4 h-64 rounded-xl" />
    </div>
  );
}
