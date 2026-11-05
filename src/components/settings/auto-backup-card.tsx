"use client";

import { FolderCheck, FolderOpen, FolderSync, KeyRound, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/db/settings";
import { relativeTime } from "@/lib/dates";
import {
  allowFolderAccess,
  chooseBackupFolder,
  refreshAutoBackupStatus,
  runAutoBackup,
  setSessionPassphrase,
  stopAutoBackup,
  useAutoBackup,
  type AutoBackupResult,
} from "@/lib/auto-backup";
import type { AppSettings } from "@/lib/schema";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { askPassphrase } from "./passphrase-prompt";

const KEEP_OPTIONS = ["7", "14", "30", "60"].map((v) => ({ value: v, label: `Keep ${v} files` }));

const RESULT_MESSAGES: Partial<Record<AutoBackupResult, string>> = {
  "needs-permission": "Allow access to the backup folder first.",
  "needs-passphrase": "Unlock auto-backup with your passphrase first.",
  error: "The backup couldn't be written. See the message below.",
};

/** Settings → Data: automatic backups to a folder on this computer (spec I2). */
export function AutoBackupCard({ settings }: { settings: AppSettings }) {
  const auto = useAutoBackup();
  const [busy, setBusy] = useState(false);
  const enabled = settings.backup.autoFolderEnabled;

  useEffect(() => {
    void refreshAutoBackupStatus();
  }, [enabled, settings.backup.encrypt]);

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const choose = () =>
    act(async () => {
      const r = await chooseBackupFolder();
      if (r === "chosen") toast.success("Backup folder chosen");
    });

  const unlock = () =>
    act(async () => {
      const answer = await askPassphrase({
        mode: "create",
        title: "Unlock automatic backups",
        description:
          "Automatic backups are encrypted. Enter the passphrase to use until you close this tab. It is kept in memory only.",
        confirmLabel: "Unlock",
      });
      if (!answer) return;
      setSessionPassphrase(answer.passphrase);
      await runAutoBackup();
    });

  const backupNow = () =>
    act(async () => {
      const r = await runAutoBackup({ force: true });
      if (r === "written") toast.success("Backup saved to your folder");
      else if (RESULT_MESSAGES[r]) toast.error(RESULT_MESSAGES[r]);
    });

  if (auto.status === "unsupported") {
    return (
      <Card>
        <CardHeader
          title="Automatic backups"
          description="Save a backup to a folder on this computer every day."
          icon={<FolderSync />}
          action={<Badge tone="neutral">Not available here</Badge>}
        />
        <CardContent>
          <p className="text-[13px] leading-5 text-muted-foreground">
            This browser can&apos;t save files to a folder automatically. It works in Chrome, Edge
            and other Chromium browsers on a computer. Here, keep using{" "}
            <b className="font-medium text-foreground">Download backup</b> — the backup reminder
            above will nudge you when it&apos;s time.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Automatic backups"
        description="Once a day after changes, save a backup into a folder you choose on this computer."
        icon={<FolderSync />}
        action={
          enabled && auto.folderName ? (
            <Badge
              tone={
                auto.status === "ready" ? "success" : auto.status === "error" ? "danger" : "warning"
              }
              dot
            >
              {auto.status === "ready" || auto.status === "running"
                ? "On"
                : auto.status === "error"
                  ? "Failed"
                  : "Needs attention"}
            </Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )
        }
      />
      <CardContent className="grid gap-4">
        {!enabled || !auto.folderName ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[13px] leading-5 text-muted-foreground">
              Pick a folder once — for example one synced to Google Drive or OneDrive, or on an
              external drive. Files are named <code>invoice-backup-YYYY-MM-DD.json</code>.
            </p>
            <Button variant="primary" onClick={() => void choose()} loading={busy}>
              <FolderOpen />
              Choose backup folder
            </Button>
          </div>
        ) : (
          <>
            <div className="grid gap-1 rounded-xl border border-border bg-surface-2/50 p-4 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <FolderCheck className="size-4 text-primary" aria-hidden />
                <span className="truncate">{auto.folderName}</span>
              </div>
              <div className="text-[13px] text-muted-foreground">
                {auto.lastRunAt
                  ? `Last automatic backup ${relativeTime(auto.lastRunAt)} · ${new Date(auto.lastRunAt).toLocaleString()}${auto.lastEncrypted ? " · encrypted" : ""}`
                  : "No automatic backup yet."}
              </div>
            </div>

            {auto.status === "needs-permission" && (
              <Alert
                tone="warning"
                icon={<ShieldAlert />}
                title="Allow access to the backup folder"
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => void act(allowFolderAccess)}
                    loading={busy}
                  >
                    Allow access
                  </Button>
                }
              >
                The browser asks again after a restart. Click to let the app keep saving backups.
              </Alert>
            )}
            {auto.status === "needs-passphrase" && (
              <Alert
                tone="warning"
                icon={<KeyRound />}
                title="Unlock auto-backup"
                action={
                  <Button size="sm" variant="secondary" onClick={() => void unlock()}>
                    Unlock
                  </Button>
                }
              >
                Backups are encrypted, and the passphrase is never saved. Enter it once per session
                so automatic backups can continue.
              </Alert>
            )}
            {auto.status === "error" && auto.message && (
              <Alert tone="danger" title="Automatic backup failed">
                {auto.message} Try “Back up now”, or choose the folder again.
              </Alert>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Select
                value={String(settings.backup.keepCount)}
                onValueChange={(v) =>
                  void updateSettings((s) => ({
                    ...s,
                    backup: { ...s.backup, keepCount: Number(v) },
                  }))
                }
                options={
                  KEEP_OPTIONS.some((o) => o.value === String(settings.backup.keepCount))
                    ? KEEP_OPTIONS
                    : [
                        ...KEEP_OPTIONS,
                        {
                          value: String(settings.backup.keepCount),
                          label: `Keep ${settings.backup.keepCount} files`,
                        },
                      ]
                }
                className="sm:w-44"
                aria-label="How many daily backup files to keep"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    void act(async () => {
                      await stopAutoBackup();
                      toast.success("Automatic backups turned off", {
                        description: "Files already in the folder were kept.",
                      });
                    })
                  }
                >
                  Turn off
                </Button>
                <Button variant="ghost" size="sm" onClick={() => void choose()}>
                  Change folder
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void backupNow()}
                  loading={busy || auto.status === "running"}
                >
                  Back up now
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Older files are removed automatically; only files named invoice-backup-….json are
              touched.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
