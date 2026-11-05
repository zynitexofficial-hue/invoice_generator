"use client";

import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CircleCheck,
  Download,
  Info,
  Printer,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useExpenses, useFilings, useIncomes, useInvoices, useSettings } from "@/db/hooks";
import {
  prepareAnalytics,
  type DataCoverage,
  type Insight,
  type InsightSeverity,
  type Register,
} from "@/lib/analytics";
import { downloadCsv } from "@/lib/csv";
import { todayISO } from "@/lib/dates";
import { formatMoney, type NumberGrouping } from "@/lib/format";
import { settingsStateCode } from "@/lib/gst/returns";
import { toDec } from "@/lib/money";
import { cn, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { num } from "./analytics-model";

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/**
 * Loads every table analytics needs and normalizes it once per data change.
 * `data` is undefined while anything is still loading.
 */
export function useAnalyticsSource() {
  const settings = useSettings();
  const invoices = useInvoices();
  const expenses = useExpenses();
  const incomes = useIncomes();
  const filings = useFilings();
  const sellerState = settings ? settingsStateCode(settings) : "";
  const data = useMemo(
    () =>
      invoices && expenses && incomes
        ? prepareAnalytics({ invoices, expenses, incomes, sellerState })
        : undefined,
    [invoices, expenses, incomes, sellerState],
  );
  const ready = Boolean(settings && data && filings);
  return { settings, invoices, data, filings, ready, today: todayISO() };
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

export function inrFormatter(grouping: NumberGrouping = "indian") {
  return (v: string | number) =>
    formatMoney(typeof v === "number" ? v.toFixed(2) : v, "INR", grouping);
}

/** Growth string → KpiCard delta (null stays null). */
export const delta = (g: string | null | undefined): number | null =>
  g === null || g === undefined ? null : num(g);

export const pctText = (v: string | null | undefined) =>
  v === null || v === undefined ? "—" : `${Number(toDec(v).toFixed(1))}%`;

/* ------------------------------------------------------------------ */
/* Data coverage                                                       */
/* ------------------------------------------------------------------ */

const REASON_LABELS: Record<string, string> = {
  draft: "Drafts (not issued yet)",
  quotation: "Quotations",
  cancelled: "Cancelled documents",
  "missing invoice date": "Missing invoice date",
  "missing exchange rate": "Foreign-currency invoices without an exchange rate",
  "expense missing date": "Expenses without a date",
};

/** "Based on X invoices and Y expenses; Z not included — why?" with a disclosure. */
export function CoverageLine({
  coverage,
  className,
}: {
  coverage: DataCoverage;
  className?: string;
}) {
  const left = coverage.invoicesExcluded + coverage.expensesExcluded;
  const reasons = Object.entries(coverage.reasons).filter(([, n]) => n);
  return (
    <div className={cn("text-xs text-muted-foreground", className)}>
      <span>
        Based on {plural(coverage.invoicesIncluded, "invoice")} and{" "}
        {plural(coverage.expensesIncluded, "expense")}
        {left > 0 ? "; " : "."}
      </span>
      {left > 0 && (
        <details className="inline [&[open]>summary]:mb-1">
          <summary className="inline cursor-pointer list-none rounded-sm underline decoration-dotted underline-offset-2 hover:text-foreground focus-visible:focus-ring [&::-webkit-details-marker]:hidden">
            {left} not included — why?
          </summary>
          <ul className="mt-1 ml-4 list-disc space-y-0.5">
            {reasons.map(([reason, n]) => (
              <li key={reason}>
                {REASON_LABELS[reason] ?? reason}: {n}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Insights                                                            */
/* ------------------------------------------------------------------ */

const SEVERITY: Record<InsightSeverity, { icon: ReactNode; label: string; className: string }> = {
  critical: {
    icon: <AlertOctagon />,
    label: "Urgent",
    className: "bg-danger-soft text-danger-foreground",
  },
  warning: {
    icon: <AlertTriangle />,
    label: "Check",
    className: "bg-warning-soft text-warning-foreground",
  },
  positive: {
    icon: <CircleCheck />,
    label: "Good news",
    className: "bg-success-soft text-success-foreground",
  },
  info: { icon: <Info />, label: "Note", className: "bg-info-soft text-info-foreground" },
};

export function InsightList({
  insights,
  hrefFor = (h) => h,
  empty = "Nothing needs your attention right now.",
}: {
  insights: Insight[];
  hrefFor?: (href: string) => string;
  empty?: ReactNode;
}) {
  if (!insights.length)
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <CircleCheck className="size-4 text-success" aria-hidden="true" />
        {empty}
      </p>
    );
  return (
    <ul className="divide-y divide-border">
      {insights.map((x) => {
        const s = SEVERITY[x.severity];
        return (
          <li key={x.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span
              className={cn(
                "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                s.className,
              )}
              aria-hidden="true"
            >
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                <span className="sr-only">{s.label}: </span>
                {x.title}
              </div>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{x.detail}</p>
              {x.action && (
                <Link
                  href={hrefFor(x.action.href)}
                  className="mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:focus-ring"
                >
                  {x.action.label}
                  <ArrowRight className="size-3" aria-hidden="true" />
                </Link>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Horizontal bar list (top customers / vendors)                       */
/* ------------------------------------------------------------------ */

export interface BarListItem {
  key: string;
  label: string;
  value: string;
  share: string | null;
}

/** Ranked horizontal bars with the value and share as text; optional click-to-filter. */
export function BarList({
  items,
  format,
  onSelect,
  selectedKey,
  ariaLabel,
}: {
  items: BarListItem[];
  format: (v: string) => string;
  onSelect?: (item: BarListItem) => void;
  selectedKey?: string | null;
  ariaLabel: string;
}) {
  const max = Math.max(0, ...items.map((i) => num(i.value)));
  return (
    <ul aria-label={ariaLabel} className="space-y-1">
      {items.map((it, i) => {
        const w = max > 0 ? Math.max(1, (Math.max(0, num(it.value)) / max) * 100) : 0;
        const dim = selectedKey && selectedKey !== it.key;
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-foreground">{it.label}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                <span className="font-medium text-foreground">{format(it.value)}</span>
                {it.share !== null && ` · ${pctText(it.share)}`}
              </span>
            </span>
            <span className="mt-1 block h-2 overflow-hidden rounded-full bg-surface-3">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${w}%`,
                  background: it.key === "__other" ? "var(--chart-other)" : "var(--chart-1)",
                  opacity: i === 0 || it.key === "__other" ? 1 : 0.85,
                }}
              />
            </span>
          </>
        );
        return (
          <li key={it.key} className={cn("transition-opacity", dim && "opacity-45")}>
            {onSelect ? (
              <button
                type="button"
                aria-pressed={selectedKey === it.key}
                aria-label={`${it.label}: ${format(it.value)}${it.share ? `, ${pctText(it.share)}` : ""}. Show in register`}
                onClick={() => onSelect(it)}
                className="block w-full rounded-lg px-2 py-1.5 text-left hover:bg-surface-2 focus-visible:focus-ring"
              >
                {body}
              </button>
            ) : (
              <div className="px-2 py-1.5">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ------------------------------------------------------------------ */
/* Register table                                                      */
/* ------------------------------------------------------------------ */

export const REGISTER_ROW_LIMIT = 100;

export function RegisterTable({
  register,
  format,
  csvName,
  onPrint,
  caption,
  className,
}: {
  register: Register;
  format: (v: string) => string;
  csvName: string;
  onPrint?: () => void;
  caption?: ReactNode;
  className?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const rows = showAll ? register.rows : register.rows.slice(0, REGISTER_ROW_LIMIT);
  const hidden = register.rows.length - rows.length;
  const moneyCol = (i: number) =>
    register.numeric[i] && !/quantity/i.test(register.headers[i] ?? "");
  const cell = (v: string, i: number) => (moneyCol(i) && v !== "" ? format(v) : v);
  return (
    <div className={cn("min-w-0 space-y-2", className)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          {caption ?? `${plural(register.rows.length, "row")}`}
        </div>
        <div className="flex gap-1 print:hidden">
          <Button
            variant="ghost"
            size="xs"
            disabled={!register.rows.length}
            onClick={() =>
              downloadCsv(csvName, register.headers, [...register.rows, register.totals])
            }
          >
            <Download aria-hidden="true" />
            CSV
          </Button>
          {onPrint && (
            <Button variant="ghost" size="xs" disabled={!register.rows.length} onClick={onPrint}>
              <Printer aria-hidden="true" />
              Print
            </Button>
          )}
        </div>
      </div>
      {register.rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No records for this period.
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">{register.title}</caption>
            <thead className="sticky top-0 z-[1] bg-surface-2">
              <tr className="text-muted-foreground">
                {register.headers.map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className={cn(
                      "px-2.5 py-2 font-medium whitespace-nowrap",
                      register.numeric[i] ? "text-right" : "text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={register.rowIds[ri] ?? ri} className="border-t border-border/70">
                  {r.map((v, ci) => (
                    <td
                      key={ci}
                      className={cn(
                        "px-2.5 py-1.5 text-foreground",
                        register.numeric[ci]
                          ? "text-right whitespace-nowrap tabular-nums"
                          : "max-w-56 truncate",
                      )}
                      title={register.numeric[ci] ? undefined : v}
                    >
                      {cell(v, ci)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-surface-2">
              <tr className="border-t border-border-strong font-semibold">
                {register.totals.map((v, ci) => (
                  <td
                    key={ci}
                    className={cn(
                      "px-2.5 py-2 whitespace-nowrap",
                      register.numeric[ci] ? "text-right tabular-nums" : "text-left",
                    )}
                  >
                    {cell(v, ci)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {hidden > 0 && (
        <Button variant="secondary" size="sm" onClick={() => setShowAll(true)}>
          Show all {register.rows.length} rows
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

/** Inline label with a definition tooltip. */
export function Defined({ label, definition }: { label: string; definition: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {label}
      <Tooltip content={definition}>
        <button
          type="button"
          aria-label={`What is ${label}?`}
          className="inline-flex size-5 items-center justify-center rounded-full text-subtle-foreground hover:text-foreground focus-visible:focus-ring print:hidden"
        >
          <Info className="size-3.5" aria-hidden="true" />
        </button>
      </Tooltip>
    </span>
  );
}

export const DISCLAIMER =
  "Simple management view (accrual basis) — not a statutory financial statement.";

/** A figure without a comparison (point-in-time values such as receivables). */
export function StatTile({
  label,
  value,
  definition,
  note,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  definition?: string;
  note?: ReactNode;
  tone?: "default" | "danger";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-xs",
        className,
      )}
    >
      <div className="text-[13px] font-medium text-muted-foreground">
        {definition ? <Defined label={label} definition={definition} /> : label}
      </div>
      <div className="truncate text-2xl leading-tight font-semibold tracking-tight text-foreground tabular-nums">
        {value}
      </div>
      {note && (
        <div
          className={cn(
            "text-xs",
            tone === "danger" ? "text-danger-foreground" : "text-muted-foreground",
          )}
        >
          {note}
        </div>
      )}
    </div>
  );
}
