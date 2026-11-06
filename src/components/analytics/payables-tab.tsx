"use client";

import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  useExpenses,
  useIncomes,
  useInvoices,
  usePayments,
  usePurchases,
  useVendors,
} from "@/db/hooks";
import { cashFlowReport, cashOutlook } from "@/lib/analytics/cash-flow";
import { cashInFromLedger } from "@/lib/analytics/cash-in-source";
import {
  CONCENTRATION_THRESHOLD,
  MSME_DAYS,
  openBills,
  payablesReport,
  vendorConcentration,
  type PayableBucket,
} from "@/lib/analytics/payables";
import { openInvoices } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { settingsStateCode } from "@/lib/gst/returns";
import { plural } from "@/lib/utils";
import { BarChart, ChartFrame, StackedBar } from "@/components/charts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { num } from "./analytics-model";
import type { TabContext } from "./context";
import { pctText, StatTile } from "./shared";

const DEF = {
  payables:
    "What you owe vendors: the unpaid balance on purchase bills dated up to today. Vendor opening balances are shown separately.",
  overdue: "The part of payables whose due date (bill date when none is set) has passed.",
  moneyIn:
    "Money actually received in the period: customer payments recorded on invoices plus other income, on the date received.",
  moneyOut:
    "Money actually paid in the period: expenses marked paid plus payments recorded on purchase bills, on the date paid. Partly paid expenses are left out because the amount paid isn't recorded.",
  net: "Money in minus money out for the period.",
  closing:
    "Net of every payment recorded up to the end of the period. The app has no bank balance, so this is a running total of recorded movements, not your bank statement.",
};

export function PayablesTab({ ctx }: { ctx: TabContext }) {
  const purchases = usePurchases();
  const vendors = useVendors();
  const invoices = useInvoices();
  const expenses = useExpenses();
  const incomes = useIncomes();
  const payments = usePayments();
  if (!purchases || !vendors || !invoices || !expenses || !incomes || !payments)
    return <Skeleton className="h-96 w-full rounded-2xl" />;
  return (
    <Loaded
      ctx={ctx}
      purchases={purchases}
      vendors={vendors}
      invoices={invoices}
      expenses={expenses}
      incomes={incomes}
      payments={payments}
    />
  );
}

function Loaded({
  ctx,
  purchases,
  vendors,
  invoices,
  expenses,
  incomes,
  payments,
}: {
  ctx: TabContext;
  purchases: NonNullable<ReturnType<typeof usePurchases>>;
  vendors: NonNullable<ReturnType<typeof useVendors>>;
  invoices: NonNullable<ReturnType<typeof useInvoices>>;
  expenses: NonNullable<ReturnType<typeof useExpenses>>;
  incomes: NonNullable<ReturnType<typeof useIncomes>>;
  payments: NonNullable<ReturnType<typeof usePayments>>;
}) {
  const { data, today, money, settings, period } = ctx;
  const [bucket, setBucket] = useState<PayableBucket | null>(null);
  const fmt = (iso: string) => formatDate(iso, settings.formats.dateFormat);

  const report = useMemo(
    () => payablesReport(purchases, vendors, today),
    [purchases, vendors, today],
  );
  const concentration = useMemo(
    () => vendorConcentration(purchases, period.selector, 8),
    [purchases, period.selector],
  );
  const shownBills = bucket
    ? report.open.filter((b) => bucket.billIds.includes(b.id))
    : report.open;

  const sellerState = settingsStateCode(settings);
  const flow = useMemo(
    () =>
      cashFlowReport(
        {
          receipts: cashInFromLedger(invoices, payments, sellerState),
          incomes,
          expenses,
          purchases,
        },
        period.range,
      ),
    [invoices, payments, incomes, expenses, purchases, sellerState, period.range],
  );
  const outlook = useMemo(
    () =>
      cashOutlook(
        openInvoices(data, today).map((o) => ({ dueDate: o.dueDate, balance: o.balance })),
        openBills(purchases, vendors, today).map((b) => ({
          dueDate: b.dueDate,
          balance: b.balance,
        })),
        today,
      ),
    [data, purchases, vendors, today],
  );

  const breached = report.msmeAlerts.filter((a) => a.severity === "breached").length;

  return (
    <div className="space-y-6">
      <section aria-labelledby="payables-h" className="space-y-4">
        <div>
          <h2 id="payables-h" className="text-base font-semibold">
            Payables
          </h2>
          <p className="text-xs text-muted-foreground">
            As of today ({fmt(today)}), for all purchase bills, whatever period is selected.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatTile
            label="You owe vendors"
            value={money(report.outstanding)}
            definition={DEF.payables}
            note={plural(report.open.length, "open bill")}
          />
          <StatTile
            label="Overdue"
            value={money(report.overdue)}
            definition={DEF.overdue}
            tone={num(report.overdue) > 0 ? "danger" : "default"}
            note={
              num(report.overdue) > 0
                ? `${pctText(report.overdueShare)} of what you owe`
                : "Nothing overdue"
            }
          />
          <StatTile
            label="Not yet due"
            value={money(report.notYetDue)}
            note="Within payment terms"
          />
        </div>
        {num(report.openingBalances) > 0 && (
          <p className="text-xs text-muted-foreground">
            Not included above: {money(report.openingBalances)} of opening balances owed to vendors
            (see each vendor&apos;s statement).
          </p>
        )}

        {report.msmeAlerts.length > 0 && (
          <Alert
            tone={breached ? "danger" : "warning"}
            icon={<AlertTriangle />}
            title={
              breached
                ? `${plural(breached, "MSME bill")} unpaid past ${MSME_DAYS} days`
                : "MSME bills close to the 45-day deadline"
            }
          >
            <p className="mb-1.5">
              Payments to micro and small enterprises are due within {MSME_DAYS} days of the bill.
              After that the expense may not be deductible this year (Income-tax Act s.43B(h)) —
              check with your CA.
            </p>
            <ul className="space-y-0.5">
              {report.msmeAlerts.slice(0, 8).map((a) => (
                <li key={a.billId} className="tabular-nums">
                  {a.vendorName}
                  {a.billNo ? ` · bill ${a.billNo}` : ""} · {money(a.balance)} ·{" "}
                  {a.daysLeft < 0
                    ? `${-a.daysLeft} days past the deadline (${fmt(a.deadline)})`
                    : `${a.daysLeft} days left (${fmt(a.deadline)})`}
                </li>
              ))}
            </ul>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartFrame
            title="Payables ageing"
            description="Unpaid balance by days past the due date; click a band to filter the list."
            empty={!num(report.outstanding)}
            emptyMessage="You don't owe any vendor right now."
            table={{
              headers: ["Age", "Amount (₹)", "Bills"],
              rows: report.buckets.map((b) => [b.label, b.amount, b.count]),
              totals: ["Total", report.outstanding, report.open.length],
            }}
            csvName={`payables-ageing-${today}`}
          >
            <StackedBar
              data={report.buckets.map((b) => ({
                key: b.key,
                label: b.label,
                value: num(b.amount),
              }))}
              selectedKey={bucket?.key ?? null}
              onSelect={(d) => {
                const b = report.buckets.find((x) => x.key === d.key) ?? null;
                setBucket((cur) => (cur?.key === d.key ? null : b));
              }}
            />
          </ChartFrame>

          <ChartFrame
            title="Top vendors"
            description={`Spend by vendor in ${period.label}.`}
            summary={
              concentration.concentrated
                ? `${concentration.vendors[0].name} is ${pctText(concentration.topShare)} of your spend — more than ${CONCENTRATION_THRESHOLD}%. Relying on one vendor is a supply risk.`
                : concentration.topShare
                  ? `Your biggest vendor is ${pctText(concentration.topShare)} of spend; the top three are ${pctText(concentration.top3Share)}.`
                  : undefined
            }
            empty={!concentration.vendors.length}
            emptyMessage="No purchase bills in this period."
            table={{
              headers: ["Vendor", "Spend (₹)", "Share (%)", "Bills"],
              rows: concentration.vendors.map((v) => [v.name, v.total, v.share, v.count]),
              totals: ["Total", concentration.total, "100.00", ""],
            }}
            csvName={`top-vendors-${period.param}`}
          >
            <ul className="space-y-2">
              {concentration.vendors.map((v) => (
                <li key={v.key}>
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-medium">{v.name}</span>
                    <span className="tabular-nums">
                      {money(v.total)}{" "}
                      <span className="text-muted-foreground">({pctText(v.share)})</span>
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${Math.min(100, num(v.share))}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </ChartFrame>
        </div>

        <Card>
          <CardHeader
            title="Open bills"
            action={
              bucket ? (
                <Button
                  variant="soft"
                  size="xs"
                  onClick={() => setBucket(null)}
                  aria-label={`Clear filter ${bucket.label}`}
                >
                  Age: {bucket.label}
                  <X aria-hidden="true" />
                </Button>
              ) : (
                <Button variant="secondary" size="xs" asChild>
                  <Link href="/money?tab=bills">Manage bills</Link>
                </Button>
              )
            }
          />
          <CardContent>
            {shownBills.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open bills.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Open purchase bills, most overdue first</caption>
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-3 font-medium">Vendor</th>
                      <th className="py-2 pr-3 font-medium">Bill</th>
                      <th className="py-2 pr-3 font-medium">Due</th>
                      <th className="py-2 pr-3 text-right font-medium">Days late</th>
                      <th className="py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownBills.slice(0, 50).map((b) => (
                      <tr key={b.id} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3">{b.vendorName}</td>
                        <td className="py-2 pr-3 text-muted-foreground">{b.billNo || "—"}</td>
                        <td className="py-2 pr-3 whitespace-nowrap tabular-nums">
                          {fmt(b.dueDate)}
                        </td>
                        <td
                          className={`py-2 pr-3 text-right tabular-nums ${b.overdue ? "text-danger-foreground" : "text-muted-foreground"}`}
                        >
                          {b.overdue ? b.daysPastDue : "—"}
                        </td>
                        <td className="py-2 text-right font-medium tabular-nums">
                          {money(b.balance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {shownBills.length > 50 && (
                  <p className="pt-2 text-xs text-muted-foreground">
                    Showing 50 of {shownBills.length}. Open Bills &amp; vendors for the full list.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="cash-h" className="space-y-4">
        <div>
          <h2 id="cash-h" className="text-base font-semibold">
            Cash flow
          </h2>
          <p className="text-xs text-muted-foreground">
            What was actually received and paid in {period.label}, not what was billed.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Money in" value={money(flow.totals.moneyIn)} definition={DEF.moneyIn} />
          <StatTile
            label="Money out"
            value={money(flow.totals.moneyOut)}
            definition={DEF.moneyOut}
          />
          <StatTile
            label="Net"
            value={money(flow.totals.net)}
            definition={DEF.net}
            tone={num(flow.totals.net) < 0 ? "danger" : "default"}
          />
          <StatTile
            label="Closing (recorded)"
            value={money(flow.totals.closing)}
            definition={DEF.closing}
            note={`Opening ${money(flow.totals.opening)}`}
          />
        </div>
        {flow.partialExpenses.count > 0 && (
          <p className="text-xs text-muted-foreground">
            {plural(flow.partialExpenses.count, "partly paid expense")} (
            {money(flow.partialExpenses.total)}) left out, as the amount paid isn&apos;t recorded.
            Mark them paid to include them.
          </p>
        )}

        <ChartFrame
          title="Money in and out by month"
          description="Hover or tab to a bar for the exact figures."
          empty={!num(flow.totals.moneyIn) && !num(flow.totals.moneyOut)}
          emptyMessage="No payments received or made in this period."
          table={{
            headers: [
              "Month",
              "Customer receipts",
              "Other income",
              "Money in",
              "Expenses paid",
              "Bill payments",
              "Money out",
              "Net",
              "Opening",
              "Closing",
            ],
            rows: flow.months.map((m) => [
              m.label,
              m.receipts,
              m.otherIncome,
              m.moneyIn,
              m.expenses,
              m.billPayments,
              m.moneyOut,
              m.net,
              m.opening,
              m.closing,
            ]),
            totals: [
              "Total",
              flow.totals.receipts,
              flow.totals.otherIncome,
              flow.totals.moneyIn,
              flow.totals.expenses,
              flow.totals.billPayments,
              flow.totals.moneyOut,
              flow.totals.net,
              flow.totals.opening,
              flow.totals.closing,
            ],
          }}
          csvName={`cash-flow-${period.param}`}
        >
          <BarChart
            data={flow.months.map((m) => ({
              key: m.month,
              label: m.label,
              shortLabel: m.label.slice(0, 3),
              values: { in: num(m.moneyIn), out: num(m.moneyOut) },
            }))}
            series={[
              { key: "in", label: "Money in" },
              { key: "out", label: "Money out" },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title="Next 30, 60 and 90 days"
          description="Receivables vs payables due by then, including anything already overdue."
          summary={`If everything is collected and paid on its due date, the next 30 days leave you ${money(outlook[0].net)} ${num(outlook[0].net) < 0 ? "short" : "ahead"}.`}
          table={{
            headers: ["Within", "Customers owe you (₹)", "You owe vendors (₹)", "Net (₹)"],
            rows: outlook.map((o) => [`${o.days} days`, o.receivables, o.payables, o.net]),
          }}
          defaultShowTable
          csvName={`cash-outlook-${today}`}
        >
          <BarChart
            data={outlook.map((o) => ({
              key: String(o.days),
              label: `${o.days} days`,
              values: { recv: num(o.receivables), pay: num(o.payables) },
            }))}
            series={[
              { key: "recv", label: "Customers owe you" },
              { key: "pay", label: "You owe vendors" },
            ]}
          />
        </ChartFrame>
      </section>
    </div>
  );
}
