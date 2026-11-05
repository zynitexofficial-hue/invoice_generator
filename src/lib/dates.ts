import { addDays as addDaysFns, format, isValid, parse } from "date-fns";
import type { DateFormatId } from "@/lib/schema";

const ISO = "yyyy-MM-dd";

/** Today's local date as YYYY-MM-DD (never UTC-shifted). */
export function todayISO(now = new Date()): string {
  return format(now, ISO);
}

export function parseISODate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const d = parse(iso, ISO, new Date());
  return isValid(d) ? d : undefined;
}

export function toISODate(date: Date): string {
  return format(date, ISO);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  return d ? toISODate(addDaysFns(d, days)) : "";
}

export function formatDate(iso: string, fmt: DateFormatId): string {
  const d = parseISODate(iso);
  return d ? format(d, fmt) : "";
}

/** Days from `fromISO` to `toISO` (positive when `toISO` is later). */
export function daysBetween(fromISO: string, toISO: string): number | undefined {
  const a = parseISODate(fromISO);
  const b = parseISODate(toISO);
  if (!a || !b) return undefined;
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

export const DATE_FORMAT_LABELS: Record<DateFormatId, string> = {
  "dd/MM/yyyy": "22/10/2026",
  "dd-MM-yyyy": "22-10-2026",
  "dd MMM yyyy": "22 Oct 2026",
  "MMM d, yyyy": "Oct 22, 2026",
  "yyyy-MM-dd": "2026-10-22",
  "MM/dd/yyyy": "10/22/2026",
};

export function nowISO() {
  return new Date().toISOString();
}

/** "2 days ago", "just now" — compact relative time for UI. */
export function relativeTime(isoDateTime: string, now = Date.now()): string {
  if (!isoDateTime) return "never";
  const then = new Date(isoDateTime).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.round((now - then) / 1000);
  if (diff < 45) return "just now";
  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [604800, "week"],
    [2629800, "month"],
    [31557600, "year"],
  ];
  let unit = "minute";
  let value = 1;
  for (let i = units.length - 1; i >= 0; i--) {
    if (Math.abs(diff) >= units[i][0]) {
      unit = units[i][1];
      value = Math.round(diff / units[i][0]);
      break;
    }
  }
  return `${value} ${unit}${value === 1 ? "" : "s"} ago`;
}
