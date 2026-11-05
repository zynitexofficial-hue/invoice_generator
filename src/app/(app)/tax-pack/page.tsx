import type { Metadata } from "next";
import { Suspense } from "react";
import { TaxPackView } from "@/components/tax-pack/tax-pack-view";

export const metadata: Metadata = { title: "Tax pack" };

// TaxPackView will read ?fy= with useSearchParams, which needs a Suspense
// boundary in a statically exported route.
export default function TaxPackPage() {
  return (
    <Suspense fallback={null}>
      <TaxPackView />
    </Suspense>
  );
}
