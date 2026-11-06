import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
import { formatDate } from "@/lib/dates";
import { PRIVACY_CHANGES, PRIVACY_CONTACT_EMAIL, PRIVACY_REVIEWED } from "@/lib/legal";
import { socialMeta } from "@/lib/social";

export const metadata: Metadata = {
  title: "Privacy — Your Invoices Stay on Your Device",
  description: `${SITE_NAME} runs entirely in your browser. We don't collect, upload or store your business details, customers or invoices. Plain-language privacy notice, including India's DPDP Act.`,
  alternates: { canonical: "/privacy" },
  ...socialMeta({
    path: "/privacy",
    title: "Privacy — Your Invoices Stay on Your Device",
    description: `${SITE_NAME} runs entirely in your browser. We don't collect, upload or store your business details, customers or invoices.`,
  }),
};

const date = (iso: string) => formatDate(iso, "dd MMM yyyy");

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated {date(PRIVACY_REVIEWED)} · This page explains how {SITE_NAME} handles data. It
        is not legal advice.
      </p>
      <div className="guide-prose mt-8">
        <section aria-labelledby="short">
          <h2 id="short">The short version</h2>
          <ul>
            <li>
              {SITE_NAME} runs in your browser. Your business profile, customers, items, invoices,
              expenses and settings are saved <b>on your device</b> — never sent to us.
            </li>
            <li>No accounts, no sign-up, no analytics, no advertising, no tracking cookies.</li>
            <li>
              Our host (Vercel) sees normal web requests, like any website. We can&apos;t see what
              you type into the app.
            </li>
            <li>
              You are responsible for your customers&apos; data under India&apos;s DPDP Act. The app
              gives you tools to help: encrypted backups, customer data export and erasure, and a
              retention helper.
            </li>
            <li>
              The PIN lock is a screen lock, not encryption. Turn on encrypted backups and keep your
              device protected.
            </li>
          </ul>
        </section>

        <section aria-labelledby="device">
          <h2 id="device">What stays on your device</h2>
          <p>
            Everything below is stored by your browser for this website only. We cannot read it.
          </p>
          <ul>
            <li>
              <b>IndexedDB (the app&apos;s database):</b> your business profile and logo, settings,
              customers, items, invoices and other documents, saved designs, expenses, other income,
              GST filing records, numbering counters and a local change log.
            </li>
            <li>
              <b>localStorage:</b> <code>ig:marker</code>, which holds only a random install id and
              how many records of each kind you have (used to warn you if the browser deletes your
              data); <code>ig:dismissed-banners</code>, which remembers banners you closed; and your
              light/dark theme choice.
            </li>
            <li>
              <b>sessionStorage:</b> whether the PIN lock is currently unlocked, when you were last
              active, and failed PIN attempts. It is cleared when you close the tab.
            </li>
            <li>
              <b>Backup folder permission (optional):</b> if you turn on automatic backups, the
              browser remembers which folder you chose. Backup files are written to that folder on
              your computer only.
            </li>
            <li>
              <b>Offline copy of the app:</b> the app&apos;s own pages, code, fonts and icons are
              cached so it opens without internet. This cache holds no business data.
            </li>
            <li>
              <b>Files you save:</b> PDFs, invoice files and backups go wherever you save them.
              Plain backups are readable by anyone who has the file — use encrypted backups for
              anything you store in the cloud or share.
            </li>
          </ul>
          <p>
            Payment links put payment details after the <code>#</code> in the link, a part that
            browsers never send to the server.
          </p>
        </section>

        <section aria-labelledby="operator">
          <h2 id="operator">What the website operator can see</h2>
          <ul>
            <li>
              <b>Hosting:</b> the site is a set of static files hosted on Vercel. Like every web
              host, Vercel processes standard request logs — such as IP address, browser
              (user-agent), pages and files requested, and time — to deliver the site and keep it
              secure. These logs may be processed outside India.
            </li>
            <li>
              <b>No analytics or trackers:</b> we don&apos;t use analytics, advertising pixels or
              cookies that identify you.
            </li>
            <li>
              <b>Search engine verification:</b> the page includes a Google Search Console
              verification tag. It is a fixed code in the page and sends nothing about you.
            </li>
            <li>
              <b>No connections from the app:</b> the app is locked down so it can only talk to this
              website itself, and it doesn&apos;t send your records anywhere.
            </li>
          </ul>
          <p>
            If you email us, we receive your email address and message and use them only to reply.
          </p>
        </section>

        <section aria-labelledby="dpdp">
          <h2 id="dpdp">Your role under India&apos;s DPDP Act, 2023</h2>
          <p>
            When you record your customers&apos; or vendors&apos; names, phone numbers, emails and
            addresses, <b>you — the business — are the Data Fiduciary</b> for that personal data.
            The app never sends it to us, so we don&apos;t process it on your behalf. The Digital
            Personal Data Protection Rules, 2025 are being phased in, with most duties applying from
            13 May 2027. Good practice to start now:
          </p>
          <ul>
            <li>
              <b>Tell people why:</b> let customers know what details you collect and why (for
              example, to issue GST invoices). Settings → Data &amp; backup has a short notice you
              can copy.
            </li>
            <li>
              <b>Collect only what you need:</b> email and phone are optional — leave them blank if
              you don&apos;t use them.
            </li>
            <li>
              <b>Keep GST records as required:</b> GST law requires keeping invoices and accounts
              for about 72 months (six years) from the due date of the annual return for that year,
              longer if a case is pending.
            </li>
            <li>
              <b>Erase when no longer needed:</b> after the retention period, erase personal data
              you no longer need. Customers → ⋯ → <i>Erase personal data</i> and the retention
              helper in Settings help with this. Issued invoices keep the details the law requires.
            </li>
            <li>
              <b>Answer requests:</b> customers can ask for a copy of their data or for correction
              or erasure. Customers → ⋯ → <i>Export customer data</i> gives you a file to share.
            </li>
            <li>
              <b>Protect the data:</b> use encrypted backups, a device password and disk encryption.
            </li>
            <li>
              <b>Report breaches:</b> if personal data is exposed (for example, a lost laptop or a
              leaked backup), inform the affected people and, where the rules apply, the Data
              Protection Board of India — within 72 hours for the detailed report. Settings →
              Security &amp; PIN has a checklist.
            </li>
          </ul>
        </section>

        <section aria-labelledby="security">
          <h2 id="security">Security</h2>
          <ul>
            <li>
              <b>The PIN is a screen lock, not encryption.</b> It stops someone casually opening the
              app on your device. Your data in the browser is not encrypted by it, and someone with
              access to your device&apos;s files could read it.
            </li>
            <li>
              <b>Turn on encrypted backups</b> (Settings → Data &amp; backup). Backups are then
              locked with AES-256 and your passphrase, which is never stored. If you lose the
              passphrase, the backup can&apos;t be opened by anyone — including us.
            </li>
            <li>
              <b>Protect the device:</b> use your operating system&apos;s login password, turn on
              disk encryption (BitLocker, FileVault, or Android/iOS device encryption) and keep the
              browser up to date.
            </li>
          </ul>
        </section>

        <section aria-labelledby="retention">
          <h2 id="retention">Retention</h2>
          <p>
            Your data stays in your browser until you delete it. We keep nothing of yours. Our
            host&apos;s request logs are kept for a limited time under the host&apos;s own policies.
          </p>
          <p>
            For your business records, keep GST invoices for the period the law requires (about 72
            months, see above). The retention helper in Settings → Data &amp; backup counts records
            older than your chosen period (8 financial years by default). It never deletes issued
            invoices automatically; it only offers to export and delete old drafts.
          </p>
          <p>
            To delete everything, use Settings → Data &amp; backup → <i>Delete all data</i>, or
            clear this site&apos;s data in your browser settings. Backup files you saved must be
            deleted separately.
          </p>
        </section>

        <section aria-labelledby="rights">
          <h2 id="rights">Your rights &amp; contact</h2>
          <p>
            Because your app data never reaches us, we can&apos;t access, correct or delete it — you
            control it fully on your device. For personal data we may hold (hosting logs, or emails
            you send us) you can ask for information, correction or erasure, or raise a grievance.
          </p>
          <p>
            <b>Contact / grievance:</b>{" "}
            {PRIVACY_CONTACT_EMAIL ? (
              <a href={`mailto:${PRIVACY_CONTACT_EMAIL}`}>{PRIVACY_CONTACT_EMAIL}</a>
            ) : (
              <span>a contact email will be published here shortly.</span>
            )}{" "}
            We aim to reply within 30 days. If you are not satisfied, you may complain to the Data
            Protection Board of India once it accepts complaints.
          </p>
          <p>
            Questions about <i>your customers&apos;</i> data held in your copy of the app should be
            handled by you, as the business that collected it.
          </p>
        </section>

        <section aria-labelledby="children">
          <h2 id="children">Children</h2>
          <p>
            {SITE_NAME} is a business tool and is not intended for children (under 18). We do not
            knowingly process children&apos;s personal data. If you record a child&apos;s details as
            a customer, you are responsible for obtaining verifiable parental consent where the law
            requires it.
          </p>
        </section>

        <section aria-labelledby="changes">
          <h2 id="changes">Changes to this page</h2>
          <p>We&apos;ll update this page when something changes and note it here.</p>
          <ul>
            {PRIVACY_CHANGES.map((c) => (
              <li key={c.date}>
                <b>{date(c.date)}:</b> {c.summary}
              </li>
            ))}
          </ul>
          <p>
            <i>
              This page explains how the app works and points to general legal duties. It is not
              legal advice — check with a professional for your situation.
            </i>
          </p>
        </section>
      </div>
    </div>
  );
}
