"use client";

import { Eraser, FileDown } from "lucide-react";
import { toast } from "sonner";
import { buildCustomerExport, eraseCustomerPersonalData } from "@/db/customer-data";
import type { Customer } from "@/lib/schema";
import { downloadBlob, plural, safeFileName } from "@/lib/utils";
import { confirm } from "@/components/ui/confirm";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";

/**
 * Customer data tools (spec H4), shown in each customer's ⋯ menu:
 * "Export customer data" (to answer an access request) and
 * "Erase personal data" (to answer an erasure request).
 */

export async function exportCustomerData(c: Customer) {
  try {
    const data = await buildCustomerExport(c.id);
    if (!data) {
      toast.error("Couldn't find this customer");
      return;
    }
    downloadBlob(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      `${safeFileName(c.name, "customer")} - data ${data.exportedAt.slice(0, 10)}.json`,
    );
    toast.success("Customer data exported", {
      description: `Their details and a list of ${plural(data.invoices.length, "document")}.`,
    });
  } catch {
    toast.error("Couldn't export this customer's data");
  }
}

export async function eraseCustomerData(c: Customer) {
  const ok = await confirm({
    title: `Erase ${c.name}'s personal data?`,
    description: (
      <span className="grid gap-2">
        <span>
          This deletes the saved customer and removes their email and phone number from any draft
          documents.
        </span>
        <span>
          Issued invoices keep the details GST law requires (name, address, GSTIN) — the law
          requires you to keep them for about 72 months, so they are not erased.
        </span>
        <span>This can&apos;t be undone. Export their data first if they asked for a copy.</span>
      </span>
    ),
    confirmLabel: "Erase personal data",
    tone: "danger",
    typeToConfirm: "ERASE",
  });
  if (!ok) return;
  try {
    const r = await eraseCustomerPersonalData(c.id);
    toast.success("Personal data erased", {
      description: `${plural(r.draftsCleared, "draft")} cleared; ${plural(r.issuedKept, "issued document")} kept as required by law.`,
    });
  } catch {
    toast.error("Couldn't erase this customer's data");
  }
}

/** Menu items for the customer card's ⋯ menu. */
export function CustomerDataMenuItems({ customer }: { customer: Customer }) {
  return (
    <>
      <DropdownMenuItem icon={<FileDown />} onSelect={() => void exportCustomerData(customer)}>
        Export customer data
      </DropdownMenuItem>
      <DropdownMenuItem
        icon={<Eraser />}
        tone="danger"
        onSelect={() => void eraseCustomerData(customer)}
      >
        Erase personal data
      </DropdownMenuItem>
    </>
  );
}
