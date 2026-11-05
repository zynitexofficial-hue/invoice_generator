import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StorageBanner } from "@/components/storage/storage-guard";

/** Standard page container with title row and the storage banner slot. */
export function Page({
  title,
  description,
  actions,
  children,
  className,
  width = "default",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  width?: "default" | "narrow" | "wide";
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 pt-6 pb-10 sm:px-6 lg:px-10 lg:pt-10",
        width === "narrow" ? "max-w-4xl" : width === "wide" ? "max-w-[1400px]" : "max-w-6xl",
        className,
      )}
    >
      <div className="mb-5 empty:hidden">
        <StorageBanner />
      </div>
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.025em] sm:text-[28px]">
            {title}
          </h1>
          {description && <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  );
}
