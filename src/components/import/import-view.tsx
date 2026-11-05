"use client";

import { ComingSoon } from "@/components/coming-soon";
import { Page } from "@/components/layout/page";

/** Owner: feature C — replace this file with the CSV import wizard. */
export function ImportView() {
  return (
    <Page
      title="Import"
      width="narrow"
      description="Bring customers, items and expenses in from a spreadsheet."
    >
      <ComingSoon
        title="CSV import"
        description="Upload a CSV, check the preview and import it in one step."
      />
    </Page>
  );
}
