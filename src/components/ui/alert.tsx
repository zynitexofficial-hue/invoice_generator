import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tones = {
  info: { box: "border-info/25 bg-info-soft", icon: "text-info-foreground", Icon: Info },
  warning: {
    box: "border-warning/30 bg-warning-soft",
    icon: "text-warning-foreground",
    Icon: TriangleAlert,
  },
  danger: {
    box: "border-danger/25 bg-danger-soft",
    icon: "text-danger-foreground",
    Icon: CircleAlert,
  },
  success: {
    box: "border-success/25 bg-success-soft",
    icon: "text-success-foreground",
    Icon: CircleCheck,
  },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className,
  icon,
}: {
  tone?: keyof typeof tones;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const t = tones[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-wrap gap-x-3 gap-y-2.5 rounded-xl border px-4 py-3 text-sm",
        t.box,
        className,
      )}
    >
      <span className={cn("mt-0.5 shrink-0 [&_svg]:size-4", t.icon)}>{icon ?? <t.Icon />}</span>
      <div className="min-w-0 flex-1 basis-48">
        {title && <div className="font-medium text-foreground">{title}</div>}
        {children && (
          <div className={cn("text-[13px] leading-5 text-muted-foreground", title && "mt-0.5")}>
            {children}
          </div>
        )}
      </div>
      {/* On narrow screens the actions wrap under the text, aligned with it. */}
      {action && (
        <div className="flex w-full shrink-0 items-start gap-2 pl-7 sm:w-auto sm:pl-0">
          {action}
        </div>
      )}
    </div>
  );
}
