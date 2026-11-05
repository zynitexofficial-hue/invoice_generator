import type { AnnualInput } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";

/**
 * [F] Manual annual inputs (GSTR-9 / 9C / GSTR-4 / P&L), one row per
 * financial year — owner: feature F. `id` is the FY key ("FY2026-27").
 */

export type AnnualInputInput = DeepPartial<AnnualInput>;

export const annualInputsCrud = defineCrud({
  table: "annualInputs",
  entity: "annualInput",
  what: "the annual worksheet",
  keyed: true,
  describe: (a) => `annual worksheet ${a.id}`,
});

export const saveAnnualInput = annualInputsCrud.save;
export const getAnnualInput = annualInputsCrud.get;
export const deleteAnnualInput = annualInputsCrud.remove;
export const listAnnualInputs = annualInputsCrud.list;
