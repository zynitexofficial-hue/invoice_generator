"use client";

import { Download, Eye, FileText, Image as ImageIcon, Paperclip, Trash } from "lucide-react";
import { useEffect, useId, useRef, useState, type MutableRefObject } from "react";
import { toast } from "sonner";
import {
  deleteAttachment,
  deleteAttachmentsFor,
  getAttachmentData,
  saveAttachment,
} from "@/db/attachments";
import { useAttachments, useSettings } from "@/db/hooks";
import { ATTACHMENT_ACCEPT, formatBytes, isImageType } from "@/lib/purchases/attachment-utils";
import type { Attachment, AttachmentOwnerType } from "@/lib/schema";
import { downloadBlob } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { confirm } from "@/components/ui/confirm";
import { prepareAttachmentFile } from "./prepare-file";
import { StorageNotice } from "./storage-notice";

function base64ToBlob(data: string, mime: string): Blob {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function load(a: Attachment): Promise<Blob | null> {
  const data = await getAttachmentData(a.id);
  if (!data) {
    toast.error("This file's contents are missing (it may have been left out of a backup).");
    return null;
  }
  return base64ToBlob(data, a.mime);
}

/**
 * For a record that does not exist yet: when the form closes without saving,
 * remove the files that were attached while it was open.
 */
export function useDiscardUnsavedAttachments(
  ownerType: AttachmentOwnerType,
  ownerId: string,
  isNew: boolean,
  savedRef: MutableRefObject<boolean>,
) {
  useEffect(
    () => () => {
      if (isNew && !savedRef.current) void deleteAttachmentsFor(ownerType, ownerId).catch(() => {});
    },
    [ownerType, ownerId, isNew, savedRef],
  );
}

/**
 * Receipts and bill copies for one record. Lists show names and sizes only;
 * file contents are read from the database when you view or download one.
 */
export function AttachmentPanel({
  ownerType,
  ownerId,
  onChange,
}: {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** Called with the ids of the record's attachments whenever they change. */
  onChange?: (ids: string[]) => void;
}) {
  const settings = useSettings();
  const files = useAttachments(ownerType, ownerId);
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const idsKey = (files ?? []).map((f) => f.id).join(",");

  useEffect(() => {
    if (files) onChange?.(files.map((f) => f.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- report when the id list changes
  }, [idsKey]);

  const maxKb = settings?.attachments.maxFileKb ?? 2048;

  const add = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        try {
          const prepared = await prepareAttachmentFile(file, maxKb);
          await saveAttachment({ ownerType, ownerId, ...prepared });
          toast.success(`Attached ${prepared.name}`);
        } catch (e) {
          if (e instanceof Error) toast.error(`${file.name}: ${e.message}`);
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const view = async (a: Attachment) => {
    const blob = await load(a);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };
  const download = async (a: Attachment) => {
    const blob = await load(a);
    if (blob) downloadBlob(blob, a.name);
  };
  const remove = async (a: Attachment) => {
    const ok = await confirm({
      title: "Remove this file?",
      description: `${a.name} will be deleted from this browser.`,
      confirmLabel: "Remove",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deleteAttachment(a.id);
    } catch {
      /* storage error dialog already shown */
    }
  };

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Receipts &amp; files</span>
        <Button
          size="sm"
          variant="secondary"
          type="button"
          loading={busy}
          onClick={() => inputRef.current?.click()}
        >
          <Paperclip />
          Attach
        </Button>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="sr-only"
          aria-label="Attach receipt photos or PDFs"
          onChange={(e) => void add(e.target.files)}
        />
      </div>
      {files && files.length > 0 ? (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {files.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2">
              {isImageType(a.mime) ? (
                <ImageIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              ) : (
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{a.name}</span>
                <span className="block text-xs text-muted-foreground">{formatBytes(a.size)}</span>
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`View ${a.name}`}
                onClick={() => void view(a)}
              >
                <Eye />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`Download ${a.name}`}
                onClick={() => void download(a)}
              >
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                type="button"
                aria-label={`Remove ${a.name}`}
                onClick={() => void remove(a)}
              >
                <Trash />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          Photos are shrunk to save space. Up to {formatBytes(maxKb * 1024)} per file; JPG, PNG,
          WebP or PDF.
        </p>
      )}
      <StorageNotice compact />
    </div>
  );
}
