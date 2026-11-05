import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  Calculator,
  Check,
  CircleCheck,
  FileClock,
  FileDown,
  FileMinus,
  FileText,
  Globe,
  IndianRupee,
  InfinityIcon,
  Lock,
  MapPin,
  MonitorDown,
  Palette,
  Percent,
  QrCode,
  Receipt,
  ShieldCheck,
  Split,
  UserX,
  Users,
  WholeWord,
  X,
  Zap,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { QrCodeSvg } from "@/components/document/qr-code";
import { Accordion } from "@/components/marketing/accordion";
import { PhoneFrame } from "@/components/marketing/frames";
import { GstSplitDemo } from "@/components/marketing/gst-split-demo";
import { HeroSpotlight, HeroVisual } from "@/components/marketing/hero-visual";
import { JsonLd } from "@/components/marketing/json-ld";
import { Button } from "@/components/ui/button";
import { GUIDES } from "@/content/guides";
import {
  applicationLd,
  faqLd,
  graph,
  howToLd,
  organizationLd,
  websiteLd,
  type Faq,
} from "@/lib/seo";
import { SITE_NAME } from "@/lib/site";
import { TEMPLATES } from "@/lib/templates-meta";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const FAQS: Faq[] = [
  {
    q: "Is this invoice generator really free?",
    a: "Yes. Invoice Studio is 100% free with unlimited invoices. There is no sign-up, no login, no subscription, no hidden charges and no watermark on your PDFs.",
  },
  {
    q: "Do I need to create an account?",
    a: "No. Open the invoice generator and start typing — there is no account, email or phone number to enter.",
  },
  {
    q: "Are the invoices GST compliant?",
    a: "The tax invoice includes every field required by Rule 46 of the CGST Rules, 2017 — GSTIN, a 16-character invoice number, HSN/SAC codes, taxable value, CGST/SGST/UTGST or IGST, place of supply and signature — once you fill them in. It does not generate e-invoice IRNs, which only businesses above the notified turnover threshold need.",
  },
  {
    q: "Does it calculate CGST, SGST and IGST automatically?",
    a: "Yes. Enter one GST rate per item and the generator compares your state with the place of supply: same state gives CGST + SGST (or UTGST), a different state gives IGST. You can also switch to a single “GST” line in settings.",
  },
  {
    q: "Can I add my logo, signature and HSN/SAC codes?",
    a: "Yes. Upload your logo and signature once, add HSN or SAC codes per item, and choose from six templates with your own colours, fonts and layout.",
  },
  {
    q: "Will there be a watermark or ads on my invoices?",
    a: "No. Your PDF contains only your invoice — no watermark, no branding and no ads.",
  },
  {
    q: "How do I download the invoice as a PDF?",
    a: "Click “Download PDF” and choose “Save as PDF” in your browser's print dialog. The PDF is crisp, A4 or Letter sized, and matches the live preview exactly.",
  },
  {
    q: "Can I make invoices on my phone?",
    a: "Yes. The invoice maker works in any modern mobile browser, and you can install it on your home screen like an app.",
  },
  {
    q: "Where is my data stored? Is it safe?",
    a: "Everything is stored in your own browser on your device. Your business details, customers and invoices are never uploaded to a server, so nobody else can see them.",
  },
  {
    q: "What happens if I clear my browser or change my phone?",
    a: "Download a backup file from Settings. You can restore it on any browser or device in one click and continue where you left off.",
  },
  {
    q: "Can I create quotations, proforma invoices, bills of supply and export invoices?",
    a: "Yes. Choose Tax Invoice, Invoice (without GST) for businesses that aren't GST-registered, Bill of Supply, Quotation / Proforma Invoice or Export Invoice. Quotations convert into tax invoices in one click, and export invoices support USD, EUR and other currencies with the LUT declaration.",
  },
  {
    q: "Can my customers pay with UPI?",
    a: "Yes. Add your UPI ID and a scan-to-pay UPI QR code with the balance due is printed on your invoice.",
  },
];

const STEPS = [
  {
    name: "Add your business details",
    text: "Enter your business name, address, GSTIN and logo once — they're reused on every invoice.",
  },
  {
    name: "Add the customer",
    text: "Pick a saved customer or type new details. Their state sets CGST + SGST or IGST automatically.",
  },
  {
    name: "Add items",
    text: "Enter each product or service with HSN/SAC, quantity, rate, discount and GST rate. Totals update instantly.",
  },
  {
    name: "Choose a template",
    text: "Pick one of six templates and adjust colours, fonts and layout. The live preview shows the final invoice.",
  },
  {
    name: "Download the PDF",
    text: "Click Download PDF and save it — no watermark, ready to email, WhatsApp or print.",
  },
];

/* ------------------------------------------------------------------ */

export default function LandingPage() {
  return (
    <>
      <JsonLd
        data={graph(
          organizationLd(),
          websiteLd(),
          applicationLd(),
          howToLd({ name: "How to create a GST invoice online for free", steps: STEPS }),
          faqLd(FAQS),
        )}
      />
      <Hero />
      <Facts />
      <Bento />
      <Workflow />
      <Templates />
      <Mobile />
      <Compare />
      <Learn />
      <FaqSection />
      <FinalCta />
    </>
  );
}

/* ---------------- Hero ---------------- */

function Hero() {
  return (
    <section className="relative isolate overflow-hidden pt-16 sm:pt-24">
      {/* Fine grid + soft glow, fading out toward the bottom */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_70%_55%_at_50%_0%,#000_40%,transparent_100%)] [background-size:56px_56px] opacity-70"
      />
      <HeroSpotlight />
      <div
        aria-hidden
        className="absolute top-[-18rem] left-1/2 -z-10 h-[36rem] w-[64rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklch,var(--primary)_22%,transparent),transparent)] blur-2xl"
      />

      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6">
        <Link
          href="/guides/gst-invoice-format"
          className="group inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 py-1 pr-3 pl-1 text-xs font-medium text-muted-foreground shadow-xs backdrop-blur transition-colors hover:text-foreground"
        >
          <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
            GST ready
          </span>
          Includes every Rule 46 field
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <h1 className="mt-6 text-[2.6rem] leading-[1.04] font-semibold tracking-[-0.045em] text-balance sm:text-6xl lg:text-7xl">
          Free GST Invoice Generator
          <span className="mt-1 block bg-[linear-gradient(110deg,var(--muted-foreground),var(--subtle-foreground))] bg-clip-text text-transparent">
            without the sign-up.
          </span>
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground sm:text-xl sm:leading-9">
          Create GST bills, tax invoices, quotations and proforma invoices in minutes. No login, no
          watermark, no hidden charges — and your data never leaves your device.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button variant="primary" size="lg" asChild className="h-12 px-6 text-base">
            <Link href="/invoice?new=1">
              Create free invoice
              <ArrowRight />
            </Link>
          </Button>
          <Button variant="ghost" size="lg" asChild className="h-12 px-5 text-base text-foreground">
            <Link href="/dashboard">Open my invoices</Link>
          </Button>
        </div>
        <ul className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
          {HERO_PERKS.map((perk) => (
            <li
              key={perk.label}
              className="flex items-center gap-2 rounded-full border border-border bg-surface/70 py-1 pr-3.5 pl-1 text-[13px] font-medium text-foreground shadow-xs backdrop-blur-sm sm:text-sm"
            >
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full [&_svg]:size-3.5 ${TONE_CHIP[perk.tone]}`}
              >
                {perk.icon}
              </span>
              {perk.label}
            </li>
          ))}
        </ul>
      </div>

      <HeroVisual />
    </section>
  );
}

/* ---------------- Shared ---------------- */

/** Offsets the scroll-reveal range so items in a row arrive one after another. */
function stagger(i: number): CSSProperties {
  return {
    "--reveal-start": `${i * 6}%`,
    "--reveal-end": `${22 + i * 6}%`,
  } as CSSProperties;
}

type Tone = "primary" | "success" | "warning" | "info" | "danger";

const HERO_PERKS: { label: string; icon: ReactNode; tone: Tone }[] = [
  // The two short perks lead so they share a row on phones, with the long one centred below.
  { label: "Unlimited invoices", icon: <InfinityIcon />, tone: "primary" },
  { label: "PDF in one click", icon: <FileDown />, tone: "info" },
  { label: "Auto CGST, SGST & IGST", icon: <Percent />, tone: "success" },
];

const TONE_CHIP: Record<Tone, string> = {
  primary: "bg-primary-soft text-primary-soft-foreground",
  success: "bg-success-soft text-success-foreground",
  warning: "bg-warning-soft text-warning-foreground",
  info: "bg-info-soft text-info-foreground",
  danger: "bg-danger-soft text-danger-foreground",
};

const TONE_WASH: Record<Tone, string> = {
  primary: "bg-[linear-gradient(180deg,var(--primary-soft),transparent)]",
  success: "bg-[linear-gradient(180deg,var(--success-soft),transparent)]",
  warning: "bg-[linear-gradient(180deg,var(--warning-soft),transparent)]",
  info: "bg-[linear-gradient(180deg,var(--info-soft),transparent)]",
  danger: "bg-[linear-gradient(180deg,var(--danger-soft),transparent)]",
};

function IconChip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span
      className={`flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-5 ${TONE_CHIP[tone]}`}
    >
      {children}
    </span>
  );
}

function SectionHead({
  id,
  label,
  title,
  text,
  dark,
  center,
}: {
  id: string;
  label: string;
  title: ReactNode;
  text?: ReactNode;
  dark?: boolean;
  center?: boolean;
}) {
  return (
    <div className={`max-w-2xl reveal ${center ? "mx-auto text-center" : ""}`}>
      <p
        className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
          dark
            ? "bg-white/10 text-indigo-200 ring-1 ring-white/15"
            : "bg-primary-soft text-primary-soft-foreground ring-1 ring-primary/15"
        }`}
      >
        {label}
      </p>
      <h2
        id={id}
        className="mt-4 text-3xl leading-tight font-semibold tracking-[-0.035em] text-balance sm:text-[2.6rem]"
      >
        {title}
      </h2>
      {text && (
        <p className={`mt-4 text-lg leading-8 ${dark ? "text-white/65" : "text-muted-foreground"}`}>
          {text}
        </p>
      )}
    </div>
  );
}

/* ---------------- Facts ---------------- */

function Facts() {
  const facts = [
    {
      icon: <IndianRupee />,
      tone: "primary" as Tone,
      value: "₹0",
      label: "Free forever — no plans, no trials",
    },
    {
      icon: <UserX />,
      tone: "success" as Tone,
      value: "0",
      label: "Sign-ups, logins or emails needed",
    },
    {
      icon: <Palette />,
      tone: "warning" as Tone,
      value: "6",
      label: "Professional invoice templates",
    },
    {
      icon: <FileText />,
      tone: "info" as Tone,
      value: "5",
      label: "Document types, incl. non-GST & export",
    },
  ];
  return (
    <section aria-label="At a glance" className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
      <dl className="grid grid-cols-2 overflow-hidden rounded-3xl border border-border bg-surface shadow-sm lg:grid-cols-4">
        {facts.map((f, i) => (
          <div
            key={f.label}
            style={stagger(i)}
            className="flex reveal flex-col border-border p-5 sm:p-7 lg:[&:not(:last-child)]:border-r [&:nth-child(-n+2)]:border-b lg:[&:nth-child(-n+2)]:border-b-0 [&:nth-child(odd)]:border-r"
          >
            {/* A <dl> group may only hold <dt>/<dd>, so the icon lives inside the <dd>. */}
            <dt className="order-2 mt-1 text-sm leading-6 text-muted-foreground">{f.label}</dt>
            <dd className="flex flex-col gap-4">
              <IconChip tone={f.tone}>{f.icon}</IconChip>
              <span className="bg-[linear-gradient(135deg,var(--foreground),var(--primary))] bg-clip-text text-4xl font-semibold tracking-[-0.04em] text-transparent sm:text-5xl">
                {f.value}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/* ---------------- Features (bento) ---------------- */

function Tile({
  className,
  style,
  icon,
  tone,
  title,
  text,
  visualClassName,
  dots,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  icon: ReactNode;
  tone: Tone;
  title: string;
  text: string;
  visualClassName?: string;
  /** Dotted-paper texture behind the visual. */
  dots?: boolean;
  children: ReactNode;
}) {
  return (
    <div style={style} className={`reveal ${className ?? ""}`}>
      <div className="flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-xs transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lg">
        <div className="flex flex-col gap-4 p-6 sm:flex-row sm:p-7">
          <IconChip tone={tone}>{icon}</IconChip>
          <div>
            <h3 className="text-lg font-semibold tracking-[-0.02em]">{title}</h3>
            <p className="mt-1 text-[15px] leading-6 text-muted-foreground">{text}</p>
          </div>
        </div>
        <div
          className={`relative isolate mx-2 mb-2 flex flex-1 items-center justify-center rounded-[1.25rem] p-6 ${TONE_WASH[tone]} ${visualClassName ?? ""}`}
        >
          {dots && (
            <div
              aria-hidden
              className="absolute inset-0 -z-10 [background-image:radial-gradient(var(--border-strong)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,#000,transparent)] [background-size:18px_18px]"
            />
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function Bento() {
  return (
    <section
      id="features"
      aria-labelledby="features-title"
      className="scroll-mt-16 pt-10 pb-20 sm:pt-16 sm:pb-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          id="features-title"
          label="Built for Indian GST"
          title="Everything a GST bill needs. Nothing it doesn't."
          text="A focused invoice maker for freelancers, consultants, shops and small businesses — the calculations are done for you."
        />
        <div className="mt-12 grid gap-4 lg:grid-cols-6">
          <Tile
            className="lg:col-span-4"
            icon={<Split />}
            tone="primary"
            title="CGST, SGST or IGST — decided for you"
            text="Enter one GST rate per item. Your state is compared with the place of supply and the tax is split correctly, with UTGST for Union Territories. Try it:"
            dots
            visualClassName="min-h-72"
          >
            <GstSplitDemo />
          </Tile>
          <Tile
            className="lg:col-span-2"
            style={stagger(1)}
            icon={<QrCode />}
            tone="info"
            title="UPI QR on every invoice"
            text="Customers scan and pay the exact balance due."
          >
            <div className="flex flex-col items-center gap-3">
              <div className="rounded-2xl bg-white p-3 shadow-md ring-1 ring-black/5">
                <QrCodeSvg
                  value="upi://pay?pa=northwind@okhdfcbank&pn=Northwind%20Studio&am=123900.00&cu=INR"
                  className="size-32"
                />
              </div>
              <div className="rounded-full bg-surface px-3 py-1 text-sm shadow-xs ring-1 ring-border">
                <span className="text-muted-foreground">Balance due </span>
                <span className="font-semibold tabular-nums">₹1,23,900</span>
              </div>
            </div>
          </Tile>
          <Tile
            className="lg:col-span-2"
            icon={<WholeWord />}
            tone="warning"
            title="Amount in words, the Indian way"
            text="Lakh and crore, with paise — printed automatically."
          >
            <div className="w-full rounded-2xl border border-dashed border-border-strong bg-surface/80 p-4">
              <div className="text-[11px] font-semibold tracking-wide text-subtle-foreground uppercase">
                Amount in words
              </div>
              <div className="mt-1 text-sm font-medium">
                Indian Rupees One Lakh Twenty-Three Thousand Nine Hundred Only
              </div>
            </div>
          </Tile>
          <Tile
            className="lg:col-span-2"
            style={stagger(1)}
            icon={<Users />}
            tone="success"
            title="Remembers so you don't retype"
            text="Your business profile and customers are saved with your first invoice."
          >
            <ul className="w-full space-y-2 text-sm">
              {[
                "Business profile saved",
                "Acme Technologies added to Customers",
                "Website design saved to Items",
              ].map((t) => (
                <li
                  key={t}
                  className="flex items-center gap-2.5 rounded-xl bg-surface px-3 py-2 shadow-xs ring-1 ring-border"
                >
                  <CircleCheck className="size-4 shrink-0 text-success" />
                  {t}
                </li>
              ))}
            </ul>
          </Tile>
          <Tile
            className="lg:col-span-2"
            style={stagger(2)}
            icon={<Lock />}
            tone="primary"
            title="Private by design"
            text="No server, no database, no tracking. Your invoices live in your browser."
          >
            <div className="flex w-full items-center gap-4 rounded-2xl bg-zinc-950 p-4 text-white shadow-lg ring-1 ring-white/10 dark:bg-black/40">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
                <ShieldCheck className="size-5 text-emerald-300" />
              </span>
              <div>
                <div className="text-2xl font-semibold tabular-nums">0 KB</div>
                <div className="text-xs text-white/60">of your data uploaded</div>
              </div>
            </div>
          </Tile>
        </div>
        <ul className="mt-10 flex flex-wrap gap-2.5">
          {[
            "Tax invoice, non-GST invoice, bill of supply, quotation & export",
            "HSN/SAC codes",
            "Discounts & tax-inclusive prices",
            "Round-off",
            "Multi-page invoices",
            "Logo, signature, bank & IFSC",
            "Paid, partial & overdue status",
            "Backup & restore",
            "Installable app",
          ].map((t, i) => (
            <li
              key={t}
              style={stagger(i % 4)}
              className="flex reveal items-center gap-2 rounded-full border border-border bg-surface px-3.5 py-2 text-sm font-medium shadow-xs"
            >
              <Check className="size-4 shrink-0 text-primary" />
              {t}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Workflow (dark band) ---------------- */

function Workflow() {
  const steps = [
    {
      n: "01",
      title: "Add your business and customer",
      text: "Type your details once. Pick the customer's state and the right GST is chosen automatically — and everything is remembered for next time.",
      img: "/marketing/step-customer.webp",
      w: 797,
      h: 1025,
      alt: "Bill-to form with customer name, address, state and place of supply",
    },
    {
      n: "02",
      title: "Add items — totals add up live",
      text: "Quantity, rate and GST rate are all you need. HSN/SAC, units and discounts sit one tap away. Taxes, round-off and amount in words are calculated instantly.",
      img: "/marketing/step-items.webp",
      w: 797,
      h: 1191,
      alt: "Items with quantity, rate and GST rate, and an HSN code summary",
    },
    {
      n: "03",
      title: "Pick a design, download the PDF",
      text: "Choose a template, add your colours and logo, and download a print-ready A4 PDF with no watermark.",
      img: "/marketing/step-design.webp",
      w: 797,
      h: 1035,
      alt: "Template picker showing six invoice designs",
    },
  ];
  return (
    <section
      id="how-it-works"
      aria-labelledby="how-title"
      className="relative isolate scroll-mt-16 overflow-hidden bg-[oklch(0.19_0.035_274)] py-20 text-white sm:py-28 dark:border-y dark:border-white/10 dark:bg-[oklch(0.12_0.025_274)]"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,rgb(255_255_255/0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.05)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_30%,transparent_100%)] [background-size:56px_56px]"
      />
      <div
        aria-hidden
        className="absolute -top-48 left-1/2 -z-10 h-96 w-[56rem] -translate-x-1/2 rounded-full bg-[oklch(0.55_0.22_274/0.35)] blur-3xl"
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          id="how-title"
          dark
          center
          label="How it works"
          title="How to create a GST invoice online in 3 minutes"
          text="Three steps from a blank page to a GST-ready PDF."
        />
        <ol className="mt-16 space-y-16 sm:space-y-24">
          {steps.map((s, i) => (
            <li key={s.n} className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
              <div className={`reveal ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                <span className="bg-[linear-gradient(180deg,white,rgb(255_255_255/0.15))] bg-clip-text font-mono text-6xl font-semibold tracking-tight text-transparent">
                  {s.n}
                </span>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-0.03em] sm:text-3xl">
                  {s.title}
                </h3>
                <p className="mt-4 max-w-md text-lg leading-8 text-white/65">{s.text}</p>
              </div>
              <div
                style={stagger(1)}
                className={`relative reveal ${i % 2 === 1 ? "lg:order-1" : ""}`}
              >
                <div
                  aria-hidden
                  className="absolute inset-10 -z-10 rounded-full bg-[oklch(0.6_0.2_274/0.45)] blur-3xl"
                />
                <div className="mx-auto max-w-[420px] rounded-[1.4rem] bg-white/5 p-2 ring-1 ring-white/15 backdrop-blur">
                  <div className="max-h-[420px] overflow-hidden rounded-2xl [mask-image:linear-gradient(to_bottom,#000_75%,transparent)]">
                    <Image
                      src={s.img}
                      alt={s.alt}
                      width={s.w}
                      height={s.h}
                      loading="lazy"
                      sizes="420px"
                      className="block h-auto w-full"
                    />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <div className="mt-20 flex reveal justify-center">
          <Button
            size="lg"
            asChild
            className="h-12 bg-white px-6 text-base text-zinc-900 hover:bg-white/90"
          >
            <Link href="/invoice?new=1">
              Start your invoice
              <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Templates ---------------- */

function Templates() {
  return (
    <section
      id="templates"
      aria-labelledby="templates-title"
      className="scroll-mt-16 py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <SectionHead
            id="templates-title"
            label="Invoice templates"
            title="Six templates. Your colours."
            text="Every design supports GST, multi-page invoices, your logo and signature. Switch any time — your data stays the same."
          />
          <Button
            variant="secondary"
            asChild
            className="shrink-0 reveal self-start sm:mb-1.5 sm:self-auto"
          >
            <Link href="/templates">
              Customise templates
              <ArrowRight />
            </Link>
          </Button>
        </div>
        {/* Swipeable row on phones, a 3 × 2 grid from tablets up */}
        <ul className="-mx-4 mt-12 flex snap-x snap-mandatory scroll-px-4 [scrollbar-width:none] gap-4 overflow-x-auto px-4 pb-4 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-6 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
          {TEMPLATES.map((t, i) => {
            const color = t.defaults.primaryColor ?? "#4f46e5";
            const accent = t.defaults.accentColor ?? color;
            return (
              <li
                key={t.id}
                style={stagger(i % 3)}
                className="w-[78%] shrink-0 reveal snap-start sm:w-auto"
              >
                <div className="group h-full overflow-hidden rounded-2xl border border-border bg-surface shadow-xs transition-[translate,box-shadow] duration-300 ease-out hover:-translate-y-1 hover:shadow-lg">
                  <div
                    className="aspect-[5/4] overflow-hidden px-6 pt-6"
                    style={{
                      background: `linear-gradient(160deg, color-mix(in oklch, ${color} 22%, var(--surface)), color-mix(in oklch, ${accent} 6%, var(--surface)))`,
                    }}
                  >
                    <Image
                      src={`/marketing/template-${t.id}.jpg`}
                      alt={`${t.name} GST invoice template`}
                      width={1248}
                      height={1040}
                      loading="lazy"
                      sizes="(min-width: 1024px) 340px, (min-width: 640px) 45vw, 78vw"
                      className="h-auto w-full rounded-t-md shadow-[0_12px_32px_-12px_rgb(0_0_0/0.4)] transition-[translate] duration-500 ease-out group-hover:-translate-y-1.5"
                    />
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="font-semibold">{t.name}</h3>
                      <p className="truncate text-sm text-muted-foreground">{t.tags.join(" · ")}</p>
                    </div>
                    <span className="flex shrink-0 -space-x-1.5" aria-hidden>
                      <span
                        className="size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ring-2 ring-surface dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)]"
                        style={{ background: color }}
                      />
                      <span
                        className="size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] ring-2 ring-surface dark:shadow-[inset_0_0_0_1px_rgb(255_255_255/0.25)]"
                        style={{ background: accent }}
                      />
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/* ---------------- Mobile (gradient band) ---------------- */

function Mobile() {
  return (
    <section
      aria-labelledby="mobile-title"
      className="relative isolate overflow-hidden bg-[linear-gradient(135deg,var(--primary-soft),var(--info-soft)_55%,var(--success-soft))] py-20 sm:py-28"
    >
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [background-image:radial-gradient(color-mix(in_oklch,var(--primary)_18%,transparent)_1px,transparent_1px)] [mask-image:linear-gradient(to_bottom,transparent,#000_30%,#000_70%,transparent)] [background-size:22px_22px]"
      />
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <SectionHead
            id="mobile-title"
            label="Works on your phone"
            title="Make a GST bill from anywhere."
            text="The same invoice maker on your phone — fill in details, check the preview and share the PDF on WhatsApp or email."
          />
          <ul className="mt-8 space-y-3">
            {[
              {
                icon: <MonitorDown />,
                tone: "primary" as Tone,
                t: "Install it like an app",
                d: "Add it to your home screen or desktop. Opens in its own window.",
              },
              {
                icon: <ShieldCheck />,
                tone: "success" as Tone,
                t: "Backups you control",
                d: "One file restores your profile, customers and invoices on any device.",
              },
              {
                icon: <Zap />,
                tone: "warning" as Tone,
                t: "Fast on any connection",
                d: "A static site with no server round-trips while you type.",
              },
            ].map((x, i) => (
              <li
                key={x.t}
                style={stagger(i)}
                className="flex reveal gap-4 rounded-2xl border border-border/70 bg-surface/70 p-4 shadow-xs backdrop-blur"
              >
                <IconChip tone={x.tone}>{x.icon}</IconChip>
                <div>
                  <div className="font-semibold">{x.t}</div>
                  <div className="text-[15px] leading-6 text-muted-foreground">{x.d}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="relative mx-auto flex h-[520px] w-full max-w-md reveal justify-center sm:h-[600px]">
          <div
            aria-hidden
            className="absolute inset-12 rounded-full bg-[color-mix(in_oklch,var(--primary)_30%,transparent)] blur-3xl"
          />
          <PhoneFrame
            src="/marketing/app-phone-edit.webp"
            alt="Invoice editor on a phone"
            className="absolute top-10 left-0 w-[46%] -rotate-6 sm:w-[44%]"
          />
          <PhoneFrame
            src="/marketing/app-phone-preview.webp"
            alt="Invoice preview on a phone"
            className="absolute top-0 right-0 w-[50%] rotate-3 sm:w-[48%]"
          />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Comparison ---------------- */

function Compare() {
  const rows: [string, boolean, string][] = [
    ["Sign-up or phone number required", false, "Often"],
    ["Limit on number of invoices", false, "Sometimes"],
    ["Watermark or tool branding on PDF", false, "Sometimes"],
    ["Your invoices stored on their servers", false, "Often"],
    ["Automatic CGST, SGST & IGST", true, "Usually"],
    ["Quotation, bill of supply & export invoice", true, "Sometimes"],
    ["UPI QR code on invoice", true, "Sometimes"],
  ];
  return (
    <section id="compare" aria-labelledby="compare-title" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <SectionHead
            id="compare-title"
            label="Why Invoice Studio"
            title="A free invoice generator with no catch."
            text="Many “free” invoice tools ask for your phone number, cap how many invoices you can make, or stamp their logo on your PDF. We don't."
          />
          <div className="mt-8 flex reveal flex-wrap gap-3">
            {["No sign-up", "No watermark", "No limits"].map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-sm font-medium text-success-foreground"
              >
                <BadgeCheck className="size-4" />
                {t}
              </span>
            ))}
          </div>
        </div>
        <div
          style={stagger(1)}
          className="reveal rounded-3xl border border-border bg-surface p-2 shadow-lg"
        >
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="px-3 py-4 font-medium sm:px-5">
                  <span className="sr-only">Feature</span>
                </th>
                <th
                  scope="col"
                  className="rounded-t-2xl bg-primary px-3 py-4 text-center font-semibold text-primary-foreground sm:px-5"
                >
                  {SITE_NAME}
                </th>
                <th scope="col" className="px-3 py-4 text-center font-medium sm:px-5">
                  Typical free tools
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, ours, typical], i) => (
                <tr key={label} className="border-t border-border">
                  <th scope="row" className="px-3 py-3.5 font-medium sm:px-5">
                    {label}
                  </th>
                  <td
                    className={`bg-primary-soft/70 px-3 py-3.5 text-center sm:px-5 ${i === rows.length - 1 ? "rounded-b-2xl" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1.5 font-semibold text-primary-soft-foreground">
                      {ours ? <Check className="size-4" /> : <X className="size-4" />}
                      {ours ? "Yes" : "No"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-center text-muted-foreground sm:px-5">
                    {typical}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Documents & guides ---------------- */

function Learn() {
  const docs: {
    icon: ReactNode;
    tone: Tone;
    title: string;
    text: string;
    href: string;
    cta: string;
  }[] = [
    {
      icon: <Receipt />,
      tone: "primary",
      title: "GST tax invoice",
      text: "GSTIN, HSN/SAC and CGST/SGST or IGST.",
      href: "/invoice?new=1&type=tax_invoice",
      cta: "Create",
    },
    {
      icon: <FileText />,
      tone: "success",
      title: "Invoice without GST",
      text: "For freelancers and businesses not registered under GST.",
      href: "/invoice?new=1&type=invoice",
      cta: "Create",
    },
    {
      icon: <FileMinus />,
      tone: "warning",
      title: "Bill of supply",
      text: "For composition dealers and exempt supplies.",
      href: "/invoice?new=1&type=bill_of_supply",
      cta: "Create",
    },
    {
      icon: <FileClock />,
      tone: "info",
      title: "Quotation & proforma",
      text: "Convert to a tax invoice in one click.",
      href: "/invoice?new=1&type=proforma",
      cta: "Create",
    },
    {
      icon: <Globe />,
      tone: "danger",
      title: "Export invoice",
      text: "USD, EUR & more, with LUT declaration.",
      href: "/invoice?new=1&type=export",
      cta: "Create",
    },
    {
      icon: <Calculator />,
      tone: "primary",
      title: "GST calculator",
      text: "Add or remove GST and see the CGST/SGST/IGST split.",
      href: "/gst-calculator",
      cta: "Calculate",
    },
    {
      icon: <BadgeCheck />,
      tone: "success",
      title: "GSTIN checker",
      text: "Validate a GST number and see its state and PAN.",
      href: "/gstin-checker",
      cta: "Check",
    },
    {
      icon: <WholeWord />,
      tone: "warning",
      title: "Amount in words",
      text: "Rupees to words in lakh and crore, ready to copy.",
      href: "/amount-in-words",
      cta: "Convert",
    },
    {
      icon: <MapPin />,
      tone: "info",
      title: "GST state codes",
      text: "Every state and UT code, with UTGST territories.",
      href: "/gst-state-codes",
      cta: "Look up",
    },
  ];
  return (
    <section
      id="documents"
      aria-labelledby="learn-title"
      className="scroll-mt-16 border-y border-border bg-surface py-20 sm:py-28"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHead
          id="learn-title"
          label="Documents & guides"
          title="Every GST document — and how to get it right."
        />
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((d, i) => (
            <li key={d.title} style={stagger(i % 3)} className="reveal">
              <Link
                href={d.href}
                className="group flex h-full flex-col rounded-2xl border border-border bg-background p-5 transition-[translate,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                <IconChip tone={d.tone}>{d.icon}</IconChip>
                <span className="mt-4 block font-semibold">{d.title}</span>
                <span className="mt-1 block text-sm leading-6 text-muted-foreground">{d.text}</span>
                <span className="mt-auto flex items-center gap-1 pt-4 text-sm font-medium text-primary">
                  {d.cta}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 reveal rounded-2xl border border-border bg-background p-2">
          <div className="flex items-center gap-2 px-4 pt-3 pb-2 text-sm font-semibold">
            <BookOpen className="size-4 text-primary" />
            GST guides
          </div>
          <ul className="grid sm:grid-cols-2">
            {GUIDES.map((g) => (
              <li key={g.slug}>
                <Link
                  href={`/guides/${g.slug}`}
                  className="group flex items-start justify-between gap-4 rounded-xl px-4 py-3 transition-colors hover:bg-surface-2"
                >
                  <span className="font-medium transition-colors group-hover:text-primary">
                    {g.title}
                  </span>
                  <ArrowRight className="mt-1 size-4 shrink-0 text-subtle-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

function FaqSection() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-16 py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <SectionHead
            id="faq-title"
            label="FAQ"
            title="Questions, answered."
            text="Can't find what you need? Our GST guides cover formats, rules and examples."
          />
          <Button variant="secondary" asChild className="mt-6">
            <Link href="/guides">
              Read the GST guides
              <ArrowRight />
            </Link>
          </Button>
        </div>
        <div className="reveal">
          <Accordion items={FAQS} />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Final CTA ---------------- */

function FinalCta() {
  return (
    <section className="px-4 pb-20 sm:px-6 sm:pb-28">
      <div className="relative isolate mx-auto max-w-6xl reveal overflow-hidden rounded-[2rem] bg-[radial-gradient(120%_140%_at_0%_0%,oklch(0.56_0.22_274),oklch(0.36_0.17_282)_55%,oklch(0.24_0.09_284))] px-6 py-16 text-center text-white shadow-[0_30px_80px_-24px_oklch(0.45_0.2_274/0.6)] sm:px-16 sm:py-20">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 [background-image:linear-gradient(to_right,rgb(255_255_255/0.08)_1px,transparent_1px),linear-gradient(to_bottom,rgb(255_255_255/0.08)_1px,transparent_1px)] [mask-image:radial-gradient(ellipse_at_center,#000_20%,transparent_75%)] [background-size:48px_48px]"
        />
        <div
          aria-hidden
          className="absolute -right-24 -bottom-32 -z-10 size-96 rounded-full bg-[oklch(0.7_0.15_200/0.35)] blur-3xl"
        />
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl">
          Your next GST invoice is three minutes away.
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-lg text-white/75">
          No sign-up, no login, no watermark, no hidden charges.
        </p>
        <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            asChild
            className="h-12 bg-white px-6 text-base text-zinc-900 hover:bg-white/90"
          >
            <Link href="/invoice?new=1">
              Create free invoice
              <ArrowRight />
            </Link>
          </Button>
          <Button
            size="lg"
            variant="ghost"
            asChild
            className="h-12 px-5 text-base text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/gst-calculator">Try the GST calculator</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
