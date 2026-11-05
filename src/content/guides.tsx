import Link from "next/link";
import type { ReactNode } from "react";
import type { Faq } from "@/lib/seo";
import { INDIAN_STATES } from "@/lib/gst/states";

/*
 * Public GST guides. Written answer-first (a direct answer, then a table or
 * list, then FAQs) so search and answer engines can quote them accurately.
 * Rule and section numbers cited are from the CGST Rules, 2017 and the IGST
 * Act, 2017. Rates and turnover thresholds change — the guides point readers
 * to CBIC for current values instead of hard-coding them.
 */

export interface GuideSection {
  id: string;
  heading: string;
  body: ReactNode;
}

export interface Guide {
  slug: string;
  shortTitle: string;
  title: string;
  metaTitle: string;
  description: string;
  keywords: string[];
  /** One-paragraph direct answer shown at the top (and used by answer engines). */
  answer: string;
  sections: GuideSection[];
  faqs: Faq[];
  /** Step list for HowTo structured data, on guides that are a procedure. */
  howTo?: { name: string; text: string }[];
  /** Slugs to show under "Related guides"; defaults to the first three others. */
  related?: string[];
}

const Table = ({ head, rows }: { head: string[]; rows: ReactNode[][] }) => (
  <div className="not-prose my-5 overflow-x-auto rounded-xl border border-border">
    <table className="w-full min-w-[520px] text-left text-sm">
      <thead className="bg-surface-2/70 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <tr>
          {head.map((h) => (
            <th key={h} scope="col" className="px-4 py-3">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((r, i) => (
          <tr key={i} className="align-top">
            {r.map((c, j) => (
              <td key={j} className="px-4 py-3 leading-6">
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const Cta = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-primary underline-offset-4 hover:underline">
    {children}
  </Link>
);

/* ------------------------------------------------------------------ */

const gstInvoiceFormat: Guide = {
  slug: "gst-invoice-format",
  shortTitle: "GST invoice format",
  title: "GST Invoice Format: Mandatory Fields Under Rule 46 (With Checklist)",
  metaTitle: "GST Invoice Format — Mandatory Fields (Rule 46) & Free Template",
  description:
    "What must a GST tax invoice contain? A clear checklist of the mandatory fields under Rule 46 of the CGST Rules, invoice numbering rules, copies, time limits — and a free GST invoice generator.",
  keywords: [
    "GST invoice format",
    "tax invoice format",
    "GST bill format",
    "Rule 46 invoice",
    "mandatory fields in GST invoice",
  ],
  answer:
    "A GST tax invoice must show the supplier's name, address and GSTIN; a unique serial number of up to 16 characters for the financial year; the date; the recipient's name, address and GSTIN (if registered); the HSN or SAC code; a description, quantity and value of the goods or services; the taxable value; the GST rate and amount split into CGST and SGST/UTGST or IGST; the place of supply for inter-state supplies; whether tax is payable on reverse charge; and the supplier's signature. These requirements come from Rule 46 of the CGST Rules, 2017.",
  sections: [
    {
      id: "mandatory-fields",
      heading: "Mandatory fields on a GST tax invoice",
      body: (
        <>
          <p>
            Rule 46 of the CGST Rules, 2017 lists what a registered supplier’s tax invoice must
            contain. In practice that means:
          </p>
          <Table
            head={["Field", "What to show"]}
            rows={[
              ["Supplier details", "Name, address and GSTIN of the supplier."],
              [
                "Invoice number",
                "A consecutive serial number of at most 16 characters (letters, digits, “-” and “/”), unique for the financial year.",
              ],
              ["Invoice date", "Date of issue."],
              ["Recipient details", "Name, address and GSTIN/UIN if the recipient is registered."],
              [
                "Unregistered recipient (₹50,000 or more)",
                "Name and address of the recipient and the delivery address, with the state name and state code.",
              ],
              [
                "HSN / SAC code",
                "HSN code for goods, SAC for services (the number of digits depends on turnover — check the current CBIC notification).",
              ],
              ["Description, quantity, unit", "What was supplied and how much."],
              ["Value", "Total value and the taxable value after discounts."],
              [
                "Tax rate and amount",
                "Rate and amount of CGST and SGST/UTGST, or IGST (and cess, if any).",
              ],
              ["Place of supply", "State name — required for inter-state supplies."],
              ["Delivery address", "If it differs from the place of supply."],
              ["Reverse charge", "Whether tax is payable on reverse charge basis."],
              [
                "Signature",
                "Signature or digital signature of the supplier or an authorised representative.",
              ],
            ]}
          />
          <p>
            A computer-generated invoice can carry a printed name in the signature block. Invoice
            Studio adds every one of these fields — fill them in once in your{" "}
            <Cta href="/invoice?new=1">free GST invoice</Cta> and they’re laid out correctly on
            every template.
          </p>
        </>
      ),
    },
    {
      id: "numbering",
      heading: "Invoice number rules",
      body: (
        <>
          <p>
            The serial number must be <b>unique for a financial year</b> (April–March),{" "}
            <b>consecutive</b>, and <b>no longer than 16 characters</b>. Only letters, digits,
            hyphens (-) and slashes (/) are allowed. You may run more than one series — for example
            one per branch or one for exports.
          </p>
          <ul>
            <li>
              <code>INV/26-27/001</code> — prefix, financial year and running number (12
              characters).
            </li>
            <li>
              <code>EXP-26-27-001</code> — a separate series for export invoices.
            </li>
          </ul>
          <p>
            Invoice Studio lets you set a numbering pattern per document type, including the
            financial year and a running number.
          </p>
        </>
      ),
    },
    {
      id: "time-and-copies",
      heading: "When to issue and how many copies",
      body: (
        <>
          <Table
            head={["", "Goods", "Services"]}
            rows={[
              [
                "When to issue",
                "Before or at the time of removal / delivery of goods.",
                "Within 30 days of supplying the service (Rule 47).",
              ],
              [
                "Copies (Rule 48)",
                "Three: original for recipient, duplicate for transporter, triplicate for supplier.",
                "Two: original for recipient, duplicate for supplier.",
              ],
            ]}
          />
          <p>
            Mark copies as “Original for recipient”, “Duplicate for transporter” and so on when you
            print them.
          </p>
        </>
      ),
    },
    {
      id: "e-invoicing",
      heading: "What about e-invoicing (IRN)?",
      body: (
        <p>
          Businesses whose aggregate turnover is above the notified threshold must also register B2B
          invoices on the Invoice Registration Portal (IRP) to get an IRN and a signed QR code. See{" "}
          <Cta href="/guides/e-invoicing-gst">who needs e-invoicing</Cta> for the current threshold
          and exemptions. Invoice Studio creates regular PDF tax invoices — it does not generate
          IRNs.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "What is the format of a GST invoice?",
      a: "A GST invoice must include the supplier's name, address and GSTIN, a unique invoice number (max 16 characters), date, recipient details, HSN/SAC code, description, quantity, taxable value, GST rate and amount (CGST + SGST/UTGST or IGST), place of supply for inter-state supplies, reverse-charge status and the supplier's signature, as required by Rule 46 of the CGST Rules, 2017.",
    },
    {
      q: "How many characters can a GST invoice number have?",
      a: "At most 16 characters. It can contain letters, digits, hyphens and slashes, must be consecutive, and must be unique for the financial year.",
    },
    {
      q: "Is a signature mandatory on a GST invoice?",
      a: "Yes. A tax invoice must carry the signature or digital signature of the supplier or an authorised representative. Computer-generated invoices commonly show the authorised signatory's name.",
    },
    {
      q: "How many copies of a GST invoice are required?",
      a: "For goods, three copies — original for the recipient, duplicate for the transporter and triplicate for the supplier. For services, two copies — original for the recipient and duplicate for the supplier (Rule 48).",
    },
    {
      q: "What is the time limit to issue a GST invoice for services?",
      a: "A tax invoice for services should be issued within 30 days from the date of supply of the service (Rule 47).",
    },
  ],
};

/* ------------------------------------------------------------------ */

const utgstTerritories = INDIAN_STATES.filter((s) => s.utgst && !s.legacy && s.code !== "97").map(
  (s) => s.name,
);

const cgstSgstIgst: Guide = {
  slug: "cgst-sgst-igst",
  shortTitle: "CGST, SGST & IGST",
  title: "CGST, SGST and IGST: Which GST to Charge on Your Invoice",
  metaTitle: "CGST vs SGST vs IGST — Which GST to Charge (With Examples)",
  description:
    "Intrastate or interstate? Learn when to charge CGST + SGST, when to charge IGST, where UTGST applies, and see worked examples and how state codes decide the tax.",
  keywords: ["CGST SGST IGST", "intrastate vs interstate GST", "UTGST", "place of supply"],
  answer:
    "Charge CGST + SGST when the supplier and the place of supply are in the same state — each is half of the GST rate (for 18%: 9% CGST + 9% SGST). Charge IGST at the full rate when the place of supply is in a different state or outside India. In Union Territories without a legislature, UTGST replaces SGST. The total tax is the same either way; only the split changes.",
  sections: [
    {
      id: "rule",
      heading: "The simple rule",
      body: (
        <Table
          head={["Type of supply", "Tax charged", "Example at 18%"]}
          rows={[
            [
              "Intrastate — supplier and place of supply in the same state",
              "CGST + SGST (half each)",
              "9% CGST + 9% SGST",
            ],
            ["Intrastate in a UT without legislature", "CGST + UTGST", "9% CGST + 9% UTGST"],
            ["Interstate — different states", "IGST (full rate)", "18% IGST"],
            [
              "Exports and supplies to SEZ",
              "Treated as interstate (zero-rated)",
              "IGST paid, or nil under LUT",
            ],
          ]}
        />
      ),
    },
    {
      id: "example",
      heading: "Worked example: ₹10,000 at 18%",
      body: (
        <>
          <Table
            head={["", "Same state (Pune → Mumbai)", "Different state (Pune → Bengaluru)"]}
            rows={[
              ["Taxable value", "₹10,000", "₹10,000"],
              ["CGST", "₹900 (9%)", "—"],
              ["SGST", "₹900 (9%)", "—"],
              ["IGST", "—", "₹1,800 (18%)"],
              [<b key="t">Invoice total</b>, <b key="a">₹11,800</b>, <b key="b">₹11,800</b>],
            ]}
          />
          <p>
            Try it with the <Cta href="/gst-calculator">free GST calculator</Cta>, or let the{" "}
            <Cta href="/invoice?new=1">invoice generator</Cta> pick CGST + SGST or IGST
            automatically from your state and your customer’s state.
          </p>
        </>
      ),
    },
    {
      id: "place-of-supply",
      heading: "How place of supply is decided",
      body: (
        <>
          <p>
            Place of supply rules are in sections 10 to 13 of the IGST Act, 2017. The common cases:
          </p>
          <ul>
            <li>
              <b>Goods:</b> generally where the movement of goods ends for delivery to the
              recipient.
            </li>
            <li>
              <b>Services to a registered business (B2B):</b> generally the recipient’s location
              (their GSTIN state).
            </li>
            <li>
              <b>Services to a consumer (B2C):</b> generally the recipient’s address on record,
              otherwise the supplier’s location.
            </li>
          </ul>
          <p>
            Some services (for example events, transport and immovable property) have special rules,
            so check those cases with your CA.
          </p>
        </>
      ),
    },
    {
      id: "utgst",
      heading: "Where UTGST applies",
      body: (
        <p>
          UTGST replaces SGST in Union Territories without their own legislature:{" "}
          {utgstTerritories.join(", ")}. Delhi, Puducherry and Jammu &amp; Kashmir have
          legislatures, so they use SGST.
        </p>
      ),
    },
    {
      id: "state-codes",
      heading: "GST state codes",
      body: (
        <>
          <p>
            The first two digits of a GSTIN are the state code — 27 is Maharashtra, 29 is Karnataka,
            07 is Delhi. Comparing your state code with the place of supply tells you whether to
            charge CGST + SGST or IGST. Show the place of supply with its state name and code on
            interstate invoices.
          </p>
          <p>
            See the <Cta href="/gst-state-codes">full list of GST state codes</Cta>, including which
            Union Territories charge UTGST and the code for exports. To read the state from a
            customer&apos;s GSTIN, use the <Cta href="/gstin-checker">GSTIN checker</Cta>.
          </p>
        </>
      ),
    },
  ],
  faqs: [
    {
      q: "When should I charge IGST instead of CGST and SGST?",
      a: "Charge IGST when the supplier's location and the place of supply are in different states or Union Territories, and on exports and supplies to SEZ units. Charge CGST + SGST (or UTGST) when both are in the same state.",
    },
    {
      q: "Is IGST equal to CGST plus SGST?",
      a: "Yes. The total tax is the same — for 18% GST, intrastate supplies carry 9% CGST + 9% SGST and interstate supplies carry 18% IGST.",
    },
    {
      q: "What is UTGST?",
      a: "UTGST (Union Territory GST) replaces SGST for intrastate supplies in Union Territories without a legislature, such as Chandigarh, Ladakh, Lakshadweep, Andaman and Nicobar Islands, and Dadra and Nagar Haveli and Daman and Diu.",
    },
    {
      q: "How do I find the state code from a GSTIN?",
      a: "The first two digits of a GSTIN are the state code. For example, 27 is Maharashtra, 29 is Karnataka and 07 is Delhi.",
    },
  ],
};

/* ------------------------------------------------------------------ */

const billOfSupply: Guide = {
  slug: "bill-of-supply",
  shortTitle: "Bill of supply vs tax invoice",
  title: "Bill of Supply vs Tax Invoice: Which One Should You Issue?",
  metaTitle: "Bill of Supply vs Tax Invoice — Format, Rules & Free Generator",
  description:
    "A bill of supply is issued instead of a tax invoice when no GST can be charged — by composition dealers and for exempt supplies. See the differences, the required fields and the declaration text.",
  keywords: [
    "bill of supply",
    "bill of supply format",
    "composition dealer invoice",
    "bill of supply vs tax invoice",
  ],
  answer:
    "Issue a bill of supply when you cannot charge GST: if you are registered under the composition scheme, or when you supply only exempt goods or services. It carries no GST amount, and the buyer cannot claim input tax credit on it. Registered suppliers of taxable goods or services issue a tax invoice instead. Bills of supply are governed by Rule 49 of the CGST Rules, 2017.",
  sections: [
    {
      id: "difference",
      heading: "Bill of supply vs tax invoice at a glance",
      body: (
        <Table
          head={["", "Tax invoice", "Bill of supply"]}
          rows={[
            [
              "Who issues it",
              "Registered supplier of taxable goods or services",
              "Composition taxpayers, and suppliers of exempt goods or services",
            ],
            ["GST charged", "Yes — CGST + SGST/UTGST or IGST", "No"],
            ["Input tax credit for buyer", "Yes (if eligible)", "No"],
            ["Governing rule", "Rule 46", "Rule 49"],
          ]}
        />
      ),
    },
    {
      id: "fields",
      heading: "What a bill of supply must contain",
      body: (
        <ul>
          <li>Supplier’s name, address and GSTIN</li>
          <li>A consecutive serial number (max 16 characters), unique for the financial year</li>
          <li>Date of issue</li>
          <li>Recipient’s name, address and GSTIN/UIN if registered</li>
          <li>HSN code for goods or SAC for services</li>
          <li>Description and value of the goods or services</li>
          <li>Signature or digital signature of the supplier or authorised representative</li>
        </ul>
      ),
    },
    {
      id: "declaration",
      heading: "The composition declaration",
      body: (
        <p>
          Composition taxpayers must mention “
          <b>composition taxable person, not eligible to collect tax on supplies</b>” on their bills
          of supply. Invoice Studio adds this line automatically when you choose{" "}
          <Cta href="/invoice?new=1&type=bill_of_supply">Bill of Supply</Cta> — and you can edit it.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "Who should issue a bill of supply?",
      a: "A registered person under the composition scheme, and a registered person supplying only exempt goods or services, issue a bill of supply instead of a tax invoice.",
    },
    {
      q: "Can I charge GST on a bill of supply?",
      a: "No. A bill of supply does not show or collect GST, and the buyer cannot claim input tax credit on it.",
    },
    {
      q: "What is the difference between a tax invoice and a bill of supply?",
      a: "A tax invoice charges GST and lets an eligible buyer claim input tax credit; a bill of supply is used when no GST can be charged, such as by composition dealers or for exempt supplies.",
    },
  ],
};

/* ------------------------------------------------------------------ */

const exportInvoice: Guide = {
  slug: "export-invoice-lut",
  shortTitle: "Export invoice under LUT",
  title: "Export Invoice Under LUT: Format, Declaration and Currency",
  metaTitle: "Export Invoice Under LUT — Format & Declaration (GST)",
  description:
    "How to make an export invoice for goods or services without paying IGST under a Letter of Undertaking (LUT): the mandatory endorsement, extra fields, foreign currency and a free export invoice generator.",
  keywords: [
    "export invoice format",
    "LUT invoice",
    "export of services invoice",
    "zero rated supply invoice",
    "invoice in USD",
  ],
  answer:
    "Exports are zero-rated under section 16 of the IGST Act. If you have filed a Letter of Undertaking (LUT, Form GST RFD-11) for the financial year, you can export without paying IGST. The invoice must carry the endorsement “Supply meant for export under Letter of Undertaking without payment of integrated tax”, and show the recipient's name and address, the delivery address and the country of destination. You may invoice in a foreign currency such as USD or EUR.",
  sections: [
    {
      id: "options",
      heading: "Two ways to export under GST",
      body: (
        <Table
          head={["Option", "IGST on invoice", "Refund"]}
          rows={[
            ["Under LUT or bond", "No IGST charged", "Claim refund of unutilised input tax credit"],
            ["With payment of IGST", "IGST charged", "Claim refund of the IGST paid"],
          ]}
        />
      ),
    },
    {
      id: "fields",
      heading: "Extra details on an export invoice",
      body: (
        <ul>
          <li>
            The endorsement:{" "}
            <b>
              “Supply meant for export under Letter of Undertaking without payment of integrated
              tax”
            </b>{" "}
            (or “…on payment of integrated tax” if you pay IGST).
          </li>
          <li>Recipient’s name and address</li>
          <li>Address of delivery</li>
          <li>Name of the country of destination</li>
          <li>Your LUT reference number (good practice)</li>
        </ul>
      ),
    },
    {
      id: "services",
      heading: "When is a service an “export of services”?",
      body: (
        <p>
          Under section 2(6) of the IGST Act, the supplier must be in India, the recipient outside
          India, the place of supply outside India, payment received in convertible foreign exchange
          (or in Indian rupees where RBI permits), and the two must not be merely establishments of
          the same person.
        </p>
      ),
    },
    {
      id: "make-one",
      heading: "Create an export invoice in minutes",
      body: (
        <p>
          Choose <Cta href="/invoice?new=1&type=export">Export Invoice</Cta>, pick the currency, and
          add your LUT number in Settings → Invoice defaults. The declaration and SWIFT code from
          your bank details are added for you.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "Do I charge GST on export invoices?",
      a: "Not if you export under a Letter of Undertaking (LUT). Exports are zero-rated, so with a valid LUT you can export goods or services without paying IGST. Alternatively you can pay IGST and claim a refund.",
    },
    {
      q: "What declaration is required on an export invoice under LUT?",
      a: "The invoice must carry the endorsement “Supply meant for export under Letter of Undertaking without payment of integrated tax”, along with the recipient's name and address, the delivery address and the country of destination.",
    },
    {
      q: "Can I make an invoice in USD or another foreign currency?",
      a: "Yes. Export invoices can be raised in a foreign currency. For GST returns, the value is converted to Indian rupees at the applicable exchange rate.",
    },
    {
      q: "How do I get an LUT?",
      a: "File Form GST RFD-11 on the GST portal. An LUT is valid for the financial year in which it is furnished.",
    },
  ],
};

/* ------------------------------------------------------------------ */

const proforma: Guide = {
  slug: "proforma-invoice",
  shortTitle: "Proforma invoice vs tax invoice",
  title: "Proforma Invoice vs Tax Invoice (and Quotation): What's the Difference?",
  metaTitle: "Proforma Invoice vs Tax Invoice vs Quotation — Format & Uses",
  description:
    "A proforma invoice is a preliminary bill sent before a sale — it is not a GST tax invoice. Learn how it differs from a tax invoice and a quotation, when to use each, and how to convert one into the other.",
  keywords: [
    "proforma invoice",
    "proforma invoice format",
    "quotation format",
    "estimate format",
    "proforma vs tax invoice",
  ],
  answer:
    "A proforma invoice is a preliminary bill that tells the buyer what they will be charged before the sale happens — for advance payments, approvals or import paperwork. It is not a GST tax invoice: it creates no GST liability and the buyer cannot claim input tax credit on it. Once the goods or services are supplied, you issue a tax invoice. A quotation (or estimate) is an earlier, non-binding price offer.",
  sections: [
    {
      id: "comparison",
      heading: "Quotation vs proforma invoice vs tax invoice",
      body: (
        <Table
          head={["", "Quotation / estimate", "Proforma invoice", "Tax invoice"]}
          rows={[
            ["Purpose", "Price offer", "Advance bill / commitment", "Final bill for the supply"],
            ["When", "Before the order", "After agreement, before supply", "At or after supply"],
            ["GST liability", "No", "No", "Yes"],
            ["Input tax credit", "No", "No", "Yes (if eligible)"],
            ["Recorded in accounts", "No", "No", "Yes"],
          ]}
        />
      ),
    },
    {
      id: "convert",
      heading: "Convert a quotation into a tax invoice",
      body: (
        <p>
          In Invoice Studio, create a{" "}
          <Cta href="/invoice?new=1&type=proforma">quotation or proforma invoice</Cta>, and when the
          customer confirms, use <b>Convert to tax invoice</b>. The customer, items and prices are
          copied into a new tax invoice with its own number — nothing is retyped.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "Is a proforma invoice valid under GST?",
      a: "A proforma invoice is not a tax invoice under GST. It creates no tax liability and cannot be used to claim input tax credit. Issue a tax invoice when the supply happens.",
    },
    {
      q: "What is the difference between a quotation and a proforma invoice?",
      a: "A quotation is a non-binding price offer made before the order. A proforma invoice is sent after the buyer agrees, often to request an advance payment, and lists the final terms before the actual tax invoice is issued.",
    },
    {
      q: "Can I convert a proforma invoice into a tax invoice?",
      a: "Yes. Issue a new tax invoice with its own invoice number when the goods or services are supplied. Invoice Studio converts a quotation into a tax invoice in one click.",
    },
  ],
};

/* ------------------------------------------------------------------ */

const howToMake: Guide = {
  slug: "how-to-make-gst-invoice",
  shortTitle: "How to make a GST invoice",
  title: "How to Make a GST Invoice Online: Free, Step by Step",
  metaTitle: "How to Make a GST Invoice Online — Free Step-by-Step Guide",
  description:
    "Make a GST bill in a few minutes: add your business and customer, list items with HSN/SAC codes and GST rates, check the CGST/SGST or IGST split, and download a PDF. Free, no sign-up.",
  keywords: [
    "how to make GST invoice",
    "how to create GST bill",
    "make GST invoice online",
    "GST bill maker",
    "create tax invoice online free",
  ],
  answer:
    "To make a GST invoice: enter your business name, address and GSTIN; add the customer's name, address and GSTIN; list each item with its HSN or SAC code, quantity, price and GST rate; check the tax split — CGST + SGST if you and the customer's place of supply are in the same state, IGST if not; then give it a unique invoice number and date and download it as a PDF. A free GST invoice generator does the calculations and layout for you.",
  howTo: [
    {
      name: "Add your business details",
      text: "Enter your business name, address, state and GSTIN. These appear in the supplier block of every invoice.",
    },
    {
      name: "Add the customer",
      text: "Enter the customer's name and address, and their GSTIN if they are registered. The first two digits of the GSTIN give their state.",
    },
    {
      name: "List the items",
      text: "Add each product or service with its HSN or SAC code, quantity, unit price and GST rate.",
    },
    {
      name: "Check the tax",
      text: "Same state: CGST + SGST, each half the rate. Different state: IGST at the full rate. Check discounts and the total.",
    },
    {
      name: "Number, date and download",
      text: "Give the invoice a unique, consecutive number and the date of issue, then download the PDF and send it to the customer.",
    },
  ],
  sections: [
    {
      id: "before-you-start",
      heading: "What you need before you start",
      body: (
        <ul>
          <li>Your GSTIN, registered business name and address.</li>
          <li>The customer&apos;s name and address — and their GSTIN if they are registered.</li>
          <li>
            The HSN code (goods) or SAC code (services) and GST rate for each item. Your CA or the
            CBIC rate notifications have these.
          </li>
          <li>Your bank account or UPI ID, so the customer knows how to pay.</li>
        </ul>
      ),
    },
    {
      id: "steps",
      heading: "Make the invoice in five steps",
      body: (
        <>
          <ol>
            <li>
              <b>Add your business details.</b> Name, address, state and GSTIN. In the{" "}
              <Cta href="/invoice?new=1">free invoice generator</Cta> you enter these once and they
              are remembered for every invoice.
            </li>
            <li>
              <b>Add the customer.</b> For a registered customer, enter their GSTIN — its first two
              digits are the state code, which decides the tax. Not sure a GSTIN is typed correctly?
              Run it through the <Cta href="/gstin-checker">GSTIN checker</Cta>.
            </li>
            <li>
              <b>List the items.</b> For each line: description, HSN/SAC code, quantity, unit, price
              and GST rate. Add a discount per line or on the whole invoice if needed.
            </li>
            <li>
              <b>Check the tax split.</b> If your state and the place of supply match, the invoice
              shows CGST + SGST (or UTGST), each half the rate. If they differ, it shows IGST at the
              full rate. The <Cta href="/gst-calculator">GST calculator</Cta> shows the same split
              for a single amount.
            </li>
            <li>
              <b>Number, date and download.</b> Use a unique, consecutive number of at most 16
              characters, such as <code>INV/26-27/001</code>. Download the PDF and send it by email
              or WhatsApp.
            </li>
          </ol>
        </>
      ),
    },
    {
      id: "before-sending",
      heading: "Check these before you send it",
      body: (
        <>
          <ul>
            <li>The invoice number hasn&apos;t been used before in this financial year.</li>
            <li>The place of supply is shown for interstate supplies.</li>
            <li>It says whether tax is payable on reverse charge.</li>
            <li>It carries your signature or an authorised signatory&apos;s name.</li>
          </ul>
          <p>
            The full list of mandatory fields is in the{" "}
            <Cta href="/guides/gst-invoice-format">GST invoice format guide</Cta>.
          </p>
        </>
      ),
    },
    {
      id: "not-registered",
      heading: "Not registered under GST?",
      body: (
        <p>
          Only registered businesses can charge GST or issue a tax invoice. If you are not
          registered, issue an <Cta href="/invoice?new=1&type=invoice">invoice without GST</Cta>. If
          you are under the composition scheme or supply only exempt goods or services, issue a{" "}
          <Cta href="/guides/bill-of-supply">bill of supply</Cta> instead.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "Can I make a GST invoice without a GSTIN?",
      a: "No. Only a business registered under GST can charge GST and issue a tax invoice. If you are not registered, issue a regular invoice without any GST.",
    },
    {
      q: "Can I make a GST invoice on my phone?",
      a: "Yes. Invoice Studio works in any mobile browser, needs no app download or sign-up, and saves the invoice as a PDF you can share on WhatsApp or email.",
    },
    {
      q: "Is an invoice made with a free online generator valid?",
      a: "Yes, as long as it contains the particulars required by Rule 46 of the CGST Rules. The tool you use doesn't matter. Businesses covered by e-invoicing must additionally register B2B invoices on the Invoice Registration Portal to get an IRN.",
    },
    {
      q: "How do I calculate GST on an invoice?",
      a: "Multiply each line's taxable value by its GST rate. For a same-state sale, split the tax equally into CGST and SGST; for an interstate sale, charge it all as IGST. For ₹10,000 at 18%, that's ₹900 CGST + ₹900 SGST, or ₹1,800 IGST.",
    },
  ],
  related: ["gst-invoice-format", "cgst-sgst-igst", "freelancer-invoice-india"],
};

/* ------------------------------------------------------------------ */

const freelancer: Guide = {
  slug: "freelancer-invoice-india",
  shortTitle: "Freelancer & service invoice",
  title:
    "Invoices for Freelancers and Service Providers in India: With GST, Without GST and for Foreign Clients",
  metaTitle: "Freelancer Invoice Format (India) — With or Without GST, Foreign Clients",
  description:
    "Which invoice should a freelancer or consultant in India issue? When you need GST registration, what a service invoice must show, which SAC code to use, and how to bill foreign clients under an LUT.",
  keywords: [
    "freelancer invoice India",
    "invoice format for services",
    "service invoice format",
    "consultant invoice format",
    "freelancer GST invoice",
    "invoice for foreign client India",
  ],
  answer:
    "It depends on whether you are registered under GST. While your aggregate turnover stays within ₹20 lakh a year (₹10 lakh in special category states), you don't have to register, and you issue a plain invoice with no GST. Once registered, you issue a GST tax invoice with your GSTIN, the SAC code for your service and CGST + SGST or IGST. For clients outside India, issue an export invoice: with a Letter of Undertaking (LUT) you charge no GST, and you can bill in USD or another currency.",
  sections: [
    {
      id: "which-invoice",
      heading: "Which invoice to issue",
      body: (
        <Table
          head={["Your situation", "Issue", "GST on the invoice"]}
          rows={[
            ["Not registered under GST", "Invoice (without GST)", "None"],
            ["Registered — client in your state", "Tax invoice", "CGST + SGST"],
            ["Registered — client in another state", "Tax invoice", "IGST"],
            [
              "Registered — client outside India",
              "Export invoice",
              "None under an LUT (zero-rated), or IGST paid and refunded",
            ],
          ]}
        />
      ),
    },
    {
      id: "registration",
      heading: "When freelancers need GST registration",
      body: (
        <>
          <p>
            Service providers must register once their aggregate turnover in a financial year goes
            above <b>₹20 lakh</b>, or <b>₹10 lakh</b> in the special category states. These are the
            limits at the time of review; check the GST portal for current figures. Aggregate
            turnover counts all your taxable, exempt and export supplies across India.
          </p>
          <p>
            Working for clients in other states doesn&apos;t force you to register while you stay
            within the limit — small service providers making interstate supplies are exempt from
            compulsory registration. You can also register voluntarily, for example if business
            clients ask for a GST invoice so that they can claim input tax credit.
          </p>
        </>
      ),
    },
    {
      id: "what-to-include",
      heading: "What a service invoice should show",
      body: (
        <>
          <ul>
            <li>Your name or business name, address, and GSTIN if registered.</li>
            <li>The client&apos;s name, address, and GSTIN if they are registered.</li>
            <li>A unique invoice number and the date.</li>
            <li>
              A clear description of the work and the period — for example &ldquo;UI design, 1–31
              October&rdquo; — with hours × rate or a fixed fee.
            </li>
            <li>
              The SAC code of the service. SAC codes start with 99 — for example 998314 for IT
              design and development services.
            </li>
            <li>The GST rate and amount, if registered.</li>
            <li>Payment terms, due date, and your bank or UPI details.</li>
          </ul>
          <p>
            A registered service provider must issue the tax invoice within 30 days of supplying the
            service. The <Cta href="/invoice?new=1">invoice generator</Cta> has a <b>Service</b>{" "}
            template built for hourly and project billing, and can add a UPI QR code for the amount
            due.
          </p>
        </>
      ),
    },
    {
      id: "foreign-clients",
      heading: "Billing clients outside India",
      body: (
        <>
          <p>
            Services to a client abroad are usually an export of services, which is zero-rated. File
            a Letter of Undertaking (Form GST RFD-11) on the GST portal for each financial year, and
            you can invoice without charging IGST. The invoice must carry the line &ldquo;Supply
            meant for export under Letter of Undertaking without payment of integrated tax&rdquo;.
          </p>
          <p>
            For it to count as an export, the payment must generally come in convertible foreign
            exchange (or in rupees where the RBI permits). You can invoice in USD, EUR or GBP —
            create an <Cta href="/invoice?new=1&type=export">export invoice</Cta>, or read the{" "}
            <Cta href="/guides/export-invoice-lut">export invoice under LUT</Cta> guide.
          </p>
        </>
      ),
    },
  ],
  faqs: [
    {
      q: "Do freelancers in India need GST registration?",
      a: "Only once aggregate turnover crosses ₹20 lakh in a financial year (₹10 lakh in special category states), at the time of review. Below that, registration is optional, even if your clients are in other states.",
    },
    {
      q: "Can a freelancer issue an invoice without GST?",
      a: "Yes. If you are not registered under GST, issue a regular invoice with no GST and no GSTIN. You must not charge GST unless you are registered.",
    },
    {
      q: "Do I charge GST to a foreign client?",
      a: "Not if the service qualifies as an export and you have filed an LUT — the supply is zero-rated and the invoice carries the LUT declaration instead of IGST. Without an LUT, you pay IGST and claim a refund.",
    },
    {
      q: "Which SAC code should a freelancer use?",
      a: "The one that matches your service. All SAC codes start with 99; for example, 998314 covers IT design and development services. Check the CBIC SAC list or ask your CA for your exact service.",
    },
    {
      q: "Can I make an invoice in USD?",
      a: "Yes. Export invoices can be in a foreign currency such as USD, EUR or GBP. Invoice Studio supports multi-currency export invoices with the LUT declaration.",
    },
  ],
  related: ["export-invoice-lut", "how-to-make-gst-invoice", "gst-invoice-format"],
};

/* ------------------------------------------------------------------ */

const creditDebitNote: Guide = {
  slug: "credit-note-debit-note",
  shortTitle: "Credit note & debit note",
  title: "Credit Note and Debit Note Under GST: When to Issue, Format and Time Limit",
  metaTitle: "GST Credit Note & Debit Note — Format, Rules and Time Limit",
  description:
    "When to issue a credit note or a debit note under GST, what each must contain under Rule 53, how to number them, and the time limit for declaring a credit note in your return.",
  keywords: [
    "credit note format GST",
    "debit note format GST",
    "credit note under GST",
    "debit note vs credit note",
    "section 34 GST",
  ],
  answer:
    "Issue a credit note when the value or tax on an invoice you've already issued must come down — goods returned, a price cut after billing, or tax charged too high. Issue a debit note (also called a supplementary invoice) when it must go up. Both fall under section 34 of the CGST Act and must show the details in Rule 53(1A), including the number and date of the original invoice. Declare a credit note in your return no later than 30 November after the end of the financial year of the original supply, or the date you file the annual return, if earlier.",
  sections: [
    {
      id: "credit-vs-debit",
      heading: "Credit note vs debit note",
      body: (
        <Table
          head={["", "Credit note", "Debit note"]}
          rows={[
            ["Effect", "Reduces the value or tax charged", "Increases the value or tax charged"],
            [
              "Typical reasons",
              "Goods returned, price reduced, tax charged too high, services found deficient",
              "Value under-billed, price raised after billing, tax charged too low",
            ],
            ["Issued by", "The supplier", "The supplier"],
            ["Supplier's tax", "Goes down", "Goes up"],
          ]}
        />
      ),
    },
    {
      id: "format",
      heading: "What a credit or debit note must contain",
      body: (
        <>
          <p>Rule 53(1A) of the CGST Rules lists the particulars:</p>
          <ol>
            <li>Name, address and GSTIN of the supplier.</li>
            <li>
              The nature of the document — &ldquo;Credit note&rdquo; or &ldquo;Debit note&rdquo;.
            </li>
            <li>
              A consecutive serial number of at most 16 characters, unique for the financial year.
            </li>
            <li>Date of issue.</li>
            <li>Name, address and GSTIN/UIN of the recipient, if registered.</li>
            <li>
              For an unregistered recipient: name, address and delivery address, with the state name
              and state code.
            </li>
            <li>Serial number and date of the original tax invoice or bill of supply.</li>
            <li>The taxable value, the tax rate, and the tax credited or debited.</li>
            <li>Signature or digital signature of the supplier or an authorised representative.</li>
          </ol>
          <p>
            Most businesses run a separate number series, such as <code>CN/26-27/001</code> for
            credit notes and <code>DN/26-27/001</code> for debit notes.
          </p>
        </>
      ),
    },
    {
      id: "time-limit",
      heading: "Time limits",
      body: (
        <>
          <p>
            <b>Credit note:</b> declare it in your return no later than <b>30 November</b> following
            the end of the financial year in which the original supply was made, or the date you
            file the annual return for that year, whichever is earlier. After that, you can&apos;t
            reduce your tax liability with it.
          </p>
          <p>
            <b>Debit note:</b> declare it in the return for the month in which you issue it.
          </p>
          <p>
            If your business is covered by <Cta href="/guides/e-invoicing-gst">e-invoicing</Cta>,
            credit and debit notes to registered buyers need an IRN too.
          </p>
        </>
      ),
    },
    {
      id: "invoice-studio",
      heading: "Credit notes in Invoice Studio",
      body: (
        <p>
          Invoice Studio does not create credit or debit notes yet — issue them from your accounting
          software or with your CA. You can still create the original{" "}
          <Cta href="/invoice?new=1">GST tax invoice</Cta> here, and its number and date are what
          the credit note must refer to.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "What is the difference between a credit note and a debit note?",
      a: "A credit note reduces the value or tax of an invoice already issued — for returns, price cuts or excess tax. A debit note increases it — for price increases or tax charged too low. Both are issued by the supplier under section 34 of the CGST Act.",
    },
    {
      q: "What is the time limit to issue a credit note under GST?",
      a: "It must be declared in a return no later than 30 November after the end of the financial year of the original supply, or the date of filing the annual return for that year, whichever is earlier.",
    },
    {
      q: "Must a credit note mention the original invoice?",
      a: "Yes. Rule 53(1A) requires the serial number and date of the corresponding tax invoice or bill of supply.",
    },
    {
      q: "Can a credit note be issued without adjusting GST?",
      a: "Yes. A commercial or financial credit note — for example for a discount that doesn't meet the conditions for reducing the taxable value — can be issued without changing the GST. Neither side adjusts tax or input tax credit for it.",
    },
  ],
  related: ["gst-invoice-format", "e-invoicing-gst", "how-to-make-gst-invoice"],
};

/* ------------------------------------------------------------------ */

const EINVOICE_PORTAL = "https://einvoice1.gst.gov.in";

const eInvoicing: Guide = {
  slug: "e-invoicing-gst",
  shortTitle: "E-invoicing (IRN)",
  title: "E-Invoicing Under GST: Who Needs It, the Turnover Limit and How IRN Works",
  metaTitle: "GST E-Invoicing — Applicability, Turnover Limit and IRN Explained",
  description:
    "Who must issue e-invoices under GST, the ₹5 crore turnover limit, which businesses are exempt, how the IRN and QR code work, and the 30-day reporting rule for businesses over ₹10 crore.",
  keywords: [
    "e-invoice under GST",
    "e-invoicing applicability",
    "e-invoice turnover limit",
    "IRN GST",
    "e-invoice limit",
  ],
  answer:
    "E-invoicing means reporting B2B invoices to the government's Invoice Registration Portal (IRP), which returns an Invoice Reference Number (IRN) and a signed QR code for the invoice. At the time of review it applies to businesses whose aggregate turnover exceeded ₹5 crore in any financial year from 2017-18 onwards — for B2B supplies, exports and credit and debit notes, but not for sales to consumers. Businesses with turnover of ₹10 crore or more must report each invoice within 30 days of its date. Some sectors, such as banks, insurers, SEZ units and goods transport agencies, are exempt.",
  sections: [
    {
      id: "who",
      heading: "Who has to issue e-invoices",
      body: (
        <>
          <p>
            A business must issue e-invoices if its aggregate turnover crossed{" "}
            <b>₹5 crore in any financial year since 2017-18</b> — the limit at the time of review.
            Once you cross it in any year, the requirement stays even if turnover later falls. Check
            the current limit on the <a href={EINVOICE_PORTAL}>e-invoice portal</a>.
          </p>
          <Table
            head={["Covered", "Not covered"]}
            rows={[
              ["Tax invoices to registered businesses (B2B)", "Sales to consumers (B2C)"],
              ["Exports", "Businesses under the turnover limit"],
              ["Credit and debit notes to registered buyers", "Exempt sectors (below)"],
            ]}
          />
          <p>
            Exempt regardless of turnover: SEZ units, insurance companies, banks and financial
            institutions (including NBFCs), goods transport agencies, passenger transport services,
            cinema admission tickets, and government departments and local authorities.
          </p>
        </>
      ),
    },
    {
      id: "how-irn-works",
      heading: "How the IRN and QR code work",
      body: (
        <ol>
          <li>You create the invoice in your billing or accounting software as usual.</li>
          <li>Its details are uploaded to the Invoice Registration Portal (IRP).</li>
          <li>
            The IRP validates it and returns a unique Invoice Reference Number (IRN) and a digitally
            signed QR code.
          </li>
          <li>You print the QR code on the invoice and send it to the buyer.</li>
          <li>The details flow on to your GSTR-1 and, if needed, to the e-way bill.</li>
        </ol>
      ),
    },
    {
      id: "30-day-rule",
      heading: "The 30-day reporting rule",
      body: (
        <p>
          Since 1 April 2025, businesses with aggregate turnover of <b>₹10 crore or more</b> cannot
          report an invoice to the IRP more than 30 days after the invoice date — the portal rejects
          it. An invoice dated 1 April must be reported by 30 April. The rule applies to invoices,
          credit notes and debit notes.
        </p>
      ),
    },
    {
      id: "below-limit",
      heading: "If you're below the limit",
      body: (
        <p>
          You don&apos;t need an IRN — a regular GST tax invoice with all the{" "}
          <Cta href="/guides/gst-invoice-format">Rule 46 fields</Cta> is enough. That&apos;s what
          Invoice Studio creates: a <Cta href="/invoice?new=1">free PDF tax invoice</Cta>. It does
          not generate IRNs, so once e-invoicing applies to you, use software connected to the IRP.
        </p>
      ),
    },
  ],
  faqs: [
    {
      q: "Is e-invoicing mandatory for businesses with turnover above ₹5 crore?",
      a: "Yes, at the time of review: e-invoicing applies if aggregate turnover exceeded ₹5 crore in any financial year from 2017-18 onwards, unless your sector is exempt. Check the e-invoice portal for the current limit.",
    },
    {
      q: "Does e-invoicing apply to B2C sales?",
      a: "No. E-invoicing covers supplies to registered businesses, exports, and credit and debit notes to registered buyers. Invoices to consumers don't need an IRN.",
    },
    {
      q: "What happens if a covered business issues an invoice without an IRN?",
      a: "For a business covered by e-invoicing, an invoice issued without following the e-invoicing process is not treated as a valid tax invoice, which can also block the buyer's input tax credit.",
    },
    {
      q: "Do I need e-invoicing if my turnover is below ₹5 crore?",
      a: "No. Issue regular GST tax invoices. You can make them free with an online GST invoice generator.",
    },
  ],
  related: ["gst-invoice-format", "credit-note-debit-note", "how-to-make-gst-invoice"],
};

export const GUIDES: Guide[] = [
  howToMake,
  gstInvoiceFormat,
  cgstSgstIgst,
  freelancer,
  billOfSupply,
  exportInvoice,
  proforma,
  creditDebitNote,
  eInvoicing,
];

export function getGuide(slug: string) {
  return GUIDES.find((g) => g.slug === slug);
}
