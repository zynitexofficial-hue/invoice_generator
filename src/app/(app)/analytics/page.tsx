import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalyticsSkeleton, AnalyticsView } from "@/components/analytics/analytics-view";

export const metadata: Metadata = { title: "Analytics" };

// AnalyticsView reads ?period= / ?compare= / ?tab= with useSearchParams, which
// needs a Suspense boundary in a statically exported route.
export default function Page() {
  return (
    <Suspense fallback={<AnalyticsSkeleton />}>
      <AnalyticsView />
    </Suspense>
  );
}
