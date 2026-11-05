import type { DesignCustomization, FontId, TemplateId } from "@/lib/schema";

export interface TemplateMeta {
  id: TemplateId;
  name: string;
  description: string;
  version: number;
  tags: string[];
  /** Customization applied by "Reset to template defaults". */
  defaults: Partial<DesignCustomization>;
}

export const TEMPLATES: TemplateMeta[] = [
  {
    id: "minimal",
    name: "Minimal",
    description: "Quiet monochrome layout with generous whitespace and hairline rules.",
    version: 1,
    tags: ["Clean", "Monochrome"],
    defaults: {
      primaryColor: "#18181b",
      accentColor: "#71717a",
      fontFamily: "inter",
      tableStyle: "minimal",
    },
  },
  {
    id: "professional",
    name: "Professional",
    description: "Classic business layout with a confident title and a structured items table.",
    version: 1,
    tags: ["Classic", "Business"],
    defaults: {
      primaryColor: "#4f46e5",
      accentColor: "#0ea5e9",
      fontFamily: "inter",
      tableStyle: "striped",
    },
  },
  {
    id: "modern",
    name: "Modern",
    description: "Bold colour header band, soft cards and a highlighted amount due.",
    version: 1,
    tags: ["Bold", "Colourful"],
    defaults: {
      primaryColor: "#0f766e",
      accentColor: "#f59e0b",
      fontFamily: "manrope",
      tableStyle: "striped",
    },
  },
  {
    id: "corporate",
    name: "Corporate",
    description: "Formal, grid-aligned blocks with prominent tax details and signatory box.",
    version: 1,
    tags: ["Formal", "GST-focused"],
    defaults: {
      primaryColor: "#1e3a8a",
      accentColor: "#64748b",
      fontFamily: "ibm-plex-sans",
      tableStyle: "bordered",
    },
  },
  {
    id: "creative",
    name: "Creative",
    description: "Gradient highlight card, accent side strip and bold, expressive type.",
    version: 1,
    tags: ["Expressive", "Studio"],
    defaults: {
      primaryColor: "#7c3aed",
      accentColor: "#ec4899",
      fontFamily: "poppins",
      tableStyle: "minimal",
    },
  },
  {
    id: "service",
    name: "Service Invoice",
    description: "Built for hours × rate billing with project details up front.",
    version: 1,
    tags: ["Hourly", "Projects"],
    defaults: {
      primaryColor: "#0369a1",
      accentColor: "#22c55e",
      fontFamily: "dm-sans",
      tableStyle: "ruled",
    },
  },
];

const BY_ID = new Map(TEMPLATES.map((t) => [t.id, t]));

export function getTemplateMeta(id: TemplateId): TemplateMeta {
  return BY_ID.get(id) ?? TEMPLATES[1];
}

export interface FontMeta {
  id: FontId;
  name: string;
  category: "sans" | "serif";
  /** CSS variable set by next/font in the root layout. */
  cssVar: string;
}

export const FONTS: FontMeta[] = [
  { id: "inter", name: "Inter", category: "sans", cssVar: "--font-inter" },
  { id: "roboto", name: "Roboto", category: "sans", cssVar: "--font-roboto" },
  { id: "noto-sans", name: "Noto Sans", category: "sans", cssVar: "--font-noto-sans" },
  { id: "poppins", name: "Poppins", category: "sans", cssVar: "--font-poppins" },
  { id: "lato", name: "Lato", category: "sans", cssVar: "--font-lato" },
  { id: "ibm-plex-sans", name: "IBM Plex Sans", category: "sans", cssVar: "--font-ibm-plex-sans" },
  { id: "dm-sans", name: "DM Sans", category: "sans", cssVar: "--font-dm-sans" },
  { id: "manrope", name: "Manrope", category: "sans", cssVar: "--font-manrope" },
  { id: "merriweather", name: "Merriweather", category: "serif", cssVar: "--font-merriweather" },
  { id: "source-serif", name: "Source Serif", category: "serif", cssVar: "--font-source-serif" },
];

const FONT_BY_ID = new Map(FONTS.map((f) => [f.id, f]));

/**
 * Font stack for documents. Noto Sans follows the chosen family so any glyph
 * it lacks (e.g. ₹ in some fonts) falls back per-character instead of to a
 * system font that may differ between screen and print.
 */
export function fontStack(id: FontId): string {
  const font = FONT_BY_ID.get(id) ?? FONTS[0];
  const generic = font.category === "serif" ? "serif" : "sans-serif";
  return `var(${font.cssVar}), var(--font-noto-sans), ${generic}`;
}

export const PRESET_COLORS = [
  "#18181b",
  "#334155",
  "#1e3a8a",
  "#4f46e5",
  "#7c3aed",
  "#c026d3",
  "#e11d48",
  "#ea580c",
  "#d97706",
  "#65a30d",
  "#059669",
  "#0f766e",
  "#0891b2",
  "#0369a1",
];
