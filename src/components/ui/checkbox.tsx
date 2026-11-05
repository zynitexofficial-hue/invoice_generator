"use client";

import { Checkbox as CheckboxPrimitive } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

export const Checkbox = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer group inline-flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border border-border-strong bg-surface shadow-xs",
        "transition-[background-color,border-color] duration-150",
        "hover:border-primary/70 data-[state=checked]:border-primary data-[state=checked]:bg-primary",
        "focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <svg viewBox="0 0 16 16" fill="none" className="size-3 text-primary-foreground" aria-hidden>
        <path
          d="M3.5 8.5l3 3 6-7"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-[stroke-dashoffset] duration-200 ease-out [stroke-dasharray:16] [stroke-dashoffset:16] group-data-[state=checked]:[stroke-dashoffset:0]"
        />
      </svg>
    </CheckboxPrimitive.Root>
  );
});
