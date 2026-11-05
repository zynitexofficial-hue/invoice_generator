/** Test fixtures for analytics tests (not part of the public API). */
import { computeExpenseSummary } from "@/lib/expense-calc";
import {
  expenseSchema,
  incomeSchema,
  invoiceSchema,
  type Expense,
  type Income,
  type Invoice,
} from "@/lib/schema";
import { prepareAnalytics } from "./base";

export const SELLER_STATE = "27"; // Maharashtra

let seq = 0;

export interface InvOpts {
  id?: string;
  number?: string;
  docType?: Invoice["docType"];
  date?: string;
  due?: string;
  amount?: string;
  rate?: string;
  qty?: string;
  hsn?: string;
  item?: string;
  state?: string;
  gstin?: string;
  customer?: string;
  customerId?: string;
  currency?: string;
  exchangeRate?: string;
  exportType?: "" | "wpay" | "wopay";
  country?: string;
  received?: string;
  issued?: boolean;
  status?: Invoice["status"];
  gstMode?: Invoice["gstMode"];
  lines?: { amount: string; rate?: string; hsn?: string; item?: string; qty?: string }[];
}

export function inv(o: InvOpts = {}): Invoice {
  seq++;
  const lines = (
    o.lines ?? [{ amount: o.amount ?? "1000", rate: o.rate, hsn: o.hsn, item: o.item, qty: o.qty }]
  ).map((l, i) => ({
    id: `l${seq}-${i}`,
    name: l.item ?? "Widget",
    hsnSac: l.hsn ?? "8471",
    quantity: l.qty ?? "1",
    unitPrice: l.amount,
    gstRate: l.rate ?? o.rate ?? "18",
  }));
  return invoiceSchema.parse({
    id: o.id ?? `inv${seq}`,
    number: o.number ?? `INV-${String(seq).padStart(3, "0")}`,
    docType: o.docType ?? "tax_invoice",
    invoiceDate: o.date ?? "2026-10-10",
    dueDate: o.due ?? "",
    currency: o.currency ?? "INR",
    seller: { stateCode: SELLER_STATE, name: "Seller" },
    customer: {
      name: o.customer ?? "Acme",
      customerId: o.customerId ?? o.customer ?? "acme",
      stateCode: o.state ?? SELLER_STATE,
      gstin: o.gstin ?? "",
      country: o.country ?? "India",
    },
    lines,
    roundOff: false,
    payment: { amountReceived: o.received ?? "" },
    issuedAt: o.issued === false ? "" : "2026-10-10T10:00:00.000Z",
    status: o.status ?? "active",
    gstMode: o.gstMode ?? "split",
    exportDetails: { type: o.exportType ?? "", exchangeRate: o.exchangeRate ?? "" },
  });
}

export interface ExpOpts {
  id?: string;
  date?: string;
  amount?: string;
  rate?: string;
  mode?: Expense["gstMode"];
  itc?: boolean;
  rcm?: boolean;
  category?: string;
  includesGst?: boolean;
}

export function exp(o: ExpOpts = {}): Expense {
  seq++;
  const base = {
    id: o.id ?? `exp${seq}`,
    date: o.date ?? "2026-10-12",
    vendorName: "Vendor",
    category: o.category ?? "Rent",
    amount: o.amount ?? "1000",
    amountIncludesGst: o.includesGst ?? false,
    gstRate: o.rate ?? "18",
    gstMode: o.mode ?? "intra",
    itcEligible: o.itc ?? true,
    reverseCharge: o.rcm ?? false,
  };
  return expenseSchema.parse({ ...base, summary: computeExpenseSummary(base) });
}

export function income(amount: string, date = "2026-10-15", category = "Interest"): Income {
  seq++;
  return incomeSchema.parse({ id: `inc${seq}`, date, source: "Bank", category, amount });
}

export function data(invoices: Invoice[] = [], expenses: Expense[] = [], incomes: Income[] = []) {
  return prepareAnalytics({ invoices, expenses, incomes, sellerState: SELLER_STATE });
}
