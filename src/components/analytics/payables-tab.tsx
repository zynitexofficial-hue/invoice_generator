"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { TabContext } from "./context";

/** Owner: feature D — replace this file with the real tab. */
export function PayablesTab({ ctx }: { ctx: TabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="Payables and cash flow"
      description="Vendor ageing, bills due and a cash-flow view."
    />
  );
}
