import { beforeEach, describe, expect, it, vi } from "vitest";
import { createInvoice } from "@/lib/invoice-factory";
import { generateSalt, hashPin, LEGACY_PIN_ITERATIONS, verifyPin } from "@/lib/security";
import { DEFAULT_SETTINGS } from "@/lib/schema";
import { upgradePinAfterUnlock } from "@/stores/lock-store";
import {
  buildBackup,
  ImportError,
  isEncryptedBackupText,
  parseBackup,
  parseBackupFile,
  RestoreCancelledError,
  serializeBackup,
  summarizeBackup,
} from "./backup";
import { buildCustomerExport, eraseCustomerPersonalData } from "./customer-data";
import { getDb } from "./db";
import { saveInvoice } from "./invoices";
import { saveCustomer } from "./records";
import { loadSettings, updateSettings } from "./settings";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  const db = getDb();
  await Promise.all(db.tables.map((t) => t.clear()));
  memory.clear();
});

function draftFor(customerId: string, name: string) {
  const inv = createInvoice({
    settings: DEFAULT_SETTINGS,
    designs: [],
    docType: "tax_invoice",
    generated: { number: `INV-${Math.random().toString(36).slice(2, 7)}`, autoNumber: null },
    now: new Date(2026, 9, 22),
  });
  return {
    ...inv,
    customer: {
      ...inv.customer,
      customerId,
      name,
      email: "a@example.com",
      phone: "9876543210",
      billingAddress: "1 MG Road",
    },
  };
}

describe("encrypted backups via backup.ts", () => {
  it("parses an encrypted backup with the right passphrase", async () => {
    await saveCustomer({ name: "Acme" });
    const backup = await buildBackup();
    const text = await serializeBackup(backup, "a long passphrase");
    expect(isEncryptedBackupText(text)).toBe(true);
    expect(() => parseBackup(text)).toThrow(ImportError);

    const asked = vi.fn(() => "a long passphrase");
    const { backup: parsed, encrypted } = await parseBackupFile(text, asked);
    expect(asked).toHaveBeenCalledOnce();
    expect(encrypted).toBe(true);
    expect(parsed.data.customers[0]?.name).toBe("Acme");
    expect(summarizeBackup(parsed, encrypted)).toMatchObject({ customers: 1, encrypted: true });
  });

  it("rejects a wrong passphrase and supports cancelling", async () => {
    const text = await serializeBackup(await buildBackup(), "a long passphrase");
    await expect(parseBackupFile(text, () => "nope")).rejects.toMatchObject({
      code: "wrong_passphrase",
    });
    await expect(parseBackupFile(text, () => null)).rejects.toBeInstanceOf(RestoreCancelledError);
  });

  it("parses plain backups without asking for a passphrase", async () => {
    const text = await serializeBackup(await buildBackup());
    const asked = vi.fn(() => "x");
    const r = await parseBackupFile(text, asked);
    expect(r.encrypted).toBe(false);
    expect(asked).not.toHaveBeenCalled();
  });
});

describe("customer data tools", () => {
  it("exports a customer with their documents", async () => {
    const c = await saveCustomer({ name: "Ravi", email: "r@example.com" });
    await saveInvoice(draftFor(c.id, "Ravi"));
    const data = await buildCustomerExport(c.id);
    expect(data?.customer.email).toBe("r@example.com");
    expect(data?.invoices).toHaveLength(1);
    expect(data?.invoices[0]).toMatchObject({ status: "draft" });
  });

  it("erases the customer and clears contact details on drafts only", async () => {
    const c = await saveCustomer({ name: "Ravi", email: "r@example.com", phone: "1" });
    const other = await saveCustomer({ name: "Someone else" });
    const draft = await saveInvoice(draftFor(c.id, "Ravi"));
    const issued = await saveInvoice({
      ...draftFor(c.id, "Ravi"),
      issuedAt: new Date(2026, 9, 22).toISOString(),
    });
    const unrelated = await saveInvoice(draftFor(other.id, "Someone else"));

    const result = await eraseCustomerPersonalData(c.id);
    expect(result).toEqual({ draftsCleared: 1, issuedKept: 1 });

    const db = getDb();
    expect(await db.customers.get(c.id)).toBeUndefined();
    expect(await db.customers.get(other.id)).toBeDefined();
    const d = await db.invoices.get(draft.id);
    expect(d?.customer).toMatchObject({ email: "", phone: "", name: "Ravi" });
    const i = await db.invoices.get(issued.id);
    expect(i?.customer).toMatchObject({ email: "a@example.com", phone: "9876543210" });
    const u = await db.invoices.get(unrelated.id);
    expect(u?.customer.email).toBe("a@example.com");

    const audit = await db.auditLog.where("entityId").equals(c.id).toArray();
    const erase = audit.find((e) => e.action === "delete");
    expect(erase?.summary).toMatch(/Erased/);
    expect(erase?.summary).not.toContain("Ravi");
  });
});

describe("PIN hash upgrade", () => {
  it("re-hashes a legacy 100k PIN with 600k iterations after unlock", async () => {
    const salt = generateSalt();
    const legacy = (await hashPin("123456", salt, LEGACY_PIN_ITERATIONS)).split("$")[2]!;
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
    await updateSettings((s) => ({
      ...s,
      security: { ...s.security, pinEnabled: true, pinHash: legacy, pinSalt: salt },
    }));

    expect(await verifyPin("123456", legacy, salt)).toBe(true);
    expect(await upgradePinAfterUnlock()).toBe(true);

    const { security } = await loadSettings();
    expect(security.pinHash).toMatch(/^pbkdf2-sha256\$600000\$[0-9a-f]{64}$/);
    expect(security.pinSalt).not.toBe(salt);
    expect(await verifyPin("123456", security.pinHash, security.pinSalt)).toBe(true);
    expect(await verifyPin("654321", security.pinHash, security.pinSalt)).toBe(false);
    // Nothing pending any more.
    expect(await upgradePinAfterUnlock()).toBe(false);
  });

  it("doesn't overwrite a PIN that changed in the meantime", async () => {
    const salt = generateSalt();
    const legacy = (await hashPin("111111", salt, LEGACY_PIN_ITERATIONS)).split("$")[2]!;
    expect(await verifyPin("111111", legacy, salt)).toBe(true);
    const newSalt = generateSalt();
    const current = await hashPin("222222", newSalt);
    await updateSettings((s) => ({
      ...s,
      security: { ...s.security, pinEnabled: true, pinHash: current, pinSalt: newSalt },
    }));
    expect(await upgradePinAfterUnlock()).toBe(false);
    expect((await loadSettings()).security.pinHash).toBe(current);
  });
});
