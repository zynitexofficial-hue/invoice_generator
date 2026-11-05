import type { z } from "zod";
import { nowISO } from "@/lib/dates";
import { newId } from "@/lib/invoice-factory";
import type { AuditEntity } from "@/lib/schema";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { readTable, TABLE_SCHEMAS, type ParsedRows } from "./read";
import { guardedWrite } from "./write";

/**
 * Typed CRUD factory for the Phase 2-4 tables. Every write goes through
 * guardedWrite and (when `entity` is set) the audit log, in one transaction —
 * the same shape as expenses.ts. Feature code adds its own domain functions in
 * its own src/db/<table>.ts and builds on the `crud` object it exports.
 */

/** Tables with `id`, `createdAt` and `updatedAt` handled by the factory. */
export type CrudTable =
  | "payments"
  | "amendments"
  | "recurring"
  | "vendors"
  | "purchases"
  | "attachments"
  | "gstr2bImports"
  | "gstr2bMatches"
  | "periodInputs"
  | "annualInputs";

export type CrudRow<K extends CrudTable> = z.infer<(typeof TABLE_SCHEMAS)[K]>;

/** Input for save(): every field (and nested field) optional — defaults fill the rest. */
export type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

interface Stamped {
  id: string;
  createdAt: string;
  updatedAt: string;
}

export interface CrudConfig<K extends CrudTable> {
  table: K;
  /** Audit entity; omit for high-volume derived rows that shouldn't flood the log. */
  entity?: AuditEntity;
  /** "the payment" — shown in the storage error dialog. */
  what: string;
  /** Short description for audit summaries, e.g. "payment ₹500 · 2026-10-22". */
  describe: (record: CrudRow<K>) => string;
  auditFields?: AuditFields<CrudRow<K>>;
  /** Caller supplies the id (period key, financial-year key…) instead of a generated one. */
  keyed?: boolean;
  /** Recompute derived fields after validation (never trust them from input). */
  prepare?: (record: CrudRow<K>) => CrudRow<K>;
}

export function defineCrud<K extends CrudTable>(cfg: CrudConfig<K>) {
  type Row = CrudRow<K>;
  const schema = TABLE_SCHEMAS[cfg.table] as unknown as z.ZodType<Row>;
  const stamped = (r: Row) => r as unknown as Stamped;

  const parseOne = (raw: unknown): Row | undefined => {
    const parsed = schema.safeParse(raw);
    return parsed.success ? parsed.data : undefined;
  };

  return {
    table: cfg.table,

    /** Validate (throws a ZodError for bad input), stamp, prepare and store. */
    async save(input: DeepPartial<Row>): Promise<Row> {
      const id = (input as unknown as Partial<Stamped>).id || (cfg.keyed ? "" : newId());
      if (!id) throw new Error(`An id is required to save ${cfg.what}.`);
      const given = input as unknown as Partial<Stamped>;
      const now = nowISO();
      const validated = schema.parse({
        ...input,
        id,
        createdAt: given.createdAt || now,
        updatedAt: now,
      });
      let record = cfg.prepare ? cfg.prepare(validated) : validated;
      const db = getDb();
      const tables = [db.table(cfg.table), db.auditLog];
      await guardedWrite(cfg.what, () =>
        db.transaction("rw", tables, async () => {
          const existing = parseOne(await db.table(cfg.table).get(id));
          if (existing && !given.createdAt && stamped(existing).createdAt) {
            record = { ...record, createdAt: stamped(existing).createdAt } as Row;
          }
          await db.table(cfg.table).put(record);
          if (cfg.entity) {
            const changes = cfg.auditFields ? diffFields(existing, record, cfg.auditFields) : [];
            if (!existing || changes.length || !cfg.auditFields)
              await logAudit({
                entity: cfg.entity,
                entityId: id,
                action: existing ? "update" : "create",
                summary: `${existing ? "Edited" : "Added"} ${cfg.describe(record)}`,
                changes,
              });
          }
        }),
      );
      return record;
    },

    async get(id: string): Promise<Row | undefined> {
      const raw = await getDb().table(cfg.table).get(id);
      return raw ? parseOne(raw) : undefined;
    },

    async remove(id: string): Promise<void> {
      const db = getDb();
      await guardedWrite(
        "the change",
        () =>
          db.transaction("rw", [db.table(cfg.table), db.auditLog], async () => {
            const existing = parseOne(await db.table(cfg.table).get(id));
            await db.table(cfg.table).delete(id);
            if (cfg.entity)
              await logAudit({
                entity: cfg.entity,
                entityId: id,
                action: "delete",
                summary: existing ? `Deleted ${cfg.describe(existing)}` : `Deleted ${cfg.what}`,
                changes:
                  existing && cfg.auditFields
                    ? diffFields(existing, undefined, cfg.auditFields)
                    : [],
              });
          }),
        { deletion: true },
      );
    },

    /** All valid rows plus the count of invalid stored rows. */
    async list(): Promise<ParsedRows<Row>> {
      return readTable(cfg.table) as unknown as Promise<ParsedRows<Row>>;
    },
  };
}
