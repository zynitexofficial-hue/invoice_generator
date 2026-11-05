import { create } from "zustand";

export type Persistence = "persisted" | "best-effort" | "unsupported" | "unknown";
export type Integrity = "ok" | "fresh" | "cleared" | "partial";

export interface StorageError {
  message: string;
  detail?: string;
  at: number;
}

interface StorageStatusState {
  ready: boolean;
  persistence: Persistence;
  usage: number;
  quota: number;
  likelyPrivate: boolean;
  isSafari: boolean;
  integrity: Integrity;
  integrityDetail: string;
  error: StorageError | null;
  set: (partial: Partial<Omit<StorageStatusState, "set" | "reportError" | "clearError">>) => void;
  reportError: (message: string, detail?: string) => void;
  clearError: () => void;
}

export const useStorageStatus = create<StorageStatusState>((set) => ({
  ready: false,
  persistence: "unknown",
  usage: 0,
  quota: 0,
  likelyPrivate: false,
  isSafari: false,
  integrity: "ok",
  integrityDetail: "",
  error: null,
  set: (partial) => set(partial),
  reportError: (message, detail) => set({ error: { message, detail, at: Date.now() } }),
  clearError: () => set({ error: null }),
}));

/** Human-readable explanation of an IndexedDB failure. */
export function describeStorageError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  const inner = (error as { inner?: { name?: string } } | null)?.inner?.name ?? "";
  if (name === "QuotaExceededError" || inner === "QuotaExceededError")
    return "Your browser's storage is full.";
  if (name === "InvalidStateError" || name === "DatabaseClosedError")
    return "The browser blocked access to storage (private mode or storage disabled).";
  if (name === "VersionError") return "This page is open with an older version in another tab.";
  return error instanceof Error ? error.message : "Unknown storage error";
}
