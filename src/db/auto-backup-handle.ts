import { getDb } from "./db";

/**
 * Storage for the automatic-backup folder (spec I2).
 *
 * A FileSystemDirectoryHandle is structured-clonable, so it can be kept in
 * IndexedDB (meta table) and reused after a reload. The browser still asks
 * for permission again in a new session; the handle only remembers *which*
 * folder was chosen. These meta writes deliberately bypass guardedWrite so
 * they don't count as a "data change" (which would trigger another backup).
 */

const HANDLE_KEY = "autoBackupDir";
const STATE_KEY = "autoBackupState";

export interface AutoBackupState {
  /** ISO time of the last successful automatic write. */
  lastRunAt: string;
  /** File name written last. */
  lastFile: string;
  /** `lastChangeAt` value already covered by the last successful backup. */
  coveredChangeAt: string;
  /** Whether the last file was encrypted. */
  encrypted: boolean;
  /** Last error message ("" when the last run succeeded). */
  lastError: string;
}

export const EMPTY_AUTO_BACKUP_STATE: AutoBackupState = {
  lastRunAt: "",
  lastFile: "",
  coveredChangeAt: "",
  encrypted: false,
  lastError: "",
};

export async function getBackupDirHandle(): Promise<FileSystemDirectoryHandle | undefined> {
  const entry = await getDb().meta.get(HANDLE_KEY);
  const value = entry?.value as FileSystemDirectoryHandle | undefined;
  return value && typeof value === "object" && "kind" in value ? value : undefined;
}

export async function setBackupDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  await getDb().meta.put({ key: HANDLE_KEY, value: handle });
}

export async function clearBackupDirHandle(): Promise<void> {
  await getDb().meta.delete(HANDLE_KEY);
}

export async function getAutoBackupState(): Promise<AutoBackupState> {
  const entry = await getDb().meta.get(STATE_KEY);
  const value = (entry?.value ?? {}) as Partial<AutoBackupState>;
  return { ...EMPTY_AUTO_BACKUP_STATE, ...value };
}

export async function setAutoBackupState(
  patch: Partial<AutoBackupState>,
): Promise<AutoBackupState> {
  const next = { ...(await getAutoBackupState()), ...patch };
  await getDb().meta.put({ key: STATE_KEY, value: next });
  return next;
}
