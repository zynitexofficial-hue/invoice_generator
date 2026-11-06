/**
 * Public site configuration used for SEO (canonical URLs, sitemap, JSON-LD).
 *
 * Set NEXT_PUBLIC_SITE_URL to your real domain (e.g. https://invoices.example.com).
 * On Vercel the production domain is picked up automatically when it isn't set.
 */
function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  // A production build must never emit localhost canonicals, sitemap or JSON-LD.
  if (process.env.NODE_ENV === "production") return "https://invoice.zynitex.com";
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Invoice Studio";
export const SITE_TAGLINE = "Free GST Invoice Generator";
/** ≤160 characters so search results don't truncate it. Used for <meta> and social cards. */
export const SITE_META_DESCRIPTION =
  "Free GST invoice generator: make GST tax invoices, bills, quotations and export invoices online. Auto CGST, SGST & IGST, UPI QR, PDF. No sign-up, no watermark.";

/** Long description for structured data, llms.txt and other machine readers. */
export const SITE_DESCRIPTION =
  "Free GST invoice generator — create GST bills, tax invoices, quotations, proforma invoices and bills of supply online. No sign-up, no login, no watermark and no hidden charges. Automatic CGST, SGST & IGST, HSN/SAC codes, UPI QR, 6 templates, instant PDF download, plus GSTR-1/GSTR-3B worksheets, GSTR-2B reconciliation and e-invoice JSON export.";

/** Date the public guides were last reviewed (shown on pages and in JSON-LD). */
export const CONTENT_REVIEWED = "2026-10-22";

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
