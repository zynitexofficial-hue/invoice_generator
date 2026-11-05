import { newId } from "@/lib/invoice-factory";
import { incomeSchema, type Income } from "@/lib/schema";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { readTable, type ParsedRows } from "./read";
import { guardedWrite } from "./write";

export type IncomeInput = Partial<Income>;

const INCOME_AUDIT_FIELDS: AuditFields<Income> = {
  date: (i) => i.date,
  source: (i) => i.source,
  category: (i) => i.category,
  amount: (i) => i.amount,
};

const describe = (i: Income) =>
  `income ${[i.source || i.category, i.date].filter(Boolean).join(" · ")}`.trim();

export async function saveIncome(input: IncomeInput): Promise<Income> {
  const now = new Date().toISOString();
  const record = incomeSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  const db = getDb();
  await guardedWrite("the income entry", () =>
    db.transaction("rw", [db.incomes, db.auditLog], async () => {
      const raw = await db.incomes.get(record.id);
      const existing = raw ? incomeSchema.safeParse(raw).data : undefined;
      await db.incomes.put(record);
      await logAudit({
        entity: "income",
        entityId: record.id,
        action: existing ? "update" : "create",
        summary: `${existing ? "Edited" : "Added"} ${describe(record)}`,
        changes: diffFields(existing, record, INCOME_AUDIT_FIELDS),
      });
    }),
  );
  return record;
}

export async function getIncome(id: string): Promise<Income | undefined> {
  const raw = await getDb().incomes.get(id);
  if (!raw) return undefined;
  const parsed = incomeSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function deleteIncome(id: string) {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.incomes, db.auditLog], async () => {
        const raw = await db.incomes.get(id);
        const existing = raw ? incomeSchema.safeParse(raw).data : undefined;
        await db.incomes.delete(id);
        await logAudit({
          entity: "income",
          entityId: id,
          action: "delete",
          summary: existing ? `Deleted ${describe(existing)}` : "Deleted income entry",
          changes: existing ? diffFields(existing, undefined, INCOME_AUDIT_FIELDS) : [],
        });
      }),
    { deletion: true },
  );
}

export async function listIncomes(): Promise<ParsedRows<Income>> {
  return readTable("incomes");
}
