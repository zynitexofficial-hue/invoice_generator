import { describe, expect, it } from "vitest";
import { customerIdentity } from "@/lib/analytics/base";
import { data, inv } from "@/lib/analytics/fixtures.test-utils";
import { receivablesReport } from "@/lib/analytics/receivables";
import { paymentEntrySchema, type PaymentEntry } from "@/lib/schema";
import { buildPaymentEvents } from "./ledger";
import { buildStatement, customerMatch, statementCsvRows } from "./statement";

let n = 0;
const row = (o: Partial<PaymentEntry>): PaymentEntry =>
  paymentEntrySchema.parse({ id: o.id ?? `p${++n}`, ...o });
const keyOf = (i: Parameters<typeof customerIdentity>[0]) => customerIdentity(i).key;
const acme = customerMatch({ id: "acme", gstin: "", name: "Acme", company: "" });

describe("buildStatement", () => {
  const invoices = [
    inv({ id: "a", number: "A-1", date: "2026-09-05", amount: "1000" }), // 1180
    inv({ id: "b", number: "A-2", date: "2026-10-05", amount: "2000" }), // 2360
    inv({ id: "c", number: "CN-1", docType: "credit_note", date: "2026-10-20", amount: "500" }), // 590
    inv({
      id: "z",
      number: "Z-1",
      date: "2026-10-06",
      amount: "999",
      customer: "Other",
      customerId: "other",
    }),
  ];
  const ledger = [
    row({ invoiceId: "a", amount: "500", date: "2026-09-20", receiptNo: "RCT-0001" }),
    row({
      invoiceId: "b",
      amount: "1000",
      date: "2026-10-15",
      mode: "upi",
      reference: "U1",
      receiptNo: "RCT-0002",
    }),
    row({
      customerId: "acme",
      customerName: "Acme",
      kind: "advance",
      amount: "300",
      date: "2026-10-25",
    }),
    row({ invoiceId: "z", amount: "100", date: "2026-10-10" }),
  ];
  const d = data(invoices);
  const events = buildPaymentEvents(invoices, ledger, keyOf);

  it("computes opening balance, running balance and closing for a range", () => {
    const s = buildStatement({
      facts: d.facts,
      events,
      match: acme,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(s.opening).toBe("680.00"); // 1180 - 500 before October
    expect(s.lines.map((l) => [l.kind, l.ref, l.balance])).toEqual([
      ["invoice", "A-2", "3040.00"],
      ["payment", "RCT-0002", "2040.00"],
      ["credit_note", "CN-1", "1450.00"],
      ["advance", "", "1150.00"],
    ]);
    expect(s.closing).toBe("1150.00");
    expect(s.totals).toMatchObject({
      invoiced: "2360.00",
      creditNotes: "590.00",
      received: "1300.00",
    });
    const debit = s.lines.reduce((a, l) => a + Number(l.debit || 0), 0);
    const credit = s.lines.reduce((a, l) => a + Number(l.credit || 0), 0);
    expect(Number(s.opening) + debit - credit).toBeCloseTo(Number(s.closing), 2);
  });

  it("never mixes in other customers", () => {
    const s = buildStatement({ facts: d.facts, events, match: acme, from: "", to: "" });
    expect(s.lines.some((l) => l.ref === "Z-1")).toBe(false);
    expect(s.opening).toBe("0.00");
  });

  it("splits the closing balance into invoices due and adjustments", () => {
    const s = buildStatement({ facts: d.facts, events, match: acme, from: "", to: "2026-10-31" });
    expect(s.invoicesDue).toBe("2040.00"); // (1180-500) + (2360-1000)
    expect(s.closing).toBe("1150.00");
    expect(s.adjustments).toBe("-890.00"); // credit note 590 + advance 300
  });

  it("exports CSV rows with opening and closing lines", () => {
    const s = buildStatement({
      facts: d.facts,
      events,
      match: acme,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    const { headers, rows } = statementCsvRows(s);
    expect(headers).toHaveLength(7);
    expect(rows[0][1]).toBe("Opening balance");
    expect(rows.at(-1)![6]).toBe(s.closing);
  });
});

describe("reconciliation with receivables", () => {
  it("closing equals receivables outstanding when only invoices and payments exist", () => {
    const a = inv({ id: "a", number: "A-1", date: "2026-10-01", amount: "1000", received: "400" });
    const b = inv({ id: "b", number: "A-2", date: "2026-10-02", amount: "500" });
    const ledger = [row({ invoiceId: "a", amount: "400", date: "2026-10-05" })];
    const d = data([a, b]);
    const events = buildPaymentEvents([a, b], ledger, keyOf);
    const s = buildStatement({ facts: d.facts, events, match: acme, from: "", to: "2026-10-31" });
    expect(s.closing).toBe(receivablesReport(d, "2026-10-31").outstanding);
    expect(s.adjustments).toBe("0.00");
  });
});
