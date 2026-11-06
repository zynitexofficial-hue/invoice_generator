"use client";

import { useLiveQuery } from "dexie-react-hooks";
import type { AttachmentOwnerType } from "@/lib/schema";
import { getDb } from "./db";

/**
 * [D] Live change marker for attachments: count plus summed size. Used to
 * refresh storage figures; metadata only, never file contents.
 */
export function useAttachmentCount(): string | undefined {
  return useLiveQuery(async () => {
    let bytes = 0;
    let count = 0;
    await getDb().attachments.each((a) => {
      count++;
      bytes += typeof a.size === "number" ? a.size : 0;
    });
    return `${count}:${bytes}`;
  }, []);
}

/** [D] Ids of records of one type that have at least one attachment (metadata only). */
export function useAttachmentOwners(ownerType: AttachmentOwnerType): Set<string> | undefined {
  const ids = useLiveQuery(async () => {
    const out: string[] = [];
    await getDb().attachments.each((a) => {
      if (a.ownerType === ownerType && a.ownerId) out.push(a.ownerId);
    });
    return out;
  }, [ownerType]);
  return ids ? new Set(ids) : undefined;
}
