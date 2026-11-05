import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SETTINGS,
  amendmentSchema,
  annualInputSchema,
  attachmentSchema,
  gstr2bImportSchema,
  gstr2bMatchSchema,
  invoiceSchema,
  paymentEntrySchema,
  periodInputSchema,
  purchaseSchema,
  recurringSchema,
  settingsSchema,
  vendorSchema,
} from "@/lib/schema";
import { auditFor } from "./audit";
import {
  BACKUP_SCHEMA_VERSION,
  buildBackup,
  clearAllData,
  parseBackup,
  restoreBackup,
  summarizeBackup,
} from "./backup";
import {
  deleteAmendment,
  getAmendment,
  listAmendmentsForInvoice,
  saveAmendment,
} from "./amendments";
import { getAnnualInput, saveAnnualInput } from "./annual-inputs";
import {
  attachmentUsage,
  deleteAttachment,
  getAttachmentData,
  listAttachmentsFor,
  saveAttachment,
} from "./attachments";
import { COUNTED_TABLES, getDb } from "./db";
import {
  deleteGstr2bImportWithMatches,
  getGstr2bImport,
  listMatchesForImport,
  saveGstr2bImport,
  saveGstr2bMatch,
} from "./gstr2b";
import { checkIntegrity } from "./health";
import { deletePayment, getPayment, listPaymentsForInvoice, savePayment } from "./payments";
import { getPeriodInput, savePeriodInput } from "./period-inputs";
import { deletePurchase, getPurchase, listPurchases, savePurchase } from "./purchases";
import { readDataHealth, readTable, VALIDATED_TABLES } from "./read";
import { deleteRecurring, getRecurring, saveRecurring } from "./recurring";
import { loadSettings, updateSettings } from "./settings";
import { deleteVendor, getVendor, saveVendor } from "./vendors";

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

describe("Phase 2-4 schemas", () => {
  it("fill sensible defaults", () => {
    expect(paymentEntrySchema.parse({ id: "p" })).toMatchObject({
      kind: "payment",
      invoiceId: "",
      amount: "",
      schemaVersion: 1,
    });
    expect(amendmentSchema.parse({ id: "a" })).toMatchObject({
      kind: "invoice_amendment",
      status: "draft",
      before: {},
    });
    expect(recurringSchema.parse({ id: "r" })).toMatchObject({
      kind: "invoice",
      active: true,
      frequency: "monthly",
      interval: 1,
      autoIssue: false,
      runs: [],
    });
    expect(vendorSchema.parse({ id: "v" })).toMatchObject({
      paymentTermsDays: 30,
      archived: false,
    });
    expect(purchaseSchema.parse({ id: "b" })).toMatchObject({
      paymentStatus: "unpaid",
      lines: [],
      payments: [],
      summary: { total: "0.00", balance: "0.00" },
    });
    expect(attachmentSchema.parse({ id: "f" })).toMatchObject({ ownerType: "other", size: 0 });
    expect(gstr2bImportSchema.parse({ id: "i" })).toMatchObject({ source: "csv", rows: [] });
    expect(gstr2bMatchSchema.parse({ id: "m", importId: "i", rowId: "r" }).status).toBe(
      "unmatched",
    );
    expect(periodInputSchema.parse({ id: "2026-10", periodKey: "2026-10" }).values).toEqual({});
    expect(annualInputSchema.parse({ id: "FY2026-27" })).toMatchObject({
      gstr9c: { checklist: {} },
      pnl: { openingStock: "" },
    });
  });

  it("reject malformed keys", () => {
    expect(periodInputSchema.safeParse({ id: "x", periodKey: "October" }).success).toBe(false);
    expect(annualInputSchema.safeParse({ id: "2026" }).success).toBe(false);
    expect(amendmentSchema.safeParse({ id: "a", originalPeriodKey: "nope" }).success).toBe(false);
  });

  it("old settings gain the new defaults without changing existing values", () => {
    const old = { profile: { name: "Old Co" }, gst: { defaultRate: "12" } };
    const s = settingsSchema.parse(old);
    expect(s.profile.name).toBe("Old Co");
    expect(s.gst.defaultRate).toBe("12");
    expect(s.payments.receiptPrefix).toBe("RCT");
    expect(s.eInvoice.turnoverThreshold).toBe("50000000");
    expect(s.recurring.generateOnOpen).toBe(true);
    expect(s.recurring.defaultAutoIssue).toBe(false);
    expect(s.attachments).toEqual({ maxFileKb: 2048, warnTotalMb: 100, includeInBackup: true });
    expect(s.purchases.defaultPaymentDays).toBe(30);
    expect(DEFAULT_SETTINGS.attachments.maxFileKb).toBe(2048);
  });

  it("invoice schema v2 data without the new e-invoice fields still parses", () => {
    const parsed = invoiceSchema.parse({
      id: "inv1",
      schemaVersion: 2,
      eInvoice: { irn: "abc", ackNo: "1", ackDate: "2026-10-01T00:00:00Z", status: "generated" },
    });
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.eInvoice).toMatchObject({ irn: "abc", qr: "", exportedAt: "", cancelledAt: "" });
  });
});

describe("Phase 2-4 CRUD", () => {
  it("payments: save, get, list by invoice, delete, audit", async () => {
    const p = await savePayment({
      invoiceId: "inv1",
      amount: "500",
      date: "2026-10-22",
      mode: "upi",
    });
    await savePayment({ invoiceId: "inv2", amount: "100", date: "2026-10-23" });
    expect((await getPayment(p.id))?.mode).toBe("upi");
    expect(await listPaymentsForInvoice("inv1")).toHaveLength(1);
    const edited = await savePayment({ ...p, amount: "600" });
    expect(edited.createdAt).toBe(p.createdAt);
    expect((await auditFor("payment", p.id)).map((e) => e.action)).toEqual(["create", "update"]);
    await deletePayment(p.id);
    expect(await getPayment(p.id)).toBeUndefined();
    expect((await auditFor("payment", p.id)).at(-1)?.action).toBe("delete");
  });

  it("rejects invalid input before writing", async () => {
    await expect(savePayment({ date: "22/10/2026" })).rejects.toThrow();
    expect(await getDb().payments.count()).toBe(0);
  });

  it("amendments", async () => {
    const a = await saveAmendment({ originalInvoiceId: "inv1", reason: "Wrong GSTIN" });
    expect((await getAmendment(a.id))?.status).toBe("draft");
    expect(await listAmendmentsForInvoice("inv1")).toHaveLength(1);
    await deleteAmendment(a.id);
    expect(await listAmendmentsForInvoice("inv1")).toHaveLength(0);
  });

  it("recurring", async () => {
    const r = await saveRecurring({ name: "Retainer", kind: "invoice", nextRunDate: "2026-11-01" });
    expect((await getRecurring(r.id))?.name).toBe("Retainer");
    await deleteRecurring(r.id);
    expect(await getRecurring(r.id)).toBeUndefined();
  });

  it("vendors and purchases", async () => {
    const v = await saveVendor({ name: "Acme Supplies", gstin: "29ABCDE1234F1Z5" });
    expect((await getVendor(v.id))?.paymentTermsDays).toBe(30);
    const b = await savePurchase({ vendorId: v.id, billNo: "B-1", billDate: "2026-10-01" });
    expect((await getPurchase(b.id))?.billNo).toBe("B-1");
    expect((await listPurchases()).rows).toHaveLength(1);
    await deletePurchase(b.id);
    await deleteVendor(v.id);
    expect(await getVendor(v.id)).toBeUndefined();
  });

  it("attachments keep metadata and file contents together", async () => {
    const a = await saveAttachment({
      ownerType: "purchase",
      ownerId: "b1",
      name: "bill.pdf",
      mime: "application/pdf",
      size: 1234,
      data: "QUJD",
    });
    expect(await getAttachmentData(a.id)).toBe("QUJD");
    expect(await listAttachmentsFor("purchase", "b1")).toHaveLength(1);
    expect(await listAttachmentsFor("expense", "b1")).toHaveLength(0);
    expect(await attachmentUsage()).toEqual({ count: 1, bytes: 1234 });
    await deleteAttachment(a.id);
    expect(await getAttachmentData(a.id)).toBeUndefined();
    expect(await getDb().attachments.count()).toBe(0);
  });

  it("GSTR-2B imports and matches", async () => {
    const imp = await saveGstr2bImport({
      periodKey: "2026-10",
      rows: [{ id: "r1", supplierGstin: "29ABCDE1234F1Z5", docNo: "X1", taxable: "100" }],
    });
    await saveGstr2bMatch({
      importId: imp.id,
      rowId: "r1",
      targetType: "purchase",
      targetId: "b1",
    });
    expect((await getGstr2bImport(imp.id))?.rows[0].itcAvailable).toBe(true);
    expect(await listMatchesForImport(imp.id)).toHaveLength(1);
    await deleteGstr2bImportWithMatches(imp.id);
    expect(await listMatchesForImport(imp.id)).toHaveLength(0);
    expect(await getGstr2bImport(imp.id)).toBeUndefined();
  });

  it("keyed worksheets use the period / FY key as id", async () => {
    await expect(savePeriodInput({ periodKey: "2026-10" })).rejects.toThrow(/id is required/);
    const p = await savePeriodInput({
      id: "2026-10",
      periodKey: "2026-10",
      values: { "4B1": "10" },
    });
    const again = await savePeriodInput({ ...p, values: { "4B1": "20" } });
    expect(again.createdAt).toBe(p.createdAt);
    expect((await getPeriodInput("2026-10"))?.values["4B1"]).toBe("20");
    await saveAnnualInput({ id: "FY2026-27", gstr9: { "4A": "1000" } });
    expect((await getAnnualInput("FY2026-27"))?.gstr9["4A"]).toBe("1000");
  });
});

describe("clear-all and data health", () => {
  async function seedAll() {
    await savePayment({ amount: "1", invoiceId: "i" });
    await saveAmendment({ reason: "x" });
    await saveRecurring({ name: "r" });
    await saveVendor({ name: "v" });
    await savePurchase({ billNo: "1" });
    await saveAttachment({
      ownerType: "other",
      ownerId: "o",
      name: "n",
      mime: "",
      size: 1,
      data: "QQ==",
    });
    const imp = await saveGstr2bImport({ periodKey: "2026-10" });
    await saveGstr2bMatch({ importId: imp.id, rowId: "r" });
    await savePeriodInput({ id: "2026-10", periodKey: "2026-10" });
    await saveAnnualInput({ id: "FY2026-27" });
  }

  it("clearAllData empties every table including new ones", async () => {
    await seedAll();
    await clearAllData();
    for (const t of getDb().tables) {
      if (t.name === "meta") continue;
      expect(await t.count(), t.name).toBe(0);
    }
  });

  it("every Phase 2-4 table is validated and counted by the data-loss marker", () => {
    for (const t of [
      "payments",
      "amendments",
      "recurring",
      "vendors",
      "purchases",
      "attachments",
      "attachmentBlobs",
      "gstr2bImports",
      "gstr2bMatches",
      "periodInputs",
      "annualInputs",
    ] as const)
      expect(VALIDATED_TABLES).toContain(t);
    for (const t of ["payments", "purchases", "vendors", "annualInputs"] as const)
      expect(COUNTED_TABLES).toContain(t);
  });

  it("reports invalid rows in the new tables", async () => {
    await getDb().table("payments").put({ id: "bad", date: "not a date" });
    await getDb().table("vendors").put({ id: "bad2", paymentTermsDays: -5 });
    const health = await readDataHealth();
    expect(health.payments).toBe(1);
    expect(health.vendors).toBe(1);
    expect(health.purchases).toBe(0);
    expect((await readTable("payments")).invalid).toBe(1);
  });

  it("the integrity marker notices lost new-table records", async () => {
    await checkIntegrity();
    await saveVendor({ name: "v" });
    await checkIntegrity();
    await getDb().vendors.clear();
    const res = await checkIntegrity();
    expect(res.integrity).toBe("partial");
    expect(res.detail).toMatch(/vendor/);
  });
});

describe("backup v3", () => {
  const base = {
    format: "invoice-generator/backup",
    exportedAt: "2026-10-01T00:00:00.000Z",
  };

  it("round-trips every new table (replace)", async () => {
    await seedPhase();
    const backup = await buildBackup();
    expect(backup.schemaVersion).toBe(BACKUP_SCHEMA_VERSION);
    expect(BACKUP_SCHEMA_VERSION).toBe(3);
    const text = JSON.stringify(backup);
    await clearAllData();
    const parsed = parseBackup(text);
    const summary = summarizeBackup(parsed);
    expect(summary).toMatchObject({
      payments: 1,
      vendors: 1,
      purchases: 1,
      recurring: 1,
      amendments: 1,
      gstr2bImports: 1,
      attachments: 1,
    });
    await restoreBackup(parsed, "replace");
    expect(await getDb().payments.count()).toBe(1);
    expect(await getDb().periodInputs.count()).toBe(1);
    expect(await getDb().annualInputs.count()).toBe(1);
    expect(await getDb().gstr2bMatches.count()).toBe(1);
    expect(await getDb().attachmentBlobs.count()).toBe(1);
  });

  it("merge keeps the newer copy and adds missing rows", async () => {
    const v = await saveVendor({ name: "Old name" });
    const backup = await buildBackup();
    await saveVendor({ ...v, name: "Newer name" });
    await restoreBackup(backup, "merge");
    expect((await getVendor(v.id))?.name).toBe("Newer name");
    await getDb().vendors.clear();
    await restoreBackup(backup, "merge");
    expect((await getVendor(v.id))?.name).toBe("Old name");
  });

  it("can leave attachment files out of backups", async () => {
    await saveAttachment({
      ownerType: "other",
      ownerId: "o",
      name: "n",
      mime: "",
      size: 1,
      data: "QQ==",
    });
    await updateSettings((s) => ({
      ...s,
      attachments: { ...s.attachments, includeInBackup: false },
    }));
    const backup = await buildBackup();
    expect(backup.data.attachments).toEqual([]);
    expect(backup.data.attachmentBlobs).toEqual([]);
  });

  it("restores v1 backups (new tables default to empty)", async () => {
    await saveVendor({ name: "wiped by replace" });
    const v1 = {
      ...base,
      schemaVersion: 1,
      data: { settings: { profile: { name: "Legacy Co" } }, customers: [{ id: "c1", name: "A" }] },
    };
    const parsed = parseBackup(JSON.stringify(v1));
    expect(parsed.data.payments).toEqual([]);
    expect(parsed.data.attachmentBlobs).toEqual([]);
    await restoreBackup(parsed, "replace");
    expect((await loadSettings()).profile.name).toBe("Legacy Co");
    expect(await getDb().customers.count()).toBe(1);
    expect(await getDb().vendors.count()).toBe(0);
    expect((await loadSettings()).payments.receiptPrefix).toBe("RCT");
  });

  it("restores v2 backups", async () => {
    const v2 = {
      ...base,
      schemaVersion: 2,
      data: {
        settings: { profile: { name: "V2 Co" } },
        expenses: [{ id: "e1", amount: "100", date: "2026-09-01" }],
        filings: [],
        auditLog: [],
      },
    };
    const parsed = parseBackup(JSON.stringify(v2));
    expect(parsed.schemaVersion).toBe(3);
    await restoreBackup(parsed, "replace");
    expect(await getDb().expenses.count()).toBe(1);
    expect(await getDb().purchases.count()).toBe(0);
  });

  it("rejects backups from a newer app version", () => {
    expect(() => parseBackup(JSON.stringify({ ...base, schemaVersion: 4, data: {} }))).toThrow(
      /newer version/,
    );
  });

  it("never exports security settings", async () => {
    await updateSettings((s) => ({
      ...s,
      security: { ...s.security, pinEnabled: true, pinHash: "SECRET-H", pinSalt: "SECRET-S" },
    }));
    expect(JSON.stringify(await buildBackup())).not.toContain("SECRET-H");
  });

  async function seedPhase() {
    await savePayment({ amount: "1", invoiceId: "i" });
    await saveAmendment({ reason: "x" });
    await saveRecurring({ name: "r" });
    await saveVendor({ name: "v" });
    await savePurchase({ billNo: "1" });
    await saveAttachment({
      ownerType: "other",
      ownerId: "o",
      name: "n",
      mime: "",
      size: 1,
      data: "QQ==",
    });
    const imp = await saveGstr2bImport({ periodKey: "2026-10" });
    await saveGstr2bMatch({ importId: imp.id, rowId: "r" });
    await savePeriodInput({ id: "2026-10", periodKey: "2026-10" });
    await saveAnnualInput({ id: "FY2026-27" });
  }
});
