import { nowISO } from "@/lib/dates";
import { newId } from "@/lib/invoice-factory";
import {
  attachmentBlobSchema,
  attachmentSchema,
  type Attachment,
  type AttachmentOwnerType,
} from "@/lib/schema";
import { defineCrud } from "./crud";
import { logAudit } from "./audit";
import { getDb } from "./db";
import { parseRows, TABLE_SCHEMAS } from "./read";
import { guardedWrite } from "./write";

/**
 * [D] Attachments — owner: feature D.
 * Metadata rows live in `attachments`; file contents (base64) in
 * `attachmentBlobs` under the same id. Size limits come from
 * settings.attachments (enforce them in the UI before calling saveAttachment).
 */

export const attachmentsCrud = defineCrud({
  table: "attachments",
  entity: "attachment",
  what: "the attachment",
  describe: (a) => `attachment ${a.name}`.trim(),
  auditFields: {
    name: (a) => a.name,
    ownerType: (a) => a.ownerType,
    ownerId: (a) => a.ownerId,
    size: (a) => String(a.size),
  },
});

export interface NewAttachment {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  name: string;
  mime: string;
  size: number;
  /** Base64 file contents (no data: prefix). */
  data: string;
}

/** Store the metadata row and the file contents together. */
export async function saveAttachment(input: NewAttachment): Promise<Attachment> {
  const now = nowISO();
  const id = newId();
  const meta = attachmentSchema.parse({
    id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    name: input.name,
    mime: input.mime,
    size: input.size,
    createdAt: now,
    updatedAt: now,
  });
  const blob = attachmentBlobSchema.parse({ id, data: input.data });
  const db = getDb();
  await guardedWrite("the attachment", () =>
    db.transaction("rw", [db.attachments, db.attachmentBlobs, db.auditLog], async () => {
      await db.attachments.put(meta);
      await db.attachmentBlobs.put(blob);
      await logAudit({
        entity: "attachment",
        entityId: id,
        action: "create",
        summary: `Attached ${meta.name}`,
      });
    }),
  );
  return meta;
}

export const getAttachment = attachmentsCrud.get;
export const listAttachments = attachmentsCrud.list;

/** File contents (base64) of an attachment, or undefined when missing. */
export async function getAttachmentData(id: string): Promise<string | undefined> {
  const raw = await getDb().attachmentBlobs.get(id);
  const parsed = raw ? attachmentBlobSchema.safeParse(raw) : undefined;
  return parsed?.success ? parsed.data.data : undefined;
}

/** Remove an attachment's metadata and its file contents. */
export async function deleteAttachment(id: string): Promise<void> {
  const db = getDb();
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.attachments, db.attachmentBlobs, db.auditLog], async () => {
        const existing = await db.attachments.get(id);
        await db.attachments.delete(id);
        await db.attachmentBlobs.delete(id);
        await logAudit({
          entity: "attachment",
          entityId: id,
          action: "delete",
          summary: `Removed attachment ${existing?.name ?? ""}`.trim(),
        });
      }),
    { deletion: true },
  );
}

/** Remove every attachment of one record (when the record itself is deleted). */
export async function deleteAttachmentsFor(
  ownerType: AttachmentOwnerType,
  ownerId: string,
): Promise<number> {
  const db = getDb();
  const rows = await db.attachments.where("ownerId").equals(ownerId).toArray();
  const ids = rows.filter((a) => a.ownerType === ownerType).map((a) => a.id);
  if (!ids.length) return 0;
  await guardedWrite(
    "the change",
    () =>
      db.transaction("rw", [db.attachments, db.attachmentBlobs, db.auditLog], async () => {
        await db.attachments.bulkDelete(ids);
        await db.attachmentBlobs.bulkDelete(ids);
        await logAudit({
          entity: "attachment",
          entityId: ownerId,
          action: "delete",
          summary: `Removed ${ids.length} attached file${ids.length === 1 ? "" : "s"}`,
        });
      }),
    { deletion: true },
  );
  return ids.length;
}

/** Valid attachments of one record, oldest first. */
export async function listAttachmentsFor(
  ownerType: AttachmentOwnerType,
  ownerId: string,
): Promise<Attachment[]> {
  const rows = await getDb().attachments.where("ownerId").equals(ownerId).sortBy("createdAt");
  return parseRows(rows, TABLE_SCHEMAS.attachments).rows.filter((a) => a.ownerType === ownerType);
}

/** Total stored size in bytes and file count (for storage warnings). */
export async function attachmentUsage(): Promise<{ count: number; bytes: number }> {
  let count = 0;
  let bytes = 0;
  await getDb().attachments.each((a) => {
    count++;
    bytes += typeof a.size === "number" ? a.size : 0;
  });
  return { count, bytes };
}
