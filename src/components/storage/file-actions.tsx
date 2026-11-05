"use client";

import { HardDriveUpload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import {
  downloadBackup,
  ImportError,
  parseBackup,
  parseInvoiceFile,
  restoreBackup,
  summarizeBackup,
  type BackupSummary,
  type RestoreMode,
} from "@/db/backup";
import { getDb } from "@/db/db";
import { saveInvoice } from "@/db/invoices";
import { updateSettings } from "@/db/settings";
import { relativeTime } from "@/lib/dates";
import type { BackupFile } from "@/lib/schema";
import { plural } from "@/lib/utils";
import { useRetained } from "@/hooks/use-retained";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Segmented } from "@/components/ui/segmented";

/*
 * App-wide file actions — "Open invoice file", "Restore backup" and
 * "Download backup" — callable from the toolbar, command palette, welcome
 * screen and settings. The hidden file inputs live in <FileActionsHost/>.
 */

interface PendingRestore {
  file: BackupFile;
  summary: BackupSummary;
  /** True when this browser holds no documents/customers yet. */
  fresh: boolean;
}

interface FileActionsState {
  pending: PendingRestore | null;
  set: (partial: Partial<Omit<FileActionsState, "set">>) => void;
}

const useFileActions = create<FileActionsState>((set) => ({
  pending: null,
  set: (partial) => set(partial),
}));

// The host registers its hidden inputs here so callers can open the native
// picker synchronously inside their own click handler (required by Safari).
const inputs: { invoice: HTMLInputElement | null; backup: HTMLInputElement | null } = {
  invoice: null,
  backup: null,
};

/** Ask the user for a backup file, then show what it contains before restoring. */
export function startRestore() {
  inputs.backup?.click();
}

/** Ask the user for a .invoice.json file and open it in the editor. */
export function openInvoiceFile() {
  inputs.invoice?.click();
}

export async function backupNow() {
  try {
    const b = await downloadBackup();
    toast.success("Backup downloaded", {
      description: `${plural(b.data.invoices.length, "document")}, ${plural(b.data.customers.length, "customer")}. Keep it somewhere safe.`,
    });
  } catch {
    toast.error("Couldn't create the backup");
  }
}

export function FileActionsHost() {
  const router = useRouter();
  const pending = useFileActions((s) => s.pending);
  const set = useFileActions((s) => s.set);
  const invoiceInput = useRef<HTMLInputElement | null>(null);
  const backupInput = useRef<HTMLInputElement | null>(null);

  const onInvoice = async (file: File | undefined) => {
    if (!file) return;
    try {
      const invoice = parseInvoiceFile(await file.text());
      const saved = await saveInvoice(invoice);
      await updateSettings((cur) => ({
        ...cur,
        onboarding: { ...cur.onboarding, welcomeSeen: true },
      }));
      toast.success(`Opened ${saved.number || "document"}`, {
        description: "Added to your history in this browser.",
      });
      router.push(`/invoice?id=${saved.id}`);
    } catch (error) {
      toast.error("Couldn't open this file", {
        description: error instanceof ImportError ? error.message : "The file may be damaged.",
      });
    } finally {
      if (invoiceInput.current) invoiceInput.current.value = "";
    }
  };

  const onBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseBackup(await file.text());
      const db = getDb();
      const fresh = (await db.invoices.count()) === 0 && (await db.customers.count()) === 0;
      set({ pending: { file: parsed, summary: summarizeBackup(parsed), fresh } });
    } catch (error) {
      toast.error("Couldn't read this backup", {
        description: error instanceof ImportError ? error.message : "The file may be damaged.",
      });
    } finally {
      if (backupInput.current) backupInput.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={(el) => {
          invoiceInput.current = el;
          inputs.invoice = el;
        }}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onInvoice(e.target.files?.[0])}
      />
      <input
        ref={(el) => {
          backupInput.current = el;
          inputs.backup = el;
        }}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => void onBackup(e.target.files?.[0])}
      />
      <RestoreDialog pending={pending} onClose={() => set({ pending: null })} />
    </>
  );
}

function RestoreDialog({
  pending,
  onClose,
}: {
  pending: PendingRestore | null;
  onClose: () => void;
}) {
  const shown = useRetained(pending);
  return (
    <Dialog open={Boolean(pending)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        {shown && (
          <RestoreForm
            key={shown.summary.exportedAt + shown.fresh}
            pending={shown}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function RestoreForm({ pending, onClose }: { pending: PendingRestore; onClose: () => void }) {
  const router = useRouter();
  // On a fresh browser "replace" is the natural choice: it brings back the profile and settings too.
  const [mode, setMode] = useState<RestoreMode>(pending.fresh ? "replace" : "merge");
  const [busy, setBusy] = useState(false);
  const s = pending.summary;

  const run = async () => {
    if (
      mode === "replace" &&
      !pending.fresh &&
      !(await confirm({
        title: "Replace all current data?",
        description: "Everything in this browser will be swapped for the backup's contents.",
        confirmLabel: "Replace",
        tone: "danger",
      }))
    )
      return;
    setBusy(true);
    try {
      await restoreBackup(pending.file, mode);
      await updateSettings((cur) => ({
        ...cur,
        onboarding: { ...cur.onboarding, welcomeSeen: true },
      }));
      toast.success("Backup restored", {
        description: `${plural(s.invoices, "document")} and ${plural(s.customers, "customer")} are back.`,
      });
      onClose();
      router.push("/dashboard");
    } catch {
      toast.error("Restore failed — nothing was changed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader
        icon={<HardDriveUpload />}
        title="Restore backup"
        description={`Created ${relativeTime(s.exportedAt)} · ${new Date(s.exportedAt).toLocaleString()}`}
      />
      <DialogBody className="grid gap-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(
            [
              ["Documents", s.invoices],
              ["Customers", s.customers],
              ["Items", s.items],
              ["Designs", s.designs],
            ] as const
          ).map(([label, n]) => (
            <div
              key={label}
              className="rounded-xl border border-border bg-surface-2/50 p-3 text-center"
            >
              <div className="text-lg font-semibold tabular-nums">{n}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        {!pending.fresh && (
          <Segmented<RestoreMode>
            fullWidth
            value={mode}
            onValueChange={setMode}
            options={[
              { value: "merge", label: "Merge" },
              { value: "replace", label: "Replace everything" },
            ]}
          />
        )}
        <p className="text-[13px] leading-5 text-muted-foreground">
          {pending.fresh
            ? "This browser is empty, so everything in the backup — business profile, settings, customers, items, designs and documents — will be loaded."
            : mode === "merge"
              ? "Adds records from the backup and updates ones that are newer in the backup. Your current settings are kept."
              : "Deletes everything currently stored, then loads the backup — including its profile and settings."}
        </p>
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant={mode === "replace" && !pending.fresh ? "danger" : "primary"}
          onClick={() => void run()}
          loading={busy}
        >
          {pending.fresh
            ? "Restore backup"
            : mode === "merge"
              ? "Merge backup"
              : "Replace with backup"}
        </Button>
      </DialogFooter>
    </>
  );
}
