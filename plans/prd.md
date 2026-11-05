# Product Requirements Document (PRD)
## Invoice Generator — Free, Browser-Only Web App

**Document version:** 2.0
**Status:** MVP Specification (re-scoped)
**Product type:** Static, frontend-only web application. No backend, no login.
**Hosting:** Vercel free tier (static export)
**Primary objective:** Let anyone create professional GST-ready invoices in the browser, customize their design, and save them as print-ready PDFs at zero cost. Nothing leaves the user's device.

> Version 1.0 described a multi-tenant SaaS with accounts, a backend and a database. Section 20 summarizes what changed.

---

## 1. Product Overview

### 1.1 Vision

A simple, fast and private invoice generator. A user opens the website, fills in their business and customer details, adds items, picks and customizes a template, and downloads a polished PDF. No sign-up, no server and no cost.

### 1.2 Problems Solved

- Invoice tools are often paid, require an account, or are built for full accounting.
- Free tools often have few templates, no branding and weak GST support.
- Users want their business data to stay private.

### 1.3 Goals

1. Create and download an invoice in a few minutes.
2. Provide six professional, customizable templates.
3. Calculate GST, discounts, totals and balance due accurately and consistently.
4. Remember the user's business profile, customers, items and recent invoices in their browser.
5. Let users re-open any invoice later through an exportable invoice file.
6. Stay completely free to host and use.

### 1.4 Non-Goals (this release)

- User accounts, login, passwords or cloud sync.
- Any backend, server-side database or server-side PDF rendering.
- Accounting, bookkeeping, reports or GST return filing.
- GST e-invoicing (IRN / e-invoice QR) and e-way bills.
- Cess, reverse charge and shipping or other add-on charges.
- Email delivery, reminders, payment gateways or payment links.
- Recurring invoices.
- Multiple business profiles.
- Free-form drag-and-drop design.

---

## 2. Target Users

- **Freelancers and consultants** who invoice clients for services.
- **Small businesses and shop owners** who need branded GST invoices.
- **Exporters of services** who bill foreign clients in USD, EUR and other currencies.
- **Anyone** who needs a quick one-off invoice, quotation or bill of supply.

The app is public. Anyone with the link can use it, and each person's data lives only in their own browser.

---

## 3. Product Scope

### 3.1 MVP Modules

1. Home (quick actions, resume draft, recent invoices, local summary).
2. Invoice editor with live preview.
3. Calculation engine (GST, discounts, round-off, balance due).
4. Document types: Tax Invoice, Bill of Supply, Proforma/Quotation, Export (non-INR) Invoice.
5. Template gallery (six templates).
6. Template customization and saved designs.
7. Print-to-PDF output.
8. Customer list (browser storage).
9. Item/service catalog (browser storage).
10. Invoice history (browser storage).
11. Invoice file export/import (`.json`).
12. Settings, including business profile, GST, numbering, and data & backup.
13. Storage-safety warnings and full backup/restore.

### 3.2 Future Modules

See Section 19.

---

## 4. Information Architecture

### 4.1 Navigation

- Home
- New Invoice / Editor
- History
- Customers
- Items
- Templates
- Settings

### 4.2 Routes

Because the site is a static export, dynamic records are addressed with query parameters, not path segments.

**Public pages** (indexed by search engines, server-rendered):

| Route | Purpose |
|---|---|
| `/` | Landing page: what the tool does, features, templates, FAQ |
| `/gst-calculator` | Add/remove GST with CGST/SGST/IGST split |
| `/guides`, `/guides/<slug>` | GST guides (invoice format, CGST/SGST/IGST, bill of supply, export under LUT, proforma) |
| `/privacy` | Privacy statement |

**App screens** (`noindex`, data stays in the browser):

| Route | Purpose |
|---|---|
| `/dashboard` | Home: new invoice, resume draft, recent invoices, local summary |
| `/invoice` | Editor for the current draft |
| `/invoice?id=<localId>` | Editor for a saved invoice from history |
| `/history` | Invoice history list |
| `/customers` | Customer list and editor |
| `/items` | Item/service catalog |
| `/templates` | Template gallery and design customization |
| `/settings` | Business profile, invoice defaults, GST, numbering, formats, data & backup |

---

## 5. End-to-End User Flow

1. **First visit:** A short welcome explains that everything is stored only in this browser, and recommends filling in the business profile and taking regular backups. The user can skip it and start invoicing immediately.
2. **Business profile (optional but recommended):** The user enters seller details once (Section 6.10). These prefill every new invoice.
3. **New invoice:** The user chooses a document type. The app creates a draft, generates a number from the numbering pattern, sets the invoice date to today and the due date from the default terms, and autosaves continuously.
4. **Customer:** The user picks a saved customer, adds a new one (optionally saving it to the list), or types one-off details.
5. **Items:** The user adds lines manually or from the catalog. Lines can be added, edited, removed and reordered.
6. **Totals:** Totals recalculate instantly per Section 8.
7. **Design:** The user picks a template and adjusts the design. Invoice data is never changed by design actions.
8. **Preview:** The live preview always reflects the current data and design.
9. **Download PDF:** The app validates the invoice (Section 6.6), saves it to history, and opens the browser print dialog with "Save as PDF".
10. **Optional:** The user saves the invoice file (`.json`) to re-open it on any device later.
11. **Later:** From History, the user re-opens, duplicates, converts a quotation to an invoice, updates the amount received, or re-downloads.

---

## 6. Functional Requirements

### FR-01: Home

- "New Invoice" primary action, with a document-type picker.
- "Resume draft" when an autosaved draft exists.
- Recent invoices (last 5–10) with status badges.
- Local summary from history: total invoiced, received and outstanding, **grouped by currency**. Labelled "from invoices saved in this browser".
- Empty state for first-time users.

### FR-02: Invoice Editor

**Invoice details**
- Document type (Section 7).
- Invoice number: generated from the pattern (Section 9), editable, with a "regenerate" action.
- Invoice date (defaults to today) and due date (defaults to today + default payment days).
- Currency. Defaults to INR; any ISO 4217 currency is allowed for Export Invoices.
- Reference number and PO number (optional).
- Place of supply (state). Defaults from the customer and can be overridden; only used in split-GST mode (Section 8.4).

**Seller details:** prefilled from the business profile and editable per invoice. Edits apply to this invoice only unless the user chooses "Also update my profile".

**Customer details:** choose a saved customer, add a new one, or enter one-off details. Fields: name, company (optional), email, phone, billing address, state, country, GSTIN (optional), shipping address (optional).

**Line items:** item name, description (multi-line), HSN/SAC (optional), quantity, unit, unit price, line discount (% or flat, optional), GST rate.
- Add, remove, duplicate and reorder lines (drag handle plus keyboard-accessible move up/down).
- An autocomplete on the item name pulls from the catalog.
- "Save to catalog" action per line.

**Additional information:** notes, terms & conditions, payment instructions, footer text, and amount received (Section 6.5).

**Advanced section** (collapsed by default):
- Invoice-level discount (% or flat).
- Prices include GST (tax-inclusive toggle).
- GST display mode override for this invoice (Section 8.4).
- Round-off on/off override.
- Place-of-supply override.

**Editor behaviour**
- Autosave the current draft to browser storage (debounced, about every 1 second after a change).
- A "Saved" or "Saving…" indicator.
- Warning before leaving the page if a save is pending or failed.
- Inline validation messages next to fields.

### FR-03: Calculation Engine

Defined fully in Section 8.
- Runs in the browser, deterministically: the same input always gives the same output.
- Uses decimal or integer minor-unit arithmetic only. Binary floating point is never used for money.
- Is a pure, isolated module with comprehensive unit tests.

### FR-04: Live Preview

- Renders the selected template with the current data and design, using the same component that is printed.
- Shows page-size frames (A4 or Letter) so the user can see the page area. Long invoices flow onto additional pages.
- Updates on every data or design change.
- On mobile, the preview is a separate tab or full-screen view.

### FR-05: PDF Output (Browser Print)

- "Download PDF" opens the browser print dialog with a print stylesheet that shows only the invoice.
- The page `document.title` is set to the invoice file name (for example `INV-261022-1430 - Acme Pvt Ltd`) so browsers propose it as the PDF filename.
- Print CSS requirements:
  - `@page` size matches the selected page size; margins are controlled by the template.
  - The line-item table header repeats on each page; rows are not split across pages.
  - The totals block, amount in words, bank details and signature block are kept together where possible.
  - Colors and backgrounds print (`print-color-adjust: exact`).
  - Fonts are self-hosted and bundled, so the PDF matches the preview and the ₹ sign always renders.
- First-time helper tip: "Choose **Save as PDF** as the destination, turn **Headers and footers** off, and keep **Background graphics** on."
- Mobile guidance:
  - iOS Safari: Share → Print → Save to Files.
  - Android Chrome: Print → Save as PDF.
- Download marks the invoice as "Downloaded" in history and records the timestamp.

### FR-06: Validation

**Drafts** can be saved in any state.

**Blocking errors** (prevent download):
- At least one line item.
- Quantity > 0; unit price ≥ 0; line discount ≤ line amount; discount % between 0 and 100.
- Invoice discount ≤ subtotal.
- Amount received ≥ 0 and ≤ grand total.
- Due date on or after the invoice date.
- Invoice number not empty.
- Seller name and customer name present.

**Warnings** (the user can choose "Download anyway"):
- Tax Invoice without a seller GSTIN.
- GSTIN fails format or checksum validation, or its state code does not match the selected state.
- Tax Invoice number is longer than 16 characters or contains characters other than letters, digits, `-` and `/` (GST rule for invoice serial numbers).
- Invoice number already used by another invoice in this browser's history.
- Split-GST mode with no place of supply, or with the seller state missing.
- Line items without HSN/SAC on a Tax Invoice.
- Single-GST display mode on a Tax Invoice. The standard format shows CGST/SGST or IGST separately.

### FR-07: Template Gallery

- Six templates: Minimal, Professional, Modern, Corporate, Creative, and Service Invoice (Section 10).
- Each card shows the name, a live thumbnail rendered with sample or current data, a short description and the supported page sizes.
- The current selection is clearly marked.
- Switching templates never changes invoice data or totals.

### FR-08: Template Customization

The options are listed in Section 10.3.
- Changes appear in the preview immediately.
- Designs can be saved with a name, reused, renamed, deleted and set as the default for new invoices.

### FR-09: Payment Status

- **Amount received** field, with an optional payment date and payment mode (UPI, bank transfer, cash, cheque, card, other) and a note.
- **Balance due** = grand total − amount received. It is never negative.
- Status is derived, never set by hand:
  - **Unpaid:** amount received = 0.
  - **Partially paid:** 0 < amount received < total.
  - **Paid:** balance due = 0.
  - **Overdue:** shown in History only, when the due date has passed and the balance is > 0.
- Optional stamp on the invoice ("PAID" or "PARTIALLY PAID"), which can be toggled in customization.
- The amount received can be updated later from History, after which the PDF can be re-downloaded.

### FR-10: Bank / UPI Payment Details

- Bank details from the business profile: account name, account number, IFSC, bank name and branch.
- UPI ID and payee name.
- **UPI QR code**, generated in the browser from `upi://pay?pa=<UPI ID>&pn=<payee name>&am=<balance due>&cu=INR&tn=<invoice number>`.
  - Only shown for INR invoices with a balance due > 0.
  - The amount can be left out (setting) so the payer enters it.
- Each block can be shown or hidden per design.

### FR-11: Customers

- Create, edit, search and delete customers.
- Delete asks for confirmation. Invoices keep their own snapshot of customer details, so deleting or editing a customer never changes past invoices.
- Possible duplicates (same name or GSTIN) are flagged.
- Entering a GSTIN auto-fills the state from the GSTIN's state code.

### FR-12: Item / Service Catalog

- Fields: name, description, HSN/SAC, unit, default price, GST rate, and "price includes GST".
- Create, edit, search and delete.
- Items can be added to an invoice from the line-item autocomplete or a picker.

### FR-13: Invoice History

- An invoice is stored on every autosave of a named draft and on every download.
- List columns: number, type, customer, invoice date, due date, total, balance due, status, and downloaded indicator.
- Search by number or customer. Filter by document type, status and date range. Sort by any column. Paginate.
- Actions:
  - Open/edit.
  - Duplicate (gets a new number).
  - Convert Proforma/Quotation → Tax Invoice (copy with new type and new number).
  - Update amount received.
  - Re-download PDF.
  - Export `.json`.
  - Delete (with confirmation).
- Editing an invoice that has already been downloaded shows a notice: "This invoice was already downloaded. Changes will not update copies you already sent."
- The app never auto-deletes history entries.

### FR-14: Invoice File Export / Import

- "Save invoice file" downloads `<invoice number>.invoice.json`. It contains:
  - A format identifier and `schemaVersion`.
  - The full invoice data.
  - A design snapshot, including the template id/version, customization and embedded logo/signature images, so it re-renders the same way.
- "Open invoice file" (also drag-and-drop) validates the file against the schema, migrates older schema versions, and opens it in the editor as a new history entry.
- Invalid or unrecognized files are rejected with a clear message.
- Imported text is treated as plain data and never rendered as HTML.

### FR-15: Settings

| Group | Settings |
|---|---|
| Business profile | Name, logo, address, state, country, GSTIN, PAN (optional), email, phone, website, bank details, UPI ID/payee name, signature image, authorised signatory name |
| Invoice defaults | Default document type, currency, payment days (due date), notes, terms, payment instructions, footer |
| GST | Registered for GST (yes/no), **GST display mode** (Single / Split), default GST rate, list of available GST rates, prices-include-GST default, round-off on/off |
| Numbering | Prefix and pattern per document type (Section 9), live example |
| Formats | Date format, number grouping (Indian `12,34,567.00` / International `1,234,567.00`) |
| Design | Default template / saved design |
| Export (LUT) | LUT/bond number and declaration text for export invoices |
| Invoice (without GST) | "Invoice" | None; tax columns hidden | `INV` | For businesses not registered under GST; the default when "Registered for GST" is off |
| Bill of Supply | Declaration text (e.g. composition dealer statement) |
| Data & backup | Storage status, usage, persistence, backup/restore, clear all data (Section 11) |

Changing settings affects new invoices only. Saved invoices keep their own snapshot of seller details, settings and design.

---

## 7. Document Types

| Type | Title on document | Tax | Default prefix | Notes |
|---|---|---|---|---|
| Tax Invoice | "Tax Invoice" | GST per Section 8 | `INV` | Standard GST invoice |
| Bill of Supply | "Bill of Supply" | None; tax columns hidden | `BOS` | For unregistered or composition sellers or exempt supplies; declaration text shown |
| Proforma / Quotation | User chooses: "Proforma Invoice", "Quotation" or "Estimate" | GST shown as in a Tax Invoice | `QTN` | Has "Valid until" instead of "Due date"; no payment status; can be converted to a Tax Invoice |
| Export Invoice | "Invoice" or "Export Invoice" | None (export under LUT) | `EXP` | Any currency; LUT declaration shown; no UPI QR; amount in words in the invoice currency |

If "Registered for GST" is **No**, the default document type becomes Invoice (without GST).

> Charging IGST on export invoices (export with payment of tax) is out of scope for this release.

---

## 8. Financial Calculation Rules

### 8.1 Precision and Rounding

- Money is held as integer minor units (paise, cents), or with a decimal library (e.g. `decimal.js`), never as raw JS floats.
- Currency precision comes from the currency (INR/USD: 2 decimals, JPY: 0) using `Intl` currency data.
- Quantity allows up to 3 decimals. Unit price allows up to the currency precision.
- Rounding mode: **half-up (away from zero)** to the currency's minor unit.
- Rounding happens **per line, per tax component**, as defined below. Invoice totals are exact sums of rounded line values, so totals always add up visibly.

### 8.2 Calculation Order — Prices Exclusive of GST (default)

For each line *i*:

1. `base_i = round(qty_i × unit_price_i)`
2. `line_discount_i`: if %, `round(base_i × pct / 100)`; if flat, the entered amount.
3. `discounted_i = base_i − line_discount_i`

Invoice level:

4. `subtotal = Σ discounted_i`
5. Invoice-level discount (Advanced, % or flat) `D` is **allocated pro-rata** to lines: `alloc_i = round(D × discounted_i / subtotal)`. Any rounding remainder goes to the line with the largest `discounted_i`, so `Σ alloc_i = D` exactly.
6. `taxable_i = discounted_i − alloc_i`

   The discount reduces the taxable value, so GST is charged on the discounted value.
7. Tax per line per Section 8.4, each component rounded separately.
8. `taxable_total = Σ taxable_i`; `tax_total = Σ` all tax components.
9. `total_before_roundoff = taxable_total + tax_total`
10. Round-off (if enabled, default on for INR): `grand_total = round(total_before_roundoff to nearest whole unit)`, and `round_off = grand_total − total_before_roundoff`, shown as its own line.
11. `balance_due = grand_total − amount_received`, where `0 ≤ amount_received ≤ grand_total`.

### 8.3 Calculation Order — Prices Inclusive of GST (Advanced)

For each line *i*, the entered price already includes GST:

1. `gross_i = round(qty_i × unit_price_i) − line_discount_i − alloc_i`

   Discounts and allocation work as in Section 8.2, but on inclusive amounts.
2. `taxable_i = round(gross_i × 100 / (100 + rate_i))`
3. `tax_i = gross_i − taxable_i`. The tax is the remainder, so the line total stays exactly what the user entered.
4. Split mode, intra-state: `cgst_i = round(tax_i / 2)`, `sgst_i = tax_i − cgst_i`. Inter-state: `igst_i = tax_i`.
5. Continue from step 8 of Section 8.2.

### 8.4 GST Display Mode (user setting)

Set in **Settings → GST**. The setting is the default, and each invoice can override it in the Advanced section.

| Mode | How tax is shown | Calculation (exclusive pricing) |
|---|---|---|
| **Single GST** | One "GST @ r%" line/column | `gst_i = round(taxable_i × r / 100)` |
| **Split GST** (recommended) | **Intra-state** (place of supply = seller state): CGST @ r/2 % + SGST @ r/2 %. **Inter-state:** IGST @ r % | Intra: `cgst_i = round(taxable_i × (r/2) / 100)`, `sgst_i = round(taxable_i × (r/2) / 100)`. Inter: `igst_i = round(taxable_i × r / 100)` |

- The user always enters a single rate (e.g. 18%). The app derives the split.
- Intra- vs inter-state is decided automatically by comparing the **seller state** with the **place of supply** (from the customer's state or GSTIN by default). The user can override it in Advanced.
- If the seller is in a Union Territory without a legislature (Andaman & Nicobar, Chandigarh, Dadra & Nagar Haveli and Daman & Diu, Ladakh, Lakshadweep), the SGST label reads **UTGST**.
- A **tax summary table** (optional section) groups taxable value and tax amounts by rate (and by HSN/SAC when present).
- Bill of Supply and Export Invoice: no tax is calculated, and tax columns are hidden.

### 8.5 GST Rates

- Default rate list: 0%, 0.25%, 3%, 5%, 18%, 40% (post-September 2025 slabs).
- Users can add or remove rates (e.g. 12% or 28%) in Settings.
- Rates are free numeric values, validated between 0 and 100.

### 8.6 Amount in Words

- INR uses Indian numbering (thousand, lakh, crore), e.g. "Indian Rupees Twenty-Two Thousand Eight Hundred Sixty-Eight Only".
- Paise are included when non-zero.
- Other currencies use international numbering (thousand, million, billion) with the currency's major/minor unit names, e.g. "US Dollars One Thousand Two Hundred and Cents Fifty Only".

### 8.7 Worked Example (Tax Invoice, INR, exclusive, split mode, intra-state)

| Line | Qty × Price | Base | Line disc. | Discounted | Inv. disc. alloc. (5%) | Taxable | CGST 9% | SGST 9% |
|---|---|---|---|---|---|---|---|---|
| Website design | 1 × 15,000.00 | 15,000.00 | — | 15,000.00 | 750.00 | 14,250.00 | 1,282.50 | 1,282.50 |
| Hosting (months) | 12 × 500.00 | 6,000.00 | 10% = 600.00 | 5,400.00 | 270.00 | 5,130.00 | 461.70 | 461.70 |

- Subtotal 20,400.00 − invoice discount 1,020.00 = taxable 19,380.00
- CGST 1,744.20 + SGST 1,744.20 = tax 3,488.40
- Total before round-off 22,868.40, round-off −0.40, **grand total ₹22,868.00**
- Amount received ₹10,000.00, **balance due ₹12,868.00**
- In inter-state or Single mode, the tax is 2,565.00 + 923.40 = 3,488.40, shown as IGST 18% or GST 18%. The total is the same.

This example illustrates the arithmetic only. It is not tax advice.

---

## 9. Invoice Numbering

- Each document type has its own **prefix** and **pattern**, both editable in Settings.
- Supported tokens:

| Token | Meaning | Example (22 Oct 2026, 14:30:52) |
|---|---|---|
| `{PREFIX}` | Document-type prefix | `INV` |
| `{YYYY}` / `{YY}` | Year | `2026` / `26` |
| `{MM}` / `{DD}` | Month / day | `10` / `22` |
| `{HH}` / `{mm}` / `{ss}` | Hour / minute / second (24 h, local time) | `14` / `30` / `52` |
| `{FY}` | Indian financial year (Apr–Mar) | `26-27` |
| `{SEQ}` / `{SEQ:n}` | Running counter in this browser, zero-padded to *n* digits | `001` |

- Default pattern: `{PREFIX}-{YY}{MM}{DD}-{HH}{mm}` → `INV-261022-1430` (15 characters).
- Settings shows a live example and a warning if the result can exceed 16 characters or uses characters other than letters, digits, `-` and `/`.
- The number is generated when a new invoice is created, can be edited, and can be regenerated.
- `{SEQ}` counters are stored per document type (and reset per FY when `{FY}` is in the pattern). Because they live only in this browser, they are included in backups.
- Duplicates within this browser's history trigger a warning.

> **Compliance note:** GST rules expect tax invoice numbers to be consecutive, unique per financial year, and at most 16 characters. Date/time patterns are unique, but they are not consecutive. Users who need strict compliance should use a pattern such as `{PREFIX}/{FY}/{SEQ:3}` (e.g. `INV/26-27/001`). The app shows this tip next to the numbering settings.

---

## 10. Template System

### 10.1 Core Principle

The application keeps three things separate:

1. **Invoice data:** seller, customer, dates, lines, taxes, notes, currency, payments and calculated totals.
2. **Template definition:** layout structure, supported sections and options, and default styles. Each template is a versioned component that renders a normalized, already-calculated invoice view model.
3. **Design customization:** user choices such as logo, colors, fonts, visibility, ordering and page settings. These can be saved as named designs.

Templates only *display* data. They never calculate totals or change invoice data.

### 10.2 Templates

| # | Template | Style |
|---|---|---|
| 1 | Minimal | Clean, black-and-white, lots of whitespace |
| 2 | Professional | Classic business layout, bordered table |
| 3 | Modern | Bold color header band, rounded accents |
| 4 | Corporate | Formal, structured blocks, prominent tax details |
| 5 | Creative | Colorful side panel, playful typography |
| 6 | Service Invoice | Hours/rate-oriented columns, project/description emphasis |

Every template must support:
- Seller and customer blocks and the document title.
- Number, dates and place of supply.
- Line table, with the HSN, unit, discount and tax columns, each optional.
- Subtotal, discounts, the tax breakdown (Single or Split), round-off and grand total.
- Amount in words, amount received and balance due, and the status stamp.
- Notes, terms, bank details, UPI QR, signature and footer.
- Multi-page output.

Hidden sections must not leave gaps or a broken layout.

### 10.3 Customization Options

| Group | Options |
|---|---|
| Branding | Logo (upload, size, position: left / center / right), signature image |
| Colors | Primary color, accent color (picker plus presets); text contrast is checked |
| Typography | Font family from a bundled set (e.g. Inter, Roboto, Noto Sans, Poppins, Lato, Merriweather, Source Serif, IBM Plex Sans; all with ₹ support), base font size 9–12 pt |
| Layout | Table style (bordered / striped / minimal / ruled), density (compact / normal / comfortable), header alignment, header/footer layout variants |
| Visible sections | Logo, tax summary table, amount in words, notes, terms, bank details, UPI QR, signature, status stamp, footer, HSN/unit/discount columns |
| Section order | Reorder the sections below the line table (notes, terms, bank details, QR, signature) |
| Page | Page size A4 / Letter, page margins (narrow / normal / wide); portrait orientation |
| Saved designs | Save as named design, rename, delete, set as default |

The customization panel opens with Branding and Colors visible. The other groups are collapsed so the panel isn't overwhelming.

### 10.4 Versioning

- Each template has a `templateVersion`. Invoices and invoice files record the template id and version plus a design snapshot.
- Because templates ship with the app, a later app update could change how an old invoice looks when it is re-rendered. The **downloaded PDF is the permanent record**. Breaking visual changes to a template should be released as a new version, keeping the old version available to render older invoices where practical.

---

## 11. Browser Storage and Data Safety

### 11.1 What Is Stored

| Data | Storage |
|---|---|
| Business profile, settings, saved designs, logo/signature images | IndexedDB |
| Customers, items catalog | IndexedDB |
| Current draft (autosave) and invoice history | IndexedDB |
| Numbering counters | IndexedDB |
| Small UI preferences (last tab, dismissed tips) | localStorage |

IndexedDB is used for data because localStorage is small (about 5 MB) and synchronous. Images are stored as Blobs and downscaled to a sensible maximum (e.g. 1000 px).

### 11.2 Protection

- On first save, the app requests **persistent storage** (`navigator.storage.persist()`) so the browser is less likely to evict data.
- **Full backup** exports everything (profile, settings, designs, customers, items, history, counters) as one `.json` file.
- **Restore** offers two modes, each with a confirmation and a summary of what will change:
  - Merge: add or update records.
  - Replace: wipe local data, then load the backup.

### 11.3 Warnings (required)

The app must never silently lose or delete data. It shows clear, non-technical warnings in these cases:

| Situation | Warning |
|---|---|
| First visit | "Your data is saved only in this browser on this device. Clearing browsing data, using private/incognito mode, or browser storage cleanup can delete it. Download backups regularly." |
| Persistence denied or unsupported | A persistent banner: "Your browser may automatically clear saved data" (with a link to backup) |
| Private/incognito mode detected (best effort) | "You're in a private window — everything will be lost when you close it." |
| Safari/iOS | Notice that Safari may delete site data after about 7 days without visiting |
| Storage usage above 80% of quota (`navigator.storage.estimate()`) | Warn, and suggest backup and removing old history |
| A save fails (e.g. quota exceeded) | A blocking, visible error stating what wasn't saved and offering "Download backup now". Never ignored silently. |
| Data appears to have been removed | Best-effort detection: the app keeps a small marker and record counts in both localStorage and IndexedDB. If one exists but the other is missing or counts drop unexpectedly, it shows "Some saved data seems to have been cleared by the browser" with a "Restore from backup" action. |
| No recent backup | A reminder when the last backup is older than 14 days (configurable) and there are new or changed invoices |

Settings → Data & Backup shows:
- Persistence status ("Protected" / "May be cleared").
- Storage used.
- The last backup date.
- Backup and restore buttons.
- "Clear all data", which requires typed confirmation.

---

## 12. UI/UX Requirements

### 12.1 Editor Layout

- **Desktop:** the form is on the left and the live preview on the right. A top toolbar holds Document type, Template, Customize, Save invoice file, and **Download PDF**.
- **Tablet:** a collapsible preview pane.
- **Mobile:** single-column form with a "Preview" tab and a sticky "Download PDF" button.

### 12.2 General Rules

- Clear labels, helpful placeholders and inline validation messages.
- Prevent accidental loss: autosave, plus an unsaved-change warning on leave.
- Confirm destructive actions (delete, replace on restore, clear data).
- Loading, empty and error states on every page.
- Full keyboard navigation, visible focus states and accessible form controls. Line reordering also works without drag.
- Currency, date and number formats follow the user's settings.
- Light and dark app themes. Printed invoices always use the template's own colors.

---

## 13. Data Model (TypeScript-level, logical)

```ts
type DocType = 'tax_invoice' | 'bill_of_supply' | 'proforma' | 'export';
type GstMode = 'single' | 'split';
type Discount = { kind: 'percent' | 'flat'; value: string } | null; // decimal strings

interface BusinessProfile {
  name: string; address: string; state?: string; stateCode?: string; country: string;
  gstin?: string; pan?: string; email?: string; phone?: string; website?: string;
  logoId?: string; signatureId?: string; signatoryName?: string;
  bank?: { accountName: string; accountNumber: string; ifsc: string; bankName: string; branch?: string };
  upi?: { id: string; payeeName: string };
}

interface Customer {
  id: string; name: string; company?: string; email?: string; phone?: string;
  billingAddress: string; shippingAddress?: string; state?: string; stateCode?: string;
  country: string; gstin?: string; notes?: string; createdAt: string; updatedAt: string;
}

interface CatalogItem {
  id: string; name: string; description?: string; hsnSac?: string; unit?: string;
  price: string; gstRate: string; priceIncludesGst: boolean;
}

interface LineItem {
  id: string; name: string; description?: string; hsnSac?: string;
  quantity: string; unit?: string; unitPrice: string; discount: Discount; gstRate: string;
  sortOrder: number;
}

interface Invoice {
  id: string; schemaVersion: number; docType: DocType; docTitle: string;
  number: string; invoiceDate: string; dueDate?: string; validUntil?: string;
  currency: string; referenceNo?: string; poNo?: string;
  seller: BusinessProfile;           // snapshot
  customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'> & { customerId?: string }; // snapshot
  placeOfSupply?: { state: string; stateCode: string };
  lines: LineItem[];
  invoiceDiscount: Discount;
  pricesIncludeGst: boolean; gstMode: GstMode; roundOff: boolean;
  payment: { amountReceived: string; date?: string; mode?: string; note?: string };
  notes?: string; terms?: string; paymentInstructions?: string; footer?: string;
  design: { templateId: string; templateVersion: number; customization: DesignCustomization };
  totals: CalculatedTotals;           // derived; recomputed on load, never trusted from a file
  downloadedAt?: string; createdAt: string; updatedAt: string;
}

interface SavedDesign { id: string; name: string; templateId: string; customization: DesignCustomization; isDefault: boolean }
```

Monetary and quantity values are stored as **decimal strings** and converted to minor units only inside the calculation engine. Totals are always recomputed from the inputs. Totals stored in a record or file are never treated as authoritative.

---

## 14. Validation Helpers

- **GSTIN:** 15 characters matching `^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$`, plus check-digit verification. The first two digits must be a valid state code.
- **IFSC:** `^[A-Z]{4}0[A-Z0-9]{6}$`.
- **UPI ID:** `<handle>@<provider>` format.
- **Email and phone:** format checks; these produce warnings only.
- **Images:** PNG, JPEG, WebP or SVG, at most 2 MB before downscaling. SVG is only ever displayed through `<img>`, never inlined.

---

## 15. Non-Functional Requirements

### Privacy and Security
- No invoice or business data is ever sent to any server. There are no analytics or third-party trackers by default.
- No runtime calls to external CDNs: fonts and libraries are bundled.
- A strict Content-Security-Policy is set via `vercel.json` headers.
- User content is never rendered as raw HTML (no `dangerouslySetInnerHTML` with user data).
- Imported files are schema-validated and size-limited.

### Performance
- First load under 2 s on a typical 4G connection; keep the JS bundle lean.
- Recalculation and preview update with no noticeable delay for invoices of up to 200 lines.
- The print dialog opens within 1 s of clicking Download.

### Compatibility
- Latest Chrome, Edge, Firefox and Safari on desktop; Chrome on Android; Safari on iOS.
- Print output is tested in each desktop browser for A4 and Letter.

### Accessibility
- Target WCAG 2.2 AA for the app UI.

### Reliability
- Autosave must not corrupt data. Writes are atomic per record.
- Schema migrations run on load for stored data and imported files.

---

## 16. Technical Architecture

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router) with `output: 'export'` (fully static), TypeScript |
| Hosting | Vercel free tier, auto-deploy from GitHub |
| Styling | Tailwind CSS for the app UI; template styles via CSS variables (design tokens) shared by preview and print |
| State | Lightweight store (e.g. Zustand) for the editor |
| Storage | IndexedDB via Dexie (or `idb`) |
| Money math | `decimal.js` (or `big.js`) inside a pure calculation module |
| Validation | Zod schemas for invoices, settings, imports and backups |
| QR code | `qrcode` library, generated client-side |
| Fonts | Self-hosted via `next/font` |
| PDF | Browser print with dedicated print CSS |
| Testing | Vitest (calculation engine, amount-in-words, numbering, GSTIN, migrations); Playwright (E2E flows, print/PDF visual checks) |

**Module boundaries:** `calc/` (pure engine), `numbering/`, `gst/` (state codes, GSTIN, split logic), `storage/` (Dexie, backup, warnings), `templates/` (six template components plus the shared primitives), `editor/`, `pages`.

---

## 17. Acceptance Criteria (MVP)

**Setup and storage**
- A user can use the app without any login and save a business profile that persists across reloads.
- First-visit, persistence, private-mode, quota and failed-save warnings appear as specified.
- Full backup and restore (merge and replace) work and round-trip all data.

**Invoice creation**
- A user can create each of the four document types.
- A user can pick or add a customer and add lines manually and from the catalog.
- Totals match Section 8 for exclusive and inclusive pricing, line and invoice discounts, Single and Split GST (intra and inter), round-off, and amount received. This is verified by unit tests including the Section 8.7 example.
- The GST display mode can be set in Settings and overridden per invoice.
- Blocking validation prevents download; warnings allow "Download anyway".
- The draft survives a page refresh.

**Templates and design**
- All six templates render every required section and support multi-page invoices without clipped or missing content.
- Switching templates or designs never changes data or totals.
- Logo, colors, fonts, layout, sections, order and page size are customizable. Designs can be saved and reused, and one can be set as the default.

**Output**
- Download PDF produces a correct, selectable-text PDF in Chrome, Edge, Firefox and Safari, matching the preview.
- Amounts, number and dates in the PDF match the editor.
- The UPI QR code scans in common UPI apps with the correct payee, amount and note.

**History and files**
- Invoices appear in History. A user can search, filter, sort, re-open, duplicate, convert a quotation to an invoice, update the amount received, re-download and delete.
- An exported `.invoice.json` re-opens in another browser and renders identically.

---

## 18. Development Phases

1. **Foundation:** Next.js static setup, Vercel deploy, app shell and navigation, Dexie storage layer, settings and business profile, storage warnings, backup/restore.
2. **Invoice engine:** calculation engine and tests, GST logic (modes, states, UTGST), numbering, amount in words, editor form, line items, catalog, customers, autosave, validation.
3. **Templates and output:** shared template primitives, six templates, customization panel, saved designs, live preview, print CSS and PDF, UPI QR.
4. **History and files:** history list and actions, payment status, invoice JSON export/import, conversions.
5. **Quality and release:** cross-browser print testing, accessibility pass, mobile pass, performance budget, production deploy.

---

## 19. Future Enhancements

- Optional cloud backup or sync (e.g. Google Drive), and optional accounts.
- PWA / offline install.
- Multiple business profiles.
- Cess, reverse charge, shipping and other charges with their own GST rate.
- Export with payment of IGST; exchange-rate field for export invoices.
- E-invoicing (IRN, signed QR) for businesses above the threshold; e-way bill details.
- Email sending, payment links and reminders; recurring invoices.
- Credit and debit notes.
- History export to Excel/CSV; GSTR-1 friendly export.
- Direct one-click PDF download (e.g. a react-pdf based renderer) as an alternative to print.

---

## 20. Change Log from v1.0

| Area | v1.0 (SaaS) | v2.0 (this document) |
|---|---|---|
| Architecture | Next.js + backend API + PostgreSQL | Static Next.js site, no backend |
| Hosting | Unspecified, paid infrastructure | Vercel free tier |
| Auth | Email/password, verification, reset | None; open to anyone |
| Tenancy | Multi-tenant with server authorization | Single user per browser; data stays local |
| Data storage | Server database and object storage | Browser IndexedDB plus JSON export/backup |
| Calculations | Server authoritative | Client-side pure engine, deterministic and tested |
| PDF | Server rendering | Browser print to PDF from the preview HTML |
| Tax | Generic, configurable | Indian GST with Single or Split (CGST+SGST/UTGST or IGST) display mode |
| Document types | Invoice only | Tax Invoice, Bill of Supply, Proforma/Quotation, Export |
| Numbering | Sequential, server-assigned on issue | User-defined pattern with date/time/FY/SEQ tokens |
| Payments | Multiple payment records with audit trail | Single "amount received" with derived status |
| Lifecycle | Draft → Issued → Paid / Void with locking | Draft → Downloaded; editing allowed, with a notice |
| Audit log, rate limiting, backups | Required | Not applicable; replaced by local backups and storage warnings |
| New | — | UPI QR, amount in words, item catalog, storage-loss warnings, invoice file import |

---

## 21. Usability Principles (added after UX review, 22 Oct 2026)

- **Essentials first:** item rows show name, quantity, rate and GST; description, unit, discount and HSN/SAC sit under "More details" (opened automatically when filled). Reference/PO and customer email/phone appear on request.
- **No nagging:** advisory checks (missing GSTIN, HSN/SAC, state) appear only when the user presses Download; invalid input (e.g. a mistyped GSTIN) is flagged immediately.
- **Never type twice:** on download, the seller becomes the business profile if none exists, and the customer is saved or linked to a matching saved customer.
- **First run:** offers "Create my first invoice", "Restore a backup" and "Open an invoice file".
- **Always-visible quick toolbar** on app screens (search/commands, new document, open file, backup/restore, install app, theme) and a command palette (Ctrl/⌘ K).
