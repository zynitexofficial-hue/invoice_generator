"use client";

import { Archive, Ellipsis, FileText, Pencil, Plus, Trash, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { usePurchases, useSettings, useVendors } from "@/db/hooks";
import { deleteVendor, saveVendor } from "@/db/vendors";
import { payablesReport } from "@/lib/analytics/payables";
import { todayISO } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { stateName } from "@/lib/gst/states";
import type { Vendor } from "@/lib/schema";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { confirm } from "@/components/ui/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { StatementDialog } from "./statement-dialog";
import { VendorSheet, type VendorDraft } from "./vendor-sheet";

/** The vendor master: list, add/edit, archive, delete and statements. */
export function VendorsPanel() {
  const vendors = useVendors();
  const purchases = usePurchases();
  const settings = useSettings();
  const [editing, setEditing] = useState<VendorDraft | null>(null);
  const [statementFor, setStatementFor] = useState<Vendor | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const owed = useMemo(() => {
    if (!vendors || !purchases) return new Map<string, string>();
    const r = payablesReport(purchases, vendors, todayISO());
    return new Map(r.byVendor.map((v) => [v.vendorId, v.outstanding]));
  }, [vendors, purchases]);

  if (!vendors || !purchases || !settings) return <Skeleton className="h-64 w-full rounded-2xl" />;

  const money = (v: string) =>
    formatMoney(v, settings.invoiceDefaults.currency, settings.formats.numberGrouping);
  const shown = vendors.filter((v) => showArchived || !v.archived);
  const archivedCount = vendors.filter((v) => v.archived).length;

  const remove = async (v: Vendor) => {
    const billCount = purchases.filter((p) => p.vendorId === v.id).length;
    const ok = await confirm({
      title: `Delete ${v.name}?`,
      description: billCount
        ? `${billCount} bill${billCount === 1 ? "" : "s"} keep the vendor's name and GSTIN but are no longer linked. This can't be undone. You can archive instead.`
        : "This can't be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteVendor(v.id);
      toast.success("Vendor deleted");
    } catch {
      /* storage error dialog already shown */
    }
  };

  const toggleArchive = async (v: Vendor) => {
    try {
      await saveVendor({ ...v, archived: !v.archived });
      toast.success(v.archived ? "Vendor restored" : "Vendor archived");
    } catch {
      /* storage error dialog already shown */
    }
  };

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => setEditing({})}>
          <Plus />
          Add vendor
        </Button>
        {archivedCount > 0 && (
          <Button
            variant={showArchived ? "soft" : "secondary"}
            aria-pressed={showArchived}
            onClick={() => setShowArchived((s) => !s)}
          >
            Show archived ({archivedCount})
          </Button>
        )}
      </div>
      <Card className="overflow-hidden">
        {shown.length === 0 ? (
          <EmptyState
            icon={<Users />}
            title="No vendors yet"
            description="Save the people you buy from once, then pick them on bills. Their GSTIN, state and payment terms fill in for you."
            action={
              <Button variant="primary" onClick={() => setEditing({})}>
                <Plus />
                Add vendor
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border">
            {shown.map((v) => (
              <li key={v.id} className="flex items-center gap-2 px-4 py-3">
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded text-left focus-visible:focus-ring"
                  onClick={() => setEditing({ ...v })}
                  aria-label={`Edit vendor ${v.name}`}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium">{v.name}</span>
                    {v.msme && (
                      <Badge size="sm" tone="info">
                        MSME
                      </Badge>
                    )}
                    {v.archived && (
                      <Badge size="sm" tone="neutral">
                        Archived
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[
                      v.gstin,
                      v.stateCode ? stateName(v.stateCode) : "",
                      `${v.paymentTermsDays}-day terms`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </button>
                <span className="text-right">
                  <span className="block text-sm font-semibold tabular-nums">
                    {money(owed.get(v.id) ?? "0.00")}
                  </span>
                  <span className="block text-xs text-muted-foreground">you owe</span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${v.name}`}>
                      <Ellipsis />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem icon={<Pencil />} onSelect={() => setEditing({ ...v })}>
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<FileText />} onSelect={() => setStatementFor(v)}>
                      Statement
                    </DropdownMenuItem>
                    <DropdownMenuItem icon={<Archive />} onSelect={() => void toggleArchive(v)}>
                      {v.archived ? "Restore" : "Archive"}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      icon={<Trash />}
                      tone="danger"
                      onSelect={() => void remove(v)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <VendorSheet draft={editing} settings={settings} onClose={() => setEditing(null)} />
      <StatementDialog
        vendor={statementFor}
        purchases={purchases}
        settings={settings}
        onClose={() => setStatementFor(null)}
      />
    </div>
  );
}
