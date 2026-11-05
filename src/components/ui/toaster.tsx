"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      position="bottom-right"
      gap={8}
      offset={20}
      mobileOffset={{ bottom: 84, left: 12, right: 12 }}
      toastOptions={{
        classNames: {
          toast:
            "!rounded-xl !border !border-border !bg-surface !text-foreground !shadow-lg !font-sans !text-sm !gap-2.5 !px-4 !py-3",
          title: "!font-medium",
          description: "!text-muted-foreground !text-[13px]",
          actionButton: "!bg-primary !text-primary-foreground !rounded-md !font-medium",
          cancelButton: "!bg-surface-2 !text-foreground !rounded-md",
          icon: "!mt-0.5 self-start",
          success: "[&_[data-icon]]:!text-success",
          error: "[&_[data-icon]]:!text-danger",
          warning: "[&_[data-icon]]:!text-warning",
          info: "[&_[data-icon]]:!text-info",
        },
      }}
    />
  );
}
