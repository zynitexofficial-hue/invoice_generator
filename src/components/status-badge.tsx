import type { DisplayStatus } from "@/lib/invoice-calc";
import { Badge } from "@/components/ui/badge";

const MAP: Record<
  DisplayStatus,
  { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" }
> = {
  draft: { label: "Draft", tone: "neutral" },
  unpaid: { label: "Unpaid", tone: "info" },
  partial: { label: "Partially paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  quote: { label: "Sent", tone: "primary" },
};

export function StatusBadge({
  status,
  size = "sm",
}: {
  status: DisplayStatus;
  size?: "sm" | "md";
}) {
  const s = MAP[status];
  return (
    <Badge tone={s.tone} size={size} dot>
      {s.label}
    </Badge>
  );
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(MAP).map(([k, v]) => [k, v.label]),
) as Record<DisplayStatus, string>;
