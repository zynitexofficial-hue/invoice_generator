import { newId } from "@/lib/invoice-factory";
import {
  filingId,
  filingSchema,
  returnSnapshotSchema,
  type Filing,
  type ReturnSnapshot,
} from "@/lib/schema";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { guardedWrite } from "./write";

export type FilingInput = Partial<Filing> & Pick<Filing, "periodKey" | "periodKind" | "returnType">;

const FILING_AUDIT_FIELDS: AuditFields<Filing> = {
  status: (f) => f.status,
  arn: (f) => f.arn,
  filedAt: (f) => f.filedAt,
  exportedAt: (f) => f.exportedAt,
  lateFee: (f) => f.lateFee,
  interest: (f) => f.interest,
};

export async function getFiling(id: string): Promise<Filing | undefined> {
  const raw = await getDb().filings.get(id);
  if (!raw) return undefined;
  const parsed = filingSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Create or update the tracker row for one return and period. The id is
 * always `${periodKey}:${returnType}`; fields not given keep their stored values.
 */
export async function upsertFiling(input: FilingInput): Promise<Filing> {
  const id = filingId(input.periodKey, input.returnType);
  const db = getDb();
  return guardedWrite("the filing status", () =>
    db.transaction("rw", [db.filings, db.auditLog], async () => {
      const existing = await getFiling(id);
      const now = new Date().toISOString();
      const record = filingSchema.parse({
        ...existing,
        ...input,
        id,
        createdAt: existing?.createdAt || input.createdAt || now,
        updatedAt: now,
      });
      await db.filings.put(record);
      const changes = diffFields(existing, record, FILING_AUDIT_FIELDS);
      if (!existing || changes.length)
        await logAudit({
          entity: "filing",
          entityId: id,
          action: existing ? "update" : "create",
          summary: `${input.returnType} ${input.periodKey}: ${record.status.replace("_", " ")}`,
          changes,
        });
      return record;
    }),
  );
}

export type SnapshotInput = Omit<ReturnSnapshot, "id" | "createdAt" | "generatedAt"> &
  Partial<Pick<ReturnSnapshot, "id" | "createdAt" | "generatedAt">>;

/** Store a snapshot (per-record hashes and totals) of a return as exported/filed. */
export async function saveSnapshot(input: SnapshotInput): Promise<ReturnSnapshot> {
  const now = new Date().toISOString();
  const record = returnSnapshotSchema.parse({
    ...input,
    id: input.id || newId(),
    generatedAt: input.generatedAt || now,
    createdAt: input.createdAt || now,
  });
  await guardedWrite("the return snapshot", () => getDb().returnSnapshots.put(record));
  return record;
}

/** Most recent snapshot for a filing (by createdAt), if any. */
export async function latestSnapshot(filingIdValue: string): Promise<ReturnSnapshot | undefined> {
  const rows = await getDb()
    .returnSnapshots.where("filingId")
    .equals(filingIdValue)
    .sortBy("createdAt");
  for (let i = rows.length - 1; i >= 0; i--) {
    const parsed = returnSnapshotSchema.safeParse(rows[i]);
    if (parsed.success) return parsed.data;
  }
  return undefined;
}
