import { describe, expect, it } from "vitest";
import { resolveDefaultDesign } from "@/lib/invoice-factory";
import { sampleInvoice } from "@/lib/sample";
import { DEFAULT_SETTINGS, type Invoice } from "@/lib/schema";
import { buildShareMessage, mailtoHref, whatsappHref, whatsappNumber } from "./share";

const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
const ORIGIN = "https://app.example";

function make(patch: Partial<Invoice> = {}, seller: Partial<Invoice["seller"]> = {}): Invoice {
  return {
    ...base,
    currency: "INR",
    dueDate: "2026-11-20",
    payment: { ...base.payment, amountReceived: "" },
    ...patch,
    seller: { ...base.seller, name: "Northwind Studio", upiId: "shop@okhdfcbank", ...seller },
    customer: { ...base.customer, name: "Priya Sharma" },
  };
}

describe("buildShareMessage", () => {
  it("greets the customer, names the document and amount, and links to pay", () => {
    const m = buildShareMessage(make(), DEFAULT_SETTINGS, ORIGIN);
    expect(m.text).toMatch(/^Hi Priya Sharma,/);
    expect(m.text).toContain("INV/26-27/042");
    expect(m.text).toContain("Northwind Studio");
    expect(m.text).toContain("Please pay by 20/11/2026.");
    expect(m.payLink).toMatch(/^https:\/\/app\.example\/pay#pa=shop%40okhdfcbank/);
    expect(m.text).toContain(`Pay by UPI: ${m.payLink}`);
    expect(m.subject).toBe("Tax Invoice INV/26-27/042 from Northwind Studio");
  });

  it("uses the company when there is no contact name, and a plain greeting when neither", () => {
    const a = make();
    a.customer = { ...a.customer, name: "", company: "Acme Pvt Ltd" };
    expect(buildShareMessage(a, DEFAULT_SETTINGS, ORIGIN).text).toMatch(/^Hi Acme Pvt Ltd,/);
    a.customer = { ...a.customer, company: "" };
    expect(buildShareMessage(a, DEFAULT_SETTINGS, ORIGIN).text).toMatch(/^Hello,/);
  });

  it("omits the pay link without a UPI ID", () => {
    const m = buildShareMessage(make({}, { upiId: "" }), DEFAULT_SETTINGS, ORIGIN);
    expect(m.payLink).toBeNull();
    expect(m.text).not.toContain("Pay by UPI");
  });

  it("omits the pay link and says thanks when fully paid", () => {
    const m = buildShareMessage(
      make({ payment: { ...base.payment, amountReceived: "999999999" } }),
      DEFAULT_SETTINGS,
      ORIGIN,
    );
    expect(m.payLink).toBeNull();
    expect(m.text).toContain("fully paid");
    expect(m.text).not.toContain("Please pay by");
  });

  it("mentions the balance only when part-paid", () => {
    const full = buildShareMessage(make(), DEFAULT_SETTINGS, ORIGIN);
    expect(full.text).not.toContain("Balance due");
    const part = buildShareMessage(
      make({ payment: { ...base.payment, amountReceived: "100" } }),
      DEFAULT_SETTINGS,
      ORIGIN,
    );
    expect(part.text).toContain("Balance due:");
  });

  it("treats quotations as 'valid until' with no payment ask", () => {
    const m = buildShareMessage(
      make({ docType: "proforma", docTitle: "Quotation" }),
      DEFAULT_SETTINGS,
      ORIGIN,
    );
    expect(m.text).toContain("Valid until 20/11/2026.");
    expect(m.text).not.toContain("Please pay by");
    expect(m.payLink).toBeNull();
  });
});

describe("whatsappNumber", () => {
  it.each([
    ["98200 12345", "919820012345"],
    ["09820012345", "919820012345"],
    ["+91 98200-12345", "919820012345"],
    ["+1 (415) 555-0100", "14155550100"],
    ["0044 7911 123456", "447911123456"],
    ["12345", ""],
    ["", ""],
  ])("%s → %s", (raw, expected) => expect(whatsappNumber(raw)).toBe(expected));
});

describe("links", () => {
  it("builds a wa.me link with encoded text, with or without a number", () => {
    expect(whatsappHref("98200 12345", "Hi & bye\nok")).toBe(
      "https://wa.me/919820012345?text=Hi%20%26%20bye%0Aok",
    );
    expect(whatsappHref("", "x")).toBe("https://wa.me/?text=x");
  });

  it("builds a mailto link that keeps the @ and encodes subject and body", () => {
    expect(mailtoHref("a@b.com", "Tax Invoice INV/1", "Line 1\nLine 2")).toBe(
      "mailto:a@b.com?subject=Tax%20Invoice%20INV%2F1&body=Line%201%0ALine%202",
    );
    expect(mailtoHref("", "S", "B")).toBe("mailto:?subject=S&body=B");
  });
});
