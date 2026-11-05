"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  ChartTooltip,
  EmptyChart,
  HitTarget,
  Legend,
  TooltipRow,
  useElementWidth,
  useSvgId,
  type CategoryDatum,
  type SeriesDef,
  type ValueFormatter,
} from "./internals";
import { ChartStyles, PatternDefs, fillFor, seriesColor } from "./palette";
import {
  bandScale,
  barPath,
  compactInr,
  describeExtremes,
  fullInr,
  labelEvery,
  linearScale,
  niceTicks,
} from "./scale";

export interface BarChartProps {
  data: CategoryDatum[];
  /** One series = simple bars; two or more = grouped bars (e.g. revenue vs expenses). */
  series: SeriesDef[];
  height?: number;
  /** Overrides the generated text summary on the <svg>. */
  ariaLabel?: string;
  /** Tooltip / accessible value format (default: full ₹ amount). */
  formatValue?: ValueFormatter;
  /** Y-axis tick format (default: compact ₹1.2L). */
  formatAxis?: ValueFormatter;
  /** Drill-down: called with the datum and series key of the activated bar. */
  onSelect?: (datum: CategoryDatum, seriesKey: string) => void;
  /** Highlights one category (others are dimmed). */
  selectedKey?: string | null;
  /** Texture fills for series after the first (default true when grouped). */
  patterns?: boolean;
  showLegend?: boolean;
  emptyMessage?: string;
  className?: string;
}

const M = { top: 12, right: 8, bottom: 26, left: 52 };

export function BarChart({
  data,
  series,
  height = 220,
  ariaLabel,
  formatValue = fullInr,
  formatAxis = compactInr,
  onSelect,
  selectedKey,
  patterns = series.length > 1,
  showLegend = true,
  emptyMessage,
  className,
}: BarChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const W = useElementWidth(boxRef);
  const id = useSvgId("bar");
  const [active, setActive] = useState<{ c: number; s: number } | null>(null);

  const values = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
  const empty = data.length === 0 || values.every((v) => v === 0);
  const colors = series.map((s, i) => seriesColor(i, s.color));

  const H = height;
  const pw = Math.max(10, W - M.left - M.right);
  const ph = Math.max(10, H - M.top - M.bottom);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const y = linearScale([ticks[0], ticks[ticks.length - 1]], [M.top + ph, M.top]);
  const band = bandScale(data.length, pw, series.length > 1 ? 0.24 : 0.36);
  const gap = series.length > 1 ? 2 : 0;
  const bw = Math.max(1, (band.bandwidth - gap * (series.length - 1)) / Math.max(1, series.length));
  const every = labelEvery(data.length, pw, 52);
  const barX = (c: number, s: number) => M.left + band.x(c) + s * (bw + gap);

  const summary =
    ariaLabel ??
    `Bar chart of ${series.map((s) => s.label).join(" and ")} across ${data.length} ${data.length === 1 ? "category" : "categories"}. ` +
      series
        .map(
          (s) =>
            `${s.label}: ${describeExtremes(
              data.map((d) => ({ label: d.label, value: d.values[s.key] ?? 0 })),
              formatValue,
            )}.`,
        )
        .join(" ");

  return (
    <div className={cn("ig-chart flex flex-col gap-2", className)}>
      <ChartStyles />
      {showLegend && (
        <Legend
          patterns={patterns}
          items={series.map((s, i) => ({ key: s.key, label: s.label, color: colors[i], index: i }))}
        />
      )}
      <div ref={boxRef} className="relative">
        {empty ? (
          <EmptyChart height={H} message={emptyMessage} />
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full overflow-visible"
              role="img"
              aria-label={summary}
            >
              {patterns && <PatternDefs id={id} colors={colors} />}
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={M.left}
                    x2={M.left + pw}
                    y1={y(t)}
                    y2={y(t)}
                    strokeWidth={1}
                    strokeDasharray={t === 0 ? undefined : "2 3"}
                    style={{ stroke: t === 0 ? "var(--ig-zero)" : "var(--ig-grid)" }}
                  />
                  <text
                    x={M.left - 6}
                    y={y(t)}
                    dy="0.32em"
                    textAnchor="end"
                    fontSize={11}
                    style={{ fill: "var(--ig-axis)" }}
                    className="tabular-nums"
                  >
                    {formatAxis(t)}
                  </text>
                </g>
              ))}
              {data.map((d, c) => (
                <g key={d.key}>
                  {series.map((s, si) => {
                    const v = d.values[s.key] ?? 0;
                    const dim =
                      (selectedKey != null && selectedKey !== d.key) ||
                      (active !== null && (active.c !== c || active.s !== si));
                    return (
                      <path
                        key={s.key}
                        className={cn("ig-mark", dim && "ig-dim")}
                        d={barPath(barX(c, si), y(0), y(v), bw)}
                        style={{ fill: fillFor(id, si, colors[si], patterns) }}
                      />
                    );
                  })}
                  {c % every === 0 && (
                    <text
                      x={M.left + band.x(c) + band.bandwidth / 2}
                      y={H - 8}
                      textAnchor="middle"
                      fontSize={11}
                      style={{ fill: "var(--ig-axis)" }}
                    >
                      {d.shortLabel ?? d.label}
                    </text>
                  )}
                </g>
              ))}
            </svg>
            {data.map((d, c) =>
              series.map((s, si) => (
                <HitTarget
                  key={`${d.key}:${s.key}`}
                  left={((barX(c, si) - gap / 2) / W) * 100}
                  top={(M.top / H) * 100}
                  width={((bw + gap) / W) * 100}
                  height={(ph / H) * 100}
                  label={`${d.label}, ${s.label}: ${formatValue(d.values[s.key] ?? 0)}`}
                  active={selectedKey === d.key}
                  onActivate={() => setActive({ c, s: si })}
                  onDeactivate={() => setActive(null)}
                  onSelect={onSelect ? () => onSelect(d, s.key) : undefined}
                />
              )),
            )}
            {active && data[active.c] && (
              <ChartTooltip
                x={((barX(active.c, 0) + band.bandwidth / 2) / W) * 100}
                y={
                  (Math.min(
                    ...series.map((s) => y(Math.max(0, data[active.c].values[s.key] ?? 0))),
                  ) /
                    H) *
                  100
                }
              >
                <div className="mb-0.5 font-semibold">{data[active.c].label}</div>
                {series.map((s, si) => (
                  <TooltipRow
                    key={s.key}
                    color={colors[si]}
                    label={s.label}
                    value={formatValue(data[active.c].values[s.key] ?? 0)}
                  />
                ))}
              </ChartTooltip>
            )}
          </>
        )}
      </div>
    </div>
  );
}
