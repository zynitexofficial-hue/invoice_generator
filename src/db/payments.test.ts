import { beforeEach, describe, expect, it, vi } from "vitest";
import { inv } from "@/lib/analytics/fixtures.test-utils";
import { invoiceReturnHash } from "@/lib/return-hash";
import { openingPaymentId } from "@/lib/payments/ledger";
import { getDb } from "./db";
import { getInvoice, saveInvoice } from "./invoices";
import {
  allocateAdvance,
  deletePayment,
  ensureOpeningPayment,
  listPaymentsForInvoice,
  PaymentError,
  recordAdvance,
  recordInvoicePayment,
  recordRefund,
  repairLedgerSync,
  savePayment,
  syncInvoiceFromLedger,
  updatePayment,
} from "./payments";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  await Promise.all(getDb().tables.map((t) => t.clear()));
  memory.clear();
});

// 1000 + 18% = 1180
const make = async (received = "") =>
  saveInvoice(inv({ id: "i1", number: "INV-1", amount: "1000", received }));
const pay = (invoice: Awaited<ReturnType<typeof make>>, amount: string, date = "2026-10-12") =>
  recordInvoicePayment({ invoice, amount, date, mode: "upi", excess: "reject" });

describe("payment ledger", () => {
  it("records several payments and derives balance and status on the invoice", async () => {
    const i = await make();
    await pay(i, "400");
    let cur = (await getInvoice("i1"))!;
    expect(cur.summary).toMatchObject({ balanceDue: "780.00", paymentStatus: "partial" });
    await pay(cur, "780", "2026-10-20");
    cur = (await getInvoice("i1"))!;
    expect(cur.summary).toMatchObject({ balanceDue: "0.00", paymentStatus: "paid" });
    expect(cur.payment).toMatchObject({ amountReceived: "1180.00", date: "2026-10-20" });
    const rows = await listPaymentsForInvoice("i1");
    expect(rows.map((r) => r.receiptNo)).toEqual(["RCT-0001", "RCT-0002"]);
  });

  it("deleting and editing payments re-derives the status", async () => {
    const i = await make();
    const { applied } = await pay(i, "1180");
    expect((await getInvoice("i1"))!.summary.paymentStatus).toBe("paid");
    await updatePayment(applied!.id, { amount: "1000" });
    expect((await getInvoice("i1"))!.summary).toMatchObject({
      paymentStatus: "partial",
      balanceDue: "180.00",
    });
    await deletePayment(applied!.id);
    const cur = (await getInvoice("i1"))!;
    expect(cur.summary).toMatchObject({ paymentStatus: "unpaid", balanceDue: "1180.00" });
    expect(cur.payment.amountReceived).toBe("");
  });

  it("rejects an edit that would exceed the invoice total", async () => {
    const i = await make();
    const { applied } = await pay(i, "500");
    await expect(updatePayment(applied!.id, { amount: "2000" })).rejects.toBeInstanceOf(
      PaymentError,
    );
  });
});

describe("migration of the old single amount received", () => {
  it("keeps the legacy payment as an opening row, without data loss or duplication", async () => {
    const i = await saveInvoice({
      ...inv({ id: "i1", amount: "1000" }),
      payment: { amountReceived: "300", date: "2026-10-11", mode: "cash", note: "cash at shop" },
    });
    expect(await listPaymentsForInvoice("i1")).toEqual([]); // nothing rewritten until the user acts
    const first = await ensureOpeningPayment(i);
    expect(first).toMatchObject({
      id: openingPaymentId("i1"),
      amount: "300",
      date: "2026-10-11",
      mode: "cash",
    });
    expect(first!.notes).toContain("cash at shop");
    expect(await ensureOpeningPayment(i)).toBeNull(); // idempotent
    await pay(i, "200");
    const cur = (await getInvoice("i1"))!;
    expect(cur.payment.amountReceived).toBe("500.00");
    expect(await listPaymentsForInvoice("i1")).toHaveLength(2);
  });

  it("deleting the opening payment clears the received amount", async () => {
    const i = await saveInvoice({
      ...inv({ id: "i1", amount: "1000" }),
      payment: { amountReceived: "300", date: "", mode: "", note: "" },
    });
    await ensureOpeningPayment(i);
    await deletePayment(openingPaymentId("i1"));
    expect((await getInvoice("i1"))!.payment.amountReceived).toBe("");
  });
});

describe("overpayment and advances (B13)", () => {
  it("refuses to clamp silently when asked to reject", async () => {
    const i = await make();
    await expect(pay(i, "2000")).rejects.toMatchObject({ code: "excess" });
    expect(await listPaymentsForInvoice("i1")).toEqual([]);
  });

  it("records the excess as an advance sharing the receipt, then allocates it later", async () => {
    const i = await make();
    const r = await recordInvoicePayment({
      invoice: i,
      amount: "1500",
      date: "2026-10-12",
      mode: "bank_transfer",
      excess: "advance",
    });
    expect(r.applied!.amount).toBe("1180.00");
    expect(r.advance).toMatchObject({
      amount: "320.00",
      invoiceId: "",
      kind: "advance",
      receiptNo: r.applied!.receiptNo,
    });
    expect((await getInvoice("i1"))!.summary.paymentStatus).toBe("paid");

    const next = await saveInvoice(
      inv({ id: "i2", number: "INV-2", amount: "200", customer: "Acme", customerId: "acme" }),
    ); // 236
    await allocateAdvance(r.advance!.id, next, "100");
    expect((await getInvoice("i2"))!.summary).toMatchObject({
      balanceDue: "136.00",
      paymentStatus: "partial",
    });
    const advances = (await getDb().payments.toArray()).filter((p) => !p.invoiceId);
    expect(advances.map((a) => a.amount)).toEqual(["220"]);
    await expect(allocateAdvance(r.advance!.id, next, "999")).rejects.toBeInstanceOf(PaymentError);
  });

  it("records a standalone advance and refunds", async () => {
    const adv = await recordAdvance({
      customerId: "acme",
      customerName: "Acme",
      amount: "500",
      date: "2026-10-01",
      mode: "upi",
    });
    expect(adv.receiptNo).toBe("RCT-0001");
    await expect(
      recordRefund({ customerId: "acme", amount: "900", date: "2026-10-02", mode: "upi" }),
    ).rejects.toMatchObject({ code: "refund_too_large" });
    await recordRefund({ customerId: "acme", amount: "100", date: "2026-10-02", mode: "upi" });

    const i = await make();
    await pay(i, "1180");
    await recordRefund({ invoice: i, amount: "180", date: "2026-10-30", mode: "bank_transfer" });
    expect((await getInvoice("i1"))!.summary).toMatchObject({
      paymentStatus: "partial",
      balanceDue: "180.00",
    });
  });
});

describe("sync and GST return safety", () => {
  it("repairs invoices that fell out of step with the ledger (e.g. after a restore)", async () => {
    await make();
    await savePayment({ id: "p9", invoiceId: "i1", amount: "1180", date: "2026-10-12" });
    expect((await getInvoice("i1"))!.summary.paymentStatus).toBe("unpaid");
    expect(await repairLedgerSync()).toBe(1);
    expect((await getInvoice("i1"))!.summary.paymentStatus).toBe("paid");
    expect(await repairLedgerSync()).toBe(0);
    expect(await syncInvoiceFromLedger("missing")).toBe(false);
  });

  it("does not change the return hash of an issued invoice", async () => {
    const i = await make();
    const before = invoiceReturnHash((await getInvoice("i1"))!);
    await pay(i, "500");
    await pay((await getInvoice("i1"))!, "680");
    const after = (await getInvoice("i1"))!;
    expect(after.summary.paymentStatus).toBe("paid");
    expect(invoiceReturnHash(after)).toBe(before);
  });
});
