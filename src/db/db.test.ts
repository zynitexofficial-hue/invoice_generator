import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoice } from "@/lib/invoice-factory";
import { DEFAULT_SETTINGS, type AppSettings } from "@/lib/schema";
import { buildBackup, ImportError, parseBackup, parseInvoiceFile, restoreBackup } from "./backup";
import { getDb } from "./db";
import { checkIntegrity } from "./health";
import { isNumberTaken, peekNumber, saveInvoice } from "./invoices";
import { saveCustomer } from "./records";

// Minimal in-memory localStorage for the node test environment.
const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const seqSettings: AppSettings = {
  ...DEFAULT_SETTINGS,
  numbering: {
    ...DEFAULT_SETTINGS.numbering,
    tax_invoice: { prefix: "INV", pattern: "{PREFIX}/{FY}/{SEQ:3}" },
  },
};

async function newInvoice(settings = seqSettings, now = new Date(2026, 9, 22, 10, 0, 0)) {
  const generated = await peekNumber(settings, "tax_invoice", now);
  return createInvoice({ settings, designs: [], docType: "tax_invoice", generated, now });
}

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  memory.clear();
});

describe("numbering with {SEQ}", () => {
  it("consumes the counter only when a document is saved", async () => {
    const a = await newInvoice();
    expect(a.number).toBe("INV/26-27/001");
    // Not saved yet: the next peek still returns 001.
    expect((await peekNumber(seqSettings, "tax_invoice", new Date(2026, 9, 22))).number).toBe(
      "INV/26-27/001",
    );

    const saved = await saveInvoice(a);
    expect(saved.seqCommitted).toBe(true);
    const b = await newInvoice();
    expect(b.number).toBe("INV/26-27/002");
  });

  it("leaves the counter alone when the number was typed by hand", async () => {
    const a = await newInvoice();
    await saveInvoice({ ...a, number: "CUSTOM-1" });
    expect((await newInvoice()).number).toBe("INV/26-27/001");
  });

  it("detects duplicate numbers", async () => {
    const a = await saveInvoice(await newInvoice());
    expect(await isNumberTaken(a.number, "other-id")).toBe(true);
    expect(await isNumberTaken(a.number, a.id)).toBe(false);
  });
});

describe("backup", () => {
  it("round-trips through JSON and restores with replace", async () => {
    await saveCustomer({ name: "Acme Pvt Ltd", stateCode: "27" });
    const inv = await saveInvoice(await newInvoice());
    const text = JSON.stringify(await buildBackup());

    await Promise.all(getDb().tables.map((t) => t.clear()));
    const backup = parseBackup(text);
    await restoreBackup(backup, "replace");

    expect(await getDb().customers.count()).toBe(1);
    const restored = await getDb().invoices.get(inv.id);
    expect(restored?.number).toBe(inv.number);
    // Counter restored too, so numbering continues.
    expect((await newInvoice()).number).toBe("INV/26-27/002");
  });

  it("merge keeps newer local records", async () => {
    const c = await saveCustomer({ name: "Old name" });
    const backup = await buildBackup();
    await saveCustomer({ ...c, name: "New name" });
    await restoreBackup(backup, "merge");
    expect((await getDb().customers.get(c.id))?.name).toBe("New name");
  });

  it("rejects the wrong kind of file with a helpful message", () => {
    expect(() => parseBackup("not json")).toThrow(ImportError);
    expect(() => parseBackup(JSON.stringify({ format: "invoice-generator/invoice" }))).toThrow(
      /single invoice/,
    );
    expect(() =>
      parseBackup(
        JSON.stringify({
          format: "invoice-generator/backup",
          schemaVersion: 99,
          exportedAt: "",
          data: {},
        }),
      ),
    ).toThrow(/newer version/);
  });
});

describe("invoice files", () => {
  it("imports as a new record and recomputes totals", async () => {
    const inv = await newInvoice();
    inv.lines[0] = { ...inv.lines[0], name: "Design", quantity: "2", unitPrice: "500" };
    const tampered = {
      ...inv,
      summary: { grandTotal: "1", balanceDue: "1", paymentStatus: "paid" },
    };
    const text = JSON.stringify({
      format: "invoice-generator/invoice",
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      invoice: tampered,
    });
    const imported = parseInvoiceFile(text);
    expect(imported.id).not.toBe(inv.id);
    expect(imported.summary.grandTotal).toBe("1180.00");
    expect(imported.summary.paymentStatus).toBe("unpaid");
  });
});

describe("integrity check", () => {
  it("reports a fresh install, then ok, then cleared when IndexedDB is wiped", async () => {
    expect((await checkIntegrity()).integrity).toBe("fresh");
    await saveCustomer({ name: "A" });
    await saveCustomer({ name: "B" });
    // Marker sync is debounced; run the check (which also re-syncs).
    expect((await checkIntegrity()).integrity).toBe("ok");

    await Promise.all(getDb().tables.map((t) => t.clear()));
    const result = await checkIntegrity();
    expect(result.integrity).toBe("cleared");
    expect(result.detail).toMatch(/2 customers/);
  });

  it("reports partial loss when records vanish", async () => {
    await checkIntegrity();
    await saveCustomer({ name: "A" });
    await saveCustomer({ name: "B" });
    await checkIntegrity();
    await getDb().customers.limit(1).delete();
    const result = await checkIntegrity();
    expect(result.integrity).toBe("partial");
  });
});

describe("random numbers", () => {
  it("re-rolls so a number already in history is never issued again", async () => {
    // Only 100 possible numbers: without re-rolling, 30 invoices would almost
    // certainly (~99%) produce a duplicate (birthday problem).
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      numbering: {
        ...DEFAULT_SETTINGS.numbering,
        tax_invoice: { prefix: "INV", pattern: "{BIZ}-{RAND:2}" },
      },
    };
    const numbers: string[] = [];
    for (let i = 0; i < 30; i++) {
      const inv = await newInvoice(settings);
      numbers.push(inv.number);
      await saveInvoice(inv);
    }
    expect(new Set(numbers).size).toBe(30);
  });
});
