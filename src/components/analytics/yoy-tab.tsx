"use client";

import { useMemo, useState } from "react";
import { METRIC_DEFINITIONS } from "@/lib/analytics";
import { computeYoy } from "@/lib/analytics/yoy";
import { FySelect } from "@/components/returns/annual/fy-select";
import { ChartFrame, LineChart, type CategoryDatum } from "@/components/charts";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import { fyKey as fyKeyOf, periodLabel } from "@/lib/period";
import type { TabContext } from "./context";
import { Defined, pctText } from "./shared";

type Metric = "revenue" | "expenses" | "profit" | "outputTax";
const METRICS: { value: Metric; label: string; definition: string }[] = [
  { value: "revenue", label: "Revenue", definition: METRIC_DEFINITIONS.salesRevenue },
  { value: "expenses", label: "Expenses", definition: METRIC_DEFINITIONS.expenses },
  { value: "profit", label: "Profit", definition: METRIC_DEFINITIONS.netProfit },
  { value: "outputTax", label: "Output GST", definition: METRIC_DEFINITIONS.outputTax },
];

const DEFINITIONS = {
  customers:
    "Customers with at least one issued sales document (not a credit or debit note) in the financial year.",
  newCustomers: "Customers whose very first sale in your records falls in this financial year.",
  retained: "Customers who bought in this financial year and also in the previous one.",
  compare:
    "Change = (this year − previous year) ÷ previous year. Shown as — when the previous year is zero.",
} as const;

export function YoyTab({ ctx }: { ctx: TabContext }) {
  const { data, today, money } = ctx;
  const [fy, setFy] = useState(fyKeyOf(today));
  const [metric, setMetric] = useState<Metric>("revenue");
  const y = useMemo(() => computeYoy(data, fy, today), [data, fy, today]);
  const dates = useMemo(() => data.facts.map((f) => f.date), [data.facts]);

  const cur = periodLabel(y.fyKey);
  const prev = periodLabel(y.previousFyKey);
  const empty = y.current.counts.invoices + y.previous.counts.invoices === 0;

  const rows: {
    label: string;
    definition: string;
    current: string;
    previous: string;
    change: string | null;
  }[] = [
    {
      label: "Sales revenue",
      definition: METRIC_DEFINITIONS.salesRevenue,
      current: y.current.salesRevenue,
      previous: y.previous.salesRevenue,
      change: y.growth.salesRevenue,
    },
    {
      label: "Expenses",
      definition: METRIC_DEFINITIONS.expenses,
      current: y.current.expenses,
      previous: y.previous.expenses,
      change: y.growth.expenses,
    },
    {
      label: "Net profit",
      definition: METRIC_DEFINITIONS.netProfit,
      current: y.current.netProfit,
      previous: y.previous.netProfit,
      change: y.growth.netProfit,
    },
    {
      label: "GST collected (output)",
      definition: METRIC_DEFINITIONS.outputTax,
      current: y.current.outputTax.total,
      previous: y.previous.outputTax.total,
      change: y.growth.outputTax,
    },
    {
      label: "ITC claimed",
      definition: METRIC_DEFINITIONS.eligibleItc,
      current: y.current.eligibleItc.total.total,
      previous: y.previous.eligibleItc.total.total,
      change: y.growth.eligibleItc,
    },
    {
      label: "Estimated GST payable",
      definition: METRIC_DEFINITIONS.estimatedGstPayable,
      current: y.current.estimatedGstPayable.total,
      previous: y.previous.estimatedGstPayable.total,
      change: y.growth.estimatedGstPayable,
    },
  ];

  const chartData: CategoryDatum[] = y.months.map((m) => ({
    key: String(m.index),
    label: m.label,
    shortLabel: m.label,
    values: { current: Number(m.current[metric]), previous: Number(m.previous[metric]) },
  }));
  const def = METRICS.find((m) => m.value === metric)!;
  const totalOf = (which: "current" | "previous") =>
    y.months.reduce((a, m) => a + Number(m[which][metric]), 0).toFixed(2);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Year over year"
          description="Financial year against the one before it. Independent of the period chosen above."
          action={
            <FySelect value={fy} onChange={setFy} dates={dates} today={today} className="w-36" />
          }
          className="flex-col sm:flex-row"
        />
        <CardContent>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[480px] border-collapse text-sm">
              <caption className="sr-only">
                {cur} compared with {prev}
              </caption>
              <thead className="bg-surface-2 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Measure
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {cur}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    {prev}
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    <Defined label="Change" definition={DEFINITIONS.compare} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label} className="border-t border-border/70">
                    <th scope="row" className="px-3 py-2 text-left font-normal">
                      <Defined label={r.label} definition={r.definition} />
                    </th>
                    <td className="px-3 py-2 text-right tabular-nums">{money(r.current)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">
                      {money(r.previous)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.change === null
                        ? "—"
                        : `${Number(r.change) > 0 ? "+" : ""}${pctText(r.change)}`}
                    </td>
                  </tr>
                ))}
                <CustomerRow
                  label="Active customers"
                  definition={DEFINITIONS.customers}
                  cur={y.customers.current.active}
                  prev={y.customers.previous.active}
                  change={y.customers.growth}
                />
                <CustomerRow
                  label="New customers"
                  definition={DEFINITIONS.newCustomers}
                  cur={y.customers.current.newCustomers}
                  prev={y.customers.previous.newCustomers}
                />
                <CustomerRow
                  label="Retained from last year"
                  definition={DEFINITIONS.retained}
                  cur={y.customers.current.retained}
                  prev={null}
                />
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Same definitions as the Overview tab, so these totals match the Registers tab for each
            year.
          </p>
        </CardContent>
      </Card>

      <ChartFrame
        title={`Monthly ${def.label.toLowerCase()}: ${cur} vs ${prev}`}
        description={<Defined label="April to March, month by month" definition={def.definition} />}
        summary={
          empty
            ? undefined
            : `${cur}: ${money(totalOf("current"))} against ${money(totalOf("previous"))} in ${prev}.`
        }
        empty={empty}
        emptyMessage="No sales in either year yet."
        actions={
          <Segmented<Metric>
            value={metric}
            onValueChange={setMetric}
            options={METRICS.map((m) => ({ value: m.value, label: m.label }))}
            size="sm"
            aria-label="Measure"
          />
        }
        table={{
          headers: ["Month", cur, prev],
          rows: y.months.map((m) => [m.current.label, m.current[metric], m.previous[metric]]),
          totals: ["Total", totalOf("current"), totalOf("previous")],
        }}
        csvName={`yoy-${metric}-${y.fyKey}`}
      >
        <LineChart
          data={chartData}
          series={[
            { key: "current", label: cur },
            { key: "previous", label: prev },
          ]}
          ariaLabel={`Monthly ${def.label.toLowerCase()}, ${cur} against ${prev}`}
        />
      </ChartFrame>
    </div>
  );
}

function CustomerRow({
  label,
  definition,
  cur,
  prev,
  change,
}: {
  label: string;
  definition: string;
  cur: number;
  prev: number | null;
  change?: string | null;
}) {
  return (
    <tr className="border-t border-border/70">
      <th scope="row" className="px-3 py-2 text-left font-normal">
        <Defined label={label} definition={definition} />
      </th>
      <td className="px-3 py-2 text-right tabular-nums">{cur}</td>
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{prev ?? "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        {change === undefined || change === null
          ? "—"
          : `${Number(change) > 0 ? "+" : ""}${pctText(change)}`}
      </td>
    </tr>
  );
}
