"use client";

import { Command } from "cmdk";
import {
  Braces,
  FileText,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  Keyboard,
  Lock,
  Monitor,
  MonitorDown,
  Moon,
  Search,
  Sun,
} from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, type ReactNode } from "react";
import { create } from "zustand";
import { useInvoices, useSettings } from "@/db/hooks";
import { DOC_TYPE_META } from "@/lib/documents";
import { DOC_TYPES } from "@/lib/schema";
import { useInstall } from "@/stores/install";
import { useLockStore } from "@/stores/lock-store";
import { backupNow, openInvoiceFile, startRestore } from "@/components/storage/file-actions";
import { Kbd } from "@/components/ui/misc";
import { NAV_ITEMS } from "./nav";

interface PaletteState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePalette = create<PaletteState>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

const isMac = () =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
export const modKey = () => (isMac() ? "⌘" : "Ctrl");

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));
}

/** Global keyboard shortcuts (registered once in the app layout). */
export function useGlobalShortcuts() {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useLockStore.getState().isLocked) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        usePalette.getState().setOpen(!usePalette.getState().open);
        return;
      }
      if (isTyping(e.target) || mod) return;
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        router.push("/invoice?new=1");
      } else if (e.key === "/" && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        usePalette.getState().setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

export function CommandPalette() {
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);
  const router = useRouter();
  const { setTheme } = useTheme();
  const install = useInstall((s) => s.install);
  const installed = useInstall((s) => s.installed);
  const invoices = useInvoices();
  const settings = useSettings();
  const lock = useLockStore((s) => s.lock);
  useGlobalShortcuts();

  const run = (fn: () => void) => {
    setOpen(false);
    // Let the dialog close before navigating or opening pickers.
    requestAnimationFrame(fn);
  };
  const go = (href: string) => run(() => router.push(href));
  const mod = modKey();

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-overlay backdrop-blur-[2px] data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-[60] w-[calc(100vw-1.5rem)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-lg outline-none data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <Command loop className="flex max-h-[min(560px,76dvh)] flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <Search className="size-[18px] shrink-0 text-muted-foreground" />
              <Command.Input
                autoFocus
                placeholder="Search actions, pages, documents…"
                className="h-14 w-full bg-transparent text-sm outline-none placeholder:text-subtle-foreground sm:text-[15px]"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="py-10 text-center text-sm text-muted-foreground">
                No results
              </Command.Empty>

              <Group heading="Create">
                {DOC_TYPES.map((t) => (
                  <Item
                    key={t}
                    icon={<FileText />}
                    onSelect={() => go(`/invoice?new=1&type=${t}`)}
                    shortcut={t === "tax_invoice" ? "Alt N" : undefined}
                    keywords={["new", "create", DOC_TYPE_META[t].shortLabel]}
                  >
                    New {DOC_TYPE_META[t].label.toLowerCase()}
                  </Item>
                ))}
              </Group>

              <Group heading="Go to">
                {NAV_ITEMS.map((n) => {
                  const Icon = n.icon;
                  return (
                    <Item
                      key={n.href}
                      icon={<Icon />}
                      onSelect={() => go(n.href)}
                      keywords={["open", "go"]}
                    >
                      {n.label}
                    </Item>
                  );
                })}
              </Group>

              {invoices && invoices.length > 0 && (
                <Group heading="Recent documents">
                  {invoices.slice(0, 8).map((inv) => (
                    <Item
                      key={inv.id}
                      icon={<FileText />}
                      onSelect={() => go(`/invoice?id=${inv.id}`)}
                      keywords={[inv.customer.name, inv.customer.company, inv.number]}
                    >
                      <span className="tabular-nums">{inv.number || "Untitled"}</span>
                      <span className="ml-2 text-muted-foreground">
                        {inv.customer.name || inv.customer.company}
                      </span>
                    </Item>
                  ))}
                </Group>
              )}

              <Group heading="Data">
                <Item
                  icon={<FolderOpen />}
                  onSelect={() => run(openInvoiceFile)}
                  keywords={["import", "json", "file"]}
                >
                  Open invoice file
                </Item>
                <Item
                  icon={<HardDriveDownload />}
                  onSelect={() => run(() => void backupNow())}
                  keywords={["export", "save", "download"]}
                >
                  Download backup
                </Item>
                <Item
                  icon={<HardDriveUpload />}
                  onSelect={() => run(startRestore)}
                  keywords={["import", "restore", "load"]}
                >
                  Restore from backup
                </Item>
                {!installed && (
                  <Item
                    icon={<MonitorDown />}
                    onSelect={() => run(() => void install())}
                    keywords={["pwa", "desktop", "home screen"]}
                  >
                    Install app
                  </Item>
                )}
              </Group>

              <Group heading="Appearance">
                <Item
                  icon={<Sun />}
                  onSelect={() => run(() => setTheme("light"))}
                  keywords={["theme"]}
                >
                  Light theme
                </Item>
                <Item
                  icon={<Moon />}
                  onSelect={() => run(() => setTheme("dark"))}
                  keywords={["theme"]}
                >
                  Dark theme
                </Item>
                <Item
                  icon={<Monitor />}
                  onSelect={() => run(() => setTheme("system"))}
                  keywords={["theme"]}
                >
                  System theme
                </Item>
              </Group>

              {settings?.security?.pinEnabled && (
                <Group heading="Security">
                  <Item
                    icon={<Lock />}
                    onSelect={() => run(() => lock())}
                    keywords={["lock", "pin", "screen", "security", "protect"]}
                  >
                    Lock panel now
                  </Item>
                </Group>
              )}
            </Command.List>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-border bg-surface-2/60 px-4 py-2.5 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Keyboard className="size-3.5" /> Shortcuts
              </span>
              <span className="flex items-center gap-1">
                <Kbd>{mod}</Kbd>
                <Kbd>K</Kbd> palette
              </span>
              <span className="flex items-center gap-1">
                <Kbd>Alt</Kbd>
                <Kbd>N</Kbd> new invoice
              </span>
              <span className="flex items-center gap-1">
                <Kbd>{mod}</Kbd>
                <Kbd>S</Kbd> save
              </span>
              <span className="flex items-center gap-1">
                <Kbd>{mod}</Kbd>
                <Kbd>P</Kbd> download PDF
              </span>
              <span className="hidden items-center gap-1 sm:flex">
                <Braces className="size-3" /> in the editor
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Group({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="mb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle-foreground [&_[cmdk-group-heading]]:uppercase"
    >
      {children}
    </Command.Group>
  );
}

function Item({
  icon,
  children,
  onSelect,
  shortcut,
  keywords,
}: {
  icon: ReactNode;
  children: ReactNode;
  onSelect: () => void;
  shortcut?: string;
  keywords?: string[];
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      keywords={keywords?.filter(Boolean)}
      className="flex cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors duration-75 outline-none data-[selected=true]:bg-surface-2 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground"
    >
      {icon}
      <span className="flex min-w-0 flex-1 items-center truncate">{children}</span>
      {shortcut && (
        <span className="flex gap-1">
          {shortcut.split(" ").map((k) => (
            <Kbd key={k}>{k}</Kbd>
          ))}
        </span>
      )}
    </Command.Item>
  );
}
