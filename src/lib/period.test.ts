import { describe, expect, it } from "vitest";
import { csvCell, toCsv } from "./csv";
import {
  fyKey,
  fyStartYear,
  inPeriod,
  monthsInPeriod,
  periodLabel,
  periodRange,
  quarterKey,
  shiftPeriod,
} from "./period";

describe("period", () => {
  it("maps dates to FY and quarters", () => {
    expect(fyStartYear("2026-03-31")).toBe(2025);
    expect(fyStartYear("2026-04-01")).toBe(2026);
    expect(quarterKey("2026-04-15")).toBe("2026-Q1");
    expect(quarterKey("2026-12-31")).toBe("2026-Q3");
    expect(quarterKey("2027-02-01")).toBe("2026-Q4");
    expect(fyKey("2027-02-01")).toBe("FY2026-27");
  });

  it("computes ranges incl. leap years", () => {
    expect(periodRange("2028-02")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
    expect(periodRange("2026-Q4")).toEqual({ start: "2027-01-01", end: "2027-03-31" });
    expect(periodRange("FY2026-27")).toEqual({ start: "2026-04-01", end: "2027-03-31" });
    expect(monthsInPeriod("2026-Q3")).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(inPeriod("2027-03-31", "2026-Q4")).toBe(true);
    expect(inPeriod("2027-04-01", "2026-Q4")).toBe(false);
  });

  it("shifts and labels", () => {
    expect(shiftPeriod("2026-01", -1)).toBe("2025-12");
    expect(shiftPeriod("2026-Q4", 1)).toBe("2027-Q1");
    expect(shiftPeriod("FY2026-27", -1)).toBe("FY2025-26");
    expect(periodLabel("2026-Q3")).toBe("Q3 FY 2026-27 (Oct–Dec 2026)");
    expect(periodLabel("2026-10")).toBe("Oct 2026");
  });
});

describe("csv", () => {
  it("quotes and neutralises formulas", () => {
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(toCsv(["a"], [[1]])).toBe("a\r\n1\r\n");
  });
});
