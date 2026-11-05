import type { TemplateId } from "@/lib/schema";
import { corporateTemplate } from "./corporate";
import { creativeTemplate } from "./creative";
import { minimalTemplate } from "./minimal";
import { modernTemplate } from "./modern";
import { professionalTemplate } from "./professional";
import { serviceTemplate } from "./service";
import type { DocumentTemplate } from "./types";

export const DOCUMENT_TEMPLATES: Record<TemplateId, DocumentTemplate> = {
  minimal: minimalTemplate,
  professional: professionalTemplate,
  modern: modernTemplate,
  corporate: corporateTemplate,
  creative: creativeTemplate,
  service: serviceTemplate,
};

export function getDocumentTemplate(id: TemplateId): DocumentTemplate {
  return DOCUMENT_TEMPLATES[id] ?? professionalTemplate;
}
