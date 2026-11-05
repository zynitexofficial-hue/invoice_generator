"use client";

import {
  Building,
  Check,
  DatabaseBackup,
  Hash,
  Landmark,
  Lock,
  Percent,
  ReceiptText,
  SlidersHorizontal,
  CircleAlert,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Page } from "@/components/layout/page";
import { Skeleton } from "@/components/ui/misc";
import { Spinner } from "@/components/ui/spinner";
import { BusinessSection, PaymentsSection } from "./business-sections";
import { DataSection } from "./data-section";
import { DefaultsSection, FormatsSection, GstSection, NumberingSection } from "./invoice-sections";
import { SecuritySection } from "./security-section";
import { useSettingsDraft, type DraftStatus } from "./use-settings-draft";

const SECTIONS = [
  {
    id: "business",
    label: "Business profile",
    icon: Building,
    description: "Who appears in the “From” block",
  },
  {
    id: "payments",
    label: "Bank & UPI",
    icon: Landmark,
    description: "Payment details and QR code",
  },
  {
    id: "defaults",
    label: "Invoice defaults",
    icon: ReceiptText,
    description: "Terms, notes and declarations",
  },
  { id: "gst", label: "Tax & GST", icon: Percent, description: "Rates, display and rounding" },
  { id: "numbering", label: "Numbering", icon: Hash, description: "Number patterns per document" },
  {
    id: "formats",
    label: "Formats & theme",
    icon: SlidersHorizontal,
    description: "Dates, numbers, appearance",
  },
  {
    id: "security",
    label: "Security & PIN",
    icon: Lock,
    description: "6-digit screen lock & privacy",
  },
  {
    id: "data",
    label: "Data & backup",
    icon: DatabaseBackup,
    description: "Storage, backup and restore",
  },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsView() {
  const params = useSearchParams();
  const router = useRouter();
  const requested = params.get("section");
  const active: SectionId = SECTIONS.some((s) => s.id === requested)
    ? (requested as SectionId)
    : "business";
  const { draft, update, status } = useSettingsDraft();
  const go = (id: SectionId) => router.replace(`/settings?section=${id}`, { scroll: false });
  const current = SECTIONS.find((s) => s.id === active)!;

  return (
    <Page
      title="Settings"
      description="Everything is saved automatically in this browser."
      actions={<SaveIndicator status={status} />}
    >
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav aria-label="Settings sections">
          {/* Phones: every section visible as a 2-column grid (a sideways scroller hid half of them). */}
          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:sticky lg:top-6 lg:flex lg:flex-col">
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const on = s.id === active;
              return (
                <li key={s.id} className="min-w-0">
                  <button
                    type="button"
                    onClick={() => go(s.id)}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors focus-visible:focus-ring sm:gap-2.5 sm:px-3 sm:text-sm",
                      on
                        ? "text-foreground"
                        : "text-muted-foreground hover:bg-surface-2/70 hover:text-foreground max-lg:bg-surface-2/50",
                    )}
                  >
                    {on && (
                      <motion.span
                        layoutId="settings-active"
                        className="absolute inset-0 rounded-lg bg-surface shadow-xs ring-1 ring-border"
                        transition={{ type: "spring", bounce: 0.15, duration: 0.4 }}
                      />
                    )}
                    <Icon className={cn("relative size-4 shrink-0", on && "text-primary")} />
                    <span className="relative min-w-0 text-left leading-tight">{s.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="min-w-0">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="mb-4">
                <h2 className="text-lg font-semibold tracking-[-0.01em]">{current.label}</h2>
                <p className="text-sm text-muted-foreground">{current.description}</p>
              </div>
              {!draft ? (
                <Skeleton className="h-96 rounded-2xl" />
              ) : active === "business" ? (
                <BusinessSection draft={draft} update={update} />
              ) : active === "payments" ? (
                <PaymentsSection draft={draft} update={update} />
              ) : active === "defaults" ? (
                <DefaultsSection draft={draft} update={update} />
              ) : active === "gst" ? (
                <GstSection draft={draft} update={update} />
              ) : active === "numbering" ? (
                <NumberingSection draft={draft} update={update} />
              ) : active === "formats" ? (
                <FormatsSection draft={draft} update={update} />
              ) : active === "security" ? (
                <SecuritySection settings={draft} update={update} />
              ) : (
                <DataSection />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </Page>
  );
}

function SaveIndicator({ status }: { status: DraftStatus }) {
  const content: Record<DraftStatus, ReactNode> = {
    idle: null,
    saving: (
      <>
        <Spinner className="size-3.5" /> Saving…
      </>
    ),
    saved: (
      <>
        <Check className="size-3.5 text-success" /> All changes saved
      </>
    ),
    error: (
      <>
        <CircleAlert className="size-3.5 text-danger" /> Couldn&apos;t save
      </>
    ),
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {status !== "idle" && (
        <motion.span
          key={status}
          initial={{ opacity: 0, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
          role="status"
        >
          {content[status]}
        </motion.span>
      )}
    </AnimatePresence>
  );
}
