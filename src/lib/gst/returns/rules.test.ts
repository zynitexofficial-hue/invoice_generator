import { describe, expect, it } from "vitest";
import { lineItemSchema } from "@/lib/schema";
import {
  dueDate,
  isTimeBarred,
  monthInQuarter,
  qrmp3bDay,
  qrmpGroup,
  timeBarDate,
  upcomingDeadlines,
} from "./due-dates";
import { estimateLateFee, lateFeeCap } from "./late-fee";
import { allowedRates, isRateAllowed } from "./rates";
import { UQC_CODES, unitToUqc, uqcFor, uqcLabel } from "./uqc";
import { fixtureSettings } from "./fixtures/october-2026";

describe("rates by date", () => {
  it("uses the old slabs before 22 Sep 2025", () => {
    expect(isRateAllowed("12", "2025-09-21")).toBe("ok");
    expect(isRateAllowed("28", "2025-09-21")).toBe("ok");
    expect(isRateAllowed("7.5", "2025-01-01")).toBe("ok");
    expect(isRateAllowed("40", "2025-09-21")).toBe("error");
  });

  it("uses the new slabs from 22 Sep 2025, with 28% as a warning", () => {
    expect(isRateAllowed("40", "2025-09-22")).toBe("ok");
    expect(isRateAllowed("18", "2026-10-01")).toBe("ok");
    expect(isRateAllowed("18.00", "2026-10-01")).toBe("ok");
    expect(isRateAllowed("0.25", "2026-10-01")).toBe("ok");
    expect(isRateAllowed("12", "2025-09-22")).toBe("error");
    expect(isRateAllowed("28", "2026-10-01")).toBe("warn");
    expect(isRateAllowed("abc", "2026-10-01")).toBe("error");
    expect(isRateAllowed("", "2026-10-01")).toBe("ok");
  });

  it("lists rates for a date", () => {
    expect(allowedRates("2026-01-01")).toContain("40");
    expect(allowedRates("2024-01-01")).toContain("12");
    expect(allowedRates("")).toContain("40");
  });
});

describe("UQC", () => {
  it("maps common units", () => {
    const cases: [string, string][] = [
      ["pcs", "PCS"],
      ["Nos", "NOS"],
      ["kg", "KGS"],
      ["g", "GMS"],
      ["ltr", "LTR"],
      ["l", "LTR"],
      ["ml", "MLT"],
      ["m", "MTR"],
      ["sq.ft", "SQF"],
      ["sqm", "SQM"],
      ["box", "BOX"],
      ["set", "SET"],
      ["pair", "PRS"],
      ["dozen", "DOZ"],
      ["ton", "TON"],
      ["bag", "BAG"],
      ["bottle", "BTL"],
      ["hrs", "OTH"],
      ["days", "OTH"],
      ["months", "OTH"],
      ["job", "OTH"],
      ["service", "OTH"],
      ["widgets", "OTH"],
      ["", "OTH"],
      ["CTN", "CTN"],
    ];
    for (const [unit, code] of cases) expect(unitToUqc(unit), unit).toBe(code);
  });

  it("prefers the line's explicit UQC", () => {
    const line = lineItemSchema.parse({ id: "x", unit: "pcs", uqc: "nos" });
    expect(uqcFor(line)).toBe("NOS");
    expect(uqcFor({ ...line, uqc: "" })).toBe("PCS");
  });

  it("exports the code list with labels", () => {
    expect(UQC_CODES.length).toBeGreaterThan(40);
    expect(UQC_CODES.find((u) => u.code === "OTH")?.label).toBe("Others");
    expect(uqcLabel("NOS")).toBe("NOS-NUMBERS");
  });
});

describe("due dates", () => {
  const monthly = { frequency: "monthly" as const, stateCode: "27" };
  const qrmpX = { frequency: "qrmp" as const, stateCode: "27" };
  const qrmpY = { frequency: "qrmp" as const, stateCode: "07" };

  it("monthly GSTR-1 on the 11th and GSTR-3B on the 20th", () => {
    expect(dueDate("GSTR-1", "2026-10", monthly)).toBe("2026-11-11");
    expect(dueDate("GSTR-3B", "2026-10", monthly)).toBe("2026-11-20");
    expect(dueDate("GSTR-1", "2026-12", monthly)).toBe("2027-01-11");
    expect(dueDate("IFF", "2026-10", monthly)).toBeNull();
    expect(dueDate("GSTR-1", "2026-Q3", monthly)).toBeNull();
  });

  it("QRMP: GSTR-1 on the 13th after the quarter, 3B by state group", () => {
    expect(dueDate("GSTR-1", "2026-Q3", qrmpX)).toBe("2027-01-13");
    expect(dueDate("GSTR-1", "2026-11", qrmpX)).toBe("2027-01-13");
    expect(dueDate("GSTR-3B", "2026-Q3", qrmpX)).toBe("2027-01-22");
    expect(dueDate("GSTR-3B", "2026-Q3", qrmpY)).toBe("2027-01-24");
    expect(dueDate("GSTR-1", "2026-Q4", qrmpX)).toBe("2027-04-13");
    expect(dueDate("GSTR-3B", "2026-Q4", qrmpY)).toBe("2027-04-24");
  });

  it("QRMP state groups", () => {
    for (const code of [
      "22",
      "23",
      "24",
      "26",
      "27",
      "29",
      "30",
      "31",
      "32",
      "33",
      "34",
      "35",
      "36",
      "37",
    ])
      expect(qrmpGroup(code), code).toBe("X");
    for (const code of ["01", "04", "07", "09", "19", "38", "97"])
      expect(qrmpGroup(code), code).toBe("Y");
    expect(qrmp3bDay("33")).toBe(22);
    expect(qrmp3bDay("38")).toBe(24);
  });

  it("IFF and PMT-06 only for months 1–2 of a quarter", () => {
    expect(monthInQuarter("2026-10")).toBe(1);
    expect(monthInQuarter("2026-12")).toBe(3);
    expect(monthInQuarter("2027-02")).toBe(2);
    expect(dueDate("IFF", "2026-10", qrmpX)).toBe("2026-11-13");
    expect(dueDate("IFF", "2026-12", qrmpX)).toBeNull();
    expect(dueDate("PMT-06", "2026-11", qrmpX)).toBe("2026-12-25");
    expect(dueDate("PMT-06", "2026-12", qrmpX)).toBeNull();
  });

  it("GSTR-9 on 31 Dec after the FY", () => {
    expect(dueDate("GSTR-9", "FY2026-27", monthly)).toBe("2027-12-31");
    expect(dueDate("GSTR-9", "2026-10", monthly)).toBeNull();
  });

  it("handles leap-year February", () => {
    expect(dueDate("GSTR-3B", "2028-01", monthly)).toBe("2028-02-20");
    expect(dueDate("IFF", "2028-01", qrmpX)).toBe("2028-02-13");
    expect(dueDate("PMT-06", "2028-01", qrmpX)).toBe("2028-02-25");
    expect(dueDate("GSTR-1", "2028-02", monthly)).toBe("2028-03-11");
    expect(timeBarDate("2028-02-29")).toBe("2031-02-28");
  });

  it("time bar is 3 years after the due date", () => {
    expect(timeBarDate("2026-11-20")).toBe("2029-11-20");
    expect(isTimeBarred("2026-11-20", "2029-11-20")).toBe(false);
    expect(isTimeBarred("2026-11-20", "2029-11-21")).toBe(true);
  });

  it("lists upcoming deadlines for a monthly filer", () => {
    const list = upcomingDeadlines(fixtureSettings(), "2026-11-05", 5);
    expect(list.map((d) => `${d.returnType} ${d.periodKey} ${d.dueDate}`)).toEqual([
      "GSTR-1 2026-10 2026-11-11",
      "GSTR-3B 2026-10 2026-11-20",
      "GSTR-1 2026-11 2026-12-11",
      "GSTR-3B 2026-11 2026-12-20",
      "GSTR-9 FY2025-26 2026-12-31",
    ]);
    expect(list[0].daysLeft).toBe(6);
  });

  it("lists upcoming deadlines for a QRMP filer", () => {
    const settings = fixtureSettings({
      gst: { ...fixtureSettings().gst, filingFrequency: "qrmp" },
    });
    const list = upcomingDeadlines(settings, "2026-11-13", 6);
    expect(list.map((d) => `${d.returnType} ${d.periodKey} ${d.dueDate}`)).toEqual([
      "IFF 2026-10 2026-11-13",
      "PMT-06 2026-10 2026-11-25",
      "IFF 2026-11 2026-12-13",
      "PMT-06 2026-11 2026-12-25",
      "GSTR-9 FY2025-26 2026-12-31",
      "GSTR-1 2026-Q3 2027-01-13",
    ]);
    expect(list[0].daysLeft).toBe(0);
  });

  it("returns no deadlines for composition dealers", () => {
    const settings = fixtureSettings({
      gst: { ...fixtureSettings().gst, registrationType: "composition" },
    });
    expect(upcomingDeadlines(settings, "2026-11-05", 5)).toEqual([]);
  });
});

describe("late fee estimate", () => {
  it("charges ₹50/day split equally", () => {
    const r = estimateLateFee({ dueDate: "2026-11-20", filedDate: "2026-11-30", aato: "10000000" });
    expect(r.daysLate).toBe(10);
    expect(r.lateFee).toEqual({ cgst: "250.00", sgst: "250.00", total: "500.00" });
    expect(r.interest).toBe("0.00");
  });

  it("caps by turnover", () => {
    expect(
      estimateLateFee({ dueDate: "2026-01-20", filedDate: "2026-05-20", aato: "10000000" }).lateFee
        .total,
    ).toBe("2000.00");
    expect(
      estimateLateFee({ dueDate: "2026-01-20", filedDate: "2026-05-20", aato: "15000000" }).lateFee
        .total,
    ).toBe("2000.00");
    expect(
      estimateLateFee({ dueDate: "2026-01-20", filedDate: "2026-05-20", aato: "40000000" }).lateFee
        .total,
    ).toBe("5000.00");
    expect(
      estimateLateFee({ dueDate: "2026-01-20", filedDate: "2026-12-20", aato: "90000000" }).lateFee
        .total,
    ).toBe("10000.00");
    expect(lateFeeCap(false, "").toFixed(0)).toBe("10000");
  });

  it("nil returns: ₹20/day capped at ₹500", () => {
    const r = estimateLateFee({ dueDate: "2026-11-20", filedDate: "2026-12-20", nil: true });
    expect(r.daysLate).toBe(30);
    expect(r.lateFee).toEqual({ cgst: "250.00", sgst: "250.00", total: "500.00" });
    const short = estimateLateFee({ dueDate: "2026-11-20", filedDate: "2026-11-25", nil: true });
    expect(short.lateFee.total).toBe("100.00");
  });

  it("interest is 18% p.a. simple on net cash tax", () => {
    const r = estimateLateFee({
      dueDate: "2026-11-20",
      filedDate: "2026-12-20",
      aato: "1",
      netCashTax: "10000",
    });
    // 10000 × 18% × 30 / 365 = 147.945… → 147.95
    expect(r.interest).toBe("147.95");
    expect(r.total).toBe("1647.95");
  });

  it("no fee when filed on time", () => {
    const r = estimateLateFee({
      dueDate: "2026-11-20",
      filedDate: "2026-11-18",
      netCashTax: "500",
    });
    expect(r.daysLate).toBe(0);
    expect(r.total).toBe("0.00");
  });
});
