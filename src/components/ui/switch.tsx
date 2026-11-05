"use client";

import { Switch as SwitchPrimitive } from "radix-ui";
import { forwardRef, useId, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Switch = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof SwitchPrimitive.Root> & { size?: "sm" | "md" }
>(function Switch({ className, size = "md", ...props }, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={cn(
        "group relative inline-flex shrink-0 items-center rounded-full border border-transparent p-[2px]",
        "bg-border-strong transition-colors duration-200 ease-out",
        "data-[state=checked]:bg-primary",
        "focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50",
        size === "md" ? "h-[22px] w-[38px]" : "h-[18px] w-[30px]",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          "pointer-events-none block rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.25)]",
          "transition-[transform,width] duration-200 [transition-timing-function:var(--ease-spring)]",
          "group-active:w-[22px]",
          size === "md"
            ? "size-4 data-[state=checked]:translate-x-4 group-active:data-[state=checked]:translate-x-[10px]"
            : "size-3 group-active:w-[16px] data-[state=checked]:translate-x-3 group-active:data-[state=checked]:translate-x-2",
        )}
      />
    </SwitchPrimitive.Root>
  );
});

/** A full-width row with label, description and a switch — the standard settings toggle. */
export function SwitchRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  className?: string;
  id?: string;
}) {
  const autoId = useId();
  const controlId = id ?? `sw${autoId.replace(/:/g, "")}`;
  return (
    <div className={cn("flex items-start justify-between gap-4", className)}>
      <label htmlFor={controlId} className="min-w-0 flex-1 cursor-pointer select-none">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        {description && (
          <span className="mt-0.5 block text-[13px] leading-5 text-muted-foreground">
            {description}
          </span>
        )}
      </label>
      <Switch
        id={controlId}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5"
      />
    </div>
  );
}
