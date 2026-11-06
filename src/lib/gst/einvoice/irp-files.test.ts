import { describe, expect, it } from "vitest";
import { matchResponse, parseIrpResponse, withIrpEntry } from ".";
import { fixtureInvoices } from "../returns/fixtures/october-2026";

/**
 * IRP responses as the Generate-IRN API returns them (hand-built from the
 * published response shape, NOT a real file): Status "ACT"/"CNL", numeric AckNo,
 * "yyyy-MM-dd HH:mm:ss" AckDt, SignedInvoice = JWT whose payload `data` is a
 * JSON *string*, seller details with a Unicode trade name.
 */
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const IRN1 = "1f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a79881f2e3d4c5b6a7988";
const IRN2 = "9a8b7c6d5e4f30219a8b7c6d5e4f30219a8b7c6d5e4f30219a8b7c6d5e4f3021";

function signed(docNo: string, dt: string, seller = "27AAACR1234A1Z5") {
  const data = JSON.stringify({
    Version: "1.1",
    DocDtls: { Typ: "INV", No: docNo, Dt: dt },
    SellerDtls: { Gstin: seller, LglNm: "Rāmesh Traders — मुंबई" },
  });
  return `${b64({ alg: "RS256", typ: "JWT" })}.${b64({ data, iss: "NIC" })}.c2ln`;
}

const generateIrnResponse = {
  Status: 1,
  ErrorDetails: null,
  InfoDtls: null,
  Data: {
    AckNo: 112010001234567,
    AckDt: "2026-10-05 14:32:10",
    Irn: IRN1,
    SignedInvoice: signed("INV/26-27/0101", "05/10/2026"),
    SignedQRCode: "eyJhbGciOiJSUzI1NiJ9.qr.sig",
    Status: "ACT",
    EwbNo: null,
    EwbDt: null,
    Remarks: null,
  },
};

describe("IRP response files", () => {
  it("reads a Generate-IRN envelope, taking the number from the signed token", () => {
    const r = parseIrpResponse(JSON.stringify(generateIrnResponse));
    expect(r.problems).toEqual([]);
    expect(r.entries).toEqual([
      {
        docNo: "INV/26-27/0101",
        docDate: "2026-10-05",
        sellerGstin: "27AAACR1234A1Z5",
        irn: IRN1,
        ackNo: "112010001234567",
        ackDate: "2026-10-05 14:32:10",
        signedQr: "eyJhbGciOiJSUzI1NiJ9.qr.sig",
        status: "ACT",
      },
    ]);
  });

  it("reads a list of results, with and without the token, and flags the unmatched one", () => {
    const list = [
      { ...generateIrnResponse.Data },
      {
        Irn: IRN2,
        AckNo: 112010001234568,
        AckDt: "2026-10-06 09:01:00",
        DocNo: "INV/26-27/0102",
        Status: "ACT",
      },
      { Irn: "c".repeat(64), AckNo: 3, AckDt: "2026-10-06 09:02:00", Status: "ACT" },
    ];
    const r = parseIrpResponse(JSON.stringify({ Data: list }));
    expect(r.entries).toHaveLength(3);
    expect(r.problems.join(" ")).toMatch(/1 row\(s\) carry an IRN but no document number/);
  });

  it("matches to invoices by number and treats a cancelled (CNL) entry as cancelled", () => {
    const [inv] = fixtureInvoices();
    const number = inv.number;
    const text = JSON.stringify({
      Data: { ...generateIrnResponse.Data, SignedInvoice: signed(number, "05/10/2026") },
    });
    const [m] = matchResponse(parseIrpResponse(text).entries, [inv]);
    expect(m.reason).toBe("matched");
    expect(withIrpEntry(m.invoice!, m.entry).eInvoice.status).toBe("generated");
    const cnl = { ...m.entry, status: "CNL" };
    expect(withIrpEntry(m.invoice!, cnl).eInvoice.status).toBe("cancelled");
  });

  it("does not crash on an IRP error response and says no IRN was found", () => {
    const err = {
      Status: 0,
      ErrorDetails: [{ ErrorCode: "2150", ErrorMessage: "Duplicate IRN" }],
      InfoDtls: null,
      Data: null,
    };
    const r = parseIrpResponse(JSON.stringify(err));
    expect(r.entries).toEqual([]);
    expect(r.problems[0]).toMatch(/No IRN/);
  });

  it("copes with a malformed signed token", () => {
    const r = parseIrpResponse(JSON.stringify([{ Irn: IRN1, SignedInvoice: "not.a.jwt" }]));
    expect(r.entries[0].docNo).toBe("");
    expect(r.problems.join(" ")).toMatch(/no document number/);
  });
});
