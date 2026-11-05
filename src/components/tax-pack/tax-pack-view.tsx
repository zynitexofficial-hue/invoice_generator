"use client";

import { ComingSoon } from "@/components/coming-soon";
import { Page } from "@/components/layout/page";

/** Owner: feature F — replace this file with the CA tax pack. */
export function TaxPackView() {
  return (
    <Page
      title="Tax pack"
      width="narrow"
      description="Everything your CA needs for a financial year, in one place."
    >
      <ComingSoon
        title="CA tax pack"
        description="Registers, return summaries and annual statements for a financial year."
      />
    </Page>
  );
}
