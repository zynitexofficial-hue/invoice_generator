/**
 * Pure scale, tick and label helpers shared by the SVG charts (no DOM, no React).
 */
import { formatMoney, formatQuantity } from "@/lib/format";

/** "Nice" step (1, 2, 2.5, 5 × 10ⁿ) near `rough`. */
function niceStep(rough: number): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1;
  const exp = Math.floor(Math.log10(rough));
  const base = 10 ** exp;
  const f = rough / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Round tick values covering [min, max], always including 0 when the range
 * spans or touches it. Returns at least two ticks; an empty range (all zero)
 * gives [0, 1].
 */
export function niceTicks(min: number, max: number, count = 5): number[] {
  let lo = Math.min(min, max, 0);
  let hi = Math.max(min, max, 0);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [0, 1];
  if (lo === hi) {
    if (hi === 0) return [0, 1];
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  const step = niceStep((hi - lo) / Math.max(1, count - 1));
  const start = Math.floor(lo / step) * step;
  const end = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    // Strip float noise (0.1 + 0.2).
    ticks.push(Number(v.toPrecision(12)) || 0);
  }
  return ticks;
}

/** Linear map from a domain to a range. */
export function linearScale(domain: [number, number], range: [number, number]) {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  return (v: number) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** Positions of `n` bands across `width` with an inner padding ratio. */
export function bandScale(n: number, width: number, padding = 0.3) {
  const step = n > 0 ? width / n : width;
  const bandwidth = step * (1 - padding);
  return {
    step,
    bandwidth,
    x: (i: number) => i * step + (step - bandwidth) / 2,
  };
}

const trimZero = (s: string) => s.replace(/\.0(?=\D*$)/, "");

/**
 * Compact Indian-rupee label: ₹950, ₹12K, ₹1.2L, ₹3.4Cr, ₹1,250Cr.
 * One decimal at most; negatives as −₹1.2L.
 */
export function compactInr(value: number): string {
  if (!Number.isFinite(value)) return "₹0";
  const sign = value < 0 ? "−" : "";
  const a = Math.abs(value);
  let body: string;
  if (a < 1_000) body = `₹${trimZero(a.toFixed(a < 10 && a % 1 ? 1 : 0))}`;
  else if (a < 1_00_000) body = `₹${trimZero((a / 1_000).toFixed(1))}K`;
  else if (a < 1_00_00_000) body = `₹${trimZero((a / 1_00_000).toFixed(1))}L`;
  else {
    const cr = a / 1_00_00_000;
    body = cr >= 1000 ? `₹${formatQuantity(cr.toFixed(0))}Cr` : `₹${trimZero(cr.toFixed(1))}Cr`;
  }
  // Rounding can land on the next unit (99,990 → "₹100K"); promote it.
  if (body === "₹1000") body = "₹1K";
  if (body === "₹100K") body = "₹1L";
  if (body === "₹100L") body = "₹1Cr";
  return sign + body;
}

/** Full rupee amount with Indian grouping: ₹12,34,567.00. */
export function fullInr(value: number): string {
  return formatMoney(String(round2(value)), "INR");
}

/** Plain percentage label: "12.5%". */
export function percentLabel(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(digits))}%`;
}

export function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

/** Parse a fixed-point money string for plotting (display only; never for arithmetic). */
export function toNumber(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** Show every k-th category label so labels of ~`labelWidth` px don't collide. */
export function labelEvery(n: number, width: number, labelWidth = 44): number {
  if (n <= 0) return 1;
  const fit = Math.max(1, Math.floor(width / labelWidth));
  return Math.max(1, Math.ceil(n / fit));
}

/** SVG path for a bar with rounded corners only at its data end (away from the baseline). */
export function barPath(x: number, y0: number, y1: number, w: number, r = 3): string {
  const top = Math.min(y0, y1);
  const h = Math.abs(y1 - y0);
  if (h <= 0 || w <= 0) return "";
  const rr = Math.min(r, w / 2, h);
  const up = y1 <= y0; // data end is at the top
  if (up) {
    return `M${x},${top + h}V${top + rr}Q${x},${top} ${x + rr},${top}H${x + w - rr}Q${x + w},${top} ${x + w},${top + rr}V${top + h}Z`;
  }
  const bottom = top + h;
  return `M${x},${top}V${bottom - rr}Q${x},${bottom} ${x + rr},${bottom}H${x + w - rr}Q${x + w},${bottom} ${x + w},${bottom - rr}V${top}Z`;
}

/** SVG path for a donut segment between two angles (radians, 0 = 12 o'clock, clockwise). */
export function arcPath(
  cx: number,
  cy: number,
  r: number,
  inner: number,
  a0: number,
  a1: number,
): string {
  const sweep = a1 - a0;
  if (sweep <= 0) return "";
  // A full circle can't be drawn with one arc; split it.
  if (sweep >= Math.PI * 2 - 1e-9) {
    const mid = a0 + Math.PI;
    return `${arcPath(cx, cy, r, inner, a0, mid)}${arcPath(cx, cy, r, inner, mid, a1)}`;
  }
  const pt = (rad: number, a: number) => [cx + rad * Math.sin(a), cy - rad * Math.cos(a)];
  const large = sweep > Math.PI ? 1 : 0;
  const [x0, y0] = pt(r, a0);
  const [x1, y1] = pt(r, a1);
  const [x2, y2] = pt(inner, a1);
  const [x3, y3] = pt(inner, a0);
  const f = (n: number) => Number(n.toFixed(3));
  return (
    `M${f(x0)},${f(y0)}A${r},${r} 0 ${large} 1 ${f(x1)},${f(y1)}` +
    `L${f(x2)},${f(y2)}A${inner},${inner} 0 ${large} 0 ${f(x3)},${f(y3)}Z`
  );
}

/** Plain-language range summary for aria-labels: "from ₹1.2L (Apr) to ₹3.4L (Sep)". */
export function describeExtremes(
  points: { label: string; value: number }[],
  format: (n: number) => string = compactInr,
): string {
  if (!points.length) return "no data";
  let lo = points[0];
  let hi = points[0];
  for (const p of points) {
    if (p.value < lo.value) lo = p;
    if (p.value > hi.value) hi = p;
  }
  if (lo === hi) return `${format(hi.value)} (${hi.label})`;
  return `highest ${format(hi.value)} (${hi.label}), lowest ${format(lo.value)} (${lo.label})`;
}

/** Running totals: [1, 2, 3] → [1, 3, 6]. */
export function cumulative(values: number[]): number[] {
  const out: number[] = [];
  values.forEach((v, i) => out.push((i ? out[i - 1] : 0) + v));
  return out;
}
