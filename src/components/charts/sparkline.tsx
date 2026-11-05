"use client";

import { cn } from "@/lib/utils";
import { ChartStyles } from "./palette";
import { linearScale } from "./scale";

export interface SparklineProps {
  values: number[];
  /** Required text alternative, e.g. "Sales, last 6 months: rising from ₹1.2L to ₹2.4L". */
  ariaLabel: string;
  width?: number;
  height?: number;
  /** Stroke colour (CSS); defaults to the first series colour. */
  color?: string;
  className?: string;
}

/** Tiny trend line with an end marker; draws a zero line when values cross zero. */
export function Sparkline({
  values,
  ariaLabel,
  width = 96,
  height = 28,
  color = "var(--ig-c1)",
  className,
}: SparklineProps) {
  const pad = 3;
  const n = values.length;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const y = linearScale([min, max === min ? min + 1 : max], [height - pad, pad]);
  const x = (i: number) => (n > 1 ? pad + (i * (width - pad * 2)) / (n - 1) : width / 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join("");

  return (
    <span className={cn("ig-chart inline-block", className)}>
      <ChartStyles />
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={ariaLabel}
        className="block max-w-full overflow-visible"
      >
        {min < 0 && (
          <line
            x1={0}
            x2={width}
            y1={y(0)}
            y2={y(0)}
            strokeWidth={1}
            style={{ stroke: "var(--ig-zero)" }}
          />
        )}
        {n > 0 && (
          <>
            <path
              d={d}
              fill="none"
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              style={{ stroke: color }}
            />
            <circle cx={x(n - 1)} cy={y(values[n - 1])} r={2.5} style={{ fill: color }} />
          </>
        )}
      </svg>
    </span>
  );
}
