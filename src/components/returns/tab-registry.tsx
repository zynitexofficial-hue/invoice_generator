import type { ComponentType } from "react";
import { AmendmentsPanel } from "./panels/amendments-panel";
import { EInvoicePanel } from "./panels/einvoice-panel";
import { FilingPanel } from "./panels/filing-panel";
import { Gstr1Panel } from "./panels/gstr1-panel";
import { Gstr2bPanel } from "./panels/gstr2b-panel";
import { Gstr3bPanel } from "./panels/gstr3b-panel";
import { Gstr4Panel } from "./panels/gstr4-panel";
import { Gstr9Panel } from "./panels/gstr9-panel";
import type { ReturnsTabContext } from "./tab-context";

/**
 * THE one file that lists the tabs of the GST Returns page. To add or reorder
 * a tab, edit one line here; each tab's UI lives in its own file under
 * ./panels/. `audience` says which taxpayers see the tab: regular filers
 * and/or composition dealers (who don't file GSTR-1/3B).
 */
export type ReturnsAudience = "regular" | "composition";

export interface ReturnsTabDef {
  id: string;
  label: string;
  /** Owning feature (A-F) or "core" for the original tabs. */
  owner: "core" | "A" | "B" | "C" | "D" | "E" | "F";
  audience: readonly ReturnsAudience[];
  Component: ComponentType<{ ctx: ReturnsTabContext }>;
}

export const RETURNS_TAB_REGISTRY: readonly ReturnsTabDef[] = [
  { id: "gstr1", label: "GSTR-1", owner: "core", audience: ["regular"], Component: Gstr1Panel },
  { id: "gstr3b", label: "GSTR-3B", owner: "E", audience: ["regular"], Component: Gstr3bPanel },
  { id: "filing", label: "Filing", owner: "core", audience: ["regular"], Component: FilingPanel },
  {
    id: "amendments",
    label: "Amendments",
    owner: "B",
    audience: ["regular"],
    Component: AmendmentsPanel,
  },
  {
    id: "einvoice",
    label: "E-invoice",
    owner: "B",
    audience: ["regular"],
    Component: EInvoicePanel,
  },
  { id: "gstr2b", label: "GSTR-2B", owner: "E", audience: ["regular"], Component: Gstr2bPanel },
  {
    id: "gstr4",
    label: "GSTR-4",
    owner: "F",
    audience: ["composition"],
    Component: Gstr4Panel,
  },
  { id: "gstr9", label: "GSTR-9", owner: "F", audience: ["regular"], Component: Gstr9Panel },
];

/** Tabs visible to an audience, in registry order. */
export function visibleReturnsTabs(audience: ReturnsAudience): ReturnsTabDef[] {
  return RETURNS_TAB_REGISTRY.filter((t) => t.audience.includes(audience));
}

/** The tab named by ?tab=, falling back to the first visible one. */
export function parseReturnsTab(param: string | null, tabs: readonly ReturnsTabDef[]): string {
  return tabs.find((t) => t.id === param)?.id ?? tabs[0]?.id ?? "";
}
