"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { TabContext } from "./context";

/** Owner: feature F — replace this file with the real tab. */
export function YoyTab({ ctx }: { ctx: TabContext }) {
  void ctx;
  return <ComingSoon title="Year over year" description="Compare financial years side by side." />;
}
