"use client";

import { FilePenLine } from "lucide-react";
import Link from "next/link";
import { useAmendments } from "@/db/hooks";
import { pendingAmendments } from "@/lib/gst/amendments";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useAmendmentSections } from "../amendments/use-sections";
import { Gstr1Tab } from "../gstr1-tab";
import type { ReturnsTabContext } from "../tab-context";

export function Gstr1Panel({ ctx }: { ctx: ReturnsTabContext }) {
  const amendments = useAmendments();
  const { sections } = useAmendmentSections(amendments, ctx.period, ctx.invoices, ctx.settings);
  const pending = pendingAmendments(amendments ?? []);
  const drafts = pending.filter((a) => a.status === "draft").length;
  return (
    <div className="space-y-4">
      {pending.length > 0 && (
        <Alert
          tone="warning"
          icon={<FilePenLine />}
          title={`${pending.length} ${pending.length === 1 ? "amendment is" : "amendments are"} waiting to be reported`}
          action={
            <Button size="sm" asChild>
              <Link href={`/returns?tab=amendments&period=${encodeURIComponent(ctx.period)}`}>
                Review
              </Link>
            </Button>
          }
        >
          {sections.count > 0
            ? `${sections.count} will be added to this period's GSTR-1 file. `
            : ""}
          {drafts > 0 ? `${drafts} still in draft and not included.` : ""}
        </Alert>
      )}
      <Gstr1Tab
        result={ctx.gstr1}
        invoices={ctx.invoices}
        filing={ctx.g1Filing}
        due={ctx.g1Due}
        f={ctx.f}
        onPrint={ctx.onPrint}
        amendments={sections}
      />
    </div>
  );
}
