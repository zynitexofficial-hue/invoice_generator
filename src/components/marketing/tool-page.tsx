import { ArrowRight, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Accordion } from "@/components/marketing/accordion";
import { JsonLd } from "@/components/marketing/json-ld";
import { TOOLS } from "@/content/tools";
import { breadcrumbLd, faqLd, graph, type Faq } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";

/**
 * Shared layout for the free tool pages: breadcrumb, heading, the interactive
 * tool, explanatory prose, FAQs and links to the other tools — plus matching
 * JSON-LD (breadcrumb, WebApplication, FAQPage).
 */
export function ToolPage({
  path,
  name,
  title,
  intro,
  faqs,
  tool,
  children,
}: {
  path: string;
  /** Short name used in the breadcrumb and structured data. */
  name: string;
  /** The visible H1. */
  title: string;
  intro: ReactNode;
  faqs: Faq[];
  tool: ReactNode;
  /** Explanatory prose under the tool. */
  children?: ReactNode;
}) {
  const others = TOOLS.filter((t) => t.path !== path);
  return (
    <div className="mx-auto max-w-5xl px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      <JsonLd
        data={graph(
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name, path },
          ]),
          {
            "@type": "WebApplication",
            name,
            url: absoluteUrl(path),
            applicationCategory: "FinanceApplication",
            operatingSystem: "Any (web browser)",
            isAccessibleForFree: true,
            offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
          },
          faqLd(faqs),
        )}
      />

      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/" className="hover:text-foreground">
              Home
            </Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li aria-current="page" className="text-foreground">
            {name}
          </li>
        </ol>
      </nav>

      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 text-lg leading-8 text-muted-foreground">{intro}</p>
      </div>

      <div className="mt-10">{tool}</div>

      {children && <div className="guide-prose mx-auto mt-16 max-w-3xl">{children}</div>}

      <section className="mx-auto mt-14 max-w-3xl">
        <h2 className="mb-5 text-2xl font-semibold tracking-[-0.02em]">
          Frequently asked questions
        </h2>
        <Accordion items={faqs} />
      </section>

      <section aria-labelledby="more-tools" className="mx-auto mt-14 max-w-3xl">
        <h2 id="more-tools" className="mb-4 text-lg font-semibold tracking-[-0.01em]">
          More free tools
        </h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {others.map((t) => (
            <li key={t.path}>
              <Link
                href={t.path}
                className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-4 transition-[border-color,box-shadow] hover:border-primary/30 hover:shadow-md"
              >
                <span className="flex items-center justify-between gap-2 font-medium">
                  {t.name}
                  <ArrowRight className="size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </span>
                <span className="mt-1 text-sm leading-6 text-muted-foreground">
                  {t.description}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Inline link styled for prose on tool pages. */
export function ProseLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-primary hover:underline">
      {children}
    </Link>
  );
}
