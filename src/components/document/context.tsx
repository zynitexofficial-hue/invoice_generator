"use client";

import { createContext, useContext } from "react";
import type { DocViewModel } from "@/lib/render/view-model";
import type { DesignCustomization, TemplateId } from "@/lib/schema";

export interface DocContextValue {
  vm: DocViewModel;
  design: DesignCustomization;
  templateId: TemplateId;
}

const DocContext = createContext<DocContextValue | null>(null);

export const DocProvider = DocContext.Provider;

export function useDoc(): DocContextValue {
  const value = useContext(DocContext);
  if (!value) throw new Error("useDoc must be used inside a document");
  return value;
}
