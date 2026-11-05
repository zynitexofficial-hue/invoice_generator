import { addDaysISO, todayISO } from "@/lib/dates";
import { invoiceSchema, type AppSettings, type InvoiceDesign, type Invoice } from "@/lib/schema";

/** A realistic demo document used for template thumbnails and the design studio. */
export function sampleInvoice(settings: AppSettings, design: InvoiceDesign): Invoice {
  const hasProfile = Boolean(settings.profile.name.trim());
  const today = todayISO();
  return invoiceSchema.parse({
    id: "sample",
    docType: "tax_invoice",
    docTitle: "Tax Invoice",
    number: "INV/26-27/042",
    invoiceDate: today,
    dueDate: addDaysISO(today, 15),
    currency: "INR",
    referenceNo: "Website revamp",
    seller: hasProfile
      ? settings.profile
      : {
          name: "Northwind Studio",
          address: "4th Floor, Lotus Business Park\nAndheri East, Mumbai 400069",
          stateCode: "27",
          gstin: "27AAPFU0939F1ZV",
          email: "hello@northwind.studio",
          phone: "+91 98200 12345",
          bank: {
            accountName: "Northwind Studio",
            accountNumber: "50200012345678",
            ifsc: "HDFC0001234",
            bankName: "HDFC Bank",
            branch: "Andheri East",
          },
          upiId: "northwind@okhdfcbank",
          upiName: "Northwind Studio",
          signatoryName: "Aarav Mehta",
        },
    customer: {
      name: "Priya Sharma",
      company: "Acme Technologies Pvt Ltd",
      billingAddress: "12, MG Road\nBengaluru, Karnataka 560001",
      stateCode: "29",
      country: "India",
      gstin: "29AAACA1234A1ZS",
      email: "accounts@acme.example",
    },
    lines: [
      {
        id: "l1",
        name: "UX research & wireframes",
        description: "Stakeholder interviews, journey maps and low-fidelity wireframes.",
        hsnSac: "998314",
        quantity: "1",
        unit: "job",
        unitPrice: "35000",
        gstRate: "18",
      },
      {
        id: "l2",
        name: "UI design system",
        description: "Components, tokens and responsive layouts for 12 screens.",
        hsnSac: "998314",
        quantity: "1",
        unit: "job",
        unitPrice: "60000",
        gstRate: "18",
      },
      {
        id: "l3",
        name: "Front-end development",
        hsnSac: "998314",
        quantity: "48",
        unit: "hrs",
        unitPrice: "1800",
        gstRate: "18",
        discount: { kind: "percent", value: "10" },
      },
      {
        id: "l4",
        name: "Hosting & maintenance",
        hsnSac: "998315",
        quantity: "12",
        unit: "months",
        unitPrice: "1500",
        gstRate: "18",
      },
    ],
    gstMode: "split",
    roundOff: true,
    payment: { amountReceived: "50000", mode: "upi", date: today },
    notes: "Thank you for your business!",
    terms: "Payment due within 15 days. Late payments may attract 1.5% interest per month.",
    paymentInstructions: "Please mention the invoice number in the payment reference.",
    footer: "This is a computer-generated invoice.",
    design,
  });
}
