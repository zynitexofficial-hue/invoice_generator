import { describe, expect, it } from "vitest";
import {
  B2B_KA_GSTIN,
  B2B_MH_GSTIN,
  fixtureInvoices,
  fixtureSettings,
  ln,
  mkInvoice,
} from "@/lib/gst/returns/fixtures/october-2026";
import {
  cancelWindow,
  einvoiceCsvRows,
  ineligibleReason,
  isEInvoiceApplicable,
  parseAckDate,
  reportingStatus,
  reportingWindowDays,
} from "./index";
import { buildEInvoices, einvoiceBulkJson, irpDate, splitAddress } from "./payload";
import { matchResponse, parseIrpResponse } from "./response";
import { countRows, einvoiceRows, einvoiceState, irnError, withIrpEntry } from "./status";

const base = fixtureSettings();
const settings = fixtureSettings({
  profile: { ...base.profile, city: "Pune", pincode: "411001" },
});
const buyer = {
  company: "Mumbai Retail Pvt Ltd",
  gstin: B2B_MH_GSTIN,
  stateCode: "27",
  billingAddress: "5 Marine Drive",
  city: "Mumbai",
  pincode: "400001",
};

function full(extra: Record<string, unknown> = {}) {
  return mkInvoice({
    id: "e1",
    number: "INV/26-27/101",
    invoiceDate: "2026-10-01",
    seller: settings.profile,
    customer: buyer,
    lines: [ln("Laptop bag", "42021290", "10", "1000", "18")],
    ...extra,
  });
}

describe("applicability", () => {
  it("needs the switch or an AATO above the threshold", () => {
    expect(isEInvoiceApplicable(fixtureSettings())).toBe(false);
    expect(isEInvoiceApplicable(fixtureSettings({ gst: { eInvoiceApplicable: true } }))).toBe(true);
    expect(isEInvoiceApplicable(fixtureSettings({ gst: { aato: "50000000" } }))).toBe(true);
    expect(isEInvoiceApplicable(fixtureSettings({ gst: { aato: "49999999" } }))).toBe(false);
    expect(
      isEInvoiceApplicable(
        fixtureSettings({ gst: { eInvoiceApplicable: true, registrationType: "composition" } }),
      ),
    ).toBe(false);
  });

  it("covers only B2B tax invoices and notes", () => {
    const all = fixtureInvoices();
    const reasonOf = (id: string) => ineligibleReason(all.find((i) => i.id === id)!);
    expect(reasonOf("inv-b2b-intra")).toBeNull();
    expect(reasonOf("inv-b2cl")).toBe("not_b2b");
    expect(reasonOf("inv-draft")).toBe("not_issued");
    expect(reasonOf("qtn-1")).toBe("wrong_type");
    // Export documents have their own doc type and are never e-invoiced here.
    expect(all.filter((i) => i.docType === "export").length).toBeGreaterThan(0);
    expect(all.filter((i) => i.docType === "export").every((i) => ineligibleReason(i))).toBe(true);
  });

  it("reporting window applies from AATO of 10 crore", () => {
    const s30 = fixtureSettings({ gst: { aato: "100000000" } });
    expect(reportingWindowDays(s30)).toBe(30);
    expect(reportingWindowDays(fixtureSettings({ gst: { aato: "99999999" } }))).toBeNull();
    const inv = { invoiceDate: "2026-10-01" };
    expect(reportingStatus(inv, s30, "2026-10-10")).toMatchObject({
      deadline: "2026-10-31",
      daysLeft: 21,
      state: "ok",
    });
    expect(reportingStatus(inv, s30, "2026-10-28").state).toBe("soon");
    expect(reportingStatus(inv, s30, "2026-11-02")).toMatchObject({
      daysLeft: -2,
      state: "overdue",
    });
    expect(reportingStatus(inv, settings, "2026-12-31").state).toBe("none");
  });

  it("24 hour cancel window counts from the acknowledgement (IST)", () => {
    const ack = "2026-10-05 10:00:00"; // 04:30Z
    const t0 = Date.parse("2026-10-05T04:30:00Z");
    expect(parseAckDate(ack)).toBe(t0);
    expect(parseAckDate("05/10/2026 10:00:00")).toBe(t0);
    expect(parseAckDate("2026-10-05T04:30:00Z")).toBe(t0);
    expect(Number.isNaN(parseAckDate("soon"))).toBe(true);
    const open = cancelWindow(ack, t0 + 23 * 3_600_000 + 60_000);
    expect(open).toMatchObject({ state: "open", hoursLeft: 0 });
    expect(cancelWindow(ack, t0 + 1 * 3_600_000).hoursLeft).toBe(23);
    expect(cancelWindow(ack, t0 + 25 * 3_600_000).state).toBe("closed");
    expect(cancelWindow("", t0).state).toBe("none");
  });
});

describe("payload", () => {
  it("builds an INV-1 style document with consistent totals", () => {
    const [b] = buildEInvoices({ invoices: [full()], settings });
    expect(b.issues.filter((i) => i.severity === "error")).toEqual([]);
    const p = b.payload!;
    expect(p.Version).toBe("1.1");
    expect(p.TranDtls).toEqual({ TaxSch: "GST", SupTyp: "B2B", RegRev: "N", IgstOnIntra: "N" });
    expect(p.DocDtls).toEqual({ Typ: "INV", No: "INV/26-27/101", Dt: "01/10/2026" });
    expect(p.BuyerDtls).toMatchObject({
      Gstin: B2B_MH_GSTIN,
      LglNm: "Mumbai Retail Pvt Ltd",
      Pos: "27",
      Pin: 400001,
      Stcd: "27",
    });
    expect(p.SellerDtls.Pin).toBe(411001);
    expect(p.ItemList).toHaveLength(1);
    expect(p.ItemList[0]).toMatchObject({
      SlNo: "1",
      IsServc: "N",
      HsnCd: "42021290",
      Qty: 10,
      UnitPrice: 1000,
      TotAmt: 10000,
      AssAmt: 10000,
      GstRt: 18,
      CgstAmt: 900,
      SgstAmt: 900,
      IgstAmt: 0,
      TotItemVal: 11800,
    });
    expect(p.ValDtls).toMatchObject({
      AssVal: 10000,
      CgstVal: 900,
      SgstVal: 900,
      TotInvVal: 11800,
    });
  });

  it("uses IGST between states and allocates discounts to lines", () => {
    const inv = full({
      customer: { ...buyer, gstin: B2B_KA_GSTIN, stateCode: "29" },
      invoiceDiscount: { kind: "flat", value: "1000" },
      lines: [ln("Laptop bag", "42021290", "10", "1000", "18")],
    });
    const p = buildEInvoices({ invoices: [inv], settings })[0].payload!;
    expect(p.ItemList[0]).toMatchObject({
      Discount: 1000,
      TotAmt: 10000,
      AssAmt: 9000,
      IgstAmt: 1620,
      CgstAmt: 0,
    });
    expect(p.ValDtls.TotInvVal).toBe(10620);
    expect(p.BuyerDtls.Pos).toBe("29");
  });

  it("marks services, reverse charge, SEZ and credit notes with a reference", () => {
    const svc = full({
      reverseCharge: true,
      lines: [ln("Consulting", "998314", "1", "5000", "18")],
    });
    const ps = buildEInvoices({ invoices: [svc], settings })[0].payload!;
    expect(ps.ItemList[0].IsServc).toBe("Y");
    expect(ps.TranDtls.RegRev).toBe("Y");

    const cn = full({
      id: "cn1",
      docType: "credit_note",
      number: "CN/26-27/001",
      note: { originalInvoiceId: "e1", originalInvoiceNumber: "INV/26-27/101" },
    });
    const pc = buildEInvoices({ invoices: [full(), cn], settings, ids: ["cn1"] })[0].payload!;
    expect(pc.DocDtls.Typ).toBe("CRN");
    expect(pc.RefDtls?.PrecDocDtls).toEqual([{ InvNo: "INV/26-27/101", InvDt: "01/10/2026" }]);
  });

  it("reports blockers with Fix targets", () => {
    const bad = mkInvoice({
      id: "bad",
      number: "0-INVOICE-NUMBER-TOO-LONG",
      invoiceDate: "2026-10-02",
      customer: { company: "Buyer", gstin: B2B_MH_GSTIN, stateCode: "27" },
      lines: [ln("Thing", "12", "1", "100", "18", "xyz")],
    });
    const [b] = buildEInvoices({ invoices: [bad], settings: fixtureSettings() });
    expect(b.blocked).toBe(true);
    const fields = b.issues.map((i) => `${i.recordKind}:${i.field}`);
    expect(fields).toEqual(
      expect.arrayContaining([
        "invoice:number",
        "invoice:customer.billingAddress",
        "invoice:customer.city",
        "invoice:customer.pincode",
        "invoice:lines.0.hsnSac",
        "settings:profile.city",
        "settings:profile.pincode",
      ]),
    );
  });

  it("skips documents that are not e-invoice material", () => {
    expect(buildEInvoices({ invoices: fixtureInvoices(), settings }).length).toBeGreaterThan(0);
    const ids = buildEInvoices({ invoices: fixtureInvoices(), settings }).map((b) => b.invoiceId);
    expect(ids).not.toContain("inv-b2cl");
    expect(ids).not.toContain("qtn-1");
    expect(ids).not.toContain("inv-draft");
  });

  it("serialises a JSON array and a CSV preview with the draft notice", () => {
    const builds = buildEInvoices({ invoices: [full()], settings });
    const arr = JSON.parse(einvoiceBulkJson(builds));
    expect(Array.isArray(arr)).toBe(true);
    expect(arr[0].DocDtls.No).toBe("INV/26-27/101");
    const rows = einvoiceCsvRows(builds);
    expect(rows[0][1]).toBe("INV/26-27/101");
    expect(JSON.stringify(rows.at(-2))).toContain("DRAFT");
    expect(JSON.stringify(rows.at(-1))).toContain("einvoice1.gst.gov.in");
  });

  it("formats dates and splits long addresses", () => {
    expect(irpDate("2026-01-09")).toBe("09/01/2026");
    const long = "A".repeat(60) + " " + "B".repeat(60);
    const { addr1, addr2 } = splitAddress(long);
    expect(addr1.length).toBeLessThanOrEqual(100);
    expect(`${addr1} ${addr2}`).toBe(long);
    expect(splitAddress("Line 1\nLine 2")).toEqual({ addr1: "Line 1, Line 2", addr2: "" });
  });
});

describe("status and response import", () => {
  const irn = "a".repeat(64);

  it("validates IRN text and derives the state", () => {
    expect(irnError("")).toBeNull();
    expect(irnError(irn)).toBeNull();
    expect(irnError("abc")).toMatch(/64/);
    expect(irnError("z".repeat(64))).toMatch(/letters/);
    const inv = full();
    expect(einvoiceState(inv)).toBe("todo");
    expect(einvoiceState({ eInvoice: { ...inv.eInvoice, exportedAt: "2026-10-02" } })).toBe(
      "exported",
    );
    expect(einvoiceState({ eInvoice: { ...inv.eInvoice, irn } })).toBe("generated");
    expect(einvoiceState({ eInvoice: { ...inv.eInvoice, cancelledAt: "x" } })).toBe("cancelled");
  });

  it("flags a cancelled document whose IRN is still live", () => {
    const inv = full({
      status: "cancelled",
      eInvoice: { irn, status: "generated", ackNo: "1", ackDate: "2026-10-05 10:00:00" },
    });
    const rows = einvoiceRows({
      invoices: [inv],
      settings,
      today: "2026-10-06",
      nowMs: Date.now(),
    });
    expect(rows[0].irnNeedsCancel).toBe(true);
    expect(countRows(rows).irnNeedsCancel).toBe(1);
  });

  it("parses wrapped and bare responses, and matches by number", () => {
    const text = JSON.stringify({
      data: [
        {
          DocNo: "INV/26-27/101",
          Irn: irn,
          AckNo: 112010001234567,
          AckDt: "2026-10-05 14:32:10",
          SignedQRCode: "QR...",
        },
        { Irn: "b".repeat(64), AckNo: 5 },
        { Foo: 1 },
      ],
    });
    const parsed = parseIrpResponse(text);
    expect(parsed.entries).toHaveLength(2);
    expect(parsed.problems.join(" ")).toMatch(/no document number/);
    const m = matchResponse(parsed.entries, [full()]);
    expect(m.map((x) => x.reason)).toEqual(["matched", "no_number"]);
    const updated = withIrpEntry(m[0].invoice!, m[0].entry);
    expect(updated.eInvoice).toMatchObject({
      irn,
      ackNo: "112010001234567",
      ackDate: "2026-10-05 14:32:10",
      qr: "QR...",
      status: "generated",
    });
  });

  it("reads the document number from a signed invoice token", () => {
    const payload = {
      data: JSON.stringify({ DocDtls: { No: "INV/26-27/101", Dt: "01/10/2026" } }),
    };
    const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${b64({ alg: "RS256" })}.${b64(payload)}.sig`;
    const parsed = parseIrpResponse(
      JSON.stringify([{ Irn: irn, AckNo: "9", SignedInvoice: token }]),
    );
    expect(parsed.entries[0]).toMatchObject({ docNo: "INV/26-27/101", docDate: "2026-10-01" });
  });

  it("rejects non-JSON and files without an IRN", () => {
    expect(parseIrpResponse("not json").problems[0]).toMatch(/not valid JSON/);
    expect(parseIrpResponse("{}").problems[0]).toMatch(/No IRN/);
  });
});
