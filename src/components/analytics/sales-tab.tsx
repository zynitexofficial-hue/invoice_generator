"use client";

import { X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  METRIC_DEFINITIONS,
  OTHER_KEY,
  salesByCustomer,
  salesByHsn,
  salesByItem,
  salesByState,
  salesByType,
  salesRegister,
  sliceData,
  topN,
  type Breakdown,
  type BreakdownItem,
} from "@/lib/analytics";
import { ChartFrame, DonutChart, StackedBar, type ChartTable } from "@/components/charts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Segmented } from "@/components/ui/segmented";
import {
  drillFromItem,
  drillText,
  drillToFilter,
  num,
  type Drill,
  type SalesDimension,
} from "./analytics-model";
import type { TabContext } from "./context";
import { BarList, Defined, pctText, RegisterTable } from "./shared";

export function breakdownTable(b: Breakdown, label: string): ChartTable {
  return {
    headers: [label, "Amount (₹)", "Share", "Records"],
    rows: b.items.map((i) => [i.label, i.value, pctText(i.share), i.count]),
    totals: ["Total", b.total, b.items.length ? "100%" : "", ""],
  };
}

export const parts = (b: Breakdown) =>
  b.items.map((i) => ({ key: i.key, label: i.label, value: num(i.value) }));

export function SalesTab({ ctx }: { ctx: TabContext }) {
  const { data, period, money, today } = ctx;
  const sel = period.selector;
  const [drill, setDrill] = useState<Drill | null>(null);
  const [itemMode, setItemMode] = useState<"item" | "hsn">("item");

  const b = useMemo(
    () => ({
      customers: topN(salesByCustomer(data, sel)),
      items: topN(salesByItem(data, sel)),
      hsn: topN(salesByHsn(data, sel)),
      states: topN(salesByState(data, sel)),
      types: salesByType(data, sel),
    }),
    [data, sel],
  );
  const facts = useMemo(() => sliceData(data, period.range).facts, [data, period.range]);
  const register = useMemo(
    () => salesRegister(data, sel, today, drill ? drillToFilter(drill, facts) : undefined),
    [data, sel, today, drill, facts],
  );

  const pick = (dimension: SalesDimension) => (item: { key: string }) => {
    const source =
      dimension === "customer"
        ? b.customers
        : dimension === "state"
          ? b.states
          : dimension === "type"
            ? b.types
            : dimension === "hsn"
              ? b.hsn
              : b.items;
    const full = source.items.find((i) => i.key === item.key) as BreakdownItem | undefined;
    if (!full) return;
    setDrill((d) =>
      d && d.dimension === dimension && d.key === full.key ? null : drillFromItem(dimension, full),
    );
  };
  const selected = (dimension: SalesDimension) =>
    drill?.dimension === dimension ? drill.key : null;
  const isEmpty = (x: Breakdown) => !x.items.some((i) => num(i.value) !== 0);
  const itemB = itemMode === "item" ? b.items : b.hsn;
  const top = b.customers.items[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartFrame
          title="Top customers"
          description={
            <Defined
              label="Net sales by customer; click one to filter the register."
              definition={METRIC_DEFINITIONS.topCustomerShare}
            />
          }
          summary={
            top && top.key !== OTHER_KEY && num(top.value) > 0
              ? `${top.label} brought in ${pctText(top.share)} of sales.`
              : undefined
          }
          empty={isEmpty(b.customers)}
          table={breakdownTable(b.customers, "Customer")}
          csvName={`sales-by-customer-${period.param}`}
        >
          <BarList
            ariaLabel="Sales by customer"
            items={b.customers.items}
            format={money}
            onSelect={pick("customer")}
            selectedKey={selected("customer")}
          />
        </ChartFrame>

        <ChartFrame
          title={itemMode === "item" ? "Sales by item" : "Sales by HSN/SAC"}
          description="Net taxable value per line; click one to filter the register."
          actions={
            <Segmented
              size="sm"
              aria-label="Group sales by"
              value={itemMode}
              onValueChange={setItemMode}
              options={[
                { value: "item", label: "Item" },
                { value: "hsn", label: "HSN" },
              ]}
            />
          }
          empty={isEmpty(itemB)}
          table={breakdownTable(itemB, itemMode === "item" ? "Item" : "HSN/SAC")}
          csvName={`sales-by-${itemMode}-${period.param}`}
        >
          <BarList
            ariaLabel={itemMode === "item" ? "Sales by item" : "Sales by HSN/SAC"}
            items={itemB.items}
            format={money}
            onSelect={pick(itemMode)}
            selectedKey={selected(itemMode)}
          />
        </ChartFrame>

        <ChartFrame
          title="Sales by state"
          description="By place of supply; click a slice to filter the register."
          empty={isEmpty(b.states)}
          table={breakdownTable(b.states, "Place of supply")}
          csvName={`sales-by-state-${period.param}`}
        >
          <DonutChart
            data={parts(b.states)}
            centerValue={money(b.states.total).replace(/\.\d+$/, "")}
            centerLabel="Net sales"
            onSelect={pick("state")}
            selectedKey={selected("state")}
          />
        </ChartFrame>

        <ChartFrame
          title="B2B, B2C and export mix"
          description="Registered businesses, consumers and exports; click a part to filter."
          empty={isEmpty(b.types)}
          table={breakdownTable(b.types, "Supply type")}
          csvName={`sales-by-type-${period.param}`}
        >
          <StackedBar
            data={parts(b.types)}
            onSelect={pick("type")}
            selectedKey={selected("type")}
          />
        </ChartFrame>
      </div>

      <Card>
        <CardHeader
          title="Sales register"
          description="Issued sales documents in this period (credit/debit notes are in Registers)."
          action={
            drill ? (
              <Button
                variant="soft"
                size="xs"
                onClick={() => setDrill(null)}
                aria-label={`Clear filter ${drillText(drill)}`}
              >
                {drillText(drill)}
                <X aria-hidden="true" />
              </Button>
            ) : undefined
          }
        />
        <CardContent>
          <RegisterTable
            register={register}
            format={money}
            csvName={`sales-register-${period.param}`}
            caption={
              drill
                ? `${register.rows.length} matching ${drillText(drill)}`
                : `${register.rows.length} documents`
            }
            onPrint={() =>
              ctx.print({
                title: drill ? `Sales register (${drillText(drill)})` : "Sales register",
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
