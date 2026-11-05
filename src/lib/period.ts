/**
 * Return/reporting periods, shared by GST returns, registers and analytics.
 *
 * Period keys (see PERIOD_KEY_RE in schema.ts):
 * - month:   "2026-10"     (calendar month)
 * - quarter: "2026-Q3"     (Indian FY quarter; the year is the FY START year,
 *                           Q1 = Apr–Jun, Q2 = Jul–Sep, Q3 = Oct–Dec, Q4 = Jan–Mar)
 * - fy:      "FY2026-27"   (1 Apr 2026 – 31 Mar 2027)
 *
 * All dates are ISO "YYYY-MM-DD" strings; comparisons are lexical, so no
 * time-zone conversion is involved.
 */

export type PeriodKind = "month" | "quarter" | "fy";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (n: number) => String(n).padStart(2, "0");

function parts(dateISO: string): { y: number; m: number } {
  const [y, m] = dateISO.split("-").map(Number);
  return { y, m };
}

/** FY start year for a date: 2026-02-10 → 2025, 2026-04-01 → 2026. */
export function fyStartYear(dateISO: string): number {
  const { y, m } = parts(dateISO);
  return m >= 4 ? y : y - 1;
}

export function fyLabel(startYear: number): string {
  return `${startYear}-${pad((startYear + 1) % 100)}`;
}

export function monthKey(dateISO: string): string {
  return dateISO.slice(0, 7);
}

/** FY quarter number (1–4) for a calendar month (1–12). */
export function fyQuarterOfMonth(month: number): number {
  return month >= 4 ? Math.floor((month - 4) / 3) + 1 : 4;
}

export function quarterKey(dateISO: string): string {
  const { m } = parts(dateISO);
  return `${fyStartYear(dateISO)}-Q${fyQuarterOfMonth(m)}`;
}

export function fyKey(dateISO: string): string {
  return `FY${fyLabel(fyStartYear(dateISO))}`;
}

export function periodKeyFor(dateISO: string, kind: PeriodKind): string {
  if (kind === "month") return monthKey(dateISO);
  if (kind === "quarter") return quarterKey(dateISO);
  return fyKey(dateISO);
}

export function periodKind(key: string): PeriodKind {
  if (key.startsWith("FY")) return "fy";
  if (key.includes("-Q")) return "quarter";
  return "month";
}

function lastDay(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar months covered by a period, as "YYYY-MM" keys in order. */
export function monthsInPeriod(key: string): string[] {
  const kind = periodKind(key);
  if (kind === "month") return [key];
  let startY: number;
  let startM: number;
  let count: number;
  if (kind === "quarter") {
    const [ys, qs] = key.split("-Q");
    const q = Number(qs);
    startY = Number(ys) + (q === 4 ? 1 : 0);
    startM = q === 4 ? 1 : 4 + (q - 1) * 3;
    count = 3;
  } else {
    startY = Number(key.slice(2, 6));
    startM = 4;
    count = 12;
  }
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const m0 = startM - 1 + i;
    out.push(`${startY + Math.floor(m0 / 12)}-${pad((m0 % 12) + 1)}`);
  }
  return out;
}

/** Inclusive date range of a period. */
export function periodRange(key: string): { start: string; end: string } {
  const months = monthsInPeriod(key);
  const first = months[0];
  const last = months[months.length - 1];
  const { y, m } = parts(`${last}-01`);
  return { start: `${first}-01`, end: `${last}-${pad(lastDay(y, m))}` };
}

export function inPeriod(dateISO: string, key: string): boolean {
  if (!dateISO) return false;
  const { start, end } = periodRange(key);
  return dateISO >= start && dateISO <= end;
}

/** Move a period forwards/backwards by `delta` periods of the same kind. */
export function shiftPeriod(key: string, delta: number): string {
  const kind = periodKind(key);
  if (kind === "month") {
    const { y, m } = parts(`${key}-01`);
    const idx = y * 12 + (m - 1) + delta;
    return `${Math.floor(idx / 12)}-${pad((idx % 12) + 1)}`;
  }
  if (kind === "quarter") {
    const [ys, qs] = key.split("-Q");
    const idx = Number(ys) * 4 + (Number(qs) - 1) + delta;
    return `${Math.floor(idx / 4)}-Q${(idx % 4) + 1}`;
  }
  const y = Number(key.slice(2, 6)) + delta;
  return `FY${fyLabel(y)}`;
}

/** "Oct 2026", "Q3 FY 2026-27 (Oct–Dec 2026)", "FY 2026-27". */
export function periodLabel(key: string): string {
  const kind = periodKind(key);
  if (kind === "month") {
    const { y, m } = parts(`${key}-01`);
    return `${MONTHS[m - 1]} ${y}`;
  }
  if (kind === "quarter") {
    const months = monthsInPeriod(key);
    const a = parts(`${months[0]}-01`);
    const b = parts(`${months[2]}-01`);
    const fy = fyLabel(Number(key.split("-Q")[0]));
    return `Q${key.split("-Q")[1]} FY ${fy} (${MONTHS[a.m - 1]}–${MONTHS[b.m - 1]} ${b.y})`;
  }
  return `FY ${key.slice(2)}`;
}

/** The period of the given kind that contains `todayISO`. */
export function currentPeriod(kind: PeriodKind, todayISO: string): string {
  return periodKeyFor(todayISO, kind);
}
