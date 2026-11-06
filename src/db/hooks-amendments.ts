import { useLiveQuery } from "dexie-react-hooks";
import type { ReturnSnapshot } from "@/lib/schema";
import { getDb } from "./db";
import { parseRows, TABLE_SCHEMAS } from "./read";

/**
 * [B] Live queries for amendments. Snapshots of every GSTR-1 filing, newest
 * first, used to find documents that changed after a period was filed.
 */
export function useGstr1Snapshots(): ReturnSnapshot[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().returnSnapshots.toArray();
    return parseRows(rows, TABLE_SCHEMAS.returnSnapshots)
      .rows.filter((s) => s.returnType === "GSTR-1")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, []);
}
