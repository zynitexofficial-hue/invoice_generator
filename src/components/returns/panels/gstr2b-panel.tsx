"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { ReturnsTabContext } from "../tab-context";

/** Owner: feature E — replace this file with the real tab. */
export function Gstr2bPanel({ ctx }: { ctx: ReturnsTabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="GSTR-2B and IMS"
      description="Import GSTR-2B and match it with your purchase bills and expenses."
    />
  );
}
