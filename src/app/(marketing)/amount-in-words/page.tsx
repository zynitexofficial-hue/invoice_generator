import type { Metadata } from "next";
import { AmountInWords } from "@/components/marketing/amount-in-words";
import { ProseLink, ToolPage } from "@/components/marketing/tool-page";
import type { Faq } from "@/lib/seo";

const PATH = "/amount-in-words";
const TITLE = "Amount in Words Converter — Rupees in Lakh & Crore";
const DESCRIPTION =
  "Convert any rupee amount to words in the Indian numbering system (lakh, crore) or the international system (million, billion), with paise. Copy the result for invoices, cheques and receipts.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "amount in words",
    "number to words in rupees",
    "amount in words converter",
    "rupees in words",
    "number to words Indian format",
    "lakh crore in words",
  ],
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: TITLE, description: DESCRIPTION },
};

const FAQS: Faq[] = [
  {
    q: "How do I write an amount in words on an invoice?",
    a: "Write the currency, the amount in words using lakh and crore, the paise if any, and end with “Only” — for example, ₹1,25,000.50 is “Indian Rupees One Lakh Twenty-Five Thousand and Paise Fifty Only”. Ending with “Only” stops anyone from adding words afterwards.",
  },
  {
    q: "How do you write 1,50,000 in words?",
    a: "One Lakh Fifty Thousand. In the international system the same number, 150,000, is One Hundred Fifty Thousand.",
  },
  {
    q: "How many lakhs make a million, and how many millions make a crore?",
    a: "10 lakh is 1 million, and 1 crore is 10 million (100 lakh). So ₹2.5 crore is ₹25 million.",
  },
  {
    q: "Is the amount in words mandatory on a GST invoice?",
    a: "Rule 46 of the CGST Rules does not list it among the mandatory fields, but it is standard practice on Indian invoices, and banks require it on cheques. Writing the total in words helps prevent the figure from being altered.",
  },
  {
    q: "How are paise written in words?",
    a: "Add them after the rupees with “and”: ₹10,000.75 is “Rupees Ten Thousand and Seventy-Five Paise Only”, or on an invoice, “Indian Rupees Ten Thousand and Paise Seventy-Five Only”.",
  },
];

export default function AmountInWordsPage() {
  return (
    <ToolPage
      path={PATH}
      name="Amount in words"
      title="Amount in Words Converter"
      intro="Turn any rupee amount into words — in lakh and crore, or in millions — ready to copy onto an invoice, cheque or receipt."
      faqs={FAQS}
      tool={<AmountInWords />}
    >
      <section>
        <h2>Indian vs international numbering</h2>
        <p>
          India groups digits as thousand, lakh and crore — 1,00,00,000 is one crore. The
          international system groups them in threes as thousand, million and billion — the same
          number is 10,000,000, or ten million.
        </p>
        <ul>
          <li>1 lakh = 1,00,000 = 100 thousand</li>
          <li>10 lakh = 10,00,000 = 1 million</li>
          <li>1 crore = 1,00,00,000 = 10 million</li>
          <li>100 crore = 1 billion</li>
        </ul>
      </section>
      <section>
        <h2>Amount in words on your invoices, automatically</h2>
        <p>
          The <ProseLink href="/invoice?new=1">free invoice generator</ProseLink> prints the total
          in words on your invoices — in lakh and crore for rupees, and in millions for USD, EUR and
          other currencies on export invoices. See what else belongs on an invoice in the{" "}
          <ProseLink href="/guides/gst-invoice-format">GST invoice format guide</ProseLink>.
        </p>
      </section>
    </ToolPage>
  );
}
