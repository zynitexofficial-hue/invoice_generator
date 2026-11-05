import type { ComponentType } from "react";
import type { ColumnKey } from "@/lib/render/view-model";
import type { DesignCustomization, SectionId, TemplateId } from "@/lib/schema";
import type { PageBox } from "../layout";

export interface DecorProps {
  pageIndex: number;
  pageCount: number;
}

export interface DocumentTemplate {
  id: TemplateId;
  /** Adjust page padding (e.g. reserve room for a side strip). */
  pageBox?: (base: PageBox, design: DesignCustomization) => PageBox;
  /** Full header on the first page (identity, parties, meta). */
  Header: ComponentType;
  /** Compact header on pages 2+. */
  ContinuationHeader: ComponentType;
  /** Absolutely positioned page decorations (bands, strips, stamp). */
  Decor?: ComponentType<DecorProps>;
  columnLabels?: Partial<Record<ColumnKey, string>>;
  /** Template-specific section renderers; others fall back to the shared ones. */
  sections?: Partial<Record<SectionId, ComponentType>>;
}
