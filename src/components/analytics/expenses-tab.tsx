"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  expenseRegister,
  expensesByCategory,
  METRIC_DEFINITIONS,
  OTHER_KEY,
  topN,
  type BreakdownItem,
} from "@/lib/analytics";
import {
  BarChart,
  ChartFrame,
  DonutChart,
  KpiCard,
  StackedBar,
  type CategoryDatum,
} from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  expensesByVendor,
  itcSummary,
  num,
  selectedMonthKey,
  subsetRegister,
} from "./analytics-model";
import type { TabContext } from "./context";
import { useTrend } from "./overview-tab";
import { breakdownTable, parts } from "./sales-tab";
import { BarList, delta, pctText, RegisterTable } from "./shared";

export function ExpensesTab({ ctx }: { ctx: TabContext }) {
  const { data, period, money, current: c, growth: g } = ctx;
  const sel = period.selector;
  const [category, setCategory] = useState<BreakdownItem | null>(null);
  const trend = useTrend(ctx);

  const categories = useMemo(() => topN(expensesByCategory(data, sel)), [data, sel]);
  const vendors = useMemo(() => topN(expensesByVendor(data, sel)), [data, sel]);
  const itc = useMemo(() => itcSummary(data, sel), [data, sel]);
  const register = useMemo(() => {
    if (!category) return expenseRegister(data, sel);
    if (category.key !== OTHER_KEY) return expenseRegister(data, sel, { category: category.key });
    const all = expenseRegister(data, sel);
    const keys = new Set(category.groupedKeys ?? []);
    const ids = data.expenses.filter((e) => keys.has(e.category)).map((e) => e.id);
    return subsetRegister(all, ids);
  }, [data, sel, category]);

  const bars: CategoryDatum[] = trend.map((t) => ({
    key: t.month,
    label: t.label,
    shortLabel: t.shortLabel,
    values: { expenses: num(t.expenses) },
  }));
  const itcParts = [
    { key: "normal", label: "Eligible ITC", value: num(itc.normal) },
    { key: "rcm", label: "Reverse charge ITC", value: num(itc.rcm) },
    { key: "blocked", label: "GST you can't claim", value: num(itc.blocked) },
  ];
  const noExpenses = !categories.items.length;
  const filterLabel = category ? `Category: ${category.label}` : "";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard
          label="Expenses"
          value={money(c.expenses)}
          delta={g ? delta(g.expenses) : null}
          deltaLabel={ctx.compareLabel ?? "no comparison"}
          positiveIsGood={false}
          definition={METRIC_DEFINITIONS.expenses}
        />
        <KpiCard
          label="Eligible ITC"
          value={money(c.eligibleItc.total.total)}
          delta={g ? delta(g.eligibleItc) : null}
          deltaLabel={ctx.compareLabel ?? "no comparison"}
          definition={METRIC_DEFINITIONS.eligibleItc}
        />
        <KpiCard
          label="Expense ratio"
          value={pctText(c.expenseRatio)}
          delta={
            ctx.previous && c.expenseRatio !== null && ctx.previous.expenseRatio !== null
              ? num(c.expenseRatio) - num(ctx.previous.expenseRatio)
              : null
          }
          deltaLabel={ctx.compareLabel ? `points ${ctx.compareLabel}` : "no comparison"}
          positiveIsGood={false}
          footnote="Expenses as a share of sales"
          definition={METRIC_DEFINITIONS.expenseRatio}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Expenses by category"
          description="Cost after input tax credit; click a slice to filter the register."
          empty={noExpenses}
          emptyMessage="No expenses in this period. Add bills under Money → Expenses."
          table={breakdownTable(categories, "Category")}
          csvName={`expenses-by-category-${period.param}`}
        >
          <DonutChart
            data={parts(categories)}
            centerValue={money(categories.total).replace(/\.\d+$/, "")}
            centerLabel="Expenses"
            selectedKey={category?.key ?? null}
            onSelect={(d) => {
              const item = categories.items.find((i) => i.key === d.key) ?? null;
              setCategory((cur) => (cur?.key === d.key ? null : item));
            }}
          />
        </ChartFrame>

        <ChartFrame
          title="Monthly expenses"
          description="Expenses by month. Click a month to open it."
          empty={bars.every((b) => !b.values.expenses)}
          table={{
            headers: ["Month", "Expenses (₹)"],
            rows: trend.map((t) => [t.label, t.expenses]),
          }}
          csvName={`monthly-expenses-${period.param}`}
        >
          <BarChart
            data={bars}
            series={[{ key: "expenses", label: "Expenses", color: "var(--ig-c2)" }]}
            selectedKey={selectedMonthKey(sel)}
            onSelect={(d) => ctx.goToPeriod(d.key)}
          />
        </ChartFrame>

        <ChartFrame
          title="Top vendors"
          description="Who you spent the most with (cost after ITC)."
          empty={noExpenses}
          table={breakdownTable(vendors, "Vendor")}
          csvName={`top-vendors-${period.param}`}
        >
          <BarList ariaLabel="Expenses by vendor" items={vendors.items} format={money} />
        </ChartFrame>

        <ChartFrame
          title="Input tax credit"
          description="GST on your bills: claimable on normal purchases, reverse charge, and not claimable."
          empty={itcParts.every((p) => !p.value)}
          emptyMessage="No GST on expenses in this period."
          table={{
            headers: ["Type", "Amount (₹)"],
            rows: [
              ["Eligible ITC (normal)", itc.normal],
              ["Reverse charge ITC", itc.rcm],
              ["Not claimable (blocked/ineligible)", itc.blocked],
            ],
          }}
          csvName={`itc-summary-${period.param}`}
        >
          <StackedBar data={itcParts} />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Expense register"
          action={
            category ? (
              <Button
                variant="soft"
                size="xs"
                onClick={() => setCategory(null)}
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
            csvName={`expense-register-${period.param}`}
            caption={
              category
                ? `${register.rows.length} matching ${filterLabel}`
                : `${register.rows.length} expenses`
            }
            onPrint={() =>
              ctx.print({
                title: category ? `Expense register (${filterLabel})` : "Expense register",
                landscape: true,
                sections: [register],
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
