"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { DialogOverlay } from "./dialog";

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

const sides = {
  right:
    "inset-y-0 right-0 h-full w-[min(440px,100vw)] border-l data-[state=open]:animate-sheet-in-right data-[state=closed]:animate-sheet-out-right",
  left: "inset-y-0 left-0 h-full w-[min(300px,85vw)] border-r data-[state=open]:animate-sheet-in-left data-[state=closed]:animate-sheet-out-left",
  bottom:
    "inset-x-0 bottom-0 max-h-[88dvh] rounded-t-2xl border-t data-[state=open]:animate-sheet-in-bottom data-[state=closed]:animate-sheet-out-bottom",
};

export interface SheetContentProps extends Omit<
  ComponentPropsWithoutRef<typeof DialogPrimitive.Content>,
  "title"
> {
  side?: keyof typeof sides;
  title: ReactNode;
  description?: ReactNode;
  hideHeader?: boolean;
}

export const SheetContent = forwardRef<HTMLDivElement, SheetContentProps>(function SheetContent(
  { side = "right", className, children, title, description, hideHeader, ...props },
  ref,
) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 flex flex-col border-border bg-surface text-foreground shadow-lg outline-none",
          sides[side],
          className,
        )}
        {...props}
      >
        {side === "bottom" && (
          <div
            className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-border-strong"
            aria-hidden
          />
        )}
        <div
          className={cn(
            "flex items-start justify-between gap-3 px-5 pt-4 pb-3",
            hideHeader && "sr-only",
          )}
        >
          <div className="min-w-0">
            <DialogPrimitive.Title className="text-base font-semibold">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={cn("text-sm text-muted-foreground", !description && "sr-only")}
            >
              {description ?? title}
            </DialogPrimitive.Description>
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mt-1 -mr-1.5">
              <X />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});
