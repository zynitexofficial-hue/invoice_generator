import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoice } from "@/lib/invoice-factory";
import { templateFromExpense, templateFromInvoice } from "@/lib/recurring/build";
import { DEFAULT_SETTINGS } from "@/lib/schema";
import { auditFor } from "./audit";
import { getDb } from "./db";
import { getExpense, saveExpense } from "./expenses";
import { getInvoice, peekNumber } from "./invoices";
import {
  getRecurring,
  runAutoOnOpen,
  runRecurring,
  saveRecurring,
  skipMissed,
  summarizeDue,
} from "./recurring";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const settings = DEFAULT_SETTINGS;

async function sourceInvoice() {
  const now = new Date(2026, 0, 5);
  const generated = await peekNumber(settings, "tax_invoice", now);
  const inv = createInvoice({ settings, designs: [], docType: "tax_invoice", generated, now });
  inv.customer = { ...inv.customer, name: "Acme Traders", stateCode: "27" };
  inv.lines[0] = { ...inv.lines[0]!, name: "Retainer", quantity: "1", unitPrice: "10000" };
  inv.dueDate = "2026-01-20";
  inv.invoiceDate = "2026-01-05";
  return inv;
}

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  memory.clear();
});

async function invoiceTemplate(over: Record<string, unknown> = {}) {
  return saveRecurring({
    kind: "invoice",
    name: "Acme retainer",
    startDate: "2026-01-15",
    template: templateFromInvoice(await sourceInvoice()),
    ...over,
  });
}

describe("saveRecurring", () => {
  it("fills the first run date from the schedule", async () => {
    const r = await invoiceTemplate({ startDate: "2026-02-10", dayOfMonth: 5 });
    expect(r.nextRunDate).toBe("2026-03-05");
    expect((await auditFor("recurring", r.id))[0]?.action).toBe("create");
  });
});

describe("runRecurring (invoices)", () => {
  it("creates numbered drafts for every missed month and advances the schedule", async () => {
    const r = await invoiceTemplate();
    const report = await runRecurring(r.id, { today: "2026-03-20" });
    expect(report.created).toBe(3);
    expect(report.error).toBeUndefined();
    expect(report.numbers).toHaveLength(3);
    const saved = (await getRecurring(r.id))!;
    expect(saved.runCount).toBe(3);
    expect(saved.nextRunDate).toBe("2026-04-15");
    expect(saved.lastRunDate).toBe("2026-03-15");
    expect(saved.runs.map((x) => x.date)).toEqual(["2026-01-15", "2026-02-15", "2026-03-15"]);

    const drafts = await Promise.all(saved.runs.map((x) => getInvoice(x.recordId)));
    for (const [i, d] of drafts.entries()) {
      expect(d?.issuedAt).toBe("");
      expect(d?.invoiceDate).toBe(saved.runs[i]!.date);
      expect(d?.dueDate).toBe(["2026-01-30", "2026-03-02", "2026-03-30"][i]);
      expect(d?.customer.name).toBe("Acme Traders");
      expect(d?.lines[0]?.name).toBe("Retainer");
      expect(d?.summary.grandTotal).not.toBe("0.00");
    }
    expect(new Set(drafts.map((d) => d?.number)).size).toBe(3);
    expect(new Set(drafts.map((d) => d?.lines[0]?.id)).size).toBe(3);
  });

  it("does nothing when nothing is due, and is idempotent", async () => {
    const r = await invoiceTemplate();
    expect((await runRecurring(r.id, { today: "2026-01-14" })).created).toBe(0);
    await runRecurring(r.id, { today: "2026-01-15" });
    expect((await runRecurring(r.id, { today: "2026-01-15" })).created).toBe(0);
    expect(await getDb().invoices.count()).toBe(1);
  });

  it("concurrent runs create each occurrence once", async () => {
    const r = await invoiceTemplate();
    const [a, b] = await Promise.all([
      runRecurring(r.id, { today: "2026-02-20" }),
      runRecurring(r.id, { today: "2026-02-20" }),
    ]);
    expect(a.created).toBe(2);
    expect(b.created).toBe(2); // same in-flight promise
    expect(await getDb().invoices.count()).toBe(2);
  });

  it("caps catch-up and reports the remainder", async () => {
    const r = await invoiceTemplate({ frequency: "weekly" });
    const report = await runRecurring(r.id, { today: "2026-12-31" });
    expect(report.created).toBe(12);
    expect(report.remaining).toBeGreaterThan(0);
    const next = await runRecurring(r.id, { today: "2026-12-31", cap: 2 });
    expect(next.created).toBe(2);
    expect((await getRecurring(r.id))!.runCount).toBe(14);
  });

  it("stops after maxRuns and clears the next date", async () => {
    const r = await invoiceTemplate({ maxRuns: 2 });
    const report = await runRecurring(r.id, { today: "2026-12-31" });
    expect(report.created).toBe(2);
    expect((await getRecurring(r.id))!.nextRunDate).toBe("");
    expect((await runRecurring(r.id, { today: "2027-12-31" })).created).toBe(0);
  });

  it("ignores paused templates", async () => {
    const r = await invoiceTemplate({ active: false });
    expect((await runRecurring(r.id, { today: "2026-12-31" })).created).toBe(0);
  });

  it("run now creates the next occurrence early, dated today", async () => {
    const r = await invoiceTemplate({ startDate: "2026-06-15" });
    const report = await runRecurring(r.id, { today: "2026-05-01", early: true });
    expect(report.created).toBe(1);
    const saved = (await getRecurring(r.id))!;
    expect(saved.nextRunDate).toBe("2026-07-15");
    expect((await getInvoice(saved.runs[0]!.recordId))?.invoiceDate).toBe("2026-05-01");
  });

  it("reports a missing template", async () => {
    expect((await runRecurring("nope")).error).toMatch(/no longer exists/);
  });
});

describe("runRecurring (expenses)", () => {
  it("creates dated expense entries with fresh summaries", async () => {
    const e = await saveExpense({
      date: "2026-01-01",
      vendorName: "Landlord",
      category: "Rent",
      amount: "11800",
      amountIncludesGst: true,
      gstRate: "18",
      gstMode: "intra",
      invoiceNo: "R-1",
      paymentStatus: "paid",
    });
    const r = await saveRecurring({
      kind: "expense",
      name: "Office rent",
      startDate: "2026-01-31",
      template: templateFromExpense(e),
    });
    const report = await runRecurring(r.id, { today: "2026-03-31" });
    expect(report.created).toBe(3);
    const saved = (await getRecurring(r.id))!;
    expect(saved.runs.map((x) => x.date)).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
    const made = (await getExpense(saved.runs[1]!.recordId))!;
    expect(made.date).toBe("2026-02-28");
    expect(made.invoiceNo).toBe("");
    expect(made.paymentDate).toBe("2026-02-28");
    expect(made.summary.total).toBe("11800.00");
    expect(made.summary.taxable).toBe("10000.00");
  });
});

describe("skipMissed and due summary", () => {
  it("skips everything missed and resumes with the next future date", async () => {
    const r = await invoiceTemplate();
    expect(await skipMissed(r.id, "2026-04-20")).toBe(4);
    const saved = (await getRecurring(r.id))!;
    expect(saved.nextRunDate).toBe("2026-05-15");
    expect(saved.runCount).toBe(0);
    expect(await getDb().invoices.count()).toBe(0);
    expect((await runRecurring(r.id, { today: "2026-04-20" })).created).toBe(0);
  });

  it("summarises due items", async () => {
    const a = await invoiceTemplate();
    await invoiceTemplate({ name: "Paused", active: false });
    const s = summarizeDue([(await getRecurring(a.id))!], "2026-02-16");
    expect(s.count).toBe(2);
    expect(s.items).toHaveLength(1);
  });
});

describe("runAutoOnOpen", () => {
  it("auto templates with a small backlog run; ask-me and big backlogs wait", async () => {
    const small = await invoiceTemplate({ mode: "auto", name: "small" });
    const ask = await invoiceTemplate({ mode: "ask", name: "ask" });
    const big = await invoiceTemplate({ mode: "auto", frequency: "weekly", name: "big" });
    const { reports, waiting } = await runAutoOnOpen("2026-03-20");
    expect(reports).toHaveLength(1);
    expect(reports[0]?.name).toBe("small");
    expect((await getRecurring(small.id))!.runCount).toBe(3);
    expect((await getRecurring(ask.id))!.runCount).toBe(0);
    expect((await getRecurring(big.id))!.runCount).toBe(0);
    expect(waiting).toBeGreaterThan(3);
    // A second open finds nothing new for the one that ran.
    expect((await runAutoOnOpen("2026-03-20")).reports).toHaveLength(0);
  });
});
