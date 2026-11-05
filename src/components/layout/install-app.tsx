"use client";

import { AppWindow, ChevronDown, MonitorDown, Smartphone } from "lucide-react";
import { useState } from "react";
import { useMounted } from "@/hooks/use-mounted";
import { cn } from "@/lib/utils";
import { useInstall } from "@/stores/install";
import { Button } from "@/components/ui/button";
import { Collapse } from "@/components/ui/collapse";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Tooltip } from "@/components/ui/tooltip";

/** Compact "Install app" button; hidden once the app runs installed. */
export function InstallAppButton({
  className,
  label = true,
}: {
  className?: string;
  label?: boolean;
}) {
  const mounted = useMounted();
  const installed = useInstall((s) => s.installed);
  const install = useInstall((s) => s.install);
  if (!mounted || installed) return null;
  const button = (
    <Button
      variant="soft"
      size={label ? "sm" : "icon-sm"}
      onClick={() => void install()}
      className={className}
      aria-label="Install app"
    >
      <MonitorDown />
      {label && <span>Install app</span>}
    </Button>
  );
  return label ? (
    button
  ) : (
    <Tooltip content="Install app — works like a desktop/phone app">{button}</Tooltip>
  );
}

type Platform = "ios" | "android" | "safari-mac" | "firefox" | "chromium";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "chromium";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Safari\//.test(ua) && !/(Chrome|Chromium|Edg|OPR)/.test(ua)) return "safari-mac";
  return "chromium";
}

const STEPS: Record<Platform, { title: string; steps: string[] }> = {
  chromium: {
    title: "Chrome or Edge on a computer",
    steps: [
      "Look for the install icon at the right end of the address bar and click it.",
      "Or open the browser menu (⋮ or …) → “Cast, save and share” / “Apps” → “Install Invoice Studio”.",
    ],
  },
  android: {
    title: "Android (Chrome)",
    steps: [
      "Tap the ⋮ menu in the top-right corner.",
      "Choose “Install app” or “Add to Home screen”.",
    ],
  },
  ios: {
    title: "iPhone or iPad (Safari)",
    steps: ["Tap the Share button.", "Choose “Add to Home Screen”, then “Add”."],
  },
  "safari-mac": {
    title: "Safari on Mac",
    steps: ["Open the File menu.", "Choose “Add to Dock”."],
  },
  firefox: {
    title: "Firefox",
    steps: [
      "Firefox on computers can't install web apps. Bookmark this page instead, or open it in Chrome or Edge to install.",
      "On Android, use the ⋮ menu → “Install”.",
    ],
  },
};

/** Mounted once in the app layout; opened by useInstall().install() when no native prompt exists. */
export function InstallHelpDialog() {
  const open = useInstall((s) => s.helpOpen);
  const setOpen = useInstall((s) => s.setHelpOpen);
  const platform = detectPlatform();
  const others = (Object.keys(STEPS) as Platform[]).filter((p) => p !== platform);
  const [showOthers, setShowOthers] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent size="md">
        <DialogHeader
          icon={<AppWindow />}
          title="Install Invoice Studio"
          description="Get a home-screen / desktop app that opens in its own window — and browsers usually protect an installed app's data from automatic cleanup."
        />
        <DialogBody className="space-y-3">
          <PlatformSteps platform={platform} highlighted />
          <div className="rounded-xl border border-border">
            <button
              type="button"
              onClick={() => setShowOthers((v) => !v)}
              aria-expanded={showOthers}
              className="flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm font-medium focus-visible:focus-ring"
            >
              Other browsers and devices
              <ChevronDown
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  showOthers && "rotate-180",
                )}
              />
            </button>
            <Collapse open={showOthers}>
              <div className="space-y-3 border-t border-border p-3">
                {others.map((p) => (
                  <PlatformSteps key={p} platform={p} />
                ))}
              </div>
            </Collapse>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="primary" onClick={() => setOpen(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlatformSteps({ platform, highlighted }: { platform: Platform; highlighted?: boolean }) {
  const info = STEPS[platform];
  const Icon = platform === "ios" || platform === "android" ? Smartphone : MonitorDown;
  return (
    <div
      className={cn(
        "rounded-xl p-4",
        highlighted ? "bg-primary-soft/50 ring-1 ring-primary/20" : "bg-surface-2/50",
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="size-4 text-primary" />
        {info.title}
        {highlighted && (
          <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
            Your browser
          </span>
        )}
      </div>
      <ol className="mt-2 list-decimal space-y-1 pl-5 text-[13px] leading-5 text-muted-foreground">
        {info.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </div>
  );
}
