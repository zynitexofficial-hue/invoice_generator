"use client";

import { Copy, FileText } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { updateSettings } from "@/db/settings";
import type { AppSettings } from "@/lib/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

/** Short DPDP-style notice a business can give its customers (spec H6). */
export function privacyNoticeText(input: {
  businessName: string;
  contact: string;
  retentionYears: number;
}): string {
  const name = input.businessName.trim() || "[Your business name]";
  const contact = input.contact.trim() || "[your email or phone]";
  return [
    `Privacy notice — ${name}`,
    "",
    `What we collect: your name, billing/shipping address, state, GSTIN (if any), and — only if you give them — your email and phone number.`,
    `Why: to prepare and send invoices and quotations, receive payments, and meet our GST and tax record-keeping duties.`,
    `Where it's kept: on our own device and in our backups. We don't sell or share it, except where the law requires (for example, GST returns).`,
    `How long: invoices are kept for the period GST law requires (about 6 years from the annual return due date); we keep records for up to ${input.retentionYears} financial years and then erase personal details we no longer need.`,
    `Your rights: you can ask for a copy of your data, ask us to correct it, or ask us to erase details we're not required by law to keep. You can also raise a complaint with us.`,
    `Contact: ${contact}`,
  ].join("\n");
}

export function PrivacyNoticeCard({ settings }: { settings: AppSettings }) {
  const [email, setEmail] = useState(settings.privacy.contactEmail);
  const contact = email.trim() || settings.profile.email || settings.profile.phone;
  const text = privacyNoticeText({
    businessName: settings.profile.name,
    contact,
    retentionYears: settings.privacy.retentionYears,
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Notice copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually.");
    }
  };

  return (
    <Card>
      <CardHeader
        title="Privacy notice for your customers"
        description="Under India's DPDP Act you should tell customers what you collect and why. Copy this short notice into an email, your website or a printed sign."
        icon={<FileText />}
      />
      <CardContent className="grid gap-4">
        <Field
          label="Contact for privacy questions"
          optional
          hint="Shown in the notice. Leave empty to use your business email or phone."
          className="sm:max-w-sm"
        >
          <Input
            type="email"
            value={email}
            maxLength={160}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => {
              if (email.trim() === settings.privacy.contactEmail) return;
              void updateSettings((s) => ({
                ...s,
                privacy: { ...s.privacy, contactEmail: email.trim() },
              }));
            }}
          />
        </Field>
        <pre
          className="max-h-72 overflow-auto rounded-xl border border-border bg-surface-2/50 p-4 font-sans text-[13px] leading-5 whitespace-pre-wrap text-foreground"
          aria-label="Privacy notice text"
          tabIndex={0}
        >
          {text}
        </pre>
        <Button variant="secondary" className="w-fit" onClick={() => void copy()}>
          <Copy />
          Copy notice
        </Button>
      </CardContent>
    </Card>
  );
}
