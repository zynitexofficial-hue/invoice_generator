"use client";

import { Check } from "lucide-react";
import { DropdownMenu as Menu } from "radix-ui";
import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;

export const DropdownMenuContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Content>
>(function DropdownMenuContent({ className, sideOffset = 6, align = "end", ...props }, ref) {
  return (
    <Menu.Portal>
      <Menu.Content
        ref={ref}
        sideOffset={sideOffset}
        align={align}
        collisionPadding={12}
        className={cn(
          "z-50 min-w-48 rounded-xl border border-border bg-surface p-1 text-foreground shadow-lg outline-none",
          "origin-[var(--radix-dropdown-menu-content-transform-origin)] data-[state=closed]:animate-pop-out data-[state=open]:animate-pop-in",
          className,
        )}
        {...props}
      />
    </Menu.Portal>
  );
});

export const DropdownMenuItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof Menu.Item> & {
    icon?: ReactNode;
    tone?: "default" | "danger";
    shortcut?: string;
  }
>(function DropdownMenuItem(
  { className, icon, tone = "default", shortcut, asChild, children, ...props },
  ref,
) {
  return (
    <Menu.Item
      ref={ref}
      asChild={asChild}
      className={cn(
        "relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none select-none",
        "transition-colors duration-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        tone === "danger"
          ? "text-danger-foreground data-[highlighted]:bg-danger-soft"
          : "data-[highlighted]:bg-surface-2 [&_svg]:text-muted-foreground",
        className,
      )}
      {...props}
    >
      {/* asChild needs exactly one element child for Radix's Slot to merge into. */}
      {asChild ? (
        children
      ) : (
        <>
          {icon}
          <span className="flex-1">{children}</span>
          {shortcut && <span className="text-xs text-subtle-foreground">{shortcut}</span>}
        </>
      )}
    </Menu.Item>
  );
});

export function DropdownMenuCheckboxItem({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Menu.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={(e) => e.preventDefault()}
      className="relative flex cursor-pointer items-center gap-2.5 rounded-lg py-2 pr-2.5 pl-8 text-sm outline-none select-none data-[highlighted]:bg-surface-2"
    >
      <Menu.ItemIndicator className="absolute left-2.5">
        <Check className="size-4 text-primary" />
      </Menu.ItemIndicator>
      {children}
    </Menu.CheckboxItem>
  );
}

export function DropdownMenuLabel({ children }: { children: ReactNode }) {
  return (
    <Menu.Label className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
      {children}
    </Menu.Label>
  );
}

export function DropdownMenuSeparator() {
  return <Menu.Separator className="mx-1.5 my-1 h-px bg-border" />;
}
