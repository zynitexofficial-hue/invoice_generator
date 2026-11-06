import { describe, expect, it } from "vitest";
import { toDec } from "@/lib/money";
import { paymentEntrySchema } from "@/lib/schema";
import { cashInFromInvoices, cashInFromLedger } from "./cash-in-source";
import { inv, SELLER_STATE } from "./fixtures.test-utils";

let n = 0;
const pay = (o: Record<string, unknown>) =>
  paymentEntrySchema.parse({ id: `lp${++n}`, kind: "payment", ...o });
const sum = (rows: { amount: string }[]) =>
  rows.reduce((a, r) => a.plus(r.amount), toDec(0)).toFixed(2);

describe("cashInFromLedger", () => {
  it("uses each ledger payment on its own date (invoice total 1180)", () => {
    const i = inv({ id: "L1", date: "2026-10-01", amount: "1000" });
    const rows = [
      pay({ invoiceId: "L1", date: "2026-10-05", amount: "400" }),
      pay({ invoiceId: "L1", date: "2026-11-02", amount: "300" }),
    ];
    const out = cashInFromLedger([i], rows, SELLER_STATE);
    expect(out.map((r) => [r.date, r.amount])).toEqual([
      ["2026-10-05", "400.00"],
      ["2026-11-02", "300.00"],
    ]);
  });

  it("subtracts refunds as negative cash in", () => {
    const i = inv({ id: "L2", amount: "1000" });
    const rows = [
      pay({ invoiceId: "L2", date: "2026-10-05", amount: "500" }),
      pay({ invoiceId: "L2", kind: "refund", date: "2026-10-09", amount: "100" }),
    ];
    const out = cashInFromLedger([i], rows, SELLER_STATE);
    expect(sum(out)).toBe("400.00");
    expect(out.find((r) => r.amount.startsWith("-"))?.amount).toBe("-100.00");
  });

  it("counts advances that are not applied to an invoice", () => {
    const rows = [
      pay({
        kind: "advance",
        invoiceId: "",
        customerName: "Acme",
        date: "2026-10-03",
        amount: "250",
      }),
    ];
    const out = cashInFromLedger([], rows, SELLER_STATE);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      invoiceNumber: "Advance",
      amount: "250.00",
      customerName: "Acme",
    });
  });

  it("falls back to the old amount received when an invoice has no ledger rows", () => {
    const legacy = inv({ id: "L3", amount: "1000", received: "500" });
    expect(sum(cashInFromLedger([legacy], [], SELLER_STATE))).toBe(
      sum(cashInFromInvoices([legacy], SELLER_STATE)),
    );
    expect(sum(cashInFromLedger([legacy], [], SELLER_STATE))).toBe("500.00");
  });

  it("converts foreign-currency receipts with the invoice's exchange rate", () => {
    const usd = inv({
      id: "L4",
      amount: "100",
      currency: "USD",
      rate: "0",
      country: "United States",
    });
    const withRate = {
      ...usd,
      exportDetails: { ...usd.exportDetails, exchangeRate: "80" },
    };
    const out = cashInFromLedger(
      [withRate],
      [pay({ invoiceId: "L4", date: "2026-10-05", amount: "10" })],
      SELLER_STATE,
    );
    expect(out.map((r) => r.amount)).toEqual(["800.00"]);
  });

  it("skips foreign-currency invoices with no exchange rate instead of guessing", () => {
    const usd = inv({
      id: "L5",
      amount: "100",
      currency: "USD",
      rate: "0",
      country: "United States",
    });
    expect(
      cashInFromLedger(
        [usd],
        [pay({ invoiceId: "L5", date: "2026-10-05", amount: "10" })],
        SELLER_STATE,
      ),
    ).toEqual([]);
  });
});
