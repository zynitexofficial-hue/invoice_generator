import { describe, expect, it } from "vitest";
import { recurringSchema, type Recurring } from "@/lib/schema";
import {
  addDays,
  advanceNextRun,
  CATCH_UP_CAP,
  computeDue,
  dayDiff,
  describeSchedule,
  firstOnOrAfter,
  nextAfter,
  occurrenceAt,
  occurrencesBetween,
  ordinal,
  type ScheduleSpec,
} from "./schedule";

const spec = (over: Partial<ScheduleSpec> = {}): ScheduleSpec => ({
  frequency: "monthly",
  interval: 1,
  startDate: "2026-01-15",
  endDate: "",
  dayOfMonth: 0,
  ...over,
});

const rec = (over: Partial<Recurring> = {}): Recurring =>
  recurringSchema.parse({
    id: "r1",
    name: "Retainer",
    startDate: "2026-01-15",
    nextRunDate: "2026-01-15",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...over,
  });

describe("date-only math", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
  it("is not affected by daylight saving transitions", () => {
    // 2026-03-08 and 2026-11-01 are US DST changes; 2026-03-29 / 2026-10-25 are EU ones.
    expect(addDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDays("2026-10-24", 2)).toBe("2026-10-26");
    expect(dayDiff("2026-03-28", "2026-03-30")).toBe(2);
    expect(dayDiff("2026-01-01", "2027-01-01")).toBe(365);
  });
  it("rejects invalid dates", () => {
    expect(addDays("2026-02-30", 1)).toBe("");
    expect(addDays("", 1)).toBe("");
    expect(dayDiff("x", "2026-01-01")).toBeUndefined();
  });
});

describe("occurrences", () => {
  it("weekly and fortnightly", () => {
    expect(
      occurrencesBetween(
        spec({ frequency: "weekly", startDate: "2026-12-21" }),
        "2026-12-21",
        "2027-01-11",
      ),
    ).toEqual(["2026-12-21", "2026-12-28", "2027-01-04", "2027-01-11"]);
    expect(
      occurrenceAt(spec({ frequency: "weekly", interval: 2, startDate: "2026-01-05" }), 3),
    ).toBe("2026-02-16");
  });

  it("month-end start keeps the anchor day (31 Jan -> 28 Feb -> 31 Mar)", () => {
    const s = spec({ startDate: "2026-01-31" });
    expect(occurrencesBetween(s, "2026-01-01", "2026-05-31")).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
    ]);
  });

  it("fixed day 31 behaves as the last day of every month", () => {
    const s = spec({ startDate: "2026-02-10", dayOfMonth: 31 });
    expect(occurrencesBetween(s, "2026-02-01", "2026-04-30")).toEqual([
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
  });

  it("fixed day earlier than the start day skips to the next month", () => {
    const s = spec({ startDate: "2026-01-20", dayOfMonth: 5 });
    expect(occurrencesBetween(s, "2026-01-01", "2026-03-31")).toEqual(["2026-02-05", "2026-03-05"]);
  });

  it("leap day yearly: 29 Feb in leap years, 28 Feb otherwise, and back", () => {
    const s = spec({ frequency: "yearly", startDate: "2024-02-29" });
    expect(occurrencesBetween(s, "2024-01-01", "2028-12-31")).toEqual([
      "2024-02-29",
      "2025-02-28",
      "2026-02-28",
      "2027-02-28",
      "2028-02-29",
    ]);
  });

  it("quarterly, half-yearly and every-2-months steps", () => {
    expect(
      occurrencesBetween(
        spec({ frequency: "quarterly", startDate: "2026-11-30" }),
        "2026-01-01",
        "2027-12-31",
      ),
    ).toEqual(["2026-11-30", "2027-02-28", "2027-05-30", "2027-08-30", "2027-11-30"]);
    expect(occurrenceAt(spec({ frequency: "half_yearly", startDate: "2026-08-31" }), 1)).toBe(
      "2027-02-28",
    );
    expect(occurrenceAt(spec({ interval: 2, startDate: "2026-01-10" }), 3)).toBe("2026-07-10");
  });

  it("respects the end date (inclusive) and the range start", () => {
    const s = spec({ endDate: "2026-03-15" });
    expect(occurrencesBetween(s, "2026-02-01", "2026-12-31")).toEqual(["2026-02-15", "2026-03-15"]);
    expect(occurrencesBetween(s, "2026-03-16", "2026-12-31")).toEqual([]);
  });

  it("never returns dates before the start date", () => {
    expect(occurrencesBetween(spec(), "2025-01-01", "2026-02-20")).toEqual([
      "2026-01-15",
      "2026-02-15",
    ]);
  });

  it("skips ahead cheaply for old schedules", () => {
    const s = spec({ frequency: "weekly", startDate: "2000-01-03" });
    const out = occurrencesBetween(s, "2026-11-01", "2026-11-30");
    expect(out[0]! >= "2026-11-01").toBe(true);
    expect(out.length).toBeGreaterThanOrEqual(4);
    expect(out.length).toBeLessThanOrEqual(5);
  });

  it("firstOnOrAfter and nextAfter", () => {
    const s = spec();
    expect(firstOnOrAfter(s, "2026-01-01")).toBe("2026-01-15");
    expect(firstOnOrAfter(s, "2026-01-16")).toBe("2026-02-15");
    expect(nextAfter(s, "2026-01-15")).toBe("2026-02-15");
    expect(nextAfter(spec({ endDate: "2026-02-01" }), "2026-01-15")).toBe("");
  });

  it("returns nothing for a bad spec", () => {
    expect(occurrencesBetween(spec({ startDate: "" }), "2026-01-01", "2026-12-31")).toEqual([]);
    expect(firstOnOrAfter(spec({ startDate: "" }), "2026-01-01")).toBe("");
  });
});

describe("computeDue", () => {
  it("nothing due before the next run date", () => {
    expect(computeDue(rec(), "2026-01-14").total).toBe(0);
  });

  it("one due on the day itself", () => {
    expect(computeDue(rec(), "2026-01-15").dates).toEqual(["2026-01-15"]);
  });

  it("catches up every missed occurrence", () => {
    const r = computeDue(rec(), "2026-04-20");
    expect(r.dates).toEqual(["2026-01-15", "2026-02-15", "2026-03-15", "2026-04-15"]);
    expect(r.remaining).toBe(0);
  });

  it("caps catch-up at 12 and reports what remains", () => {
    const r = computeDue(rec({ frequency: "weekly" }), "2026-12-31");
    expect(r.dates).toHaveLength(CATCH_UP_CAP);
    expect(r.dates[0]).toBe("2026-01-15");
    expect(r.total).toBeGreaterThan(CATCH_UP_CAP);
    expect(r.remaining).toBe(r.total - CATCH_UP_CAP);
  });

  it("honours maxRuns and runCount", () => {
    const r = computeDue(rec({ maxRuns: 3, runCount: 1, nextRunDate: "2026-02-15" }), "2026-12-31");
    expect(r.dates).toEqual(["2026-02-15", "2026-03-15"]);
    expect(computeDue(rec({ maxRuns: 2, runCount: 2 }), "2026-12-31").total).toBe(0);
  });

  it("stops at the end date and ignores paused templates", () => {
    expect(computeDue(rec({ endDate: "2026-02-28" }), "2026-12-31").dates).toHaveLength(2);
    expect(computeDue(rec({ active: false }), "2026-12-31").total).toBe(0);
  });

  it("an empty nextRunDate means 'from the first occurrence'", () => {
    expect(computeDue(rec({ nextRunDate: "" }), "2026-02-15").dates).toEqual([
      "2026-01-15",
      "2026-02-15",
    ]);
  });

  it("a finished schedule (end date passed) has nothing due", () => {
    expect(
      computeDue(
        rec({ nextRunDate: "", startDate: "2026-01-15", endDate: "2026-01-01" }),
        "2026-12-31",
      ).total,
    ).toBe(0);
  });
});

describe("advanceNextRun", () => {
  it("moves to the following occurrence", () => {
    expect(advanceNextRun(rec(), "2026-01-15", 1)).toBe("2026-02-15");
  });
  it("ends after maxRuns or the end date", () => {
    expect(advanceNextRun(rec({ maxRuns: 2 }), "2026-02-15", 2)).toBe("");
    expect(advanceNextRun(rec({ endDate: "2026-02-20" }), "2026-02-15", 2)).toBe("");
  });
});

describe("describeSchedule", () => {
  it("reads in plain language", () => {
    expect(describeSchedule(rec())).toBe("Every month on the 15th");
    expect(describeSchedule(rec({ frequency: "weekly", interval: 2 }))).toBe("Every 2 weeks");
    expect(describeSchedule(rec({ dayOfMonth: 31 }))).toBe("Every month on the last day");
    expect(describeSchedule(rec({ frequency: "quarterly", dayOfMonth: 1 }))).toBe(
      "Every quarter on the 1st",
    );
    expect(ordinal(22)).toBe("22nd");
    expect(ordinal(11)).toBe("11th");
    expect(ordinal(23)).toBe("23rd");
  });
});
