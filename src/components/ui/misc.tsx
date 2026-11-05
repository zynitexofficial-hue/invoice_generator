import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} aria-hidden />;
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-surface-2 px-1.5 font-sans text-[11px] font-medium text-muted-foreground",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="relative mb-5">
          <div
            className="absolute inset-0 -z-10 scale-150 rounded-full bg-primary/10 blur-2xl"
            aria-hidden
          />
          <div className="flex size-14 items-center justify-center rounded-2xl border border-border bg-surface text-primary shadow-sm [&_svg]:size-6">
            {icon}
          </div>
        </div>
      )}
      <h3 className="text-base font-semibold tracking-[-0.01em]">{title}</h3>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-6 text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Divider({ className, label }: { className?: string; label?: ReactNode }) {
  if (!label) return <div className={cn("h-px bg-border", className)} role="separator" />;
  return (
    <div
      className={cn("flex items-center gap-3 text-xs text-subtle-foreground", className)}
      role="separator"
    >
      <div className="h-px flex-1 bg-border" />
      {label}
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
