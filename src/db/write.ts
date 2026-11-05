import { describeStorageError, useStorageStatus } from "@/stores/storage-status";
import { getDb } from "./db";
import { requestPersistence, syncMarker } from "./health";

let persistenceRequested = false;

/**
 * Ask the browser to keep our data (navigator.storage.persist) the first time
 * the user actually saves something — not on page load, because Firefox shows
 * a permission prompt and it should appear in context.
 */
function ensurePersistenceOnce() {
  if (persistenceRequested) return;
  persistenceRequested = true;
  const status = useStorageStatus.getState();
  if (status.persistence === "persisted" || status.persistence === "unsupported") return;
  void requestPersistence().then((persistence) => useStorageStatus.getState().set({ persistence }));
}

/**
 * Wrap every IndexedDB write. Failures are never swallowed: they surface in a
 * blocking dialog (see StorageErrorDialog) and the promise rejects so callers
 * can keep their "unsaved" state.
 */
export async function guardedWrite<T>(
  what: string,
  fn: () => Promise<T>,
  opts: { deletion?: boolean } = {},
): Promise<T> {
  try {
    const result = await fn();
    await touchChange();
    syncMarker(opts.deletion);
    if (typeof window !== "undefined") ensurePersistenceOnce();
    return result;
  } catch (error) {
    useStorageStatus
      .getState()
      .reportError(`Couldn't save ${what}. ${describeStorageError(error)}`, String(error));
    throw error;
  }
}

/** Remember when data last changed, for backup reminders. */
async function touchChange() {
  try {
    await getDb().meta.put({ key: "lastChangeAt", value: new Date().toISOString() });
  } catch {
    /* non-critical */
  }
}

export async function getLastChangeAt(): Promise<string> {
  const entry = await getDb().meta.get("lastChangeAt");
  return typeof entry?.value === "string" ? entry.value : "";
}
