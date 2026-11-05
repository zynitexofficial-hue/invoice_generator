import type { Metadata } from "next";
import { Suspense } from "react";
import { EditorRoute } from "@/components/editor/editor";

export const metadata: Metadata = { title: "Editor" };

export default function InvoicePage() {
  return (
    // useSearchParams requires a Suspense boundary in a statically exported route.
    <Suspense fallback={null}>
      <EditorRoute />
    </Suspense>
  );
}
