"use client";

import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Sparkline } from "./sparkline";
import { percentLabel } from "./scale";

export interface KpiCardProps {
  label: string;
  /** Already formatted value ("₹1,23,456.00"). */
  value: string;
  /** Change in percent (e.g. 12.5 for +12.5 %); null/undefined → "—". */
  delta?: number | null;
  /** Comparison wording, e.g. "vs last month". */
  deltaLabel?: string;
  /** Whether an increase is good (sales) or bad (expenses). Default true. */
  positiveIsGood?: boolean;
  /** Metric definition shown in a tooltip (spec G4). */
  definition?: string;
  /** Optional trend values for a sparkline. */
  sparkline?: number[];
  sparklineLabel?: string;
  /** Extra line under the value (e.g. "3 overdue"). */
  footnote?: ReactNode;
  className?: string;
}

export function KpiCard({
  label,
  value,
  delta,
  deltaLabel = "vs previous period",
  positiveIsGood = true,
  definition,
  sparkline,
  sparklineLabel,
  footnote,
  className,
}: KpiCardProps) {
  const has = delta !== null && delta !== undefined && Number.isFinite(delta);
  const dir = !has ? "none" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const good = dir === "flat" || dir === "none" ? null : (dir === "up") === positiveIsGood;
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  const deltaText = has
    ? `${delta > 0 ? "+" : delta < 0 ? "−" : ""}${percentLabel(Math.abs(delta))}`
    : "—";
  const srText = has
    ? `${dir === "flat" ? "No change" : `${dir === "up" ? "Up" : "Down"} ${percentLabel(Math.abs(delta))}`} ${deltaLabel}`
    : `No comparison ${deltaLabel} (previous period is zero)`;

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border border-border bg-surface p-4 shadow-xs",
        className,
      )}
    >
      <div className="flex items-center gap-1 text-[13px] font-medium text-muted-foreground">
        <span className="truncate">{label}</span>
        {definition && (
          <Tooltip content={definition}>
            <button
              type="button"
              className="ig-noprint inline-flex size-5 shrink-0 items-center justify-center rounded-full text-subtle-foreground hover:text-foreground focus-visible:focus-ring print:hidden"
              aria-label={`What is ${label}?`}
            >
              <Info className="size-3.5" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 truncate text-2xl leading-tight font-semibold tracking-tight text-foreground tabular-nums">
          {value}
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline
            values={sparkline}
            ariaLabel={sparklineLabel ?? `${label} trend`}
            className="mb-1 shrink-0"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
        <span
          className={cn(
            "inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 font-medium tabular-nums",
            good === true && "bg-success-soft text-success-foreground",
            good === false && "bg-danger-soft text-danger-foreground",
            good === null && "bg-surface-2 text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          <span aria-hidden="true">{deltaText}</span>
          <span className="sr-only">{srText}</span>
        </span>
        <span className="text-muted-foreground" aria-hidden="true">
          {deltaLabel}
        </span>
      </div>
      {footnote && <div className="text-xs text-muted-foreground">{footnote}</div>}
    </div>
  );
}
