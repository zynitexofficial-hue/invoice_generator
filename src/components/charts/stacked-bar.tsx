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
  type PartDatum,
  type ValueFormatter,
} from "./internals";
import { ChartStyles, PatternDefs, fillFor, seriesColor } from "./palette";
import { cumulative, fullInr, percentLabel } from "./scale";

export interface StackedBarProps {
  /** Segments in order (e.g. ageing buckets 0–30 → 90+, or B2B/B2C/Export). */
  data: (PartDatum & { color?: string })[];
  /** Bar thickness in px. */
  height?: number;
  ariaLabel?: string;
  formatValue?: ValueFormatter;
  onSelect?: (datum: PartDatum) => void;
  selectedKey?: string | null;
  /** Texture fills (default true). */
  patterns?: boolean;
  showLegend?: boolean;
  emptyMessage?: string;
  className?: string;
}

/** Horizontal 100 % stacked bar for mixes and ageing. Negative values count as zero. */
export function StackedBar({
  data,
  height = 28,
  ariaLabel,
  formatValue = fullInr,
  onSelect,
  selectedKey,
  patterns = true,
  showLegend = true,
  emptyMessage,
  className,
}: StackedBarProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const W = useElementWidth(boxRef);
  const id = useSvgId("stack");
  const [active, setActive] = useState<number | null>(null);

  const parts = data.map((d) => ({ ...d, v: Math.max(0, d.value) }));
  const total = parts.reduce((s, p) => s + p.v, 0);
  const colors = data.map((d, i) => seriesColor(i, d.color, d.key));
  const share = (v: number) => (total > 0 ? (v / total) * 100 : 0);
  const H = height;
  const GAP = 2;

  const widths = parts.map((p) => (total > 0 ? (p.v / total) * W : 0));
  const ends = cumulative(widths);
  const segs = parts.map((p, i) => ({ ...p, i, x: ends[i] - widths[i], w: widths[i] }));
  const visible = segs.filter((s) => s.w > 0);
  const lastIdx = visible[visible.length - 1]?.i;

  const summary =
    ariaLabel ??
    `Stacked bar, total ${formatValue(total)}: ` +
      parts
        .map((p) => `${p.label} ${formatValue(p.value)} (${percentLabel(share(p.v))})`)
        .join(", ") +
      ".";

  return (
    <div className={cn("ig-chart flex flex-col gap-2", className)}>
      <ChartStyles />
      <div ref={boxRef} className="relative">
        {total <= 0 ? (
          <EmptyChart height={Math.max(H, 48)} message={emptyMessage} />
        ) : (
          <>
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="block h-auto w-full"
              role="img"
              aria-label={summary}
            >
              {patterns && <PatternDefs id={id} colors={colors} />}
              <clipPath id={`${id}-clip`}>
                <rect width={W} height={H} rx={4} />
              </clipPath>
              <g clipPath={`url(#${id}-clip)`}>
                {visible.map((s) => {
                  const gapAfter = s.i === lastIdx ? 0 : GAP;
                  const sel = selectedKey ?? null;
                  const dim =
                    (active !== null && active !== s.i) || (sel !== null && sel !== s.key);
                  return (
                    <g key={s.key}>
                      <rect
                        className={cn("ig-mark", dim && "ig-dim")}
                        x={s.x}
                        y={0}
                        width={Math.max(0, s.w - gapAfter)}
                        height={H}
                        style={{ fill: fillFor(id, s.i, colors[s.i], patterns) }}
                      />
                      {s.w > 44 && (
                        <text
                          x={s.x + (s.w - gapAfter) / 2}
                          y={H / 2}
                          dy="0.35em"
                          textAnchor="middle"
                          fontSize={11}
                          fontWeight={600}
                          className="tabular-nums"
                          style={{ fill: "var(--surface)", paintOrder: "stroke" }}
                          stroke={colors[s.i]}
                          strokeWidth={3}
                        >
                          {percentLabel(share(s.v), 0)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
            {visible.map((s) => (
              <HitTarget
                key={s.key}
                left={(s.x / W) * 100}
                top={0}
                width={(s.w / W) * 100}
                height={100}
                label={`${s.label}: ${formatValue(s.value)}, ${percentLabel(share(s.v))}`}
                active={selectedKey === s.key}
                onActivate={() => setActive(s.i)}
                onDeactivate={() => setActive(null)}
                onSelect={onSelect ? () => onSelect(data[s.i]) : undefined}
              />
            ))}
            {active !== null && segs[active] && (
              <ChartTooltip x={((segs[active].x + segs[active].w / 2) / W) * 100} y={0}>
                <TooltipRow
                  color={colors[active]}
                  label={segs[active].label}
                  value={`${formatValue(segs[active].value)} · ${percentLabel(share(segs[active].v))}`}
                />
              </ChartTooltip>
            )}
          </>
        )}
      </div>
      {showLegend && total > 0 && (
        <Legend
          patterns={patterns}
          items={parts.map((p, i) => ({
            key: p.key,
            label: p.label,
            color: colors[i],
            index: i,
            detail: percentLabel(share(p.v)),
          }))}
        />
      )}
    </div>
  );
}
