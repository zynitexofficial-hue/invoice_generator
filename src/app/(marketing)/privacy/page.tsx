import type { Metadata } from "next";
import { CONTENT_REVIEWED, SITE_NAME } from "@/lib/site";
import { formatDate } from "@/lib/dates";

export const metadata: Metadata = {
  title: "Privacy — Your Invoices Stay on Your Device",
  description: `${SITE_NAME} runs entirely in your browser. We don't collect, upload or store your business details, customers or invoices.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-12 pb-20 sm:px-6">
      <h1 className="text-4xl font-semibold tracking-[-0.03em]">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Last updated {formatDate(CONTENT_REVIEWED, "dd MMM yyyy")}
      </p>
      <div className="guide-prose mt-8">
        <section>
          <h2>The short version</h2>
          <p>
            {SITE_NAME} is a website that runs entirely in your browser. Everything you enter — your
            business profile, logo, customers, items and invoices — is saved in your browser&apos;s
            own storage (IndexedDB) on your device. It is never sent to us or to anyone else.
          </p>
        </section>
        <section>
          <h2>What we collect</h2>
          <ul>
            <li>No accounts, no sign-up, no email or phone number.</li>
            <li>No analytics or advertising trackers.</li>
            <li>No cookies are used to identify you.</li>
          </ul>
          <p>
            Like any website, our hosting provider may keep standard server logs (such as IP address
            and pages requested) for security and reliability.
          </p>
        </section>
        <section>
          <h2>Your files</h2>
          <p>
            PDFs, invoice files (.json) and backups are created on your device and saved wherever
            you choose. Keep backups somewhere safe — if you clear your browser data, the copy
            stored in the browser is deleted and only your backup files remain.
          </p>
        </section>
        <section>
          <h2>Deleting your data</h2>
          <p>
            Use Settings → Data &amp; backup → Delete all data, or clear this site&apos;s data in
            your browser settings. Because we never receive your data, there is nothing for us to
            delete on our side.
          </p>
        </section>
      </div>
    </div>
  );
}
