import type { Metadata } from "next";
import { StateCodeTable } from "@/components/marketing/state-code-table";
import { ProseLink, ToolPage } from "@/components/marketing/tool-page";
import type { Faq } from "@/lib/seo";

const PATH = "/gst-state-codes";
const TITLE = "GST State Code List — All States & UTs (With UTGST)";
const DESCRIPTION =
  "Complete list of GST state codes for every Indian state and Union Territory, as used in GSTINs and the place of supply — with UTGST territories, old codes, and the code for exports.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "GST state code list",
    "GST state code",
    "state code for GST",
    "GSTIN state code",
    "place of supply code",
  ],
  alternates: { canonical: PATH },
  openGraph: { url: PATH, title: TITLE, description: DESCRIPTION },
};

const FAQS: Faq[] = [
  {
    q: "What is a GST state code?",
    a: "A two-digit number that identifies an Indian state or Union Territory under GST. It forms the first two digits of every GSTIN and is printed with the place of supply on invoices.",
  },
  {
    q: "What are the most common GST state codes?",
    a: "07 Delhi, 09 Uttar Pradesh, 19 West Bengal, 24 Gujarat, 27 Maharashtra, 29 Karnataka, 32 Kerala, 33 Tamil Nadu, 36 Telangana and 37 Andhra Pradesh.",
  },
  {
    q: "Which state code is used for exports?",
    a: "96 (Other Country) is used as the place of supply for supplies to customers outside India. It never appears in a GSTIN.",
  },
  {
    q: "Which Union Territories charge UTGST instead of SGST?",
    a: "Union Territories without their own legislature: Chandigarh (04), Dadra and Nagar Haveli and Daman and Diu (26), Lakshadweep (31), Andaman and Nicobar Islands (35) and Ladakh (38). Delhi, Puducherry and Jammu and Kashmir have legislatures, so they charge SGST.",
  },
  {
    q: "Why do some old GSTINs start with 25 or 28?",
    a: "25 was Daman and Diu before it merged with Dadra and Nagar Haveli into code 26 in 2020. 28 is the code for Andhra Pradesh before its 2014 division; current Andhra Pradesh GSTINs use 37.",
  },
];

export default function GstStateCodesPage() {
  return (
    <ToolPage
      path={PATH}
      name="GST state codes"
      title="GST State Code List"
      intro="Every GST state and Union Territory code, as used in GSTINs and the place of supply — with the tax each one charges within the state."
      faqs={FAQS}
      tool={<StateCodeTable />}
    >
      <section>
        <h2>How state codes decide the tax on your invoice</h2>
        <p>
          Compare your own state code with the customer&apos;s place of supply. If they match, the
          supply is intrastate and you charge CGST + SGST (or CGST + UTGST in a Union Territory
          without a legislature). If they differ, it is interstate and you charge IGST. Exports use
          code 96 and are zero-rated. Worked examples are in{" "}
          <ProseLink href="/guides/cgst-sgst-igst">CGST vs SGST vs IGST</ProseLink>.
        </p>
        <p>
          The first two digits of a GSTIN are its state code, so you can read a customer&apos;s
          state straight from their GST number — or let the{" "}
          <ProseLink href="/gstin-checker">GSTIN checker</ProseLink> do it. The{" "}
          <ProseLink href="/invoice?new=1">invoice generator</ProseLink> does the same and picks the
          right tax for you.
        </p>
      </section>
    </ToolPage>
  );
}
