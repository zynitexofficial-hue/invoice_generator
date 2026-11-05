"use client";

import { useEffect } from "react";
import { toast } from "sonner";

/**
 * Registers the offline service worker (public/sw.js, spec I1) in production
 * builds on secure origins, and offers "New version available — Reload" when an
 * update has been downloaded and is waiting.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!window.isSecureContext) return;

    let reloading = false;
    let userAccepted = false;
    let shownFor: ServiceWorker | null = null;

    const onControllerChange = () => {
      // Only reload when the user asked for the new version (first installs also
      // change the controller, and must not reload the page under the user).
      if (!userAccepted || reloading) return;
      reloading = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const offerUpdate = (worker: ServiceWorker) => {
      if (shownFor === worker || !navigator.serviceWorker.controller) return;
      shownFor = worker;
      toast("New version available", {
        description: "Reload to use the latest version. Your data stays as it is.",
        duration: Infinity,
        action: {
          label: "Reload",
          onClick: () => {
            userAccepted = true;
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      });
    };

    const watch = (registration: ServiceWorkerRegistration) => {
      if (registration.waiting) offerUpdate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed") offerUpdate(worker);
        });
      });
    };

    let registration: ServiceWorkerRegistration | undefined;
    const checkForUpdate = () => {
      if (document.visibilityState === "visible") void registration?.update().catch(() => {});
    };

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((reg) => {
        registration = reg;
        watch(reg);
      })
      .catch(() => {
        // Offline support is a bonus; the app works without it.
      });
    document.addEventListener("visibilitychange", checkForUpdate);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdate);
    };
  }, []);

  return null;
}
