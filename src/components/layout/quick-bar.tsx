"use client";

import {
  ChevronDown,
  FolderOpen,
  HardDriveDownload,
  HardDriveUpload,
  Lock,
  Menu,
  Plus,
  Search,
} from "lucide-react";
import Link from "next/link";
import { useSettings } from "@/db/hooks";
import { useLockStore } from "@/stores/lock-store";
import { useMounted } from "@/hooks/use-mounted";
import { DOC_TYPE_META } from "@/lib/documents";
import { DOC_TYPES } from "@/lib/schema";
import { backupNow, openInvoiceFile, startRestore } from "@/components/storage/file-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/misc";
import { Tooltip } from "@/components/ui/tooltip";
import { Brand } from "./brand";
import { modKey, usePalette } from "./command-palette";
import { InstallAppButton } from "./install-app";
import { ThemeIconButton } from "./theme-toggle";

/**
 * Always-visible toolbar at the top of every app screen: search / command
 * palette, new document, open file, backup & restore, install, theme.
 */
export function QuickBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const openPalette = () => usePalette.getState().setOpen(true);
  const mounted = useMounted();
  const settings = useSettings();
  const lock = useLockStore((s) => s.lock);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="flex h-14 items-center gap-2 px-3 sm:px-4 lg:px-6">
        <Link
          href="/dashboard"
          className="mr-1 rounded-lg focus-visible:focus-ring lg:hidden"
          aria-label="Dashboard"
        >
          <Brand />
        </Link>

        {/* Search / command palette */}
        <button
          type="button"
          onClick={openPalette}
          className="group hidden h-9 w-full max-w-sm items-center gap-2.5 rounded-lg border border-border bg-surface px-3 text-sm text-subtle-foreground shadow-xs transition-colors hover:border-border-strong hover:text-muted-foreground focus-visible:focus-ring lg:flex"
        >
          <Search className="size-4" />
          <span className="flex-1 text-left">Search or jump to…</span>
          <span className="flex gap-1" suppressHydrationWarning>
            <Kbd>{mounted ? modKey() : "Ctrl"}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>

        <div className="ml-auto flex items-center gap-1">
          <Tooltip content="Search & commands">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search and commands"
              onClick={openPalette}
              className="lg:hidden"
            >
              <Search />
            </Button>
          </Tooltip>

          <div className="hidden items-center gap-1 sm:flex">
            <Tooltip content="Open invoice file (.json)">
              <Button
                variant="ghost"
                size="sm"
                onClick={openInvoiceFile}
                aria-label="Open invoice file"
              >
                <FolderOpen />
                <span className="hidden xl:inline">Open file</span>
              </Button>
            </Tooltip>

            <DropdownMenu>
              <Tooltip content="Backup & restore">
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" aria-label="Backup and restore">
                    <HardDriveDownload />
                    <span className="hidden xl:inline">Backup</span>
                    <ChevronDown className="!size-3.5 text-subtle-foreground" />
                  </Button>
                </DropdownMenuTrigger>
              </Tooltip>
              <DropdownMenuContent className="w-60">
                <DropdownMenuItem icon={<HardDriveDownload />} onSelect={() => void backupNow()}>
                  Download backup
                </DropdownMenuItem>
                <DropdownMenuItem icon={<HardDriveUpload />} onSelect={startRestore}>
                  Restore from backup
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <InstallAppButton label={false} className="sm:hidden" />
          <InstallAppButton className="hidden sm:inline-flex" />
          <ThemeIconButton />

          {settings?.security?.pinEnabled && (
            <Tooltip content="Lock panel">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Lock panel"
                onClick={() => lock()}
              >
                <Lock className="size-4" />
              </Button>
            </Tooltip>
          )}

          <NewDocumentMenu />

          <Button
            variant="ghost"
            size="icon"
            aria-label="Open menu"
            onClick={onOpenMenu}
            className="lg:hidden"
          >
            <Menu />
          </Button>
        </div>
      </div>
    </header>
  );
}

function NewDocumentMenu() {
  return (
    <div className="ml-1 hidden sm:flex">
      <Button variant="primary" size="sm" asChild className="rounded-r-none">
        <Link href="/invoice?new=1">
          <Plus />
          New
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="primary"
            size="sm"
            className="rounded-l-none border-l border-white/20 px-1.5"
            aria-label="Choose document type"
          >
            <ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-72">
          <DropdownMenuLabel>New document</DropdownMenuLabel>
          {DOC_TYPES.map((t) => (
            <DropdownMenuItem key={t} asChild>
              <Link href={`/invoice?new=1&type=${t}`} className="!items-start">
                <span>
                  <span className="block font-medium">{DOC_TYPE_META[t].label}</span>
                  <span className="block text-xs text-muted-foreground">
                    {DOC_TYPE_META[t].description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<FolderOpen />} onSelect={openInvoiceFile}>
            Open invoice file…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
