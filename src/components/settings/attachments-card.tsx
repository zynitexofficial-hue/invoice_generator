"use client";

import { Paperclip } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/db/settings";
import { formatBytes } from "@/lib/purchases/attachment-utils";
import type { AppSettings } from "@/lib/schema";
import { StorageNotice, useStorageUsage } from "@/components/attachments/storage-notice";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";

function useIntSetting(
  value: number,
  min: number,
  max: number,
  save: (n: number) => void,
  what: string,
) {
  const [text, setText] = useState(String(value));
  const commit = () => {
    const n = Math.round(Number(text));
    if (!Number.isFinite(n) || n < min || n > max) {
      setText(String(value));
      toast.error(`${what} must be between ${min} and ${max}.`);
      return;
    }
    if (n !== value) save(n);
  };
  return { text, setText, commit };
}

/** Settings → Data: receipt attachment limits, storage use and backup choice. */
export function AttachmentsCard({ settings }: { settings: AppSettings }) {
  const usage = useStorageUsage();
  const a = settings.attachments;
  const patch = (p: Partial<AppSettings["attachments"]>) =>
    void updateSettings((s) => ({ ...s, attachments: { ...s.attachments, ...p } }));
  const maxKb = useIntSetting(
    a.maxFileKb,
    50,
    10240,
    (n) => patch({ maxFileKb: n }),
    "File size limit",
  );
  const warnMb = useIntSetting(
    a.warnTotalMb,
    10,
    2000,
    (n) => patch({ warnTotalMb: n }),
    "Warning size",
  );

  return (
    <Card>
      <CardHeader
        title="Receipts & attached files"
        description="Photos and PDFs attached to expenses and purchase bills stay in this browser."
        icon={<Paperclip />}
      />
      <CardContent className="grid gap-4">
        <p className="text-sm" aria-live="polite">
          {usage
            ? `${usage.count} file${usage.count === 1 ? "" : "s"} · ${formatBytes(usage.bytes)} used`
            : "Checking storage…"}
          {usage && usage.quota > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · browser storage {formatBytes(usage.browserUsage)} of {formatBytes(usage.quota)}
            </span>
          )}
        </p>
        <StorageNotice />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            label="Largest file (KB)"
            hint="Photos are shrunk first, then checked against this."
          >
            <Input
              inputMode="numeric"
              value={maxKb.text}
              onChange={(e) => maxKb.setText(e.target.value.replace(/\D/g, ""))}
              onBlur={maxKb.commit}
            />
          </Field>
          <Field label="Warn when files pass (MB)" hint="Total of all attached files.">
            <Input
              inputMode="numeric"
              value={warnMb.text}
              onChange={(e) => warnMb.setText(e.target.value.replace(/\D/g, ""))}
              onBlur={warnMb.commit}
            />
          </Field>
        </div>
        <SwitchRow
          label="Include files in backups"
          description="Turn off for smaller backup files. Receipts are then not restored from a backup."
          checked={a.includeInBackup}
          onCheckedChange={(includeInBackup) => patch({ includeInBackup })}
        />
      </CardContent>
    </Card>
  );
}
