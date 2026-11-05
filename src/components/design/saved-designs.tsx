"use client";

import { BookmarkPlus, Check, Star, Trash } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { useDesigns, useSettings } from "@/db/hooks";
import { deleteDesign, saveDesign, setDefaultDesign } from "@/db/records";
import type { DesignCustomization, SavedDesign, TemplateId } from "@/lib/schema";
import { getTemplateMeta } from "@/lib/templates-meta";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SwitchRow } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { TemplateGlyph } from "./template-glyph";

/** List of saved designs with apply / default / delete, plus "Save current as…". */
export function SavedDesigns({
  templateId,
  customization,
  onApply,
  className,
}: {
  templateId: TemplateId;
  customization: DesignCustomization;
  onApply: (design: SavedDesign) => void;
  className?: string;
}) {
  const designs = useDesigns() ?? [];
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const defaultId = settings?.design.defaultDesignId ?? "";

  const isCurrent = (d: SavedDesign) =>
    d.templateId === templateId &&
    JSON.stringify(d.customization) === JSON.stringify(customization);

  return (
    <div className={cn("mt-4 border-t border-border pt-4", className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
          Saved designs
        </span>
        <Button size="xs" variant="ghost" onClick={() => setOpen(true)}>
          <BookmarkPlus />
          Save current
        </Button>
      </div>
      {designs.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-3 py-3 text-xs text-muted-foreground">
          Save a design to reuse your brand colours, fonts and layout on every invoice.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {designs.map((d) => (
            <li
              key={d.id}
              className={cn(
                "group flex items-center gap-2.5 rounded-xl border px-2 py-1.5 transition-colors",
                isCurrent(d)
                  ? "border-primary/50 bg-primary-soft/40"
                  : "border-border hover:bg-surface-2/60",
              )}
            >
              <button
                type="button"
                onClick={() => onApply(d)}
                className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg text-left focus-visible:focus-ring"
              >
                <span className="w-7 shrink-0 overflow-hidden rounded border border-border/70">
                  <TemplateGlyph
                    id={d.templateId}
                    primary={d.customization.primaryColor}
                    accent={d.customization.accentColor}
                    className="block aspect-[3/4] w-full"
                  />
                </span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {d.name}
                    {isCurrent(d) && <Check className="size-3.5 text-primary" />}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {getTemplateMeta(d.templateId).name}
                  </span>
                </span>
              </button>
              <Tooltip
                content={d.id === defaultId ? "Default for new invoices" : "Use for new invoices"}
              >
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={d.id === defaultId ? "Default design" : "Set as default"}
                  onClick={async () => {
                    await setDefaultDesign(d.id === defaultId ? "" : d.id);
                    toast.success(
                      d.id === defaultId
                        ? "Default design cleared"
                        : `“${d.name}” is now the default`,
                    );
                  }}
                >
                  <Star className={cn(d.id === defaultId && "fill-warning text-warning")} />
                </Button>
              </Tooltip>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={`Delete ${d.name}`}
                className="opacity-60 group-hover:opacity-100"
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Delete “${d.name}”?`,
                      description: "Invoices that already use this design keep their look.",
                      confirmLabel: "Delete",
                      tone: "danger",
                    })
                  ) {
                    await deleteDesign(d.id);
                    toast.success("Design deleted");
                  }
                }}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <SaveDesignDialog
        open={open}
        onOpenChange={setOpen}
        templateId={templateId}
        customization={customization}
      />
    </div>
  );
}

function SaveDesignDialog({
  open,
  onOpenChange,
  templateId,
  customization,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  templateId: TemplateId;
  customization: DesignCustomization;
}) {
  const [name, setName] = useState("");
  const [makeDefault, setMakeDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const saved = await saveDesign({
        name: name.trim(),
        templateId,
        customization: structuredClone(customization),
      });
      if (makeDefault) await setDefaultDesign(saved.id);
      toast.success("Design saved", {
        description: makeDefault ? "New invoices will use it." : undefined,
      });
      setName("");
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader
          icon={<BookmarkPlus />}
          title="Save design"
          description="Reuse this template, colours and layout later."
        />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <DialogBody className="space-y-4">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Brand – Indigo"
                maxLength={80}
                autoFocus
              />
            </Field>
            <SwitchRow
              label="Use for new invoices"
              checked={makeDefault}
              onCheckedChange={setMakeDefault}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabled={!name.trim()} loading={busy}>
              Save design
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
