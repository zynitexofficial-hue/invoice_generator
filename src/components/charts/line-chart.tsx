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
  type CategoryDatum,
  type SeriesDef,
  type ValueFormatter,
} from "./internals";
import { ChartStyles, seriesColor } from "./palette";
import { compactInr, describeExtremes, fullInr, labelEvery, linearScale, niceTicks } from "./scale";

export interface LineChartProps {
  /** Points in x order (e.g. months). */
  data: CategoryDatum[];
  series: SeriesDef[];
  height?: number;
  ariaLabel?: string;
  formatValue?: ValueFormatter;
  formatAxis?: ValueFormatter;
  /** Drill-down: called with the activated x position. */
  onSelect?: (datum: CategoryDatum) => void;
  selectedKey?: string | null;
  showLegend?: boolean;
  emptyMessage?: string;
  className?: string;
}

const M = { top: 12, right: 12, bottom: 26, left: 52 };
/** Line styles per series index so lines differ by more than colour. */
const DASHES = [undefined, "6 4", "2 3"];

export function LineChart({
  data,
  series,
  height = 220,
  ariaLabel,
  formatValue = fullInr,
  formatAxis = compactInr,
  onSelect,
  selectedKey,
  showLegend = true,
  emptyMessage,
  className,
}: LineChartProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const W = useElementWidth(boxRef);
  const [active, setActive] = useState<number | null>(null);

  const values = data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0));
  const empty = data.length === 0 || values.every((v) => v === 0);
  const colors = series.map((s, i) => seriesColor(i, s.color));

  const H = height;
  const pw = Math.max(10, W - M.left - M.right);
  const ph = Math.max(10, H - M.top - M.bottom);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(0, ...values));
  const y = linearScale([ticks[0], ticks[ticks.length - 1]], [M.top + ph, M.top]);
  const step = data.length > 1 ? pw / (data.length - 1) : 0;
  const x = (i: number) => (data.length > 1 ? M.left + i * step : M.left + pw / 2);
  const colW = data.length > 1 ? step : pw;
  const every = labelEvery(data.length, pw, 52);
  const cross = active ?? (selectedKey ? data.findIndex((d) => d.key === selectedKey) : -1);
  /** Hit column for point i, clamped to the plot area. */
  const col = (i: number) => {
    const l = Math.max(M.left, x(i) - colW / 2);
    const r = Math.min(M.left + pw, x(i) + colW / 2);
    return { left: (l / W) * 100, width: ((r - l) / W) * 100 };
  };

  const summary =
    ariaLabel ??
    `Line chart of ${series.map((s) => s.label).join(", ")} over ${data.length} points` +
      (data.length ? ` from ${data[0].label} to ${data[data.length - 1].label}. ` : ". ") +
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
          patterns={false}
          shape="line"
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
              {ticks.map((t) => (
                <g key={t}>
                  <line
                    x1={M.left}
                    x2={M.left + pw}
                    y1={y(t)}
                    y2={y(t)}
                    strokeWidth={t === 0 ? 1.25 : 1}
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
              {data.map(
                (d, i) =>
                  i % every === 0 && (
                    <text
                      key={d.key}
                      x={x(i)}
                      y={H - 8}
                      textAnchor={data.length > 1 && i === 0 ? "start" : "middle"}
                      fontSize={11}
                      style={{ fill: "var(--ig-axis)" }}
                    >
                      {d.shortLabel ?? d.label}
                    </text>
                  ),
              )}
              {cross >= 0 && (
                <line
                  className="ig-noprint"
                  x1={x(cross)}
                  x2={x(cross)}
                  y1={M.top}
                  y2={M.top + ph}
                  strokeWidth={1}
                  style={{ stroke: "var(--ig-axis)", strokeOpacity: 0.5 }}
                />
              )}
              {series.map((s, si) => {
                const d = data
                  .map(
                    (p, i) =>
                      `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(p.values[s.key] ?? 0).toFixed(2)}`,
                  )
                  .join("");
                return (
                  <path
                    key={s.key}
                    className="ig-mark"
                    d={d}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={DASHES[si % DASHES.length]}
                    style={{ stroke: colors[si] }}
                  />
                );
              })}
              {series.map((s, si) =>
                data.map((p, i) =>
                  data.length === 1 || i === active ? (
                    <circle
                      key={`${s.key}:${p.key}`}
                      cx={x(i)}
                      cy={y(p.values[s.key] ?? 0)}
                      r={4}
                      strokeWidth={2}
                      style={{ fill: colors[si], stroke: "var(--surface)" }}
                    />
                  ) : null,
                ),
              )}
            </svg>
            {data.map((d, i) => (
              <HitTarget
                key={d.key}
                left={col(i).left}
                top={(M.top / H) * 100}
                width={col(i).width}
                height={(ph / H) * 100}
                label={`${d.label}: ${series.map((s) => `${s.label} ${formatValue(d.values[s.key] ?? 0)}`).join(", ")}`}
                active={selectedKey === d.key}
                onActivate={() => setActive(i)}
                onDeactivate={() => setActive(null)}
                onSelect={onSelect ? () => onSelect(d) : undefined}
              />
            ))}
            {active !== null && data[active] && (
              <ChartTooltip
                x={(x(active) / W) * 100}
                y={(Math.min(...series.map((s) => y(data[active].values[s.key] ?? 0))) / H) * 100}
              >
                <div className="mb-0.5 font-semibold">{data[active].label}</div>
                {series.map((s, si) => (
                  <TooltipRow
                    key={s.key}
                    color={colors[si]}
                    label={s.label}
                    value={formatValue(data[active].values[s.key] ?? 0)}
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
