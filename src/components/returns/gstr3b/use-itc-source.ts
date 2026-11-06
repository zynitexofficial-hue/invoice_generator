"use client";

import { useMemo } from "react";
import { useExpenses } from "@/db/hooks";
import { expensesItcSource, type ItcSource } from "@/lib/gst/gstr3b";

/**
 * INTEGRATION POINT for purchase bills.
 *
 * Today the GSTR-3B worksheet reads purchase-side tax from GST expenses only.
 * When Feature D's purchase selector lands, combine it here, e.g.
 *
 *   const purchases = usePurchases();
 *   return combineItcSources(purchasesItcSource(purchases), expensesItcSource(expenses)),
 *   and drop expense lines posted from a bill with `withoutLinkedExpenses`.
 *
 * Every consumer (3B worksheet, ITC tab) goes through this one hook.
 */
export function useItcSource(): ItcSource | undefined {
  const expenses = useExpenses();
  return useMemo(() => (expenses ? expensesItcSource(expenses) : undefined), [expenses]);
}
