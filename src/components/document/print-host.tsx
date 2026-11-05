"use client";

import { useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import type { DocViewModel } from "@/lib/render/view-model";
import type { DesignCustomization, TemplateId } from "@/lib/schema";
import { useMounted } from "@/hooks/use-mounted";
import { DocumentPages } from "./document-pages";

interface PrintJob {
  id: number;
  vm: DocViewModel;
  design: DesignCustomization;
  templateId: TemplateId;
  /** Becomes the suggested PDF file name in the print dialog. */
  title: string;
  resolve: () => void;
}

interface PrintState {
  job: PrintJob | null;
  start: (job: PrintJob) => void;
  finish: () => void;
}

const usePrintStore = create<PrintState>((set, get) => ({
  job: null,
  start: (job) => {
    get().job?.resolve();
    set({ job });
  },
  finish: () => {
    get().job?.resolve();
    set({ job: null });
  },
}));

let nextId = 1;

/**
 * Open the browser's print dialog for a document. Resolves once the dialog
 * has been opened — on desktop Chrome that is after it closes (print() blocks),
 * on iOS/Safari immediately — so callers never wait on an `afterprint` event
 * that some mobile browsers never send.
 */
export function printDocument(input: Omit<PrintJob, "id" | "resolve">): Promise<void> {
  return new Promise((resolve) => {
    usePrintStore.getState().start({ ...input, id: nextId++, resolve });
  });
}

export function useIsPrinting() {
  return usePrintStore((s) => s.job !== null);
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

/** Mounted once in the root layout. Renders the job into #print-root and prints it. */
export function PrintHost() {
  const job = usePrintStore((s) => s.job);
  const finish = usePrintStore((s) => s.finish);
  const mounted = useMounted();
  const printedJob = useRef<number>(0);

  const handleLayout = useCallback(async () => {
    if (!job || printedJob.current === job.id) return;
    printedJob.current = job.id;
    try {
      await document.fonts?.ready;
    } catch {
      /* ignore */
    }
    // Let the browser paint the final pagination before snapshotting.
    await nextFrame();
    await nextFrame();
    const previousTitle = document.title;
    document.title = job.title;
    const done = () => {
      window.removeEventListener("afterprint", done);
      document.title = previousTitle;
      finish();
    };
    window.addEventListener("afterprint", done);
    window.print();
    // The print root stays mounted until afterprint; the caller can move on now.
    job.resolve();
    // Browsers without `afterprint` (some mobile ones) would otherwise keep the job open.
    setTimeout(() => {
      if (usePrintStore.getState().job?.id === job.id && !("onafterprint" in window)) done();
    }, 1000);
  }, [job, finish]);

  if (!mounted || !job) return null;

  const pageSize = job.design.pageSize === "Letter" ? "letter" : "A4";
  return createPortal(
    <div id="print-root" key={job.id}>
      <style>{`@page { size: ${pageSize} portrait; margin: 0; }`}</style>
      <DocumentPages
        vm={job.vm}
        design={job.design}
        templateId={job.templateId}
        onLayout={handleLayout}
      />
    </div>,
    document.body,
  );
}
