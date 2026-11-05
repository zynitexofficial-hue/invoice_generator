import Dexie from "dexie";
import { describe, expect, it } from "vitest";
import { DB_NAME, getDb } from "./db";

/** A database created by the previous release (Dexie v2) upgrades in place without losing rows. */
describe("Dexie v2 → v3 upgrade", () => {
  it("keeps existing tables and rows and adds the new ones", async () => {
    const old = new Dexie(DB_NAME);
    old.version(1).stores({
      settings: "id",
      customers: "id, name, updatedAt",
      items: "id, name, updatedAt",
      invoices: "id, number, docType, invoiceDate, updatedAt",
      designs: "id, name, updatedAt",
      counters: "key",
      meta: "key",
    });
    old.version(2).stores({
      expenses: "id, date, category, vendorName, updatedAt",
      incomes: "id, date, category, updatedAt",
      filings: "id, periodKey, returnType, status, updatedAt",
      returnSnapshots: "id, filingId, createdAt",
      auditLog: "id, entity, entityId, at",
    });
    await old.open();
    await old.table("customers").put({ id: "c1", name: "Acme" });
    await old.table("expenses").put({ id: "e1", date: "2026-10-01", amount: "10" });
    old.close();

    const db = getDb();
    await db.open();
    expect(db.verno).toBe(3);
    expect((await db.customers.get("c1"))?.name).toBe("Acme");
    expect((await db.expenses.get("e1"))?.amount).toBe("10");
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
    ])
      expect(db.table(t).name).toBe(t);
    expect(await db.payments.count()).toBe(0);
  });
});
