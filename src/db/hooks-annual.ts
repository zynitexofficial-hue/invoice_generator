"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { ReturnSnapshot } from "@/lib/schema";
import { parseRows } from "./read";
import { getDb } from "./db";
import { TABLE_SCHEMAS } from "./read";

/** [F] Every saved return snapshot (the tax pack reconciles books against filed totals). */
export function useAllReturnSnapshots(): ReturnSnapshot[] | undefined {
  return useLiveQuery(async () => {
    const rows = await getDb().returnSnapshots.toArray();
    return parseRows(rows, TABLE_SCHEMAS.returnSnapshots).rows;
  }, []);
}
