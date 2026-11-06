import { describe, expect, it } from "vitest";
import { customerIdentity } from "@/lib/analytics/base";
import { inv } from "@/lib/analytics/fixtures.test-utils";
import { paymentEntrySchema, type PaymentEntry } from "@/lib/schema";
import {
  buildPaymentEvents,
  effectivePayments,
  invoiceLedgerView,
  netReceived,
  nextReceiptNo,
  openingEntry,
  openingPaymentId,
  planAllocation,
} from "./ledger";

let n = 0;
const row = (o: Partial<PaymentEntry>): PaymentEntry =>
  paymentEntrySchema.parse({ id: o.id ?? `p${++n}`, ...o });

// 1000 + 18% GST = 1180
const invoice = (received = "") => inv({ id: "i1", number: "INV-1", amount: "1000", received });
const keyOf = (i: Parameters<typeof customerIdentity>[0]) => customerIdentity(i).key;

describe("opening payment (legacy amountReceived)", () => {
  it("is derived from the old single payment with its date, mode and note", () => {
    const i = invoice("500");
    i.payment = { ...i.payment, date: "2026-10-12", mode: "upi", note: "UTR 99" };
    const o = openingEntry(i)!;
    expect(o).toMatchObject({
      id: openingPaymentId("i1"),
      kind: "payment",
      invoiceId: "i1",
      amount: "500",
      date: "2026-10-12",
      mode: "upi",
    });
    expect(o.notes).toContain("UTR 99");
  });

  it("falls back to the invoice date and is null when nothing was received", () => {
    expect(openingEntry(invoice("100"))!.date).toBe("2026-10-10");
    expect(openingEntry(invoice(""))).toBeNull();
    expect(openingEntry(invoice("0"))).toBeNull();
  });

  it("counts once: stored ledger rows replace the virtual opening payment", () => {
    const i = invoice("500");
    expect(effectivePayments(i, [])).toHaveLength(1);
    const stored = row({ id: openingPaymentId("i1"), invoiceId: "i1", amount: "500" });
    expect(effectivePayments(i, [stored])).toHaveLength(1);
    expect(invoiceLedgerView(i, [stored]).received).toBe("500.00");
    expect(invoiceLedgerView(i, []).received).toBe("500.00");
  });
});

describe("invoiceLedgerView", () => {
  it("derives paid, balance and status from several payments and refunds", () => {
    const i = invoice();
    const rows = [
      row({ invoiceId: "i1", amount: "400.10", date: "2026-10-12" }),
      row({ invoiceId: "i1", amount: "300.20", date: "2026-10-15" }),
    ];
    expect(invoiceLedgerView(i, rows)).toMatchObject({
      received: "700.30",
      balance: "479.70",
      status: "partial",
      total: "1180.00",
    });
    rows.push(row({ invoiceId: "i1", amount: "479.70", date: "2026-10-20" }));
    expect(invoiceLedgerView(i, rows)).toMatchObject({
      received: "1180.00",
      balance: "0.00",
      status: "paid",
    });
    rows.push(row({ invoiceId: "i1", kind: "refund", amount: "80", date: "2026-10-22" }));
    expect(invoiceLedgerView(i, rows)).toMatchObject({
      received: "1100.00",
      balance: "80.00",
      status: "partial",
    });
  });

  it("is unpaid without payments and reports an overpayment instead of hiding it", () => {
    expect(invoiceLedgerView(invoice(), []).status).toBe("unpaid");
    const v = invoiceLedgerView(invoice(), [row({ invoiceId: "i1", amount: "1500" })]);
    expect(v.received).toBe("1180.00");
    expect(v.overpaid).toBe("320.00");
  });

  it("uses decimal arithmetic (no float drift)", () => {
    const rows = ["0.1", "0.2"].map((amount) => row({ invoiceId: "i1", amount }));
    expect(netReceived(rows).toString()).toBe("0.3");
  });
});

describe("planAllocation (spec B13)", () => {
  it("splits an overpayment into applied and excess", () => {
    expect(planAllocation({ total: "1180", received: "1000", amount: "300" })).toEqual({
      applied: "180.00",
      excess: "120.00",
      balanceBefore: "180.00",
    });
  });
  it("has no excess when the amount fits, all excess when already paid in full", () => {
    expect(planAllocation({ total: "1180", received: "0", amount: "1180" }).excess).toBe("0.00");
    expect(planAllocation({ total: "1180", received: "1180", amount: "50" })).toMatchObject({
      applied: "0.00",
      excess: "50.00",
    });
  });
});

describe("nextReceiptNo", () => {
  it("continues after the highest number for the prefix", () => {
    expect(nextReceiptNo("RCT", [])).toBe("RCT-0001");
    expect(
      nextReceiptNo("RCT", [
        { receiptNo: "RCT-0009" },
        { receiptNo: "RCT-0003" },
        { receiptNo: "X-0100" },
      ]),
    ).toBe("RCT-0010");
    expect(nextReceiptNo("A.B", [{ receiptNo: "A.B-0002" }, { receiptNo: "AxB-0050" }])).toBe(
      "A.B-0003",
    );
  });
});

describe("buildPaymentEvents", () => {
  it("adds a virtual opening event only for legacy issued invoices", () => {
    const draft = inv({ id: "d", received: "100", issued: false });
    const quote = inv({ id: "q", docType: "proforma", received: "100" });
    const ev = buildPaymentEvents([invoice("500"), draft, quote], [], keyOf);
    expect(ev.map((e) => [e.invoiceId, e.amount, e.opening])).toEqual([["i1", "500.00", true]]);
  });

  it("does not double count once the ledger holds rows for the invoice", () => {
    const rows = [
      row({ id: openingPaymentId("i1"), invoiceId: "i1", amount: "500", date: "2026-10-12" }),
    ];
    expect(buildPaymentEvents([invoice("500")], rows, keyOf)).toHaveLength(1);
  });

  it("converts foreign-currency payments with the invoice rate and signs refunds", () => {
    const usd = inv({
      id: "u",
      currency: "USD",
      exchangeRate: "80",
      amount: "10",
      docType: "export",
    });
    const rows = [
      row({ invoiceId: "u", amount: "5", date: "2026-10-11" }),
      row({ invoiceId: "u", kind: "refund", amount: "1", date: "2026-10-12" }),
    ];
    expect(buildPaymentEvents([usd], rows, keyOf).map((e) => [e.amount, e.sign])).toEqual([
      ["400.00", 1],
      ["80.00", -1],
    ]);
  });

  it("keeps advances unallocated with their own customer key", () => {
    const rows = [
      row({ customerName: "Zed Co", amount: "700", kind: "advance", date: "2026-10-01" }),
    ];
    expect(buildPaymentEvents([], rows, keyOf)[0]).toMatchObject({
      allocated: false,
      customerKey: "name:zed co",
    });
  });
});
