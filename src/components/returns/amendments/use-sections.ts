import { useMemo } from "react";
import {
  amendmentsForPeriod,
  b2csMonthsNeeded,
  buildAmendmentSections,
  type AmendmentSections,
} from "@/lib/gst/amendments";
import { buildGstr1, type B2csRow } from "@/lib/gst/returns";
import type { Amendment, AppSettings, Invoice } from "@/lib/schema";

export const READY_ONLY: readonly Amendment["status"][] = ["ready"];
export const DRAFT_AND_READY: readonly Amendment["status"][] = ["draft", "ready"];

/**
 * Amendment sections for one return period. B2CS amendments need the current
 * B2CS totals of each original month, so GSTR-1 is built for those months only.
 */
export function useAmendmentSections(
  amendments: Amendment[] | undefined,
  period: string,
  invoices: Invoice[],
  settings: AppSettings,
  statuses: readonly Amendment["status"][] = READY_ONLY,
): { sections: AmendmentSections; included: Amendment[] } {
  return useMemo(() => {
    const included = amendmentsForPeriod(amendments ?? [], period, statuses);
    const b2csByMonth = new Map<string, B2csRow[]>();
    for (const month of b2csMonthsNeeded(included))
      b2csByMonth.set(month, buildGstr1({ invoices, settings, periodKey: month }).sections.b2cs);
    return { sections: buildAmendmentSections({ amendments: included, b2csByMonth }), included };
  }, [amendments, period, invoices, settings, statuses]);
}
