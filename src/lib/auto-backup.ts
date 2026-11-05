import { create } from "zustand";
import { buildBackup, markBackedUp, parseBackupFile, serializeBackup } from "@/db/backup";
import {
  clearBackupDirHandle,
  getAutoBackupState,
  getBackupDirHandle,
  setAutoBackupState,
  setBackupDirHandle,
} from "@/db/auto-backup-handle";
import { loadSettings, updateSettings } from "@/db/settings";
import { getLastChangeAt } from "@/db/write";

/**
 * Automatic backups to a folder the user picks once (spec I2).
 *
 * Uses the File System Access API (Chromium browsers on desktop). After data
 * changes, at most once per day, the app writes `invoice-backup-YYYY-MM-DD.json`
 * into the folder (a later run on the same day overwrites that day's file),
 * reads it back to verify it, and keeps only the newest `keepCount` files.
 *
 * Encryption: when "Encrypt backups" is on, the passphrase must be typed once
 * per session. It is kept in memory only (never stored); without it the
 * automatic backup is skipped and Settings shows "Unlock auto-backup".
 */

/* ------------------------------------------------------------------ */
/* Pure helpers (unit tested)                                          */
/* ------------------------------------------------------------------ */

export const AUTO_BACKUP_FILE_RE = /^invoice-backup-(\d{4}-\d{2}-\d{2})\.json$/;

/** Local calendar date (YYYY-MM-DD) — backups are named by the user's day. */
export function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function autoBackupFileName(date: Date): string {
  return `invoice-backup-${localDateKey(date)}.json`;
}

/**
 * Which backup files to delete so only the newest `keepCount` remain.
 * Only files matching the app's own naming pattern are ever considered;
 * anything else in the folder is left alone.
 */
export function filesToDelete(names: string[], keepCount: number): string[] {
  const keep = Math.max(1, Math.floor(keepCount) || 1);
  const ours = [...new Set(names.filter((n) => AUTO_BACKUP_FILE_RE.test(n)))].sort((a, b) =>
    a < b ? 1 : a > b ? -1 : 0,
  );
  return ours.slice(keep);
}

/**
 * Whether an automatic backup is due: data changed since the last backup
 * covered it, and no automatic backup has been written today yet.
 */
export function isAutoBackupDue(input: {
  lastChangeAt: string;
  coveredChangeAt: string;
  lastRunAt: string;
  now: Date;
}): boolean {
  const changed = Boolean(input.lastChangeAt) && input.lastChangeAt > input.coveredChangeAt;
  if (!changed) return false;
  if (!input.lastRunAt) return true;
  return localDateKey(new Date(input.lastRunAt)) !== localDateKey(input.now);
}

/* ------------------------------------------------------------------ */
/* Browser support and permissions                                     */
/* ------------------------------------------------------------------ */

type PermissionMode = { mode: "readwrite" };
interface PermissionedHandle {
  queryPermission?: (d: PermissionMode) => Promise<PermissionState>;
  requestPermission?: (d: PermissionMode) => Promise<PermissionState>;
}
interface IterableDirectory {
  keys?: () => AsyncIterable<string>;
}
type DirectoryPicker = (options?: {
  id?: string;
  mode?: "read" | "readwrite";
  startIn?: string;
}) => Promise<FileSystemDirectoryHandle>;

export function isAutoBackupSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
      "function" &&
    window.isSecureContext
  );
}

export async function folderPermission(
  handle: FileSystemDirectoryHandle,
  request = false,
): Promise<PermissionState> {
  const h = handle as unknown as PermissionedHandle;
  const opts: PermissionMode = { mode: "readwrite" };
  try {
    const current = h.queryPermission ? await h.queryPermission(opts) : "granted";
    if (current === "granted" || !request || !h.requestPermission) return current;
    return await h.requestPermission(opts);
  } catch {
    return "denied";
  }
}

/* ------------------------------------------------------------------ */
/* Session passphrase (memory only)                                    */
/* ------------------------------------------------------------------ */

let sessionPassphrase: string | null = null;

export function setSessionPassphrase(passphrase: string | null) {
  sessionPassphrase = passphrase || null;
  useAutoBackup.getState().set({ hasPassphrase: Boolean(sessionPassphrase) });
}

export function getSessionPassphrase(): string | null {
  return sessionPassphrase;
}

/* ------------------------------------------------------------------ */
/* Status store (for the Settings UI)                                  */
/* ------------------------------------------------------------------ */

export type AutoBackupStatus =
  "off" | "unsupported" | "ready" | "running" | "needs-permission" | "needs-passphrase" | "error";

interface AutoBackupStore {
  status: AutoBackupStatus;
  folderName: string;
  lastRunAt: string;
  lastFile: string;
  lastEncrypted: boolean;
  message: string;
  hasPassphrase: boolean;
  set: (partial: Partial<Omit<AutoBackupStore, "set">>) => void;
}

export const useAutoBackup = create<AutoBackupStore>((set) => ({
  status: "off",
  folderName: "",
  lastRunAt: "",
  lastFile: "",
  lastEncrypted: false,
  message: "",
  hasPassphrase: false,
  set: (partial) => set(partial),
}));

/** Load the folder name and last run into the store (no permission prompts). */
export async function refreshAutoBackupStatus(): Promise<void> {
  const store = useAutoBackup.getState();
  if (!isAutoBackupSupported()) {
    store.set({ status: "unsupported" });
    return;
  }
  try {
    const [settings, handle, state] = await Promise.all([
      loadSettings(),
      getBackupDirHandle(),
      getAutoBackupState(),
    ]);
    const base = {
      folderName: handle?.name ?? "",
      lastRunAt: state.lastRunAt,
      lastFile: state.lastFile,
      lastEncrypted: state.encrypted,
    };
    if (!settings.backup.autoFolderEnabled || !handle) {
      store.set({ ...base, status: "off", message: "" });
      return;
    }
    if ((await folderPermission(handle)) !== "granted") {
      store.set({ ...base, status: "needs-permission", message: "" });
      return;
    }
    if (settings.backup.encrypt && !sessionPassphrase) {
      store.set({ ...base, status: "needs-passphrase", message: "" });
      return;
    }
    store.set({
      ...base,
      status: state.lastError ? "error" : "ready",
      message: state.lastError,
    });
  } catch {
    store.set({ status: "error", message: "Couldn't read the backup folder settings." });
  }
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/**
 * Ask the user to pick a folder (must run inside a click handler), remember
 * it, turn automatic backups on and write the first backup straight away.
 */
export async function chooseBackupFolder(): Promise<"chosen" | "cancelled" | "unsupported"> {
  if (!isAutoBackupSupported()) return "unsupported";
  const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker })
    .showDirectoryPicker;
  let handle: FileSystemDirectoryHandle;
  try {
    handle = await picker({ id: "invoice-backups", mode: "readwrite", startIn: "documents" });
  } catch {
    return "cancelled";
  }
  await setBackupDirHandle(handle);
  await setAutoBackupState({ lastError: "" });
  await updateSettings((s) => ({ ...s, backup: { ...s.backup, autoFolderEnabled: true } }));
  await runAutoBackup({ force: true });
  return "chosen";
}

/** Re-grant folder access after a reload (must run inside a click handler). */
export async function allowFolderAccess(): Promise<boolean> {
  const handle = await getBackupDirHandle();
  if (!handle) return false;
  const ok = (await folderPermission(handle, true)) === "granted";
  if (ok) await runAutoBackup();
  else await refreshAutoBackupStatus();
  return ok;
}

/** Turn automatic backups off and forget the folder. Files already written are kept. */
export async function stopAutoBackup(): Promise<void> {
  await clearBackupDirHandle();
  await updateSettings((s) => ({ ...s, backup: { ...s.backup, autoFolderEnabled: false } }));
  await refreshAutoBackupStatus();
}

let running: Promise<AutoBackupResult> | null = null;

export type AutoBackupResult =
  "written" | "not-due" | "off" | "unsupported" | "needs-permission" | "needs-passphrase" | "error";

/**
 * Write today's backup to the chosen folder when due (or always with `force`).
 * Never prompts for permission — call allowFolderAccess() from a click first.
 */
export function runAutoBackup(opts: { force?: boolean } = {}): Promise<AutoBackupResult> {
  running ??= doRun(opts).finally(() => {
    running = null;
  });
  return running;
}

async function doRun({ force = false }: { force?: boolean }): Promise<AutoBackupResult> {
  if (!isAutoBackupSupported()) {
    await refreshAutoBackupStatus();
    return "unsupported";
  }
  const settings = await loadSettings();
  const handle = await getBackupDirHandle();
  if (!settings.backup.autoFolderEnabled || !handle) {
    await refreshAutoBackupStatus();
    return "off";
  }
  const [state, lastChangeAt] = await Promise.all([getAutoBackupState(), getLastChangeAt()]);
  if (!force && !isAutoBackupDue({ ...state, lastChangeAt, now: new Date() })) {
    await refreshAutoBackupStatus();
    return "not-due";
  }
  if ((await folderPermission(handle)) !== "granted") {
    await refreshAutoBackupStatus();
    return "needs-permission";
  }
  const passphrase = settings.backup.encrypt ? sessionPassphrase : null;
  if (settings.backup.encrypt && !passphrase) {
    await refreshAutoBackupStatus();
    return "needs-passphrase";
  }

  const store = useAutoBackup.getState();
  store.set({ status: "running", message: "" });
  try {
    const backup = await buildBackup();
    const text = await serializeBackup(backup, passphrase ?? undefined);
    const name = autoBackupFileName(new Date());
    await writeFile(handle, name, text);
    await verifyFile(handle, name, passphrase);
    await rotate(handle, settings.backup.keepCount);
    await markBackedUp(backup.exportedAt);
    // Read after markBackedUp: that settings write itself counts as a change.
    const covered = await getLastChangeAt();
    await setAutoBackupState({
      lastRunAt: new Date().toISOString(),
      lastFile: name,
      coveredChangeAt: covered,
      encrypted: Boolean(passphrase),
      lastError: "",
    });
    await refreshAutoBackupStatus();
    return "written";
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? `The last automatic backup failed: ${error.message}`
        : "The last automatic backup failed.";
    await setAutoBackupState({ lastError: message }).catch(() => undefined);
    await refreshAutoBackupStatus();
    return "error";
  }
}

async function writeFile(dir: FileSystemDirectoryHandle, name: string, text: string) {
  const file = await dir.getFileHandle(name, { create: true });
  const writable = await file.createWritable();
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    throw error;
  }
}

/** Read the file back and make sure it restores (decrypting when needed). */
async function verifyFile(dir: FileSystemDirectoryHandle, name: string, passphrase: string | null) {
  const file = await (await dir.getFileHandle(name)).getFile();
  const text = await file.text();
  try {
    await parseBackupFile(text, () => passphrase);
  } catch {
    throw new Error("the file written to the folder couldn't be read back.");
  }
}

async function rotate(dir: FileSystemDirectoryHandle, keepCount: number) {
  const iterable = dir as unknown as IterableDirectory;
  if (!iterable.keys) return;
  const names: string[] = [];
  for await (const name of iterable.keys()) names.push(name);
  for (const name of filesToDelete(names, keepCount)) {
    try {
      await dir.removeEntry(name);
    } catch {
      // A file we can't delete is not worth failing the backup over.
    }
  }
}
