"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { ReturnsTabContext } from "../tab-context";

/** Owner: feature F — replace this file with the real tab. */
export function Gstr4Panel({ ctx }: { ctx: ReturnsTabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="GSTR-4 (composition)"
      description="Annual statement for composition dealers."
    />
  );
}
