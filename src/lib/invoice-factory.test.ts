import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice-calc";
import { createInvoice } from "@/lib/invoice-factory";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/schema";

const generated = { number: "INV-1", autoNumber: null };

describe("createInvoice document type", () => {
  it("defaults to a plain Invoice without GST when not GST-registered", () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      gst: { ...DEFAULT_SETTINGS.gst, registered: false },
    };
    const inv = createInvoice({ settings, designs: [], generated });
    expect(inv.docType).toBe("invoice");
    expect(inv.docTitle).toBe("Invoice");
    inv.lines[0] = { ...inv.lines[0], name: "Logo design", unitPrice: "5000", gstRate: "18" };
    const totals = computeTotals(inv);
    expect(totals.taxKind).toBe("none");
    expect(totals.taxTotal).toBe("0.00");
    expect(totals.grandTotal).toBe("5000.00");
  });

  it("uses the configured default for GST-registered businesses", () => {
    const inv = createInvoice({ settings: DEFAULT_SETTINGS, designs: [], generated });
    expect(inv.docType).toBe("tax_invoice");
    expect(inv.docTitle).toBe("Tax Invoice");
  });
});

describe("numbering defaults", () => {
  it("upgrades the old minute-based default pattern", async () => {
    const { settingsSchema } = await import("@/lib/schema");
    const { DEFAULT_NUMBER_PATTERN, LEGACY_NUMBER_PATTERN } = await import("@/lib/numbering");
    const parsed = settingsSchema.parse({
      numbering: { tax_invoice: { prefix: "INV", pattern: LEGACY_NUMBER_PATTERN } },
    });
    expect(parsed.numbering.tax_invoice.pattern).toBe(DEFAULT_NUMBER_PATTERN);
    const custom = settingsSchema.parse({
      numbering: { tax_invoice: { prefix: "INV", pattern: "{PREFIX}/{FY}/{SEQ:3}" } },
    });
    expect(custom.numbering.tax_invoice.pattern).toBe("{PREFIX}/{FY}/{SEQ:3}");
  });
});

describe("createNoteFromInvoice", () => {
  it("copies parties, POS, tax settings and lines, and links the original", async () => {
    const { createNoteFromInvoice } = await import("@/lib/invoice-factory");
    const original = {
      ...createInvoice({ settings: DEFAULT_SETTINGS, designs: [], generated }),
      number: "INV/26-27/007",
      invoiceDate: "2026-10-01",
      placeOfSupply: "29",
      reverseCharge: true,
      issuedAt: "2026-10-01T10:00:00.000Z",
      payment: { amountReceived: "100", date: "2026-10-02", mode: "upi" as const, note: "" },
    };
    original.seller = { ...original.seller, stateCode: "27" };
    original.customer = { ...original.customer, name: "Acme", gstin: "29AAPFU0939F1ZV" };
    original.lines[0] = { ...original.lines[0], name: "Widget", unitPrice: "500" };

    const note = createNoteFromInvoice(original, "credit_note", DEFAULT_SETTINGS, {
      number: "CN/26-27/001",
      autoNumber: null,
    });
    expect(note.id).not.toBe(original.id);
    expect(note.docType).toBe("credit_note");
    expect(note.docTitle).toBe("Credit Note");
    expect(note.number).toBe("CN/26-27/001");
    expect(note.customer.name).toBe("Acme");
    expect(note.placeOfSupply).toBe("29");
    expect(note.reverseCharge).toBe(true);
    expect(note.lines[0].name).toBe("Widget");
    expect(note.lines[0].id).not.toBe(original.lines[0].id);
    expect(note.payment.amountReceived).toBe("");
    expect(note.issuedAt).toBe("");
    expect(note.note).toEqual({
      reason: "",
      originalInvoiceId: original.id,
      originalInvoiceNumber: "INV/26-27/007",
      originalInvoiceDate: "2026-10-01",
    });
    expect(computeTotals(note).taxKind).toBe("inter");
  });
});
