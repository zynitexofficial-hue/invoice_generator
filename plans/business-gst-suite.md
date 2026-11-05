# Business & GST Suite — Research and Implementation Plan

**Status:** Phase 1 is implemented on the `dev` branch (unit-tested; not yet merged to `main`, and GST output not yet checked against real returns). Phases 2–4 are not started. Sections 1–12 are the original 5 Nov 2026 proposal, kept for the reasoning; the feature gap matrix (§3.4) shows current status.  
**Date:** 5 November 2026  
**Product constraint:** Static Next.js export, IndexedDB only, no backend, no login, no cloud, privacy-first  
**Hard rule:** Everything runs inside the user's browser. There are no API routes, no server actions, no background jobs, and no calls to GSTN, IRP, or any third party. Exports are downloaded to the user's machine; the user uploads them to the relevant portal manually.  
**Decision already made:** Filing will be **export files + a filing tracker**, not direct GSTN submission. E-invoicing will be **bulk JSON export**, not direct IRP integration.

---

## 1. Recommendation in one page

The app is already a strong invoice generator. It is not yet a small-business finance tool.

A business needs four connected loops:

1. **Sell** — quote → invoice → payment → receipt.
2. **Spend** — expense/purchase → payment → input tax credit (ITC).
3. **File** — GSTR-1 → GSTR-3B → annual return.
4. **Understand** — profit, cash, receivables, payables, GST, trends, and actionable analytics.

The recommended product is a **Business + GST Filing Kit**, not a full ERP:

- **Phase 1:** expenses, other income, dashboard, analytics, GSTR-1 export, GSTR-3B outward/ITC worksheet, filing tracker, registers.
- **Phase 2:** credit/debit notes, amendments, e-invoice bulk JSON, payment history.
- **Phase 3:** purchases/vendor master, GSTR-2B/IMS reconciliation, full GSTR-3B.
- **Phase 4:** GSTR-9/9C worksheet and a tax pack for a CA.

**No backend phase.** Direct GSTN/IRP filing, cloud sync, team collaboration, and payment reminders are explicitly out of scope. They require a server, credentials, and compliance operations, which would break the local-only design.

### How filing works without a backend

1. The user selects a return period.
2. The app reads invoices and expenses from IndexedDB.
3. The return engine validates and aggregates the data in the browser.
4. The user downloads a GSTR-1 JSON/CSV file, a GSTR-3B worksheet, or an e-invoice bulk JSON file.
5. The user uploads the file to the GST/e-invoice portal, or sends it to their CA.
6. The user enters the ARN/filing date back in the app, or imports the portal acknowledgement.
7. The app stores a local snapshot so it can warn if the data changes later.

No step sends the data anywhere. The only copy that leaves the machine is the file the user explicitly downloads.

**Not in scope:** Income Tax Return filing, full double-entry accounting, payroll, inventory, bank reconciliation, e-way bill, multi-GSTIN, multi-user, direct filing, cloud sync. Those are separate products or much larger changes.

The rest of this document explains the research, the feature gaps, and the Phase 1 design.

---

## 2. What the app already has

| Area | Already implemented |
|---|---|
| Sales documents | Tax invoice, invoice without GST, bill of supply, proforma/quotation, export invoice |
| GST calculation | CGST/SGST/UTGST/IGST, place of supply, intra/inter-state, inclusive/exclusive pricing, invoice-level discount, round-off |
| Parties | Seller profile, customer master, item master, GSTIN capture, state codes |
| Output | Six templates, design customisation, print/PDF, amount in words, UPI QR |
| Workflow | Autosave, history, duplicate, convert quotation, payment received/balance due, record payment |
| Data | IndexedDB, backup/restore, single-invoice file export/import, PIN lock |
| Helpers | GSTIN checksum, state codes, HSN/SAC capture, number patterns |

**What is missing for a business:** expenses, other income, credit/debit notes, invoice cancellation, purchase/ITC data, GST returns, filing status, compliance calendar, e-invoice JSON, most reports, and useful analytics.

---

## 3. Research findings

### 3.1 What a small business actually needs

A small Indian business typically needs these capabilities, in order of daily importance:

**Sales and receivables**
- Create GST invoices, bills of supply, export invoices, and quotations.
- Record customer details and GSTIN.
- Track payments and outstanding balances.
- Issue credit notes for sales returns, discounts, or price revisions.
- Cancel an invoice correctly.
- Send reminders and statements (nice to have; often needs email/WhatsApp).

**Expenses and purchases**
- Record day-to-day expenses with date, vendor, category, amount, and payment mode.
- Record GST purchases separately so ITC can be claimed.
- Track whether a purchase is paid, unpaid, or partly paid.
- Store the vendor invoice number/date and GSTIN.
- Attach a receipt or bill (nice to have; storage-heavy).
- Record other income that did not come from an invoice.

**GST compliance**
- Prepare GSTR-1 from outward supplies.
- Prepare GSTR-3B using outward tax and eligible ITC.
- Reconcile ITC with GSTR-2B/IMS.
- Amend earlier returns when something changes.
- Track filing status, ARN, due dates, late fees, and interest.
- Generate e-invoice bulk JSON if turnover crosses the threshold.
- Prepare annual GSTR-9/9C data.

**Reports and analytics**
- Sales register, purchase/expense register, and other income.
- Simple profit & loss.
- GST summary by rate and tax head.
- HSN summary.
- Receivables and payables ageing.
- Customer/vendor statements.
- CSV export for a CA or accountant.
- Trend charts: revenue, expenses, profit, and GST over time.
- Breakdowns: expenses by category, sales by customer/item/state, tax-rate mix.
- Period comparisons and growth.
- Actionable insights with drill-down to the underlying records.
- All analytics computed locally; no third-party tracking or telemetry.

**Operations**
- Backup/restore, data health, and safe migrations.
- PIN lock and local-only privacy.
- Audit trail of what changed after a return was filed.
- Recurring invoices/expenses (nice to have).
- Multi-GSTIN and multi-user (later, larger change).

### 3.2 Current GST rules to encode (verify before filing)

These are the rules the implementation should model. They change through notifications, so the app must show a "verify on the portal" disclaimer and keep rules in one configurable module.

| Topic | Current rule to encode |
|---|---|
| GSTR-1 monthly | Due on the 11th of the following month |
| GSTR-1 quarterly (QRMP) | Due on the 13th of the month after the quarter |
| IFF (QRMP) | Due on the 13th of the first two months of the quarter |
| GSTR-1A | Available after GSTR-1 and before GSTR-3B for the same period |
| GSTR-3B monthly | Due on the 20th of the following month |
| GSTR-3B QRMP | 22nd or 24th depending on the state group |
| GSTR-9 | 31 December following the financial year |
| GSTR-9 optional limit | Turnover up to ₹2 crore, subject to the yearly notification |
| GSTR-9C | Self-certified reconciliation above ₹5 crore from FY 2024-25 |
| B2CL threshold | Invoice-wise reporting for inter-state unregistered supplies above ₹1 lakh (from 1 August 2024) |
| HSN digits | 4 digits up to ₹5 crore turnover; 6 digits above ₹5 crore |
| E-invoice threshold | Mandatory above ₹5 crore aggregate annual turnover |
| E-invoice reporting window | 30 days for AATO ≥ ₹10 crore |
| IRN cancellation | Within 24 hours |
| B2C dynamic QR | Above ₹500 crore turnover |
| GST rates | 5% and 18% main slabs, 40% special rate, plus 0.25%/3% special rates |
| GSTR-3B hard-locking | Outward liability auto-populated/non-editable from July 2025; Table 3.2 locked from November 2025 |
| Filing time bar | Returns generally cannot be filed after 3 years from the due date (from July 2025) |
| Late fee | ₹50/day (₹20/day for nil returns), subject to caps |
| Interest | 18% per annum on late tax payment |

**Important:** these are product rules, not legal advice. The app should label every generated return as a **draft prepared from your records** and tell the user to verify with their CA and the GST portal.

### 3.3 The hard architectural limits

| Limit | Consequence |
|---|---|
| Static export (`output: "export"`) | No server-side secrets, no background jobs, no direct GSTN/IRP calls |
| CSP `connect-src 'self'` | The app cannot call GSTN, IRP, or any external API. It never will in this product. |
| IndexedDB only | Data is per-browser; backup/restore files are the only way to move it |
| Single business profile | One GSTIN per browser profile; multi-GSTIN needs a larger model |
| No purchase/ITC data | Cannot produce a complete GSTR-3B or GSTR-9 today |
| No structured address/UQC | E-invoice JSON and some portal validations need more fields |
| Export invoices can be in foreign currency | GSTR-1 needs INR values; an exchange rate is required |

**Direct GSTN filing is not part of this product.** It requires a GSP/ASP, taxpayer API credentials, OTP/EVC or DSC, a server, audit logs, and compliance obligations. The app prepares and exports files; the user uploads them to the GST portal, e-invoice portal, or gives them to their CA. No data leaves the machine unless the user explicitly downloads and shares a file.

### 3.4 Feature gap matrix

Status: **Done**, **Partial**, **Missing**, **Out of scope**.  
Priority: **Must** for a credible business MVP, **Should** next, **Later**, **No**.

| Area | Feature | Why it matters | Status | Priority | Phase |
|---|---|---|---|---|---|
| Sales | Tax invoice, bill of supply, export, proforma | Core selling workflow | Done | — | — |
| Sales | Customer and item masters | Reuse data | Done | — | — |
| Sales | Payment received / balance due | Receivables | Done | Must | 1 |
| Sales | Credit/debit notes | Sales returns, discounts, price revisions; GSTR-1 CDNR/CDNUR | Done | Must | 1 |
| Sales | Invoice cancellation | Correct GSTR-1 DOCS reporting | Done | Must | 1 |
| Sales | Payment history/ledger | Accurate cash flow and receipts | Missing | Should | 2 |
| Sales | Recurring invoices | Repeat customers | Missing | Later | 2/3 |
| Sales | Customer statements/reminders | Collections | Missing | Later | 3/5 |
| Sales | Multi-GSTIN | Multiple registrations | Missing | Later | 5 |
| Spend | Expenses | Daily business spending | Done | Must | 1 |
| Spend | Other income | Non-invoice income | Done | Must | 1 |
| Spend | GST/ITC on expenses | GSTR-3B input tax credit | Done | Must | 1 |
| Spend | Vendor master | Reuse vendor details | Missing | Should | 3 |
| Spend | Purchase bills and payables | Accurate purchases and payment tracking | Missing | Should | 3 |
| Spend | Receipt attachments | Audit support | Missing | Later | 3 |
| Spend | Recurring expenses | Rent, subscriptions | Missing | Later | 3 |
| GST | GSTR-1 summary and validation | Outward return | Done | Must | 1 |
| GST | GSTR-1 JSON/CSV export | Portal-ready file | Done | Must | 1 |
| GST | GSTR-3B outward worksheet | Tax liability visibility | Done | Must | 1 |
| GST | ITC and full GSTR-3B | Accurate tax payable | Missing | Should | 3 |
| GST | GSTR-2B/IMS import and reconciliation | ITC matching | Missing | Should | 3 |
| GST | GSTR-9/9C | Annual compliance | Missing | Later | 4 |
| GST | Amendments / GSTR-1A | Corrections after filing | Missing | Should | 2 |
| GST | Filing tracker and ARN | Know what was filed | Done | Must | 1 |
| GST | Compliance calendar | Avoid late fees | Done | Should | 1/2 |
| GST | E-invoice bulk JSON | IRP upload | Missing | Must (user) | 2 |
| GST | E-way bill | Movement of goods | Missing | No | Later |
| GST | Composition / GSTR-4 | Composition dealers | Missing | Later | 4 |
| GST | TDS/TCS | Special cases | Missing | No | Later |
| GST | Income Tax Return | Different system | Missing | No | Tax pack only |
| Reports | Sales register | Sales review | Done | Must | 1 |
| Reports | Expense/income register | Spend review | Done | Must | 1 |
| Reports | Simple P&L | Profit visibility | Done | Must | 1 |
| Reports | GST summary | Tax review | Done | Must | 1 |
| Reports | HSN summary | GSTR-1 support | Done | Must | 1 |
| Reports | Receivables ageing | Collections | Done | Must | 1 |
| Reports | Payables ageing | Vendor payments | Missing | Should | 3 |
| Reports | Cash flow | Cash visibility | Missing | Should | 3 |
| Reports | Customer/vendor statements | Account statements | Missing | Later | 3 |
| Reports | CSV export | CA/accountant handoff | Done | Must | 1 |
| Analytics | Dashboard KPIs with period comparison | Know the business at a glance | Done | Must | 1 |
| Analytics | Revenue/expense/profit trends | See direction, not just totals | Done | Must | 1 |
| Analytics | Expense category breakdown | Find where money goes | Done | Must | 1 |
| Analytics | Top customers/items/states | Focus on what drives sales | Done | Must | 1 |
| Analytics | GST output vs ITC analytics | Understand the tax position | Done | Must | 1 |
| Analytics | Receivables ageing and top overdue | Improve collections | Done | Must | 1 |
| Analytics | Actionable insights | Turn data into next steps | Done | Should | 1 |
| Analytics | Chart drill-down and CSV export | Investigate and share | Done | Should | 1 |
| Analytics | Cash-flow analytics | Cash visibility | Missing | Should | 3 |
| Analytics | Third-party tracking/telemetry | Privacy violation | Out of scope | No | — |
| Data | Backup/restore for all new data | No data loss | Done | Must | 1 |
| Data | Schema migration and data health | Safe upgrades | Done | Must | 1 |
| Data | CSV import | Onboarding from other tools | Missing | Later | 2/3 |
| Data | Audit trail | Trace changes after filing | Partial — invoices have a history view; other records don't | Should | 2 |
| Data | Cloud sync / multi-user | Multi-device teams | Out of scope | No | — |

*Rows marked Done were Phase 1 and are implemented and unit-tested. "Done" does not mean verified against the GST portal or a CA — that check is still outstanding. Phase 2+ rows are unchanged.*

### 3.5 What we should not build (to avoid overload)

- **Full double-entry accounting / general ledger.** It changes the product from an invoicing tool into accounting software and adds a steep learning curve.
- **Balance sheet and bank reconciliation.** Requires a chart of accounts, opening balances, and bank feeds.
- **Payroll, inventory, manufacturing, POS.** Separate products.
- **Income Tax Return filing.** Needs financial statements, depreciation, capital gains, TDS, deductions, and the income-tax portal. We can provide a **tax pack** instead.
- **Direct GSTN/IRP filing.** Needs a backend, GSP/ASP, credentials, and compliance. The app will never do this.
- **E-way bill.** Needs a separate portal/API and transport data. Out of scope.
- **Multi-GSTIN.** Bigger data-model work; later, but still local.
- **Multi-user, cloud sync, team/CA collaboration.** Require a backend and are out of scope.
- **Email/WhatsApp reminders.** Require a backend or third-party integration; out of scope.
- **Complex approval workflows.** Not needed for a small business.

---

## 4. Product design principles

1. **One source of truth.** Invoices and expenses are the source records. Returns and reports are always derived; never trust a stale stored total.
2. **Progressive disclosure.** Simple form first, GST/ITC/advanced fields expandable. Hide features that do not apply.
3. **One workspace, four questions.** Sell, spend, file, understand. The navigation should mirror that.
4. **Exports are not filings.** Every export says "draft prepared from your records" and links to the portal/CA checklist.
5. **Local-first privacy.** No network calls, no uploads, no secrets. The CSP stays strict.
6. **Safe by default.** Recompute totals, validate before saving, migrate old data, and warn when a filed period changes.
7. **Do not surprise the user.** If a field is needed for GST, explain why in plain language.
8. **Explainable analytics.** Every metric has a definition, a period, and a link to the underlying records. No decorative charts.
9. **Local analytics only.** All charts and insights are computed in the browser. No third-party analytics, tracking pixels, or telemetry.
10. **Actionable, not overwhelming.** Show the few numbers that change a decision; put the rest behind tabs or drill-down.

---

## 5. Recommended information architecture

### 5.1 Navigation

**Desktop sidebar**

- Dashboard
- Invoices
- Expenses (with an **Income** tab)
- GST Returns
- Analytics (includes the printable registers as a tab)
- Customers
- Items
- Settings

**Mobile bottom bar**

- Dashboard
- Invoices
- **+** (new invoice)
- GST
- More (Expenses, Analytics, Customers, Items, Settings)

This keeps the daily actions visible and puts less-used pages behind "More".

### 5.2 Page map

| Route | Purpose |
|---|---|
| `/dashboard` | This month's money, GST payable, filing status, quick actions |
| `/history` | Existing invoice/document history |
| `/invoice` | Existing editor; add advanced GST fields |
| `/expenses` | Expense list + **Income** tab + add/edit dialogs |
| `/returns` | GST period selector, GSTR-1, GSTR-3B worksheet, HSN, filing tracker |
| `/analytics` | KPIs, trends, breakdowns, insights, and printable registers |
| `/customers`, `/items` | Existing masters |
| `/settings` | Business profile, GST/filing, expense categories, backup |

### 5.3 Dashboard cards

- **This month:** sales, expenses, net profit, each with a comparison to the previous month.
- **Trend:** last 6 months revenue vs expenses (small chart).
- **GST:** output tax, eligible ITC, estimated payable, next due date.
- **Receivables:** outstanding, overdue, and top overdue customers.
- **Filing:** GSTR-1 and GSTR-3B status for the current period.
- **Insights:** 2–3 deterministic suggestions (expense spike, overdue concentration, filing due).
- **Quick actions:** New invoice, Add expense, Open GST returns, Open analytics.

---

## 6. Phased roadmap

### Phase 1 — Business basics + GST Filing Kit (recommended now)

**Goal:** A business owner can record income and expenses, see profit and trends, prepare GSTR-1, understand GSTR-3B, and track filing — all locally.

**Scope**

1. **Business & filing profile**
   - Legal name, trade name, GSTIN, PAN, address, city, PIN, state.
   - Registration type: regular / composition / unregistered.
   - Filing frequency: monthly / QRMP.
   - AATO, e-invoice applicability, HSN digit rule.
   - Expense and income categories.

2. **Expenses**
   - Add, edit, delete.
   - Fields: date, vendor name, vendor GSTIN, vendor state, category, description, amount, GST rate, intra/inter/none, amount includes GST, ITC eligible, ITC type, reverse charge, vendor invoice number/date, payment status, notes.
   - List with period/category/GST/ITC filters, totals, CSV export.
   - Quick-add from dashboard.
   - Store computed taxable value and tax split for fast reports.

3. **Other income**
   - Add, edit, delete.
   - Fields: date, source, category, amount, notes.
   - Clear label: "Income not raised through an invoice." Sales income comes from invoices; this avoids double counting.
   - List, totals, CSV export.

4. **Invoice GST fields**
   - Supply nature: taxable / nil / exempt / non-GST / zero-rated.
   - Reverse charge.
   - Cancellation date and reason.
   - Export details: with payment / under LUT, shipping bill number/date, port code, INR exchange rate.
   - Per-line item type (goods/services) and UQC (auto-mapped from common units, editable).
   - Structured city/PIN for seller and customer (needed later for e-invoice).
   - Credit/debit notes: create from an invoice, reason, original invoice reference, own numbering series.

5. **GST Returns**
   - Period selector: month or quarter, based on filing frequency.
   - GSTR-1 summary: B2B, B2CL, B2CS, exports, nil/exempt, credit/debit notes, HSN, documents.
   - Validation panel with blocking errors and warnings.
   - Export GSTR-1 JSON (pinned to the current GST Returns Offline Utility format), CSV/Excel-friendly CSV, and a printable summary.
   - GSTR-3B worksheet: outward liability + eligible ITC from expenses + net payable. Clearly labelled "draft; reconcile with GSTR-2B".
   - HSN summary export.
   - Filing tracker: data ready / exported / filed, ARN, filed date, notes, late fee/interest notes.
   - Due-date calendar for GSTR-1/3B, with QRMP support.
   - Warning when an invoice or expense in a filed period changes.

6. **Analytics**
   - Dashboard KPIs: sales, expenses, net profit, margin, GST payable, receivables, each compared with the previous period.
   - Trend charts: revenue vs expenses, profit, GST liability, filing status; last 6/12 months or a custom range.
   - Breakdowns: expenses by category, sales by customer, item/HSN, state/place of supply, B2B/B2C/export mix.
   - GST analytics: output tax vs eligible ITC, tax-rate mix, effective GST rate, ITC coverage.
   - Receivables ageing and top overdue customers.
   - Actionable insights with severity: revenue/expense change, profit warning, customer concentration, overdue concentration, filing due, missing GST data.
   - Filters: date range, comparison period, customer, category, document type.
   - Drill-down: click a chart segment to open the filtered register.
   - Export chart data as CSV and print the analytics view as PDF.
   - Data coverage line: "Based on X invoices and Y expenses; Z records excluded."
   - All calculations local; no third-party analytics or tracking.

7. **Registers and reports**
   - Sales register (issued invoices, excluding drafts/proforma; credit notes subtract).
   - Expense register.
   - Other income register.
   - Simple P&L: invoice revenue + other income − expenses (net of eligible ITC).
   - GST summary: output tax by rate/head, eligible ITC, net payable.
   - HSN summary.
   - Receivables ageing (0–30, 31–60, 61–90, 90+).
   - CSV export and print-friendly view for each register.

8. **Data**
   - Dexie v2 with `expenses`, `incomes`, `filings`, `returnSnapshots`.
   - Invoice schema v2 with defaults for all new fields.
   - Backup schema v2 includes the new tables; v1 backups still import.
   - Data health check for records that fail validation.
   - Re-parse invoices before saving, so a record can never be "saved but unreadable".

**Not in Phase 1:** e-invoice JSON, amendments/GSTR-1A, GSTR-2B, full GSTR-3B, GSTR-9, vendor master, payment ledger, attachments, cash-flow analytics, forecasting.

### Phase 2 — Complete GSTR-1 + e-invoicing

- Amendments and GSTR-1A-style corrections.
- Better cancellation handling across periods.
- E-invoice bulk JSON export; manual IRN/acknowledgement/QR status entry (or import of an IRP response file), with no API calls.
- Payment ledger for invoices (date, amount, mode) and receipts.
- Collection trends and payment-behaviour analytics once the payment ledger exists.
- Recurring invoices.
- CSV import for customers/items/expenses.
- Audit trail and a "changed since filed" diff view.
- Better B2CL/B2CS/CDNR/CDNUR edge cases.

### Phase 3 — Purchases, ITC, full GSTR-3B

- Vendor master and purchase bills (line items, due date, payment status).
- Payables ageing and vendor statements.
- GSTR-2B/IMS import (CSV/JSON) and invoice matching.
- Full GSTR-3B worksheet: eligible/ineligible ITC, reverse charge, amendments, set-off notes.
- ITC reconciliation analytics: matched, missing, mismatched, and ineligible ITC.
- Cash-flow report and cash-flow analytics.
- Payables analytics and vendor concentration.
- Receipt attachments with storage warnings.
- Recurring expenses.

### Phase 4 — Annual compliance + tax pack

- GSTR-9 worksheet from full-year data.
- GSTR-9C checklist/reconciliation worksheet.
- GSTR-4 for composition dealers.
- Annual P&L and "tax pack" for a CA: sales, purchase, expense registers, GST reconciliation, fixed-asset note (manual).
- Year-over-year analytics and annual trend charts.
- TDS/TCS placeholders if needed.
- Multi-GSTIN research.

### No Phase 5 — no backend

The roadmap ends at Phase 4. Direct GSTN filing, direct IRP/e-invoice API, e-way bill, cloud sync, team collaboration, payment reminders, and online payments are **not** part of this product. They would require a backend, credentials, and compliance operations, and would break the local-only design.

Everything in Phases 1–4 runs in the browser:

- Data is stored in IndexedDB on the user's machine.
- Returns and e-invoice JSON are generated locally.
- Files are downloaded by the user.
- The user uploads them to the GST/e-invoice portal or gives them to a CA.
- Filing status and ARN are entered manually or imported from a file.
- Backups are files; there is no cloud sync.

---

## 7. Phase 1 technical design

### 7.1 Schema changes

#### Invoice additions (schema v2)

```ts
status: "active" | "cancelled"          // default active
cancelledAt: string
cancelReason: string

supplyNature: "taxable" | "nil" | "exempt" | "non_gst" | "zero_rated"
reverseCharge: boolean

exportDetails: {
  type: "wpay" | "wopay" | ""
  shippingBillNo: string
  shippingBillDate: string
  portCode: string
  exchangeRate: string                 // INR per unit of invoice currency
}

note: {
  reason: string
  originalInvoiceId: string
  originalInvoiceNumber: string
  originalInvoiceDate: string
}

eInvoice: {                            // Phase 2, fields can be added now with defaults
  applicable: boolean
  irn: string
  ackNo: string
  ackDate: string
  status: "not_applicable" | "pending" | "generated" | "cancelled" | "failed"
  cancelReason: string
  cancelDate: string
}
```

**Per line**

```ts
itemType: "goods" | "services"
uqc: string                            // GST unit quantity code; auto-map common units
```

**Document types**

- Add `credit_note` and `debit_note` to `DOC_TYPES`.
- Add numbering rules for both.
- Add `DOC_TYPE_META` entries with `hasTax: true`, `hasPayment: false`.
- The note stores positive values; the return engine subtracts credit notes and adds debit notes.

**Parties**

- Seller: `legalName`, `tradeName`, `city`, `pincode`.
- Customer: `city`, `pincode`.
- Keep the existing free-text address fields for print compatibility.

**Version handling**

- `INVOICE_SCHEMA_VERSION = 2`.
- Accept stored `schemaVersion: 1` and transform it to 2, so old invoices and v1 backups do not disappear.
- Every new field needs a default.
- `saveInvoice()` must run `invoiceSchema.parse(record)` before writing.
- Add an editor line cap or raise the schema cap; the current schema allows 500 lines while the editor has no limit.

#### Expense schema

```ts
{
  id, schemaVersion,
  date,
  vendorName, vendorGstin, vendorStateCode,
  category, description,
  amount,                    // taxable value, or gross when no GST
  amountIncludesGst,
  gstRate, gstMode: "none" | "intra" | "inter",
  itcEligible, itcType: "inputs" | "input_services" | "capital_goods" | "ineligible",
  reverseCharge,
  invoiceNo, invoiceDate,
  paymentStatus: "unpaid" | "partial" | "paid",
  paymentDate,
  notes,
  summary: { taxable, cgst, sgst, igst, total },
  createdAt, updatedAt
}
```

- Compute `summary` on save using Decimal arithmetic, never binary floating point.
- Derive intra/inter from vendor state vs seller state, with a manual override.
- Default `itcEligible` to true only when a valid vendor GSTIN exists.
- `capital_goods` is stored but full depreciation/ITC spreading is Phase 3.
- `reverseCharge` is stored; the Phase 1 3B worksheet shows it as a manual line and explains the limitation.

#### Other income schema

```ts
{ id, schemaVersion, date, source, category, amount, notes, createdAt, updatedAt }
```

No GST on this record. If GST applies, the user should issue an invoice.

#### Filing record

```ts
{
  id,                         // `${period}:${returnType}`
  period,                     // YYYY-MM
  frequency: "monthly" | "qrmp",
  returnType: "GSTR-1" | "GSTR-3B" | "GSTR-9" | "GSTR-1A" | "IFF",
  status: "not_started" | "data_ready" | "exported" | "filed",
  dueDate,
  exportedAt, filedAt, arn,
  lateFee, interest,
  notes,
  createdAt, updatedAt
}
```

#### Return snapshot

```ts
{
  id, filingId,
  period, returnType,
  generatedAt,
  payload,                    // JSON string of the exported return
  totals,                     // summary for reports
  invoiceVersions: { id, updatedAt }[],
  createdAt
}
```

- A snapshot is created on export or on "mark filed".
- Compare current invoice `updatedAt` values with the snapshot to detect changes after filing.
- Keep snapshots in backup; prune only with an explicit user action.

#### Settings additions

```ts
profile: { legalName, tradeName, city, pincode }
gst: {
  registrationType: "regular" | "composition" | "unregistered",
  filingFrequency: "monthly" | "qrmp",
  aato: string,
  eInvoiceApplicable: boolean,
  hsnDigits: 4 | 6
}
expenseCategories: string[]
incomeCategories: string[]
numbering: { credit_note, debit_note }
```

All additions need defaults so existing settings parse.

### 7.2 Database changes

Dexie version 2:

```ts
this.version(2).stores({
  settings: "id",
  customers: "id, name, updatedAt",
  items: "id, name, updatedAt",
  invoices: "id, number, docType, invoiceDate, updatedAt",
  designs: "id, name, updatedAt",
  counters: "key",
  meta: "key",
  expenses: "id, date, category, vendorName, updatedAt",
  incomes: "id, date, category, updatedAt",
  filings: "id, period, returnType, status, updatedAt",
  returnSnapshots: "id, filingId, createdAt",
});
```

- No destructive rewrite of invoices; defaults handle new fields.
- Add a one-time data-health scan and a repair prompt if a record fails validation.
- `useExpenses()` and `useIncomes()` should not silently drop records; expose counts of invalid rows so the UI can warn.
- `guardedWrite` should wrap all new writes.

### 7.3 GST return engine

Create a pure module under `src/lib/gst/returns/`:

```text
period.ts          period, quarter, FY, due dates
classify.ts        invoice → GSTR-1 section
gstr1.ts           build JSON, summary, documents, HSN
gstr3b.ts          outward + ITC worksheet
hsn.ts             HSN/UQC aggregation
validate.ts        return-specific validation
types.ts           shared types
fixtures/          golden JSON samples
```

**Core flow**

```ts
buildReturnData({ invoices, expenses, settings, period, frequency })
  → validate
  → classify invoices
  → aggregate GSTR-1 sections
  → aggregate GSTR-3B outward and ITC
  → build HSN summary
  → build document series
  → return { gstr1, gstr3b, hsn, documents, issues }
```

**GSTR-1 classification rules**

| Condition | Section |
|---|---|
| Draft, proforma, or non-GST invoice | Exclude |
| Cancelled invoice | Exclude from supply sections; include in DOCS cancelled count |
| Customer has a valid GSTIN | B2B |
| Unregistered, inter-state, invoice value above ₹1 lakh | B2CL |
| Unregistered, other | B2CS, aggregated by place of supply + rate + intra/inter |
| `docType === "export"` | EXP (WPAY/WOPAY) |
| `supplyNature` nil/exempt/non-GST, or bill of supply | NIL |
| Credit/debit note to registered customer | CDNR |
| Credit/debit note to unregistered customer | CDNUR |
| All taxable lines | HSN summary |
| All document series | DOCS |

**GSTR-1 export**

- JSON pinned to the current GST Returns Offline Utility format (research currently shows v3.2.4; pin the version at implementation time).
- The schema is not a stable public API. Use an adapter and golden fixtures; do not scatter field names across the UI.
- Also export a CSV that mirrors the offline utility import columns, so a CA can fix data in Excel.
- Export a printable summary PDF (browser print) with section totals and validation results.
- Every export includes: period, GSTIN, generated timestamp, app version, format version, and a "draft" disclaimer.
- Recompute all totals from invoices; never use `invoice.summary` for return values.

**Foreign currency**

- Domestic GST invoices must be in INR.
- Export invoices may be in foreign currency. Require an INR exchange rate and use the INR-converted taxable value/tax in GSTR-1.
- If the rate is missing, block the export and explain how to add it.

**GSTR-3B worksheet**

| Section | Source |
|---|---|
| 3.1(a) taxable outward | Tax invoices, net of credit notes/debit notes |
| 3.1(b) zero-rated | Export invoices |
| 3.1(c) nil/exempt | Bill of supply / nil / exempt |
| 3.1(d) reverse charge | Expenses marked reverse charge (manual confirmation) |
| 3.1(e) non-GST | Non-GST supply nature |
| 3.2 inter-state unregistered | B2CL + B2CS inter-state |
| 4A(5) eligible ITC | Expenses with `itcEligible` |
| 4B ineligible/reversal | Expenses marked ineligible + manual adjustment |
| 4D net ITC | 4A − 4B |
| Net payable | Output tax − eligible ITC, per head |

- Show a warning that outward liability is auto-populated/non-editable on the portal and that Table 3.2 is locked.
- Do not calculate a final set-off or claim to be a filing engine. Label the sheet "worksheet".
- If the user has no purchase data, show ITC as zero with a clear explanation.

**HSN summary**

- Aggregate by HSN/SAC, UQC, rate.
- Validate HSN length: 4 digits up to ₹5 crore AATO, 6 digits above.
- Map common units to UQC codes; allow override.
- Include quantity and taxable value; show an error if HSN is missing for a taxable line.

**Document series (DOCS)**

- Group by document type and number prefix.
- Report from/to number, total issued, and cancelled count.
- Handle manual numbers gracefully; do not assume a numeric sequence.

### 7.4 Validation rules

Blocking errors:

- GST returns enabled but seller GSTIN missing/invalid.
- Domestic invoice not in INR.
- Export invoice missing exchange rate.
- Invoice number missing or duplicated.
- Invoice date outside the selected period.
- Customer GSTIN present but invalid.
- Place of supply missing for a taxable supply.
- Taxable line missing HSN/SAC.
- HSN too short for the configured turnover rule.
- Unsupported GST rate.
- Credit/debit note missing original invoice reference.
- Export invoice missing shipping bill/port when required, or LUT number when WOPAY.
- Expense with GST but missing vendor GSTIN/invoice number (warning or error depending on ITC claim).

Warnings:

- Customer state and GSTIN state mismatch.
- B2CL near the threshold.
- Invoice edited after the period was filed.
- ITC claimed without a vendor GSTIN.
- Reverse-charge expense not confirmed.
- Composition dealer trying to use GSTR-1/3B.
- E-invoice threshold crossed but no IRN (Phase 2).

### 7.5 UI details

**Expenses page**

- Header: "Money out" with total for the selected period.
- Tabs: Expenses | Income.
- Filters: date range, category, GST only, ITC only, payment status.
- Table columns: date, vendor/source, category, taxable, GST, total, ITC, status.
- Add/edit in a dialog or side sheet, not a full page.
- Basic fields visible; "GST / ITC" section collapsed by default.
- CSV export button.

**GST Returns page**

- Period picker with previous/next and "current period".
- Status cards: GSTR-1, GSTR-3B, due date.
- Tabs: GSTR-1 | GSTR-3B | HSN | Filing tracker.
- GSTR-1: summary cards, section table, validation list, export buttons.
- GSTR-3B: worksheet table, ITC explanation, export/print.
- Filing tracker: status, ARN, filed date, notes, "changed since filed" warning.
- A persistent banner: "This is a draft prepared from your records. Verify on the GST portal or with your CA."

**Analytics page**

- Tabs: Overview | Sales | Expenses | GST | Receivables | Registers.
- Overview: KPI cards with previous-period comparison, revenue-vs-expenses chart, profit trend, and 2–3 actionable insights.
- Sales: top customers, top items/HSN, state/place-of-supply mix, B2B/B2C/export mix.
- Expenses: category donut, monthly trend, top vendors, ITC summary.
- GST: output tax vs eligible ITC, rate mix, effective GST rate, filing status.
- Receivables: ageing bars and the top overdue customers.
- Registers: printable sales, expense, income, and HSN tables with CSV export.
- Filters: date range, comparison period, customer, category, document type.
- Click a chart segment to filter the register below.
- Print header includes business name, GSTIN, period, "prepared from local records", and data coverage.

**Settings**

- Business profile: legal name, trade name, address, city, PIN, state, GSTIN, PAN.
- GST & filing: registration type, frequency, AATO, HSN digits, e-invoice applicability.
- Categories: expense and income categories.
- Backup: shows new data counts.

**Empty states**

- "No expenses yet. Add your first expense to see profit and ITC."
- "No GST returns yet. Set your filing frequency, then prepare GSTR-1."

### 7.6 Analytics definitions and formulas

Every metric must show its definition in a tooltip or help text. Phase 1 is accrual-based; cash-flow metrics need the Phase 2 payment ledger.

- **Sales revenue:** taxable value of issued tax invoices + export invoices (INR) + bill of supply; subtract credit notes, add debit notes; exclude drafts, proforma, cancelled.
- **Other income:** sum of income entries.
- **Expenses:** taxable value + non-creditable GST; exclude GST that is eligible for ITC.
- **Net profit:** sales revenue + other income − expenses.
- **Net margin:** net profit / (sales revenue + other income); show "—" when revenue is zero.
- **Growth:** `(current − previous) / previous`; show "—" when the previous period is zero.
- **Output tax:** CGST/SGST/IGST from taxable invoices, net of credit/debit notes.
- **Eligible ITC:** GST on expenses marked eligible; split by head.
- **Estimated GST payable:** output tax − eligible ITC, per head; no set-off.
- **Effective GST rate:** output tax / taxable turnover.
- **ITC coverage:** eligible ITC / output tax.
- **Receivables:** invoice balance due, aged from due date (or invoice date if no due date).
- **Top customer share:** revenue from the largest customer / total sales revenue.
- **Expense ratio:** expenses / sales revenue.
- **Data coverage:** counts of included and excluded invoices/expenses, plus the reasons for exclusion.

Do not show:
- **Gross profit / gross margin:** there is no cost-of-goods data.
- **Cash balance:** there is no bank feed.
- **Inventory value:** there is no stock module.
- **Forecasts:** too speculative without enough history.

Add a note in the UI that this is a **simple management P&L and analytics view**, not a statutory financial statement.

### 7.7 Backup and migration

- `BACKUP_SCHEMA_VERSION = 2`.
- `backupFileSchema` adds `expenses`, `incomes`, `filings`, `returnSnapshots` with `.default([])`.
- `buildBackup()` includes the new tables.
- `restoreBackup()` includes them in the transaction for both merge and replace.
- `migrate()` handles v1 → v2:
  - Add empty arrays for new tables.
  - Ensure invoice `schemaVersion` is accepted and upgraded.
  - Settings defaults fill new fields.
- `parseBackup()` accepts v1 and v2.
- Backup summary shows counts for the new tables.
- Before a schema upgrade, prompt the user to download a backup.
- Add a "data health" card: invalid invoices/expenses, storage usage, last backup.

### 7.8 Testing strategy

**Unit tests**

- Period helpers: month/quarter/FY boundaries, QRMP groups, due dates, leap years.
- GSTR-1 classification: B2B, B2CL, B2CS, EXP, NIL, CDNR, CDNUR, cancelled, drafts.
- Aggregation: invoice discount allocation, inclusive/exclusive tax, rounding, credit notes.
- HSN summary and UQC mapping.
- GSTR-3B worksheet: output tax, eligible/ineligible ITC, reverse charge.
- Expense totals: intra/inter/none, inclusive/exclusive, ITC.
- P&L formulas.
- Analytics metrics: revenue, expenses, profit, margin, growth, effective GST rate, ITC coverage, top-customer share, expense ratio, ageing buckets.
- Insight rules: positive, negative, zero/insufficient data, and threshold boundaries.
- Chart data shaping: empty data, one period, negative profit, zero previous period, top-5-plus-other grouping.
- Reconciliation: analytics totals must equal the corresponding registers and GSTR-1 totals.
- Validation rules.
- Backup migration v1 → v2.

**Golden fixtures**

- A sample month covering B2B, B2CL, B2CS, export, nil/exempt, credit/debit notes, HSN, DOCS.
- Compare the generated GSTR-1 JSON with a reviewed fixture.
- Add an e-invoice fixture in Phase 2.
- Keep fixtures in `src/lib/gst/returns/fixtures/`.

**Integration tests**

- Save an invoice → it appears in the correct return section.
- Edit an invoice after filing → warning appears.
- Add an expense → ITC appears in the 3B worksheet.
- Analytics KPIs and charts update after adding/editing an invoice or expense.
- Analytics totals reconcile with the sales/expense registers and GSTR-1 summary.
- Backup → restore → all new data survives.
- Import a v1 backup → defaults are applied.

**UI tests**

- Add/edit/filter an expense.
- Add other income.
- Select a period and export GSTR-1.
- Mark a return filed with an ARN.
- Dashboard and analytics render, filter, drill down, and export CSV.
- Charts expose text summaries/data tables and are keyboard/screen-reader accessible.
- Registers render and export CSV.
- Use Vitest + React Testing Library. Add Playwright later for critical flows.

**Manual verification**

- Validate a generated GSTR-1 JSON against the current offline utility format with a test/dummy GSTIN.
- Ask a CA to review one sample return and the 3B worksheet.
- Compare dashboard and analytics totals with the underlying registers and GSTR-1 summary.
- Check chart accessibility with keyboard-only navigation and a screen reader.
- Check print layouts on A4 and mobile.

### 7.9 Phase 1 acceptance criteria

- A user can add an expense with GST/ITC and see it in the expense register and GST worksheet.
- A user can add other income and see it in the P&L without double counting invoice sales.
- A user can select a month/quarter and see GSTR-1 section totals for all issued invoices.
- Blocking validation prevents an invalid export; warnings are understandable.
- GSTR-1 JSON and CSV download successfully; totals reconcile with the sales register.
- GSTR-3B worksheet shows outward tax, eligible ITC, and estimated payable with a clear draft warning.
- A user can mark a return filed, store an ARN, and see "changed since filed" when data changes.
- The dashboard shows this month's sales, expenses, profit, GST, and receivables with previous-period comparisons.
- The analytics page shows revenue/expense/profit trends, expense categories, top customers/items, GST output vs ITC, and receivables ageing.
- Clicking a chart segment filters the underlying register; chart data can be exported as CSV and printed.
- Insights are actionable and explainable, with a data-coverage line showing included/excluded records.
- Analytics totals reconcile with the corresponding registers and GSTR-1 summary.
- A user can export sales, expense, income, GST, HSN, and receivables registers as CSV.
- Backup/restore includes all new data; a v1 backup still restores.
- `pnpm typecheck`, `pnpm test`, and `pnpm build` pass.
- No new network calls, third-party analytics, tracking pixels, or telemetry; CSP remains `connect-src 'self'`.

---

## 8. E-invoice plan (Phase 2)

### 8.1 Applicability

- Show the feature only when `settings.gst.eInvoiceApplicable` is true or AATO is above the threshold.
- Support B2B tax invoices, credit notes, and debit notes.
- Do not include exports, B2C, or proforma.
- Warn when an invoice is older than the 30-day reporting window (AATO ≥ ₹10 crore).
- Track IRN, acknowledgement number/date, QR code, status, and cancellation within 24 hours.

### 8.2 Data gaps to close

- Seller and buyer: legal name, trade name, address line, city, PIN, state code.
- Line: goods/service flag, HSN, quantity, UQC, unit price, discount, assessable value, GST rate, tax amounts.
- Invoice: document type/number/date, reverse charge, value details.
- Optional: e-way bill details, shipping details.

Most of these can be added in Phase 1 with defaults, but the e-invoice export itself should wait until the data is reliably captured.

### 8.3 Export

- Generate the IRP bulk-upload JSON (pin the current schema/version).
- Also generate a CSV preview for review.
- Do not call the IRP API from the static app.
- Every file includes a "draft" disclaimer and a link to the e-invoice portal bulk-upload instructions.

---

## 9. Architecture and dependencies

- **No new runtime dependency is required** for Phase 1. Use `zod`, `dexie`, `decimal.js`, `date-fns`, and existing UI primitives.
- CSV generation: a small internal utility with proper quoting and UTF-8 BOM.
- JSON export: `Blob` + existing `downloadBlob`.
- All calculations use `decimal.js` through the existing money helpers.
- Keep the static export and strict CSP. No API routes, no server actions, no external calls.
- Use Dexie indexes for period/category filters; avoid loading all rows for large datasets.
- Keep return building pure and testable; pass data in, return data out.
- Version the GSTR-1 adapter separately from the app version.
- Add a `formatVersion` to exported files.
- **Analytics modules:** `src/lib/analytics/` contains pure functions for metrics, trends, breakdowns, period comparison, data coverage, and insight rules.
- **Charts:** `src/components/charts/` contains small accessible SVG charts (line, bar, stacked bar, donut, sparkline). No chart library in Phase 1; this keeps the bundle small and the styling consistent.
- **Money in analytics:** use `decimal.js` for every total. Convert to numbers only for chart coordinates and axis labels; never use those numbers for stored totals.
- **Insights:** deterministic rules only (thresholds and comparisons). No AI model, no remote service, no hidden scoring. Each insight has a title, explanation, severity, and action link.
- **Performance:** aggregate in a single pass with `useMemo`/`useLiveQuery`; use date indexes. Consider a Web Worker only if a user has more than roughly 10,000 invoices/expenses.
- **Accessibility:** every chart has a text summary and a data-table fallback; colour is not the only signal; keyboard focus is supported.
- **No third-party analytics:** no Google Analytics, no tracking pixels, no telemetry, no cookies for analytics. The only data that leaves the browser is a file the user explicitly downloads.

---

## 10. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Incorrect return data | Penalties, lost trust | Validation, draft labels, CA review, golden fixtures, disclaimers |
| GSTR-1/e-invoice schema changes | Export rejected | Adapter layer, pinned versions, fixtures, release checklist |
| GSTR-3B hard-locking | User edits the wrong thing | Worksheet only, portal warnings, no false "file" button |
| Data loss during migration | Existing invoices disappear | Defaults, v1 acceptance, backup prompt, data-health scan, re-parse before save |
| Overload | Users abandon the app | Progressive disclosure, tabs, defaults, hide inapplicable features |
| Missing purchase/ITC data | Wrong 3B | Phase 1 labels ITC as draft; full 2B/3B in Phase 3 |
| Foreign currency exports | Wrong INR values | Require exchange rate; block export without it |
| Multi-GSTIN limitation | Wrong returns for multiple registrations | Clear single-GSTIN warning; defer multi-GSTIN |
| Composition dealers | Wrong return type | Detect and hide GSTR-1/3B; add GSTR-4 in Phase 4 |
| Income tax confusion | Users expect ITR filing | Label "tax pack", explain the boundary |
| Misleading analytics | Wrong business decisions | Metric definitions, data-coverage line, accrual labels, no cash balance/gross profit without data |
| Analytics overload | Users ignore the charts | Few KPIs, top-5 + "other" grouping, tabs, drill-down instead of a wall of charts |
| Analytics performance | Slow UI with large data | Date indexes, single-pass aggregation, `useMemo`, Web Worker later if needed |
| Analytics privacy | Users worry about tracking | Local-only, no third-party analytics/telemetry, strict CSP |
| Analytics/return mismatch | Users distrust the numbers | Reuse the same source data and add reconciliation tests |
| Scope creep | Endless delivery | Explicit non-goals, phased approvals |

---

## 11. Effort estimate

These are implementation sizes, not calendar promises.

| Phase | Scope | Size |
|---|---|---|
| Phase 1 | Expenses, income, invoice GST fields, credit/debit notes, GSTR-1, 3B worksheet, tracker, analytics, registers, migrations | 15–22 dev days |
| Phase 2 | Amendments, e-invoice JSON, payment ledger, collection analytics, recurring invoices, CSV import, audit trail | 10–14 dev days |
| Phase 3 | Vendor master, purchase bills, 2B/IMS reconciliation, full 3B, payables, cash-flow analytics | 16–22 dev days |
| Phase 4 | GSTR-9/9C, GSTR-4, tax pack, annual/YoY analytics | 11–16 dev days |

Anything requiring a backend — direct filing, IRP API, e-way bill, cloud sync, team collaboration — is excluded from this estimate and from the product.

Phase 1 is the recommended approval point. It delivers the daily business workflow and a useful GST filing kit without turning the app into an ERP.

---

## 12. Decisions needed

Recommended defaults:

1. **Phase 1 includes credit/debit notes.** They are required for a credible GSTR-1 and are cheaper to add now than to retrofit.
2. **"Income" means other income only.** Sales income comes from invoices; this avoids double counting.
3. **GST expenses double as the Phase 1 purchase register.** A full vendor master and purchase-bill workflow come in Phase 3.
4. **GSTR-3B is a worksheet in Phase 1.** Full ITC/2B reconciliation comes in Phase 3.
5. **E-invoice JSON is Phase 2.** Add the data fields in Phase 1, but do not ship a half-valid IRP export.
6. **No attachments in Phase 1.** Receipt images can bloat IndexedDB and backups; add them later with storage warnings.
7. **No backend, ever.** Everything stays in the browser. Direct GSTN filing, direct IRP API, e-way bill, cloud sync, and team collaboration are not part of this product. The app only prepares files; the user files on the portal.
8. **Analytics is part of Phase 1.** The planned Reports page becomes an "Analytics" page with a printable Registers tab, so we do not add another top-level page.
9. **Phase 1 analytics is accrual-based.** Cash-flow and collection analytics wait for the Phase 2 payment ledger and Phase 3 purchase/payables data.
10. **Charts are custom SVG and insights are deterministic.** No chart library, no AI model, no third-party analytics, no telemetry.

If these defaults are approved, implementation can start with Phase 1 in this order:

1. Schema/DB/backup migration and data-health guardrails.
2. Expenses + other income + basic dashboard KPIs.
3. Invoice GST fields + credit/debit notes.
4. GSTR-1 engine and validation.
5. GSTR-3B worksheet and HSN summary.
6. Filing tracker and printable registers.
7. Analytics engine, charts, drill-down, and insights.
8. Tests, fixtures, and manual verification.
