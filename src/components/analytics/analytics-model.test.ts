import { describe, expect, it } from "vitest";
import { OTHER_KEY, prepareAnalytics, salesRegister, type InvoiceFact } from "@/lib/analytics";
import { inv } from "@/lib/analytics/fixtures.test-utils";
import { DEFAULT_SETTINGS, type AppSettings, type Filing } from "@/lib/schema";
import {
  compareText,
  drillToFilter,
  fromSelection,
  insightDeadlines,
  isPeriodKey,
  minusOneYear,
  monthsBetween,
  nextDeadline,
  parseCompare,
  parsePeriodParam,
  parseTab,
  resolveCompare,
  subsetRegister,
  trendMonths,
  withPeriod,
} from "./analytics-model";

const TODAY = "2026-11-05";

describe("parsePeriodParam", () => {
  it("defaults to this month", () => {
    const p = parsePeriodParam(null, TODAY);
    expect(p.selection.preset).toBe("this_month");
    expect(p.selector).toBe("2026-11");
    expect(p.range).toEqual({ start: "2026-11-01", end: "2026-11-30" });
    expect(p.label).toBe("Nov 2026");
    expect(p.param).toBe("this_month");
  });

  it("accepts preset ids", () => {
    expect(parsePeriodParam("last_fy", TODAY).selector).toBe("FY2025-26");
    expect(parsePeriodParam("this_quarter", TODAY).selector).toBe("2026-Q3");
  });

  it("maps a key that matches a preset onto the preset", () => {
    const p = parsePeriodParam("2026-10", TODAY);
    expect(p.selection.preset).toBe("last_month");
    expect(p.selector).toBe("2026-10");
    expect(p.param).toBe("2026-10");
  });

  it("keeps other keys as keys (custom in the filter)", () => {
    const p = parsePeriodParam("2026-05", TODAY);
    expect(p.selector).toBe("2026-05");
    expect(p.selection).toEqual({ preset: "custom", from: "2026-05-01", to: "2026-05-31" });
    expect(p.label).toBe("May 2026");
    expect(parsePeriodParam("FY2024-25", TODAY).range).toEqual({
      start: "2024-04-01",
      end: "2025-03-31",
    });
  });

  it("parses from..to ranges, including open ends", () => {
    const p = parsePeriodParam("2026-04-01..2026-06-30", TODAY);
    expect(p.selector).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(p.param).toBe("2026-04-01..2026-06-30");
    expect(parsePeriodParam("2026-09-01..", TODAY).range).toEqual({
      start: "2026-09-01",
      end: TODAY,
    });
    // Reversed bounds are tolerated.
    expect(parsePeriodParam("2026-06-30..2026-04-01", TODAY).range).toEqual({
      start: "2026-04-01",
      end: "2026-06-30",
    });
  });

  it("falls back to this month on junk", () => {
    for (const junk of ["", "2026-13", "FY2026-30", "abc", "2026-02-31x..2026-03-01"])
      expect(parsePeriodParam(junk, TODAY).selector).toBe("2026-11");
  });

  it("treats an empty range as all dates", () => {
    const p = parsePeriodParam("..", TODAY);
    expect(p.label).toBe("All dates");
    expect(p.range.end).toBe(TODAY);
  });

  it("round-trips a selection through its param", () => {
    const sel = fromSelection({ preset: "custom", from: "2026-01-01", to: "2026-03-31" }, TODAY);
    expect(parsePeriodParam(sel.param, TODAY).range).toEqual(sel.range);
  });
});

describe("period keys and tabs", () => {
  it("validates period keys", () => {
    expect(isPeriodKey("2026-10")).toBe(true);
    expect(isPeriodKey("2026-Q4")).toBe(true);
    expect(isPeriodKey("FY2026-27")).toBe(true);
    expect(isPeriodKey("FY2026-28")).toBe(false);
    expect(isPeriodKey("2026-Q5")).toBe(false);
  });
  it("parses tabs and compare modes", () => {
    expect(parseTab("sales")).toBe("sales");
    expect(parseTab("nope")).toBe("overview");
    expect(parseCompare("year")).toBe("year");
    expect(parseCompare(null)).toBe("previous");
  });
});

describe("resolveCompare", () => {
  it("previous period", () => {
    expect(resolveCompare("2026-11", "previous")).toBe("2026-10");
    expect(resolveCompare("2026-Q1", "previous")).toBe("2025-Q4");
    expect(resolveCompare({ start: "2026-04-11", end: "2026-04-20" }, "previous")).toEqual({
      start: "2026-04-01",
      end: "2026-04-10",
    });
  });
  it("same period last year", () => {
    expect(resolveCompare("2026-11", "year")).toBe("2025-11");
    expect(resolveCompare("2026-Q3", "year")).toBe("2025-Q3");
    expect(resolveCompare("FY2026-27", "year")).toBe("FY2025-26");
    expect(resolveCompare({ start: "2024-02-29", end: "2024-03-31" }, "year")).toEqual({
      start: "2023-02-28",
      end: "2023-03-31",
    });
  });
  it("none", () => {
    expect(resolveCompare("2026-11", "none")).toBeNull();
    expect(compareText("2026-11", "none", TODAY)).toBeNull();
  });
  it("labels", () => {
    expect(compareText("2026-11", "previous", TODAY)).toBe("last month");
    expect(compareText("2026-09", "previous", TODAY)).toBe("Aug 2026");
    expect(compareText("2026-11", "year", TODAY)).toBe("Nov 2025");
    expect(minusOneYear("2028-02-29")).toBe("2027-02-28");
  });
});

describe("trend months", () => {
  it("six months ending with a single month", () => {
    expect(trendMonths({ start: "2026-11-01", end: "2026-11-30" })).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });
  it("all months of a longer range, capped at 24", () => {
    expect(trendMonths({ start: "2026-04-01", end: "2026-06-30" })).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
    ]);
    const long = trendMonths({ start: "2017-07-01", end: "2026-11-05" });
    expect(long).toHaveLength(24);
    expect(long.at(-1)).toBe("2026-11");
    expect(monthsBetween("2026-12-15", "2027-02-01")).toEqual(["2026-12", "2027-01", "2027-02"]);
  });
});

describe("drill-down mapping", () => {
  const data = prepareAnalytics({
    invoices: [
      inv({ id: "a", customer: "Acme", gstin: "27AAAPL1234C1Z5", date: "2026-11-02", item: "Pen" }),
      inv({ id: "b", customer: "Beta", date: "2026-11-03", state: "29", item: "Ink", hsn: "3215" }),
      inv({ id: "c", customer: "Gamma", date: "2026-11-04", item: "Pen" }),
    ],
    expenses: [],
    incomes: [],
    sellerState: "27",
  });
  const facts: InvoiceFact[] = data.facts;
  const key = (id: string) => facts.find((f) => f.id === id)!.customerKey;

  it("maps single keys onto register filter fields", () => {
    expect(drillToFilter({ dimension: "customer", key: key("a"), label: "Acme" }, facts)).toEqual({
      customerKey: key("a"),
    });
    expect(drillToFilter({ dimension: "state", key: "29", label: "Karnataka" }, facts)).toEqual({
      pos: "29",
    });
    expect(drillToFilter({ dimension: "type", key: "b2b", label: "B2B" }, facts)).toEqual({
      supplyClass: "b2b",
    });
    expect(drillToFilter({ dimension: "hsn", key: "3215", label: "3215" }, facts)).toEqual({
      hsn: "3215",
    });
  });

  it("maps items and Other onto invoice ids", () => {
    expect(drillToFilter({ dimension: "item", key: "pen", label: "Pen" }, facts)).toEqual({
      invoiceIds: ["a", "c"],
    });
    expect(
      drillToFilter(
        {
          dimension: "customer",
          key: OTHER_KEY,
          label: "Other",
          groupedKeys: [key("b"), key("c")],
        },
        facts,
      ),
    ).toEqual({ invoiceIds: ["b", "c"] });
  });

  it("filtered register matches the drill and subsetRegister recomputes totals", () => {
    const all = salesRegister(data, "2026-11", TODAY);
    const filtered = salesRegister(
      data,
      "2026-11",
      TODAY,
      drillToFilter({ dimension: "item", key: "pen", label: "Pen" }, facts),
    );
    expect(filtered.rowIds).toEqual(["a", "c"]);
    const sub = subsetRegister(all, ["a", "c"]);
    expect(sub.rows).toEqual(filtered.rows);
    expect(sub.totals).toEqual(filtered.totals);
  });
});

describe("deadlines", () => {
  const settings: AppSettings = {
    ...DEFAULT_SETTINGS,
    profile: { ...DEFAULT_SETTINGS.profile, stateCode: "27" },
    gst: { ...DEFAULT_SETTINGS.gst, registrationType: "regular", filingFrequency: "monthly" },
  };
  const filing = (id: string, status: Filing["status"]) => ({ id, status }) as unknown as Filing;
  const empty = prepareAnalytics({ invoices: [], expenses: [], incomes: [], sellerState: "27" });

  it("next deadline skips filed returns", () => {
    expect(nextDeadline(settings, [], TODAY)).toMatchObject({
      returnType: "GSTR-1",
      periodKey: "2026-10",
      dueDate: "2026-11-11",
      status: "not_started",
    });
    expect(nextDeadline(settings, [filing("2026-10:GSTR-1", "filed")], TODAY)).toMatchObject({
      returnType: "GSTR-3B",
      dueDate: "2026-11-20",
    });
  });

  it("is empty for composition / unregistered", () => {
    const comp = {
      ...settings,
      gst: { ...settings.gst, registrationType: "composition" as const },
    };
    expect(nextDeadline(comp, [], TODAY)).toBeNull();
    expect(insightDeadlines(comp, [], empty, TODAY)).toEqual([]);
  });

  it("flags overdue returns only for periods with sales", () => {
    const today = "2026-12-25"; // Nov GSTR-1 (11 Dec) and GSTR-3B (20 Dec) are past due
    expect(insightDeadlines(settings, [], empty, today).some((d) => d.dueDate < today)).toBe(false);
    const withSales = prepareAnalytics({
      invoices: [inv({ id: "x", date: "2026-11-10" })],
      expenses: [],
      incomes: [],
      sellerState: "27",
    });
    const overdue = insightDeadlines(settings, [], withSales, today).filter(
      (d) => d.dueDate < today,
    );
    expect(overdue.map((d) => d.label)).toEqual(["GSTR-1 for Nov 2026", "GSTR-3B for Nov 2026"]);
    const filed = insightDeadlines(
      settings,
      [filing("2026-11:GSTR-1", "filed"), filing("2026-11:GSTR-3B", "filed")],
      withSales,
      today,
    );
    expect(filed.filter((d) => d.dueDate < today)).toEqual([]);
  });
});

describe("withPeriod", () => {
  it("adds the period to analytics links only", () => {
    expect(withPeriod("/analytics?tab=sales", "2026-05")).toBe(
      "/analytics?tab=sales&period=2026-05",
    );
    expect(withPeriod("/analytics?tab=sales", "this_month")).toBe("/analytics?tab=sales");
    expect(withPeriod("/returns", "2026-05")).toBe("/returns");
    expect(withPeriod("/analytics", "last_fy", "year")).toBe(
      "/analytics?period=last_fy&compare=year",
    );
  });
});
