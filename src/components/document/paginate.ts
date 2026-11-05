import type { SectionId } from "@/lib/schema";

export type PageItem =
  | { type: "header" }
  | { type: "cont" }
  | { type: "thead" }
  | { type: "row"; index: number }
  | { type: "empty" }
  | { type: "section"; id: SectionId };

export interface Measurements {
  header: number;
  cont: number;
  thead: number;
  empty: number;
  rows: number[];
  sections: { id: SectionId; height: number }[];
}

export const itemKey = (item: PageItem) =>
  item.type === "row"
    ? `row-${item.index}`
    : item.type === "section"
      ? `section-${item.id}`
      : item.type;

/**
 * Pack measured blocks into fixed-height pages.
 *
 * - The first page starts with the full header; later pages start with a
 *   compact continuation header.
 * - The table header repeats on every page that has rows, and is never left
 *   alone at the bottom of a page (it always moves with the next row).
 * - Rows and sections are never split; a block that doesn't fit moves to the
 *   next page. A block taller than a whole page is placed on its own page.
 */
export function paginate(m: Measurements, capacity: number): PageItem[][] {
  const pages: PageItem[][] = [];
  let page: PageItem[] = [];
  let used = 0;

  const push = (item: PageItem, height: number) => {
    page.push(item);
    used += height;
  };
  /** A page "has content" once it holds anything besides the continuation header. */
  const hasContent = () => page.some((i) => i.type !== "cont");
  const newPage = () => {
    pages.push(page);
    page = [];
    used = 0;
    push({ type: "cont" }, m.cont);
  };
  /** Start a new page if `height` doesn't fit — unless the page is still empty. */
  const ensureRoom = (height: number) => {
    if (used + height > capacity && hasContent()) {
      newPage();
      return true;
    }
    return false;
  };

  push({ type: "header" }, m.header);

  if (m.rows.length === 0) {
    ensureRoom(m.thead + m.empty);
    push({ type: "thead" }, m.thead);
    push({ type: "empty" }, m.empty);
  } else {
    let theadOnPage = false;
    m.rows.forEach((height, index) => {
      if (ensureRoom(height + (theadOnPage ? 0 : m.thead))) theadOnPage = false;
      if (!theadOnPage) {
        push({ type: "thead" }, m.thead);
        theadOnPage = true;
      }
      push({ type: "row", index }, height);
    });
  }

  for (const section of m.sections) {
    if (section.height <= 0) continue;
    ensureRoom(section.height);
    push({ type: "section", id: section.id }, section.height);
  }

  pages.push(page);
  return pages;
}
