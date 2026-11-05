"use client";

import { ArrowRight, Menu } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Brand } from "@/components/layout/brand";
import { ThemeIconButton } from "@/components/layout/theme-toggle";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";

const LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#templates", label: "Templates" },
  { href: "/gst-calculator", label: "GST calculator" },
  { href: "/guides", label: "GST guides" },
  { href: "/#faq", label: "FAQ" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link
          href="/"
          className="rounded-lg focus-visible:focus-ring"
          aria-label="Invoice Studio home"
        >
          <Brand />
        </Link>
        <nav aria-label="Primary" className="hidden flex-1 md:block">
          <ul className="flex items-center gap-1">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:focus-ring"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeIconButton />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/dashboard">Open app</Link>
          </Button>
          <Button variant="primary" asChild className="hidden sm:inline-flex">
            <Link href="/invoice?new=1">
              Create invoice
              <ArrowRight />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </Button>
        </div>
      </div>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" title="Menu">
          <nav aria-label="Mobile" className="px-3 pb-6">
            <ul className="space-y-1">
              {LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-2.5 text-[15px] font-medium hover:bg-surface-2"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
            <div className="mt-4 grid gap-2 px-1">
              <Button variant="primary" asChild>
                <Link href="/invoice?new=1">Create invoice — free</Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link href="/dashboard">Open app</Link>
              </Button>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}
