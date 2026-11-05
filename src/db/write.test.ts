import { describe, expect, it, vi } from "vitest";
import { markBackedUp } from "./backup";
import { getDb } from "./db";
import { saveCustomer } from "./records";
import { getLastChangeAt } from "./write";

const memory = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

describe("change tracking", () => {
  it("does not treat recording a backup as a data change", async () => {
    await getDb().meta.clear();
    await saveCustomer({ name: "Asha Traders" });
    const changedAt = await getLastChangeAt();
    expect(changedAt).not.toBe("");
    await new Promise((r) => setTimeout(r, 5));
    await markBackedUp(new Date().toISOString());
    expect(await getLastChangeAt()).toBe(changedAt);
  });
});
