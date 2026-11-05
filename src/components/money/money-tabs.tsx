import type { ComponentType } from "react";
import { BillsTab } from "./bills-tab";
import { RecurringTab } from "./recurring-tab";

/**
 * Extra Money page tabs beyond the built-in "Money out" and "Money in".
 * One line per tab; each tab's UI lives in its own file. The tab shows when
 * ?tab=<id> matches. MoneyView renders the tab instead of the expense/income
 * list and hides the Add button, so a tab brings its own toolbar.
 */
export interface MoneyExtraTab {
  id: string;
  label: string;
  owner: "C" | "D";
  Component: ComponentType;
}

export const MONEY_EXTRA_TABS: readonly MoneyExtraTab[] = [
  { id: "bills", label: "Bills & vendors", owner: "D", Component: BillsTab },
  { id: "recurring", label: "Recurring", owner: "C", Component: RecurringTab },
];

export function findMoneyExtraTab(param: string | null): MoneyExtraTab | undefined {
  return MONEY_EXTRA_TABS.find((t) => t.id === param);
}
