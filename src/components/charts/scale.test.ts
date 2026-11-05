import { describe, expect, it } from "vitest";
import {
  arcPath,
  bandScale,
  barPath,
  compactInr,
  cumulative,
  describeExtremes,
  fullInr,
  labelEvery,
  linearScale,
  niceTicks,
  percentLabel,
  toNumber,
} from "./scale";

describe("niceTicks", () => {
  it("covers the range with round steps and includes zero", () => {
    expect(niceTicks(0, 95)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(0, 1_23_456)).toEqual([0, 50000, 100000, 150000]);
    expect(niceTicks(-40, 90)).toEqual([-50, 0, 50, 100]);
    expect(niceTicks(10, 20)).toContain(0);
  });

  it("handles empty / degenerate ranges", () => {
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    expect(niceTicks(NaN, 5)).toEqual([0, 1]);
    expect(niceTicks(-5, -5)[0]).toBeLessThanOrEqual(-5);
  });

  it("avoids float noise", () => {
    expect(niceTicks(0, 0.3)).toEqual([0, 0.1, 0.2, 0.3]);
  });
});

describe("compactInr", () => {
  it("uses Indian units", () => {
    expect(compactInr(0)).toBe("₹0");
    expect(compactInr(950)).toBe("₹950");
    expect(compactInr(12_000)).toBe("₹12K");
    expect(compactInr(1_20_000)).toBe("₹1.2L");
    expect(compactInr(3_40_00_000)).toBe("₹3.4Cr");
    expect(compactInr(12_50_00_00_000)).toBe("₹1,250Cr");
    expect(compactInr(-2_50_000)).toBe("−₹2.5L");
    expect(compactInr(99_999)).toBe("₹1L");
    expect(compactInr(999.7)).toBe("₹1K");
    expect(compactInr(99_99_999)).toBe("₹1Cr");
    expect(compactInr(2.5)).toBe("₹2.5");
    expect(compactInr(Infinity)).toBe("₹0");
  });

  it("formats full rupees and percentages", () => {
    expect(fullInr(1234567)).toBe("₹12,34,567.00");
    expect(percentLabel(12.345)).toBe("12.3%");
    expect(percentLabel(NaN)).toBe("—");
    expect(toNumber("1,234.50")).toBe(1234.5);
    expect(toNumber("x")).toBe(0);
  });
});

describe("geometry", () => {
  it("maps linear and band scales", () => {
    const y = linearScale([0, 100], [200, 0]);
    expect(y(0)).toBe(200);
    expect(y(50)).toBe(100);
    const b = bandScale(4, 400, 0.5);
    expect(b.step).toBe(100);
    expect(b.bandwidth).toBe(50);
    expect(b.x(1)).toBe(125);
    expect(labelEvery(24, 300)).toBe(4);
    expect(labelEvery(6, 600)).toBe(1);
  });

  it("draws bar and arc paths", () => {
    expect(barPath(0, 100, 50, 10)).toMatch(/^M0,100V53Q/);
    expect(barPath(0, 100, 150, 10)).toMatch(/^M0,100V147Q/);
    expect(barPath(0, 100, 100, 10)).toBe("");
    expect(arcPath(50, 50, 40, 20, 0, Math.PI / 2)).toMatch(
      /^M50,10A40,40 0 0 1 90,50L70,50A20,20 0 0 0 50,30Z$/,
    );
    expect(arcPath(50, 50, 40, 20, 0, Math.PI * 2).match(/M/g)).toHaveLength(2);
  });

  it("accumulates", () => {
    expect(cumulative([1, 2, 3])).toEqual([1, 3, 6]);
    expect(cumulative([])).toEqual([]);
  });

  it("describes extremes", () => {
    expect(describeExtremes([])).toBe("no data");
    expect(
      describeExtremes([
        { label: "Apr", value: 1_20_000 },
        { label: "May", value: 3_40_000 },
      ]),
    ).toBe("highest ₹3.4L (May), lowest ₹1.2L (Apr)");
  });
});
