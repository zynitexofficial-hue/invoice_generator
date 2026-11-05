import { describe, expect, it } from "vitest";
import type { Invoice } from "@/lib/schema";
import { buildGstr1 } from "./gstr1";
import { validateSettings } from "./validate";
import { B2B_KA_GSTIN, PERIOD, fixtureSettings, ln, mkInvoice } from "./fixtures/october-2026";

const settings = fixtureSettings();

/** Issue codes for one invoice (plus settings issues) in a GSTR-1 build. */
function codesFor(inv: Invoice, others: Invoice[] = [], s = settings) {
  const r = buildGstr1({ invoices: [inv, ...others], settings: s, periodKey: PERIOD });
  return r.issues.filter((i) => i.recordId === inv.id).map((i) => `${i.severity}:${i.code}`);
}

const good = (extra: Record<string, unknown> = {}) =>
  mkInvoice({
    id: "t",
    number: "INV/26-27/100",
    customer: { name: "C", billingAddress: "addr", stateCode: "27" },
    lines: [ln("Shirt", "6109", "1", "100", "5")],
    ...extra,
  });

describe("settings validation", () => {
  it("seller GSTIN missing/invalid and registration type", () => {
    const codes = (s: ReturnType<typeof fixtureSettings>) => validateSettings(s).map((i) => i.code);
    expect(codes(settings)).toEqual([]);
    expect(codes(fixtureSettings({ profile: { ...settings.profile, gstin: "" } }))).toEqual([
      "SELLER_GSTIN_MISSING",
    ]);
    expect(
      codes(fixtureSettings({ profile: { ...settings.profile, gstin: "27AAPFU0939F1ZA" } })),
    ).toEqual(["SELLER_GSTIN_INVALID"]);
    const comp = validateSettings(
      fixtureSettings({ gst: { ...settings.gst, registrationType: "composition" } }),
    );
    expect(comp.map((i) => `${i.severity}:${i.code}`)).toEqual(["info:NOT_REGULAR"]);
  });
});

describe("invoice validation", () => {
  it("a correct invoice has no issues", () => {
    expect(codesFor(good())).toEqual([]);
  });

  it("domestic invoice not in INR", () => {
    expect(codesFor(good({ currency: "USD", exportDetails: { exchangeRate: "83" } }))).toContain(
      "error:CURRENCY_NOT_INR",
    );
  });

  it("foreign currency without an exchange rate is excluded with an error", () => {
    const inv = good({
      docType: "export",
      currency: "USD",
      exportDetails: { type: "wopay" },
      customer: { company: "X", country: "USA" },
    });
    const r = buildGstr1({ invoices: [inv], settings, periodKey: PERIOD });
    expect(r.excluded).toEqual([
      expect.objectContaining({ invoiceId: "t", reason: "missing_exchange_rate" }),
    ]);
    expect(r.issues.map((i) => i.code)).toContain("EXCHANGE_RATE_MISSING");
    expect(r.hasErrors).toBe(true);
    // Still counted in DOCS: it was issued.
    expect(r.sections.docs[0].total).toBe(1);
  });

  it("numbers: missing, too long, invalid characters, duplicate in the FY", () => {
    expect(codesFor(good({ number: "" }))).toEqual(["error:NUMBER_MISSING"]);
    expect(codesFor(good({ number: "INV/2026-2027/00001" }))).toEqual(["error:NUMBER_TOO_LONG"]);
    expect(codesFor(good({ number: "INV#1" }))).toEqual(["error:NUMBER_INVALID_CHARS"]);
    const dup = good({ id: "u", number: "INV/26-27/100", invoiceDate: "2026-06-01" });
    expect(codesFor(good(), [dup])).toEqual(["error:NUMBER_DUPLICATE"]);
    // Same number in another FY is fine; a draft does not count.
    expect(codesFor(good(), [good({ id: "v", invoiceDate: "2025-06-01" })])).toEqual([]);
    expect(codesFor(good(), [good({ id: "w", issuedAt: "" })])).toEqual([]);
  });

  it("customer GSTIN invalid; state mismatch warning", () => {
    expect(
      codesFor(good({ customer: { name: "C", gstin: "29ABCDE1234F1ZZ", stateCode: "29" } })),
    ).toContain("error:CUSTOMER_GSTIN_INVALID");
    expect(
      codesFor(good({ customer: { name: "C", gstin: B2B_KA_GSTIN, stateCode: "27" } })),
    ).toContain("warning:STATE_GSTIN_MISMATCH");
  });

  it("place of supply missing", () => {
    expect(
      codesFor(good({ customer: { name: "C", billingAddress: "a", stateCode: "" } })),
    ).toContain("error:POS_MISSING");
  });

  it("HSN missing, invalid, too short; SAC short is a warning", () => {
    expect(codesFor(good({ lines: [ln("A", "", "1", "100", "5")] }))).toEqual([
      "error:HSN_MISSING",
    ]);
    expect(codesFor(good({ lines: [ln("A", "AB12", "1", "100", "5")] }))).toEqual([
      "error:HSN_INVALID",
    ]);
    expect(codesFor(good({ lines: [ln("A", "61", "1", "100", "5")] }))).toEqual([
      "error:HSN_TOO_SHORT",
    ]);
    expect(codesFor(good({ lines: [ln("A", "9983", "1", "100", "18", "hrs")] }))).toEqual([
      "warning:SAC_SHORT",
    ]);
    const six = fixtureSettings({ gst: { ...settings.gst, hsnDigits: 6 } });
    expect(codesFor(good(), [], six)).toEqual(["error:HSN_TOO_SHORT"]);
    const bigAato = fixtureSettings({ gst: { ...settings.gst, aato: "60000000" } });
    expect(codesFor(good(), [], bigAato)).toEqual(["error:HSN_TOO_SHORT"]);
  });

  it("rate not allowed for the date; 28% legacy warning", () => {
    expect(codesFor(good({ lines: [ln("A", "6109", "1", "100", "12")] }))).toEqual([
      "error:RATE_NOT_ALLOWED",
    ]);
    expect(codesFor(good({ lines: [ln("A", "6109", "1", "100", "28")] }))).toEqual([
      "warning:RATE_LEGACY",
    ]);
  });

  it("credit note without an original reference; time limit", () => {
    const cn = good({ docType: "credit_note", number: "CN/26-27/100" });
    expect(codesFor(cn)).toEqual(["error:NOTE_ORIGINAL_MISSING"]);
    const late = good({
      docType: "credit_note",
      number: "CN/26-27/101",
      note: { originalInvoiceNumber: "INV/24-25/009", originalInvoiceDate: "2025-03-10" },
      lines: [ln("A", "6109", "1", "100", "5")],
    });
    expect(codesFor(late)).toEqual(["warning:NOTE_ORIGINAL_NOT_FOUND", "warning:NOTE_TIME_LIMIT"]);
  });

  it("exports: LUT required for WOPAY, shipping bill warning for goods", () => {
    const noLut = fixtureSettings({ declarations: { ...settings.declarations, lutNumber: "" } });
    const exp = good({
      docType: "export",
      number: "EXP/26-27/100",
      exportDetails: { type: "wopay" },
      customer: { company: "X", country: "USA", billingAddress: "NY" },
    });
    expect(codesFor(exp, [], noLut)).toEqual([
      "error:EXPORT_LUT_MISSING",
      "warning:EXPORT_SHIPPING_MISSING",
    ]);
    expect(codesFor(exp)).toEqual(["warning:EXPORT_SHIPPING_MISSING"]);
  });

  it("SEZ needs the unit's GSTIN", () => {
    expect(codesFor(good({ sez: { enabled: true, withPayment: true } }))).toContain(
      "error:SEZ_GSTIN_MISSING",
    );
  });

  it("unregistered recipient ≥ ₹50,000 needs name, address and state", () => {
    const big = good({
      customer: { name: "", billingAddress: "", stateCode: "27" },
      lines: [ln("A", "6109", "1", "50000", "0")],
    });
    const r = buildGstr1({ invoices: [big], settings, periodKey: PERIOD });
    const issue = r.issues.find((i) => i.code === "B2C_DETAILS_MISSING");
    expect(issue).toMatchObject({ severity: "error", field: "customer.name" });
    expect(issue?.message).toContain("name, address");
    expect(
      codesFor(
        good({ lines: [ln("A", "6109", "1", "49999", "0")], customer: { stateCode: "27" } }),
      ),
    ).toEqual([]);
  });

  it("B2CL near threshold", () => {
    expect(
      codesFor(
        good({
          customer: { name: "C", billingAddress: "a", stateCode: "29" },
          lines: [ln("A", "6109", "1", "90000", "5")],
        }),
      ),
    ).toEqual(["warning:B2CL_NEAR_THRESHOLD"]);
  });

  it("zero-rated tax invoice that is not an export/SEZ", () => {
    expect(codesFor(good({ supplyNature: "zero_rated" }))).toEqual(["error:ZERO_RATED_NOT_EXPORT"]);
  });

  it("nil/exempt supply that charges GST", () => {
    expect(codesFor(good({ supplyNature: "exempt" }))).toEqual(["error:NIL_WITH_TAX"]);
  });

  it("manual intra/inter override contradicting the place of supply", () => {
    expect(codesFor(good({ supplyType: "inter" }))).toEqual(["warning:SUPPLY_TYPE_OVERRIDE"]);
  });

  it("seller GSTIN on the invoice differs from settings", () => {
    const inv = good();
    inv.seller = { ...inv.seller, gstin: B2B_KA_GSTIN };
    expect(codesFor(inv)).toContain("warning:SELLER_GSTIN_DIFFERS");
  });

  it("each issue carries record and field for a Fix link", () => {
    const r = buildGstr1({
      invoices: [good({ lines: [ln("A", "", "1", "100", "5")] })],
      settings,
      periodKey: PERIOD,
    });
    expect(r.issues[0]).toEqual({
      severity: "error",
      code: "HSN_MISSING",
      message: "A: HSN/SAC code is missing.",
      recordKind: "invoice",
      recordId: "t",
      field: "lines.0.hsnSac",
    });
  });
});
