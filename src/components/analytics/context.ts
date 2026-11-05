import type {
  AnalyticsData,
  MetricComparison,
  PeriodMetrics,
  PeriodSelector,
} from "@/lib/analytics";
import type { AppSettings, Filing } from "@/lib/schema";
import type { AnalyticsPeriod, CompareMode } from "./analytics-model";
import type { PrintJob } from "./print-report";

/** Everything a tab needs; built once by AnalyticsView. */
export interface TabContext {
  data: AnalyticsData;
  settings: AppSettings;
  filings: Filing[];
  today: string;
  period: AnalyticsPeriod;
  compareMode: CompareMode;
  compareSelector: PeriodSelector | null;
  /** "vs last month" wording; null when not comparing. */
  compareLabel: string | null;
  current: PeriodMetrics;
  previous: PeriodMetrics | null;
  growth: MetricComparison | null;
  /** ₹ formatter honouring the number-grouping setting. */
  money: (v: string | number) => string;
  /** Prefix an /analytics link with the current period. */
  hrefFor: (href: string) => string;
  /** Switch the page to another period (e.g. a clicked month). */
  goToPeriod: (param: string) => void;
  print: (job: Omit<PrintJob, "businessName" | "gstin" | "periodLabel">) => void;
}
