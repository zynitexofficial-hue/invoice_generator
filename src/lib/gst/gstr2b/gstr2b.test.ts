import { describe, expect, it } from "vitest";
import {
  bookDocsFromExpenses,
  buildBookDocs,
  normalizeDocNo,
  overrideRecord,
  parseGstr2bCsv,
  parseGstr2bJson,
  parsePortalDate,
  parseReturnPeriod,
  reconcile,
  reconSummary,
  type BookDoc,
} from ".";
import { expenseSchema, purchaseSchema, type Gstr2bRow } from "@/lib/schema";

const FIXTURE = {
  data: {
    gstin: "27AAACR1234A1Z5",
    rtnprd: "102026",
    version: "1.0",
    data: {
      docdata: {
        b2b: [
          {
            ctin: "27AABCU9603R1ZX",
            trdnm: "Ultra Steel Traders",
            inv: [
              {
                inum: "INV/26-27/0012",
                typ: "R",
                dt: "05-10-2026",
                val: 11800,
                pos: "27",
                rev: "N",
                itcavl: "Y",
                txval: 10000,
                igst: 0,
                cgst: 900,
                sgst: 900,
                cess: 0,
              },
              {
                inum: "SI-77",
                typ: "R",
                dt: "09-10-2026",
                val: 5900,
                pos: "27",
                rev: "N",
                itcavl: "N",
                rsn: "POS",
                items: [
                  { txval: 3000, igst: 0, cgst: 270, sgst: 270, cess: 0 },
                  { txval: 2000, igst: 0, cgst: 180, sgst: 180, cess: 0 },
                ],
              },
            ],
          },
          {
            ctin: "29AAACG5678B1Z2",
            trdnm: "Gamma Logistics",
            inv: [
              {
                inum: "GL-5",
                dt: "12-10-2026",
                val: 1180,
                pos: "27",
                rev: "Y",
                itcavl: "N",
                txval: 1000,
                igst: 180,
              },
            ],
          },
        ],
        b2ba: [
          {
            ctin: "27AABCU9603R1ZX",
            inv: [
              {
                oinum: "OLD-1",
                inum: "NEW-1",
                dt: "15-10-2026",
                txval: 500,
                cgst: 45,
                sgst: 45,
                itcavl: "Y",
              },
            ],
          },
        ],
        cdnr: [
          {
            ctin: "27AABCU9603R1ZX",
            nt: [
              {
                ntnum: "CN-3",
                typ: "C",
                dt: "20-10-2026",
                txval: 1000,
                cgst: 90,
                sgst: 90,
                itcavl: "Y",
              },
            ],
          },
        ],
        isd: [
          { ctin: "29AAAAA0000A1Z5", docnum: "ISD-9", docdt: "25-10-2026", igst: 50, itcelg: "Y" },
        ],
        impg: [
          { boenum: 123456, boedt: "02-10-2026", portcode: "INMUN1", txval: 20000, igst: 3600 },
        ],
      },
    },
  },
};

describe("date and number helpers", () => {
  it("parses portal dates and periods", () => {
    expect(parsePortalDate("05-10-2026")).toBe("2026-10-05");
    expect(parsePortalDate("5/10/2026")).toBe("2026-10-05");
    expect(parsePortalDate("2026-10-05")).toBe("2026-10-05");
    expect(parsePortalDate("05-Oct-2026")).toBe("2026-10-05");
    expect(parsePortalDate("31-02-2026")).toBe("");
    expect(parsePortalDate("garbage")).toBe("");
    expect(parseReturnPeriod("102026")).toBe("2026-10");
    expect(parseReturnPeriod("Oct-2026")).toBe("2026-10");
    expect(parseReturnPeriod("132026")).toBe("");
  });
  it("normalises invoice numbers", () => {
    expect(normalizeDocNo("INV/0012")).toBe("INV12");
    expect(normalizeDocNo(" inv-12 ")).toBe("INV12");
    expect(normalizeDocNo("A-0100")).toBe("A100");
  });
});

describe("parseGstr2bJson", () => {
  const parsed = parseGstr2bJson(JSON.stringify(FIXTURE));
  it("reads meta and every section", () => {
    expect(parsed.periodKey).toBe("2026-10");
    expect(parsed.gstin).toBe("27AAACR1234A1Z5");
    expect(parsed.sectionCounts).toEqual({ b2b: 3, b2ba: 1, cdnr: 1, isd: 1, impg: 1 });
    expect(parsed.rows).toHaveLength(7);
    expect(new Set(parsed.rows.map((r) => r.id)).size).toBe(7);
  });
  it("reads amounts, flags and dates", () => {
    const [a, b, c] = parsed.rows;
    expect(a).toMatchObject({
      supplierGstin: "27AABCU9603R1ZX",
      docNo: "INV/26-27/0012",
      docDate: "2026-10-05",
      taxable: "10000.00",
      cgst: "900.00",
      sgst: "900.00",
      igst: "0.00",
      itcAvailable: true,
      rcm: false,
    });
    // amounts on items are summed
    expect(b).toMatchObject({
      taxable: "5000.00",
      cgst: "450.00",
      itcAvailable: false,
      itcReason: "POS",
    });
    expect(c).toMatchObject({ rcm: true, itcAvailable: false, igst: "180.00" });
  });
  it("reads amendments, notes, ISD and imports", () => {
    const amended = parsed.rows.find((r) => r.section === "b2ba")!;
    expect(amended).toMatchObject({ docNo: "NEW-1", origDocNo: "OLD-1" });
    const cn = parsed.rows.find((r) => r.section === "cdnr")!;
    expect(cn.docType).toBe("credit_note");
    const imp = parsed.rows.find((r) => r.section === "impg")!;
    expect(imp).toMatchObject({ docNo: "123456", igst: "3600.00", supplierGstin: "" });
    expect(parsed.rows.find((r) => r.section === "isd")!.igst).toBe("50.00");
  });
  it("accepts a flatter wrapper and reports bad input without throwing", () => {
    const flat = parseGstr2bJson(JSON.stringify({ docdata: FIXTURE.data.data.docdata }));
    expect(flat.rows).toHaveLength(7);
    expect(flat.warnings.join(" ")).toMatch(/period/);
    expect(parseGstr2bJson("{nope").warnings[0]).toMatch(/not valid JSON/);
    expect(parseGstr2bJson("{}").rows).toEqual([]);
    expect(parseGstr2bJson("{}").warnings.length).toBeGreaterThan(0);
  });
});

describe("parseGstr2bCsv", () => {
  const csv = [
    "GSTR-2B B2B,,,,",
    "GSTIN of supplier,Trade/Legal name,Invoice number,Invoice type,Invoice Date,Invoice Value(₹),Place of supply,Supply Attract Reverse Charge,Rate(%),Taxable Value (₹),Integrated Tax(₹),Central Tax(₹),State/UT Tax(₹),Cess(₹),ITC Availability,Reason",
    '27AABCU9603R1ZX,"Ultra Steel, Traders",INV-12,Regular,05-10-2026,"11,800.00",27,No,18,"5,000.00",0,450,450,0,Yes,',
    "27AABCU9603R1ZX,Ultra Steel Traders,INV-12,Regular,05-10-2026,11800.00,27,No,18,5000.00,0,450,450,0,Yes,",
    "29AAACG5678B1Z2,Gamma,GL-5,Regular,12-10-2026,1180,27,Yes,18,1000,180,0,0,0,No,Others",
    ",,,,,,,,,,,,,,,",
  ].join("\r\n");
  it("merges rate rows of one document and reads quoted cells", () => {
    const p = parseGstr2bCsv(csv, { periodKey: "102026" });
    expect(p.periodKey).toBe("2026-10");
    expect(p.rows).toHaveLength(2);
    expect(p.rows[0]).toMatchObject({
      supplierName: "Ultra Steel, Traders",
      taxable: "10000.00",
      cgst: "900.00",
      docDate: "2026-10-05",
      itcAvailable: true,
    });
    expect(p.rows[1]).toMatchObject({ rcm: true, itcAvailable: false, itcReason: "Others" });
  });
  it("treats a credit-note sheet's type column as the document type", () => {
    const p = parseGstr2bCsv(
      "GSTIN of supplier,Note number,Note type,Note Date,Taxable Value,Central Tax,State/UT Tax\n27AABCU9603R1ZX,CN-1,Credit Note,01-10-2026,100,9,9\n",
    );
    expect(p.rows[0]).toMatchObject({ docType: "credit_note", section: "cdnr", docNo: "CN-1" });
  });
  it("explains a file without a usable header", () => {
    const p = parseGstr2bCsv("a,b\n1,2");
    expect(p.rows).toEqual([]);
    expect(p.warnings[0]).toMatch(/header/);
  });
});

/* ---------- matching ---------- */

const row = (o: Partial<Gstr2bRow>): Gstr2bRow => ({
  id: "r1",
  supplierGstin: "27AABCU9603R1ZX",
  supplierName: "Ultra Steel",
  docType: "invoice",
  docNo: "INV-12",
  docDate: "2026-10-05",
  section: "b2b",
  origDocNo: "",
  pos: "27",
  taxable: "10000.00",
  igst: "0.00",
  cgst: "900.00",
  sgst: "900.00",
  cess: "0.00",
  rcm: false,
  itcAvailable: true,
  itcReason: "",
  imsAction: "none",
  notes: "",
  ...o,
});

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

describe("reconcile", () => {
  it("matches exactly, ignoring punctuation, case and leading zeros", () => {
    const r = reconcile({
      rows: [row({ docNo: "inv/0012" })],
      books: [book({ docNo: "INV-12" })],
    });
    expect(r.matches[0].status).toBe("matched");
    expect(r.missingInBooks).toEqual([]);
    expect(r.missingIn2B).toEqual([]);
  });

  it("accepts rounding differences within tolerance", () => {
    const r = reconcile({ rows: [row({ cgst: "900.40" })], books: [book({})] });
    expect(r.matches[0].status).toBe("matched");
  });

  it("flags a mismatch when tax differs, with plain reasons", () => {
    const r = reconcile({
      rows: [row({ cgst: "810.00", sgst: "810.00", taxable: "9000.00" })],
      books: [book({})],
    });
    const m = r.matches[0];
    expect(m.status).toBe("mismatch");
    expect(m.taxDiff).toBe("180.00");
    expect(m.taxableDiff).toBe("1000.00");
    expect(m.reasons.join(" ")).toMatch(/Taxable value differs by ₹1000.00/);
    expect(m.reasons.join(" ")).toMatch(/CGST differs by ₹90.00/);
  });

  it("flags a mismatch when the date is far apart", () => {
    const r = reconcile({ rows: [row({})], books: [book({ date: "2026-09-01" })] });
    expect(r.matches[0].status).toBe("mismatch");
    expect(r.matches[0].reasons[0]).toMatch(/days apart/);
  });

  it("finds probable matches with a fuzzy invoice number", () => {
    const r = reconcile({
      rows: [row({ docNo: "INV/26-27/0012" })],
      books: [book({ docNo: "12" })],
    });
    expect(r.matches[0].status).toBe("probable");
    expect(r.matches[0].reasons[0]).toMatch(/look alike/);
  });

  it("finds probable matches by amount and date when numbers differ", () => {
    const r = reconcile({ rows: [row({ docNo: "XYZ" })], books: [book({ docNo: "ABC-9" })] });
    expect(r.matches[0].status).toBe("probable");
    expect(r.matches[0].reasons[0]).toMatch(/different number/);
  });

  it("does not match a different supplier or very different amounts", () => {
    const r = reconcile({
      rows: [
        row({ docNo: "INV-12" }),
        row({ id: "r2", docNo: "ZZ-1", taxable: "99999.00", cgst: "5.00" }),
      ],
      books: [
        book({ gstin: "29AAACG5678B1Z2" }),
        book({ key: "purchase:p2", targetId: "p2", docNo: "ZZ-1" }),
      ],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.matches[0].status).toBe("mismatch");
    expect(r.matches[0].row.id).toBe("r2");
    expect(r.missingInBooks.map((x) => x.id)).toEqual(["r1"]);
    expect(r.missingIn2B.map((b) => b.key)).toEqual(["purchase:p1"]);
  });

  it("reports missing in books and missing in 2B, honouring the window and eligibility", () => {
    const r = reconcile({
      rows: [row({ id: "r9", docNo: "ONLY-2B", supplierGstin: "29AAACG5678B1Z2" })],
      books: [
        book({ key: "expense:e1", targetType: "expense", targetId: "e1", docNo: "BOOK-ONLY" }),
        book({
          key: "expense:e2",
          targetType: "expense",
          targetId: "e2",
          docNo: "OLD",
          periodDate: "2026-08-01",
        }),
        book({
          key: "expense:e3",
          targetType: "expense",
          targetId: "e3",
          docNo: "NOITC",
          itcEligible: false,
        }),
        book({ key: "expense:e4", targetType: "expense", targetId: "e4", docNo: "RCM", rcm: true }),
      ],
      missingWindow: { start: "2026-10-01", end: "2026-10-31" },
    });
    expect(r.missingInBooks.map((x) => x.id)).toEqual(["r9"]);
    expect(r.missingIn2B.map((b) => b.targetId)).toEqual(["e1"]);
  });

  it("does not reuse one book document for two rows", () => {
    const r = reconcile({
      rows: [row({ id: "a" }), row({ id: "b" })],
      books: [book({})],
    });
    expect(r.matches).toHaveLength(1);
    expect(r.missingInBooks).toHaveLength(1);
  });

  it("lets an amendment claim the book document of the original number", () => {
    const r = reconcile({
      rows: [
        row({ id: "orig", docNo: "OLD-1" }),
        row({ id: "amd", section: "b2ba", docNo: "NEW-1", origDocNo: "OLD-1" }),
      ],
      books: [book({ docNo: "OLD-1" })],
    });
    expect(r.matches[0].row.id).toBe("amd");
    expect(r.matches[0].status).toBe("matched");
  });

  it("applies manual accept, unlink and ignore decisions", () => {
    const rows = [
      row({ id: "a", docNo: "XYZ", taxable: "1.00", cgst: "0.09", sgst: "0.09" }),
      row({ id: "b" }),
      row({ id: "c", docNo: "C-1" }),
    ];
    const books = [
      book({}),
      book({
        key: "purchase:p2",
        targetId: "p2",
        docNo: "OTHER",
        taxable: "50.00",
        cgst: "4.50",
        sgst: "4.50",
      }),
    ];
    const accept = overrideRecord("imp", rows[0], { kind: "accept", book: books[1] });
    expect(accept.id).toBe("imp:a");
    const r = reconcile({
      rows,
      books,
      overrides: [
        accept as never,
        overrideRecord("imp", rows[1], { kind: "unlink" }) as never,
        overrideRecord("imp", rows[2], { kind: "ignore" }) as never,
      ],
    });
    expect(r.matches.find((m) => m.row.id === "a")).toMatchObject({ status: "manual" });
    expect(r.matches.find((m) => m.row.id === "a")!.book.targetId).toBe("p2");
    expect(r.missingInBooks.map((x) => x.id)).toEqual(["b"]);
    expect(r.ignored.map((x) => x.id)).toEqual(["c"]);
    // the unlinked row's would-be book stays unclaimed and shows as missing in 2B
    expect(r.missingIn2B.map((b) => b.targetId)).toEqual(["p1"]);
    expect(reconSummary(r)).toMatchObject({
      manual: 1,
      missingInBooks: 1,
      ignored: 1,
      missingIn2B: 1,
    });
  });

  it("ignores a stale manual link whose document no longer exists", () => {
    const rows = [row({})];
    const stale = {
      rowId: "r1",
      status: "manual" as const,
      targetType: "purchase" as const,
      targetId: "gone",
    };
    const r = reconcile({ rows, books: [book({})], overrides: [stale] });
    expect(r.matches[0].status).toBe("matched");
  });

  it("keeps imports and ISD rows out of matching", () => {
    const r = reconcile({
      rows: [
        row({ id: "i", section: "impg", supplierGstin: "" }),
        row({ id: "s", section: "isd" }),
      ],
      books: [],
    });
    expect(r.other.map((x) => x.id)).toEqual(["i", "s"]);
    expect(r.missingInBooks).toEqual([]);
  });
});

describe("books from expenses and purchases", () => {
  const expense = expenseSchema.parse({
    id: "e1",
    date: "2026-10-06",
    vendorName: "Ultra Steel",
    vendorGstin: "27aabcu9603r1zx",
    amount: "11800",
    amountIncludesGst: true,
    gstRate: "18",
    gstMode: "intra",
    itcEligible: true,
    invoiceNo: "INV-12",
    invoiceDate: "2026-10-05",
  });
  it("derives tax from the expense and uppercases the GSTIN", () => {
    const [b] = bookDocsFromExpenses([expense]);
    expect(b).toMatchObject({
      gstin: "27AABCU9603R1ZX",
      taxable: "10000.00",
      cgst: "900.00",
      sgst: "900.00",
      date: "2026-10-05",
      periodDate: "2026-10-06",
      itcEligible: true,
    });
    expect(reconcile({ rows: [row({})], books: [b] }).matches[0].status).toBe("matched");
  });
  it("skips expenses without GST and avoids double counting linked expenses", () => {
    const plain = expenseSchema.parse({ id: "e2", date: "2026-10-01", amount: "100" });
    expect(bookDocsFromExpenses([plain])).toEqual([]);
    const purchase = purchaseSchema.parse({
      id: "p1",
      vendorGstin: "27AABCU9603R1ZX",
      billNo: "INV-12",
      billDate: "2026-10-05",
      expenseId: "e1",
      itcEligible: true,
      summary: {
        taxable: "10000.00",
        cgst: "900.00",
        sgst: "900.00",
        igst: "0.00",
        total: "11800.00",
      },
    });
    const docs = buildBookDocs({ purchases: [purchase], expenses: [expense] });
    expect(docs.map((d) => d.key)).toEqual(["purchase:p1"]);
  });
});
