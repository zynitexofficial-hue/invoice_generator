import { toast } from "sonner";
import type { RunReport } from "@/db/recurring";
import { plural } from "@/lib/utils";

/** Tell the user what a recurring run created, in plain words. */
export function toastRunReports(reports: RunReport[]) {
  const created = reports.reduce((n, r) => n + r.created, 0);
  const invoices = reports.filter((r) => r.kind === "invoice").reduce((n, r) => n + r.created, 0);
  const expenses = created - invoices;
  const failed = reports.find((r) => r.error);
  const remaining = reports.reduce((n, r) => n + r.remaining, 0);
  if (created > 0) {
    const parts = [
      invoices ? plural(invoices, "draft invoice") : "",
      expenses ? plural(expenses, "expense") : "",
    ].filter(Boolean);
    toast.success(`Created ${parts.join(" and ")}`, {
      description:
        (invoices ? "Review each draft before you send it. " : "") +
        (remaining ? `${plural(remaining, "more is", "more are")} still due.` : ""),
    });
  } else if (!failed) {
    toast.info("Nothing was due");
  }
  if (failed) toast.error(`Couldn't finish "${failed.name}"`, { description: failed.error });
}
