import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";

/**
 * Open Graph + Twitter metadata for a public page.
 *
 * A page that sets its own `openGraph` / `twitter` REPLACES the layout's whole
 * object — including the image from the `opengraph-image` file convention —
 * so every page that sets either must restate the image. This helper does that
 * in one place so shared links always get a card with the site's preview image.
 */
const IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  alt: "Invoice Studio — Free GST Invoice Generator. No sign-up, no login, no watermark.",
};

export function socialMeta({
  path,
  title,
  description,
  type = "website",
}: {
  path: string;
  title: string;
  description: string;
  type?: "website" | "article";
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type,
      url: path,
      siteName: SITE_NAME,
      locale: "en_IN",
      title,
      description,
      images: [IMAGE],
    },
    twitter: { card: "summary_large_image", title, description, images: [IMAGE.url] },
  };
}
