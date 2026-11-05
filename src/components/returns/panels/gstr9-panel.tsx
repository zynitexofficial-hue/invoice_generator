"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { ReturnsTabContext } from "../tab-context";

/** Owner: feature F — replace this file with the real tab. */
export function Gstr9Panel({ ctx }: { ctx: ReturnsTabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="GSTR-9 and GSTR-9C"
      description="Annual return worksheet and reconciliation checklist."
    />
  );
}
