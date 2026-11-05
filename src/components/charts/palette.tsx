"use client";

/**
 * Chart palette, textures and shared styles.
 *
 * Colours are CSS variables scoped to `.ig-chart`. Each slot first honours a
 * global `--chart-N` token (globals.css can define these to re-theme every
 * chart) and otherwise falls back to a CVD-checked categorical palette with
 * separate light and dark steps. Text and axes use the app's existing
 * foreground/border tokens, so charts follow light/dark automatically.
 */
import { useId, type CSSProperties } from "react";

export const SERIES_COUNT = 5;

const CSS = `
.ig-chart{--ig-c1:var(--chart-1,#2a78d6);--ig-c2:var(--chart-2,#eb6834);--ig-c3:var(--chart-3,#1baf7a);--ig-c4:var(--chart-4,#eda100);--ig-c5:var(--chart-5,#e87ba4);--ig-other:var(--chart-other,var(--subtle-foreground));--ig-grid:var(--border);--ig-axis:var(--muted-foreground);--ig-zero:var(--border-strong);--ig-texture:var(--surface)}
.dark .ig-chart{--ig-c1:var(--chart-1,#3987e5);--ig-c2:var(--chart-2,#d95926);--ig-c3:var(--chart-3,#199e70);--ig-c4:var(--chart-4,#c98500);--ig-c5:var(--chart-5,#d55181)}
.ig-chart .ig-mark{transition:opacity .15s ease-out}
.ig-chart .ig-dim{opacity:.35}
@media (prefers-reduced-motion:reduce){.ig-chart .ig-mark{transition:none}}
@media print{.ig-chart{print-color-adjust:exact;-webkit-print-color-adjust:exact}.ig-chart .ig-noprint{display:none!important}.ig-chart .ig-dim{opacity:1}}
@media (forced-colors:active){.ig-chart .ig-mark{stroke:CanvasText;stroke-width:1}}
`;

/** Injects the chart CSS once (React 19 dedupes <style> by href). */
export function ChartStyles() {
  return (
    <style href="ig-chart-styles" precedence="default">
      {CSS}
    </style>
  );
}

/** Colour for series/segment index `i`; `key === "__other"` gets the neutral "Other" colour. */
export function seriesColor(i: number, override?: string, key?: string): string {
  if (override) return override;
  if (key === "__other") return "var(--ig-other)";
  return `var(--ig-c${(i % SERIES_COUNT) + 1})`;
}

type Texture = "none" | "diag" | "back" | "dots" | "horiz" | "vert";
const TEXTURES: Texture[] = ["none", "diag", "back", "dots", "horiz", "vert"];

export const textureFor = (i: number): Texture => TEXTURES[i % TEXTURES.length];

/**
 * <pattern> definitions: series colour + a light texture, so series stay
 * distinguishable without colour (print, colour-vision deficiency).
 */
export function PatternDefs({ id, colors }: { id: string; colors: string[] }) {
  return (
    <defs>
      {colors.map((color, i) => {
        const t = textureFor(i);
        const lineStyle: CSSProperties = { stroke: "var(--ig-texture)", strokeOpacity: 0.55 };
        return (
          <pattern
            key={i}
            id={`${id}-p${i}`}
            width={6}
            height={6}
            patternUnits="userSpaceOnUse"
            patternTransform={
              t === "diag" ? "rotate(45)" : t === "back" ? "rotate(-45)" : undefined
            }
          >
            <rect width={6} height={6} style={{ fill: color }} />
            {(t === "diag" || t === "back" || t === "vert") && (
              <line x1={1} y1={0} x2={1} y2={6} strokeWidth={1.5} style={lineStyle} />
            )}
            {t === "horiz" && (
              <line x1={0} y1={1} x2={6} y2={1} strokeWidth={1.5} style={lineStyle} />
            )}
            {t === "dots" && (
              <circle
                cx={3}
                cy={3}
                r={1.1}
                style={{ fill: "var(--ig-texture)", fillOpacity: 0.6 }}
              />
            )}
          </pattern>
        );
      })}
    </defs>
  );
}

/** Fill for series `i`: its texture pattern when enabled, else the flat colour. */
export function fillFor(id: string, i: number, color: string, patterns: boolean): string {
  return patterns && textureFor(i) !== "none" ? `url(#${id}-p${i})` : color;
}

/** Legend swatch that mirrors the mark (flat colour or texture). */
export function Swatch({
  color,
  index,
  patterns,
  shape = "square",
}: {
  color: string;
  index: number;
  patterns: boolean;
  shape?: "square" | "line";
}) {
  const uid = useId();
  if (shape === "line") {
    return (
      <svg width={16} height={10} aria-hidden="true" className="shrink-0">
        <line
          x1={1}
          x2={15}
          y1={5}
          y2={5}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={index % 3 === 1 ? "4 3" : index % 3 === 2 ? "1 3" : undefined}
          style={{ stroke: color }}
        />
      </svg>
    );
  }
  const id = `sw${uid.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg width={12} height={12} aria-hidden="true" className="shrink-0 rounded-[3px]">
      {patterns && <PatternDefs id={id} colors={Array.from({ length: index + 1 }, () => color)} />}
      <rect width={12} height={12} rx={3} style={{ fill: fillFor(id, index, color, patterns) }} />
    </svg>
  );
}
