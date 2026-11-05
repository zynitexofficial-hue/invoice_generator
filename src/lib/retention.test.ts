import { describe, expect, it } from "vitest";
import { createInvoice } from "./invoice-factory";
import { isPastRetention, retentionReport } from "./retention";
import { DEFAULT_SETTINGS, type Invoice } from "./schema";

function doc(opts: { date: string; issued?: boolean; updatedAt?: string }): Invoice {
  const inv = createInvoice({
    settings: DEFAULT_SETTINGS,
    designs: [],
    docType: "tax_invoice",
    generated: { number: "X-1", autoNumber: null },
    now: new Date(`${opts.date}T10:00:00`),
  });
  return {
    ...inv,
    invoiceDate: opts.date,
    issuedAt: opts.issued ? `${opts.date}T10:00:00.000Z` : "",
    updatedAt: opts.updatedAt ?? `${opts.date}T10:00:00.000Z`,
  };
}

describe("retention", () => {
  it("counts whole financial years", () => {
    // Today is in FY 2026-27. With 8 years, FY 2017-18 and earlier are past.
    expect(isPastRetention("2018-03-31", "2026-11-05", 8)).toBe(true);
    expect(isPastRetention("2018-04-01", "2026-11-05", 8)).toBe(false);
    // Never below the 6-year minimum, even if a smaller value sneaks in.
    expect(isPastRetention("2023-03-31", "2026-11-05", 2)).toBe(false);
    expect(isPastRetention("2020-03-31", "2026-11-05", 6)).toBe(true);
    expect(isPastRetention("", "2026-11-05", 8)).toBe(false);
  });

  it("reports old issued documents and old drafts separately", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    const report = retentionReport(
      [
        doc({ date: "2017-06-01", issued: true }),
        doc({ date: "2017-06-02", issued: true }),
        doc({ date: "2024-06-01", issued: true }),
        doc({ date: "2017-06-01" }), // old draft (also older than retention, but a draft)
        doc({ date: "2025-10-01" }), // draft touched over a year ago
        doc({ date: "2025-10-01", updatedAt: "2026-06-01T00:00:00.000Z" }), // recently edited
        doc({ date: "2026-10-01" }),
      ],
      8,
      now,
    );
    expect(report.issuedPastRetention).toBe(2);
    expect(report.oldDrafts.map((d) => d.invoiceDate)).toEqual(["2017-06-01", "2025-10-01"]);
  });
});
