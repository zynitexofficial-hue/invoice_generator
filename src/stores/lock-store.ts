import { create } from "zustand";

const UNLOCKED_KEY = "ig:pin_unlocked";
const LAST_ACTIVE_KEY = "ig:pin_last_active";
const LOCKOUT_KEY = "ig:pin_lockout_until";
const FAILED_COUNT_KEY = "ig:pin_failed_attempts";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 30_000; // 30 seconds

interface LockState {
  /** Whether the screen is currently locked and requires PIN entry. */
  isLocked: boolean;
  /** Timestamp in ms until lockout ends, or null if not locked out. */
  lockoutUntil: number | null;
  /** Number of consecutive failed attempts. */
  failedAttempts: number;
  /** Manually lock the panel now. */
  lock: () => void;
  /** Mark panel as unlocked for current session. */
  unlock: () => void;
  /** Record a wrong PIN attempt, triggering lockout if max reached. */
  recordFailedAttempt: () => void;
  /** Reset failed attempts counter. */
  resetAttempts: () => void;
  /** Record active user interaction to prolong session timeout. */
  recordActivity: () => void;
  /** Synchronize lock state against settings and session storage. */
  syncWithSettings: (pinEnabled: boolean, autoLockMinutes: number) => void;
}

function getStoredLockout(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(LOCKOUT_KEY);
    if (!raw) return null;
    const time = parseInt(raw, 10);
    if (Number.isFinite(time) && time > Date.now()) {
      return time;
    }
    sessionStorage.removeItem(LOCKOUT_KEY);
  } catch {
    /* ignore */
  }
  return null;
}

function getStoredFailedAttempts(): number {
  if (typeof window === "undefined") return 0;
  try {
    const raw = sessionStorage.getItem(FAILED_COUNT_KEY);
    return raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    return 0;
  }
}

export const useLockStore = create<LockState>((set, get) => ({
  isLocked: false,
  lockoutUntil: null,
  failedAttempts: 0,

  lock: () => {
    try {
      sessionStorage.removeItem(UNLOCKED_KEY);
    } catch {
      /* ignore */
    }
    set({ isLocked: true });
  },

  unlock: () => {
    try {
      sessionStorage.setItem(UNLOCKED_KEY, "1");
      sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
      sessionStorage.removeItem(FAILED_COUNT_KEY);
      sessionStorage.removeItem(LOCKOUT_KEY);
    } catch {
      /* ignore */
    }
    set({
      isLocked: false,
      failedAttempts: 0,
      lockoutUntil: null,
    });
  },

  recordFailedAttempt: () => {
    const nextAttempts = get().failedAttempts + 1;
    let lockout: number | null = null;

    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      lockout = Date.now() + LOCKOUT_DURATION_MS;
      try {
        sessionStorage.setItem(LOCKOUT_KEY, lockout.toString());
      } catch {
        /* ignore */
      }
    }

    try {
      sessionStorage.setItem(FAILED_COUNT_KEY, nextAttempts.toString());
    } catch {
      /* ignore */
    }

    set({
      failedAttempts: nextAttempts,
      lockoutUntil: lockout,
    });
  },

  resetAttempts: () => {
    try {
      sessionStorage.removeItem(FAILED_COUNT_KEY);
      sessionStorage.removeItem(LOCKOUT_KEY);
    } catch {
      /* ignore */
    }
    set({ failedAttempts: 0, lockoutUntil: null });
  },

  recordActivity: () => {
    if (get().isLocked) return;
    try {
      sessionStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
    } catch {
      /* ignore */
    }
  },

  syncWithSettings: (pinEnabled: boolean, autoLockMinutes: number) => {
    if (typeof window === "undefined") return;

    if (!pinEnabled) {
      if (get().isLocked) {
        set({ isLocked: false });
      }
      return;
    }

    // PIN is enabled: check session unlock status
    let unlocked = false;
    let lastActive = 0;
    try {
      unlocked = sessionStorage.getItem(UNLOCKED_KEY) === "1";
      const lastActiveRaw = sessionStorage.getItem(LAST_ACTIVE_KEY);
      lastActive = lastActiveRaw ? parseInt(lastActiveRaw, 10) || 0 : 0;
    } catch {
      unlocked = false;
    }

    // Check inactivity timeout
    if (unlocked && autoLockMinutes > 0 && lastActive > 0) {
      const elapsedMs = Date.now() - lastActive;
      const maxMs = autoLockMinutes * 60 * 1000;
      if (elapsedMs > maxMs) {
        unlocked = false;
        try {
          sessionStorage.removeItem(UNLOCKED_KEY);
        } catch {
          /* ignore */
        }
      }
    }

    const currentLockout = getStoredLockout();
    const currentFailed = getStoredFailedAttempts();

    const shouldBeLocked = !unlocked;
    if (
      get().isLocked !== shouldBeLocked ||
      get().lockoutUntil !== currentLockout ||
      get().failedAttempts !== currentFailed
    ) {
      set({
        isLocked: shouldBeLocked,
        lockoutUntil: currentLockout,
        failedAttempts: currentFailed,
      });
    }
  },
}));
