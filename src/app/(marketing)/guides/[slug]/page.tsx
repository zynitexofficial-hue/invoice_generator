import { ArrowRight, CalendarCheck, ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDES, getGuide } from "@/content/guides";
import { Accordion } from "@/components/marketing/accordion";
import { JsonLd } from "@/components/marketing/json-ld";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/dates";
import { articleLd, breadcrumbLd, faqLd, graph, howToLd } from "@/lib/seo";
import { CONTENT_REVIEWED } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return {};
  const path = `/guides/${guide.slug}`;
  return {
    title: guide.metaTitle,
    description: guide.description,
    keywords: guide.keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "article",
      url: path,
      title: guide.metaTitle,
      description: guide.description,
    },
    twitter: { title: guide.metaTitle, description: guide.description },
  };
}

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();
  const path = `/guides/${guide.slug}`;
  const related = guide.related
    ? guide.related.map(getGuide).filter((g) => g !== undefined)
    : GUIDES.filter((g) => g.slug !== guide.slug).slice(0, 3);

  return (
    <article className="mx-auto max-w-3xl px-4 pt-8 pb-20 sm:px-6 sm:pt-12">
      <JsonLd
        data={graph(
          articleLd({ title: guide.title, description: guide.description, path }),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "GST guides", path: "/guides" },
            { name: guide.shortTitle, path },
          ]),
          faqLd(guide.faqs),
          ...(guide.howTo ? [howToLd({ name: guide.title, steps: guide.howTo })] : []),
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
          <li>
            <Link href="/guides" className="hover:text-foreground">
              GST guides
            </Link>
          </li>
          <ChevronRight className="size-3.5" aria-hidden />
          <li aria-current="page" className="text-foreground">
            {guide.shortTitle}
          </li>
        </ol>
      </nav>

      <h1 className="text-3xl leading-tight font-semibold tracking-[-0.025em] text-balance sm:text-4xl">
        {guide.title}
      </h1>
      <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarCheck className="size-4" aria-hidden />
        Last reviewed{" "}
        <time dateTime={CONTENT_REVIEWED}>{formatDate(CONTENT_REVIEWED, "dd MMM yyyy")}</time>
      </p>

      {/* Direct answer first — what search snippets and AI answers quote. */}
      <section
        aria-label="Quick answer"
        className="mt-8 rounded-2xl border border-primary/20 bg-primary-soft/40 p-5 sm:p-6"
      >
        <h2 className="text-xs font-semibold tracking-wide text-primary-soft-foreground uppercase">
          Quick answer
        </h2>
        <p className="mt-2 text-[15px] leading-7">{guide.answer}</p>
      </section>

      <nav
        aria-label="On this page"
        className="mt-8 rounded-2xl border border-border bg-surface p-5"
      >
        <h2 className="text-sm font-semibold">On this page</h2>
        <ol className="mt-3 grid gap-1.5 text-sm sm:grid-cols-2">
          {guide.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-muted-foreground hover:text-primary">
                {s.heading}
              </a>
            </li>
          ))}
          <li>
            <a href="#faq" className="text-muted-foreground hover:text-primary">
              Frequently asked questions
            </a>
          </li>
        </ol>
      </nav>

      <div className="guide-prose mt-10">
        {guide.sections.map((s) => (
          <section key={s.id} id={s.id} className="scroll-mt-24">
            <h2>{s.heading}</h2>
            {s.body}
          </section>
        ))}
      </div>

      <section className="mt-12 overflow-hidden rounded-2xl border border-border bg-[linear-gradient(135deg,var(--primary-soft),var(--surface))] p-6 sm:p-8">
        <h2 className="text-xl font-semibold tracking-[-0.02em]">
          Create a GST invoice now — free
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          No sign-up, no login, no watermark. Automatic CGST, SGST and IGST, HSN/SAC codes, UPI QR
          and instant PDF download.
        </p>
        <Button variant="primary" size="lg" asChild className="mt-5">
          <Link href="/invoice?new=1">
            Create free invoice
            <ArrowRight />
          </Link>
        </Button>
      </section>

      <section id="faq" className="mt-14 scroll-mt-24">
        <h2 className="mb-5 text-2xl font-semibold tracking-[-0.02em]">
          Frequently asked questions
        </h2>
        <Accordion items={guide.faqs} />
      </section>

      <p className="mt-8 text-xs leading-5 text-muted-foreground">
        This guide is general information based on the CGST Rules, 2017 and the IGST Act, 2017. It
        is not tax or legal advice — rates, thresholds and notifications change, so confirm your
        situation with a chartered accountant or on the official GST portal (gst.gov.in /
        cbic.gov.in).
      </p>

      <aside className="mt-14">
        <h2 className="text-lg font-semibold">Related guides</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {related.map((g) => (
            <li key={g.slug}>
              <Link
                href={`/guides/${g.slug}`}
                className="block h-full rounded-xl border border-border bg-surface p-4 text-sm font-medium transition-colors hover:border-primary/40"
              >
                {g.shortTitle}
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  {g.description.slice(0, 90)}…
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </article>
  );
}
