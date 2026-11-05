"use client";

import {
  ArrowRight,
  Building,
  DatabaseBackup,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { initStorageHealth } from "@/db/health";
import { initInstallListeners } from "@/stores/install";
import { useSettings, useMetaValue } from "@/db/hooks";
import { updateSettings } from "@/db/settings";
import { daysBetween, todayISO } from "@/lib/dates";
import { useStorageStatus } from "@/stores/storage-status";
import { Alert } from "@/components/ui/alert";
import { backupNow, openInvoiceFile, startRestore } from "./file-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { useInvoices } from "@/db/hooks";

/** Runs storage checks once on app start. */
export function StorageBoot() {
  useEffect(() => {
    void initStorageHealth();
    return initInstallListeners();
  }, []);
  return null;
}

const DISMISS_KEY = "ig:dismissed-banners";

function readDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}

function dismissFor(key: string, days: number) {
  try {
    const all = readDismissed();
    all[key] = Date.now() + days * 86_400_000;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/**
 * At most one storage banner at a time, in priority order:
 * data loss → private window → storage almost full → not persisted → backup reminder.
 */
export function StorageBanner() {
  const status = useStorageStatus();
  const settings = useSettings();
  const invoices = useInvoices();
  const lastChangeAt = useMetaValue<string>("lastChangeAt");
  const [dismissed, setDismissed] = useState<Record<string, number>>(() =>
    typeof window === "undefined" ? {} : readDismissed(),
  );
  const [now] = useState(() => Date.now());

  if (!status.ready || !settings || !invoices) return null;
  const isDismissed = (key: string) => (dismissed[key] ?? 0) > now;
  const dismiss = (key: string, days: number) => {
    dismissFor(key, days);
    setDismissed(readDismissed());
  };
  const hasData = invoices.length > 0;

  if (
    (status.integrity === "cleared" || status.integrity === "partial") &&
    !isDismissed(`integrity-${status.integrity}`)
  ) {
    return (
      <Alert
        tone="danger"
        title={
          status.integrity === "cleared"
            ? "Your saved data seems to have been cleared by the browser"
            : "Some saved data seems to be missing"
        }
        action={
          <>
            <Button size="sm" variant="secondary" onClick={startRestore}>
              Restore backup
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismiss(`integrity-${status.integrity}`, 3650)}
            >
              Dismiss
            </Button>
          </>
        }
      >
        {status.integrityDetail} If you have a backup file, you can restore it from Settings → Data
        &amp; backup.
      </Alert>
    );
  }

  if (status.likelyPrivate && !isDismissed("private")) {
    return (
      <Alert
        tone="warning"
        title="This looks like a private window"
        action={
          <Button size="sm" variant="ghost" onClick={() => dismiss("private", 1)}>
            Got it
          </Button>
        }
      >
        Everything you create here will be deleted when you close the window. Download your PDFs and
        invoice files before leaving.
      </Alert>
    );
  }

  if (status.quota > 0 && status.usage / status.quota > 0.8 && !isDismissed("quota")) {
    return (
      <Alert
        tone="warning"
        title="Browser storage is almost full"
        action={
          <>
            <Button size="sm" variant="secondary" onClick={backupNow}>
              Back up
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss("quota", 1)}>
              Later
            </Button>
          </>
        }
      >
        Download a backup and remove old documents from History to free up space.
      </Alert>
    );
  }

  if (hasData && status.persistence === "best-effort" && !isDismissed("persist")) {
    return (
      <Alert
        tone="info"
        title="Your data is saved — protect it from cleanup"
        icon={<ShieldCheck />}
        action={
          <>
            <Button size="sm" variant="secondary" asChild>
              <Link href="/settings?section=data">How to protect it</Link>
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss("persist", 7)}>
              Dismiss
            </Button>
          </>
        }
      >
        {status.isSafari
          ? "Safari can delete site data after about 7 days without a visit."
          : "Browsers may remove site data when the disk is nearly full."}{" "}
        Install the app or keep a backup to stay safe.
      </Alert>
    );
  }

  const reminderDays = settings.backup.reminderDays;
  const last = settings.backup.lastBackupAt;
  const daysSince = last ? (daysBetween(last.slice(0, 10), todayISO()) ?? 0) : Infinity;
  const changedSinceBackup = !last || (lastChangeAt ?? "") > last;
  if (
    hasData &&
    reminderDays > 0 &&
    daysSince >= reminderDays &&
    changedSinceBackup &&
    !isDismissed("backup")
  ) {
    return (
      <Alert
        tone="info"
        title={
          last ? `It's been ${daysSince} days since your last backup` : "You haven't backed up yet"
        }
        icon={<DatabaseBackup />}
        action={
          <>
            <Button size="sm" variant="secondary" onClick={backupNow}>
              Back up now
            </Button>
            <Button size="sm" variant="ghost" onClick={() => dismiss("backup", 1)}>
              Tomorrow
            </Button>
          </>
        }
      >
        Your data lives only in this browser. A backup file lets you restore it on any device.
      </Alert>
    );
  }

  return null;
}

/** Blocking dialog for failed writes — data problems are never silent. */
export function StorageErrorDialog() {
  const error = useStorageStatus((s) => s.error);
  const clearError = useStorageStatus((s) => s.clearError);
  return (
    <Dialog open={Boolean(error)} onOpenChange={(o) => !o && clearError()}>
      <DialogContent size="sm">
        <DialogHeader
          icon={<HardDriveDownload />}
          title="Something wasn't saved"
          description={error?.message}
        />
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            Your latest changes are still on screen. Download a backup now so nothing is lost, then
            free up space or try another browser window.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={clearError}>
            Dismiss
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              await backupNow();
              clearError();
            }}
          >
            Download backup now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * First-run screen: start fresh, or continue from a backup / invoice file.
 * Returning users on a new device can restore everything in one step.
 */
export function WelcomeDialog() {
  const settings = useSettings();
  const ready = useStorageStatus((s) => s.ready);
  const open = Boolean(ready && settings && !settings.onboarding.welcomeSeen);
  const router = useRouter();
  const pathname = usePathname();
  const markSeen = () =>
    void updateSettings((s) => ({ ...s, onboarding: { ...s.onboarding, welcomeSeen: true } }));
  const startFresh = () => {
    markSeen();
    // Already on a new invoice? Just get out of the way.
    if (pathname !== "/invoice") router.push("/invoice?new=1");
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && markSeen()}>
      <DialogContent size="lg">
        <DialogHeader
          icon={<Sparkles />}
          title="Welcome to Invoice Studio"
          description="GST-ready invoices, quotations and bills in minutes — free, private, no sign-up. How would you like to begin?"
        />
        <DialogBody className="grid gap-3">
          <Choice
            icon={<Building />}
            title="Create my first invoice"
            description="Fill in your business and customer once — we remember them for next time."
            badge="New here"
            onClick={startFresh}
          />
          <Choice
            icon={<HardDriveUpload />}
            title="Restore a backup"
            description="Used Invoice Studio before? Load your backup file to bring back your profile, customers, items and documents."
            onClick={startRestore}
          />
          <Choice
            icon={<FolderOpen />}
            title="Open an invoice file"
            description="Continue editing an invoice you saved as a .json file."
            onClick={openInvoiceFile}
          />
          <p className="flex items-start gap-2 pt-1 text-xs leading-5 text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            Nothing is uploaded — everything stays in this browser. Download a backup from time to
            time so you never lose your data.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={markSeen}>
            Skip — just explore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Choice({
  icon,
  title,
  description,
  badge,
  onClick,
  asLink,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  badge?: string;
  onClick: () => void;
  asLink?: string;
}) {
  const inner = (
    <>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-soft-foreground transition-transform duration-200 group-hover:scale-105 sm:size-11 [&_svg]:size-5">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] font-semibold">
          {title}
          {badge && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap text-primary-foreground">
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
          {description}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-subtle-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
    </>
  );
  const className =
    "group flex w-full items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5 text-left sm:gap-4 sm:p-4 transition-[border-color,box-shadow,background-color] duration-150 hover:border-primary/40 hover:bg-primary-soft/30 hover:shadow-md focus-visible:focus-ring";
  return asLink ? (
    <Link href={asLink} onClick={onClick} className={className}>
      {inner}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {inner}
    </button>
  );
}
