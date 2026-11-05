# Feature List — Business & GST Suite (local-first)

**Date:** 5 November 2026
**Supersedes:** the scope and Phase 1 design in `plans/business-gst-suite.md` where they conflict.
**Hard constraints:** static Next.js export, IndexedDB only, no backend, no login, no network calls (CSP `connect-src 'self'`). A desktop app (Tauri recommended) will reuse this code later and add disk storage, automatic backups and more.
**Legal note:** GST/DPDP rules below are product rules, not legal advice. Every generated return is a *draft prepared from your records*; users verify on the GST portal or with their CA.

---

## Implementation status (as of 5 Nov 2026, branch `dev`)

- **Built (P0 + P1):** sections A, B, D, E, F (F1–F10), G, H and I, plus C1, C2 and C5. Typecheck, 416 unit tests and the production build pass.
- **C5 (share):** a *Share…* dialog (History row menu and editor menu) with an editable, prefilled message and WhatsApp (`wa.me`), email (`mailto:`), copy and Web Share buttons. The message includes the existing UPI pay link. The PDF is not attached automatically because it comes from the browser print dialog; the dialog tells the user to attach it.
- **A11 (audit log):** the log is written for invoices, expenses, incomes and filings; a per-document *History of changes* dialog (History row menu and editor menu) shows invoice entries. Expenses, incomes and filings have no view yet.
- **Phase 2-4 foundation (landed):** Dexie v3, backup v3, schemas, DB layer, hooks and tab/route stubs for the next feature set; see `plans/PHASE2-4-OWNERSHIP.md`. The stubs show "Coming in this release" until built.
- **Not verified:** GSTR-1/3B output against real returns; cross-browser PDF/print, accessibility and 360 px passes.
- **Not started:** C3, C4, F11, F12 (P2); D7, D8, F13, K1–K5 (P2/P3); F14 (P4); section J (desktop).
- Individual P1 rows were not each re-checked one by one; treat "built" as "implemented and covered by tests", not "signed off".

---

## 1. Research summary

### 1.1 Current app — verified facts (code audit)

| Area | Finding | Evidence |
|---|---|---|
| Arithmetic | `decimal.js`, 40-digit precision, half-up rounding per currency minor unit; invoice discount allocated pro-rata with remainder to the largest line. Correct. | `src/lib/calc/engine.ts`, `src/lib/money.ts` |
| Tests | 100/100 pass. `pnpm typecheck` fails on a fresh clone until `next typegen` runs (`PageProps` missing). | `pnpm test`, `pnpm typecheck` |
| Per-line rounding | Tax is rounded per line and per head. 10 lines × ₹10.05 @5% intra: CGST 2.50 vs 2.51 if computed on the total. Legal, but GSTR-1 totals must be summed from the same line values. | probe test |
| Inclusive intra split | CGST = round(tax/2), SGST = remainder → may differ by ₹0.01. Acceptable; document it. | `engine.ts:applyTax` |
| Overpayment | `amountReceived` is clamped to the grand total — advances/excess silently disappear. | `engine.ts` step 11 |
| Negative qty | Clamped to 0 — credit notes must be a separate document type, not negative lines. | probe test |
| Round-off | Only enabled for INR invoices. Correct. | `invoice-factory.ts:137` |
| Numbering | Default pattern `{BIZ}-{YY}{MM}{DD}-{RAND:4}` is **random**, not consecutive (Rule 46 requires a consecutive serial ≤16 chars, unique per FY). 16-char limit only warns. | `numbering.ts:9`, `:139` |
| "Draft" | Draft = never downloaded (`!downloadedAt`). No explicit issued state. | `invoice-calc.ts:31` |
| Re-download | `saveInvoice` re-stamps `updatedAt` on every PDF download. | `invoices.ts:62`, `use-download.tsx:79` |
| Deletion | Issued invoices can be hard-deleted → number gaps. | `history-view.tsx:563` |
| Tax head | `gstMode: "single"` stores one "GST" figure; unknown states assumed intra-state; manual `supplyType` can contradict place of supply; export docs can never carry IGST (`docTypeHasTax`). | `gst/tax.ts` |
| Validation | No ₹50,000 rule for unregistered B2C recipient name/address. Rate is validated as a number only (not against allowed rates for the date). | `validation.ts` |
| Save path | `saveInvoice` does not run `invoiceSchema.parse`; `useInvoices` silently drops invalid rows. | `invoices.ts`, `hooks.ts` |
| Offline | Manifest exists but **no service worker** — the "installed app" does not open offline. | `manifest.webmanifest`, no SW |
| Data-loss marker | Counts only customers/items/invoices/designs. `clearAllData` clears only existing tables. | `db.ts:52`, `backup.ts` |
| PIN lock | PBKDF2-SHA256 100k on a 6-digit PIN; it is a UI gate, **not encryption**. 10⁶ PINs are brute-forceable offline in minutes. `pinHash`/`pinSalt` are written into backup files with the rest of settings. | `security.ts`, `backup.ts:buildBackup` |
| Backups | Plain JSON with all customer personal data; no encryption option. | `backup.ts` |
| Pay link | Payment data travels in the URL `#fragment` (never sent to the server). Good. | `pay-view.tsx` |
| Fonts | Self-hosted via `next/font`; no runtime third-party requests. Good. | `app/fonts.ts` |

### 1.2 Privacy page audit (`/privacy`)

Accurate: no accounts, no analytics, invoices stay in IndexedDB, payment links use a fragment.

Missing or incomplete:
1. No mention of `localStorage` (data-loss marker with record counts, dismissed banners) or `sessionStorage` (PIN unlock state, failed attempts).
2. Does not name the host (Vercel) or explain that standard server logs may be processed outside India.
3. No contact / grievance channel for the website operator (DPDP s.8(10) and Rule 9 expect a contact for data-principal queries for data the operator does hold, e.g. server logs).
4. Does not explain roles: the **business user is the Data Fiduciary for its customers' personal data**; the app vendor never receives it.
5. Does not say the PIN lock is not encryption and that backups are unencrypted files.
6. No retention guidance (GST law requires keeping records ~72 months; DPDP requires erasure once no longer needed *unless a law requires retention*).
7. No "Last updated" change log; no children's-data statement; no security-incident statement.

### 1.3 Regulatory landscape relevant to features

**GST (verify on portal before filing)**
- Rates since 22 Sep 2025: 0, 0.25, 3, 5, 18, 40 (12%/28% removed for most goods; tobacco/compensation-cess transition later). Old invoices may still carry 12/28 → rate validation must be **date-aware**.
- Invoice (Rule 46): consecutive serial ≤16 chars (letters, digits, `-`, `/`), unique per FY; recipient name/address/state mandatory for unregistered recipients when value ≥ ₹50,000; place of supply + state for inter-state; signature.
- GSTR-1 Table 12 (HSN) split into **B2B and B2C** tabs (advisory 1 May 2025); HSN picked from a master list; mandatory for B2B, optional for B2C ≤ ₹5 cr AATO (CBIC clarification).
- B2CL: inter-state unregistered invoice > ₹1 lakh (from Aug 2024). CDNUR only for notes against B2CL/export invoices; notes against B2CS net inside B2CS.
- GSTR-3B: Tables 3.1/3.2 auto-populated and locked; corrections via GSTR-1A before 3B; ITC tied to GSTR-2B/IMS (stricter from July 2026 per secondary sources). RCM ITC goes to 4A(3), not 4A(5).
- 3-year time bar for filing returns (from July 2025 tax periods).
- E-invoice: AATO > ₹5 cr in any FY since 2017-18; 30-day IRP window for AATO ≥ ₹10 cr; IRN cancel within 24 h.
- Records: s.36 CGST — keep 72 months from annual-return due date (longer if proceedings pending); Rule 57 — electronic records need **proper backup restorable in reasonable time** and must be producible on demand.
- Credit note time limit (s.34): 30 November after FY end, or annual return date if earlier.

**DPDP Act 2023 + DPDP Rules 2025** (notified 13 Nov 2025; most fiduciary duties from **13 May 2027**; consent-manager rules ~Nov 2026)
- The business using the app is a Data Fiduciary for customer/vendor personal data (names, phones, emails, addresses). Duties the app can *help* with: notice (s.5), purpose limitation, reasonable security safeguards (s.8(5), Rule 6: encryption, access control, logs, backups), breach intimation (s.8(6), Rule 7: Board within 72 h), erasure when purpose ends **unless retention is required by law** (s.8(7), Rule 8), grievance handling (s.8(10)), data-principal rights (access s.11, correction/erasure s.12).
- The vendor (us) is a fiduciary only for what it holds: hosting logs and any support emails.

**Income tax / MSME**
- Income-tax Act 2025 in force from 1 Apr 2026 (1961 Act for earlier years). MSME payment rule 43B(h) → s.37(2)(g) of the 2025 Act: pay MSE suppliers within 15 days (no agreement) / 45 days (agreement) or the deduction is deferred. Useful for payables and for MSME sellers printing Udyam number.

**Companies Act (verify)**: companies using accounting software must keep an edit-log/audit trail that cannot be disabled (Companies (Accounts) Rules, Rule 3(1)). We are not accounting software, but an immutable local change log is cheap and helps CAs.

### 1.4 Platform strategy

| Capability | Web (now) | Desktop (later, Tauri) |
|---|---|---|
| Storage | IndexedDB + `navigator.storage.persist()` | SQLite file on disk (WAL), same schema via a storage adapter |
| Automatic backups | File System Access API: user picks a folder once; app writes rotating backups (Chromium only); reminders elsewhere | Scheduled backups with rotation, to any folder / external drive |
| Encryption | Optional passphrase-encrypted backups (AES-GCM, PBKDF2 ≥ 600k) | Encrypted DB with key in OS keychain |
| Offline | Service worker precache | Native |
| Attachments | Not in P1 (IndexedDB bloat) | Files on disk next to DB |
| Printing | Browser print | Silent PDF export to folder |

To make the desktop port cheap, **all reads/writes go through `src/db/*` functions** (no direct Dexie use in components) — that layer becomes the adapter boundary.

---

## 2. Feature list

Priority: **Must** / **Should** / **Later**. Phase: **P0** foundation, **P1** current build, **P2–P4** later, **D** desktop. Platform: Web/Desktop/Both.
UI rule for every feature: **simple first** — one primary action per screen, advanced fields collapsed, plain-language labels, works at 360 px width, keyboard accessible.

### A. Foundation & data safety (P0, Must, Both)

| ID | Feature | Details / acceptance |
|---|---|---|
| A1 | Explicit issued state | `issuedAt` timestamp set when an invoice is downloaded/printed/shared **or** marked "Issued" manually. Returns use `issuedAt`, not `downloadedAt`. Existing downloaded invoices migrate to `issuedAt = downloadedAt`. |
| A2 | No hard delete after issue | Issued invoices cannot be deleted; actions are **Cancel** (if its period is not filed) or **Create credit note**. Drafts can still be deleted. |
| A3 | Sequential numbering default | New default pattern `{PREFIX}/{FY}/{SEQ:3}` (e.g. `INV/26-27/001`, 14 chars). Existing users keep their pattern but see a one-time notice if it uses `{RAND}`. Separate series per doc type. |
| A4 | 16-char block | For tax invoice, bill of supply, export, credit/debit note: number >16 chars or invalid chars is a blocking error at issue time. |
| A5 | Schema v2 with migration | Invoice `schemaVersion` accepts 1 and upgrades to 2 with defaults; all new fields defaulted; `saveInvoice` parses before write. |
| A6 | Dexie v2 | New tables `expenses`, `incomes`, `filings`, `returnSnapshots`, `auditLog`. No destructive rewrite. Handle `versionchange`/blocked (other tab open) with a "Reload to update" banner. |
| A7 | Backup v2 | Includes all new tables; v1 backups still restore; **settings.security is excluded from backups**; restore never overwrites the current PIN. |
| A8 | Data health | Counts invalid rows per table (instead of silently dropping) and shows them in Settings → Data with "Download raw rows". |
| A9 | Loss detection & clear-all | `COUNTED_TABLES` and `clearAllData` cover all tables. |
| A10 | Content hash for change detection | `returnHash(invoice)` over return-relevant fields only; downloads no longer look like edits. |
| A11 | Audit log (local) | Append-only `auditLog` rows: entity, id, action (create/update/issue/cancel/delete), timestamp, short diff of key fields. Shown per invoice ("History of changes"). Pruned only by explicit user action. |
| A12 | Typecheck script | `typecheck` runs `next typegen && tsc --noEmit` so a fresh clone passes. |

### B. Invoice compliance (P1, Must, Both)

| ID | Feature | Details / acceptance |
|---|---|---|
| B1 | Credit note & debit note | New doc types with own numbering (`CN/`, `DN/`). Created **from an invoice** ("Create credit note" in History/editor) — copies party, POS, lines; user edits lines/amounts; stores original number/date and reason (Sales return, Post-sale discount, Deficiency in service, Correction in invoice, Change in POS, Finalization of provisional assessment, Others). Positive amounts; returns subtract/add. Status shows "Credit note"/"Debit note", not "quote". |
| B2 | Credit-note time limit | Warn if the note date is after 30 Nov following the original invoice's FY. |
| B3 | Cancel invoice | Allowed only when issued and its return period is not marked filed; requires reason; cancelled invoices show a "CANCELLED" stamp, stay in the number series, count in DOCS. After filing → button changes to "Create credit note". |
| B4 | Supply nature | Per invoice: Taxable / Nil-rated / Exempt / Non-GST / Zero-rated (export/SEZ). Collapsed under "GST details". |
| B5 | Reverse charge flag | "Tax payable on reverse charge" Yes/No; printed on invoice when Yes. |
| B6 | Export & SEZ details | Export type: with IGST payment / under LUT (+ LUT no.); SEZ with/without payment; shipping bill no/date, port code; **INR exchange rate** (required for non-INR). Exports/SEZ with payment calculate IGST. |
| B7 | Tax-head integrity | Single-GST mode still records IGST vs CGST/SGST internally from POS; unknown seller state/POS = blocking error at issue for tax invoices; contradicting manual intra/inter override = warning. |
| B8 | Date-aware GST rates | Rate list valid for the invoice date (0, 0.25, 3, 5, 18, 40 from 22 Sep 2025; 5/12/18/28 etc. before). Unsupported rate → warning in editor, error in returns. |
| B9 | B2C ≥ ₹50,000 rule | Unregistered recipient with invoice value ≥ ₹50,000: name, address, state required (error). |
| B10 | Line item type & UQC | Goods/Services per line (auto from HSN: SAC 99xx = services); UQC auto-mapped from unit (pcs→PCS, nos→NOS, kg→KGS, g→GMS, ltr→LTR, m→MTR, sq.ft→SQF, box→BOX, set→SET, hrs/days/months/job→OTH); editable. |
| B11 | HSN digits rule | From settings AATO: ≤ ₹5 cr → 4 digits min, > ₹5 cr → 6 digits; services SAC 6 digits recommended. |
| B12 | Structured address | Seller & customer: city, PIN (6 digits); seller legal name/trade name; MSME Udyam number (optional, printed). |
| B13 | Overpayment/advance | Amount received above total is not silently clamped: warning "₹X more than the total — record the excess as an advance" (stored in payment ledger in P2). |

### C. Payments & receivables

| ID | Feature | Phase | Details |
|---|---|---|---|
| C1 | Receivables ageing | P1 | 0–30, 31–60, 61–90, 90+ days from due date (invoice date if none); list top overdue customers; click → filtered History. |
| C2 | MSME 45-day note | P1 | If seller has Udyam no., optional line on invoice: "Payable within 45 days as per MSMED Act" and due date defaults to ≤45 days. |
| C3 | Payment ledger | P2 | Multiple payments per invoice (date, amount, mode, ref); receipts; advances. |
| C4 | Customer statement | P2 | Printable statement for a date range with opening balance, invoices, notes, payments. |
| C5 | Share without backend | P1 | Web Share API (mobile) for PDF; `mailto:`/WhatsApp `wa.me` link with prefilled text (no data sent by us). |

### D. Expenses (P1, Must, Both)

| ID | Feature | Details |
|---|---|---|
| D1 | Add/edit/delete expense | Quick form: date, amount, category, paid to, payment status. "GST & ITC" section collapsed: vendor GSTIN (validated, auto-state), vendor invoice no/date, GST rate, amount includes GST, intra/inter (auto from vendor state vs seller state, override), ITC eligible, ITC type (inputs / input services / capital goods / ineligible), reverse charge. |
| D2 | Computed summary | taxable, CGST, SGST, IGST, total computed with Decimal on save. |
| D3 | Categories with ITC defaults | Default categories: Rent, Salaries & wages, Utilities, Internet & phone, Travel, Fuel, Food & entertainment, Office supplies, Software & subscriptions, Professional fees, Marketing, Repairs & maintenance, Raw materials, Purchases for resale, Freight, Bank charges, Insurance, Taxes & fees, Equipment, Other. Food & entertainment, Fuel (motor vehicle), Insurance (personal) default to **ITC ineligible (s.17(5))**; Salaries/Bank charges/Taxes default to no GST. Editable in Settings. |
| D4 | ITC eligibility guard | ITC eligible defaults to true only with a valid vendor GSTIN + invoice no; otherwise disabled with an explanation. |
| D5 | List & filters | Period (this month / last month / quarter / FY / custom), category, GST only, ITC only, payment status; totals row; CSV export. |
| D6 | Quick add | From dashboard and command palette. |
| D7 | Recurring expenses | P3 |
| D8 | Receipt attachments | P3 web (size-capped) / D desktop (files on disk). |

### E. Other income (P1, Must, Both)

| ID | Feature | Details |
|---|---|---|
| E1 | Income entries | Date, source, category (Interest, Commission, Rent received, Refund, Other), amount, notes. Banner: "Sales come from your invoices — use this only for income without an invoice." |
| E2 | List & CSV | Same filters/period as expenses; tab next to Expenses ("Money out" / "Money in"). |

### F. GST Returns (P1, Must, Both)

| ID | Feature | Details |
|---|---|---|
| F1 | Filing profile | Settings → GST & filing: registration type (regular / composition / unregistered), frequency (monthly / QRMP), QRMP state group (auto from seller state: 22nd vs 24th), AATO (₹), e-invoice applicable, HSN digits (auto from AATO). Composition/unregistered → GST Returns page explains it doesn't apply (GSTR-4/CMP-08 later). |
| F2 | Period picker | Month or quarter per frequency; prev/next; FY label; due date shown. |
| F3 | GSTR-1 engine (pure) | Sections: B2B (incl. SEZ/deemed export flags, reverse charge), B2CL, B2CS (net of B2CS notes), EXP (WPAY/WOPAY), CDNR, CDNUR (only notes against B2CL/EXP), NIL (nil/exempt/non-GST, intra/inter, reg/unreg), HSN **B2B and B2C** tables, DOCS (series from/to/total/cancelled). Values in INR; totals from line values. |
| F4 | Validation panel | Blocking errors vs warnings, each with "Fix" link that opens the record and focuses the field. Export disabled while errors exist. |
| F5 | Exports | GSTR-1 JSON (portal/offline-tool schema via a versioned adapter + `formatVersion`), section CSVs (zip-free: one CSV per section in a single download sequence or a combined CSV with a section column), printable summary. Every file carries GSTIN, period, generated time, "Draft prepared from your records". |
| F6 | GSTR-3B worksheet | 3.1(a) taxable outward, 3.1(b) zero-rated, 3.1(c) nil/exempt, 3.1(d) inward RCM (from expenses), 3.1(e) non-GST, 3.2 inter-state to unregistered by POS, 4A(3) RCM ITC, 4A(5) other ITC, 4B ineligible, 4C net ITC, estimated payable per head. Banner: portal values are auto-populated/locked; reconcile ITC with GSTR-2B/IMS. Print + CSV. |
| F7 | Filing tracker | Per period & return: Not started → Data ready → Exported → Filed (ARN, filed date, notes). Snapshot (hash per record) saved on export and on Filed. |
| F8 | Changed since filed | If any invoice/expense in a filed period is added/edited/cancelled/deleted after the snapshot: warning on the returns page + on the record editor ("This period was filed on … — corrections go in GSTR-1A or a later return"). |
| F9 | Compliance calendar | Next due dates for GSTR-1/IFF/3B/PMT-06 by frequency; dashboard card; overdue in red; 3-year time-bar warning. |
| F10 | Late fee & interest estimator | Days late × ₹50/day (₹20 nil) with turnover-based cap; interest 18% p.a. on net cash tax; clearly "estimate". |
| F11 | GSTR-1A / amendments | P2 |
| F12 | E-invoice bulk JSON + IRN entry | P2 (applicability: AATO > ₹5 cr; 30-day warning ≥ ₹10 cr; 24 h cancel window). |
| F13 | GSTR-2B/IMS import & ITC match | P3 |
| F14 | GSTR-9 / 9C worksheet | P4 |

### G. Dashboard, analytics & registers (P1, Must, Both)

| ID | Feature | Details |
|---|---|---|
| G1 | Dashboard | This month: Sales, Expenses, Profit (each vs last month), GST estimate (output − ITC), Receivables (outstanding/overdue), next filing due + status, 2–3 insights, quick actions (New invoice, Add expense, GST returns). |
| G2 | Analytics page | Tabs: Overview · Sales · Expenses · GST · Receivables · Registers. Period + compare-to selector. |
| G3 | Charts | Small custom SVG charts (bar, line, donut, stacked bar) with text summary + data table toggle; no chart library; colour not the only signal. |
| G4 | Metrics (definitions in tooltips) | Sales revenue (taxable value INR, issued, net of notes, excl. drafts/proforma/cancelled), Other income, Expenses (taxable + non-creditable GST), Net profit, Net margin, Growth (— when previous is 0), Output tax, Eligible ITC, Effective GST rate, Top-customer share, Expense ratio, Data coverage line. |
| G5 | Insights (deterministic) | Revenue/expense change > 20%, profit negative, one customer > 40% of sales, overdue > 30% of receivables, filing due ≤ 5 days, records excluded for missing GST data. Each with severity, explanation and a link. |
| G6 | Registers | Sales register, Credit/debit note register, Expense register, Income register, HSN summary, Receivables; CSV export + print view with business name, GSTIN, period. |
| G7 | Drill-down | Clicking a bar/segment filters the register below. |
| G8 | Reconciliation | Analytics totals = register totals = GSTR-1 totals for the same period (unit-tested). |

### H. Privacy, security & DPDP (P1, Must, Both)

| ID | Feature | Details |
|---|---|---|
| H1 | Privacy page rewrite | Sections: Short version · What stays on your device (IndexedDB, localStorage marker, sessionStorage lock state) · What we (the website) can see (hosting logs; host named; may be processed outside India) · Your role under DPDP (you are the Data Fiduciary for your customers' data) · Security (PIN is a screen lock, not encryption; use encrypted backups; device disk encryption) · Retention (keep GST records ~72 months; erase personal data after that unless law requires) · Your rights & contact (grievance email) · Children · Changes (dated). |
| H2 | Encrypted backups | Optional passphrase: AES-GCM 256 with PBKDF2-SHA256 600k iterations, random salt/IV; file format `invoice-generator/backup-encrypted`; restore prompts for passphrase; wrong passphrase → clear error. |
| H3 | Backup hygiene | PIN hash/salt never exported; restore keeps local security settings. |
| H4 | Customer data tools | Per customer: "Export data" (JSON of the customer + their invoices summary) and "Erase personal data": removes customer master + optional fields (email, phone) and anonymises them on **drafts**; issued invoices keep legally required fields with an explanation (retention required by GST law, s.8(7) exception). |
| H5 | Retention helper | Settings → Data: shows records older than the retention period (default 8 FYs) with "Export then delete" for drafts/old data; never auto-deletes. |
| H6 | Privacy notice template | Copyable short notice the business can give customers (what data, why, how long, contact) — DPDP s.5 help. |
| H7 | Breach checklist | Help text in Settings → Security: what to do if a device is lost (rotate backups passphrase, inform affected customers, Board within 72 h if applicable). |
| H8 | PIN hardening | Explain it is a screen lock; increase KDF iterations to 600k for new PINs (old hashes still verify, upgraded on next unlock). |

### I. Backup & offline (P1 web, Must)

| ID | Feature | Details |
|---|---|---|
| I1 | Offline service worker | Precache the static export (app shell, routes, fonts, icons); cache-first for `/_next/static`, network-first for HTML; update toast "New version — reload". |
| I2 | Auto-backup to a folder | Chromium (File System Access API): "Choose backup folder" once → app writes `backup-YYYY-MM-DD.json` (encrypted if passphrase set) after changes, max once per day, keeps last N (default 14). Permission re-prompt handled. Unsupported browsers fall back to reminders. |
| I3 | Backup reminders | Existing reminder kept; shows records changed since last backup. |
| I4 | Restore preview | Shows counts per table, date, encrypted yes/no before merge/replace. |

### J. Desktop app (D, Should) — plan only

| ID | Feature | Details |
|---|---|---|
| J1 | Tauri 2 shell | Wrap static export; small installer; auto-update with signed releases. |
| J2 | SQLite storage adapter | Same `src/db/*` API backed by SQLite (WAL); one-click import from web backup. |
| J3 | Scheduled backups | Hourly/daily with rotation to chosen folder/external drive; verify after write. |
| J4 | Encrypted DB | Key in OS keychain; optional passphrase. |
| J5 | Attachments on disk | Receipts/bills as files linked to expenses. |
| J6 | PDF to folder | Save every issued invoice PDF automatically to `Invoices/FY/`. |
| J7 | Multi-company | One DB file per GSTIN; switcher. |

### K. Productivity (later)

| ID | Feature | Phase |
|---|---|---|
| K1 | Recurring invoices | P2 |
| K2 | CSV import (customers, items, expenses) | P2 |
| K3 | Vendor master & purchase bills, payables ageing, MSME 45-day payable alerts | P3 |
| K4 | Cash-flow report | P3 |
| K5 | Tax pack for CA (annual registers + GST reconciliation) | P4 |

---

## 3. Not building

Direct GSTN/IRP filing, cloud sync, multi-user, server-sent reminders, e-way bill, payroll, inventory, double-entry ledger, ITR filing, third-party analytics/telemetry. All require a backend or are separate products.

## 4. Navigation (simple)

Desktop sidebar: **Dashboard · Invoices (History) · New invoice · Money (Expenses/Income) · GST Returns · Analytics · Customers · Items · Templates · Settings**.
Mobile bottom bar: Dashboard · Invoices · **+** · GST · More.

## 5. Build order for P0 + P1

1. Foundation (A1–A12, H3, schema/DB/backup v2).
2. In parallel: Expenses & Income (D, E) · GST return engine (F3, F4 logic, F6 logic, F9/F10 logic) · Invoice compliance (B) · Analytics engine + charts (G3, G4, G5 logic) · Privacy/backup/offline (H, I).
3. In parallel: GST Returns UI (F1, F2, F4–F10) · Dashboard + Analytics UI + registers (G).
4. Integration, navigation, full test/typecheck/lint/build.

## 6. Sources

- DPDP Rules 2025: [PIB notification PDF](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf), [India Briefing](https://www.india-briefing.com/news/dpdp-rules-2025-india-data-protection-law-compliance-40769.html/), [Taxmann analysis](https://www.taxmann.com/post/blog/analysis-indias-dpdp-act-and-rules), [DSCI — reasonable security safeguards](https://www.dsci.in/files/content/documents/2025/reasonable-security-safeguards.pdf), [KS&K on Rule 6](https://ksandk.com/data-protection-and-data-privacy/dpdp-rule-6-and-indias-new-cybersecurity-compliance-standard/)
- GSTR-1 Table 12: [TaxTMI advisory](https://www.taxtmi.com/news?id=40595), [A2Z — CBIC clarification](https://a2ztaxcorp.net/cbic-issued-clarification-on-gstns-tweet-hsn-code-requirement-in-gstr-1-mandatory-for-b2b-optional-for-b2c-below-%E2%82%B95-crore-turnover/)
- GSTR-3B locking / time bar: [SAG Infotech — Table 3.2](https://blog.saginfotech.com/gst-advisory-gstr-3b-table-3-2-auto-values-inter-state-supplies-non-editable), [Taxscan — July 2026 ITC locking](https://www.taxscan.in/top-stories/big-gst-change-from-july-2026-gstr-3b-itc-locking-explained-1448389)
- E-invoice: [TaxGuru — Oct 2026](https://taxguru.in/goods-and-service-tax/gst-invoice-october-2026-rs-5-crore-coverage-30-day-irn-reporting-rule.html), [Tally — 2026 changes](https://tallysolutions.com/business-guides/what-changed-in-e-invoicing-compliance-in-2026/)
- GST rates: [Business Standard](https://www.business-standard.com/economy/news/gst-council-adopts-two-rate-structure-with-exemptions-125090301624_1.html), [ClearTax — compensation cess](https://cleartax.in/s/gst-compensation-cess)
- Records: [GSTZen — Rule 57](https://gstzen.in/a/generation-and-maintenance-of-electronic-records-cgst-rule-57.html), [TaxGuru — maintenance of accounts](https://taxguru.in/income-tax/important-provisions-related-maintenance-accounts-gst.html)
- Rule 46: [GimBooks checklist](https://www.gimbooks.com/blog/gst-invoice-mandatory-fields-rule-46-checklist/amp/)
- MSME / Income-tax Act 2025: [Busy — 43B(h)](https://busy.in/tds/section-43bh-msme-payment-rule-and-45-day-limit-explained/), [TaxGuru — clarification](https://taxguru.in/income-tax/finance-ministry-clarifies-section-43bh-45-day-msme-payment-rule.html)
- Desktop: [Tauri vs Electron 2026](https://tech-insider.org/tauri-vs-electron-2026/)
