"use client";

import { Gstr1Tab } from "../gstr1-tab";
import type { ReturnsTabContext } from "../tab-context";

export function Gstr1Panel({ ctx }: { ctx: ReturnsTabContext }) {
  return (
    <Gstr1Tab
      result={ctx.gstr1}
      invoices={ctx.invoices}
      filing={ctx.g1Filing}
      due={ctx.g1Due}
      f={ctx.f}
      onPrint={ctx.onPrint}
    />
  );
}
