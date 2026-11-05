/**
 * Free public tools. One list feeds the sitemap, llms.txt, footer, homepage
 * and the "More free tools" links on each tool page, so a new tool only
 * needs an entry here plus its route.
 */
export interface Tool {
  path: string;
  name: string;
  description: string;
}

export const TOOLS: Tool[] = [
  {
    path: "/gst-calculator",
    name: "GST calculator",
    description: "Add or remove GST and see the CGST/SGST/IGST split.",
  },
  {
    path: "/gstin-checker",
    name: "GSTIN checker",
    description: "Check a GSTIN's format and check digit, and see its state and PAN.",
  },
  {
    path: "/amount-in-words",
    name: "Amount in words",
    description: "Convert rupees to words in lakh and crore, as printed on invoices.",
  },
  {
    path: "/gst-state-codes",
    name: "GST state codes",
    description: "Every GST state and UT code for GSTINs and place of supply.",
  },
];
