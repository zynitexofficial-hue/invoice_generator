import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { GUIDES } from "@/content/guides";
import { TOOLS } from "@/content/tools";

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Brand />
          <p className="mt-4 max-w-xs text-sm leading-6 text-muted-foreground">
            A free, private GST invoice generator for Indian freelancers and small businesses. Your
            data never leaves your browser.
          </p>
        </div>
        <FooterCol title="Product">
          <FooterLink href="/invoice?new=1">Create an invoice</FooterLink>
          <FooterLink href="/invoice?new=1&type=proforma">Make a quotation</FooterLink>
          <FooterLink href="/templates">Invoice templates</FooterLink>
          <FooterLink href="/dashboard">Open the app</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
        </FooterCol>
        <FooterCol title="GST guides">
          {GUIDES.map((g) => (
            <FooterLink key={g.slug} href={`/guides/${g.slug}`}>
              {g.shortTitle}
            </FooterLink>
          ))}
          <FooterLink href="/guides">All guides</FooterLink>
        </FooterCol>
        <FooterCol title="Free tools">
          {TOOLS.map((t) => (
            <FooterLink key={t.path} href={t.path}>
              {t.name}
            </FooterLink>
          ))}
        </FooterCol>
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} Invoice Studio. Free to use.</p>
          <p>Information on this site is general guidance, not tax or legal advice.</p>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link
        href={href}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </Link>
    </li>
  );
}
