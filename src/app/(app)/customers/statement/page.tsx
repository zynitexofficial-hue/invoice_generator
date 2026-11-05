import type { Metadata } from "next";
import { Suspense } from "react";
import { StatementView } from "@/components/customers/statement-view";

export const metadata: Metadata = { title: "Customer statement" };

// StatementView will read ?customer= / ?from= / ?to= with useSearchParams, which
// needs a Suspense boundary in a statically exported route.
export default function StatementPage() {
  return (
    <Suspense fallback={null}>
      <StatementView />
    </Suspense>
  );
}
