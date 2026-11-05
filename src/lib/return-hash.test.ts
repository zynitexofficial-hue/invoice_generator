import { describe, expect, it } from "vitest";
import { createInvoice } from "@/lib/invoice-factory";
import { DEFAULT_SETTINGS, expenseSchema } from "@/lib/schema";
import { expenseReturnHash, fnv1a64, invoiceReturnHash, stableStringify } from "./return-hash";

const generated = { number: "INV/26-27/001", autoNumber: null };
const now = new Date(2026, 9, 22, 10, 0, 0);

function invoice() {
  const inv = createInvoice({ settings: DEFAULT_SETTINGS, designs: [], generated, now });
  inv.lines[0] = { ...inv.lines[0], name: "Design", quantity: "2", unitPrice: "500" };
  return inv;
}

describe("stableStringify / fnv1a64", () => {
  it("ignores key order and is deterministic", () => {
    expect(stableStringify({ b: 1, a: { d: 2, c: [3, { f: 1, e: 0 }] } })).toBe(
      stableStringify({ a: { c: [3, { e: 0, f: 1 }], d: 2 }, b: 1 }),
    );
    expect(fnv1a64("")).toBe("cbf29ce484222325");
    expect(fnv1a64("a")).toBe("af63dc4c8601ec8c");
    expect(fnv1a64("hello")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("invoiceReturnHash", () => {
  it("is stable across downloads, saves, design and notes", () => {
    const inv = { ...invoice(), issuedAt: now.toISOString() };
    const h = invoiceReturnHash(inv);
    expect(invoiceReturnHash(structuredClone(inv))).toBe(h);
    expect(
      invoiceReturnHash({
        ...inv,
        downloadedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        notes: "Thanks!",
        terms: "Net 7",
        footer: "Footer",
        summary: { grandTotal: "1", balanceDue: "1", paymentStatus: "paid" },
        design: { ...inv.design, templateId: "modern" },
      }),
    ).toBe(h);
  });

  it("changes when a line, the customer or the status changes", () => {
    const inv = invoice();
    const h = invoiceReturnHash(inv);
    expect(invoiceReturnHash({ ...inv, lines: [{ ...inv.lines[0], quantity: "3" }] })).not.toBe(h);
    expect(
      invoiceReturnHash({ ...inv, customer: { ...inv.customer, gstin: "27AAPFU0939F1ZV" } }),
    ).not.toBe(h);
    expect(invoiceReturnHash({ ...inv, status: "cancelled" })).not.toBe(h);
  });
});

describe("expenseReturnHash", () => {
  it("ignores notes and payment but not amounts", () => {
    const e = expenseSchema.parse({ id: "e1", amount: "100", gstRate: "18", gstMode: "intra" });
    const h = expenseReturnHash(e);
    expect(expenseReturnHash({ ...e, notes: "x", paymentStatus: "unpaid", updatedAt: "z" })).toBe(
      h,
    );
    expect(expenseReturnHash({ ...e, amount: "101" })).not.toBe(h);
  });
});
