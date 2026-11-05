import type { DesignCustomization } from "@/lib/schema";

export const MM_TO_PX = 96 / 25.4;

export const PAGE_SIZES = {
  A4: { widthMm: 210, heightMm: 297, label: "A4", cssSize: "A4" },
  Letter: { widthMm: 215.9, heightMm: 279.4, label: "US Letter", cssSize: "letter" },
} as const;

export interface PageBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface PageMetrics {
  widthPx: number;
  heightPx: number;
  widthMm: number;
  heightMm: number;
  pad: PageBox;
  /** Usable content height per page (px). */
  capacity: number;
  cssSize: string;
}

const MARGIN_MM = { narrow: 10, normal: 14, wide: 20 } as const;

/** Small safety buffer so sub-pixel differences between screen and print never overflow a page. */
export const PAGE_SAFETY_PX = 6;

export function baseMargins(design: DesignCustomization): PageBox {
  const m = MARGIN_MM[design.margins] * MM_TO_PX;
  // Bottom margin also hosts the footer, so give it a little more room.
  return { top: m, right: m, bottom: Math.max(m, 12 * MM_TO_PX), left: m };
}

export function pageMetrics(design: DesignCustomization, pad: PageBox): PageMetrics {
  const size = PAGE_SIZES[design.pageSize];
  const widthPx = size.widthMm * MM_TO_PX;
  const heightPx = size.heightMm * MM_TO_PX;
  return {
    widthPx,
    heightPx,
    widthMm: size.widthMm,
    heightMm: size.heightMm,
    pad,
    capacity: heightPx - pad.top - pad.bottom - PAGE_SAFETY_PX,
    cssSize: size.cssSize,
  };
}

export const DENSITY = { compact: 0.78, normal: 1, comfortable: 1.25 } as const;

/** Readable text colour (near-black or white) on top of a background colour. */
export function onColor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#ffffff";
  const n = parseInt(m[1], 16);
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L =
    0.2126 * channel((n >> 16) & 255) +
    0.7152 * channel((n >> 8) & 255) +
    0.0722 * channel(n & 255);
  // Contrast against white vs. near-black (#111827, L≈0.012)
  const contrastWhite = 1.05 / (L + 0.05);
  const contrastDark = (L + 0.05) / 0.062;
  return contrastWhite >= contrastDark ? "#ffffff" : "#111827";
}

/** WCAG contrast ratio between two hex colours. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = parseInt(hex.replace("#", ""), 16);
    const ch = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
