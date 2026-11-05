"use client";

import { useEffect, useRef } from "react";
import { useSettings } from "@/db/hooks";
import { useLockStore } from "@/stores/lock-store";
import { PinLockScreen } from "./pin-lock-screen";

export function LockScreenHost() {
  const settings = useSettings();
  const syncWithSettings = useLockStore((s) => s.syncWithSettings);
  const recordActivity = useLockStore((s) => s.recordActivity);
  const isLocked = useLockStore((s) => s.isLocked);
  const lastActivityReportRef = useRef<number>(0);

  // Synchronize lock state when settings change
  useEffect(() => {
    if (!settings) return;
    const pinEnabled = Boolean(settings.security?.pinEnabled);
    const autoLockMinutes = settings.security?.autoLockMinutes ?? 15;
    syncWithSettings(pinEnabled, autoLockMinutes);
  }, [settings, syncWithSettings]);

  // Track user activity to manage inactivity timeout
  useEffect(() => {
    if (!settings?.security?.pinEnabled) return;

    const handleUserActivity = () => {
      const now = Date.now();
      // Throttle activity recording to at most once every 5 seconds
      if (now - lastActivityReportRef.current > 5_000) {
        lastActivityReportRef.current = now;
        recordActivity();
      }
    };

    const events = ["pointerdown", "keydown", "touchstart", "scroll"];
    for (const event of events) {
      window.addEventListener(event, handleUserActivity, { passive: true });
    }

    // Periodic check every 10 seconds for idle timeout expiration
    const interval = setInterval(() => {
      const autoLock = settings.security?.autoLockMinutes ?? 15;
      if (autoLock > 0) {
        syncWithSettings(true, autoLock);
      }
    }, 10_000);

    return () => {
      for (const event of events) {
        window.removeEventListener(event, handleUserActivity);
      }
      clearInterval(interval);
    };
  }, [settings?.security?.pinEnabled, settings?.security?.autoLockMinutes, recordActivity, syncWithSettings]);

  if (!isLocked) return null;

  return <PinLockScreen />;
}
