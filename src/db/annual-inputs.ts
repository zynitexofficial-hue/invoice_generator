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

type NumberGroup = "gstr9" | "gstr4";
type ValueGroup = "gstr9cValues";

/**
 * Set (or clear, with "") one manual number of a financial year's worksheet.
 * `save` replaces the whole row, so this reads the current row first.
 * Groups: "gstr9" and "gstr4" store under `gstr9` / `gstr4.values`;
 * "gstr9cValues" stores under `gstr9c.values`.
 */
export async function setAnnualValue(
  fyKey: string,
  group: NumberGroup | ValueGroup,
  key: string,
  value: string,
): Promise<void> {
  const current = (await getAnnualInput(fyKey)) ?? undefined;
  const base: AnnualInputInput = current ?? { id: fyKey };
  const apply = (map: Record<string, string> | undefined) => {
    const next = { ...map };
    if (value.trim() === "") delete next[key];
    else next[key] = value.trim();
    return next;
  };
  if (group === "gstr9")
    await saveAnnualInput({ ...base, id: fyKey, gstr9: apply(current?.gstr9) });
  else if (group === "gstr4")
    await saveAnnualInput({
      ...base,
      id: fyKey,
      gstr4: { ...current?.gstr4, values: apply(current?.gstr4.values) },
    });
  else
    await saveAnnualInput({
      ...base,
      id: fyKey,
      gstr9c: { ...current?.gstr9c, values: apply(current?.gstr9c.values) },
    });
}

/** Merge a patch into one nested group (gstr9c checklist/notes, gstr4 notes, pnl, taxPack). */
export async function patchAnnualGroup<G extends "gstr9c" | "gstr4" | "pnl" | "taxPack">(
  fyKey: string,
  group: G,
  patch: DeepPartial<AnnualInput[G]>,
): Promise<void> {
  const current = (await getAnnualInput(fyKey)) ?? undefined;
  const base: AnnualInputInput = current ?? { id: fyKey };
  await saveAnnualInput({
    ...base,
    id: fyKey,
    [group]: { ...(current?.[group] as object | undefined), ...(patch as object) },
  } as AnnualInputInput);
}

/** Remove every GSTR-9 override of a row ("4B.taxable", "4B.igst"…). */
export async function resetGstr9Row(fyKey: string, rowId: string): Promise<void> {
  const current = await getAnnualInput(fyKey);
  if (!current) return;
  const next = Object.fromEntries(
    Object.entries(current.gstr9).filter(([k]) => !k.startsWith(`${rowId}.`)),
  );
  await saveAnnualInput({ ...current, gstr9: next });
}
