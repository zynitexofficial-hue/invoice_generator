"use client";

import { create } from "zustand";
import { readPersistence, requestPersistence } from "@/db/health";
import { useStorageStatus } from "./storage-status";

/** Chrome/Edge's deferred install prompt event (not in the TS DOM lib). */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface InstallState {
  /** Browser offered an install prompt we can trigger from our own button. */
  canPrompt: boolean;
  /** Running as an installed app (standalone window). */
  installed: boolean;
  /** Instructions dialog for browsers without a programmatic install prompt. */
  helpOpen: boolean;
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** Best available install flow: native prompt, otherwise the instructions dialog. */
  install: () => Promise<void>;
  setHelpOpen: (open: boolean) => void;
}

let deferred: BeforeInstallPromptEvent | null = null;

export const useInstall = create<InstallState>(() => ({
  canPrompt: false,
  installed: false,
  helpOpen: false,
  setHelpOpen: (helpOpen) => useInstall.setState({ helpOpen }),
  install: async () => {
    const outcome = await useInstall.getState().promptInstall();
    if (outcome === "unavailable") useInstall.setState({ helpOpen: true });
  },
  promptInstall: async () => {
    if (!deferred) return "unavailable";
    const event = deferred;
    deferred = null;
    useInstall.setState({ canPrompt: false });
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome;
  },
}));

/**
 * Installed apps are usually granted persistent storage, so after installing
 * we ask again and refresh the status shown in the UI.
 */
async function refreshPersistenceAfterInstall() {
  const persistence = await requestPersistence();
  useStorageStatus
    .getState()
    .set({ persistence: persistence === "unknown" ? await readPersistence() : persistence });
}

/** Wire up install events once on app start (see Providers). */
export function initInstallListeners() {
  if (typeof window === "undefined") return () => {};
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  useInstall.setState({ installed: standalone });

  // The layout captures an early event (before hydration) on window.__bip.
  const early = (window as Window & { __bip?: BeforeInstallPromptEvent }).__bip;
  if (early) {
    deferred = early;
    useInstall.setState({ canPrompt: true });
  }

  const onPrompt = (e: Event) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    useInstall.setState({ canPrompt: true });
  };
  const onInstalled = () => {
    deferred = null;
    useInstall.setState({ canPrompt: false, installed: true });
    void refreshPersistenceAfterInstall();
  };
  window.addEventListener("beforeinstallprompt", onPrompt);
  window.addEventListener("appinstalled", onInstalled);
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt);
    window.removeEventListener("appinstalled", onInstalled);
  };
}
