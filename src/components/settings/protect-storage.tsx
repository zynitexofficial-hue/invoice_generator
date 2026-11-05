"use client";

import { AppWindow, HardDriveDownload, RefreshCw, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { downloadBackup } from "@/db/backup";
import { requestPersistence } from "@/db/health";
import { useInstall } from "@/stores/install";
import { useStorageStatus } from "@/stores/storage-status";
import { Button } from "@/components/ui/button";

function installHint(isSafari: boolean) {
  if (typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent))
    return "In Safari tap Share → “Add to Home Screen”.";
  if (isSafari) return "In Safari choose File → “Add to Dock”.";
  return "Use the install icon in the address bar, or the browser menu → “Install Invoice Studio”.";
}

/**
 * Explains what "protected storage" means and offers the ways to get it.
 * Chrome/Edge grant persistence silently based on engagement — usually after
 * the site is installed as an app — so a "no" on a new site is normal.
 */
export function ProtectStorage() {
  const status = useStorageStatus();
  const { canPrompt, installed, promptInstall } = useInstall();
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);

  const askAgain = async () => {
    setBusy(true);
    try {
      const result = await requestPersistence();
      useStorageStatus.getState().set({ persistence: result });
      setAsked(true);
      if (result === "persisted") toast.success("Storage is now protected");
    } finally {
      setBusy(false);
    }
  };

  const install = async () => {
    const outcome = await promptInstall();
    if (outcome === "accepted")
      toast.success("Installed — asking the browser to protect your data…");
  };

  const backup = async () => {
    await downloadBackup();
    toast.success("Backup downloaded");
  };

  return (
    <div className="rounded-xl border border-warning/30 bg-warning-soft/60 p-4">
      <div className="flex gap-3">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning-foreground" />
        <div className="min-w-0 text-sm">
          <div className="font-medium">
            Your data is saved — but not protected from automatic cleanup
          </div>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {status.isSafari
              ? "Safari may delete site data after about 7 days without a visit."
              : "If your disk gets very full, the browser is allowed to remove data of sites it hasn't protected."}{" "}
            Browsers like Chrome and Edge decide this{" "}
            <b className="font-medium text-foreground">automatically</b> — there&apos;s no
            permission pop-up, and a new site is usually declined at first. Installing the app is
            the most reliable way to get protection.
          </p>
        </div>
      </div>

      <ol className="mt-4 space-y-2.5 pl-7">
        <Step n={1} title="Install the app" done={installed}>
          {installed ? (
            "Installed. If storage still isn't protected, use “Ask again”."
          ) : canPrompt ? (
            <Button size="sm" variant="primary" onClick={() => void install()} className="mt-1.5">
              <AppWindow />
              Install Invoice Studio
            </Button>
          ) : (
            installHint(status.isSafari)
          )}
        </Step>
        <Step n={2} title="Ask the browser again">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void askAgain()}
              loading={busy}
              className="mt-1.5"
            >
              <RefreshCw />
              Ask again
            </Button>
            {asked && status.persistence !== "persisted" && (
              <span className="mt-1.5 text-xs text-muted-foreground">
                Not granted yet — it usually is after installing, bookmarking or regular use.
              </span>
            )}
          </div>
        </Step>
        <Step n={3} title="Keep a backup either way">
          <Button size="sm" variant="ghost" onClick={() => void backup()} className="mt-0.5 -ml-2">
            <HardDriveDownload />
            Download backup
          </Button>
        </Step>
      </ol>
    </div>
  );
}

function Step({
  n,
  title,
  done,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative text-[13px] text-muted-foreground">
      <span
        className={`absolute -left-7 flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
          done ? "bg-success text-white" : "bg-surface text-foreground ring-1 ring-border"
        }`}
      >
        {done ? "✓" : n}
      </span>
      <div className="font-medium text-foreground">{title}</div>
      <div className="mt-0.5">{children}</div>
    </li>
  );
}
