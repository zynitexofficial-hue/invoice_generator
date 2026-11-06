"use client";

import { Repeat } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { useSettings } from "@/db/hooks";
import { useDueRecurring } from "@/db/hooks-recurring";
import { runAutoOnOpen } from "@/db/recurring";
import { plural } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { toastRunReports } from "./run-toast";

/** Once per page load, whatever the screen: the app has no background jobs, so opening it is the trigger. */
let checkedThisLoad = false;

/**
 * Create small "automatic" recurring backlogs when the app opens. Anything
 * bigger, or set to "ask me", waits for the user on the Recurring tab.
 */
export function useRecurringOnOpen() {
  const settings = useSettings();
  const enabled = settings?.recurring.generateOnOpen;
  useEffect(() => {
    if (enabled === undefined || checkedThisLoad) return;
    checkedThisLoad = true;
    if (!enabled) return;
    runAutoOnOpen()
      .then(({ reports }) => {
        if (reports.some((r) => r.created > 0 || r.error)) toastRunReports(reports);
      })
      .catch(() => {
        /* Failures are reported by the storage guard; the tab still works. */
      });
  }, [enabled]);
}

/** "N recurring items are due" strip for the dashboard. Renders nothing when nothing is due. */
export function RecurringDueNotice() {
  const due = useDueRecurring();
  if (!due || due.count === 0) return null;
  return (
    <Alert
      tone="warning"
      icon={<Repeat />}
      className="mb-6"
      title={`${plural(due.count, "recurring item is", "recurring items are")} due`}
      action={
        <Button asChild size="sm" variant="primary">
          <Link href="/money?tab=recurring">Review and create</Link>
        </Button>
      }
    >
      Invoices are saved as drafts for you to check before sending.
    </Alert>
  );
}
