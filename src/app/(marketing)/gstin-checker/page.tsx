import type { Metadata } from "next";
import { GST_PORTAL_SEARCH, GstinChecker } from "@/components/marketing/gstin-checker";
import { ProseLink, ToolPage } from "@/components/marketing/tool-page";
import type { Faq } from "@/lib/seo";

const PATH = "/gstin-checker";
const TITLE = "GSTIN Checker — Validate GST Number Format & Check Digit";
const DESCRIPTION =
  "Free GSTIN validator. Check whether a GST number has the right format and check digit, and see its state, PAN and PAN holder type. Runs in your browser — nothing is uploaded.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "GSTIN validator",
    "GSTIN checker",
    "check GST number format",
    "GSTIN check digit",
    "GST number validation",
    "GSTIN format",
  ],
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: TITLE, description: DESCRIPTION },
};

const FAQS: Faq[] = [
  {
    q: "What is the format of a GSTIN?",
    a: "A GSTIN has 15 characters: a 2-digit state code, the 10-character PAN of the business, an entity number (1–9, then A–Z) for multiple registrations under the same PAN in a state, the letter Z by default, and a check character calculated from the first 14 characters.",
  },
  {
    q: "Does a valid result mean the business is registered under GST?",
    a: "No. This checker confirms that the GSTIN is well-formed and that its check digit matches — which catches most typos. It cannot tell whether the registration is active, suspended or cancelled. Search the GSTIN on the official GST portal to confirm its status.",
  },
  {
    q: "How is the GSTIN check digit calculated?",
    a: "The 15th character is a checksum computed from the first 14 characters using a modulus-36 algorithm. If any one character is mistyped, the check digit almost always stops matching, so a failed check usually means a typo.",
  },
  {
    q: "Why does my GSTIN fail the check?",
    a: "The most common causes are a mistyped character, the letter O typed instead of the digit 0, or I instead of 1. Special registrations — such as TDS/TCS deductors, UIN holders like embassies, and non-resident online service providers — use different formats that this checker does not cover.",
  },
  {
    q: "Can I find the PAN from a GSTIN?",
    a: "Yes. Characters 3 to 12 of a regular GSTIN are the PAN of the business. The fourth character of the PAN shows the holder type — for example P for an individual, C for a company and F for a firm or LLP.",
  },
];

export default function GstinCheckerPage() {
  return (
    <ToolPage
      path={PATH}
      name="GSTIN checker"
      title="GSTIN Checker"
      intro="Check a GST number's format and check digit instantly, and see the state, PAN and holder type it encodes."
      faqs={FAQS}
      tool={<GstinChecker />}
    >
      <section>
        <h2>What each part of a GSTIN means</h2>
        <ul>
          <li>
            <b>Characters 1–2 — state code:</b> where the business is registered, such as 27 for
            Maharashtra. See all <ProseLink href="/gst-state-codes">GST state codes</ProseLink>.
          </li>
          <li>
            <b>Characters 3–12 — PAN:</b> the Permanent Account Number of the business owner or
            entity.
          </li>
          <li>
            <b>Character 13 — entity number:</b> 1 for the first registration under that PAN in the
            state, 2 for the second, and so on.
          </li>
          <li>
            <b>Character 14 — Z:</b> the default letter for regular registrations.
          </li>
          <li>
            <b>Character 15 — check character:</b> calculated from the first 14 characters to catch
            typing mistakes.
          </li>
        </ul>
      </section>
      <section>
        <h2>Check the format here, the status on the GST portal</h2>
        <p>
          This tool works offline and never sends the number anywhere. It tells you whether a GSTIN
          is correctly formed — useful before you print it on an invoice — but not whether the
          registration is active. For that, use the{" "}
          <a href={GST_PORTAL_SEARCH} target="_blank" rel="noopener noreferrer">
            Search Taxpayer page on the GST portal
          </a>
          .
        </p>
        <p>
          The <ProseLink href="/invoice?new=1">invoice generator</ProseLink> runs the same check on
          every GSTIN you enter and picks the place of supply from it, so CGST + SGST or IGST is
          applied automatically. Learn more in{" "}
          <ProseLink href="/guides/cgst-sgst-igst">CGST vs SGST vs IGST</ProseLink>.
        </p>
      </section>
    </ToolPage>
  );
}
