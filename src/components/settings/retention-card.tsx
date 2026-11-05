"use client";

import { Archive } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useInvoices } from "@/db/hooks";
import { deleteInvoice } from "@/db/invoices";
import { updateSettings } from "@/db/settings";
import { MIN_RETENTION_YEARS, retentionReport } from "@/lib/retention";
import type { AppSettings } from "@/lib/schema";
import { downloadBlob, plural } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Settings → Data: retention helper (spec H5). Never deletes anything on its own. */
export function RetentionCard({ settings }: { settings: AppSettings }) {
  const invoices = useInvoices();
  const years = settings.privacy.retentionYears;
  const [yearsText, setYearsText] = useState(String(years));
  const [busy, setBusy] = useState(false);
  const report = useMemo(
    () => (invoices ? retentionReport(invoices, years) : null),
    [invoices, years],
  );

  const saveYears = (text: string) => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < MIN_RETENTION_YEARS || n > 50) {
      setYearsText(String(years));
      toast.error(`Keep records for at least ${MIN_RETENTION_YEARS} years (GST law).`);
      return;
    }
    if (n === years) return;
    void updateSettings((s) => ({ ...s, privacy: { ...s.privacy, retentionYears: n } }));
  };

  const exportThenDelete = async () => {
    if (!report?.oldDrafts.length) return;
    const drafts = report.oldDrafts;
    const ok = await confirm({
      title: `Export and delete ${plural(drafts.length, "old draft")}?`,
      description:
        "A file with these drafts is downloaded first. Then they're removed from this browser. Issued documents are never touched.",
      confirmLabel: "Export, then delete",
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const stamp = new Date().toISOString();
      downloadBlob(
        new Blob(
          [
            JSON.stringify(
              { format: "invoice-generator/drafts-export", exportedAt: stamp, invoices: drafts },
              null,
              2,
            ),
          ],
          { type: "application/json" },
        ),
        `old-drafts-${stamp.slice(0, 10)}.json`,
      );
      let deleted = 0;
      for (const d of drafts) {
        try {
          await deleteInvoice(d.id);
          deleted++;
        } catch {
          /* skipped: e.g. it was issued meanwhile */
        }
      }
      toast.success(`${plural(deleted, "old draft")} deleted`, {
        description: "The exported file is in your downloads.",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Keeping and deleting old records"
        description="GST law requires keeping invoices for about 72 months. After that, erase personal data you no longer need."
        icon={<Archive />}
      />
      <CardContent className="grid gap-4">
        <Field
          label="Keep records for (financial years)"
          hint={`Minimum ${MIN_RETENTION_YEARS}. The default of 8 leaves a safe margin over the 72-month GST rule.`}
          className="sm:max-w-xs"
        >
          <Input
            type="number"
            inputMode="numeric"
            min={MIN_RETENTION_YEARS}
            max={50}
            value={yearsText}
            onChange={(e) => setYearsText(e.target.value)}
            onBlur={(e) => saveYears(e.target.value)}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-surface-2/50 p-4">
            <div className="text-lg font-semibold tabular-nums">
              {report ? report.issuedPastRetention : "…"}
            </div>
            <div className="text-[13px] leading-5 text-muted-foreground">
              Issued documents older than {years} financial years. Kept — review them and delete
              personal data only if no law or open case needs them.
            </div>
          </div>
          <div className="rounded-xl border border-border bg-surface-2/50 p-4">
            <div className="text-lg font-semibold tabular-nums">
              {report ? report.oldDrafts.length : "…"}
            </div>
            <div className="text-[13px] leading-5 text-muted-foreground">
              Drafts not changed for over a year.
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              disabled={!report?.oldDrafts.length}
              loading={busy}
              onClick={() => void exportThenDelete()}
            >
              Export these, then delete
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Nothing is deleted automatically. Issued invoices can&apos;t be deleted here — they are
          part of your GST records.
        </p>
      </CardContent>
    </Card>
  );
}
