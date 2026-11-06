import { describe, expect, it } from "vitest";
import { buildPaymentEvents } from "@/lib/payments/ledger";
import { paymentEntrySchema, type PaymentEntry } from "@/lib/schema";
import { customerIdentity } from "./base";
import { collectionsReport } from "./collections";
import { data, inv } from "./fixtures.test-utils";
import { receivablesReport } from "./receivables";

let n = 0;
const row = (o: Partial<PaymentEntry>): PaymentEntry =>
  paymentEntrySchema.parse({ id: o.id ?? `p${++n}`, ...o });
const keyOf = (i: Parameters<typeof customerIdentity>[0]) => customerIdentity(i).key;
const RANGE = { start: "2026-10-01", end: "2026-10-31" };
const TODAY = "2026-11-05";

// Totals: 1180 each (1000 + 18%).
const slow = (id: string, date: string, due: string, received = "") =>
  inv({
    id,
    number: id,
    date,
    due,
    amount: "1000",
    customer: "Slow Ltd",
    customerId: "slow",
    received,
  });
const fast = (id: string, date: string, due: string, received = "") =>
  inv({
    id,
    number: id,
    date,
    due,
    amount: "1000",
    customer: "Fast Co",
    customerId: "fast",
    received,
  });

describe("collectionsReport", () => {
  const invoices = [
    fast("f1", "2026-10-01", "2026-10-15", "1180"),
    slow("s1", "2026-10-01", "2026-10-10", "1180"),
    slow("s2", "2026-09-01", "2026-09-10", "600"),
  ];
  const ledger = [
    row({ invoiceId: "f1", amount: "1180", date: "2026-10-11" }), // 10 days, on time
    row({ invoiceId: "s1", amount: "1180", date: "2026-10-21" }), // 20 days, 11 late
    row({ invoiceId: "s2", amount: "600", date: "2026-10-05" }), // partial
    row({
      customerId: "fast",
      customerName: "Fast Co",
      kind: "advance",
      amount: "250",
      date: "2026-10-28",
    }),
  ];
  const d = data(invoices);
  const events = buildPaymentEvents(invoices, ledger, keyOf);
  const r = collectionsReport(d, events, RANGE, TODAY);

  it("measures days to pay and on-time vs late for fully paid invoices", () => {
    expect(r.settled.map((s) => [s.id, s.daysToPay, s.daysLate]).sort()).toEqual([
      ["f1", 10, -4],
      ["s1", 20, 11],
    ]);
    expect(r.avgDaysToPay).toBe("15.0");
    expect(r.medianDaysToPay).toBe("15");
    expect(r.onTime).toEqual({ count: 1, amount: "1180.00" });
    expect(r.late).toEqual({ count: 1, amount: "1180.00" });
    expect(r.onTimeShare).toBe("50.00");
  });

  it("totals what was collected, including unallocated advances", () => {
    expect(r.moneyIn).toBe("3210.00");
    expect(r.collected).toBe("3210.00");
    expect(r.collectedOnInvoices).toBe("2960.00");
    expect(r.advancesHeld).toBe("250.00");
  });

  it("ranks slow payers by days late", () => {
    expect(r.slowPayers[0]).toMatchObject({
      name: "Slow Ltd",
      avgDaysLate: "11.0",
      lateShare: "100.00",
    });
    expect(r.slowPayers[0].outstanding).toBe("580.00");
  });

  it("builds a 12-month trend ending at the period", () => {
    expect(r.trend).toHaveLength(12);
    const oct = r.trend.at(-1)!;
    expect(oct.month).toBe("2026-10");
    expect(oct.collected).toBe("3210.00");
    expect(oct.billed).toBe("2360.00");
  });

  it("reconciles ageing with the receivables engine and the ledger", () => {
    expect(r.ageing.outstanding).toBe(receivablesReport(d, TODAY).outstanding);
    expect(r.reconciliation.ledger).toBe("580.00");
    expect(r.reconciliation.receivables).toBe("580.00");
    expect(r.reconciliation.difference).toBe("0.00");
    expect(r.reconciliation.outOfStep).toEqual([]);
  });

  it("flags invoices whose stored balance is out of step with the ledger", () => {
    const stale = [fast("f1", "2026-10-01", "2026-10-15", "")]; // ledger says paid, invoice says unpaid
    const rep = collectionsReport(
      data(stale),
      buildPaymentEvents(stale, [ledger[0]], keyOf),
      RANGE,
      TODAY,
    );
    expect(rep.reconciliation.outOfStep).toEqual(["f1"]);
    expect(rep.reconciliation.difference).toBe("-1180.00");
  });

  it("computes collection efficiency from opening receivables plus billing", () => {
    // Opening (30 Sep): s2 = 1180 due. Billed in Oct: 2360. Collected on invoices: 2960.
    expect(r.efficiency).toBe(((2960 / (1180 + 2360)) * 100).toFixed(2));
  });

  it("handles no data", () => {
    const empty = collectionsReport(data([]), [], RANGE, TODAY);
    expect(empty.avgDaysToPay).toBeNull();
    expect(empty.efficiency).toBeNull();
    expect(empty.onTimeShare).toBeNull();
    expect(empty.slowPayers).toEqual([]);
  });
});
