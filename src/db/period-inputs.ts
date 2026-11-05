import type { PeriodInput } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";

/**
 * [E] Manual GSTR-3B worksheet inputs, one row per period — owner: feature E.
 * `id` is the period key (e.g. "2026-10"), so save({ id, periodKey, ... }).
 */

export type PeriodInputInput = DeepPartial<PeriodInput>;

export const periodInputsCrud = defineCrud({
  table: "periodInputs",
  entity: "periodInput",
  what: "the return worksheet",
  keyed: true,
  describe: (p) => `return worksheet ${p.periodKey}`,
});

export const savePeriodInput = periodInputsCrud.save;
export const getPeriodInput = periodInputsCrud.get;
export const deletePeriodInput = periodInputsCrud.remove;
export const listPeriodInputs = periodInputsCrud.list;
