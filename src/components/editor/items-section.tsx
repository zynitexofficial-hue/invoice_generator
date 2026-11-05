"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowDown,
  ArrowUp,
  BookmarkPlus,
  ChevronDown,
  Copy,
  Ellipsis,
  GripVertical,
  ListPlus,
  Package,
  Plus,
  Trash,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { memo, useState } from "react";
import { toast } from "sonner";
import { useShallow } from "zustand/react/shallow";
import { useItems } from "@/db/hooks";
import { saveItem } from "@/db/records";
import { COMMON_UNITS, DOC_TYPE_META } from "@/lib/documents";
import { currencyPrecision, currencySymbol } from "@/lib/currency";
import { formatMoney } from "@/lib/format";
import { toDec } from "@/lib/money";
import { sanitizeHsnSac } from "@/lib/gst/tax";
import { lineFromCatalog, newLineItem } from "@/lib/invoice-factory";
import type { CatalogItem, LineItem } from "@/lib/schema";
import { fieldId } from "@/lib/validation";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Collapse } from "@/components/ui/collapse";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { GstRateSelect } from "@/components/forms/pickers";
import { useEditorContext, useFieldIssue } from "./editor-context";
import { EditorSection, useRevealOn } from "./section";

export function ItemsSection() {
  const { settings } = useEditorContext();
  const lineIds = useEditor(useShallow((s) => s.invoice!.lines.map((l) => l.id)));
  const moveLine = useEditor((s) => s.moveLine);
  const addLine = useEditor((s) => s.addLine);
  const catalog = useItems() ?? [];
  const linesIssue = useFieldIssue(fieldId.lines);
  const done = useEditor((s) =>
    s.invoice!.lines.some((l) => l.name.trim() && toDec(l.unitPrice).greaterThan(0)),
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) moveLine(String(active.id), String(over.id));
  };

  const add = () => {
    const line = newLineItem(settings);
    addLine(line);
    requestAnimationFrame(() => document.getElementById(fieldId.line(line.id, "name"))?.focus());
  };

  return (
    <EditorSection
      title="Items"
      icon={<Package />}
      done={done}
      id={fieldId.lines}
      action={
        <span className="text-xs text-muted-foreground tabular-nums">
          {lineIds.length} {lineIds.length === 1 ? "line" : "lines"}
        </span>
      }
    >
      {(linesIssue.error || linesIssue.warning) && (
        <p
          className={cn(
            "mb-3 text-xs",
            linesIssue.error ? "text-danger-foreground" : "text-warning-foreground",
          )}
        >
          {linesIssue.error ?? linesIssue.warning}
        </p>
      )}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
      >
        <SortableContext items={lineIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {lineIds.map((id, index) => (
                <motion.div
                  key={id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                >
                  <SortableLine id={id} index={index} count={lineIds.length} catalog={catalog} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </SortableContext>
      </DndContext>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={add}>
          <Plus />
          Add item
        </Button>
        {catalog.length > 0 && (
          <Combobox<CatalogItem>
            items={catalog}
            getKey={(i) => i.id}
            getLabel={(i) => i.name}
            getDescription={(i) =>
              [
                i.hsnSac && `HSN ${i.hsnSac}`,
                i.price && `${i.price}`,
                i.gstRate && `GST ${i.gstRate}%`,
              ]
                .filter(Boolean)
                .join(" · ")
            }
            onSelect={(item) => addLine(lineFromCatalog(item, settings))}
            searchPlaceholder="Search your items…"
            trigger={
              <Button variant="ghost" size="sm">
                <ListPlus />
                Add from catalog
              </Button>
            }
          />
        )}
      </div>
    </EditorSection>
  );
}

function SortableLine(props: { id: string; index: number; count: number; catalog: CatalogItem[] }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      <LineRow
        {...props}
        dragging={isDragging}
        handle={
          <button
            ref={setActivatorNodeRef}
            type="button"
            className="flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded-md text-subtle-foreground transition-colors hover:bg-surface-2 hover:text-foreground focus-visible:focus-ring active:cursor-grabbing"
            aria-label={`Reorder item ${props.index + 1}`}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        }
      />
    </div>
  );
}

const LineRow = memo(function LineRow({
  id,
  index,
  count,
  catalog,
  handle,
  dragging,
}: {
  id: string;
  index: number;
  count: number;
  catalog: CatalogItem[];
  handle: React.ReactNode;
  dragging: boolean;
}) {
  const { settings } = useEditorContext();
  const line = useEditor((s) => s.invoice!.lines.find((l) => l.id === id));
  const amount = useEditor((s) => s.totals?.lines.find((l) => l.id === id)?.amount ?? "0");
  const { currency, docType } = useEditor(
    useShallow((s) => ({ currency: s.invoice!.currency, docType: s.invoice!.docType })),
  );
  const { patchLine, removeLine, addLine, duplicateLine, moveLineBy } = useEditor(
    useShallow((s) => ({
      patchLine: s.patchLine,
      removeLine: s.removeLine,
      addLine: s.addLine,
      duplicateLine: s.duplicateLine,
      moveLineBy: s.moveLineBy,
    })),
  );
  const [showMore, setShowMore] = useState(() =>
    Boolean(line && (line.description || line.unit || line.discount.value || line.hsnSac)),
  );
  const nameIssue = useFieldIssue(fieldId.line(id, "name"));
  const qtyIssue = useFieldIssue(fieldId.line(id, "quantity"));
  const priceIssue = useFieldIssue(fieldId.line(id, "price"));
  const discIssue = useFieldIssue(fieldId.line(id, "discount"));
  useRevealOn([fieldId.line(id, "discount")], () => setShowMore(true));
  if (!line) return null;

  const hasTax = DOC_TYPE_META[docType].hasTax;
  const dp = currencyPrecision(currency);
  const symbol = currencySymbol(currency);
  const set = (partial: Partial<LineItem>) => patchLine(id, partial);
  const rowError = nameIssue.error || qtyIssue.error || priceIssue.error || discIssue.error;
  // Always reveal hidden fields that have a problem.
  const moreOpen = showMore || Boolean(discIssue.error);
  const extras = [
    line.hsnSac && `HSN ${line.hsnSac}`,
    line.unit && line.unit,
    line.discount.value &&
      (line.discount.kind === "percent"
        ? `${line.discount.value}% off`
        : `${symbol}${line.discount.value} off`),
    line.description && "description",
  ].filter(Boolean) as string[];

  const pick = (item: CatalogItem) => {
    const fromCatalog = lineFromCatalog(item, settings);
    set({ ...fromCatalog, id, quantity: line.quantity || "1" });
  };

  const remove = () => {
    const lines = useEditor.getState().invoice!.lines;
    const at = lines.findIndex((l) => l.id === id);
    const removed = lines[at];
    const afterId = at > 0 ? lines[at - 1].id : null;
    removeLine(id);
    toast(`Removed ${removed.name.trim() || `item ${at + 1}`}`, {
      action: { label: "Undo", onClick: () => addLine(removed, afterId) },
    });
  };

  const saveToCatalog = async () => {
    if (!line.name.trim()) {
      toast.error("Give the item a name first");
      return;
    }
    const existing = catalog.find(
      (c) => c.name.trim().toLowerCase() === line.name.trim().toLowerCase(),
    );
    await saveItem({
      ...(existing ?? {}),
      name: line.name.trim(),
      description: line.description,
      hsnSac: line.hsnSac,
      unit: line.unit,
      price: line.unitPrice,
      gstRate: line.gstRate,
    });
    toast.success(existing ? "Catalog item updated" : "Saved to your catalog");
  };

  return (
    <div
      className={cn(
        "@container rounded-xl border bg-surface transition-[border-color,box-shadow] duration-150",
        dragging ? "border-primary/50 shadow-lg" : "border-border hover:border-border-strong",
        rowError && "border-danger/50",
      )}
    >
      {/*
        Narrow: name, then qty / rate / GST below it. Wide form (container ≥ 38rem): all on one
        line. Details, amount and actions always close the card.
      */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 p-2.5 sm:p-3">
        <div className="flex flex-col gap-2.5 @[38rem]:flex-row @[38rem]:items-end">
          <div className="flex min-w-0 items-start gap-1 @[38rem]:flex-1">
            <div className="-ml-1 flex h-[var(--field-h)] shrink-0 items-center">{handle}</div>
            <Field id={fieldId.line(id, "name")} error={nameIssue.error} className="flex-1">
              <AutocompleteInput<CatalogItem>
                value={line.name}
                onChange={(v) => set({ name: v })}
                suggestions={catalog}
                getKey={(i) => i.id}
                getLabel={(i) => i.name}
                getDescription={(i) =>
                  [
                    i.hsnSac && `HSN ${i.hsnSac}`,
                    i.price && formatMoney(i.price, currency, settings.formats.numberGrouping),
                    i.gstRate && `GST ${i.gstRate}%`,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                }
                onPick={pick}
                placeholder="Item or service name"
                aria-label={`Item ${index + 1} name`}
              />
            </Field>
          </div>

          {/* Essentials stay visible; the rest is one tap away (progressive disclosure). */}
          <div
            className={cn(
              "grid gap-2.5 @[38rem]:shrink-0",
              hasTax ? "@[38rem]:w-[21rem]" : "@[38rem]:w-56",
              hasTax
                ? "grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1fr)]"
                : "grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)]",
            )}
          >
            <Field label="Qty" id={fieldId.line(id, "quantity")} error={qtyIssue.error}>
              <DecimalInput
                value={line.quantity}
                onValueChange={(v) => set({ quantity: v })}
                maxDecimals={3}
                placeholder="1"
              />
            </Field>
            <Field label="Rate" id={fieldId.line(id, "price")} error={priceIssue.error}>
              <DecimalInput
                value={line.unitPrice}
                onValueChange={(v) => set({ unitPrice: v })}
                maxDecimals={Math.max(dp, 2)}
                leading={<span className="text-[13px]">{symbol}</span>}
                placeholder="0.00"
              />
            </Field>
            {hasTax && (
              <Field label="GST">
                <GstRateSelect
                  value={line.gstRate}
                  onChange={(r) => set({ gstRate: r })}
                  rates={settings.gst.rates}
                  aria-label={`Item ${index + 1} GST rate`}
                />
              </Field>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowMore((v) => !v)}
            aria-expanded={moreOpen}
            className="-mx-1 flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1 py-0.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:focus-ring"
          >
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 transition-transform duration-200",
                moreOpen && "rotate-180",
              )}
            />
            <span className="shrink-0">{moreOpen ? "Less" : "Details"}</span>
            {!moreOpen && (
              <span className="truncate font-normal text-subtle-foreground">
                ·{" "}
                {extras.length > 0
                  ? extras.join(" · ")
                  : `description, unit, discount${hasTax ? ", HSN/SAC" : ""}`}
              </span>
            )}
          </button>
          <span className="shrink-0 text-sm font-semibold tabular-nums">
            {formatMoney(amount, currency, settings.formats.numberGrouping)}
          </span>
          <div className="-mr-1 flex shrink-0 items-center">
            {count > 1 && (
              <Button
                variant="ghost"
                size="icon-xs"
                className="hover:bg-danger-soft hover:text-danger-foreground"
                aria-label={`Remove item ${index + 1}`}
                title="Remove item"
                onClick={remove}
              >
                <Trash />
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={`More actions for item ${index + 1}`}
                >
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Copy />} onSelect={() => duplicateLine(id)}>
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem icon={<BookmarkPlus />} onSelect={() => void saveToCatalog()}>
                  Save to catalog
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<ArrowUp />}
                  disabled={index === 0}
                  onSelect={() => moveLineBy(id, -1)}
                >
                  Move up
                </DropdownMenuItem>
                <DropdownMenuItem
                  icon={<ArrowDown />}
                  disabled={index === count - 1}
                  onSelect={() => moveLineBy(id, 1)}
                >
                  Move down
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Collapse open={moreOpen}>
          <div className="grid gap-3">
            <Textarea
              value={line.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              maxLength={1000}
              placeholder="Description (optional)"
              aria-label={`Item ${index + 1} description`}
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Unit" optional>
                <AutocompleteInput<string>
                  value={line.unit}
                  onChange={(v) => set({ unit: v.slice(0, 20) })}
                  suggestions={COMMON_UNITS}
                  getKey={(u) => u}
                  getLabel={(u) => u}
                  onPick={(u) => set({ unit: u })}
                  placeholder="pcs"
                  heading="Common units"
                  aria-label={`Item ${index + 1} unit`}
                />
              </Field>
              <Field
                label="Discount"
                optional
                id={fieldId.line(id, "discount")}
                error={discIssue.error}
              >
                <DiscountInput
                  kind={line.discount.kind}
                  value={line.discount.value}
                  symbol={symbol}
                  onChange={(discount) => set({ discount })}
                  label={`Item ${index + 1} discount`}
                />
              </Field>
              <Field label="HSN/SAC" optional className="col-span-2 sm:col-span-1">
                <Input
                  value={line.hsnSac}
                  onChange={(e) => set({ hsnSac: sanitizeHsnSac(e.target.value) })}
                  inputMode="numeric"
                  placeholder="998314"
                  className="tabular"
                  aria-label={`Item ${index + 1} HSN or SAC code`}
                />
              </Field>
            </div>
          </div>
        </Collapse>
      </div>
    </div>
  );
});

export function DiscountInput({
  kind,
  value,
  symbol,
  onChange,
  label,
  noun = "discount",
}: {
  kind: "percent" | "flat";
  value: string;
  symbol: string;
  onChange: (d: { kind: "percent" | "flat"; value: string }) => void;
  label: string;
  /** What the value is, for the %/amount toggle's label ("Switch to amount discount"). */
  noun?: string;
}) {
  return (
    <DecimalInput
      value={value}
      onValueChange={(v) => onChange({ kind, value: v })}
      maxDecimals={kind === "percent" ? 2 : 2}
      placeholder="0"
      aria-label={label}
      trailing={
        <button
          type="button"
          onClick={() => onChange({ kind: kind === "percent" ? "flat" : "percent", value })}
          className="flex h-6 min-w-8 items-center justify-center rounded-md bg-surface-3 px-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-primary-soft hover:text-primary-soft-foreground focus-visible:focus-ring"
          aria-label={`Switch to ${kind === "percent" ? "amount" : "percentage"} ${noun}`}
          title="Switch between % and amount"
        >
          {kind === "percent" ? "%" : symbol}
        </button>
      }
    />
  );
}
