"use client";

import { motion } from "motion/react";
import { Tabs as TabsPrimitive } from "radix-ui";
import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export interface TabDef {
  value: string;
  label: ReactNode;
  icon?: ReactNode;
  badge?: ReactNode;
}

/** Underlined tab list with a sliding indicator. */
export function TabsList({
  tabs,
  value,
  className,
  "aria-label": ariaLabel,
}: {
  tabs: TabDef[];
  value: string;
  className?: string;
  "aria-label"?: string;
}) {
  const layoutId = useId();
  return (
    <TabsPrimitive.List
      aria-label={ariaLabel}
      className={cn("relative flex items-center gap-1 border-b border-border", className)}
    >
      {tabs.map((t) => (
        <TabsPrimitive.Trigger
          key={t.value}
          value={t.value}
          className={cn(
            "relative inline-flex h-10 items-center gap-2 px-3 text-sm font-medium text-muted-foreground transition-colors",
            "rounded-t-md hover:text-foreground focus-visible:focus-ring data-[state=active]:text-foreground [&_svg]:size-4",
          )}
        >
          {t.icon}
          {t.label}
          {t.badge}
          {value === t.value && (
            <motion.span
              layoutId={layoutId}
              className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary"
              transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
            />
          )}
        </TabsPrimitive.Trigger>
      ))}
    </TabsPrimitive.List>
  );
}
