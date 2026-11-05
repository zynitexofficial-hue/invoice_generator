import { describe, expect, it } from "vitest";
import { itemKey, paginate, type Measurements } from "./paginate";

const base: Measurements = {
  header: 200,
  cont: 40,
  thead: 30,
  empty: 50,
  rows: [],
  sections: [],
};

const keys = (pages: ReturnType<typeof paginate>) => pages.map((p) => p.map(itemKey));

describe("paginate", () => {
  it("fits a small invoice on one page", () => {
    const pages = paginate(
      { ...base, rows: [40, 40], sections: [{ id: "totals", height: 120 }] },
      1000,
    );
    expect(keys(pages)).toEqual([["header", "thead", "row-0", "row-1", "section-totals"]]);
  });

  it("shows an empty-state row when there are no items", () => {
    expect(keys(paginate(base, 1000))).toEqual([["header", "thead", "empty"]]);
  });

  it("repeats the table header and continuation header on later pages", () => {
    const rows = Array.from({ length: 10 }, () => 100);
    const pages = paginate({ ...base, rows }, 600);
    // page 1: header 200 + thead 30 + 3 rows (300) = 530; 4th row would exceed 600
    expect(keys(pages)[0]).toEqual(["header", "thead", "row-0", "row-1", "row-2"]);
    expect(keys(pages)[1].slice(0, 3)).toEqual(["cont", "thead", "row-3"]);
    // every row is placed exactly once
    const placed = pages.flat().filter((i) => i.type === "row");
    expect(placed).toHaveLength(10);
  });

  it("never leaves a table header alone at the bottom of a page", () => {
    // header 200 + thead 30 + row 380 = 610 > 600, so the row (with its header) moves
    const pages = paginate({ ...base, rows: [380] }, 600);
    expect(keys(pages)).toEqual([["header"], ["cont", "thead", "row-0"]]);
  });

  it("moves a section that doesn't fit to the next page", () => {
    const pages = paginate(
      { ...base, rows: [100, 100], sections: [{ id: "totals", height: 300 }] },
      600,
    );
    expect(keys(pages)).toEqual([
      ["header", "thead", "row-0", "row-1"],
      ["cont", "section-totals"],
    ]);
  });

  it("skips empty sections", () => {
    const pages = paginate({ ...base, rows: [10], sections: [{ id: "notes", height: 0 }] }, 600);
    expect(keys(pages)[0]).not.toContain("section-notes");
  });

  it("places an oversized block on its own page instead of looping", () => {
    const pages = paginate({ ...base, rows: [50, 2000, 50] }, 600);
    expect(pages.flat().filter((i) => i.type === "row")).toHaveLength(3);
    expect(pages.length).toBe(3);
  });
});
