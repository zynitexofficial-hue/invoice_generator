import { describe, expect, it } from "vitest";
import { buildGstr1 } from "./gstr1";
import {
  FORMAT_VERSION,
  csvDate,
  csvPos,
  gstr1Csv,
  gstr1Json,
  gstr1JsonFile,
  portalDate,
  returnPeriod,
} from "./gstr1-json";
import {
  B2B_KA_GSTIN,
  B2B_MH_GSTIN,
  PERIOD,
  SEZ_GJ_GSTIN,
  SELLER_GSTIN,
  fixtureInvoices,
  fixtureSettings,
} from "./fixtures/october-2026";

const result = buildGstr1({
  invoices: fixtureInvoices(),
  settings: fixtureSettings(),
  periodKey: PERIOD,
});
const json = gstr1Json(result) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

describe("GSTR-1 portal JSON", () => {
  it("has the header keys", () => {
    expect(json.gstin).toBe(SELLER_GSTIN);
    expect(json.fp).toBe("102026");
    expect(json.version).toBe(FORMAT_VERSION);
    expect(json.hash).toBe("hash");
    expect(Object.keys(json)).toEqual([
      "gstin",
      "fp",
      "version",
      "hash",
      "b2b",
      "b2cl",
      "b2cs",
      "exp",
      "cdnr",
      "cdnur",
      "nil",
      "hsn",
      "doc_issue",
    ]);
  });

  it("formats periods and dates", () => {
    expect(returnPeriod("2026-10")).toBe("102026");
    expect(returnPeriod("2026-Q3")).toBe("122026");
    expect(returnPeriod("2026-Q4")).toBe("032027");
    expect(portalDate("2026-10-05")).toBe("05-10-2026");
    expect(csvDate("2026-10-05")).toBe("05-Oct-2026");
    expect(csvPos("27")).toBe("27-Maharashtra");
    expect(csvPos("96")).toBe("96-Other Countries");
  });

  it("b2b grouped by ctin with itm_det per head", () => {
    expect(json.b2b.map((g: { ctin: string }) => g.ctin)).toEqual([
      B2B_MH_GSTIN,
      B2B_KA_GSTIN,
      SEZ_GJ_GSTIN,
    ]);
    expect(json.b2b[0].inv[0]).toEqual({
      inum: "INV/26-27/001",
      idt: "01-10-2026",
      val: 17700,
      pos: "27",
      rchrg: "N",
      inv_typ: "R",
      itms: [{ num: 1, itm_det: { txval: 15000, rt: 18, camt: 1350, samt: 1350, csamt: 0 } }],
    });
    expect(json.b2b[0].inv[1].rchrg).toBe("Y");
    expect(json.b2b[1].inv[0].itms[0].itm_det).toEqual({
      txval: 50000,
      rt: 5,
      iamt: 2500,
      csamt: 0,
    });
    expect(json.b2b[2].inv[0].inv_typ).toBe("SEWOP");
  });

  it("b2cl, b2cs, exp", () => {
    expect(json.b2cl).toEqual([
      {
        pos: "29",
        inv: [
          {
            inum: "INV/26-27/005",
            idt: "06-10-2026",
            val: 177000,
            itms: [{ num: 1, itm_det: { txval: 150000, rt: 18, iamt: 27000, csamt: 0 } }],
          },
        ],
      },
    ]);
    expect(json.b2cs[1]).toEqual({
      sply_ty: "INTRA",
      pos: "27",
      typ: "OE",
      txval: 1001,
      rt: 5,
      camt: 25.03,
      samt: 25.02,
      csamt: 0,
    });
    expect(json.exp.map((g: { exp_typ: string }) => g.exp_typ)).toEqual(["WPAY", "WOPAY"]);
    expect(json.exp[0].inv[0]).toEqual({
      inum: "EXP/26-27/001",
      idt: "13-10-2026",
      val: 98235,
      sbpcode: "INNSA1",
      sbnum: "1234567",
      sbdt: "14-10-2026",
      itms: [{ txval: 83250, rt: 18, iamt: 14985, csamt: 0 }],
    });
    expect(json.exp[1].inv[0]).not.toHaveProperty("sbnum");
    expect(json.exp[1].inv[0].val).toBe(103086.6);
  });

  it("cdnr, cdnur, nil", () => {
    expect(json.cdnr[0]).toEqual({
      ctin: B2B_KA_GSTIN,
      nt: [
        {
          ntty: "C",
          nt_num: "CN/26-27/001",
          nt_dt: "20-10-2026",
          val: 26250,
          pos: "29",
          rchrg: "N",
          inv_typ: "R",
          itms: [{ num: 1, itm_det: { txval: 25000, rt: 5, iamt: 1250, csamt: 0 } }],
        },
      ],
    });
    expect(json.cdnr[1].nt[0].ntty).toBe("D");
    expect(json.cdnur).toEqual([
      {
        typ: "B2CL",
        ntty: "C",
        nt_num: "CN/26-27/002",
        nt_dt: "21-10-2026",
        val: 11800,
        pos: "29",
        itms: [{ num: 1, itm_det: { txval: 10000, rt: 18, iamt: 1800, csamt: 0 } }],
      },
    ]);
    expect(json.nil).toEqual({
      inv: [
        { sply_ty: "INTRB2B", nil_amt: 4000, expt_amt: 0, ngsup_amt: 0 },
        { sply_ty: "INTRAB2C", nil_amt: 0, expt_amt: 3000, ngsup_amt: 0 },
      ],
    });
  });

  it("hsn split into hsn_b2b and hsn_b2c", () => {
    expect(Object.keys(json.hsn)).toEqual(["hsn_b2b", "hsn_b2c"]);
    expect(json.hsn.hsn_b2b[0]).toEqual({
      num: 1,
      hsn_sc: "1006",
      desc: "Rice (unbranded)",
      uqc: "KGS",
      qty: 40,
      rt: 0,
      txval: 4000,
      iamt: 0,
      camt: 0,
      samt: 0,
      csamt: 0,
    });
    expect(json.hsn.hsn_b2c).toHaveLength(7);
  });

  it("doc_issue by nature", () => {
    expect(json.doc_issue.doc_det.map((d: { doc_num: number }) => d.doc_num)).toEqual([1, 4, 5]);
    expect(json.doc_issue.doc_det[0].docs[2]).toEqual({
      num: 3,
      from: "INV/26-27/001",
      to: "INV/26-27/010",
      totnum: 10,
      cancel: 1,
      net_issue: 9,
    });
  });

  it("omits empty sections", () => {
    const empty = buildGstr1({ invoices: [], settings: fixtureSettings(), periodKey: PERIOD });
    expect(gstr1Json(empty)).toEqual({
      gstin: SELLER_GSTIN,
      fp: "102026",
      version: FORMAT_VERSION,
      hash: "hash",
    });
  });

  it("file string, with optional meta", () => {
    const plain = JSON.parse(gstr1JsonFile(result, { generatedAt: "2026-11-05T10:00:00Z" }));
    expect(plain).toEqual(json);
    const withMeta = JSON.parse(
      gstr1JsonFile(result, { generatedAt: "2026-11-05T10:00:00Z", withMeta: true }),
    );
    expect(withMeta._meta).toMatchObject({
      generatedAt: "2026-11-05T10:00:00Z",
      formatVersion: FORMAT_VERSION,
    });
  });

  it("matches the golden file", async () => {
    await expect(JSON.stringify(json, null, 2) + "\n").toMatchFileSnapshot(
      "./fixtures/gstr1-2026-10.golden.json",
    );
  });
});

describe("GSTR-1 CSV", () => {
  const files = gstr1Csv(result);

  it("one file per non-empty section", () => {
    expect(files.map((f) => f.section)).toEqual([
      "summary",
      "b2b",
      "b2cl",
      "b2cs",
      "exp",
      "cdnr",
      "cdnur",
      "exemp",
      "hsn_b2b",
      "hsn_b2c",
      "docs",
    ]);
    expect(files[1].filename).toBe(`GSTR1_${SELLER_GSTIN}_102026_b2b.csv`);
  });

  it("rows mirror the offline utility columns", () => {
    const b2b = files.find((f) => f.section === "b2b")!;
    expect(b2b.headers[0]).toBe("GSTIN/UIN of Recipient");
    expect(b2b.rows[0]).toEqual([
      B2B_MH_GSTIN,
      "Mumbai Retail Pvt Ltd",
      "INV/26-27/001",
      "01-Oct-2026",
      "17700.00",
      "27-Maharashtra",
      "N",
      "",
      "Regular B2B",
      "",
      "18",
      "15000.00",
      "0.00",
    ]);
    const hsn = files.find((f) => f.section === "hsn_b2b")!;
    expect(hsn.rows[0].slice(0, 5)).toEqual([
      "1006",
      "Rice (unbranded)",
      "KGS-KILOGRAMS",
      "40.00",
      "4000.00",
    ]);
    const docs = files.find((f) => f.section === "docs")!;
    expect(docs.rows).toContainEqual(["Credit Note", "CN/26-27/001", "CN/26-27/003", 3, 0]);
  });
});
