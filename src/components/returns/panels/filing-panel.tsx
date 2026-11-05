"use client";

import { FilingTab } from "../filing-tab";
import type { ReturnsTabContext } from "../tab-context";

export function FilingPanel({ ctx }: { ctx: ReturnsTabContext }) {
  return (
    <FilingTab
      // Remount per period so the estimator inputs start fresh.
      key={ctx.period}
      items={ctx.filingItems}
      period={ctx.period}
      today={ctx.today}
      aato={ctx.settings.gst.aato}
      dateFormat={ctx.settings.formats.dateFormat}
      f={ctx.f}
    />
  );
}
