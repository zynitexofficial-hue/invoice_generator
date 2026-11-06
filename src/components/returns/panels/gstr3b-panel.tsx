"use client";

import { useMemo } from "react";
import { useAmendments, usePeriodInput } from "@/db/hooks";
import {
  buildGstr3bWorksheet,
  gstr2bAvailableHeads,
  gstr2bSuggestedInputs,
} from "@/lib/gst/gstr3b";
import { monthsInPeriod } from "@/lib/period";
import { Skeleton } from "@/components/ui/misc";
import { useAmendmentSections } from "../amendments/use-sections";
import { Gstr3bTab } from "../gstr3b-tab";
import { useReconData } from "../gstr2b/use-recon";
import { useItcSource } from "../gstr3b/use-itc-source";
import {
  InputsCard,
  ItcTableCard,
  LockedRowsAlert,
  SetOffCard,
  Table31dCard,
} from "../gstr3b/worksheet-cards";
import type { ReturnsTabContext } from "../tab-context";

/** Returns > GSTR-3B: the full worksheet (Tables 3.1, 3.2, 4, set-off and manual inputs). */
export function Gstr3bPanel({ ctx }: { ctx: ReturnsTabContext }) {
  const source = useItcSource();
  const input = usePeriodInput(ctx.period);
  const recon = useReconData();
  const amendmentRows = useAmendments();
  // Ready GSTR-1A amendments for this period change the outward tax payable in 3B.
  const { sections: amendmentSections } = useAmendmentSections(
    amendmentRows,
    ctx.period,
    ctx.invoices,
    ctx.settings,
  );
  const months = useMemo(() => monthsInPeriod(ctx.period), [ctx.period]);
  const results = useMemo(
    () => recon.recons.filter((r) => months.includes(r.imp.periodKey)).map((r) => r.result),
    [recon.recons, months],
  );

  const ws = useMemo(() => {
    if (!source || input === undefined) return undefined;
    return buildGstr3bWorksheet({
      base: ctx.gstr3b,
      itcLines: source(ctx.period),
      input,
      gstr2bAvailable: results.length ? gstr2bAvailableHeads(results) : null,
      amendmentsFromGstr1a:
        amendmentSections.count > 0
          ? {
              igst: amendmentSections.net.igst,
              cgst: amendmentSections.net.cgst,
              sgst: amendmentSections.net.sgst,
              cess: amendmentSections.net.cess,
            }
          : undefined,
    });
  }, [source, input, ctx.gstr3b, ctx.period, results, amendmentSections]);

  if (!ws || recon.loading) return <Skeleton className="h-96 w-full rounded-2xl" />;

  const slot = (
    <>
      <LockedRowsAlert ws={ws} />
      <Table31dCard ws={ws} f={ctx.f} />
      <ItcTableCard ws={ws} f={ctx.f} />
      <SetOffCard ws={ws} f={ctx.f} />
      <InputsCard
        key={ctx.period}
        periodKey={ctx.period}
        input={input ?? null}
        suggested={results.length ? gstr2bSuggestedInputs(results) : null}
      />
    </>
  );

  return (
    <Gstr3bTab
      result={ctx.gstr3b}
      gstin={ctx.gstr1.gstin}
      invoices={ctx.invoices}
      filing={ctx.g3Filing}
      due={ctx.g3Due}
      f={ctx.f}
      onPrint={ctx.onPrint}
      worksheet={ws}
      worksheetSlot={<div className="space-y-4">{slot}</div>}
    />
  );
}
