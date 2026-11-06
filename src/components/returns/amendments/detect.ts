import { buildGstr1 } from "@/lib/gst/returns";
import { periodLabel } from "@/lib/period";
import type { Amendment, AppSettings, Filing, Invoice, ReturnSnapshot } from "@/lib/schema";
import { filedSnapshot, gstr1SnapshotRecords } from "../returns-data";
import { diffSnapshot } from "../snapshot-diff";

/**
 * Documents whose return was filed and which were edited, cancelled or moved
 * out of the period afterwards ("changed since filed"). Pure.
 *
 * The filed snapshot stores only a hash per document, so we know THAT a
 * document changed, not what it said when it was filed: the user confirms
 * the original values when recording the amendment.
 */

export type CandidateChange = "changed" | "cancelled" | "moved" | "added";

export interface AmendmentCandidate {
  /** `${periodKey}|${invoiceId}` */
  key: string;
  invoiceId: string;
  invoice: Invoice | undefined;
  periodKey: string;
  periodLabel: string;
  filedAt: string;
  change: CandidateChange;
  /** An unreported amendment already exists for it. */
  amendment: Amendment | undefined;
}

export function detectCandidates(input: {
  invoices: readonly Invoice[];
  settings: AppSettings;
  filings: readonly Filing[];
  /** Snapshots of GSTR-1 filings, newest first. */
  snapshots: readonly ReturnSnapshot[];
  amendments: readonly Amendment[];
}): AmendmentCandidate[] {
  const { invoices, settings, filings, snapshots, amendments } = input;
  const byId = new Map(invoices.map((i) => [i.id, i]));
  const out: AmendmentCandidate[] = [];
  const filed = filings.filter((f) => f.returnType === "GSTR-1" && f.status === "filed");
  for (const filing of filed) {
    const snap = filedSnapshot(snapshots.filter((s) => s.filingId === filing.id));
    if (!snap) continue;
    const current = buildGstr1({ invoices: [...invoices], settings, periodKey: filing.periodKey });
    const diff = diffSnapshot(
      snap.records.filter((r) => r.kind === "invoice"),
      gstr1SnapshotRecords(current),
    );
    const push = (id: string, change: CandidateChange) => {
      const invoice = byId.get(id);
      const effective: CandidateChange =
        change === "changed" && invoice?.status === "cancelled" ? "cancelled" : change;
      out.push({
        key: `${filing.periodKey}|${id}`,
        invoiceId: id,
        invoice,
        periodKey: filing.periodKey,
        periodLabel: periodLabel(filing.periodKey),
        filedAt: filing.filedAt,
        change: effective,
        amendment: amendments.find(
          (a) =>
            a.originalInvoiceId === id &&
            a.originalPeriodKey === filing.periodKey &&
            a.status !== "reported",
        ),
      });
    };
    diff.changed.forEach((r) => push(r.id, "changed"));
    diff.removed.forEach((r) => push(r.id, "moved"));
    diff.added.forEach((r) => push(r.id, "added"));
  }
  const order: Record<CandidateChange, number> = { cancelled: 0, changed: 1, moved: 2, added: 3 };
  return out.sort(
    (a, b) => order[a.change] - order[b.change] || b.periodKey.localeCompare(a.periodKey),
  );
}

export const CHANGE_TEXT: Record<CandidateChange, string> = {
  cancelled: "Cancelled after filing",
  changed: "Edited after filing",
  moved: "Date changed, now outside this period",
  added: "Added after filing",
};
