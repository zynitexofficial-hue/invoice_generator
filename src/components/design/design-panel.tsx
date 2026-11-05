"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Check,
  GripVertical,
  LayoutTemplate,
  ListOrdered,
  Palette,
  RotateCcw,
  Ruler,
  Type,
  Eye,
} from "lucide-react";
import type { ReactNode } from "react";
import { FONTS, TEMPLATES, getTemplateMeta, PRESET_COLORS } from "@/lib/templates-meta";
import { contrastRatio } from "@/components/document/layout";
import {
  SECTION_IDS,
  type DesignCustomization,
  type FontId,
  type SectionId,
  type TemplateId,
  type Visibility,
} from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ColorPicker } from "@/components/ui/color-picker";
import { Field } from "@/components/ui/field";
import { Segmented } from "@/components/ui/segmented";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TemplateGlyph } from "./template-glyph";

const SECTION_LABELS: Record<SectionId, string> = {
  totals: "Totals & amount in words",
  schedule: "Payment terms (advance / milestones)",
  taxSummary: "Tax summary table",
  payment: "Payment details (bank / UPI)",
  notes: "Notes",
  terms: "Terms & conditions",
  signature: "Signature",
};

const VISIBILITY: { key: keyof Visibility; label: string; group: "header" | "table" | "footer" }[] =
  [
    { key: "logo", label: "Logo", group: "header" },
    { key: "itemIndex", label: "Row numbers (#)", group: "table" },
    { key: "hsnColumn", label: "HSN/SAC column", group: "table" },
    { key: "unitColumn", label: "Units next to quantity", group: "table" },
    { key: "discountColumn", label: "Discount column", group: "table" },
    { key: "taxColumns", label: "GST column", group: "table" },
    { key: "amountInWords", label: "Amount in words", group: "footer" },
    { key: "taxSummary", label: "Tax summary table", group: "footer" },
    { key: "bankDetails", label: "Bank details", group: "footer" },
    { key: "upiQr", label: "UPI QR code", group: "footer" },
    { key: "payLink", label: "Tap-to-pay UPI link", group: "footer" },
    { key: "notes", label: "Notes", group: "footer" },
    { key: "terms", label: "Terms & conditions", group: "footer" },
    { key: "signature", label: "Signature block", group: "footer" },
    { key: "statusStamp", label: "PAID stamp", group: "footer" },
    { key: "stateCodes", label: "State codes (customer & place of supply)", group: "header" },
    { key: "footer", label: "Footer text", group: "footer" },
    { key: "pageNumbers", label: "Page numbers", group: "footer" },
  ];

export interface DesignPanelProps {
  templateId: TemplateId;
  customization: DesignCustomization;
  onTemplateChange: (id: TemplateId) => void;
  onChange: (partial: Partial<DesignCustomization>) => void;
  /** Extra controls rendered under the template grid (saved designs). */
  savedDesigns?: ReactNode;
  className?: string;
}

export function DesignPanel({
  templateId,
  customization: c,
  onTemplateChange,
  onChange,
  savedDesigns,
  className,
}: DesignPanelProps) {
  const setShow = (key: keyof Visibility, value: boolean) =>
    onChange({ show: { ...c.show, [key]: value } });
  const lowContrast = contrastRatio(c.primaryColor, "#ffffff") < 3;

  return (
    <div className={cn("space-y-4", className)}>
      <Panel icon={<LayoutTemplate />} title="Template">
        <div className="grid grid-cols-3 gap-2.5">
          {TEMPLATES.map((t) => {
            const active = t.id === templateId;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onTemplateChange(t.id)}
                aria-pressed={active}
                className={cn(
                  "group relative overflow-hidden rounded-xl border bg-surface p-1.5 text-left transition-[border-color,box-shadow,transform] duration-150",
                  "hover:-translate-y-0.5 hover:shadow-md focus-visible:focus-ring",
                  active
                    ? "border-primary shadow-[0_0_0_3px_var(--ring)]"
                    : "border-border hover:border-border-strong",
                )}
              >
                <div className="overflow-hidden rounded-md border border-border/60">
                  <TemplateGlyph
                    id={t.id}
                    primary={c.primaryColor}
                    accent={c.accentColor}
                    className="block aspect-[3/4] w-full"
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
                  <span className="truncate text-xs font-medium">{t.name}</span>
                  {active && <Check className="size-3.5 shrink-0 text-primary" />}
                </div>
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          {getTemplateMeta(templateId).description}
        </p>
        {savedDesigns}
      </Panel>

      <Panel icon={<Palette />} title="Colours">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Primary">
            <ColorPicker
              value={c.primaryColor}
              onChange={(primaryColor) => onChange({ primaryColor })}
            />
          </Field>
          <Field label="Accent">
            <ColorPicker
              value={c.accentColor}
              onChange={(accentColor) => onChange({ accentColor })}
            />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" role="list" aria-label="Quick colours">
          {PRESET_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="listitem"
              onClick={() => onChange({ primaryColor: color })}
              aria-label={`Primary ${color}`}
              className={cn(
                "size-6 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-transform hover:scale-115 focus-visible:focus-ring",
                c.primaryColor.toLowerCase() === color &&
                  "ring-2 ring-primary ring-offset-2 ring-offset-surface",
              )}
              style={{ background: color }}
            />
          ))}
        </div>
        {lowContrast && (
          <p className="mt-2 text-xs text-warning-foreground">
            This primary colour is very light — text on it may be hard to read.
          </p>
        )}
      </Panel>

      <Panel icon={<Type />} title="Typography">
        <div className="grid gap-4">
          <Field label="Font">
            <Select<FontId>
              value={c.fontFamily}
              onValueChange={(fontFamily) => onChange({ fontFamily })}
              groups={[
                {
                  label: "Sans serif",
                  options: FONTS.filter((f) => f.category === "sans").map((f) => ({
                    value: f.id,
                    label: <span style={{ fontFamily: `var(${f.cssVar})` }}>{f.name}</span>,
                  })),
                },
                {
                  label: "Serif",
                  options: FONTS.filter((f) => f.category === "serif").map((f) => ({
                    value: f.id,
                    label: <span style={{ fontFamily: `var(${f.cssVar})` }}>{f.name}</span>,
                  })),
                },
              ]}
            />
          </Field>
          <Field
            label={
              <span className="flex w-full justify-between">
                Text size <span className="text-muted-foreground tabular-nums">{c.fontSize}pt</span>
              </span>
            }
          >
            <Slider
              value={c.fontSize}
              onValueChange={(fontSize) => onChange({ fontSize })}
              min={8}
              max={12}
              step={0.5}
              aria-label="Text size"
            />
          </Field>
        </div>
      </Panel>

      <Panel icon={<Ruler />} title="Layout">
        <div className="grid gap-4">
          <Field label="Table style">
            <Segmented
              fullWidth
              size="sm"
              value={c.tableStyle}
              onValueChange={(tableStyle) => onChange({ tableStyle })}
              options={[
                { value: "striped", label: "Striped" },
                { value: "bordered", label: "Bordered" },
                { value: "ruled", label: "Ruled" },
                { value: "minimal", label: "Minimal" },
              ]}
            />
          </Field>
          <Field label="Spacing">
            <Segmented
              fullWidth
              size="sm"
              value={c.density}
              onValueChange={(density) => onChange({ density })}
              options={[
                { value: "compact", label: "Compact" },
                { value: "normal", label: "Normal" },
                { value: "comfortable", label: "Roomy" },
              ]}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Logo size">
              <Segmented
                fullWidth
                size="sm"
                value={c.logoSize}
                onValueChange={(logoSize) => onChange({ logoSize })}
                options={[
                  { value: "sm", label: "S" },
                  { value: "md", label: "M" },
                  { value: "lg", label: "L" },
                ]}
              />
            </Field>
            <Field label="Logo position">
              <Segmented
                fullWidth
                size="sm"
                value={c.logoPosition}
                onValueChange={(logoPosition) => onChange({ logoPosition })}
                options={[
                  { value: "left", label: "", icon: <AlignLeft />, title: "Left" },
                  { value: "center", label: "", icon: <AlignCenter />, title: "Centre" },
                  { value: "right", label: "", icon: <AlignRight />, title: "Right" },
                ]}
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Page size">
              <Segmented
                fullWidth
                size="sm"
                value={c.pageSize}
                onValueChange={(pageSize) => onChange({ pageSize })}
                options={[
                  { value: "A4", label: "A4" },
                  { value: "Letter", label: "Letter" },
                ]}
              />
            </Field>
            <Field label="Margins">
              <Segmented
                fullWidth
                size="sm"
                value={c.margins}
                onValueChange={(margins) => onChange({ margins })}
                options={[
                  { value: "narrow", label: "S" },
                  { value: "normal", label: "M" },
                  { value: "wide", label: "L" },
                ]}
              />
            </Field>
          </div>
          <Field label="Footer alignment">
            <Segmented
              fullWidth
              size="sm"
              value={c.footerAlign}
              onValueChange={(footerAlign) => onChange({ footerAlign })}
              options={[
                { value: "left", label: "Left", icon: <AlignLeft /> },
                { value: "center", label: "Centre", icon: <AlignCenter /> },
                { value: "right", label: "Right", icon: <AlignRight /> },
              ]}
            />
          </Field>
        </div>
      </Panel>

      <Panel icon={<Eye />} title="Visible sections">
        <div className="space-y-4">
          {(["header", "table", "footer"] as const).map((group) => (
            <div key={group}>
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
                {group === "header"
                  ? "Header"
                  : group === "table"
                    ? "Items table"
                    : "Below the table"}
              </div>
              <div className="divide-y divide-border rounded-xl border border-border">
                {VISIBILITY.filter((v) => v.group === group).map((v) => (
                  <label
                    key={v.key}
                    className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-sm"
                  >
                    {v.label}
                    <Switch
                      size="sm"
                      checked={c.show[v.key]}
                      onCheckedChange={(on) => setShow(v.key, on)}
                      aria-label={v.label}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        icon={<ListOrdered />}
        title="Section order"
        description="Drag to reorder what appears below the items table."
      >
        <SectionOrder
          order={c.sectionOrder}
          onChange={(sectionOrder) => onChange({ sectionOrder })}
        />
      </Panel>

      <Button
        variant="ghost"
        size="sm"
        className="w-full"
        onClick={() =>
          onChange({ ...getTemplateMeta(templateId).defaults, sectionOrder: [...SECTION_IDS] })
        }
      >
        <RotateCcw />
        Reset colours & layout to template defaults
      </Button>
    </div>
  );
}

function Panel({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-4 shadow-xs sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-7 items-center justify-center rounded-lg bg-surface-2 text-muted-foreground ring-1 ring-border [&_svg]:size-3.5">
          {icon}
        </span>
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionOrder({
  order,
  onChange,
}: {
  order: SectionId[];
  onChange: (order: SectionId[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onChange(
      arrayMove(order, order.indexOf(active.id as SectionId), order.indexOf(over.id as SectionId)),
    );
  };
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <ol className="space-y-1.5">
          {order.map((id, index) => (
            <SortableSection key={id} id={id} index={index} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableSection({ id, index }: { id: SectionId; index: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2 text-sm",
        isDragging ? "relative z-10 border-primary/50 shadow-md" : "border-border",
      )}
    >
      <button
        type="button"
        className="flex cursor-grab touch-none items-center text-subtle-foreground hover:text-foreground focus-visible:focus-ring active:cursor-grabbing"
        aria-label={`Reorder ${SECTION_LABELS[id]}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="w-4 text-xs text-subtle-foreground tabular-nums">{index + 1}</span>
      <span className="flex-1">{SECTION_LABELS[id]}</span>
    </li>
  );
}
