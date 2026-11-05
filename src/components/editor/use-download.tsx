"use client";

import { CircleAlert, Printer, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { markDownloaded } from "@/db/invoices";
import { updateSettings } from "@/db/settings";
import { computeTotals } from "@/lib/invoice-calc";
import { buildViewModel } from "@/lib/render/view-model";
import type { AppSettings, Invoice } from "@/lib/schema";
import { safeFileName } from "@/lib/utils";
import type { Issue } from "@/lib/validation";
import { useEditor } from "@/stores/editor-store";
import { printDocument } from "@/components/document/print-host";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/misc";
import { rememberParties } from "./remember";
import { flushSave } from "./use-autosave";

export function pdfTitle(invoice: Invoice) {
  const who = invoice.customer.name.trim() || invoice.customer.company.trim();
  return safeFileName(`${invoice.number || "Invoice"}${who ? ` - ${who}` : ""}`);
}

/** Print an invoice record (used from History and the editor). */
export async function printInvoice(invoice: Invoice, settings: AppSettings) {
  const totals = computeTotals(invoice);
  const vm = buildViewModel(invoice, totals, invoice.design.customization, {
    dateFormat: settings.formats.dateFormat,
    grouping: settings.formats.numberGrouping,
    upiIncludeAmount: settings.upi.includeAmount,
  });
  await printDocument({
    vm,
    design: invoice.design.customization,
    templateId: invoice.design.templateId,
    title: pdfTitle(invoice),
  });
}

type Stage =
  | { kind: "idle" }
  | { kind: "errors"; issues: Issue[] }
  | { kind: "warnings"; issues: Issue[] }
  | { kind: "tip" };

/**
 * Download flow: validate → (warnings: confirm) → (first time: print tips) →
 * save + mark downloaded → open the print dialog.
 */
export function useDownload(settings: AppSettings, onJumpToField: (field: string) => void) {
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const print = useCallback(async () => {
    setStage({ kind: "idle" });
    setBusy(true);
    try {
      await flushSave();
      const before = useEditor.getState().invoice;
      if (!before) return;
      // Remember the business profile and customer so they're never typed twice.
      const remembered = await rememberParties(before).catch(() => null);
      if (remembered?.customerId && remembered.customerId !== before.customer.customerId) {
        useEditor.getState().patchCustomer({ customerId: remembered.customerId });
        await flushSave();
      }
      const current = useEditor.getState().invoice!;
      const saved = await markDownloaded(current);
      useEditor.getState().markSaved(useEditor.getState().revision, saved);
      await printInvoice(current, settings);

      const notes = [
        remembered?.profile && "your business details",
        remembered?.customerAdded && `${current.customer.name.trim()} in Customers`,
      ].filter(Boolean);
      toast.success(`${current.number || "Document"} saved to History`, {
        description: notes.length
          ? `We also saved ${notes.join(" and ")} for next time.`
          : undefined,
        action: { label: "New invoice", onClick: () => router.push("/invoice?new=1") },
      });
    } catch {
      toast.error("Couldn't prepare the PDF. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [settings, router]);

  const proceed = useCallback(() => {
    if (!settings.onboarding.printTipSeen) setStage({ kind: "tip" });
    else void print();
  }, [print, settings.onboarding.printTipSeen]);

  const start = useCallback(() => {
    const { validation } = useEditor.getState();
    if (validation.errors.length) {
      useEditor.getState().setShowErrors(true);
      setStage({ kind: "errors", issues: validation.errors });
      return;
    }
    if (validation.warnings.length) {
      useEditor.getState().setShowErrors(true);
      setStage({ kind: "warnings", issues: validation.warnings });
      return;
    }
    proceed();
  }, [proceed]);

  const dialogs = (
    <>
      <Dialog
        open={stage.kind === "errors" || stage.kind === "warnings"}
        onOpenChange={(o) => !o && setStage({ kind: "idle" })}
      >
        <DialogContent size="md">
          {stage.kind === "errors" || stage.kind === "warnings" ? (
            <>
              <DialogHeader
                icon={stage.kind === "errors" ? <CircleAlert /> : <TriangleAlert />}
                title={stage.kind === "errors" ? "A few things need fixing" : "Before you download"}
                description={
                  stage.kind === "errors"
                    ? "These must be fixed before the PDF can be created."
                    : "These won't stop you, but you may want to review them."
                }
              />
              <DialogBody>
                <ul className="space-y-1.5">
                  {stage.issues.map((issue, i) => (
                    <li key={`${issue.field}-${i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setStage({ kind: "idle" });
                          onJumpToField(issue.field);
                        }}
                        className="flex w-full items-start gap-2.5 rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:bg-surface-2 focus-visible:focus-ring"
                      >
                        <span
                          className={
                            stage.kind === "errors"
                              ? "mt-1.5 size-1.5 shrink-0 rounded-full bg-danger"
                              : "mt-1.5 size-1.5 shrink-0 rounded-full bg-warning"
                          }
                        />
                        <span className="flex-1">{issue.message}</span>
                        <span className="shrink-0 text-xs font-medium text-primary">Fix</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </DialogBody>
              <DialogFooter>
                <Button variant="secondary" onClick={() => setStage({ kind: "idle" })}>
                  Keep editing
                </Button>
                {stage.kind === "warnings" && (
                  <Button variant="primary" onClick={proceed}>
                    Download anyway
                  </Button>
                )}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
      <PrintTipDialog
        open={stage.kind === "tip"}
        onCancel={() => setStage({ kind: "idle" })}
        onContinue={() => void print()}
      />
    </>
  );

  return { start, busy, dialogs };
}

function PrintTipDialog({
  open,
  onCancel,
  onContinue,
}: {
  open: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [dontShow, setDontShow] = useState(true);
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <DialogContent size="md">
        <DialogHeader
          icon={<Printer />}
          title="Saving your PDF"
          description="Your browser's print dialog creates the PDF — it takes one click."
        />
        <DialogBody className="space-y-2.5">
          {[
            ["Destination", "Choose “Save as PDF” (on phones: Print → Save / Share)."],
            ["Headers and footers", "Turn them off for a clean page."],
            ["Background graphics", "Keep them on so colours print."],
          ].map(([title, text], i) => (
            <div
              key={title}
              className="flex gap-3 rounded-xl border border-border bg-surface-2/50 p-3"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <div className="text-sm font-medium">{title}</div>
                <div className="text-[13px] text-muted-foreground">{text}</div>
              </div>
            </div>
          ))}
          <p className="pt-1 text-xs text-muted-foreground">
            Tip: <Kbd>Ctrl</Kbd> + <Kbd>P</Kbd> also works from the editor.
          </p>
          <label className="flex cursor-pointer items-center gap-2.5 pt-1 text-sm">
            <Checkbox checked={dontShow} onCheckedChange={(v) => setDontShow(v === true)} />
            Don&apos;t show this again
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              if (dontShow)
                await updateSettings((s) => ({
                  ...s,
                  onboarding: { ...s.onboarding, printTipSeen: true },
                }));
              onContinue();
            }}
          >
            <Printer />
            Continue to print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
