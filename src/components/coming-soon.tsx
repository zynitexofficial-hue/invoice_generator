import { Hourglass } from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";

/**
 * Placeholder every not-yet-built feature renders. Each stub lives in its own
 * file and renders this, so the owning feature replaces that one file.
 */
export function ComingSoon({
  title,
  description,
  icon,
}: {
  title: string;
  description?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <Card>
      <EmptyState
        icon={icon ?? <Hourglass />}
        title={title}
        description={
          <>
            Coming in this release.
            {description ? <> {description}</> : null}
          </>
        }
      />
    </Card>
  );
}
