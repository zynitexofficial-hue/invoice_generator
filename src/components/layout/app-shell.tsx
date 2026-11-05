"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Lock, Plus, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettings } from "@/db/hooks";
import { useLockStore } from "@/stores/lock-store";
import { useStorageStatus } from "@/stores/storage-status";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Tooltip } from "@/components/ui/tooltip";
import { Brand, BrandMark } from "./brand";
import { NAV_ITEMS, isActive, type NavItem } from "./nav";
import { QuickBar } from "./quick-bar";
import { ThemeIconButton, ThemeSegmented } from "./theme-toggle";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isEditor = pathname === "/invoice";
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="flex min-h-dvh">
      {/* The editor needs the width for form + preview, so the sidebar shrinks to an icon rail. */}
      <Sidebar pathname={pathname} compact={isEditor} />
      <div className={cn("flex min-w-0 flex-1 flex-col", isEditor ? "lg:pl-16" : "lg:pl-64")}>
        {/* The editor has its own toolbar; every other screen gets the quick bar. */}
        {!isEditor && <QuickBar onOpenMenu={() => setMenuOpen(true)} />}
        <MobileMenu pathname={pathname} open={menuOpen} onOpenChange={setMenuOpen} />
        <main
          className={cn(
            "flex min-w-0 flex-1 flex-col overflow-x-clip",
            !isEditor && "pb-24 lg:pb-0",
          )}
        >
          {children}
        </main>
      </div>
      {!isEditor && <MobileTabBar pathname={pathname} />}
    </div>
  );
}

/* ---------------- Desktop sidebar ---------------- */

function Sidebar({ pathname, compact }: { pathname: string; compact: boolean }) {
  const settings = useSettings();
  const lock = useLockStore((s) => s.lock);
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-border bg-surface/70 backdrop-blur-xl lg:flex",
        compact ? "w-16" : "w-64",
      )}
    >
      <div className={cn("flex h-16 items-center", compact ? "justify-center" : "px-5")}>
        <Link
          href="/dashboard"
          className="rounded-lg focus-visible:focus-ring"
          aria-label={compact ? "Dashboard" : undefined}
        >
          {compact ? <BrandMark /> : <Brand />}
        </Link>
      </div>
      <nav
        className={cn("flex-1 overflow-y-auto py-2", compact ? "px-2" : "px-3")}
        aria-label="Main"
      >
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <SidebarLink item={item} active={isActive(pathname, item)} compact={compact} />
            </li>
          ))}
        </ul>
      </nav>
      <div
        className={cn(
          "border-t border-border",
          compact ? "flex flex-col items-center gap-2 p-2" : "space-y-3 p-3",
        )}
      >
        <StorageStatusPill compact={compact} />
        {settings?.security?.pinEnabled &&
          (compact ? (
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
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => lock()}
            >
              <Lock className="size-4" />
              <span>Lock panel</span>
            </Button>
          ))}
        {compact ? <ThemeIconButton /> : <ThemeSegmented />}
      </div>
    </aside>
  );
}

function SidebarLink({
  item,
  active,
  compact = false,
}: {
  item: NavItem;
  active: boolean;
  compact?: boolean;
}) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      aria-label={compact ? item.label : undefined}
      className={cn(
        "relative flex h-9 items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:focus-ring",
        compact ? "justify-center" : "px-3",
        active
          ? "text-foreground"
          : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground",
      )}
    >
      {active && (
        <motion.span
          layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-surface-3 dark:bg-surface-2"
          transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
        />
      )}
      <Icon className={cn("relative size-[18px]", active && "text-primary")} />
      {!compact && <span className="relative">{item.label}</span>}
    </Link>
  );
  return compact ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  );
}

function StorageStatusPill({ compact = false }: { compact?: boolean }) {
  const { persistence, ready } = useStorageStatus();
  if (!ready) return <div className="h-9" />;
  const safe = persistence === "persisted";
  if (compact) {
    const label = safe ? "Storage protected" : "Storage not protected — back up regularly";
    return (
      <Tooltip content={label} side="right">
        <Link
          href="/settings?section=data"
          aria-label={label}
          className={cn(
            "flex size-9 items-center justify-center rounded-lg transition-colors focus-visible:focus-ring [&_svg]:size-[18px]",
            safe
              ? "text-success hover:bg-surface-2"
              : "bg-warning-soft text-warning-foreground hover:brightness-[0.98]",
          )}
        >
          {safe ? <ShieldCheck /> : <ShieldAlert />}
        </Link>
      </Tooltip>
    );
  }
  return (
    <Link
      href="/settings?section=data"
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs transition-colors focus-visible:focus-ring",
        safe
          ? "text-muted-foreground hover:bg-surface-2"
          : "bg-warning-soft text-warning-foreground hover:brightness-[0.98]",
      )}
    >
      {safe ? <ShieldCheck className="size-4 text-success" /> : <ShieldAlert className="size-4" />}
      <span className="leading-4">
        <span className="block font-medium text-foreground">
          {safe ? "Storage protected" : "Storage not protected"}
        </span>
        <span className="block">{safe ? "Saved in this browser" : "Back up regularly"}</span>
      </span>
    </Link>
  );
}

/* ---------------- Mobile ---------------- */

function MobileMenu({
  pathname,
  open,
  onOpenChange,
}: {
  pathname: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const settings = useSettings();
  const lock = useLockStore((s) => s.lock);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" title="Menu" hideHeader>
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center px-5">
            <Brand />
          </div>
          <nav className="flex-1 px-3" aria-label="Main">
            <ul className="space-y-0.5">
              {NAV_ITEMS.map((item) => (
                <li key={item.href} onClick={() => onOpenChange(false)}>
                  <SidebarLink item={item} active={isActive(pathname, item)} />
                </li>
              ))}
            </ul>
          </nav>
          <div className="space-y-3 border-t border-border p-3">
            <StorageStatusPill />
            {settings?.security?.pinEnabled && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onOpenChange(false);
                  lock();
                }}
              >
                <Lock className="size-4" />
                <span>Lock panel</span>
              </Button>
            )}
            <ThemeSegmented />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const TAB_ITEMS = ["/dashboard", "/history", "/customers", "/settings"];

function MobileTabBar({ pathname }: { pathname: string }) {
  const items = TAB_ITEMS.map((href) => NAV_ITEMS.find((n) => n.href === href)!);
  const left = items.slice(0, 2);
  const right = items.slice(2);
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      <div className="mx-auto grid h-16 max-w-md grid-cols-5 items-center px-2">
        {left.map((item) => (
          <TabLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
        <div className="flex justify-center">
          <Link
            href="/invoice?new=1"
            aria-label="New invoice"
            className="flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md transition-transform focus-visible:focus-ring active:scale-95"
          >
            <Plus className="size-6" />
          </Link>
        </div>
        {right.map((item) => (
          <TabLink key={item.href} item={item} active={isActive(pathname, item)} />
        ))}
      </div>
    </nav>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex flex-col items-center gap-1 rounded-xl py-1.5 text-[11px] font-medium transition-colors focus-visible:focus-ring",
        active ? "text-primary" : "text-muted-foreground",
      )}
    >
      <Icon className="size-5" />
      {item.label}
    </Link>
  );
}

export { BrandMark };
