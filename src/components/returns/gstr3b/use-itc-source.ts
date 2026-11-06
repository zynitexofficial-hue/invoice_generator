"use client";

import { useMemo } from "react";
import { useExpenses, usePurchases } from "@/db/hooks";
import {
  combineItcSources,
  expensesItcSource,
  purchasesItcSource,
  withoutLinkedExpenses,
  type ItcSource,
} from "@/lib/gst/gstr3b";

/**
 * The one place the GSTR-3B worksheet, the ITC tab and the 2B matcher get
 * purchase-side tax: purchase bills plus GST expenses. An expense that was
 * posted from a bill is dropped, so the same tax is never counted twice.
 */
export function useItcSource(): ItcSource | undefined {
  const expenses = useExpenses();
  const purchases = usePurchases();
  return useMemo(() => {
    if (!expenses || !purchases) return undefined;
    const combined = combineItcSources(purchasesItcSource(purchases), expensesItcSource(expenses));
    return (periodKey: string) => withoutLinkedExpenses(combined(periodKey), purchases);
  }, [expenses, purchases]);
}
