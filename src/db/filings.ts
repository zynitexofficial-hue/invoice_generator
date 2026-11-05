import { newId } from "@/lib/invoice-factory";
import { monthKey, quarterKey } from "@/lib/period";
import {
  filingId,
  filingSchema,
  returnSnapshotSchema,
  type AppSettings,
  type Filing,
  type ReturnSnapshot,
} from "@/lib/schema";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { readTable } from "./read";
import { guardedWrite } from "./write";

/* ---------------- Filed periods ---------------- */

export type FilingFrequency = AppSettings["gst"]["filingFrequency"];

/**
 * The filing row that "locks" a document date: GSTR-1 marked filed for the
 * month (monthly filers) or the FY quarter (QRMP) containing the date. QRMP
 * filers who reported the month's invoices through a filed IFF are locked too.
 * Pure — pass the filing rows you already have (e.g. from useFilings()).
 */
export function filedPeriodFor(
  filings: readonly Filing[],
  dateISO: string,
  frequency: FilingFrequency,
): Filing | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) return undefined;
  const wanted =
    frequency === "qrmp"
      ? [filingId(quarterKey(dateISO), "GSTR-1"), filingId(monthKey(dateISO), "IFF")]
      : [filingId(monthKey(dateISO), "GSTR-1")];
  return filings.find((f) => f.status === "filed" && wanted.includes(f.id));
}

/** The filed GSTR-1 (or IFF) covering a date, read from the database. */
export async function getFiledPeriodForDate(
  dateISO: string,
  frequency: FilingFrequency,
): Promise<Filing | undefined> {
  const { rows } = await readTable("filings");
  return filedPeriodFor(rows, dateISO, frequency);
}

/**
 * Whether the GSTR-1 for the month (monthly) or FY quarter (QRMP) containing
 * `dateISO` is marked filed. Documents dated in a filed period can't be
 * cancelled — correct them with a credit/debit note instead.
 */
export async function isPeriodFiledForDate(
  dateISO: string,
  frequency: FilingFrequency,
): Promise<boolean> {
  return Boolean(await getFiledPeriodForDate(dateISO, frequency));
}

/* ---------------- Tracker rows ---------------- */

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
