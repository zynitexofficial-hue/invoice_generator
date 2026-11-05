import type { Metadata } from "next";
import { GstCalculator } from "@/components/marketing/gst-calculator";
import { ProseLink, ToolPage } from "@/components/marketing/tool-page";
import type { Faq } from "@/lib/seo";

const TITLE = "GST Calculator — Add or Remove GST, CGST/SGST/IGST Split";
const DESCRIPTION =
  "Free online GST calculator for India. Add GST to a price or remove GST from an inclusive amount, and see the CGST, SGST and IGST split instantly. Formulas and examples included.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "GST calculator",
    "GST calculator online",
    "reverse GST calculator",
    "GST inclusive calculator",
    "CGST SGST calculator",
  ],
  alternates: { canonical: "/gst-calculator" },
  openGraph: { url: "/gst-calculator", title: TITLE, description: DESCRIPTION },
};

const FAQS: Faq[] = [
  {
    q: "How do I calculate GST on an amount?",
    a: "Multiply the amount by the GST rate and divide by 100. For ₹10,000 at 18%, GST is ₹10,000 × 18 ÷ 100 = ₹1,800, so the total is ₹11,800.",
  },
  {
    q: "How do I remove GST from a GST-inclusive price?",
    a: "Divide the inclusive amount by (1 + rate ÷ 100). For ₹11,800 including 18% GST, the taxable value is ₹11,800 ÷ 1.18 = ₹10,000 and the GST is ₹1,800.",
  },
  {
    q: "How is GST split into CGST and SGST?",
    a: "For a sale within the same state, the GST rate is split equally: 18% becomes 9% CGST and 9% SGST. For a sale to another state, the full 18% is charged as IGST.",
  },
  {
    q: "Which GST rate applies to my product or service?",
    a: "It depends on the HSN or SAC code of the goods or service. Check the current rate notification on the CBIC website or the GST portal, as rates are revised from time to time.",
  },
];

export default function GstCalculatorPage() {
  return (
    <ToolPage
      path="/gst-calculator"
      name="GST calculator"
      title="GST Calculator"
      intro="Add GST to a price or remove GST from an inclusive amount — with the CGST, SGST and IGST split shown instantly."
      faqs={FAQS}
      tool={<GstCalculator />}
    >
      <section>
        <h2>GST formulas</h2>
        <ul>
          <li>
            <b>Add GST:</b> GST = Amount × Rate ÷ 100 · Total = Amount + GST
          </li>
          <li>
            <b>Remove GST:</b> Taxable value = Inclusive amount × 100 ÷ (100 + Rate) · GST =
            Inclusive amount − Taxable value
          </li>
          <li>
            <b>Same state:</b> CGST = SGST = GST ÷ 2 · <b>Other state:</b> IGST = GST
          </li>
        </ul>
      </section>
      <section>
        <h2>Example</h2>
        <p>
          A designer in Pune bills ₹25,000 for a website at 18% GST. For a client in Mumbai (same
          state) the invoice shows CGST ₹2,250 and SGST ₹2,250. For a client in Bengaluru (another
          state) it shows IGST ₹4,500. Either way the total is ₹29,500. Learn more in{" "}
          <ProseLink href="/guides/cgst-sgst-igst">CGST vs SGST vs IGST</ProseLink>, or look up any{" "}
          <ProseLink href="/gst-state-codes">GST state code</ProseLink>.
        </p>
      </section>
    </ToolPage>
  );
}
