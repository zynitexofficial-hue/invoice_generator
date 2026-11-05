"use client";

import { ComingSoon } from "@/components/coming-soon";
import type { ReturnsTabContext } from "../tab-context";

/** Owner: feature B — replace this file with the real tab. */
export function EInvoicePanel({ ctx }: { ctx: ReturnsTabContext }) {
  void ctx;
  return (
    <ComingSoon
      title="E-invoice"
      description="IRP bulk JSON export and IRN, acknowledgement and QR tracking."
    />
  );
}
