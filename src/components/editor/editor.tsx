"use client";

import {
  ArrowLeft,
  Braces,
  Copy,
  Download,
  Ellipsis,
  Eye,
  FilePlus,
  FileText,
  Palette,
  PenLine,
  Search,
  Trash,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { exportInvoiceFile } from "@/db/backup";
import { useDesigns, useSettings } from "@/db/hooks";
import { deleteInvoice, getInvoice, latestDraft, peekNumber } from "@/db/invoices";
import { DOC_TYPE_META } from "@/lib/documents";
import { formatMoney } from "@/lib/format";
import { createInvoice, duplicateInvoice, toInvoiceCustomer } from "@/lib/invoice-factory";
import { getDb } from "@/db/db";
import { DOC_TYPES, type AppSettings, type DocType, type SavedDesign } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useEditor } from "@/stores/editor-store";
import { DesignPanel } from "@/components/design/design-panel";
import { usePalette } from "@/components/layout/command-palette";
import { SavedDesigns } from "@/components/design/saved-designs";
import { StorageBanner } from "@/components/storage/storage-guard";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import { useMediaQuery } from "@/hooks/use-media-query";
import { DocumentSection } from "./document-section";
import { EditorProvider, useEditorContext } from "./editor-context";
import { ItemsSection } from "./items-section";
import { CustomerSection, SellerSection } from "./parties-section";
import { PaymentDetailsSection } from "./payment-details-section";
import { PaymentTermsSection } from "./payment-terms-section";
import { PreviewPanel } from "./preview-panel";
import { SaveStatus } from "./save-status";
import { revealField } from "./section";
import { AnimatedAmount, NotesSection, PaymentSection, SummarySection } from "./summary-section";
import { flushSave, useAutosave } from "./use-autosave";
import { useDownload } from "./use-download";

type Tab = "content" | "design" | "preview";

/* ------------------------------------------------------------------ */
/* Loader: resolves which document to open from the URL               */
/* ------------------------------------------------------------------ */

export function EditorRoute() {
  const params = useSearchParams();
  const settings = useSettings();
  const designs = useDesigns();
  const invoiceId = useEditor((s) => s.invoice?.id);
  const [missing, setMissing] = useState(false);
  const loading = useRef<string | null>(null);

  const id = params.get("id");
  const wantsNew = params.get("new") === "1";
  const type = params.get("type");
  const from = params.get("from");
  const as = params.get("as");
  const customerParam = params.get("customer");

  useEffect(() => {
    if (!settings || !designs) return;
    const key = `${id}|${wantsNew}|${type}|${from}|${as}|${customerParam}`;
    // Our own replaceState after the first save points at the open document — nothing to do.
    if (id && id === useEditor.getState().invoice?.id) return;
    if (loading.current === key) return;
    loading.current = key;

    void (async () => {
      await flushSave();
      setMissing(false);
      const docType = DOC_TYPES.includes(type as DocType) ? (type as DocType) : undefined;
      const now = new Date();

      if (from) {
        const source = await getInvoice(from);
        if (!source) return setMissing(true);
        const targetType = DOC_TYPES.includes(as as DocType) ? (as as DocType) : source.docType;
        const generated = await peekNumber(settings, targetType, now, source.seller.name);
        useEditor
          .getState()
          .load(duplicateInvoice(source, settings, generated, targetType, now), false, {
            dirty: true,
          });
        void flushSave();
        return;
      }
      if (id) {
        const found = await getInvoice(id);
        if (!found) return setMissing(true);
        useEditor.getState().load(found, true);
        return;
      }
      if (!wantsNew) {
        const draft = await latestDraft();
        if (draft) {
          useEditor.getState().load(draft, true);
          window.history.replaceState(window.history.state, "", `/invoice?id=${draft.id}`);
          return;
        }
      }
      const resolvedType =
        docType ?? (settings.gst.registered ? settings.invoiceDefaults.docType : "invoice");
      const generated = await peekNumber(settings, resolvedType, now);
      let invoice = createInvoice({ settings, designs, docType: resolvedType, generated, now });
      const customer = customerParam ? await getDb().customers.get(customerParam) : undefined;
      if (customer) invoice = { ...invoice, customer: toInvoiceCustomer(customer) };
      useEditor.getState().load(invoice, false, { dirty: Boolean(customer) });
      if (wantsNew) window.history.replaceState(window.history.state, "", "/invoice");
    })();
  }, [settings, designs, id, wantsNew, type, from, as, customerParam]);

  if (missing) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState
          icon={<FileText />}
          title="Document not found"
          description="It may have been deleted, or it was created in another browser. Open an invoice file instead, or start a new one."
          action={
            <>
              <Button variant="secondary" asChild>
                <Link href="/history">Go to history</Link>
              </Button>
              <Button variant="primary" asChild>
                <Link href="/invoice?new=1">New invoice</Link>
              </Button>
            </>
          }
        />
      </div>
    );
  }

  if (!settings || !invoiceId) return <EditorSkeleton />;
  return <Editor settings={settings} />;
}

function EditorSkeleton() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex h-14 items-center gap-3 border-b border-border px-4">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-9 w-32" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-full space-y-4 p-4 lg:w-[560px] lg:p-6">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-44 w-full rounded-2xl" />
          ))}
        </div>
        <div className="hidden flex-1 items-start justify-center bg-surface-3/60 p-10 lg:flex">
          <Skeleton className="aspect-[210/297] w-full max-w-[560px] rounded" />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Editor                                                              */
/* ------------------------------------------------------------------ */

function Editor({ settings }: { settings: AppSettings }) {
  useAutosave();
  const router = useRouter();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const [tab, setTab] = useState<Tab>("content");
  const activeTab: Tab = isDesktop && tab === "preview" ? "content" : tab;
  const formRef = useRef<HTMLDivElement>(null);

  const jumpToField = useCallback((field: string) => {
    setTab("content");
    revealField(field);
    // Wait for the content tab (and any collapsed section) to render.
    setTimeout(() => {
      const el = document.getElementById(field);
      const form = formRef.current;
      if (!el || !form) return;
      // Scroll only the form panel; scrollIntoView would also nudge the locked page.
      const box = el.getBoundingClientRect();
      const panel = form.getBoundingClientRect();
      form.scrollTo({
        top: form.scrollTop + box.top - panel.top - (panel.height - box.height) / 2,
        behavior: "smooth",
      });
      const focusable = el.matches("input,textarea,button,[tabindex]")
        ? el
        : el.querySelector<HTMLElement>("input,textarea,button");
      focusable?.focus({ preventScroll: true });
    }, 120);
  }, []);

  const download = useDownload(settings, jumpToField);

  // The editor is a one-screen app view where the form and the preview scroll on their own.
  // Lock the page itself, or anything injected below it (browser extensions, dev overlays)
  // makes the whole page scroll too and a second scrollbar appears beside the preview's.
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
    };
  }, []);

  // Ctrl/Cmd+P runs our download flow instead of printing the app UI.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "p") {
        e.preventDefault();
        download.start();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void flushSave().then(() => toast.success("Saved"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [download]);

  return (
    <EditorProvider value={{ settings }}>
      <div className="flex h-dvh min-h-0 flex-col">
        <Toolbar
          tab={activeTab}
          setTab={setTab}
          isDesktop={isDesktop}
          onDownload={download.start}
          downloading={download.busy}
          onNavigate={(href) => router.push(href)}
        />
        <div className="flex min-h-0 flex-1">
          {/*
            Form takes ~46% of the space beside the 4rem rail (30–54rem), the preview the rest,
            so the A4 page reaches full size on wide screens without an empty band around it.
          */}
          <div
            ref={formRef}
            className={cn(
              "min-h-0 w-full overflow-y-auto overscroll-contain lg:w-[clamp(30rem,calc((100vw-4rem)*0.46),54rem)] lg:shrink-0 lg:border-r lg:border-border",
              activeTab === "preview" && "hidden",
            )}
          >
            <div className="mx-auto max-w-2xl space-y-3 p-3 pb-32 sm:space-y-4 sm:p-6 lg:max-w-none lg:pb-12">
              <div className="empty:hidden">
                <StorageBanner />
              </div>
              {activeTab === "content" ? <ContentForm /> : <DesignTab />}
            </div>
          </div>
          {(isDesktop || activeTab === "preview") && (
            <PreviewPanel settings={settings} className="min-w-0 flex-1" />
          )}
        </div>
        {!isDesktop && <MobileBar onDownload={download.start} downloading={download.busy} />}
        {download.dialogs}
      </div>
    </EditorProvider>
  );
}

function ContentForm() {
  return (
    <>
      <DocumentSection />
      <SellerSection />
      <CustomerSection />
      <ItemsSection />
      <SummarySection />
      <PaymentTermsSection />
      <PaymentDetailsSection />
      <PaymentSection />
      <NotesSection />
    </>
  );
}

function DesignTab() {
  const design = useEditor((s) => s.invoice!.design);
  const { setTemplate, patchDesign, setDesign } = useEditor.getState();
  return (
    <DesignPanel
      templateId={design.templateId}
      customization={design.customization}
      onTemplateChange={setTemplate}
      onChange={patchDesign}
      savedDesigns={
        <SavedDesigns
          templateId={design.templateId}
          customization={design.customization}
          onApply={(d: SavedDesign) => {
            setDesign(d.templateId, d.customization);
            toast.success(`Applied “${d.name}”`);
          }}
        />
      }
    />
  );
}

/* ---------------- Toolbar ---------------- */

function Toolbar({
  tab,
  setTab,
  isDesktop,
  onDownload,
  downloading,
  onNavigate,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  isDesktop: boolean;
  onDownload: () => void;
  downloading: boolean;
  onNavigate: (href: string) => void;
}) {
  const number = useEditor((s) => s.invoice!.number);
  const docType = useEditor((s) => s.invoice!.docType);
  const persisted = useEditor((s) => s.persisted);
  const { settings } = useEditorContext();
  const total = useEditor((s) => s.totals?.grandTotal ?? "0");
  const currency = useEditor((s) => s.invoice!.currency);

  const tabs = isDesktop
    ? [
        { value: "content" as Tab, label: "Content", icon: <PenLine /> },
        { value: "design" as Tab, label: "Design", icon: <Palette /> },
      ]
    : [
        { value: "content" as Tab, label: "Edit", icon: <PenLine /> },
        { value: "design" as Tab, label: "Design", icon: <Palette /> },
        { value: "preview" as Tab, label: "Preview", icon: <Eye /> },
      ];

  const exportFile = async () => {
    await flushSave();
    const inv = useEditor.getState().invoice;
    if (inv) {
      exportInvoiceFile(inv);
      toast.success("Invoice file downloaded", {
        description: "Open it later from History to edit or duplicate.",
      });
    }
  };

  const remove = async () => {
    const inv = useEditor.getState().invoice;
    if (!inv) return;
    const ok = await confirm({
      title: `Delete ${inv.number || "this document"}?`,
      description:
        "It will be removed from this browser. Downloaded PDFs and invoice files are not affected.",
      confirmLabel: "Delete",
      tone: "danger",
    });
    if (!ok) return;
    if (useEditor.getState().persisted) await deleteInvoice(inv.id);
    useEditor.getState().clear();
    toast.success("Document deleted");
    onNavigate("/history");
  };

  return (
    <header className="z-20 shrink-0 border-b border-border bg-surface/80 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-2 sm:px-4">
        <Tooltip content="Back to history">
          <Button variant="ghost" size="icon" asChild aria-label="Back to history">
            <Link href="/history">
              <ArrowLeft />
            </Link>
          </Button>
        </Tooltip>
        <div className="min-w-0 flex-1 sm:flex-none">
          <div className="flex items-center gap-2">
            <span className="hidden text-xs font-medium text-muted-foreground sm:inline">
              {DOC_TYPE_META[docType].shortLabel}
            </span>
            <span className="truncate text-sm font-semibold tabular-nums">
              {number || "Untitled"}
            </span>
          </div>
          <SaveStatus />
        </div>

        {isDesktop && (
          <Segmented<Tab>
            className="mx-auto"
            value={tab}
            onValueChange={setTab}
            options={tabs}
            aria-label="Editor view"
          />
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip content="Search & commands (Ctrl/⌘ K)">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Search and commands"
              onClick={() => usePalette.getState().setOpen(true)}
            >
              <Search />
            </Button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="More actions">
                <Ellipsis />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-60">
              <DropdownMenuItem icon={<FilePlus />} onSelect={() => onNavigate("/invoice?new=1")}>
                New document
              </DropdownMenuItem>
              <DropdownMenuItem
                icon={<Copy />}
                disabled={!persisted}
                onSelect={async () => {
                  await flushSave();
                  const id = useEditor.getState().invoice?.id;
                  if (id) onNavigate(`/invoice?from=${id}`);
                }}
              >
                Duplicate
              </DropdownMenuItem>
              {docType === "proforma" && (
                <DropdownMenuItem
                  icon={<FileText />}
                  disabled={!persisted}
                  onSelect={async () => {
                    await flushSave();
                    const id = useEditor.getState().invoice?.id;
                    if (id) onNavigate(`/invoice?from=${id}&as=tax_invoice`);
                  }}
                >
                  Convert to tax invoice
                </DropdownMenuItem>
              )}
              <DropdownMenuItem icon={<Braces />} onSelect={() => void exportFile()}>
                Save invoice file (.json)
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash />} tone="danger" onSelect={() => void remove()}>
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {isDesktop && (
            <>
              {/* Desktop has no total bar like phones do, so the live total sits by the download. */}
              <div className="mr-1 hidden flex-col items-end leading-tight xl:flex">
                <span className="text-[11px] font-medium text-muted-foreground">Total</span>
                <AnimatedAmount
                  value={formatMoney(total, currency, settings.formats.numberGrouping)}
                  className="text-[15px] font-semibold"
                />
              </div>
              <Tooltip content="Save invoice file (.json) to re-open later">
                <Button
                  variant="secondary"
                  size="md"
                  onClick={() => void exportFile()}
                  aria-label="Save invoice file"
                >
                  <Braces />
                  <span className="hidden xl:inline">Save file</span>
                </Button>
              </Tooltip>
              <Button variant="primary" onClick={onDownload} loading={downloading}>
                <Download />
                Download PDF
              </Button>
            </>
          )}
        </div>
      </div>
      {!isDesktop && (
        <div className="px-3 pb-2.5">
          <Segmented<Tab>
            fullWidth
            value={tab}
            onValueChange={setTab}
            options={tabs}
            aria-label="Editor view"
          />
        </div>
      )}
    </header>
  );
}

function MobileBar({ onDownload, downloading }: { onDownload: () => void; downloading: boolean }) {
  const settings = useSettings();
  const total = useEditor((s) => s.totals?.grandTotal ?? "0");
  const currency = useEditor((s) => s.invoice?.currency ?? "INR");
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface/90 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">Total</div>
          <AnimatedAmount
            value={formatMoney(total, currency, settings?.formats.numberGrouping)}
            className="text-lg font-semibold"
          />
        </div>
        <Button variant="primary" size="lg" onClick={onDownload} loading={downloading}>
          <Download />
          Download PDF
        </Button>
      </div>
    </div>
  );
}
