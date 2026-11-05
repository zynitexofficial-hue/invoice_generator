import type { AppSettings, ReturnType } from "@/lib/schema";
import { stateFromGstin } from "@/lib/gst/gstin";
import {
  fyStartYear,
  monthKey,
  monthsInPeriod,
  periodKind,
  periodLabel,
  quarterKey,
  shiftPeriod,
} from "@/lib/period";

/**
 * GST due dates (spec F9). VERIFY ON PORTAL — due dates are set and extended
 * by notification; these are the standard (unextended) dates.
 */

export type DeadlineKind = ReturnType | "PMT-06";
export type FilingFrequency = AppSettings["gst"]["filingFrequency"];

/**
 * QRMP GSTR-3B state groups (Notification 76/2020-CT as amended). Verify on portal.
 * Category X → 22nd; Category Y (all other states/UTs) → 24th.
 * X: Chhattisgarh, Madhya Pradesh, Gujarat, Daman & Diu / Dadra & Nagar Haveli,
 * Maharashtra, Karnataka, Goa, Lakshadweep, Kerala, Tamil Nadu, Puducherry,
 * Andaman & Nicobar Islands, Telangana, Andhra Pradesh. Ladakh is listed in
 * Category Y (with J&K, Chandigarh, Delhi); "Other Territory" (97) defaults to Y.
 */
export const QRMP_CATEGORY_X_STATES = [
  "22",
  "23",
  "24",
  "25",
  "26",
  "27",
  "28",
  "29",
  "30",
  "31",
  "32",
  "33",
  "34",
  "35",
  "36",
  "37",
] as const;

export type QrmpGroup = "X" | "Y";

export function qrmpGroup(stateCode: string): QrmpGroup {
  return (QRMP_CATEGORY_X_STATES as readonly string[]).includes(stateCode) ? "X" : "Y";
}

/** QRMP GSTR-3B day of month: 22 (Category X) or 24 (Category Y). Verify on portal. */
export function qrmp3bDay(stateCode: string): 22 | 24 {
  return qrmpGroup(stateCode) === "X" ? 22 : 24;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Day `day` of the month after `month` ("2026-10" → "2026-11-DD"). */
function dayOfNextMonth(month: string, day: number): string {
  return `${shiftPeriod(month, 1)}-${pad(day)}`;
}

function lastMonthOf(periodKey: string): string {
  const months = monthsInPeriod(periodKey);
  return months[months.length - 1];
}

/** Position (1–3) of a calendar month inside its FY quarter. */
export function monthInQuarter(month: string): 1 | 2 | 3 {
  const m = Number(month.slice(5, 7));
  return ((((m - 4 + 12) % 12) % 3) + 1) as 1 | 2 | 3;
}

export interface DueDateOptions {
  frequency: FilingFrequency;
  /** Seller's state code (decides the QRMP GSTR-3B day). */
  stateCode: string;
}

/**
 * Standard due date for a return and period, or null when the return does
 * not apply to that period/frequency (e.g. IFF for the 3rd month).
 * Verify on portal.
 *
 * Period keys: monthly returns take a month key ("2026-10"); QRMP GSTR-1 and
 * GSTR-3B take a quarter key ("2026-Q3") — a month key is accepted and mapped
 * to its quarter; IFF/PMT-06 take a month key; GSTR-9 takes "FY2026-27".
 */
export function dueDate(
  returnType: DeadlineKind,
  periodKey: string,
  opts: DueDateOptions,
): string | null {
  const kind = periodKind(periodKey);
  switch (returnType) {
    case "GSTR-1":
    case "GSTR-1A":
      if (opts.frequency === "monthly") {
        if (kind !== "month") return null;
        return dayOfNextMonth(periodKey, 11);
      }
      if (kind === "fy") return null;
      return dayOfNextMonth(lastMonthOf(kind === "month" ? quarterOf(periodKey) : periodKey), 13);
    case "IFF":
      if (opts.frequency !== "qrmp" || kind !== "month" || monthInQuarter(periodKey) === 3)
        return null;
      return dayOfNextMonth(periodKey, 13);
    case "PMT-06":
      if (opts.frequency !== "qrmp" || kind !== "month" || monthInQuarter(periodKey) === 3)
        return null;
      return dayOfNextMonth(periodKey, 25);
    case "GSTR-3B":
      if (opts.frequency === "monthly") {
        if (kind !== "month") return null;
        return dayOfNextMonth(periodKey, 20);
      }
      if (kind === "fy") return null;
      return dayOfNextMonth(
        lastMonthOf(kind === "month" ? quarterOf(periodKey) : periodKey),
        qrmp3bDay(opts.stateCode),
      );
    case "GSTR-9":
    case "GSTR-9C": {
      if (kind !== "fy") return null;
      const start = Number(periodKey.slice(2, 6));
      return `${start + 1}-12-31`;
    }
    case "GSTR-4": {
      // Composition annual return: 30 April after the financial year. Verify on portal.
      if (kind !== "fy") return null;
      const start = Number(periodKey.slice(2, 6));
      return `${start + 1}-04-30`;
    }
  }
}

function quarterOf(month: string) {
  return quarterKey(`${month}-01`);
}

export interface Deadline {
  returnType: DeadlineKind;
  periodKey: string;
  periodLabel: string;
  dueDate: string;
  /** Days from today to the due date (0 = due today). */
  daysLeft: number;
}

function dayIndex(dateISO: string): number {
  const [y, m, d] = dateISO.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole days from `fromISO` to `toISO` (positive when `toISO` is later). UTC, no DST issues. */
export function daysFromTo(fromISO: string, toISO: string): number {
  return dayIndex(toISO) - dayIndex(fromISO);
}

/** Filing state: profile state, else the GSTIN's state. */
export function settingsStateCode(settings: AppSettings): string {
  return settings.profile.stateCode || stateFromGstin(settings.profile.gstin) || "";
}

/**
 * The next `n` deadlines on or after today for a regular taxpayer, sorted by
 * date (ties by return type). Composition/unregistered → []. Verify on portal.
 */
export function upcomingDeadlines(settings: AppSettings, todayISO: string, n = 5): Deadline[] {
  if (settings.gst.registrationType !== "regular") return [];
  const frequency = settings.gst.filingFrequency;
  const opts: DueDateOptions = { frequency, stateCode: settingsStateCode(settings) };
  const out: Deadline[] = [];
  const seen = new Set<string>();
  const push = (returnType: DeadlineKind, periodKey: string) => {
    const due = dueDate(returnType, periodKey, opts);
    const id = `${returnType}:${periodKey}`;
    if (!due || due < todayISO || seen.has(id)) return;
    seen.add(id);
    out.push({
      returnType,
      periodKey,
      periodLabel: periodLabel(periodKey),
      dueDate: due,
      daysLeft: daysFromTo(todayISO, due),
    });
  };
  const thisMonth = monthKey(todayISO);
  // Periods whose deadlines can still be ahead: from 3 months back to ~a year ahead.
  for (let i = -3; i <= 12; i++) {
    const month = shiftPeriod(thisMonth, i);
    if (frequency === "monthly") {
      push("GSTR-1", month);
      push("GSTR-3B", month);
    } else {
      push("IFF", month);
      push("PMT-06", month);
      push("GSTR-1", quarterOf(month));
      push("GSTR-3B", quarterOf(month));
    }
  }
  const fy = fyStartYear(todayISO);
  for (const start of [fy - 1, fy]) push("GSTR-9", `FY${start}-${pad((start + 1) % 100)}`);
  out.sort((a, b) =>
    a.dueDate === b.dueDate
      ? a.returnType.localeCompare(b.returnType)
      : a.dueDate < b.dueDate
        ? -1
        : 1,
  );
  return out.slice(0, n);
}

/**
 * Last date a return can be filed: 3 years from its due date (time bar from
 * July 2025 tax periods). 29 Feb maps to 28 Feb. Verify on portal.
 */
export function timeBarDate(dueDateISO: string): string {
  const [y, m, d] = dueDateISO.split("-").map(Number);
  const year = y + 3;
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return `${year}-${pad(m)}-${pad(Math.min(d, last))}`;
}

/** True once today is after the time-bar date. */
export function isTimeBarred(dueDateISO: string, todayISO: string): boolean {
  return todayISO > timeBarDate(dueDateISO);
}

/** True when the due date has passed. */
export function isOverdue(dueDateISO: string, todayISO: string): boolean {
  return todayISO > dueDateISO;
}
