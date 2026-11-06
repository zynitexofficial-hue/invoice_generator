"use client";

import { FilePenLine, FileWarning, Trash2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteAmendment, saveAmendment } from "@/db/amendments";
import { useAmendments } from "@/db/hooks";
import { useGstr1Snapshots } from "@/db/hooks-amendments";
import { draftAmendment } from "@/lib/gst/amendments";
import { currentPeriod, periodLabel } from "@/lib/period";
import type { Amendment } from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { AmendmentDialog } from "../amendments/amendment-dialog";
import { CHANGE_TEXT, detectCandidates, type AmendmentCandidate } from "../amendments/detect";
import { SectionsPreview } from "../amendments/sections-preview";
import { DRAFT_AND_READY, useAmendmentSections } from "../amendments/use-sections";
import { periodKindFor } from "../returns-data";
import type { ReturnsTabContext } from "../tab-context";

const STATUS_TONE = { draft: "neutral", ready: "primary", reported: "success" } as const;
const STATUS_LABEL = {
  draft: "Draft",
  ready: "Ready to report",
  reported: "Reported",
} as const;
const KIND_LABEL = {
  invoice_amendment: "Invoice correction",
  note_amendment: "Credit/debit note correction",
  cancellation: "Cancellation",
  other: "Other",
} as const;

export function AmendmentsPanel({ ctx }: { ctx: ReturnsTabContext }) {
  const amendments = useAmendments();
  const snapshots = useGstr1Snapshots();
  const [editing, setEditing] = useState<string | null>(null);
  const { sections } = useAmendmentSections(
    amendments,
    ctx.period,
    ctx.invoices,
    ctx.settings,
    DRAFT_AND_READY,
  );

  const candidates = useMemo(
    () =>
      amendments && snapshots
        ? detectCandidates({
            invoices: ctx.invoices,
            settings: ctx.settings,
            filings: ctx.filings,
            snapshots,
            amendments,
          })
        : [],
    [amendments, snapshots, ctx.invoices, ctx.settings, ctx.filings],
  );

  if (!amendments || !snapshots) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const openPeriod = currentPeriod(periodKindFor(ctx.frequency), ctx.today);
  const targetFor = (c: AmendmentCandidate) => (ctx.period > c.periodKey ? ctx.period : openPeriod);
  const byId = new Map(ctx.invoices.map((i) => [i.id, i]));
  const editingRow = amendments.find((a) => a.id === editing);

  const record = async (c: AmendmentCandidate) => {
    if (!c.invoice) return;
    try {
      const saved = await saveAmendment(
        draftAmendment({
          invoice: c.invoice,
          invoices: ctx.invoices,
          settings: ctx.settings,
          originalPeriodKey: c.periodKey,
          amendInPeriodKey: targetFor(c),
        }),
      );
      setEditing(saved.id);
    } catch {
      /* reported by guardedWrite */
    }
  };

  const setStatus = async (a: Amendment, status: Amendment["status"]) => {
    if (status !== "draft" && !a.beforeConfirmed) {
      toast.error("Open it and confirm the original values first.");
      setEditing(a.id);
      return;
    }
    try {
      await saveAmendment({
        ...a,
        status,
        reportedAt: status === "reported" ? new Date().toISOString() : "",
      });
    } catch {
      /* reported by guardedWrite */
    }
  };

  const remove = async (a: Amendment) => {
    const ok = await confirm({
      title: `Delete the amendment for ${a.originalNumber || "this document"}?`,
      description: "Only this note is removed. The invoice itself is not changed.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) await deleteAmendment(a.id);
  };

  const pending = amendments.filter((a) => a.status !== "reported");
  const newCandidates = candidates.filter((c) => c.change !== "added" && !c.amendment);
  const added = candidates.filter((c) => c.change === "added");

  return (
    <div className="space-y-4">
      <Alert tone="info" title="How corrections after filing work">
        You can&apos;t change a return once it is filed. Instead, note the correction here and
        report it in a later GSTR-1 (amendment tables). If the sale really changed (goods returned,
        price reduced), issue a credit note instead. Amendments here are a draft prepared from your
        records: verify the tables on the GST portal or with your CA.
      </Alert>

      {newCandidates.length > 0 && (
        <Card>
          <CardHeader
            icon={<FileWarning />}
            title={`${newCandidates.length} ${newCandidates.length === 1 ? "document needs" : "documents need"} an amendment`}
            description="These were edited, cancelled or re-dated after their return was filed."
          />
          <ul className="divide-y divide-border px-5 pb-3 sm:px-6">
            {newCandidates.map((c) => (
              <li key={c.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                <div className="min-w-0 flex-1 basis-48">
                  <div className="text-sm font-medium break-words">
                    {c.invoice?.number || "Document"}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {CHANGE_TEXT[c.change]} · filed for {c.periodLabel}
                  </div>
                </div>
                {c.invoice && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/invoice?id=${encodeURIComponent(c.invoiceId)}`}>Open</Link>
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!c.invoice}
                  onClick={() => void record(c)}
                >
                  Record amendment
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {added.length > 0 && (
        <Alert tone="warning" title={`${added.length} document(s) added after filing`}>
          {added.map((c) => c.invoice?.number || "Document").join(", ")} fall in a period you have
          already filed but were not in the filed return. They are not amendments: check the date,
          and report them as late sales with your CA if the date is right.
        </Alert>
      )}

      <Card>
        <CardHeader
          icon={<FilePenLine />}
          title="Amendment records"
          description={
            pending.length
              ? `${pending.length} waiting to be reported`
              : "Nothing waiting to be reported."
          }
        />
        {amendments.length === 0 ? (
          <EmptyState
            title="No amendments yet"
            description="When a document changes after you file, it shows up above and you can record the correction here."
          />
        ) : (
          <ul className="divide-y divide-border px-5 pb-3 sm:px-6">
            {amendments.map((a) => (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium break-words">
                    {a.originalNumber || "Document"}
                  </span>
                  <Badge tone="outline" size="sm">
                    {KIND_LABEL[a.kind]}
                  </Badge>
                  <Badge tone={STATUS_TONE[a.status]} size="sm">
                    {STATUS_LABEL[a.status]}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Filed in {a.originalPeriodKey ? periodLabel(a.originalPeriodKey) : "?"}
                  {a.amendInPeriodKey ? `, correct in ${periodLabel(a.amendInPeriodKey)}` : ""}
                  {a.reason ? ` · ${a.reason}` : ""}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Taxable {ctx.f.money(a.before.taxable ?? "0")} →{" "}
                  {ctx.f.money(a.after.taxable ?? "0")}
                  {!a.beforeConfirmed && " · original values not confirmed"}
                  {!byId.has(a.originalInvoiceId) && " · document no longer exists"}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => setEditing(a.id)}>
                    Edit
                  </Button>
                  {a.status === "draft" && (
                    <Button size="sm" variant="soft" onClick={() => void setStatus(a, "ready")}>
                      Mark ready
                    </Button>
                  )}
                  {a.status === "ready" && (
                    <Button size="sm" variant="soft" onClick={() => void setStatus(a, "reported")}>
                      Mark reported
                    </Button>
                  )}
                  {a.status !== "draft" && (
                    <Button size="sm" variant="ghost" onClick={() => void setStatus(a, "draft")}>
                      Back to draft
                    </Button>
                  )}
                  <Button
                    size="icon-sm"
                    variant="danger-ghost"
                    aria-label={`Delete amendment for ${a.originalNumber}`}
                    onClick={() => void remove(a)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {sections.count > 0 && (
        <Card>
          <CardHeader
            title={`To report in ${periodLabel(ctx.period)}`}
            description="Amendments marked ready are added to the GSTR-1 file for this period."
          />
          <div className="px-5 py-4 sm:px-6">
            <SectionsPreview sections={sections} f={ctx.f} period={ctx.period} />
            <Button className="mt-3" variant="soft" size="sm" asChild>
              <Link href={`/returns?tab=gstr1&period=${encodeURIComponent(ctx.period)}`}>
                Go to GSTR-1
              </Link>
            </Button>
          </div>
        </Card>
      )}

      {editingRow && (
        <AmendmentDialog
          key={editingRow.id}
          amendment={editingRow}
          invoice={byId.get(editingRow.originalInvoiceId)}
          invoices={ctx.invoices}
          settings={ctx.settings}
          period={ctx.period}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        />
      )}
    </div>
  );
}
