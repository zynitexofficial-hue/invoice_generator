"use client";

import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { Swatch } from "./palette";

/** A series (bars/lines) shown in the legend and tooltip. */
export interface SeriesDef {
  key: string;
  label: string;
  /** CSS colour; defaults to the palette slot for its index. */
  color?: string;
}

/** One x-axis category with a value per series key. */
export interface CategoryDatum {
  key: string;
  label: string;
  /** Short axis label (defaults to label). */
  shortLabel?: string;
  values: Record<string, number>;
}

/** One slice/segment of a part-to-whole chart. */
export interface PartDatum {
  key: string;
  label: string;
  value: number;
}

export type ValueFormatter = (value: number) => string;

/** Width of an element, tracked with ResizeObserver (fallback until measured / on the server). */
export function useElementWidth(ref: RefObject<HTMLElement | null>, fallback = 600): number {
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const w = Math.round(el.getBoundingClientRect().width);
      if (w > 0) setWidth(w);
    };
    update();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return width;
}

/** Stable, selector-safe id prefix for SVG defs. */
export function useSvgId(prefix: string): string {
  return `${prefix}${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/**
 * Tooltip anchored at a point given in % of the chart box. Purely visual
 * (aria-hidden): the focused control's own aria-label carries the same text.
 */
export function ChartTooltip({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const align = x < 18 ? "0%" : x > 82 ? "-100%" : "-50%";
  return (
    <div
      aria-hidden="true"
      className="ig-noprint pointer-events-none absolute z-10 min-w-28 rounded-lg bg-foreground px-2.5 py-1.5 text-xs leading-4 text-background shadow-md"
      style={{
        left: `${x}%`,
        top: `${y}%`,
        transform: `translate(${align}, calc(-100% - 8px))`,
      }}
    >
      {children}
    </div>
  );
}

export function TooltipRow({
  color,
  label,
  value,
}: {
  color?: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 whitespace-nowrap">
      <span className="flex items-center gap-1.5">
        {color && <span className="size-2 rounded-full" style={{ background: color }} />}
        <span className="opacity-80">{label}</span>
      </span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

/** Legend: text labels with swatches (identity is never colour alone). */
export function Legend({
  items,
  patterns,
  shape = "square",
  className,
}: {
  items: { key: string; label: string; color: string; index: number; detail?: string }[];
  patterns: boolean;
  shape?: "square" | "line";
  className?: string;
}) {
  if (items.length < 2) return null;
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5">
          <Swatch color={it.color} index={it.index} patterns={patterns} shape={shape} />
          <span className="text-foreground">{it.label}</span>
          {it.detail && <span className="tabular-nums">{it.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Transparent HTML button laid over a mark (positions in % of the chart box).
 * Gives every mark a real, keyboard-focusable control with a visible focus
 * ring and an accessible name, without making the SVG itself interactive.
 */
export function HitTarget({
  left,
  top,
  width,
  height,
  label,
  active,
  onActivate,
  onDeactivate,
  onSelect,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  active?: boolean;
  onActivate: () => void;
  onDeactivate: () => void;
  onSelect?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={onSelect ? Boolean(active) : undefined}
      tabIndex={0}
      className={cn(
        "ig-noprint absolute rounded-sm bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-surface",
        onSelect ? "cursor-pointer" : "cursor-default",
      )}
      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
      onMouseEnter={onActivate}
      onMouseLeave={onDeactivate}
      onFocus={onActivate}
      onBlur={onDeactivate}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Escape") (e.currentTarget as HTMLButtonElement).blur();
      }}
    />
  );
}

export function EmptyChart({
  height,
  message = "No data for this period",
}: {
  height: number;
  message?: string;
}) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  );
}
