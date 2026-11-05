import { describe, expect, it } from "vitest";
import { buildGstr1, buildGstr3b, type ReturnIssue } from "@/lib/gst/returns";
import {
  PERIOD,
  fixtureExpenses,
  fixtureInvoices,
  fixtureSettings,
} from "@/lib/gst/returns/fixtures/october-2026";
import {
  arnError,
  cashPayableTotal,
  countIssues,
  defaultPeriod,
  dueText,
  excludedForPeriod,
  filedSnapshot,
  filingStep,
  gstr1SnapshotRecords,
  gstr1SnapshotTotals,
  gstr3bCsvRows,
  issueHref,
  parsePeriodParam,
  parseTab,
  sectionRows,
  settingsSectionFor,
  sortIssues,
  STAGE_KEY,
} from "./returns-data";

const settings = fixtureSettings();
const invoices = fixtureInvoices();
const g1 = buildGstr1({ invoices, settings, periodKey: PERIOD });
const ctx = {
  partyOf: (id: string) => invoices.find((i) => i.id === id)?.customer.name ?? "",
  formatDate: (iso: string) => iso,
};

describe("period helpers", () => {
  it("accepts a period of the right kind only", () => {
    expect(parsePeriodParam("2026-10", "monthly")).toBe("2026-10");
    expect(parsePeriodParam("2026-Q3", "monthly")).toBeNull();
    expect(parsePeriodParam("2026-Q3", "qrmp")).toBe("2026-Q3");
    expect(parsePeriodParam("2026-11", "qrmp")).toBe("2026-Q3");
    expect(parsePeriodParam("2026-13", "monthly")).toBeNull();
    expect(parsePeriodParam(null, "monthly")).toBeNull();
  });

  it("defaults to the previous period while its GSTR-3B is still due", () => {
    expect(defaultPeriod("monthly", "27", "2026-11-05")).toBe("2026-10");
    expect(defaultPeriod("monthly", "27", "2026-11-25")).toBe("2026-11");
    expect(defaultPeriod("qrmp", "27", "2027-01-10")).toBe("2026-Q3");
    expect(defaultPeriod("qrmp", "27", "2026-11-05")).toBe("2026-Q3");
  });

  it("parses the tab", () => {
    expect(parseTab("gstr3b")).toBe("gstr3b");
    expect(parseTab("nope")).toBe("gstr1");
  });

  it("describes days left", () => {
    expect(dueText(0)).toBe("Due today");
    expect(dueText(1)).toBe("Due in 1 day");
    expect(dueText(-3)).toBe("3 days overdue");
  });
});

describe("filingStep", () => {
  it("prefers the stored status, else derives data ready", () => {
    expect(filingStep(undefined, false)).toBe("not_started");
    expect(filingStep(undefined, true)).toBe("data_ready");
    expect(filingStep({ status: "not_started" }, true)).toBe("data_ready");
    expect(filingStep({ status: "exported" }, false)).toBe("exported");
    expect(filingStep({ status: "filed" }, false)).toBe("filed");
  });
});

describe("arnError", () => {
  it("allows empty or 15 uppercase letters/digits", () => {
    expect(arnError("")).toBeNull();
    expect(arnError("AA271026012345X")).toBeNull();
    expect(arnError("AA27102601234")).toMatch(/15 characters/);
    expect(arnError("AA27-026012345X")).toMatch(/letters and digits/);
    expect(arnError("aa271026012345x")).toMatch(/letters and digits/);
  });
});

describe("issues", () => {
  const base = { code: "X", message: "m" };
  const issues: ReturnIssue[] = [
    { ...base, severity: "info", recordKind: "settings", recordId: "app", field: "gst.x" },
    { ...base, severity: "warning", recordKind: "expense", recordId: "e1" },
    { ...base, severity: "error", recordKind: "invoice", recordId: "a b" },
    { ...base, severity: "warning", recordKind: "period", recordId: "2026-10" },
  ];

  it("sorts errors first and counts by severity", () => {
    expect(sortIssues(issues).map((i) => i.severity)).toEqual([
      "error",
      "warning",
      "warning",
      "info",
    ]);
    expect(countIssues(issues)).toEqual({ errors: 1, warnings: 2, infos: 1 });
  });

  it("links each issue to its record", () => {
    expect(issues.map(issueHref)).toEqual([
      "/settings?section=gst",
      "/money?tab=out",
      "/invoice?id=a%20b",
      undefined,
    ]);
    expect(settingsSectionFor("profile.gstin")).toBe("business");
    expect(settingsSectionFor("declarations.lutNumber")).toBe("defaults");
  });
});

describe("sectionRows", () => {
  const rows = sectionRows(g1, ctx);

  it("has one row per section in display order with engine totals", () => {
    expect(rows.map((r) => r.key)).toEqual([
      "b2b",
      "b2cl",
      "b2cs",
      "exp",
      "cdnr",
      "cdnur",
      "nil",
      "hsnB2b",
      "hsnB2c",
      "docs",
    ]);
    for (const r of rows) {
      expect(r.count).toBe(g1.totals[r.key].count);
      expect(r.taxable).toBe(g1.totals[r.key].taxable);
    }
  });

  it("lists documents with links and summed amounts", () => {
    const b2b = rows.find((r) => r.key === "b2b")!;
    expect(b2b.details.map((d) => d.id)).toEqual(g1.sections.b2b.map((d) => d.invoiceId));
    expect(b2b.details[0]).toMatchObject({
      href: "/invoice?id=inv-b2b-intra",
      taxable: "15000.00",
      cgst: "1350.00",
      sgst: "1350.00",
    });
  });

  it("shows credit notes as negative amounts", () => {
    const cdnr = rows.find((r) => r.key === "cdnr")!;
    const credit = g1.sections.cdnr.find((n) => n.noteType === "C");
    if (!credit) return;
    const item = cdnr.details.find((d) => d.id === credit.invoiceId)!;
    expect(item.taxable.startsWith("-")).toBe(true);
  });

  it("has a detail row per B2CS row and per document series", () => {
    expect(rows.find((r) => r.key === "b2cs")!.details).toHaveLength(g1.sections.b2cs.length);
    expect(rows.find((r) => r.key === "docs")!.details).toHaveLength(g1.sections.docs.length);
  });
});

describe("excluded and snapshots", () => {
  it("drops documents of other periods from the not-included list", () => {
    const ex = excludedForPeriod(g1.excluded);
    expect(ex.map((e) => e.reason).sort()).toEqual(["cancelled", "draft", "proforma"]);
  });

  it("records invoice hashes and tagged totals", () => {
    const records = gstr1SnapshotRecords(g1);
    expect(records.every((r) => r.kind === "invoice")).toBe(true);
    expect(records).toHaveLength(g1.recordHashes.length);
    const totals = gstr1SnapshotTotals(g1, "filed");
    expect(totals[STAGE_KEY]).toBe("filed");
    expect(totals["total.taxable"]).toBe(g1.grandTotals.taxable);
  });

  it("compares against the newest filed snapshot", () => {
    const snaps = [
      { id: "3", totals: { [STAGE_KEY]: "exported" } },
      { id: "2", totals: { [STAGE_KEY]: "filed" } },
      { id: "1", totals: { [STAGE_KEY]: "filed" } },
    ];
    expect(filedSnapshot(snaps)?.id).toBe("2");
    expect(filedSnapshot([{ id: "x", totals: {} }])?.id).toBe("x");
    expect(filedSnapshot([])).toBeUndefined();
  });
});

describe("GSTR-3B helpers", () => {
  const g3 = buildGstr3b({ invoices, expenses: fixtureExpenses(), settings, periodKey: PERIOD });

  it("totals the cash payable heads", () => {
    const c = g3.payable.cashPayable;
    expect(cashPayableTotal(g3)).toBe(
      (Number(c.igst) + Number(c.cgst) + Number(c.sgst) + Number(c.cess)).toFixed(2),
    );
  });

  it("writes every row, the 3.2 table and the draft note to CSV", () => {
    const rows = gstr3bCsvRows(g3, { gstin: "G", generatedAt: "now", draftNote: "DRAFT" });
    expect(rows.filter((r) => r[0] === "3.2")).toHaveLength(g3.table32.length);
    expect(rows.slice(0, g3.rows.length).map((r) => r[0])).toEqual(g3.rows.map((r) => r.id));
    expect(rows.at(-1)).toEqual(["DRAFT"]);
  });
});
