"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { todayISO } from "@/lib/dates";
import { listRecurring, summarizeDue, type DueSummary } from "./recurring";

/** [C] Recurring items due today or earlier (live). `undefined` while loading. */
export function useDueRecurring(): DueSummary | undefined {
  return useLiveQuery(async () => {
    const { rows } = await listRecurring();
    return summarizeDue(rows, todayISO());
  }, []);
}
