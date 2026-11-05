"use client";

import type { ReactNode } from "react";
import { useMediaQuery } from "@/hooks/use-media-query";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/** Sheet that slides in from the right on desktop and up from the bottom on phones. */
export function ResponsiveSheet({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const wide = useMediaQuery("(min-width: 640px)");
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={wide ? "right" : "bottom"}
        title={title}
        description={description}
        className={cn(wide ? "sm:w-[min(480px,100vw)]" : "h-[88dvh]")}
      >
        {children}
      </SheetContent>
    </Sheet>
  );
}

/** Form body + sticky footer, sized to fill the sheet's scroll area. */
export function SheetForm({
  onSubmit,
  footer,
  children,
}: {
  onSubmit: () => void;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <form
      noValidate
      className="flex min-h-full flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid flex-1 content-start gap-4 px-5 pt-1 pb-5">{children}</div>
      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {footer}
      </div>
    </form>
  );
}
