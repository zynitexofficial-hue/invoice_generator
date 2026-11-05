"use client";

import { useMemo } from "react";
import { buildInsights, METRIC_DEFINITIONS, monthlyTrend } from "@/lib/analytics";
import { BarChart, ChartFrame, KpiCard, LineChart, type CategoryDatum } from "@/components/charts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { insightDeadlines, num, selectedMonthKey, trendMonths } from "./analytics-model";
import type { TabContext } from "./context";
import { CoverageLine, delta, InsightList, pctText } from "./shared";

export function useTrend(ctx: TabContext) {
  const { data, period, today } = ctx;
  return useMemo(
    () => monthlyTrend(data, trendMonths(period.range), today),
    [data, period.range, today],
  );
}

export function OverviewTab({ ctx }: { ctx: TabContext }) {
  const { current: c, previous: p, growth: g, money, compareLabel } = ctx;
  const trend = useTrend(ctx);
  const deltaLabel = compareLabel ?? "no comparison";

  const insights = useMemo(
    () =>
      buildInsights({
        current: c,
        previous: p ?? undefined,
        deadlines: insightDeadlines(ctx.settings, ctx.filings, ctx.data, ctx.today),
        todayISO: ctx.today,
        previousLabel: compareLabel?.replace(/^vs /, ""),
      }),
    [c, p, ctx.settings, ctx.filings, ctx.data, ctx.today, compareLabel],
  );

  const bars: CategoryDatum[] = trend.map((t) => ({
    key: t.month,
    label: t.label,
    shortLabel: t.shortLabel,
    values: { revenue: num(t.revenue), expenses: num(t.expenses) },
  }));
  const profit: CategoryDatum[] = trend.map((t) => ({
    key: t.month,
    label: t.label,
    shortLabel: t.shortLabel,
    values: { profit: num(t.profit) },
  }));
  const spark = (k: "revenue" | "expenses" | "profit" | "otherIncome" | "outputTax") =>
    trend.map((t) => num(t[k]));
  const selectedMonth = selectedMonthKey(ctx.period.selector);
  const marginDelta =
    p && c.netMargin !== null && p.netMargin !== null ? num(c.netMargin) - num(p.netMargin) : null;
  const empty = trend.every((t) => !num(t.revenue) && !num(t.expenses) && !num(t.otherIncome));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <KpiCard
          label="Sales"
          value={money(c.salesRevenue)}
          delta={g ? delta(g.salesRevenue) : null}
          deltaLabel={deltaLabel}
          definition={METRIC_DEFINITIONS.salesRevenue}
          sparkline={spark("revenue")}
          sparklineLabel="Sales by month"
        />
        <KpiCard
          label="Other income"
          value={money(c.otherIncome)}
          delta={g ? delta(g.otherIncome) : null}
          deltaLabel={deltaLabel}
          definition={METRIC_DEFINITIONS.otherIncome}
        />
        <KpiCard
          label="Expenses"
          value={money(c.expenses)}
          delta={g ? delta(g.expenses) : null}
          deltaLabel={deltaLabel}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.expenses}
          sparkline={spark("expenses")}
          sparklineLabel="Expenses by month"
        />
        <KpiCard
          label="Net profit"
          value={money(c.netProfit)}
          delta={g ? delta(g.netProfit) : null}
          deltaLabel={deltaLabel}
          definition={METRIC_DEFINITIONS.netProfit}
          sparkline={spark("profit")}
          sparklineLabel="Net profit by month"
        />
        <KpiCard
          label="Net margin"
          value={pctText(c.netMargin)}
          delta={marginDelta}
          deltaLabel={p ? `points ${deltaLabel}` : deltaLabel}
          definition={METRIC_DEFINITIONS.netMargin}
          footnote={p && p.netMargin !== null ? `Was ${pctText(p.netMargin)}` : undefined}
        />
        <KpiCard
          label="Estimated GST"
          value={money(c.estimatedGstPayable.total)}
          delta={g ? delta(g.estimatedGstPayable) : null}
          deltaLabel={deltaLabel}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.estimatedGstPayable}
          footnote={`Output ${money(c.outputTax.total)} − ITC ${money(c.eligibleItc.total.total)}`}
        />
      </div>
      <CoverageLine coverage={c.dataCoverage} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Sales vs expenses"
          description="Sales revenue against expenses, by month. Click a month to open it."
          empty={empty}
          table={{
            headers: ["Month", "Sales (₹)", "Expenses (₹)"],
            rows: trend.map((t) => [t.label, t.revenue, t.expenses]),
          }}
          csvName={`sales-vs-expenses-${ctx.period.param}`}
        >
          <BarChart
            data={bars}
            series={[
              { key: "revenue", label: "Sales" },
              { key: "expenses", label: "Expenses" },
            ]}
            selectedKey={selectedMonth}
            onSelect={(d) => ctx.goToPeriod(d.key)}
          />
        </ChartFrame>
        <ChartFrame
          title="Profit trend"
          description="Net profit by month (sales + other income − expenses)."
          empty={empty}
          table={{
            headers: ["Month", "Net profit (₹)"],
            rows: trend.map((t) => [t.label, t.profit]),
          }}
          csvName={`profit-trend-${ctx.period.param}`}
        >
          <LineChart
            data={profit}
            series={[{ key: "profit", label: "Net profit" }]}
            selectedKey={selectedMonth}
            onSelect={(d) => ctx.goToPeriod(d.key)}
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Insights"
          description="Things worth a look in this period, most important first."
        />
        <CardContent>
          <InsightList insights={insights} hrefFor={ctx.hrefFor} />
        </CardContent>
      </Card>
    </div>
  );
}
