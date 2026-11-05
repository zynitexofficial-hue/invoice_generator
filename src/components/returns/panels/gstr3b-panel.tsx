"use client";

import { Gstr3bTab } from "../gstr3b-tab";
import type { ReturnsTabContext } from "../tab-context";

/** Feature E replaces this panel with the full GSTR-3B worksheet. */
export function Gstr3bPanel({ ctx }: { ctx: ReturnsTabContext }) {
  return (
    <Gstr3bTab
      result={ctx.gstr3b}
      gstin={ctx.gstr1.gstin}
      invoices={ctx.invoices}
      filing={ctx.g3Filing}
      due={ctx.g3Due}
      f={ctx.f}
      onPrint={ctx.onPrint}
    />
  );
}
