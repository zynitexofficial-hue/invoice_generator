"use client";

import { Copy, Mail, MessageCircle, Share2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { useSettings } from "@/db/hooks";
import { buildShareMessage, mailtoHref, whatsappHref } from "@/lib/share";
import type { AppSettings, Invoice } from "@/lib/schema";
import { useRetained } from "@/hooks/use-retained";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";

/*
 * Share a document without a backend (feature C5). Opens the user's own
 * WhatsApp / mail app / share sheet with a prefilled message — this app sends
 * nothing. The PDF can't be attached for them (it comes from the print
 * dialog), so the dialog says so.
 */

const useShare = create<{ invoice: Invoice | null; set: (invoice: Invoice | null) => void }>(
  (set) => ({ invoice: null, set: (invoice) => set({ invoice }) }),
);

/** Open the share dialog for a saved document. Callable from anywhere in the app. */
export function openShare(invoice: Invoice) {
  useShare.getState().set(invoice);
}

export function ShareHost() {
  const invoice = useShare((s) => s.invoice);
  const close = () => useShare.getState().set(null);
  const shown = useRetained(invoice);
  // Settings load asynchronously; the form seeds its text once, so wait for them.
  const settings = useSettings();
  return (
    <Dialog open={Boolean(invoice)} onOpenChange={(o) => !o && close()}>
      <DialogContent size="md">
        {shown && settings && (
          <ShareForm
            key={shown.id + shown.updatedAt}
            invoice={shown}
            settings={settings}
            onClose={close}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

const canNativeShare = () =>
  typeof navigator !== "undefined" && typeof navigator.share === "function";

function ShareForm({
  invoice,
  settings,
  onClose,
}: {
  invoice: Invoice;
  settings: AppSettings;
  onClose: () => void;
}) {
  const initial = buildShareMessage(invoice, settings, window.location.origin);
  const [text, setText] = useState(initial.text);
  const phone = invoice.customer.phone;
  const email = invoice.customer.email;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Message copied");
    } catch {
      toast.error("Couldn't copy — select the text and copy it manually");
    }
  };

  const nativeShare = async () => {
    try {
      await navigator.share({ title: initial.subject, text });
    } catch (error) {
      // Dismissing the share sheet is not an error.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error("Couldn't open the share sheet");
    }
  };

  return (
    <>
      <DialogHeader
        icon={<Share2 />}
        title={`Share ${invoice.number || "document"}`}
        description={
          invoice.customer.name || invoice.customer.company
            ? `Message for ${invoice.customer.name || invoice.customer.company}`
            : "Message for your customer"
        }
      />
      <DialogBody className="grid gap-3">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={8}
          aria-label="Message"
        />
        <p className="text-[13px] leading-5 text-muted-foreground">
          This opens your own app with the message filled in; nothing is sent from here. The PDF
          can&apos;t be attached automatically — use <strong>Download PDF</strong> first, then
          attach the file there.
          {!phone.trim() &&
            " Add a phone number to the customer to pre-select their WhatsApp chat."}
        </p>
      </DialogBody>
      <DialogFooter className="flex-wrap">
        <Button variant="secondary" onClick={() => void copy()}>
          <Copy />
          Copy
        </Button>
        <Button asChild variant="secondary">
          <a href={mailtoHref(email, initial.subject, text)} onClick={onClose}>
            <Mail />
            Email
          </a>
        </Button>
        {canNativeShare() && (
          <Button variant="secondary" onClick={() => void nativeShare()}>
            <Share2 />
            Share…
          </Button>
        )}
        <Button asChild variant="primary">
          <a
            href={whatsappHref(phone, text)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onClose}
          >
            <MessageCircle />
            WhatsApp
          </a>
        </Button>
      </DialogFooter>
    </>
  );
}
