"use client";

import { Gstr2bView } from "../gstr2b/gstr2b-view";
import type { ReturnsTabContext } from "../tab-context";

/** Returns > GSTR-2B: import the portal statement and match it with purchase bills and expenses. */
export function Gstr2bPanel({ ctx }: { ctx: ReturnsTabContext }) {
  return <Gstr2bView ctx={ctx} />;
}
