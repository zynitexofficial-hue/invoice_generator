"use client";

import { useEffect } from "react";
import { isAutoBackupSupported, refreshAutoBackupStatus, runAutoBackup } from "@/lib/auto-backup";

const CHECK_EVERY_MS = 3 * 60 * 1000;

/**
 * Background trigger for automatic folder backups (spec I2). Checks every few
 * minutes and when the tab is hidden or closed; runAutoBackup() itself decides
 * whether a backup is due (data changed + not yet written today) and never
 * shows a permission prompt.
 */
export function AutoBackupRunner() {
  useEffect(() => {
    if (!isAutoBackupSupported()) {
      void refreshAutoBackupStatus();
      return;
    }
    const tick = () => void runAutoBackup().catch(() => undefined);
    const first = setTimeout(tick, 5_000);
    const timer = setInterval(tick, CHECK_EVERY_MS);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") tick();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", tick);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", tick);
    };
  }, []);
  return null;
}
