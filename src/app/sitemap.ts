import type { MetadataRoute } from "next";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";
import { absoluteUrl, CONTENT_REVIEWED } from "@/lib/site";

export const dynamic = "force-static";

/** Only public, content pages — app screens hold private data and are noindex. */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(CONTENT_REVIEWED);
  return [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "weekly", priority: 1 },
    ...TOOLS.map((t) => ({
      url: absoluteUrl(t.path),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
    { url: absoluteUrl("/guides"), lastModified, changeFrequency: "monthly", priority: 0.7 },
    ...GUIDES.map((g) => ({
      url: absoluteUrl(`/guides/${g.slug}`),
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: absoluteUrl("/privacy"), lastModified, changeFrequency: "yearly", priority: 0.3 },
  ];
}
