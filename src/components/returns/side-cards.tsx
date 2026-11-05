"use client";

import { BadgeInfo, CalendarDays, FileWarning, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { Deadline } from "@/lib/gst/returns";
import { filingId, type Expense, type Filing, type Invoice, type ReturnType } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/misc";
import { StepBadge } from "./period-bar";
import { dueText, filingStep } from "./returns-data";
import type { RecordChange } from "./snapshot-diff";

/* ---------------- Not applicable ---------------- */

export function NotApplicableCard({
  kind,
}: {
  kind: "composition" | "unregistered" | "no_gstin" | "bad_gstin";
}) {
  const content = {
    composition: {
      title: "GSTR-1 and GSTR-3B don't apply to you",
      text: "You're set up as a composition dealer. Composition dealers file CMP-08 every quarter and GSTR-4 once a year instead — support for those is planned. If you've moved to regular GST, change your registration type in Settings.",
      href: "/settings?section=gst",
      action: "Open Settings → GST",
    },
    unregistered: {
      title: "No GST returns to file",
      text: "You're set up as not registered under GST, so there are no GST returns to prepare. If you've registered, change your registration type and add your GSTIN in Settings.",
      href: "/settings?section=gst",
      action: "Open Settings → GST",
    },
    no_gstin: {
      title: "Add your GSTIN to prepare returns",
      text: "Returns are prepared for your GSTIN. Add it in Settings → Business profile and come back here.",
      href: "/settings?section=business",
      action: "Add GSTIN",
    },
    bad_gstin: {
      title: "Your GSTIN looks wrong",
      text: "Check the GSTIN in Settings → Business profile — returns can't be prepared until it's valid.",
      href: "/settings?section=business",
      action: "Add GSTIN",
    },
  }[kind];
  return (
    <Card>
      <EmptyState
        icon={kind === "composition" || kind === "unregistered" ? <BadgeInfo /> : <Settings />}
        title={content.title}
        description={content.text}
        action={
          <Button variant="primary" asChild>
            <Link href={content.href}>{content.action}</Link>
          </Button>
        }
      />
    </Card>
  );
}

/* ---------------- Changed since filed ---------------- */

const CHANGE_LABEL = { added: "Added", changed: "Edited", removed: "Removed" };

export function ChangedSinceFiledCard({
  changes,
  filedOn,
  invoices,
  expenses,
  formatDate,
}: {
  changes: RecordChange[];
  filedOn: string;
  invoices: Invoice[];
  expenses: Expense[];
  formatDate: (iso: string) => string;
}) {
  const [all, setAll] = useState(false);
  if (changes.length === 0) return null;
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const expById = new Map(expenses.map((e) => [e.id, e]));
  const visible = all ? changes : changes.slice(0, 5);
  const describe = (c: RecordChange) => {
    if (c.kind === "invoice") {
      const inv = invById.get(c.id);
      return {
        name: inv ? inv.number || "Document without number" : "Deleted document",
        href: inv ? `/invoice?id=${encodeURIComponent(c.id)}` : undefined,
      };
    }
    const e = expById.get(c.id);
    return {
      name: e ? `Expense: ${e.vendorName || e.category || "expense"}` : "Deleted expense",
      href: e ? "/money?tab=out" : undefined,
    };
  };
  const noun = changes.length === 1 ? "document" : "documents";
  return (
    <Alert
      tone="warning"
      icon={<FileWarning />}
      title={`${changes.length} ${noun} changed after you filed${filedOn ? ` on ${formatDate(filedOn)}` : ""}`}
    >
      <p>Report corrections in GSTR-1A or the next return.</p>
      <ul className="mt-2 space-y-1">
        {visible.map((c) => {
          const d = describe(c);
          return (
            <li key={`${c.kind}:${c.id}`} className="flex flex-wrap gap-x-2">
              <span className="font-medium text-foreground">{CHANGE_LABEL[c.change]}:</span>
              {d.href ? (
                <Link href={d.href} className="text-primary hover:underline">
                  {d.name}
                </Link>
              ) : (
                <span>{d.name}</span>
              )}
            </li>
          );
        })}
      </ul>
      {changes.length > 5 && (
        <Button variant="link" size="sm" className="mt-1" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${changes.length}`}
        </Button>
      )}
    </Alert>
  );
}

/* ---------------- Upcoming deadlines ---------------- */

const TRACKED: ReturnType[] = ["GSTR-1", "IFF", "GSTR-3B", "GSTR-9"];

export function DeadlinesCard({
  deadlines,
  filings,
  formatDate,
  className,
}: {
  deadlines: Deadline[];
  filings: Filing[];
  formatDate: (iso: string) => string;
  className?: string;
}) {
  const byId = new Map(filings.map((f) => [f.id, f]));
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader title="Upcoming deadlines" icon={<CalendarDays />} />
      {deadlines.length === 0 ? (
        <p className="px-5 pt-2 pb-5 text-sm text-muted-foreground sm:px-6">No deadlines ahead.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border border-t border-border">
          {deadlines.map((d) => {
            const tracked = (TRACKED as string[]).includes(d.returnType);
            const filing = tracked
              ? byId.get(filingId(d.periodKey, d.returnType as ReturnType))
              : undefined;
            const step = filingStep(filing, false);
            const linkable = d.returnType === "GSTR-1" || d.returnType === "GSTR-3B";
            const label = `${d.returnType} · ${d.periodLabel}`;
            return (
              <li key={`${d.returnType}:${d.periodKey}`} className="px-5 py-3 sm:px-6">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-sm font-medium">
                    {linkable ? (
                      <Link
                        href={`/returns?period=${d.periodKey}`}
                        className="hover:text-primary hover:underline"
                      >
                        {label}
                      </Link>
                    ) : (
                      label
                    )}
                  </div>
                  {tracked && step !== "not_started" && <StepBadge step={step} />}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {formatDate(d.dueDate)} ·{" "}
                  <span
                    className={cn(d.daysLeft <= 3 && step !== "filed" && "text-warning-foreground")}
                  >
                    {dueText(d.daysLeft)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-border px-5 py-2.5 text-[11px] text-muted-foreground sm:px-6">
        Standard due dates — check the portal for extensions.
      </p>
    </Card>
  );
}
