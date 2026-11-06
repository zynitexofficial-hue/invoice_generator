import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvText, parseGstr2bCsv, parseGstr2bJson, reconcile, type BookDoc } from ".";

/**
 * Fixtures under ./fixtures are hand-built from the commonly published layout of
 * the portal's GSTR-2B JSON / Excel downloads (NOT real portal files). They carry
 * the quirks real files have: extra metadata keys, numbers as strings, a BOM,
 * a two-row header, a totals row, "27-Maharashtra" place of supply, etc.
 * Replace/add real (redacted) files here when available.
 */
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("GSTR-2B JSON, portal-style file", () => {
  const p = parseGstr2bJson(fixture("gstr2b-portal-oct-2026.json"));

  it("reads every section with no warnings", () => {
    expect(p.warnings).toEqual([]);
    expect(p.periodKey).toBe("2026-10");
    expect(p.gstin).toBe("27AAACR1234A1Z5");
    expect(p.sectionCounts).toEqual({ b2b: 3, b2ba: 1, cdnr: 2, cdnra: 1, isd: 1, impg: 1 });
  });

  it("reads numeric and string amounts identically", () => {
    const numeric = p.rows.find((r) => r.docNo === "INV/26-27/0012")!;
    const stringy = p.rows.find((r) => r.docNo === "SI-77")!;
    expect(numeric).toMatchObject({ taxable: "10000.00", cgst: "900.00", sgst: "900.00" });
    expect(stringy).toMatchObject({
      taxable: "5000.00",
      igst: "900.00",
      itcAvailable: false,
      itcReason: "POS",
    });
  });

  it("distinguishes credit and debit notes and amended notes", () => {
    const byNo = (n: string) => p.rows.find((r) => r.docNo === n)!;
    expect(byNo("CN-3").docType).toBe("credit_note");
    expect(byNo("DN-1").docType).toBe("debit_note");
    expect(byNo("CN-3A")).toMatchObject({
      section: "cdnra",
      origDocNo: "CN-3",
      docType: "credit_note",
    });
    expect(byNo("NEW-1")).toMatchObject({ section: "b2ba", origDocNo: "OLD-1" });
  });

  it("reads reverse charge, ISD and bill of entry", () => {
    expect(p.rows.find((r) => r.docNo === "GL-5")).toMatchObject({
      rcm: true,
      itcAvailable: false,
      itcReason: "C",
    });
    expect(p.rows.find((r) => r.docNo === "ISD-9")).toMatchObject({
      igst: "50.00",
      itcAvailable: true,
    });
    // numeric bill-of-entry number becomes text; its own date (not the portal's refdt) is used
    expect(p.rows.find((r) => r.section === "impg")).toMatchObject({
      docNo: "6543210",
      docDate: "2026-10-02",
      igst: "3600.00",
    });
  });

  it("survives a BOM and unusual wrappers", () => {
    expect(parseGstr2bJson("﻿" + fixture("gstr2b-portal-oct-2026.json")).rows).toHaveLength(
      p.rows.length,
    );
    const inner = JSON.parse(fixture("gstr2b-portal-oct-2026.json")).data.data.docdata;
    expect(parseGstr2bJson(JSON.stringify(inner)).rows).toHaveLength(p.rows.length);
  });

  it("tolerates empty or null sections without false alarms", () => {
    const doc = {
      data: {
        gstin: "27AAACR1234A1Z5",
        rtnprd: "112026",
        data: { docdata: { b2b: [], cdnr: null } },
      },
    };
    const r = parseGstr2bJson(JSON.stringify(doc));
    expect(r.rows).toEqual([]);
    expect(r.warnings.join(" ")).not.toMatch(/expected list form/);
  });

  it("normalises supplier GSTIN case/space and skips supplier blocks without invoices", () => {
    const doc = {
      data: {
        rtnprd: "102026",
        data: {
          docdata: {
            b2b: [
              {
                ctin: " 27aabcu9603r1zx ",
                inv: [{ inum: "A-1", dt: "01-10-2026", txval: "100", cgst: "9", sgst: "9" }],
              },
              { ctin: "29AAACG5678B1Z2" },
            ],
          },
        },
      },
    };
    const r = parseGstr2bJson(JSON.stringify(doc));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].supplierGstin).toBe("27AABCU9603R1ZX");
  });
});

describe("GSTR-2B CSV, portal-style workbook export", () => {
  it("reads the B2B sheet through a title block, two header rows and a totals row", () => {
    const p = parseGstr2bCsv(fixture("gstr2b-b2b-oct-2026.csv"), { periodKey: "102026" });
    expect(p.rows).toHaveLength(3);
    expect(p.rows[0]).toMatchObject({
      docNo: "INV/26-27/0012",
      docDate: "2026-10-05",
      taxable: "10000.00",
      cgst: "900.00",
      pos: "27",
      itcAvailable: true,
      notes: "Invoice value 11800.00",
    });
    expect(p.rows[1]).toMatchObject({ itcAvailable: false, itcReason: "POS", igst: "900.00" });
    expect(p.warnings.join(" ")).toMatch(/1 row\(s\) without a document number were skipped/);
  });

  it("does not turn 'Deemed exports' invoices into debit notes", () => {
    const p = parseGstr2bCsv(fixture("gstr2b-b2b-oct-2026.csv"));
    const de = p.rows.find((r) => r.docNo === "DE-4")!;
    expect(de.docType).toBe("invoice");
    expect(de.section).toBe("b2b");
  });

  it("reads the CDNR sheet's credit and debit notes (and ignores 'Note Supply type')", () => {
    const p = parseGstr2bCsv(fixture("gstr2b-cdnr-oct-2026.csv"));
    expect(p.rows.map((r) => [r.docNo, r.docType, r.section])).toEqual([
      ["CN-3", "credit_note", "cdnr"],
      ["DN-1", "debit_note", "cdnr"],
    ]);
  });

  it("detects semicolon and tab files even when a title line has no delimiter", () => {
    const body =
      "GSTIN of supplier;Invoice number;Invoice Date;Taxable Value;Central Tax;State/UT Tax";
    const semi = `GSTR-2B B2B\n${body}\n27AABCU9603R1ZX;A-1;05-10-2026;100,00;9;9\n`;
    expect(parseCsvText(semi)[1]).toHaveLength(6);
    expect(parseGstr2bCsv(semi.replace(/;/g, "\t")).rows).toHaveLength(1);
  });
});

describe("end to end: portal files reconciled against books", () => {
  const p = parseGstr2bJson(fixture("gstr2b-portal-oct-2026.json"));
  const book = (o: Partial<BookDoc>): BookDoc => ({
    key: "purchase:p1",
    targetType: "purchase",
    targetId: "p1",
    label: "Bill",
    gstin: "27AABCU9603R1ZX",
    name: "Ultra Steel",
    docNo: "INV-12",
    date: "2026-10-05",
    periodDate: "2026-10-05",
    taxable: "10000.00",
    igst: "0.00",
    cgst: "900.00",
    sgst: "900.00",
    cess: "0.00",
    rcm: false,
    itcEligible: true,
    ...o,
  });

  it("matches a book bill whose number differs only by punctuation and zeros", () => {
    const r = reconcile({ rows: p.rows, books: [book({ docNo: "INV/26-27/12" })] });
    const m = r.matches.find((x) => x.row.docNo === "INV/26-27/0012")!;
    expect(m.status).toBe("matched");
    expect(r.other.map((x) => x.section).sort()).toEqual(["impg", "isd"]);
  });

  it("reports portal documents missing in books", () => {
    const r = reconcile({ rows: p.rows, books: [] });
    expect(r.matches).toHaveLength(0);
    expect(r.missingInBooks.length).toBe(p.rows.length - 2); // all except impg + isd
  });
});
