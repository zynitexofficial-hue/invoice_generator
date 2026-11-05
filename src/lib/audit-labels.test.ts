import { describe, expect, it } from "vitest";
import { auditActionLabel, auditFieldLabel, describeChange } from "./audit-labels";

describe("audit labels", () => {
  it("names known fields and passes unknown ones through", () => {
    expect(auditFieldLabel("summary.grandTotal")).toBe("Total");
    expect(auditFieldLabel("mystery")).toBe("mystery");
  });
  it("names every action", () => {
    expect(auditActionLabel("issue")).toBe("Issued");
    expect(auditActionLabel("update")).toBe("Edited");
  });
  it("describes a change and shows empty sides", () => {
    expect(describeChange({ field: "lines", from: "1", to: "2" })).toBe("Line items: 1 → 2");
    expect(describeChange({ field: "customer.name", from: "", to: "Priya" })).toBe(
      "Customer: empty → Priya",
    );
  });
});
