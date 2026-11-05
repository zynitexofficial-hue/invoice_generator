import { ArrowRight, BookOpen } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { GUIDES } from "@/content/guides";
import { JsonLd } from "@/components/marketing/json-ld";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbLd, graph } from "@/lib/seo";

const TITLE = "GST Invoice Guides — Formats, Rules & Examples";
const DESCRIPTION =
  "Plain-English GST guides for small businesses: GST invoice format, CGST vs SGST vs IGST, bill of supply, export invoices under LUT, and proforma invoices — with examples.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/guides" },
  openGraph: { url: "/guides", title: TITLE, description: DESCRIPTION },
};

export default function GuidesPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 pt-12 pb-20 sm:px-6">
      <JsonLd
        data={graph(
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "GST guides", path: "/guides" },
          ]),
          {
            "@type": "CollectionPage",
            name: TITLE,
            description: DESCRIPTION,
            url: absoluteUrl("/guides"),
            hasPart: GUIDES.map((g) => ({
              "@type": "Article",
              headline: g.title,
              url: absoluteUrl(`/guides/${g.slug}`),
            })),
          },
        )}
      />
      <div className="max-w-2xl">
        <span className="inline-flex items-center gap-2 rounded-full bg-primary-soft px-3 py-1 text-xs font-medium text-primary-soft-foreground">
          <BookOpen className="size-3.5" /> GST guides
        </span>
        <h1 className="mt-4 text-4xl font-semibold tracking-[-0.03em] text-balance">
          GST invoice guides for small businesses
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{DESCRIPTION}</p>
      </div>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2">
        {GUIDES.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guides/${g.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 shadow-xs transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold tracking-[-0.01em]">{g.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-6 text-muted-foreground">{g.description}</p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                Read guide
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
