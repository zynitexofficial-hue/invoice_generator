"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "@/db/hooks";
import { updateSettings } from "@/db/settings";
import type { AppSettings } from "@/lib/schema";

export type DraftStatus = "idle" | "saving" | "saved" | "error";
type Key = keyof AppSettings;

/**
 * Local, instantly-responsive copy of settings that autosaves (debounced).
 * Only the top-level groups the user touched are written back, so updates
 * made elsewhere meanwhile (e.g. "last backup" time) are never overwritten.
 */
export function useSettingsDraft() {
  const settings = useSettings();
  const [draft, setDraft] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState<DraftStatus>("idle");
  const dirty = useRef(new Set<Key>());
  const latest = useRef<AppSettings | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!settings) return;
    if (!latest.current) {
      latest.current = settings;
      setDraft(settings);
      return;
    }
    // Synchronize non-dirty keys whenever database settings change
    const dirtyKeys = dirty.current;
    let changed = false;
    const merged = { ...latest.current };
    for (const key of Object.keys(settings) as Key[]) {
      if (!dirtyKeys.has(key) && merged[key] !== settings[key]) {
        (merged as Record<Key, unknown>)[key] = settings[key];
        changed = true;
      }
    }
    if (changed) {
      latest.current = merged;
      setDraft(merged);
    }
  }, [settings]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const keys = [...dirty.current];
    const snapshot = latest.current;
    if (!keys.length || !snapshot) return;
    dirty.current.clear();
    setStatus("saving");
    try {
      await updateSettings((current) => {
        const next = { ...current };
        for (const k of keys) (next as Record<Key, unknown>)[k] = snapshot[k];
        return next;
      });
      setStatus("saved");
    } catch {
      keys.forEach((k) => dirty.current.add(k));
      setStatus("error");
    }
  }, []);

  useEffect(() => () => void flush(), [flush]);

  const update = useCallback(
    <K extends Key>(key: K, value: AppSettings[K] | ((prev: AppSettings[K]) => AppSettings[K])) => {
      if (!latest.current) return;
      const prev = latest.current[key];
      const nextValue =
        typeof value === "function"
          ? (value as (p: AppSettings[K]) => AppSettings[K])(prev)
          : value;
      latest.current = { ...latest.current, [key]: nextValue };
      dirty.current.add(key);
      setDraft(latest.current);
      setStatus("saving");
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), 500);
    },
    [flush],
  );

  return { draft, update, status, flush };
}

export type SettingsUpdate = ReturnType<typeof useSettingsDraft>["update"];
