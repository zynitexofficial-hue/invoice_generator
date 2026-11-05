import type { Recurring } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";

/**
 * [C] Recurring templates — owner: feature C.
 * Extend with next-run calculation and the generate-due-documents routine.
 */

export type RecurringInput = DeepPartial<Recurring>;

export const recurringCrud = defineCrud({
  table: "recurring",
  entity: "recurring",
  what: "the recurring template",
  describe: (r) => `recurring ${r.kind} ${r.name}`.trim(),
  auditFields: {
    name: (r) => r.name,
    kind: (r) => r.kind,
    active: (r) => String(r.active),
    frequency: (r) => r.frequency,
    interval: (r) => String(r.interval),
    nextRunDate: (r) => r.nextRunDate,
    endDate: (r) => r.endDate,
  },
});

export const saveRecurring = recurringCrud.save;
export const getRecurring = recurringCrud.get;
export const deleteRecurring = recurringCrud.remove;
export const listRecurring = recurringCrud.list;
