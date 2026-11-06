"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useInvoices, usePayments } from "@/db/hooks";
import { repairLedgerSync } from "@/db/payments";
import { customerIdentity } from "@/lib/analytics/base";
import { collectionsReport } from "@/lib/analytics/collections";
import { buildPaymentEvents } from "@/lib/payments/ledger";
import { BarChart, ChartFrame, StackedBar } from "@/components/charts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { num } from "./analytics-model";
import type { TabContext } from "./context";
import { pctText, StatTile } from "./shared";

const DEFINITIONS = {
  daysToPay:
    "Days from the invoice date to the day the last rupee arrived, for invoices fully paid in the selected period.",
  onTime:
    "Share of those invoices paid on or before the due date (the invoice date when there is none).",
  efficiency:
    "Money received against invoices in the period, divided by what was owed at the start plus what you invoiced in the period.",
};

export function CollectionsTab({ ctx }: { ctx: TabContext }) {
  const { data, today, money, period } = ctx;
  const invoices = useInvoices();
  const payments = usePayments();
  const [repairing, setRepairing] = useState(false);

  const report = useMemo(() => {
    if (!invoices || !payments) return null;
    const events = buildPaymentEvents(invoices, payments, (i) => customerIdentity(i).key);
    return collectionsReport(data, events, period.range, today);
  }, [data, invoices, payments, period.range, today]);

  if (!report) return <Skeleton className="h-64 w-full" />;
  const r = report;
  const settledCount = r.settled.length;
  const noActivity = !settledCount && !num(r.collected) && !num(r.billed);

  const repair = async () => {
    setRepairing(true);
    try {
      const n = await repairLedgerSync();
      toast.success(n ? `Updated ${n} invoice${n === 1 ? "" : "s"}` : "Everything already matches");
    } catch {
      toast.error("Couldn't update the invoices.");
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Collections for {period.label}. Ageing is as of today and covers all issued invoices.
        Payments never change your GST return figures.
      </p>

      {r.reconciliation.outOfStep.length > 0 && (
        <Alert
          tone="warning"
          title="Some invoices don't match the payment history"
          action={
            <Button size="xs" variant="secondary" loading={repairing} onClick={() => void repair()}>
              Update invoices
            </Button>
          }
        >
          {r.reconciliation.outOfStep.length} invoice
          {r.reconciliation.outOfStep.length === 1 ? "" : "s"} show a different balance than their
          recorded payments (this can happen after restoring a backup). Updating fixes the invoice
          balances from the payment history.
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Collected"
          value={money(r.collected)}
          note={
            num(r.refunds) > 0
              ? `${money(r.moneyIn)} received, ${money(r.refunds)} refunded`
              : `${money(r.collectedOnInvoices)} against invoices`
          }
        />
        <StatTile
          label="Average days to pay"
          value={r.avgDaysToPay === null ? "—" : `${r.avgDaysToPay} days`}
          definition={DEFINITIONS.daysToPay}
          note={
            settledCount
              ? `${settledCount} paid invoice${settledCount === 1 ? "" : "s"}, middle value ${r.medianDaysToPay} days`
              : "No invoices fully paid in this period"
          }
        />
        <StatTile
          label="Paid on time"
          value={pctText(r.onTimeShare)}
          definition={DEFINITIONS.onTime}
          tone={r.onTimeShare !== null && num(r.onTimeShare) < 50 ? "danger" : "default"}
          note={settledCount ? `${r.onTime.count} on time, ${r.late.count} late` : undefined}
        />
        <StatTile
          label="Collection efficiency"
          value={pctText(r.efficiency)}
          definition={DEFINITIONS.efficiency}
          note={`${money(r.billed)} invoiced in the period`}
        />
      </div>

      {noActivity && (
        <Alert tone="info">
          No payments or invoices in this period yet. Record payments from History or an invoice to
          see collection trends here.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Collections trend"
          description="Money received compared with invoices raised, month by month."
          empty={r.trend.every((t) => !num(t.collected) && !num(t.billed))}
          emptyMessage="No money received or invoices raised in the last 12 months."
          table={{
            headers: ["Month", "Collected (₹)", "Invoiced (₹)"],
            rows: r.trend.map((t) => [t.label, t.collected, t.billed]),
          }}
          csvName={`collections-trend-${today}`}
        >
          <BarChart
            data={r.trend.map((t) => ({
              key: t.month,
              label: t.label,
              shortLabel: t.shortLabel,
              values: { collected: num(t.collected), billed: num(t.billed) },
            }))}
            series={[
              { key: "collected", label: "Collected" },
              { key: "billed", label: "Invoiced" },
            ]}
          />
        </ChartFrame>

        <ChartFrame
          title="Receivables ageing"
          description="What is still unpaid, by days past the due date."
          empty={!num(r.ageing.outstanding)}
          emptyMessage="Nothing outstanding. Every issued invoice is paid."
          table={{
            headers: ["Age", "Amount (₹)", "Invoices"],
            rows: r.ageing.buckets.map((b) => [b.label, b.amount, b.count]),
            totals: ["Total", r.ageing.outstanding, r.ageing.open.length],
          }}
          csvName={`collections-ageing-${today}`}
        >
          <StackedBar
            data={r.ageing.buckets.map((b) => ({
              key: b.key,
              label: b.label,
              value: num(b.amount),
            }))}
          />
        </ChartFrame>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Slowest payers"
          description="Customers who paid furthest past the due date, for invoices paid in this period."
          empty={!r.slowPayers.length}
          emptyMessage="No fully paid invoices in this period."
          table={{
            headers: [
              "Customer",
              "Paid invoices",
              "Average days to pay",
              "Average days late",
              "Paid late (%)",
              "Still owes (₹)",
            ],
            rows: r.slowPayers.map((s) => [
              s.name,
              s.settledCount,
              s.avgDaysToPay,
              s.avgDaysLate,
              s.lateShare,
              s.outstanding,
            ]),
          }}
          csvName={`slow-payers-${today}`}
        >
          <ul className="divide-y divide-border">
            {r.slowPayers.map((s) => (
              <li key={s.key}>
                <Link
                  href={`/customers/statement?customer=${encodeURIComponent(s.key)}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2 focus-visible:focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {s.settledCount} paid · {s.avgDaysToPay} days on average ·{" "}
                      {pctText(s.lateShare)} late
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold tabular-nums">
                      {num(s.avgDaysLate) > 0
                        ? `${s.avgDaysLate} days late`
                        : `${Math.abs(num(s.avgDaysLate))} days early`}
                    </span>
                    {num(s.outstanding) > 0 && (
                      <span className="block text-xs text-muted-foreground tabular-nums">
                        owes {money(s.outstanding)}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ChartFrame>

        <ChartFrame
          title="On time and late"
          description="Invoices fully paid in this period, by when they were paid."
          empty={!settledCount}
          emptyMessage="No fully paid invoices in this period."
          table={{
            headers: ["", "Invoices", "Amount (₹)"],
            rows: [
              ["Paid on time", r.onTime.count, r.onTime.amount],
              ["Paid late", r.late.count, r.late.amount],
            ],
          }}
          csvName={`on-time-late-${today}`}
        >
          <StackedBar
            data={[
              { key: "on", label: "Paid on time", value: num(r.onTime.amount) },
              { key: "late", label: "Paid late", value: num(r.late.amount) },
            ]}
          />
        </ChartFrame>
      </div>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <h3 className="mb-2 font-semibold">Reconciliation</h3>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          <Row
            label="Outstanding on invoices (Receivables)"
            value={money(r.reconciliation.receivables)}
          />
          <Row label="Outstanding per payment history" value={money(r.reconciliation.ledger)} />
          <Row
            label="Difference"
            value={money(r.reconciliation.difference)}
            ok={num(r.reconciliation.difference) === 0}
          />
          <Row label="Advances held (not yet used)" value={money(r.advancesHeld)} />
        </dl>
      </div>
    </div>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">
        {value}
        {ok !== undefined && (
          <span className="sr-only">{ok ? " (matches)" : " (does not match)"}</span>
        )}
      </dd>
    </div>
  );
}
