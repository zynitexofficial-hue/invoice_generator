import { describe, expect, it } from "vitest";
import { computeTotals } from "@/lib/invoice-calc";
import { resolveDefaultDesign } from "@/lib/invoice-factory";
import { sampleInvoice } from "@/lib/sample";
import { DEFAULT_SETTINGS, type Invoice } from "@/lib/schema";
import { payPageHref } from "@/lib/upi";
import { resolvePaymentQr } from "./payment-qr";

const base = sampleInvoice(DEFAULT_SETTINGS, resolveDefaultDesign(DEFAULT_SETTINGS, []));
const opts = { show: true, includeAmount: true };

function qrFor(patch: Partial<Invoice>, seller: Partial<Invoice["seller"]> = {}) {
  const invoice: Invoice = {
    ...base,
    currency: "INR",
    payment: { ...base.payment, amountReceived: "" },
    ...patch,
    seller: { ...base.seller, upiId: "shop@okhdfcbank", paymentQr: "", ...seller },
  };
  return {
    qr: resolvePaymentQr(invoice, computeTotals(invoice), opts),
    totals: computeTotals(invoice),
  };
}

describe("resolvePaymentQr", () => {
  it("asks for the balance due on invoices", () => {
    const { qr, totals } = qrFor({ docType: "tax_invoice" });
    expect(qr).toMatchObject({ kind: "auto", amount: totals.balanceDue });
  });

  it("generates a QR on quotations too, for the total", () => {
    const { qr, totals } = qrFor({ docType: "proforma" });
    expect(qr).toMatchObject({ kind: "auto", amount: totals.grandTotal });
  });

  it("asks for the next unpaid instalment when there are payment terms", () => {
    const { qr, totals } = qrFor({
      docType: "proforma",
      paymentSchedule: [
        { id: "a", label: "Advance", due: "", kind: "percent", value: "50" },
        { id: "b", label: "Balance", due: "", kind: "percent", value: "50" },
      ],
    });
    expect(qr.kind).toBe("auto");
    if (qr.kind === "auto") {
      expect(qr.forLabel).toBe("Advance");
      expect(Number(qr.amount)).toBeCloseTo(Number(totals.grandTotal) / 2, 1);
    }
  });

  it("uses the uploaded QR instead, even for other currencies", () => {
    const { qr } = qrFor({ currency: "USD" }, { paymentQr: "data:image/png;base64,AAAA" });
    expect(qr).toMatchObject({ kind: "upload", image: "data:image/png;base64,AAAA" });
  });

  it("explains why there is no QR", () => {
    expect(qrFor({ currency: "USD" }).qr.kind).toBe("none");
    expect(qrFor({}, { upiId: "not-a-upi" }).qr.kind).toBe("none");
  });

  it("builds a tap-to-pay link that carries the amount in the #fragment", () => {
    const { qr } = qrFor({ docType: "tax_invoice" });
    if (qr.kind !== "auto") throw new Error("expected an auto QR");
    const href = payPageHref("https://invoice.zynitex.com", qr.params);
    expect(href).toMatch(/^https:\/\/invoice\.zynitex\.com\/pay#pa=shop%40okhdfcbank&/);
    expect(href).toContain(`am=${qr.amount}`);
  });

  it("gives an uploaded QR a link without an amount", () => {
    const { qr } = qrFor({}, { paymentQr: "data:image/png;base64,AAAA" });
    expect(qr.kind === "upload" && qr.params).toMatch(/^pa=shop%40okhdfcbank/);
    expect(qr.kind === "upload" && qr.params).not.toContain("am=");
  });
});
