"use client";

import {
  DatabaseBackup,
  HardDriveDownload,
  HardDriveUpload,
  ShieldAlert,
  ShieldCheck,
  Trash,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { clearAllData } from "@/db/backup";
import { initStorageHealth, refreshEstimate } from "@/db/health";
import { useSettings } from "@/db/hooks";
import { updateSettings } from "@/db/settings";
import { formatDate, relativeTime } from "@/lib/dates";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useStorageStatus } from "@/stores/storage-status";
import { backupNow, startRestore } from "@/components/storage/file-actions";
import { ProtectStorage } from "./protect-storage";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { Select } from "@/components/ui/select";

export function DataSection() {
  const status = useStorageStatus();
  const settings = useSettings();
  const [backingUp, setBackingUp] = useState(false);
  const usagePct = status.quota ? Math.min(100, (status.usage / status.quota) * 100) : 0;
  const protectedStorage = status.persistence === "persisted";

  const backup = async () => {
    setBackingUp(true);
    await backupNow();
    setBackingUp(false);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Storage"
          description="Everything lives in this browser's storage on this device."
          icon={protectedStorage ? <ShieldCheck /> : <ShieldAlert />}
          action={
            <Badge tone={protectedStorage ? "success" : "warning"} dot>
              {protectedStorage
                ? "Protected"
                : status.persistence === "unsupported"
                  ? "Not supported"
                  : "May be cleared"}
            </Badge>
          }
        />
        <CardContent className="grid gap-4">
          <div>
            <div className="mb-1.5 flex justify-between text-xs text-muted-foreground">
              <span>{formatBytes(status.usage)} used</span>
              <span>
                {status.quota ? `${formatBytes(status.quota)} available` : "Quota unknown"}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-500",
                  usagePct > 80 ? "bg-danger" : "bg-primary",
                )}
                style={{ width: `${Math.max(usagePct, status.usage ? 1.5 : 0)}%` }}
              />
            </div>
          </div>
          {!protectedStorage && status.persistence !== "unsupported" && <ProtectStorage />}
          {status.likelyPrivate && (
            <Alert tone="danger" title="Private window detected">
              Data is deleted when you close this window.
            </Alert>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="w-fit"
            onClick={() => void initStorageHealth().then(refreshEstimate)}
          >
            Re-check storage
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader
          title="Backup & restore"
          description="One file with your profile, settings, customers, items, designs and documents."
          icon={<DatabaseBackup />}
        />
        <CardContent className="grid gap-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-2/50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium">Last backup</div>
              <div className="text-muted-foreground">
                {settings?.backup.lastBackupAt
                  ? `${formatDate(settings.backup.lastBackupAt.slice(0, 10), settings.formats.dateFormat)} · ${relativeTime(settings.backup.lastBackupAt)}`
                  : "Never — download one now"}
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={startRestore}>
                <HardDriveUpload />
                Restore
              </Button>
              <Button variant="primary" onClick={() => void backup()} loading={backingUp}>
                <HardDriveDownload />
                Download backup
              </Button>
            </div>
          </div>
          {settings && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm">
                <div className="font-medium">Backup reminder</div>
                <div className="text-[13px] text-muted-foreground">
                  Nudge me when my last backup is older than…
                </div>
              </div>
              <Select
                value={String(settings.backup.reminderDays)}
                onValueChange={(v) =>
                  void updateSettings((s) => ({
                    ...s,
                    backup: { ...s.backup, reminderDays: Number(v) },
                  }))
                }
                options={[
                  { value: "7", label: "1 week" },
                  { value: "14", label: "2 weeks" },
                  { value: "30", label: "1 month" },
                  { value: "0", label: "Never remind me" },
                ]}
                className="sm:w-44"
              />
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-danger/30">
        <CardHeader title="Danger zone" icon={<TriangleAlert />} />
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Permanently remove everything this app stored in this browser.
          </p>
          <Button
            variant="danger"
            onClick={async () => {
              const ok = await confirm({
                title: "Delete all data?",
                description:
                  "Your profile, settings, customers, items, designs and every document will be removed from this browser. Download a backup first if you might need them.",
                confirmLabel: "Delete everything",
                tone: "danger",
                typeToConfirm: "DELETE",
              });
              if (!ok) return;
              await clearAllData();
              toast.success("All data deleted");
            }}
          >
            <Trash />
            Delete all data
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
