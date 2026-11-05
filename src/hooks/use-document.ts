"use client";

import { useMemo } from "react";
import { computeTotals } from "@/lib/invoice-calc";
import { buildViewModel } from "@/lib/render/view-model";
import type { AppSettings, Invoice } from "@/lib/schema";

/** Totals + render-ready view model for an invoice, memoised on its identity. */
export function useDocumentModel(
  invoice: Invoice | null | undefined,
  settings: AppSettings | undefined,
) {
  return useMemo(() => {
    if (!invoice || !settings) return null;
    const totals = computeTotals(invoice);
    const vm = buildViewModel(invoice, totals, invoice.design.customization, {
      dateFormat: settings.formats.dateFormat,
      grouping: settings.formats.numberGrouping,
      upiIncludeAmount: settings.upi.includeAmount,
    });
    return { totals, vm };
  }, [invoice, settings]);
}
