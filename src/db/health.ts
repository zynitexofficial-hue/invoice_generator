import { nanoid } from "nanoid";
import { COUNTED_TABLES, getDb, type TableName } from "./db";
import { useStorageStatus, type Integrity, type Persistence } from "@/stores/storage-status";

/**
 * Data-loss detection (best effort).
 *
 * We keep a small marker — an install id plus record counts — in BOTH
 * IndexedDB and localStorage. Browsers usually clear them together, but when
 * IndexedDB is evicted on its own (storage pressure, Safari's 7-day policy,
 * partial "clear site data"), the localStorage copy survives and tells us
 * that records disappeared, so we can warn instead of failing silently.
 */

const LS_MARKER = "ig:marker";
const META_INSTALL = "install";

type Counts = Record<TableName, number>;

interface LocalMarker {
  installId: string;
  counts: Counts;
  at: string;
}

const emptyCounts = (): Counts => ({ customers: 0, items: 0, invoices: 0, designs: 0 });

function readLocalMarker(): LocalMarker | null {
  try {
    const raw = localStorage.getItem(LS_MARKER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalMarker;
    return parsed && typeof parsed.installId === "string" ? parsed : null;
  } catch {
    return null;
  }
}

function writeLocalMarker(marker: LocalMarker) {
  try {
    localStorage.setItem(LS_MARKER, JSON.stringify(marker));
  } catch {
    // localStorage unavailable (privacy settings) — detection degrades gracefully.
  }
}

async function countAll(): Promise<Counts> {
  const db = getDb();
  const counts = emptyCounts();
  await Promise.all(
    COUNTED_TABLES.map(async (t) => {
      counts[t] = await db[t].count();
    }),
  );
  return counts;
}

async function getInstallId(): Promise<string | undefined> {
  const entry = await getDb().meta.get(META_INSTALL);
  return typeof entry?.value === "string" ? entry.value : undefined;
}

const total = (c: Counts) => COUNTED_TABLES.reduce((s, t) => s + (c[t] ?? 0), 0);

export async function checkIntegrity(): Promise<{ integrity: Integrity; detail: string }> {
  const db = getDb();
  const local = readLocalMarker();
  let installId = await getInstallId();
  const counts = await countAll();

  let integrity: Integrity = "ok";
  let detail = "";

  if (!installId) {
    installId = nanoid();
    await db.meta.put({ key: META_INSTALL, value: installId });
    if (local && total(local.counts) > 0) {
      integrity = "cleared";
      detail = `Previously saved: ${describeCounts(local.counts)}. These are no longer in this browser's storage.`;
    } else {
      integrity = "fresh";
    }
  } else if (local && local.installId === installId) {
    const missing = COUNTED_TABLES.filter((t) => counts[t] < (local.counts[t] ?? 0));
    if (missing.length) {
      integrity = "partial";
      const lost = Object.fromEntries(
        missing.map((t) => [t, local.counts[t] - counts[t]]),
      ) as Partial<Counts>;
      detail = `Missing since last visit: ${describeCounts(lost)}.`;
    }
  } else if (
    local &&
    local.installId !== installId &&
    total(local.counts) > 0 &&
    total(counts) === 0
  ) {
    integrity = "cleared";
    detail = `Previously saved: ${describeCounts(local.counts)}.`;
  }

  writeLocalMarker({ installId, counts, at: new Date().toISOString() });
  return { integrity, detail };
}

function describeCounts(c: Partial<Counts>): string {
  const labels: Record<TableName, [string, string]> = {
    invoices: ["invoice", "invoices"],
    customers: ["customer", "customers"],
    items: ["item", "items"],
    designs: ["saved design", "saved designs"],
  };
  return COUNTED_TABLES.filter((t) => (c[t] ?? 0) > 0)
    .map((t) => `${c[t]} ${c[t] === 1 ? labels[t][0] : labels[t][1]}`)
    .join(", ");
}

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/** Refresh the localStorage marker after writes. Deletions sync immediately. */
export function syncMarker(immediate = false) {
  if (syncTimer) clearTimeout(syncTimer);
  const run = async () => {
    syncTimer = null;
    try {
      const installId = await getInstallId();
      if (!installId) return;
      writeLocalMarker({ installId, counts: await countAll(), at: new Date().toISOString() });
    } catch {
      // ignore — this is a best-effort safety net
    }
  };
  if (immediate) void run();
  else syncTimer = setTimeout(run, 1500);
}

/** Forget the marker (used by "Clear all data" and full restore). */
export async function resetMarker() {
  try {
    localStorage.removeItem(LS_MARKER);
  } catch {
    /* noop */
  }
  const installId = nanoid();
  await getDb().meta.put({ key: META_INSTALL, value: installId });
  writeLocalMarker({ installId, counts: await countAll(), at: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/* Persistence, quota and environment                                  */
/* ------------------------------------------------------------------ */

export async function readPersistence(): Promise<Persistence> {
  if (typeof navigator === "undefined" || !navigator.storage?.persisted) return "unsupported";
  try {
    return (await navigator.storage.persisted()) ? "persisted" : "best-effort";
  } catch {
    return "unknown";
  }
}

export async function requestPersistence(): Promise<Persistence> {
  if (typeof navigator === "undefined" || !navigator.storage?.persist) return "unsupported";
  try {
    if (await navigator.storage.persisted()) return "persisted";
    return (await navigator.storage.persist()) ? "persisted" : "best-effort";
  } catch {
    return "unknown";
  }
}

export async function readEstimate(): Promise<{ usage: number; quota: number }> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate)
    return { usage: 0, quota: 0 };
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota };
  } catch {
    return { usage: 0, quota: 0 };
  }
}

export function detectSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /Safari\//.test(ua) && !/(Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Android)/.test(ua);
}

/**
 * Heuristic only: private windows usually get a small, fixed storage quota.
 * We keep the threshold conservative to avoid false alarms.
 */
export function looksPrivate(quota: number): boolean {
  return quota > 0 && quota < 120 * 1024 * 1024;
}

/** Run once on app start; populates the storage status store. */
export async function initStorageHealth() {
  const store = useStorageStatus.getState();
  try {
    const [{ integrity, detail }, persistence, estimate] = await Promise.all([
      checkIntegrity(),
      readPersistence(),
      readEstimate(),
    ]);
    store.set({
      ready: true,
      integrity,
      integrityDetail: detail,
      persistence,
      usage: estimate.usage,
      quota: estimate.quota,
      likelyPrivate: looksPrivate(estimate.quota),
      isSafari: detectSafari(),
    });
  } catch (error) {
    store.set({ ready: true });
    store.reportError(
      "This browser is blocking storage, so nothing can be saved.",
      error instanceof Error ? error.message : undefined,
    );
  }
}

export async function refreshEstimate() {
  const estimate = await readEstimate();
  useStorageStatus.getState().set({ usage: estimate.usage, quota: estimate.quota });
}
