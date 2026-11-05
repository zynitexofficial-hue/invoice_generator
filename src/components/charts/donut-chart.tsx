"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyChart, useSvgId, type PartDatum, type ValueFormatter } from "./internals";
import { ChartStyles, PatternDefs, Swatch, fillFor, seriesColor } from "./palette";
import { arcPath, cumulative, fullInr, percentLabel } from "./scale";

export interface DonutChartProps {
  /** Slices in display order (largest first reads best); negatives are drawn as zero. */
  data: (PartDatum & { color?: string })[];
  /** Big text in the hole (e.g. the formatted total). */
  centerValue?: string;
  /** Small caption under it (e.g. "Total sales"). */
  centerLabel?: string;
  /** Diameter in px (the SVG scales down on narrow screens). */
  size?: number;
  ariaLabel?: string;
  formatValue?: ValueFormatter;
  onSelect?: (datum: PartDatum) => void;
  selectedKey?: string | null;
  /** Texture fills (default true). */
  patterns?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 168,
  ariaLabel,
  formatValue = fullInr,
  onSelect,
  selectedKey,
  patterns = true,
  emptyMessage,
  className,
}: DonutChartProps) {
  const id = useSvgId("donut");
  const [active, setActive] = useState<string | null>(null);
  const parts = data.map((d) => ({ ...d, v: Math.max(0, d.value) }));
  const total = parts.reduce((s, p) => s + p.v, 0);
  const colors = data.map((d, i) => seriesColor(i, d.color, d.key));

  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const summary =
    ariaLabel ??
    `Donut chart${centerLabel ? ` of ${centerLabel}` : ""}${centerValue ? `, total ${centerValue}` : ""}. ` +
      parts.map((p) => `${p.label} ${percentLabel(share(p.v))}`).join(", ") +
      ".";

  if (total <= 0) {
    return (
      <div className={cn("ig-chart", className)}>
        <EmptyChart height={size} message={emptyMessage} />
      </div>
    );
  }

  const c = size / 2;
  const r = c - 2;
  const inner = r * 0.62;
  const ends = cumulative(parts.map((p) => (p.v / total) * Math.PI * 2));
  const arcs = parts.map((p, i) => ({
    ...p,
    i,
    d: arcPath(c, c, r, inner, i ? ends[i - 1] : 0, ends[i]),
  }));
  const focus = active ?? selectedKey ?? null;

  return (
    <div
      className={cn(
        "ig-chart flex flex-col items-center gap-4 sm:flex-row sm:items-start",
        className,
      )}
    >
      <ChartStyles />
      <div className="relative shrink-0" style={{ width: size, maxWidth: "100%" }}>
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="block h-auto w-full"
          role="img"
          aria-label={summary}
        >
          {patterns && <PatternDefs id={id} colors={colors} />}
          {arcs.map((a) => (
            <path
              key={a.key}
              d={a.d}
              className={cn("ig-mark", focus !== null && focus !== a.key && "ig-dim")}
              strokeWidth={a.v / total < 0.999 ? 2 : 0}
              style={{ fill: fillFor(id, a.i, colors[a.i], patterns), stroke: "var(--surface)" }}
              onMouseEnter={() => setActive(a.key)}
              onMouseLeave={() => setActive(null)}
              onClick={onSelect ? () => onSelect(data[a.i]) : undefined}
              cursor={onSelect ? "pointer" : undefined}
            />
          ))}
        </svg>
        {(centerValue || centerLabel) && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center"
          >
            {(() => {
              const a = focus ? arcs.find((x) => x.key === focus) : undefined;
              return (
                <>
                  <span className="text-base leading-tight font-semibold text-foreground tabular-nums">
                    {a ? percentLabel(share(a.v)) : centerValue}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[11px] leading-tight text-muted-foreground">
                    {a ? a.label : centerLabel}
                  </span>
                </>
              );
            })()}
          </div>
        )}
      </div>
      <ul className="flex w-full min-w-0 flex-col gap-0.5 text-sm">
        {arcs.map((a) => {
          const content = (
            <>
              <Swatch color={colors[a.i]} index={a.i} patterns={patterns} />
              <span className="min-w-0 flex-1 truncate text-left text-foreground">{a.label}</span>
              <span className="text-muted-foreground tabular-nums">{percentLabel(share(a.v))}</span>
              <span className="shrink-0 text-right font-medium text-foreground tabular-nums">
                {formatValue(a.value)}
              </span>
            </>
          );
          const cls = cn(
            "flex w-full items-center gap-2 rounded-md px-1.5 py-1 outline-none focus-visible:focus-ring",
            focus === a.key && "bg-surface-2",
          );
          return (
            <li key={a.key}>
              {onSelect ? (
                <button
                  type="button"
                  className={cn(cls, "hover:bg-surface-2")}
                  aria-pressed={selectedKey === a.key}
                  aria-label={`${a.label}: ${formatValue(a.value)}, ${percentLabel(share(a.v))}`}
                  onMouseEnter={() => setActive(a.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(a.key)}
                  onBlur={() => setActive(null)}
                  onClick={() => onSelect(data[a.i])}
                >
                  {content}
                </button>
              ) : (
                <div
                  className={cls}
                  tabIndex={0}
                  onMouseEnter={() => setActive(a.key)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(a.key)}
                  onBlur={() => setActive(null)}
                >
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
