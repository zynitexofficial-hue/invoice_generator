import { newId } from "@/lib/invoice-factory";
import {
  auditEntrySchema,
  type AuditAction,
  type AuditChange,
  type AuditEntity,
  type AuditEntry,
} from "@/lib/schema";
import { getDb } from "./db";

/**
 * Local, append-only change log (spec A11).
 *
 * Writes are best effort: a failing audit write never fails the user's save.
 * Call logAudit inside the same Dexie transaction as the change (include
 * `db.auditLog` in the transaction's tables) so both land together.
 *
 * Bursts of autosave "update"s to the same record within COALESCE_MS are
 * folded into the latest update entry (first "from", latest "to"), so typing
 * doesn't flood the log.
 */

export const COALESCE_MS = 5 * 60 * 1000;
const MAX_CHANGES = 30;
const MAX_VALUE = 200;

export interface AuditInput {
  entity: AuditEntity;
  entityId: string;
  action: AuditAction;
  summary?: string;
  changes?: AuditChange[];
  /** ISO timestamp; defaults to now. */
  at?: string;
}

const clip = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

export function buildAuditEntry(input: AuditInput): AuditEntry {
  return auditEntrySchema.parse({
    id: newId(),
    entity: input.entity,
    entityId: input.entityId,
    action: input.action,
    at: input.at ?? new Date().toISOString(),
    summary: clip(input.summary ?? "", 500),
    changes: (input.changes ?? []).slice(0, MAX_CHANGES).map((c) => ({
      field: clip(c.field, 60),
      from: clip(c.from, MAX_VALUE),
      to: clip(c.to, MAX_VALUE),
    })),
  });
}

/** Field → value extractors used to build a short diff. */
export type AuditFields<T> = Record<string, (record: T) => string>;

/** Changed whitelisted fields between two versions (prev undefined = all fields "from" ""). */
export function diffFields<T>(
  prev: T | undefined,
  next: T | undefined,
  fields: AuditFields<T>,
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const [field, get] of Object.entries(fields)) {
    const from = prev ? get(prev) : "";
    const to = next ? get(next) : "";
    if (from !== to) changes.push({ field, from, to });
  }
  return changes;
}

function mergeChanges(older: AuditChange[], newer: AuditChange[]): AuditChange[] {
  const byField = new Map<string, AuditChange>();
  for (const c of older) byField.set(c.field, { ...c });
  for (const c of newer) {
    const existing = byField.get(c.field);
    byField.set(c.field, existing ? { ...existing, to: c.to } : { ...c });
  }
  return [...byField.values()].filter((c) => c.from !== c.to).slice(0, MAX_CHANGES);
}

/** Append an audit entry. Never throws. */
export async function logAudit(input: AuditInput): Promise<AuditEntry | undefined> {
  try {
    const db = getDb();
    const entry = buildAuditEntry(input);
    if (entry.action === "update") {
      const latest = (await db.auditLog.where("entityId").equals(entry.entityId).sortBy("at"))
        .filter((e) => e.entity === entry.entity)
        .at(-1);
      if (
        latest?.action === "update" &&
        Date.parse(entry.at) - Date.parse(latest.at) < COALESCE_MS
      ) {
        const merged: AuditEntry = {
          ...latest,
          at: entry.at,
          summary: entry.summary || latest.summary,
          changes: mergeChanges(latest.changes, entry.changes),
        };
        await db.auditLog.put(merged);
        return merged;
      }
    }
    await db.auditLog.add(entry);
    return entry;
  } catch {
    return undefined;
  }
}

/** Audit entries for one record, oldest first. Invalid rows are skipped. */
export async function auditFor(entity: AuditEntity, entityId: string): Promise<AuditEntry[]> {
  const rows = await getDb().auditLog.where("entityId").equals(entityId).sortBy("at");
  return rows.flatMap((r) => {
    const parsed = auditEntrySchema.safeParse(r);
    return parsed.success && parsed.data.entity === entity ? [parsed.data] : [];
  });
}
