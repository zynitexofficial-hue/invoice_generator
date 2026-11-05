"use client";

import { Ellipsis, Package, Pencil, Plus, Search, Trash, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useItems, useSettings } from "@/db/hooks";
import { deleteItem, saveItem } from "@/db/records";
import { COMMON_UNITS } from "@/lib/documents";
import { sanitizeHsnSac } from "@/lib/gst/tax";
import { formatMoney } from "@/lib/format";
import type { CatalogItem } from "@/lib/schema";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import { DecimalInput } from "@/components/ui/decimal-input";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input, Textarea } from "@/components/ui/input";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { AutocompleteInput } from "@/components/ui/autocomplete-input";
import { GstRateSelect } from "@/components/forms/pickers";

type Draft = Partial<CatalogItem> & { name: string };

export function ItemsView() {
  const items = useItems();
  const settings = useSettings();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!items) return [];
    return q
      ? items.filter((i) => `${i.name} ${i.description} ${i.hsnSac}`.toLowerCase().includes(q))
      : items;
  }, [items, query]);

  if (!items || !settings) {
    return (
      <Page title="Items">
        <Skeleton className="h-96 rounded-2xl" />
      </Page>
    );
  }

  const blank = (): Draft => ({
    name: "",
    description: "",
    hsnSac: "",
    unit: "",
    price: "",
    gstRate: settings.gst.defaultRate,
    priceIncludesGst: false,
  });
  const remove = async (item: CatalogItem) => {
    if (
      await confirm({
        title: `Delete ${item.name}?`,
        description: "Invoices that already use it are not affected.",
        confirmLabel: "Delete",
        tone: "danger",
      })
    ) {
      await deleteItem(item.id);
      toast.success("Item deleted");
    }
  };

  return (
    <Page
      title="Items"
      description="Products and services you bill often — add them to invoices in one click."
      actions={
        <Button variant="primary" onClick={() => setEditing(blank())}>
          <Plus />
          Add item
        </Button>
      }
    >
      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Package />}
            title="Your catalog is empty"
            description="Save items with their rate, HSN/SAC and GST so you never type them twice."
            action={
              <Button variant="primary" onClick={() => setEditing(blank())}>
                <Plus />
                Add item
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items or HSN/SAC…"
            leading={<Search />}
            className="mb-4 max-w-md"
            aria-label="Search items"
            trailing={
              query ? (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X />
                </Button>
              ) : undefined
            }
          />
          <Card className="overflow-hidden">
            {filtered.length === 0 ? (
              <EmptyState icon={<Search />} title="No items match" />
            ) : (
              <ul className="divide-y divide-border">
                <AnimatePresence initial={false}>
                  {filtered.map((item) => (
                    <motion.li
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2/50 sm:px-5"
                    >
                      <button
                        type="button"
                        onClick={() => setEditing({ ...item })}
                        className="flex min-w-0 flex-1 items-center gap-4 rounded-lg text-left focus-visible:focus-ring"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-muted-foreground ring-1 ring-border">
                          <Package className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{item.name}</span>
                          <span className="block truncate text-[13px] text-muted-foreground">
                            {item.description ||
                              (item.unit ? `per ${item.unit}` : "No description")}
                          </span>
                        </span>
                        <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                          {item.hsnSac && (
                            <Badge size="sm" tone="outline">
                              HSN {item.hsnSac}
                            </Badge>
                          )}
                          <Badge size="sm">GST {item.gstRate || 0}%</Badge>
                        </span>
                        <span className="w-28 text-right font-semibold tabular-nums">
                          {formatMoney(
                            item.price || "0",
                            settings.invoiceDefaults.currency,
                            settings.formats.numberGrouping,
                          )}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Actions for ${item.name}`}
                          >
                            <Ellipsis />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem
                            icon={<Pencil />}
                            onSelect={() => setEditing({ ...item })}
                          >
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            icon={<Trash />}
                            tone="danger"
                            onSelect={() => void remove(item)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}
          </Card>
        </>
      )}
      <ItemDialog draft={editing} rates={settings.gst.rates} onClose={() => setEditing(null)} />
    </Page>
  );
}

function ItemDialog({
  draft,
  rates,
  onClose,
}: {
  draft: Draft | null;
  rates: string[];
  onClose: () => void;
}) {
  const shown = useRetained(draft);
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        {shown && (
          <ItemForm key={objectKey(shown)} initial={shown} rates={rates} onClose={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({
  initial,
  rates,
  onClose,
}: {
  initial: Draft;
  rates: string[];
  onClose: () => void;
}) {
  const [form, setForm] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (partial: Partial<Draft>) => setForm((f) => ({ ...f, ...partial }));
  const save = async () => {
    setTouched(true);
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await saveItem({ ...form, name: form.name.trim() });
      toast.success(form.id ? "Item updated" : "Item added");
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <DialogHeader icon={<Package />} title={form.id ? "Edit item" : "Add item"} />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DialogBody className="grid gap-4">
          <Field
            label="Name"
            required
            error={touched && !form.name.trim() ? "Add a name." : undefined}
          >
            <Input
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              maxLength={200}
              autoFocus
            />
          </Field>
          <Field label="Description" optional>
            <Textarea
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={2}
              maxLength={1000}
            />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Rate">
              <DecimalInput
                value={form.price ?? ""}
                onValueChange={(price) => set({ price })}
                maxDecimals={2}
                placeholder="0.00"
              />
            </Field>
            <Field label="Unit" optional>
              <AutocompleteInput<string>
                value={form.unit ?? ""}
                onChange={(v) => set({ unit: v.slice(0, 20) })}
                suggestions={COMMON_UNITS}
                getKey={(u) => u}
                getLabel={(u) => u}
                onPick={(unit) => set({ unit })}
                placeholder="pcs"
                heading="Common units"
              />
            </Field>
            <Field label="GST rate">
              <GstRateSelect
                value={form.gstRate ?? ""}
                onChange={(gstRate) => set({ gstRate })}
                rates={rates}
              />
            </Field>
            <Field label="HSN/SAC" optional>
              <Input
                value={form.hsnSac}
                onChange={(e) => set({ hsnSac: sanitizeHsnSac(e.target.value) })}
                inputMode="numeric"
              />
            </Field>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {form.id ? "Save changes" : "Add item"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
