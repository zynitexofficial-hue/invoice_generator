import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachmentUsage,
  deleteAttachment,
  deleteAttachmentsFor,
  getAttachmentData,
  listAttachmentsFor,
  saveAttachment,
} from "./attachments";
import { buildBackup } from "./backup";
import { getDb } from "./db";
import { updateSettings } from "./settings";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

beforeEach(async () => {
  await Promise.all(getDb().tables.map((t) => t.clear()));
  memory.clear();
});

const file = (ownerId: string, size = 1024) => ({
  ownerType: "expense" as const,
  ownerId,
  name: "receipt.jpg",
  mime: "image/jpeg",
  size,
  data: "QUJD",
});

describe("attachments", () => {
  it("stores metadata and contents apart; lists never load contents", async () => {
    const a = await saveAttachment(file("e1"));
    const list = await listAttachmentsFor("expense", "e1");
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty("data");
    expect(await getAttachmentData(a.id)).toBe("QUJD");
    expect(await listAttachmentsFor("purchase", "e1")).toHaveLength(0);
  });

  it("totals usage, deletes one or all of a record's files", async () => {
    const a = await saveAttachment(file("e1", 2000));
    await saveAttachment(file("e1", 3000));
    await saveAttachment(file("e2", 500));
    expect(await attachmentUsage()).toEqual({ count: 3, bytes: 5500 });
    await deleteAttachment(a.id);
    expect(await getAttachmentData(a.id)).toBeUndefined();
    expect(await deleteAttachmentsFor("expense", "e1")).toBe(1);
    expect(await attachmentUsage()).toEqual({ count: 1, bytes: 500 });
    expect(await deleteAttachmentsFor("expense", "nobody")).toBe(0);
  });

  it("honours settings.attachments.includeInBackup", async () => {
    await saveAttachment(file("e1"));
    const withFiles = await buildBackup();
    expect(withFiles.data.attachmentBlobs).toHaveLength(1);
    await updateSettings((s) => ({
      ...s,
      attachments: { ...s.attachments, includeInBackup: false },
    }));
    const without = await buildBackup();
    expect(without.data.attachmentBlobs).toHaveLength(0);
    expect(without.data.attachments).toHaveLength(0);
  });
});
