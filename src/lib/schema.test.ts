import { describe, expect, it } from "vitest";
import { DEFAULT_NUMBER_PATTERN, RANDOM_NUMBER_PATTERN } from "./numbering";
import {
  CREATABLE_DOC_TYPES,
  DEFAULT_SETTINGS,
  INVOICE_SCHEMA_VERSION,
  invoiceSchema,
  settingsSchema,
} from "./schema";

/** A minimal stored v1 record, as written before the v2 fields existed. */
const v1 = {
  id: "abc",
  schemaVersion: 1,
  docType: "tax_invoice",
  number: "ZYNI-261022-4827",
  invoiceDate: "2026-10-22",
  lines: [{ id: "l1", name: "Design", quantity: "1", unitPrice: "100", gstRate: "18" }],
  downloadedAt: "2026-10-22T10:00:00.000Z",
  updatedAt: "2026-10-22T10:00:00.000Z",
};

describe("invoice schema v1 → v2", () => {
  it("upgrades the version and fills new fields with defaults", () => {
    const inv = invoiceSchema.parse(v1);
    expect(inv.schemaVersion).toBe(2);
    expect(INVOICE_SCHEMA_VERSION).toBe(2);
    expect(inv.status).toBe("active");
    expect(inv.supplyNature).toBe("taxable");
    expect(inv.reverseCharge).toBe(false);
    expect(inv.sez).toEqual({ enabled: false, withPayment: false });
    expect(inv.exportDetails.type).toBe("");
    expect(inv.note.reason).toBe("");
    expect(inv.eInvoice.status).toBe("not_applicable");
    expect(inv.lines[0]).toMatchObject({ itemType: "goods", uqc: "" });
    expect(inv.seller).toMatchObject({ legalName: "", city: "", pincode: "", udyam: "" });
    expect(inv.customer).toMatchObject({ city: "", pincode: "" });
  });

  it("treats documents downloaded under v1 as issued at download time", () => {
    expect(invoiceSchema.parse(v1).issuedAt).toBe(v1.downloadedAt);
    // Missing schemaVersion counts as v1.
    const { schemaVersion: _v, ...noVersion } = v1;
    void _v;
    expect(invoiceSchema.parse(noVersion).issuedAt).toBe(v1.downloadedAt);
    // Drafts stay drafts.
    expect(invoiceSchema.parse({ ...v1, downloadedAt: "" }).issuedAt).toBe("");
  });

  it("does not re-derive issuedAt for v2 records", () => {
    const v2 = invoiceSchema.parse({ ...v1, schemaVersion: 2, issuedAt: "" });
    expect(v2.issuedAt).toBe("");
  });

  it("rejects unknown versions and bad unit codes", () => {
    expect(invoiceSchema.safeParse({ ...v1, schemaVersion: 3 }).success).toBe(false);
    expect(invoiceSchema.safeParse({ ...v1, lines: [{ ...v1.lines[0], uqc: "X" }] }).success).toBe(
      false,
    );
  });
});

describe("settings defaults", () => {
  it("uses a consecutive FY series for new settings and adds note series", () => {
    expect(DEFAULT_SETTINGS.numbering.tax_invoice.pattern).toBe(DEFAULT_NUMBER_PATTERN);
    expect(DEFAULT_SETTINGS.numbering.credit_note).toEqual({
      prefix: "CN",
      pattern: DEFAULT_NUMBER_PATTERN,
    });
    expect(DEFAULT_SETTINGS.numbering.debit_note.prefix).toBe("DN");
  });

  it("keeps patterns already stored by existing users", () => {
    const parsed = settingsSchema.parse({
      numbering: { tax_invoice: { prefix: "INV", pattern: RANDOM_NUMBER_PATTERN } },
    });
    expect(parsed.numbering.tax_invoice.pattern).toBe(RANDOM_NUMBER_PATTERN);
    // Older settings without note series get them with defaults.
    expect(parsed.numbering.credit_note.prefix).toBe("CN");
  });

  it("fills GST filing, backup, privacy and category defaults", () => {
    const s = settingsSchema.parse({ gst: { registered: true } });
    expect(s.gst).toMatchObject({
      registrationType: "regular",
      filingFrequency: "monthly",
      aato: "",
      eInvoiceApplicable: false,
      hsnDigits: 4,
    });
    expect(s.backup).toMatchObject({ autoFolderEnabled: false, keepCount: 14, encrypt: false });
    expect(s.privacy).toEqual({ contactEmail: "", retentionYears: 8 });
    expect(s.expenseCategories).toHaveLength(20);
    expect(s.expenseCategories.find((c) => c.name === "Food & entertainment")?.defaultItc).toBe(
      "ineligible",
    );
    expect(s.expenseCategories.find((c) => c.name === "Bank charges")?.defaultItc).toBe("no_gst");
    expect(s.incomeCategories).toEqual([
      "Interest",
      "Commission",
      "Rent received",
      "Refund",
      "Other",
    ]);
    // Defaults are not shared between parses.
    s.expenseCategories.push({ name: "X", defaultItc: "eligible" });
    expect(settingsSchema.parse({}).expenseCategories).toHaveLength(20);
  });

  it("never offers notes as a fresh document type", () => {
    expect(CREATABLE_DOC_TYPES).not.toContain("credit_note");
    expect(settingsSchema.safeParse({ invoiceDefaults: { docType: "credit_note" } }).success).toBe(
      false,
    );
  });
});
