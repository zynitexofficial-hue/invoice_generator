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
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
export const SITE_NAME = "Invoice Studio";
export const SITE_TAGLINE = "Free GST Invoice Generator";
export const SITE_DESCRIPTION =
  "Free GST invoice generator — create GST bills, tax invoices, quotations, proforma invoices and bills of supply online. No sign-up, no login, no watermark and no hidden charges. Automatic CGST, SGST & IGST, HSN/SAC codes, UPI QR, 6 templates and instant PDF download.";

/** Date the public guides were last reviewed (shown on pages and in JSON-LD). */
export const CONTENT_REVIEWED = "2026-10-22";

export const absoluteUrl = (path = "/") => `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
