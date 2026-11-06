/**
 * Pure, date-only schedule math for recurring invoices and expenses.
 *
 * Dates are ISO "yyyy-MM-dd" strings and all arithmetic is on calendar
 * numbers (year, month, day), so there is no time zone or DST effect.
 *
 * Occurrence n (0-based) of a schedule:
 *  - weekly: startDate + 7 * interval * n days.
 *  - monthly / quarterly / half-yearly / yearly: the start month plus
 *    n * interval * (1, 3, 6 or 12) months, on the anchor day, where the
 *    anchor is `dayOfMonth` (1-31) or, when 0, the day of the start date.
 *    A day the month doesn't have is clamped to the month's last day, and
 *    the anchor is never lost (31 Jan -> 28 Feb -> 31 Mar).
 * Only occurrences on or after startDate (and on or before endDate) count.
 */

import type { Recurring, RecurrenceFrequency } from "@/lib/schema";

export interface ScheduleSpec {
  frequency: RecurrenceFrequency;
  interval: number;
  startDate: string;
  /** "" = no end. */
  endDate: string;
  /** 0 = day of the start date; 1-31 = fixed day, clamped to month end. */
  dayOfMonth: number;
}

/** Most missed occurrences created in one go for one template. */
export const CATCH_UP_CAP = 12;
/** "Auto" templates create up to this many due items silently on open; more needs a confirmation. */
export const AUTO_RUN_LIMIT = 3;
const SCAN_LIMIT = 2000;

const MONTHS_PER_UNIT: Record<RecurrenceFrequency, number> = {
  weekly: 0,
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

export const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "Every 6 months",
  yearly: "Yearly",
};

/* ---------------- Calendar helpers ---------------- */

interface Ymd {
  y: number;
  m: number; // 1-12
  d: number;
}

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isLeapYear(y: number): boolean {
  return daysInMonth(y, 2) === 29;
}

export function parseYmd(iso: string): Ymd | undefined {
  const match = ISO_RE.exec(iso);
  if (!match) return undefined;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return undefined;
  return { y, m, d };
}

export function formatYmd({ y, m, d }: Ymd): string {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Whole days since 1970-01-01 for a calendar date. */
function dayNumber({ y, m, d }: Ymd): number {
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

function fromDayNumber(n: number): Ymd {
  const dt = new Date(n * 86_400_000);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

/** Calendar days from a to b (b later = positive). */
export function dayDiff(a: string, b: string): number | undefined {
  const x = parseYmd(a);
  const y = parseYmd(b);
  return x && y ? dayNumber(y) - dayNumber(x) : undefined;
}

export function addDays(iso: string, days: number): string {
  const p = parseYmd(iso);
  return p ? formatYmd(fromDayNumber(dayNumber(p) + days)) : "";
}

/* ---------------- Occurrences ---------------- */

/** Date of occurrence n (0-based), ignoring startDate/endDate filtering. "" for a bad spec. */
export function occurrenceAt(spec: ScheduleSpec, n: number): string {
  const start = parseYmd(spec.startDate);
  if (!start || n < 0) return "";
  const interval = Math.max(1, Math.floor(spec.interval) || 1);
  if (spec.frequency === "weekly") {
    return formatYmd(fromDayNumber(dayNumber(start) + 7 * interval * n));
  }
  const step = MONTHS_PER_UNIT[spec.frequency] * interval;
  const monthIndex = start.y * 12 + (start.m - 1) + n * step;
  const y = Math.floor(monthIndex / 12);
  const m = (monthIndex % 12) + 1;
  const anchor = spec.dayOfMonth > 0 ? spec.dayOfMonth : start.d;
  return formatYmd({ y, m, d: Math.min(anchor, daysInMonth(y, m)) });
}

/** A lower bound for the index of the first occurrence on or after `iso` (cheap skip-ahead). */
function indexNear(spec: ScheduleSpec, iso: string): number {
  const start = parseYmd(spec.startDate);
  const at = parseYmd(iso);
  if (!start || !at) return 0;
  const interval = Math.max(1, Math.floor(spec.interval) || 1);
  if (spec.frequency === "weekly") {
    return Math.max(0, Math.floor((dayNumber(at) - dayNumber(start)) / (7 * interval)) - 1);
  }
  const step = MONTHS_PER_UNIT[spec.frequency] * interval;
  const months = (at.y - start.y) * 12 + (at.m - start.m);
  return Math.max(0, Math.floor(months / step) - 1);
}

/**
 * Occurrence dates within [from, to] (inclusive), never before startDate or
 * after endDate, in order. Stops after `limit` dates.
 */
export function occurrencesBetween(
  spec: ScheduleSpec,
  from: string,
  to: string,
  limit = SCAN_LIMIT,
): string[] {
  if (!parseYmd(spec.startDate) || !parseYmd(from) || !parseYmd(to)) return [];
  const upper = spec.endDate && spec.endDate < to ? spec.endDate : to;
  const out: string[] = [];
  for (let n = indexNear(spec, from), guard = 0; guard < SCAN_LIMIT * 4; n++, guard++) {
    const date = occurrenceAt(spec, n);
    if (!date || date > upper) break;
    if (date >= spec.startDate && date >= from) {
      out.push(date);
      if (out.length >= limit) break;
    }
  }
  return out;
}

/** First occurrence on or after `iso`; "" if the schedule has ended by then. */
export function firstOnOrAfter(spec: ScheduleSpec, iso: string): string {
  const from = iso > spec.startDate ? iso : spec.startDate;
  if (!parseYmd(from)) return "";
  for (let n = indexNear(spec, from), guard = 0; guard < 100_000; n++, guard++) {
    const date = occurrenceAt(spec, n);
    if (!date) return "";
    if (spec.endDate && date > spec.endDate) return "";
    if (date >= from) return date;
  }
  return "";
}

/** First occurrence strictly after `iso`; "" if there is none. */
export function nextAfter(spec: ScheduleSpec, iso: string): string {
  const day = addDays(iso, 1);
  return day ? firstOnOrAfter(spec, day) : "";
}

export function specOf(r: Recurring | ScheduleSpec): ScheduleSpec {
  return {
    frequency: r.frequency,
    interval: r.interval,
    startDate: r.startDate,
    endDate: r.endDate,
    dayOfMonth: r.dayOfMonth,
  };
}

/* ---------------- Due occurrences ---------------- */

export interface DueResult {
  /** Dates to create now: the oldest `cap` missed occurrences. */
  dates: string[];
  /** All missed occurrences up to today (before the cap). */
  total: number;
  /** Missed occurrences left after this run because of the cap. */
  remaining: number;
}

/** Runs still allowed by maxRuns (Infinity when unlimited). */
export function runsLeft(r: Pick<Recurring, "maxRuns" | "runCount">): number {
  return r.maxRuns > 0 ? Math.max(0, r.maxRuns - r.runCount) : Infinity;
}

/**
 * Occurrences that have come due on or before `today` and not yet been
 * created: everything from nextRunDate (or the first occurrence when it was
 * never set). Paused templates have nothing due.
 */
export function computeDue(r: Recurring, today: string, cap: number = CATCH_UP_CAP): DueResult {
  const none: DueResult = { dates: [], total: 0, remaining: 0 };
  if (!r.active) return none;
  const spec = specOf(r);
  const from = r.nextRunDate || firstOnOrAfter(spec, r.startDate);
  if (!from) return none;
  const left = runsLeft(r);
  if (left === 0) return none;
  const all = occurrencesBetween(spec, from, today);
  const allowed = Number.isFinite(left) ? all.slice(0, left) : all;
  const dates = allowed.slice(0, Math.max(0, cap));
  return { dates, total: allowed.length, remaining: allowed.length - dates.length };
}

/**
 * The next run date after creating the occurrence on `lastDate`, given the
 * run count after that creation. "" when the schedule is finished.
 */
export function advanceNextRun(r: Recurring, lastDate: string, runCountAfter: number): string {
  if (r.maxRuns > 0 && runCountAfter >= r.maxRuns) return "";
  return nextAfter(specOf(r), lastDate);
}

export function ordinal(n: number): string {
  const v = n % 100;
  const names: Record<number, string> = { 1: "st", 2: "nd", 3: "rd" };
  const suffix = v >= 11 && v <= 13 ? "th" : (names[n % 10] ?? "th");
  return `${n}${suffix}`;
}

/** Plain-language description, e.g. "Every 2 months on the 5th". */
export function describeSchedule(
  r: Pick<Recurring, "frequency" | "interval" | "dayOfMonth" | "startDate">,
): string {
  const n = Math.max(1, r.interval);
  const unit: Record<RecurrenceFrequency, [string, string]> = {
    weekly: ["week", "weeks"],
    monthly: ["month", "months"],
    quarterly: ["quarter", "quarters"],
    half_yearly: ["6 months", "6 months"],
    yearly: ["year", "years"],
  };
  const [one, many] = unit[r.frequency];
  const every = n === 1 ? `Every ${one}` : `Every ${n} ${many}`;
  if (r.frequency === "weekly") return every;
  if (r.dayOfMonth === 31) return `${every} on the last day`;
  if (r.dayOfMonth > 0) return `${every} on the ${ordinal(r.dayOfMonth)}`;
  const start = parseYmd(r.startDate);
  return start ? `${every} on the ${ordinal(start.d)}` : every;
}
