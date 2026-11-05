"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { METRIC_DEFINITIONS } from "@/lib/analytics";
import { formatDate } from "@/lib/dates";
import { BarChart, ChartFrame, DonutChart, KpiCard, type CategoryDatum } from "@/components/charts";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  FILING_STATUS_LABELS,
  filesGstReturns,
  filingRowsFor,
  monthsOf,
  num,
  salesByRate,
  selectedMonthKey,
  MAX_TREND_MONTHS,
} from "./analytics-model";
import type { TabContext } from "./context";
import { useTrend } from "./overview-tab";
import { breakdownTable, parts } from "./sales-tab";
import { delta, pctText } from "./shared";

export function GstTab({ ctx }: { ctx: TabContext }) {
  const { data, period, money, current: c, growth: g, settings, filings, today } = ctx;
  const trend = useTrend(ctx);
  const rates = useMemo(() => salesByRate(data, period.selector), [data, period.selector]);
  const filingRows = useMemo(
    () =>
      filingRowsFor(settings, filings, monthsOf(period.selector).slice(-MAX_TREND_MONTHS), today),
    [settings, filings, period.selector, today],
  );
  const regular = filesGstReturns(settings);
  const deltaLabel = ctx.compareLabel ?? "no comparison";
  const dateFormat = settings.formats.dateFormat;

  const bars: CategoryDatum[] = trend.map((t) => ({
    key: t.month,
    label: t.label,
    shortLabel: t.shortLabel,
    values: { output: num(t.outputTax), itc: num(t.itc) },
  }));
  const heads = c.estimatedGstPayable;

  return (
    <div className="space-y-4">
      {!regular && (
        <Alert tone="info">
          Your GST registration is set to{" "}
          {settings.gst.registrationType === "composition" ? "composition" : "unregistered"}, so the
          output tax, ITC and return figures below are for reference only.{" "}
          <Link href="/settings?section=gst" className="font-medium underline">
            Change in settings
          </Link>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Output tax"
          value={money(c.outputTax.total)}
          delta={g ? delta(g.outputTax) : null}
          deltaLabel={deltaLabel}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.outputTax}
          footnote={`CGST ${money(c.outputTax.cgst)} · SGST ${money(c.outputTax.sgst)} · IGST ${money(c.outputTax.igst)}`}
        />
        <KpiCard
          label="Eligible ITC"
          value={money(c.eligibleItc.total.total)}
          delta={g ? delta(g.eligibleItc) : null}
          deltaLabel={deltaLabel}
          definition={METRIC_DEFINITIONS.eligibleItc}
          footnote={
            num(c.eligibleItc.rcm.total)
              ? `Includes ${money(c.eligibleItc.rcm.total)} reverse-charge ITC`
              : undefined
          }
        />
        <KpiCard
          label="Estimated GST payable"
          value={money(heads.total)}
          delta={g ? delta(g.estimatedGstPayable) : null}
          deltaLabel={deltaLabel}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.estimatedGstPayable}
          footnote={`CGST ${money(heads.cgst)} · SGST ${money(heads.sgst)} · IGST ${money(heads.igst)}`}
        />
        <KpiCard
          label="Effective GST rate"
          value={pctText(c.effectiveGstRate)}
          delta={
            ctx.previous && c.effectiveGstRate !== null && ctx.previous.effectiveGstRate !== null
              ? num(c.effectiveGstRate) - num(ctx.previous.effectiveGstRate)
              : null
          }
          deltaLabel={ctx.compareLabel ? `points ${ctx.compareLabel}` : "no comparison"}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.effectiveGstRate}
        />
        <KpiCard
          label="ITC coverage"
          value={pctText(c.itcCoverage)}
          delta={
            ctx.previous && c.itcCoverage !== null && ctx.previous.itcCoverage !== null
              ? num(c.itcCoverage) - num(ctx.previous.itcCoverage)
              : null
          }
          deltaLabel={ctx.compareLabel ? `points ${ctx.compareLabel}` : "no comparison"}
          definition={METRIC_DEFINITIONS.itcCoverage}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Output tax vs eligible ITC"
          description="GST charged on sales against GST you can claim on purchases, by month."
          empty={bars.every((b) => !b.values.output && !b.values.itc)}
          table={{
            headers: ["Month", "Output tax (₹)", "Eligible ITC (₹)"],
            rows: trend.map((t) => [t.label, t.outputTax, t.itc]),
          }}
          csvName={`output-vs-itc-${period.param}`}
        >
          <BarChart
            data={bars}
            series={[
              { key: "output", label: "Output tax" },
              { key: "itc", label: "Eligible ITC" },
            ]}
            selectedKey={selectedMonthKey(period.selector)}
            onSelect={(d) => ctx.goToPeriod(d.key)}
          />
        </ChartFrame>
        <ChartFrame
          title="Sales by GST rate"
          description="Net taxable value at each rate (documents that charge GST)."
          empty={!rates.items.some((i) => num(i.value) !== 0)}
          table={breakdownTable(rates, "GST rate")}
          csvName={`gst-rate-mix-${period.param}`}
        >
          <DonutChart
            data={parts(rates)}
            centerValue={money(rates.total).replace(/\.\d+$/, "")}
            centerLabel="Taxable value"
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Return filing status"
          description="From your filing tracker. Due dates are the standard ones — verify on the GST portal."
          action={
            <Button variant="secondary" size="sm" asChild>
              <Link href="/returns">
                GST returns
                <ArrowRight />
              </Link>
            </Button>
          }
        />
        <CardContent>
          {!regular ? (
            <p className="text-sm text-muted-foreground">
              GSTR-1 and GSTR-3B apply to regular taxpayers only.
            </p>
          ) : filingRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No returns fall in this period.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filingRows.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                  <span className="min-w-0 flex-1 text-sm">
                    <span className="font-medium">{r.returnType}</span>{" "}
                    <span className="text-muted-foreground">· {r.periodLabel}</span>
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Due {formatDate(r.dueDate, dateFormat)}
                  </span>
                  <Badge
                    size="sm"
                    tone={
                      r.status === "filed"
                        ? "success"
                        : r.overdue
                          ? "danger"
                          : r.status === "not_started"
                            ? "neutral"
                            : "info"
                    }
                  >
                    {r.overdue ? "Overdue · " : ""}
                    {FILING_STATUS_LABELS[r.status]}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
