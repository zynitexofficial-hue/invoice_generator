"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  METRIC_DEFINITIONS,
  receivablesRegister,
  receivablesReport,
  type AgeBucket,
} from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { ChartFrame, StackedBar } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { num, subsetRegister } from "./analytics-model";
import type { TabContext } from "./context";
import { pctText, RegisterTable, StatTile } from "./shared";

export function ReceivablesTab({ ctx }: { ctx: TabContext }) {
  const { data, today, money, settings } = ctx;
  const [bucket, setBucket] = useState<AgeBucket | null>(null);
  const report = useMemo(() => receivablesReport(data, today, 10), [data, today]);
  const register = useMemo(() => {
    const all = receivablesRegister(data, today);
    return bucket ? subsetRegister(all, bucket.invoiceIds) : all;
  }, [data, today, bucket]);
  const overdueCustomers = report.byCustomer.filter((c) => num(c.overdue) > 0).slice(0, 10);
  const asOf = formatDate(today, settings.formats.dateFormat);
  const filterLabel = bucket ? `Age: ${bucket.label}` : "";

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Receivables are as of today ({asOf}) for all issued invoices, whatever period is selected.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="Outstanding"
          value={money(report.outstanding)}
          definition={METRIC_DEFINITIONS.receivables}
          note={`${report.open.length} open invoice${report.open.length === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Overdue"
          value={money(report.overdue)}
          tone={num(report.overdue) > 0 ? "danger" : "default"}
          note={
            num(report.overdue) > 0
              ? `${report.open.filter((o) => o.overdue).length} invoices · ${pctText(report.overdueShare)} of outstanding`
              : "Nothing overdue"
          }
        />
        <StatTile label="Not yet due" value={money(report.notYetDue)} note="Within payment terms" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Ageing"
          description="Balance due by days past the due date; click a band to filter the list."
          empty={!num(report.outstanding)}
          emptyMessage="Nothing outstanding — every issued invoice is paid."
          table={{
            headers: ["Age", "Amount (₹)", "Invoices"],
            rows: report.buckets.map((b) => [b.label, b.amount, b.count]),
            totals: ["Total", report.outstanding, report.open.length],
          }}
          csvName={`receivables-ageing-${today}`}
        >
          <StackedBar
            data={report.buckets.map((b) => ({ key: b.key, label: b.label, value: num(b.amount) }))}
            selectedKey={bucket?.key ?? null}
            onSelect={(d) => {
              const b = report.buckets.find((x) => x.key === d.key) ?? null;
              setBucket((cur) => (cur?.key === d.key ? null : b));
            }}
          />
        </ChartFrame>

        <ChartFrame
          title="Top overdue customers"
          description="Who to follow up with first."
          empty={!overdueCustomers.length}
          emptyMessage="No overdue customers."
          table={{
            headers: ["Customer", "Overdue (₹)", "Outstanding (₹)", "Most days late"],
            rows: overdueCustomers.map((c) => [
              c.name,
              c.overdue,
              c.outstanding,
              Math.max(0, c.maxDaysPastDue),
            ]),
          }}
          csvName={`overdue-customers-${today}`}
        >
          <ul className="divide-y divide-border">
            {overdueCustomers.map((c) => (
              <li key={c.key}>
                <Link
                  href="/history"
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface-2 focus-visible:focus-ring"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {c.count} open · up to {Math.max(0, c.maxDaysPastDue)} days late
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-danger-foreground tabular-nums">
                      {money(c.overdue)}
                    </span>
                    <span className="block text-xs text-muted-foreground tabular-nums">
                      of {money(c.outstanding)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Open invoices"
          action={
            bucket ? (
              <Button
                variant="soft"
                size="xs"
                onClick={() => setBucket(null)}
                aria-label={`Clear filter ${filterLabel}`}
              >
                {filterLabel}
                <X aria-hidden="true" />
              </Button>
            ) : undefined
          }
        />
        <CardContent>
          <RegisterTable
            register={register}
            format={money}
            csvName={`receivables-${today}`}
            caption={
              bucket
                ? `${register.rows.length} matching ${filterLabel}`
                : `${register.rows.length} open invoices`
            }
            onPrint={() =>
              ctx.print({
                title: `Receivables as of ${asOf}`,
                sections: [register],
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
