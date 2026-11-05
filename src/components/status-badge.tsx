import type { DisplayStatus } from "@/lib/invoice-calc";
import type { DocType } from "@/lib/schema";
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
  cancelled: { label: "Cancelled", tone: "danger" },
  note: { label: "Credit/debit note", tone: "primary" },
};

export function StatusBadge({
  status,
  size = "sm",
  docType,
}: {
  status: DisplayStatus;
  size?: "sm" | "md";
  /** Lets a note say "Credit note" / "Debit note" instead of the generic label. */
  docType?: DocType;
}) {
  const s = MAP[status];
  const label =
    status === "note" && docType === "credit_note"
      ? "Credit note"
      : status === "note" && docType === "debit_note"
        ? "Debit note"
        : s.label;
  return (
    <Badge tone={s.tone} size={size} dot>
      {label}
    </Badge>
  );
}

export const STATUS_LABELS = Object.fromEntries(
  Object.entries(MAP).map(([k, v]) => [k, v.label]),
) as Record<DisplayStatus, string>;
