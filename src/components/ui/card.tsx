import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-border bg-surface shadow-xs", className)}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 px-5 pt-5 pb-1 sm:px-6", className)}>
      {icon && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground ring-1 ring-border [&_svg]:size-[18px]">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <h2 className="text-[15px] leading-6 font-semibold tracking-[-0.01em]">{title}</h2>
        {description && (
          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4 sm:px-6", className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex items-center justify-end gap-2 border-t border-border px-5 py-3 sm:px-6",
        className,
      )}
      {...props}
    />
  );
}
