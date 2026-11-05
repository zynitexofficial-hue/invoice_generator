"use client";

import {
  Ellipsis,
  FilePlus,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash,
  TriangleAlert,
  Users,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { useCustomers, useInvoices } from "@/db/hooks";
import { deleteCustomer, saveCustomer } from "@/db/records";
import { checkGstin, normalizeGstin, stateFromGstin } from "@/lib/gst/gstin";
import { stateLabel } from "@/lib/gst/states";
import { isIndia } from "@/lib/gst/tax";
import type { Customer } from "@/lib/schema";
import { objectKey, useRetained } from "@/hooks/use-retained";
import { Page } from "@/components/layout/page";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
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
import { StateSelect } from "@/components/forms/pickers";

type Draft = Partial<Customer> & { name: string };

const EMPTY: Draft = {
  name: "",
  company: "",
  email: "",
  phone: "",
  billingAddress: "",
  shippingAddress: "",
  stateCode: "",
  country: "India",
  gstin: "",
  notes: "",
};

export function CustomersView() {
  const customers = useCustomers();
  const invoices = useInvoices();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Draft | null>(null);

  const usage = useMemo(() => {
    const map = new Map<string, number>();
    for (const inv of invoices ?? [])
      if (inv.customer.customerId)
        map.set(inv.customer.customerId, (map.get(inv.customer.customerId) ?? 0) + 1);
    return map;
  }, [invoices]);

  const duplicates = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of customers ?? []) {
      for (const key of [`n:${c.name.trim().toLowerCase()}`, c.gstin ? `g:${c.gstin}` : ""])
        if (key) seen.set(key, (seen.get(key) ?? 0) + 1);
    }
    return (c: Customer) =>
      (seen.get(`n:${c.name.trim().toLowerCase()}`) ?? 0) > 1 ||
      (c.gstin ? (seen.get(`g:${c.gstin}`) ?? 0) > 1 : false);
  }, [customers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!customers) return [];
    if (!q) return customers;
    return customers.filter((c) =>
      `${c.name} ${c.company} ${c.email} ${c.phone} ${c.gstin}`.toLowerCase().includes(q),
    );
  }, [customers, query]);

  if (!customers) {
    return (
      <Page title="Customers">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      </Page>
    );
  }

  const remove = async (c: Customer) => {
    const ok = await confirm({
      title: `Delete ${c.name}?`,
      description: "Existing invoices keep their copy of this customer's details.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (ok) {
      await deleteCustomer(c.id);
      toast.success("Customer deleted");
    }
  };

  return (
    <Page
      title="Customers"
      description="Save customer details once and pick them on any invoice."
      actions={
        <Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
          <Plus />
          Add customer
        </Button>
      }
    >
      {customers.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No customers yet"
            description="Add a customer here, or save one straight from the invoice editor."
            action={
              <Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
                <Plus />
                Add customer
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, company, GSTIN, email…"
            leading={<Search />}
            className="mb-4 max-w-md"
            aria-label="Search customers"
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
          {filtered.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Search />}
                title="No customers match"
                description="Try a different search."
              />
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {filtered.map((c) => (
                  <motion.div
                    key={c.id}
                    layout
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.98 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Card className="group flex h-full flex-col p-5 transition-shadow hover:shadow-md">
                      <div className="flex items-start gap-3">
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-sm font-semibold text-primary-soft-foreground">
                          {c.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{c.name}</div>
                          {(c.company ||
                            (isIndia(c.country) ? stateLabel(c.stateCode) : c.country)) && (
                            <div className="truncate text-[13px] text-muted-foreground">
                              {c.company ||
                                (isIndia(c.country) ? stateLabel(c.stateCode) : c.country)}
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Actions for ${c.name}`}
                            >
                              <Ellipsis />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem
                              icon={<FilePlus />}
                              onSelect={() => router.push(`/invoice?new=1&customer=${c.id}`)}
                            >
                              New invoice
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              icon={<Pencil />}
                              onSelect={() => setEditing({ ...c })}
                            >
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              icon={<Trash />}
                              tone="danger"
                              onSelect={() => void remove(c)}
                            >
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="mt-4 space-y-1.5 text-[13px] text-muted-foreground">
                        {c.email && (
                          <div className="flex items-center gap-2 truncate">
                            <Mail className="size-3.5 shrink-0" />
                            {c.email}
                          </div>
                        )}
                        {c.phone && (
                          <div className="flex items-center gap-2">
                            <Phone className="size-3.5 shrink-0" />
                            {c.phone}
                          </div>
                        )}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-4">
                        {c.gstin && (
                          <Badge size="sm" tone="outline" className="font-mono">
                            {c.gstin}
                          </Badge>
                        )}
                        {(usage.get(c.id) ?? 0) > 0 && (
                          <Badge size="sm">
                            {usage.get(c.id)} {usage.get(c.id) === 1 ? "document" : "documents"}
                          </Badge>
                        )}
                        {duplicates(c) && (
                          <Badge size="sm" tone="warning">
                            <TriangleAlert />
                            Possible duplicate
                          </Badge>
                        )}
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
      <CustomerDialog draft={editing} onClose={() => setEditing(null)} />
    </Page>
  );
}

function CustomerDialog({ draft, onClose }: { draft: Draft | null; onClose: () => void }) {
  const shown = useRetained(draft);
  return (
    <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="lg">
        {shown && <CustomerForm key={objectKey(shown)} initial={shown} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CustomerForm({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const [form, setForm] = useState<Draft>(() => ({ ...EMPTY, ...initial }));
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);
  const set = (partial: Partial<Draft>) => setForm((f) => ({ ...f, ...partial }));
  const gstinCheck = form.gstin ? checkGstin(form.gstin) : null;
  const india = isIndia(form.country ?? "");

  const save = async () => {
    setTouched(true);
    if (!form.name.trim()) return;
    setBusy(true);
    try {
      await saveCustomer({ ...form, name: form.name.trim() });
      toast.success(form.id ? "Customer updated" : "Customer added");
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DialogHeader
        icon={<Users />}
        title={form.id ? "Edit customer" : "Add customer"}
        description="Details are copied onto invoices when you pick this customer."
      />
      <form
        className="flex min-h-0 flex-1 flex-col"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <DialogBody className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Name"
              required
              error={touched && !form.name.trim() ? "Add a name." : undefined}
            >
              <Input
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={160}
                autoFocus
              />
            </Field>
            <Field label="Company" optional>
              <Input
                value={form.company}
                onChange={(e) => set({ company: e.target.value })}
                maxLength={160}
              />
            </Field>
          </div>
          <Field label="Billing address">
            <Textarea
              value={form.billingAddress}
              onChange={(e) => set({ billingAddress: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Country">
              <Input
                value={form.country}
                onChange={(e) => set({ country: e.target.value })}
                maxLength={80}
              />
            </Field>
            {india && (
              <Field label="State">
                <StateSelect
                  value={form.stateCode ?? ""}
                  onChange={(stateCode) => set({ stateCode })}
                />
              </Field>
            )}
          </div>
          {india && (
            <Field
              label="GSTIN"
              optional
              warning={gstinCheck && !gstinCheck.valid ? gstinCheck.message : undefined}
            >
              <Input
                value={form.gstin}
                onChange={(e) => {
                  const gstin = normalizeGstin(e.target.value);
                  const derived = stateFromGstin(gstin);
                  set({ gstin, ...(derived && !form.stateCode ? { stateCode: derived } : {}) });
                }}
                maxLength={15}
                className="font-mono tracking-wide uppercase"
                spellCheck={false}
              />
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" optional>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                maxLength={160}
              />
            </Field>
            <Field label="Phone" optional>
              <Input
                type="tel"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                maxLength={40}
              />
            </Field>
          </div>
          <Field label="Shipping address" optional hint="Leave empty if it's the same as billing.">
            <Textarea
              value={form.shippingAddress}
              onChange={(e) => set({ shippingAddress: e.target.value })}
              rows={2}
              maxLength={500}
            />
          </Field>
          <Field label="Private notes" optional hint="Only visible to you — never printed.">
            <Textarea
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              rows={2}
              maxLength={1000}
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" loading={busy}>
            {form.id ? "Save changes" : "Add customer"}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
