import type { Formatters } from "./gstr1-tab";
import type { FilingItem } from "./filing-tab";
import type { usePrintSummary } from "./print-portal";
import type { buildGstr1, buildGstr3b } from "@/lib/gst/returns";
import type { AppSettings, Expense, Filing, Invoice } from "@/lib/schema";

/**
 * Everything a Returns tab needs, built once by ReturnsView and handed to
 * every panel in tab-registry.tsx. Add a field here only when a new tab
 * needs it (see plans/PHASE2-4-OWNERSHIP.md).
 */
export interface ReturnsTabContext {
  settings: AppSettings;
  invoices: Invoice[];
  expenses: Expense[];
  filings: Filing[];
  /** Selected GSTR-1/3B period: month ("2026-10") or quarter ("2026-Q3"). */
  period: string;
  /** Financial year the selected period falls in ("FY2026-27"). */
  fyKey: string;
  today: string;
  frequency: AppSettings["gst"]["filingFrequency"];
  gstr1: ReturnType<typeof buildGstr1>;
  gstr3b: ReturnType<typeof buildGstr3b>;
  g1Filing: Filing | undefined;
  g3Filing: Filing | undefined;
  g1Due: string | null;
  g3Due: string | null;
  filingItems: FilingItem[];
  f: Formatters;
  onPrint: ReturnType<typeof usePrintSummary>["print"];
  /** Registration situation that hides GSTR-1/3B ("composition", …) or null for regular filers. */
  notApplicable: "composition" | "unregistered" | "no_gstin" | "bad_gstin" | null;
}
