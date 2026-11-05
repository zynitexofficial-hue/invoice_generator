"use client";

import { History } from "lucide-react";
import { create } from "zustand";
import { useAudit } from "@/db/hooks";
import { auditActionLabel, describeChange } from "@/lib/audit-labels";
import { relativeTime } from "@/lib/dates";
import type { Invoice } from "@/lib/schema";
import { useRetained } from "@/hooks/use-retained";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";

/*
 * Per-document "History of changes" (spec A11), read from the local audit log.
 * Open it from anywhere with openChangeHistory(); <ChangeHistoryHost/> is
 * mounted once in the app layout.
 */

const useHistoryTarget = create<{
  invoice: Pick<Invoice, "id" | "number"> | null;
  set: (invoice: Pick<Invoice, "id" | "number"> | null) => void;
}>((set) => ({ invoice: null, set: (invoice) => set({ invoice }) }));

export function openChangeHistory(invoice: Pick<Invoice, "id" | "number">) {
  useHistoryTarget.getState().set({ id: invoice.id, number: invoice.number });
}

export function ChangeHistoryHost() {
  const target = useHistoryTarget((s) => s.invoice);
  const close = () => useHistoryTarget.getState().set(null);
  const shown = useRetained(target);
  return (
    <Dialog open={Boolean(target)} onOpenChange={(o) => !o && close()}>
      <DialogContent size="md">
        {shown && <HistoryBody id={shown.id} number={shown.number} onClose={close} />}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ id, number, onClose }: { id: string; number: string; onClose: () => void }) {
  const entries = useAudit("invoice", id);
  const newestFirst = entries ? [...entries].reverse() : undefined;
  return (
    <>
      <DialogHeader
        icon={<History />}
        title={`History of changes${number ? ` — ${number}` : ""}`}
        description="Kept only in this browser. Quick edits made within a few minutes are folded into one entry."
      />
      <DialogBody className="max-h-[60vh] overflow-y-auto">
        {!newestFirst ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : newestFirst.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No changes recorded yet. Changes made from now on will appear here.
          </p>
        ) : (
          <ol className="grid gap-2.5">
            {newestFirst.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-surface-2/50 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-medium">{auditActionLabel(e.action)}</span>
                  <time
                    dateTime={e.at}
                    title={new Date(e.at).toLocaleString()}
                    className="shrink-0 text-xs text-muted-foreground"
                  >
                    {relativeTime(e.at)} · {new Date(e.at).toLocaleString()}
                  </time>
                </div>
                {e.summary && <p className="mt-1 text-[13px] text-muted-foreground">{e.summary}</p>}
                {e.changes.length > 0 && (
                  <ul className="mt-1.5 grid gap-0.5 text-[13px]">
                    {e.changes.map((c) => (
                      <li key={c.field} className="break-words">
                        {describeChange(c)}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
      </DialogFooter>
    </>
  );
}
