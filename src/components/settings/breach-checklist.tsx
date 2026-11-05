"use client";

import { ChevronDown, LifeBuoy } from "lucide-react";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Collapse } from "@/components/ui/collapse";

/** Settings → Security: what to do if a device is lost or data leaks (spec H7). */
export function BreachChecklist() {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 rounded-2xl p-5 text-left focus-visible:focus-ring"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground">
          <LifeBuoy className="size-[18px]" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Lost a device or leaked a backup?</span>
          <span className="block text-[13px] text-muted-foreground">
            A short checklist of what to do next.
          </span>
        </span>
        <ChevronDown
          className={cn("size-4 shrink-0 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      <Collapse open={open} id={id}>
        <ol className="grid list-decimal gap-2 px-5 pb-5 pl-10 text-[13px] leading-5 text-muted-foreground marker:text-primary">
          <li>
            <b className="font-medium text-foreground">Secure your accounts and devices.</b> Lock or
            wipe the lost device remotely (Find My Device / Find My), and change your computer and
            email passwords.
          </li>
          <li>
            <b className="font-medium text-foreground">Restore your records</b> on another device
            from your latest backup (Settings → Data &amp; backup → Restore).
          </li>
          <li>
            <b className="font-medium text-foreground">Change your backup passphrase.</b> Make new
            encrypted backups with a new passphrase and delete old copies you no longer control.
            Plain (unencrypted) backups on the lost device or in a leaked folder should be treated
            as exposed.
          </li>
          <li>
            <b className="font-medium text-foreground">Work out what was exposed:</b> which
            customers&apos; or vendors&apos; names, phone numbers, emails, addresses or GSTINs, and
            when it happened. Write it down.
          </li>
          <li>
            <b className="font-medium text-foreground">Inform the people affected</b> without delay
            — what happened, what data, what you&apos;re doing, and what they can do (for example,
            watch for suspicious calls).
          </li>
          <li>
            <b className="font-medium text-foreground">Inform the Data Protection Board of India</b>{" "}
            where the DPDP Rules apply to you — promptly, with a detailed report within 72 hours.
          </li>
          <li>
            <b className="font-medium text-foreground">Keep a record</b> of the incident and the
            steps you took.
          </li>
        </ol>
        <p className="px-5 pb-5 text-xs text-muted-foreground">
          General guidance, not legal advice. The DPDP Rules are being phased in through 13 May
          2027.
        </p>
      </Collapse>
    </Card>
  );
}
