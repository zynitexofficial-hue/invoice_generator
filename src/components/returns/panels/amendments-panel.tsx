"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { ReturnsTabContext } from "../tab-context";

/** Owner: feature B — replace this file with the real tab. */
export function AmendmentsPanel({ ctx }: { ctx: ReturnsTabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="Amendments after filing"
      description="GSTR-1A and amendments to documents already reported, with cancellations across periods."
    />
  );
}
