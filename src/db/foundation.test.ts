import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoice } from "@/lib/invoice-factory";
import { invoiceReturnHash } from "@/lib/return-hash";
import { DEFAULT_SETTINGS, type AppSettings, type Invoice } from "@/lib/schema";
import { auditFor } from "./audit";
import { buildBackup, parseBackup, parseInvoiceFile, restoreBackup } from "./backup";
import { getDb } from "./db";
import { deleteExpense, getExpense, saveExpense } from "./expenses";
import { getFiling, latestSnapshot, saveSnapshot, upsertFiling } from "./filings";
import { deleteIncome, saveIncome } from "./incomes";
import {
  cancelInvoice,
  deleteInvoice,
  getInvoice,
  InvalidInvoiceError,
  InvoiceActionError,
  issueInvoice,
  latestDraft,
  markDownloaded,
  peekNumber,
  saveInvoice,
} from "./invoices";
import { readDataHealth } from "./read";
import { deleteCustomer, saveCustomer } from "./records";
import { loadSettings, updateSettings } from "./settings";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const settings: AppSettings = DEFAULT_SETTINGS;
const now = new Date(2026, 9, 22, 10, 0, 0);

async function draft(): Promise<Invoice> {
  const generated = await peekNumber(settings, "tax_invoice", now);
  const inv = createInvoice({ settings, designs: [], docType: "tax_invoice", generated, now });
  inv.lines[0] = { ...inv.lines[0], name: "Design", quantity: "2", unitPrice: "500" };
  return inv;
}

const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  memory.clear();
});

describe("saveInvoice", () => {
  it("numbers new documents consecutively by default", async () => {
    const a = await saveInvoice(await draft());
    expect(a.number).toBe("INV/26-27/001");
    expect((await draft()).number).toBe("INV/26-27/002");
  });

  it("validates before writing", async () => {
    const inv = await draft();
    const bad = { ...inv, currency: "rupees" } as unknown as Invoice;
    await expect(saveInvoice(bad)).rejects.toBeInstanceOf(InvalidInvoiceError);
    expect(await getDb().invoices.count()).toBe(0);
  });

  it("upgrades stored v1 rows on read", async () => {
    const inv = await saveInvoice(await draft());
    await getDb().invoices.put({
      ...inv,
      schemaVersion: 1,
      issuedAt: undefined,
      downloadedAt: "2026-10-22T10:00:00.000Z",
    } as unknown as Invoice);
    const read = await getInvoice(inv.id);
    expect(read?.schemaVersion).toBe(2);
    expect(read?.issuedAt).toBe("2026-10-22T10:00:00.000Z");
    expect(await latestDraft()).toBeUndefined();
  });

  it("keeps updatedAt and the return hash when only the download changes", async () => {
    const saved = await saveInvoice(await draft());
    await tick();
    const issued = await markDownloaded(saved);
    expect(issued.issuedAt).not.toBe("");
    expect(issued.updatedAt).not.toBe(saved.updatedAt); // issuing is a real change
    const hash = invoiceReturnHash(issued);

    await tick();
    const again = await markDownloaded(issued);
    expect(again.downloadedAt > issued.downloadedAt).toBe(true);
    expect(again.updatedAt).toBe(issued.updatedAt);
    expect(again.issuedAt).toBe(issued.issuedAt);
    expect(invoiceReturnHash(again)).toBe(hash);

    await tick();
    const edited = await saveInvoice({
      ...again,
      lines: [{ ...again.lines[0], quantity: "3" }],
    });
    expect(edited.updatedAt).not.toBe(again.updatedAt);
    expect(invoiceReturnHash(edited)).not.toBe(hash);
  });

  it("does not issue quotations on download", async () => {
    const generated = await peekNumber(settings, "proforma", now);
    const quote = createInvoice({ settings, designs: [], docType: "proforma", generated, now });
    const downloaded = await markDownloaded(await saveInvoice(quote));
    expect(downloaded.issuedAt).toBe("");
    // A downloaded quotation can still be deleted.
    await deleteInvoice(downloaded.id);
    expect(await getInvoice(downloaded.id)).toBeUndefined();
  });

  it("never lets a stale copy undo issue or cancellation", async () => {
    const saved = await saveInvoice(await draft());
    const issued = await issueInvoice(saved);
    await cancelInvoice(issued, "Wrong customer");
    // The editor still holds the pre-cancel copy and autosaves it.
    const stale = await saveInvoice({ ...saved, notes: "edited" });
    expect(stale.status).toBe("cancelled");
    expect(stale.issuedAt).toBe(issued.issuedAt);
  });
});

describe("issue, cancel and delete", () => {
  it("deletes drafts but refuses issued documents", async () => {
    const d = await saveInvoice(await draft());
    await deleteInvoice(d.id);
    expect(await getInvoice(d.id)).toBeUndefined();

    const issued = await issueInvoice(await saveInvoice(await draft()));
    await expect(deleteInvoice(issued.id)).rejects.toBeInstanceOf(InvoiceActionError);
    await expect(deleteInvoice(issued.id)).rejects.toThrow(/can't be deleted/);
    expect(await getInvoice(issued.id)).toBeDefined();
  });

  it("cancels issued documents with a reason, keeping the number", async () => {
    const d = await saveInvoice(await draft());
    await expect(cancelInvoice(d, "Oops")).rejects.toMatchObject({ code: "not_issued" });
    const issued = await issueInvoice(d);
    await expect(cancelInvoice(issued, "  ")).rejects.toMatchObject({ code: "reason_required" });
    const cancelled = await cancelInvoice(issued, "Duplicate");
    expect(cancelled).toMatchObject({ status: "cancelled", cancelReason: "Duplicate" });
    expect(cancelled.cancelledAt).not.toBe("");
    expect((await getInvoice(d.id))?.number).toBe(d.number);
    await expect(deleteInvoice(d.id)).rejects.toBeInstanceOf(InvoiceActionError);
  });
});

describe("audit log", () => {
  it("records create, issue, edits (coalesced), cancel and delete", async () => {
    const d = await saveInvoice(await draft());
    await saveInvoice({ ...d, customer: { ...d.customer, name: "Acme" } });
    await saveInvoice({ ...d, customer: { ...d.customer, name: "Acme Pvt Ltd" } });
    const issued = await issueInvoice(d);
    await cancelInvoice(issued, "Wrong rate");

    const entries = await auditFor("invoice", d.id);
    expect(entries.map((e) => e.action)).toEqual(["create", "update", "issue", "cancel"]);
    const update = entries[1];
    expect(update.changes).toContainEqual({
      field: "customer.name",
      from: "",
      to: "Acme Pvt Ltd",
    });

    const other = await saveInvoice(await draft());
    await deleteInvoice(other.id);
    expect((await auditFor("invoice", other.id)).map((e) => e.action)).toEqual([
      "create",
      "delete",
    ]);
  });

  it("does not log download-only saves", async () => {
    const issued = await markDownloaded(await saveInvoice(await draft()));
    const before = (await auditFor("invoice", issued.id)).length;
    await markDownloaded(issued);
    expect((await auditFor("invoice", issued.id)).length).toBe(before);
  });

  it("logs customers, expenses and income", async () => {
    const c = await saveCustomer({ name: "Acme" });
    await deleteCustomer(c.id);
    expect((await auditFor("customer", c.id)).map((e) => e.action)).toEqual(["create", "delete"]);

    const e = await saveExpense({ amount: "118", gstRate: "18", gstMode: "intra" });
    await deleteExpense(e.id);
    expect((await auditFor("expense", e.id)).map((x) => x.action)).toEqual(["create", "delete"]);

    const i = await saveIncome({ amount: "50", category: "Interest" });
    await deleteIncome(i.id);
    expect((await auditFor("income", i.id)).map((x) => x.action)).toEqual(["create", "delete"]);
  });
});

describe("expenses and filings", () => {
  it("computes the expense summary on save, ignoring the input summary", async () => {
    const e = await saveExpense({
      date: "2026-10-05",
      amount: "1180",
      amountIncludesGst: true,
      gstRate: "18",
      gstMode: "inter",
      summary: { taxable: "1", cgst: "1", sgst: "1", igst: "1", total: "1" },
    });
    expect(e.summary).toEqual({
      taxable: "1000.00",
      cgst: "0.00",
      sgst: "0.00",
      igst: "180.00",
      total: "1180.00",
    });
    expect((await getExpense(e.id))?.summary.total).toBe("1180.00");
  });

  it("upserts filings by period and return, and finds the latest snapshot", async () => {
    const f = await upsertFiling({
      periodKey: "2026-10",
      periodKind: "month",
      returnType: "GSTR-1",
    });
    expect(f.id).toBe("2026-10:GSTR-1");
    expect(f.status).toBe("not_started");
    const filed = await upsertFiling({ ...f, status: "filed", arn: "AA271026000001X" });
    expect(filed.createdAt).toBe(f.createdAt);
    expect((await getFiling(f.id))?.arn).toBe("AA271026000001X");

    await saveSnapshot({
      filingId: f.id,
      periodKey: "2026-10",
      returnType: "GSTR-1",
      totals: { taxable: "100.00" },
      records: [{ kind: "invoice", id: "a", hash: "1" }],
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    await saveSnapshot({
      filingId: f.id,
      periodKey: "2026-10",
      returnType: "GSTR-1",
      totals: { taxable: "200.00" },
      records: [],
      createdAt: "2026-11-02T00:00:00.000Z",
    });
    expect((await latestSnapshot(f.id))?.totals.taxable).toBe("200.00");
  });
});

describe("data health", () => {
  it("counts invalid rows instead of hiding them", async () => {
    await saveInvoice(await draft());
    await getDb().invoices.put({ id: "broken", currency: 42 } as unknown as Invoice);
    await getDb().expenses.put({ id: "bad", gstMode: "weird" } as never);
    const health = await readDataHealth();
    expect(health.invoices).toBe(1);
    expect(health.expenses).toBe(1);
    expect(health.customers).toBe(0);
  });
});

describe("backup v2", () => {
  it("never exports the PIN and never overwrites the local PIN on restore", async () => {
    await updateSettings((s) => ({
      ...s,
      profile: { ...s.profile, name: "Zynitex" },
      security: { ...s.security, pinEnabled: true, pinHash: "HASH-A", pinSalt: "SALT-A" },
    }));
    await saveExpense({ amount: "100" });
    const backup = await buildBackup();
    const text = JSON.stringify(backup);
    expect(text).not.toContain("HASH-A");
    expect(text).not.toContain("SALT-A");
    expect(backup.schemaVersion).toBe(2);
    expect(backup.data.expenses).toHaveLength(1);

    // A different PIN is set locally; restoring must keep it.
    await updateSettings((s) => ({
      ...s,
      security: { ...s.security, pinEnabled: true, pinHash: "HASH-B", pinSalt: "SALT-B" },
    }));
    await restoreBackup(parseBackup(text), "replace");
    const after = await loadSettings();
    expect(after.profile.name).toBe("Zynitex");
    expect(after.security).toMatchObject({
      pinEnabled: true,
      pinHash: "HASH-B",
      pinSalt: "SALT-B",
    });
    expect(await getDb().expenses.count()).toBe(1);
  });

  it("ignores security settings inside old v1 backups", async () => {
    await updateSettings((s) => ({
      ...s,
      security: { ...s.security, pinEnabled: true, pinHash: "LOCAL", pinSalt: "LOCAL" },
    }));
    const inv = await draft();
    const v1 = {
      format: "invoice-generator/backup",
      schemaVersion: 1,
      exportedAt: "2026-10-01T00:00:00.000Z",
      data: {
        settings: {
          profile: { name: "Old Co" },
          security: { pinEnabled: true, pinHash: "FROM-FILE", pinSalt: "FROM-FILE" },
        },
        customers: [{ id: "c1", name: "Acme" }],
        invoices: [
          {
            ...inv,
            schemaVersion: 1,
            issuedAt: undefined,
            status: undefined,
            downloadedAt: "2026-10-01T09:00:00.000Z",
          },
        ],
        counters: [{ key: "tax_invoice:fy26-27", value: 5 }],
      },
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.data.expenses).toEqual([]);
    expect(parsed.data.auditLog).toEqual([]);
    await restoreBackup(parsed, "replace");

    const settingsAfter = await loadSettings();
    expect(settingsAfter.profile.name).toBe("Old Co");
    expect(settingsAfter.security.pinHash).toBe("LOCAL");
    const restored = await getInvoice(inv.id);
    expect(restored?.issuedAt).toBe("2026-10-01T09:00:00.000Z");
    expect(restored?.schemaVersion).toBe(2);
    expect(await getDb().customers.count()).toBe(1);
    expect((await draft()).number).toBe("INV/26-27/006");
  });

  it("merge adds new-table rows", async () => {
    const e = await saveExpense({ amount: "10" });
    const backup = await buildBackup();
    await getDb().expenses.clear();
    await restoreBackup(backup, "merge");
    expect((await getExpense(e.id))?.amount).toBe("10");
  });

  it("imports v1 and v2 single-invoice files", async () => {
    const inv = await draft();
    for (const schemaVersion of [1, 2]) {
      const imported = parseInvoiceFile(
        JSON.stringify({
          format: "invoice-generator/invoice",
          schemaVersion,
          exportedAt: "2026-10-01T00:00:00.000Z",
          invoice: { ...inv, schemaVersion },
        }),
      );
      expect(imported.schemaVersion).toBe(2);
    }
  });
});
