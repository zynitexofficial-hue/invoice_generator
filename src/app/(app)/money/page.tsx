import type { Metadata } from "next";
import { Suspense } from "react";
import { MoneyView } from "@/components/money/money-view";

export const metadata: Metadata = { title: "Money" };

// MoneyView reads ?tab= / ?new= with useSearchParams, which needs a Suspense
// boundary in a statically exported route.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MoneyView />
    </Suspense>
  );
}
