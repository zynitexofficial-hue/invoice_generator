"use client";

import { useEffect, useState } from "react";
import { attachmentUsage } from "@/db/attachments";
import { useSettings } from "@/db/hooks";
import { useAttachmentCount } from "@/db/hooks-purchases";
import { formatBytes, storageWarning, type StorageWarning } from "@/lib/purchases/attachment-utils";
import { Alert } from "@/components/ui/alert";

interface Usage {
  count: number;
  bytes: number;
  quota: number;
  browserUsage: number;
}

/** Attachment totals plus the browser's own estimate (when it offers one). */
export function useStorageUsage(): (Usage & { warning: StorageWarning }) | undefined {
  const settings = useSettings();
  const stamp = useAttachmentCount();
  const [usage, setUsage] = useState<Usage>();

  useEffect(() => {
    let live = true;
    void (async () => {
      const u = await attachmentUsage();
      let quota = 0;
      let browserUsage = 0;
      try {
        const est = await navigator.storage?.estimate?.();
        quota = est?.quota ?? 0;
        browserUsage = est?.usage ?? 0;
      } catch {
        /* not available */
      }
      if (live) setUsage({ ...u, quota, browserUsage });
    })();
    return () => {
      live = false;
    };
  }, [stamp]);

  if (!usage || !settings) return undefined;
  return {
    ...usage,
    warning: storageWarning({
      attachmentBytes: usage.bytes,
      warnTotalMb: settings.attachments.warnTotalMb,
      quota: usage.quota,
      usage: usage.browserUsage,
    }),
  };
}

/** Shows a warning when files or browser storage are nearly full; nothing otherwise. */
export function StorageNotice({ compact }: { compact?: boolean }) {
  const u = useStorageUsage();
  if (!u || u.warning.level === "ok") return null;
  return (
    <Alert
      tone={u.warning.level === "full" ? "danger" : "warning"}
      title={compact ? undefined : "Storage is getting full"}
    >
      {u.warning.messages.join(" ")} {u.count} file{u.count === 1 ? "" : "s"} (
      {formatBytes(u.bytes)}) attached in total.
    </Alert>
  );
}
