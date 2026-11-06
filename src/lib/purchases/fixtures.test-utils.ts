/** Test fixtures for purchase tests (not part of the public API). */
import { gstinCheckChar } from "@/lib/gst/gstin";
import { purchaseSchema, vendorSchema, type Purchase, type Vendor } from "@/lib/schema";
import { preparePurchase } from "./calc";

/** A syntactically valid GSTIN (correct check character) for a state code. */
export function gstin(state: string, pan = "ABCDE1234F"): string {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinCheckChar(first14);
}

let seq = 0;

export function bill(over: Record<string, unknown> = {}): Purchase {
  seq++;
  return preparePurchase(
    purchaseSchema.parse({
      id: `b${seq}`,
      vendorId: "v1",
      vendorName: "Paper Co",
      vendorGstin: gstin("27"),
      billNo: `PC-${seq}`,
      billDate: "2026-10-10",
      dueDate: "2026-11-09",
      gstMode: "intra",
      itcEligible: true,
      lines: [{ id: "l1", description: "Paper", quantity: "10", unitPrice: "100", gstRate: "18" }],
      ...over,
    }),
  );
}

export function vendor(over: Record<string, unknown> = {}): Vendor {
  seq++;
  return vendorSchema.parse({ id: `v${seq}`, name: "Paper Co", ...over });
}
