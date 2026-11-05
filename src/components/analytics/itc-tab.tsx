"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { TabContext } from "./context";

/** Owner: feature E — replace this file with the real tab. */
export function ItcTab({ ctx }: { ctx: TabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="ITC reconciliation"
      description="Input tax credit in your books against GSTR-2B."
    />
  );
}
