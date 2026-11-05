"use client";

import { ComingSoon } from "@/components/coming-soon";
import { Page } from "@/components/layout/page";

/**
 * Owner: feature A — replace this file with the printable customer statement
 * (route: /customers/statement?customer=ID&from=YYYY-MM-DD&to=YYYY-MM-DD).
 */
export function StatementView() {
  return (
    <Page
      title="Customer statement"
      width="narrow"
      description="Invoices, payments and balance for a date range."
    >
      <ComingSoon
        title="Customer statement"
        description="A printable statement with an opening balance for any date range."
      />
    </Page>
  );
}
