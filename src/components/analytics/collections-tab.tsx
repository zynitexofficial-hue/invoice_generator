"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { TabContext } from "./context";

/** Owner: feature A — replace this file with the real tab. */
export function CollectionsTab({ ctx }: { ctx: TabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="Collections"
      description="Payments received, collection efficiency and days to collect."
    />
  );
}
