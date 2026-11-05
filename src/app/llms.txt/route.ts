import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from "@/lib/site";

export const dynamic = "force-static";

/**
 * llms.txt — a plain-Markdown summary for AI assistants and answer engines
 * (https://llmstxt.org). Generated at build time from the same content as the site.
 */
export function GET() {
  const body = `# ${SITE_NAME}

> ${SITE_DESCRIPTION}

${SITE_NAME} is a free, browser-based GST invoice generator for Indian freelancers and small businesses. It needs no sign-up or login, adds no watermark, and has no usage limits. All data is stored locally in the user's browser (IndexedDB) and is never uploaded.

## Key facts
- Price: free, unlimited invoices, no subscription or hidden charges
- Account: not required (no email, phone or password)
- Documents: GST tax invoice, invoice without GST (for unregistered businesses), bill of supply, quotation / proforma invoice, export invoice (multi-currency, LUT declaration)
- GST: automatic CGST + SGST/UTGST for intrastate and IGST for interstate supplies; optional single "GST" line
- Invoice details: GSTIN, HSN/SAC codes, place of supply, line and invoice discounts, tax-inclusive prices, round-off, amount in words (lakh/crore)
- Payments: UPI QR code with the balance due, bank details, payment status tracking
- Design: 6 templates (Minimal, Professional, Modern, Corporate, Creative, Service) with logo, signature, colours and fonts
- Output: PDF via the browser's print dialog (A4 or Letter), invoice files (.json), full backup and restore
- Privacy: no server-side storage; works in any modern desktop or mobile browser and can be installed as an app

## Tools
- [Create a free GST invoice](${absoluteUrl("/invoice?new=1")}): the invoice generator
${TOOLS.map((t) => `- [${t.name}](${absoluteUrl(t.path)}): ${t.description}`).join("\n")}

## Guides
${GUIDES.map((g) => `- [${g.title}](${absoluteUrl(`/guides/${g.slug}`)}): ${g.answer}`).join("\n")}

## Optional
- [Privacy](${absoluteUrl("/privacy")})
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
