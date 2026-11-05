import { computeExpenseSummary } from "@/lib/expense-calc";
import { newId } from "@/lib/invoice-factory";
import { expenseSchema, type Expense } from "@/lib/schema";
import { diffFields, logAudit, type AuditFields } from "./audit";
import { getDb } from "./db";
import { readTable, type ParsedRows } from "./read";
import { guardedWrite } from "./write";

export { computeExpenseSummary, suggestGstMode } from "@/lib/expense-calc";

export type ExpenseInput = Partial<Expense>;

const EXPENSE_AUDIT_FIELDS: AuditFields<Expense> = {
  date: (e) => e.date,
  vendorName: (e) => e.vendorName,
  vendorGstin: (e) => e.vendorGstin,
  category: (e) => e.category,
  amount: (e) => e.amount,
  gstRate: (e) => e.gstRate,
  gstMode: (e) => e.gstMode,
  itcEligible: (e) => String(e.itcEligible),
  "summary.total": (e) => e.summary.total,
};

const describe = (e: Expense) =>
  `expense ${[e.vendorName || e.category, e.date].filter(Boolean).join(" · ")}`.trim();

/** Validate, compute the summary (never trusted from input), stamp and store an expense. */
export async function saveExpense(input: ExpenseInput): Promise<Expense> {
  const now = new Date().toISOString();
  const parsed = expenseSchema.parse({
    ...input,
    id: input.id || newId(),
    createdAt: input.createdAt || now,
    updatedAt: now,
  });
  const record: Expense = { ...parsed, summary: computeExpenseSummary(parsed) };
  const db = getDb();
  await guardedWrite("the expense", () =>
    db.transaction("rw", [db.expenses, db.auditLog], async () => {
      const raw = await db.expenses.get(record.id);
      const existing = raw ? expenseSchema.safeParse(raw).data : undefined;
      await db.expenses.put(record);
      await logAudit({
        entity: "expense",
        entityId: record.id,
        action: existing ? "update" : "create",
        summary: `${existing ? "Edited" : "Added"} ${describe(record)}`,
        changes: diffFields(existing, record, EXPENSE_AUDIT_FIELDS),
      });
    }),
  );
  return record;
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  const raw = await getDb().expenses.get(id);
  if (!raw) return undefined;
  const parsed = expenseSchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export async function deleteExpense(id: string) {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.expenses, db.auditLog], async () => {
        const raw = await db.expenses.get(id);
        const existing = raw ? expenseSchema.safeParse(raw).data : undefined;
        await db.expenses.delete(id);
        await logAudit({
          entity: "expense",
          entityId: id,
          action: "delete",
          summary: existing ? `Deleted ${describe(existing)}` : "Deleted expense",
          changes: existing ? diffFields(existing, undefined, EXPENSE_AUDIT_FIELDS) : [],
        });
      }),
    { deletion: true },
  );
}

/** All valid expenses plus the count of invalid stored rows. */
export async function listExpenses(): Promise<ParsedRows<Expense>> {
  return readTable("expenses");
}
