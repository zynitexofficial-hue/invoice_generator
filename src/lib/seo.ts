import { absoluteUrl, CONTENT_REVIEWED, SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "@/lib/site";

export interface Faq {
  q: string;
  a: string;
}

const ORG_ID = `${SITE_URL}/#organization`;
const SITE_ID = `${SITE_URL}/#website`;
const APP_ID = `${SITE_URL}/#app`;

export function organizationLd() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: SITE_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/icons/icon-512.png"),
  };
}

export function websiteLd() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: SITE_URL,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "en-IN",
    publisher: { "@id": ORG_ID },
  };
}

/** The product itself. No ratings/reviews are claimed — we don't have any. */
export function applicationLd() {
  return {
    "@type": "WebApplication",
    "@id": APP_ID,
    name: SITE_NAME,
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Invoicing",
    operatingSystem: "Any (web browser)",
    browserRequirements: "Requires a modern browser with JavaScript enabled.",
    inLanguage: "en-IN",
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
    featureList: [
      "GST tax invoices with automatic CGST, SGST, UTGST or IGST",
      "Invoices without GST, quotations, proforma invoices, bills of supply and export invoices",
      "Six customisable invoice templates with logo, colours and fonts",
      "Amount in words in the Indian numbering system (lakh, crore)",
      "UPI QR code for payments",
      "PDF download",
      "Saved customers, item catalogue and invoice history",
      "No sign-up, no login and no watermark; data stays in the browser",
    ],
    publisher: { "@id": ORG_ID },
  };
}

export function faqLd(faqs: Faq[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function articleLd({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  return {
    "@type": "Article",
    headline: title,
    description,
    url: absoluteUrl(path),
    mainEntityOfPage: absoluteUrl(path),
    inLanguage: "en-IN",
    datePublished: CONTENT_REVIEWED,
    dateModified: CONTENT_REVIEWED,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    image: absoluteUrl("/opengraph-image"),
  };
}

export function howToLd({
  name,
  steps,
}: {
  name: string;
  steps: { name: string; text: string }[];
}) {
  return {
    "@type": "HowTo",
    name,
    totalTime: "PT3M",
    estimatedCost: { "@type": "MonetaryAmount", currency: "INR", value: "0" },
    step: steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
    })),
  };
}

/** Wrap several nodes in one @graph document. */
export function graph(...nodes: Record<string, unknown>[]) {
  return { "@context": "https://schema.org", "@graph": nodes };
}
