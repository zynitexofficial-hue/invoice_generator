"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  settingsSchema,
  type AppSettings,
  type AuditEntity,
  type AuditEntry,
  type Expense,
  type Amendment,
  type AnnualInput,
  type Attachment,
  type AttachmentOwnerType,
  type Filing,
  type Gstr2bImport,
  type Gstr2bMatch,
  type Income,
  type Invoice,
  type PaymentEntry,
  type PeriodInput,
  type Purchase,
  type Recurring,
  type ReturnSnapshot,
  type Vendor,
} from "@/lib/schema";
import { auditFor } from "./audit";
import { getDb } from "./db";
import { parseRows, readDataHealth, readTable, TABLE_SCHEMAS, type DataHealth } from "./read";

/** Live settings with defaults applied. `undefined` while loading. */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => {
    const raw = await getDb().settings.get("app");
    const parsed = settingsSchema.safeParse(raw ?? {});
    return parsed.success ? parsed.data : settingsSchema.parse({});
  }, []);
}

export function useCustomers() {
  return useLiveQuery(() => getDb().customers.orderBy("name").toArray(), []);
}

export function useItems() {
  return useLiveQuery(() => getDb().items.orderBy("name").toArray(), []);
}

export function useDesigns() {
  return useLiveQuery(() => getDb().designs.orderBy("updatedAt").reverse().toArray(), []);
}

/**
 * All valid invoices, most recently edited first. Rows that fail validation
 * are left out here and counted by useDataHealth().
 */
export function useInvoices(): Invoice[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().invoices.orderBy("updatedAt").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.invoices).rows;
  }, []);
}

/** Valid expenses, newest date first (invalid rows: see useDataHealth). */
export function useExpenses(): Expense[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().expenses.orderBy("date").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.expenses).rows;
  }, []);
}

/** Valid other-income entries, newest date first. */
export function useIncomes(): Income[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().incomes.orderBy("date").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.incomes).rows;
  }, []);
}

/** All filing tracker rows. */
export function useFilings(): Filing[] | undefined {
  return useLiveQuery(async () => (await readTable("filings")).rows, []);
}

/** Snapshots of one filing, newest first. */
export function useReturnSnapshots(filingId: string | undefined): ReturnSnapshot[] | undefined {
  return useLiveQuery(async () => {
    if (!filingId) return [];
    const rows = await getDb()
      .returnSnapshots.where("filingId")
      .equals(filingId)
      .sortBy("createdAt");
    return parseRows(rows, TABLE_SCHEMAS.returnSnapshots).rows.reverse();
  }, [filingId]);
}

/** Change history of one record, oldest first. */
export function useAudit(entity: AuditEntity, id: string | undefined): AuditEntry[] | undefined {
  return useLiveQuery(async () => (id ? auditFor(entity, id) : []), [entity, id]);
}

/* ---------------- Phase 2-4 live queries ---------------- */
/* Invalid rows are left out here and counted by useDataHealth(). */

/** [A] All payments, newest date first. */
export function usePayments(): PaymentEntry[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().payments.orderBy("date").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.payments).rows;
  }, []);
}

/** [A] Payments against one invoice, oldest first. */
export function usePaymentsForInvoice(invoiceId: string | undefined): PaymentEntry[] | undefined {
  return useLiveQuery(async () => {
    if (!invoiceId) return [];
    const rows = await getDb().payments.where("invoiceId").equals(invoiceId).sortBy("date");
    return parseRows(rows, TABLE_SCHEMAS.payments).rows;
  }, [invoiceId]);
}

/** [B] All amendments, most recently edited first. */
export function useAmendments(): Amendment[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().amendments.orderBy("updatedAt").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.amendments).rows;
  }, []);
}

/** [C] All recurring templates, soonest next run first. */
export function useRecurring(): Recurring[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().recurring.orderBy("nextRunDate").toArray();
    return parseRows(rows, TABLE_SCHEMAS.recurring).rows;
  }, []);
}

/** [D] All vendors by name. */
export function useVendors(): Vendor[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().vendors.orderBy("name").toArray();
    return parseRows(rows, TABLE_SCHEMAS.vendors).rows;
  }, []);
}

/** [D] All purchase bills, newest bill date first. */
export function usePurchases(): Purchase[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().purchases.orderBy("billDate").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.purchases).rows;
  }, []);
}

/** [D] Attachments of one record (metadata only), oldest first. */
export function useAttachments(
  ownerType: AttachmentOwnerType,
  ownerId: string | undefined,
): Attachment[] | undefined {
  return useLiveQuery(async () => {
    if (!ownerId) return [];
    const rows = await getDb().attachments.where("ownerId").equals(ownerId).sortBy("createdAt");
    return parseRows(rows, TABLE_SCHEMAS.attachments).rows.filter((a) => a.ownerType === ownerType);
  }, [ownerType, ownerId]);
}

/** [E] All GSTR-2B imports, newest period first. */
export function useGstr2bImports(): Gstr2bImport[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().gstr2bImports.orderBy("periodKey").reverse().toArray();
    return parseRows(rows, TABLE_SCHEMAS.gstr2bImports).rows;
  }, []);
}

/** [E] Matches of one import (all matches when no import id is given). */
export function useGstr2bMatches(importId?: string): Gstr2bMatch[] | undefined {
  return useLiveQuery(async () => {
    const table = getDb().gstr2bMatches;
    const rows = importId
      ? await table.where("importId").equals(importId).toArray()
      : await table.toArray();
    return parseRows(rows, TABLE_SCHEMAS.gstr2bMatches).rows;
  }, [importId]);
}

/** [E] Manual GSTR-3B worksheet inputs for a period (undefined while loading, null when none). */
export function usePeriodInput(periodKey: string | undefined): PeriodInput | null | undefined {
  return useLiveQuery(async () => {
    if (!periodKey) return null;
    const raw = await getDb().periodInputs.get(periodKey);
    const parsed = raw ? TABLE_SCHEMAS.periodInputs.safeParse(raw) : undefined;
    return parsed?.success ? parsed.data : null;
  }, [periodKey]);
}

/** [F] Manual annual inputs for a financial year (undefined while loading, null when none). */
export function useAnnualInput(fyKey: string | undefined): AnnualInput | null | undefined {
  return useLiveQuery(async () => {
    if (!fyKey) return null;
    const raw = await getDb().annualInputs.get(fyKey);
    const parsed = raw ? TABLE_SCHEMAS.annualInputs.safeParse(raw) : undefined;
    return parsed?.success ? parsed.data : null;
  }, [fyKey]);
}

/** Number of stored rows per table that fail validation (spec A8). */
export function useDataHealth(): DataHealth | undefined {
  return useLiveQuery(() => readDataHealth(), []);
}

export function useMetaValue<T>(key: string): T | undefined {
  return useLiveQuery(async () => (await getDb().meta.get(key))?.value as T | undefined, [key]);
}
