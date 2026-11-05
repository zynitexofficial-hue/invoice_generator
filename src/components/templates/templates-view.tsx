"use client";

import { Check, PenLine, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useDesigns, useSettings } from "@/db/hooks";
import { updateSettings } from "@/db/settings";
import { resolveDefaultDesign } from "@/lib/invoice-factory";
import { computeTotals } from "@/lib/invoice-calc";
import { buildViewModel } from "@/lib/render/view-model";
import { sampleInvoice } from "@/lib/sample";
import type { AppSettings, DesignCustomization, InvoiceDesign, TemplateId } from "@/lib/schema";
import { TEMPLATES, getTemplateMeta } from "@/lib/templates-meta";
import { cn } from "@/lib/utils";
import { DesignPanel } from "@/components/design/design-panel";
import { SavedDesigns } from "@/components/design/saved-designs";
import { ScaledDocument } from "@/components/document/scaled-document";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";

function useSampleModel(settings: AppSettings | undefined, design: InvoiceDesign | null) {
  return useMemo(() => {
    if (!settings || !design) return null;
    const invoice = sampleInvoice(settings, design);
    const vm = buildViewModel(invoice, computeTotals(invoice), design.customization, {
      dateFormat: settings.formats.dateFormat,
      grouping: settings.formats.numberGrouping,
      upiIncludeAmount: settings.upi.includeAmount,
    });
    return { invoice, vm };
  }, [settings, design]);
}

export function TemplatesView() {
  const settings = useSettings();
  const designs = useDesigns();
  // The studio starts from the current default design until the user edits it.
  const [edited, setEdited] = useState<InvoiceDesign | null>(null);
  const defaultDesign = useMemo(
    () => (settings && designs ? resolveDefaultDesign(settings, designs) : null),
    [settings, designs],
  );
  const design = edited ?? defaultDesign;
  const setDesign = (fn: (d: InvoiceDesign) => InvoiceDesign) =>
    setEdited((prev) => {
      const base = prev ?? defaultDesign;
      return base ? fn(base) : prev;
    });
  const studioRef = useRef<HTMLDivElement>(null);
  const galleryBase = defaultDesign?.customization;
  const gallery = useMemo(
    () =>
      galleryBase
        ? (Object.fromEntries(
            TEMPLATES.map((t) => [t.id, { ...galleryBase, ...t.defaults }]),
          ) as Record<TemplateId, DesignCustomization>)
        : null,
    [galleryBase],
  );
  const galleryCustomization = (id: TemplateId) => gallery![id];

  if (!settings || !design) {
    return (
      <Page title="Templates & branding" width="wide">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-2xl" />
          ))}
        </div>
      </Page>
    );
  }

  const selectTemplate = (templateId: TemplateId) => {
    setDesign((d) => ({ ...d, templateId, templateVersion: getTemplateMeta(templateId).version }));
  };
  const patch = (partial: Partial<DesignCustomization>) =>
    setDesign((d) => ({ ...d, customization: { ...d.customization, ...partial } }));

  const makeDefault = async () => {
    await updateSettings((s) => ({
      ...s,
      design: { defaultDesignId: "", fallback: structuredClone(design) },
    }));
    toast.success("Default design updated", {
      description: "New invoices will use this template and styling.",
    });
  };

  return (
    <Page
      title="Templates & branding"
      description="Pick a template, make it yours, and set it as the default for new documents."
      width="wide"
      actions={
        <Button variant="primary" asChild>
          <Link href="/invoice?new=1">
            <PenLine />
            Start an invoice
          </Link>
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            templateId={t.id}
            active={design.templateId === t.id}
            // Gallery shows each template in its own palette (stable while the studio is edited).
            customization={galleryCustomization(t.id)}
            settings={settings}
            onSelect={() => {
              setDesign((d) => ({
                ...d,
                templateId: t.id,
                templateVersion: t.version,
                customization: { ...d.customization, ...t.defaults },
              }));
              studioRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        ))}
      </div>

      <div ref={studioRef} className="scroll-mt-6 pt-12">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em]">Design studio</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Editing <b className="text-foreground">{getTemplateMeta(design.templateId).name}</b>{" "}
              with sample data. Changes here don&apos;t affect existing invoices.
            </p>
          </div>
          <Button variant="secondary" onClick={() => void makeDefault()}>
            <Star />
            Use for new invoices
          </Button>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <DesignPanel
            templateId={design.templateId}
            customization={design.customization}
            onTemplateChange={selectTemplate}
            onChange={patch}
            savedDesigns={
              <SavedDesigns
                templateId={design.templateId}
                customization={design.customization}
                onApply={(d) =>
                  setEdited({
                    templateId: d.templateId,
                    templateVersion: getTemplateMeta(d.templateId).version,
                    customization: structuredClone(d.customization),
                  })
                }
              />
            }
          />
          <div className="lg:sticky lg:top-6 lg:self-start">
            <StudioPreview settings={settings} design={design} />
          </div>
        </div>
      </div>
    </Page>
  );
}

function StudioPreview({ settings, design }: { settings: AppSettings; design: InvoiceDesign }) {
  const model = useSampleModel(settings, design);
  if (!model) return null;
  return (
    <div className="rounded-2xl border border-border bg-surface-3/60 p-4 sm:p-8 dark:bg-background">
      <ScaledDocument
        vm={model.vm}
        design={design.customization}
        templateId={design.templateId}
        className="gap-6"
      />
    </div>
  );
}

function TemplateCard({
  templateId,
  active,
  customization,
  settings,
  onSelect,
}: {
  templateId: TemplateId;
  active: boolean;
  customization: DesignCustomization;
  settings: AppSettings;
  onSelect: () => void;
}) {
  const meta = getTemplateMeta(templateId);
  const design = useMemo<InvoiceDesign>(
    () => ({ templateId, templateVersion: meta.version, customization }),
    [templateId, meta.version, customization],
  );
  const model = useSampleModel(settings, design);
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border bg-surface text-left shadow-xs transition-[border-color,box-shadow,transform] duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg focus-visible:focus-ring",
        active ? "border-primary shadow-[0_0_0_3px_var(--ring)]" : "border-border",
      )}
    >
      <div className="relative h-72 overflow-hidden bg-surface-3/70 px-8 pt-8 dark:bg-background">
        {model && (
          <div className="pointer-events-none transition-transform duration-300 group-hover:-translate-y-1">
            <ScaledDocument
              vm={model.vm}
              design={customization}
              templateId={templateId}
              maxPages={1}
            />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />
      </div>
      <div className="flex items-start justify-between gap-3 border-t border-border p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold">
            {meta.name}
            {active && (
              <span className="flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="size-3" />
              </span>
            )}
          </div>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">
            {meta.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {meta.tags.map((tag) => (
            <Badge key={tag} size="sm">
              {tag}
            </Badge>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
        <span>A4 · Letter · Portrait</span>
        <span className="font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          Customize →
        </span>
      </div>
    </button>
  );
}
