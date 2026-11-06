"use client";

import Link from "next/link";
import { updateSettings } from "@/db/settings";
import type { AppSettings } from "@/lib/schema";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SwitchRow } from "@/components/ui/switch";

/** Settings → Data: recurring invoices and expenses, and CSV import. */
export function RecurringCard({ settings }: { settings: AppSettings }) {
  return (
    <Card>
      <CardHeader
        title="Recurring items and import"
        description="Repeating invoices and expenses are created when you open the app."
      />
      <CardContent className="grid gap-4">
        <SwitchRow
          label="Create due recurring items when the app opens"
          description="Only items set to “create automatically” and with a small backlog. Invoices are always drafts."
          checked={settings.recurring.generateOnOpen}
          onCheckedChange={(v) =>
            void updateSettings((s) => ({ ...s, recurring: { ...s.recurring, generateOnOpen: v } }))
          }
        />
        <p className="text-sm text-muted-foreground">
          <Link
            href="/money?tab=recurring"
            className="font-medium text-primary hover:underline focus-visible:focus-ring"
          >
            Manage recurring items
          </Link>
          {" · "}
          <Link
            href="/import"
            className="font-medium text-primary hover:underline focus-visible:focus-ring"
          >
            Import customers, items or expenses from CSV
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
