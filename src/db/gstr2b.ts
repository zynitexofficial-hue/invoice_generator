import type { Gstr2bImport, Gstr2bMatch } from "@/lib/schema";
import { defineCrud, type DeepPartial } from "./crud";
import { getDb } from "./db";
import { parseRows, TABLE_SCHEMAS } from "./read";
import { guardedWrite } from "./write";

/**
 * [E] GSTR-2B imports and matches — owner: feature E.
 * Matches are derived rows, so they are not written to the audit log.
 */

export type Gstr2bImportInput = DeepPartial<Gstr2bImport>;
export type Gstr2bMatchInput = DeepPartial<Gstr2bMatch>;

export const gstr2bImportsCrud = defineCrud({
  table: "gstr2bImports",
  entity: "gstr2b",
  what: "the GSTR-2B import",
  describe: (i) => `GSTR-2B ${i.periodKey} (${i.rows.length} rows)`,
  auditFields: {
    periodKey: (i) => i.periodKey,
    source: (i) => i.source,
    fileName: (i) => i.fileName,
    rows: (i) => String(i.rows.length),
  },
});

export const gstr2bMatchesCrud = defineCrud({
  table: "gstr2bMatches",
  what: "the match",
  describe: (m) => `match ${m.rowId}`,
});

export const saveGstr2bImport = gstr2bImportsCrud.save;
export const getGstr2bImport = gstr2bImportsCrud.get;
export const deleteGstr2bImport = gstr2bImportsCrud.remove;
export const listGstr2bImports = gstr2bImportsCrud.list;

export const saveGstr2bMatch = gstr2bMatchesCrud.save;
export const getGstr2bMatch = gstr2bMatchesCrud.get;
export const deleteGstr2bMatch = gstr2bMatchesCrud.remove;
export const listGstr2bMatches = gstr2bMatchesCrud.list;

/** Valid matches of one import. */
export async function listMatchesForImport(importId: string): Promise<Gstr2bMatch[]> {
  const rows = await getDb().gstr2bMatches.where("importId").equals(importId).toArray();
  return parseRows(rows, TABLE_SCHEMAS.gstr2bMatches).rows;
}

/** Delete an import together with all of its matches. */
export async function deleteGstr2bImportWithMatches(importId: string): Promise<void> {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.gstr2bImports, db.gstr2bMatches], async () => {
        await db.gstr2bMatches.where("importId").equals(importId).delete();
        await db.gstr2bImports.delete(importId);
      }),
    { deletion: true },
  );
}
