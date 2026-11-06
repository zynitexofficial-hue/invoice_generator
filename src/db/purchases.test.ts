import { beforeEach, describe, expect, it, vi } from "vitest";
import { gstin } from "@/lib/purchases/fixtures.test-utils";
import { auditFor } from "./audit";
import { getDb } from "./db";
import { saveAttachment } from "./attachments";
import {
  addPurchasePayment,
  deletePurchase,
  getPurchase,
  listPurchasesForVendor,
  removePurchasePayment,
  savePurchase,
} from "./purchases";
import { saveVendor, getVendor } from "./vendors";

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

const line = { id: "l1", description: "Paper", quantity: "10", unitPrice: "100", gstRate: "18" };

describe("purchase bills", () => {
  it("computes summary, status and ITC on save, ignoring input values", async () => {
    const saved = await savePurchase({
      vendorName: "Paper Co",
      vendorGstin: gstin("27"),
      billNo: "P-1",
      billDate: "2026-10-01",
      gstMode: "intra",
      itcEligible: true,
      lines: [line],
      paymentStatus: "paid",
      summary: { total: "1.00" },
    });
    expect(saved.summary.total).toBe("1180.00");
    expect(saved.paymentStatus).toBe("unpaid");
    expect(saved.itcEligible).toBe(true);
    const again = await getPurchase(saved.id);
    expect(again?.summary.cgst).toBe("90.00");
  });

  it("clears the ITC claim without a valid GSTIN or bill number", async () => {
    const noGstin = await savePurchase({
      billNo: "1",
      gstMode: "intra",
      itcEligible: true,
      lines: [line],
    });
    expect(noGstin.itcEligible).toBe(false);
    const noNo = await savePurchase({
      vendorGstin: gstin("27"),
      gstMode: "intra",
      itcEligible: true,
      lines: [line],
    });
    expect(noNo.itcEligible).toBe(false);
  });

  it("records and removes payments, updating balance and status", async () => {
    const b = await savePurchase({
      billNo: "1",
      billDate: "2026-10-01",
      lines: [line],
      gstMode: "intra",
    });
    const part = await addPurchasePayment(b.id, { date: "2026-10-05", amount: "500", mode: "upi" });
    expect(part.paymentStatus).toBe("partial");
    expect(part.summary.balance).toBe("680.00");
    const full = await addPurchasePayment(b.id, { date: "2026-10-09", amount: "680" });
    expect(full.paymentStatus).toBe("paid");
    const undone = await removePurchasePayment(b.id, full.payments[1].id);
    expect(undone.paymentStatus).toBe("partial");
    const entries = await auditFor("purchase", b.id);
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  it("lists a vendor's bills and deletes a bill with its attachments", async () => {
    const v = await saveVendor({ name: "Paper Co", msme: true });
    expect((await getVendor(v.id))?.msme).toBe(true);
    const b = await savePurchase({
      vendorId: v.id,
      billNo: "1",
      billDate: "2026-10-01",
      lines: [line],
    });
    await savePurchase({ vendorId: "other", billNo: "2", billDate: "2026-10-02", lines: [line] });
    expect(await listPurchasesForVendor(v.id)).toHaveLength(1);
    await saveAttachment({
      ownerType: "purchase",
      ownerId: b.id,
      name: "r.pdf",
      mime: "application/pdf",
      size: 3,
      data: "QUJD",
    });
    await deletePurchase(b.id);
    expect(await getPurchase(b.id)).toBeUndefined();
    expect(await getDb().attachments.count()).toBe(0);
    expect(await getDb().attachmentBlobs.count()).toBe(0);
  });
});
