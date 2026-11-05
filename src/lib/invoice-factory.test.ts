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
