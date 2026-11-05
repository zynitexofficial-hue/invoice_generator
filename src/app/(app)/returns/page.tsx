import type { Metadata } from "next";
import { Suspense } from "react";
import { ReturnsView } from "@/components/returns/returns-view";

export const metadata: Metadata = { title: "GST Returns" };

// ReturnsView reads ?period= / ?tab= with useSearchParams, which needs a
// Suspense boundary in a statically exported route.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <ReturnsView />
    </Suspense>
  );
}
