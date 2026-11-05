# Phase 2-4 ownership manifest

The shared plumbing (Dexie v3, schemas, DB layer, hooks, backup v3, settings, tab registries, route stubs) is already merged on `dev`. Each feature fills in only the files it owns. Everything not listed under "Owns" or "May touch" is off limits; if you need a change there, make the smallest possible edit and say so in your commit message.

Features: **A** payment ledger, statements, collection analytics. **B** amendments, cancellations, e-invoice. **C** recurring, CSV import. **D** vendors, purchase bills, payables, attachments. **E** GSTR-2B/IMS, ITC reconciliation, GSTR-3B worksheet. **F** GSTR-9/9C, GSTR-4, annual P&L, tax pack, year-over-year.

## What the foundation already did (do not redo)

- Dexie **v3** (`src/db/db.ts`): new tables `payments`, `amendments`, `recurring`, `vendors`, `purchases`, `attachments`, `attachmentBlobs`, `gstr2bImports`, `gstr2bMatches`, `periodInputs`, `annualInputs`. Indexes are in the `version(3)` block. A feature that needs a new index adds a `version(4)` block (see "Shared files"); never edit the v3 block.
- `src/lib/schema.ts`: one `BEGIN [X] ... END [X]` section per feature, all registered in `backupFileSchema`, `TABLE_SCHEMAS` (`src/db/read.ts`), `AUDIT_ENTITIES`, `COUNTED_TABLES`, `clearAllData`, data health, backup build/restore/summary, Settings > Data labels and the restore dialog.
- `src/db/crud.ts`: `defineCrud` factory (guardedWrite + audit in one transaction, keeps `createdAt`, validates before writing). Each `src/db/<table>.ts` exports `<table>Crud`, `save*`, `get*`, `delete*`, `list*` plus a few index queries.
- `src/db/hooks.ts`: `usePayments`, `usePaymentsForInvoice`, `useAmendments`, `useRecurring`, `useVendors`, `usePurchases`, `useAttachments`, `useGstr2bImports`, `useGstr2bMatches`, `usePeriodInput`, `useAnnualInput`.
- New Settings groups (defaults only): `payments`, `eInvoice`, `recurring`, `purchases`, `attachments`.
- `Invoice.eInvoice` gained `qr`, `exportedAt`, `cancelledAt`, `cancelReason` (defaults `""`; invoice schema stays v2).
- `RETURN_TYPES` gained `GSTR-9C` and `GSTR-4`; `dueDate()` handles both (verify on portal).
- Audit actions gained `import`.
- Shared placeholder component: `src/components/coming-soon.tsx` (do not edit).

## Per-feature ownership

Paths are relative to the repo root. "Owns" = create/edit freely. Tests go in the stated location; name new test files after the feature (`*.test.ts` under `src`).

### A: payment ledger, statements, collections

- **Owns:**
  - Schema section `[A] PAYMENT LEDGER` in `src/lib/schema.ts` (`paymentEntrySchema`).
  - `src/db/payments.ts`.
  - `src/components/customers/statement-view.tsx` (route `/customers/statement?customer=ID&from=&to=`, page file `src/app/(app)/customers/statement/page.tsx` already exists with Suspense).
  - `src/components/analytics/collections-tab.tsx`.
  - New files under `src/lib/payments/**`, `src/components/payments/**`, `src/components/statements/**`.
- **Registry lines already in place:** Analytics tab id `collections` (`analytics-model.ts`, `analytics-view.tsx`).
- **May touch minimally:**
  - `src/components/history/**`, `src/components/editor/**`: add a "Record payment" action or payment list. Keep `Invoice.payment` (legacy single payment) readable; do not change the invoice schema.
  - `src/components/customers/customers-view.tsx`: one "Statement" link per customer row.
  - `src/lib/analytics/**`: add a new file for collection metrics; extend `AnalyticsData` only by adding optional fields.
  - `src/components/settings/**`: a "Payments" card reading `settings.payments`.
- **Tests:** `src/lib/payments/*.test.ts`, `src/db/payments.test.ts`.

### B: amendments, cancellation, e-invoice

- **Owns:**
  - Schema section `[B] AMENDMENTS & E-INVOICE` (`amendmentSchema`). The `eInvoiceSchema` fields added by the foundation are also B's to use; adding further optional fields with defaults is allowed (do not bump the invoice version).
  - `src/db/amendments.ts`.
  - `src/components/returns/panels/amendments-panel.tsx`, `src/components/returns/panels/einvoice-panel.tsx`.
  - New files under `src/lib/gst/amendments/**`, `src/lib/gst/einvoice/**`, `src/components/returns/amendments/**`, `src/components/returns/einvoice/**`.
- **Registry lines already in place:** Returns tabs `amendments` and `einvoice` (`src/components/returns/tab-registry.tsx`).
- **May touch minimally:**
  - `src/db/invoices.ts`: `cancelInvoice` for cross-period cancellation. Keep its existing behavior and tests.
  - `src/components/returns/gstr1-tab.tsx`: show amended documents.
  - `src/lib/gst/returns/**`: add an amendments section to the GSTR-1 build in a new file, with one call site.
  - `src/components/returns/tab-context.ts`: add fields only if a panel truly needs them (append at the end).
  - `src/components/editor/**`: e-invoice status/IRN entry and warnings (30-day, 24-hour cancel).
  - `src/components/settings/**`: e-invoice card reading `settings.eInvoice` and `settings.gst.eInvoiceApplicable`.
- **Tests:** `src/lib/gst/amendments/*.test.ts`, `src/lib/gst/einvoice/*.test.ts`, `src/db/amendments.test.ts`.

### C: recurring, CSV import

- **Owns:**
  - Schema section `[C] RECURRING & IMPORT` (`recurringSchema`).
  - `src/db/recurring.ts`.
  - `src/components/money/recurring-tab.tsx` (Money tab id `recurring`).
  - `src/components/import/import-view.tsx` (route `/import`, page file already exists).
  - New files under `src/lib/recurring/**`, `src/lib/import/**`, `src/components/recurring/**`, `src/components/import/**`.
- **Registry lines already in place:** Money extra tab `recurring` (`src/components/money/money-tabs.tsx`); command palette entry "Import from CSV".
- **May touch minimally:**
  - `src/lib/csv.ts`: add a CSV parser (new exports only).
  - `src/components/layout/app-shell.tsx` (or `src/app/providers.tsx`): one hook call to generate due documents on open (honor `settings.recurring.generateOnOpen`).
  - `src/db/invoices.ts`, `src/db/expenses.ts`: only by calling their existing save functions; do not edit them.
  - `src/components/settings/**`: a "Recurring" card.
  - Links to `/import` from `src/components/customers/customers-view.tsx`, `src/components/items/**`, `src/components/settings/data-section.tsx`.
- **Tests:** `src/lib/recurring/*.test.ts`, `src/lib/import/*.test.ts`, `src/db/recurring.test.ts`.

### D: vendors, purchases, payables, attachments

- **Owns:**
  - Schema section `[D] VENDORS, PURCHASES & ATTACHMENTS` (`vendorSchema`, `purchaseSchema`, `attachmentSchema`, `attachmentBlobSchema`).
  - `src/db/vendors.ts`, `src/db/purchases.ts`, `src/db/attachments.ts`.
  - `src/components/money/bills-tab.tsx` (Money tab id `bills`).
  - `src/components/analytics/payables-tab.tsx`.
  - New files under `src/lib/purchases/**`, `src/components/purchases/**`, `src/components/vendors/**`, `src/components/attachments/**`.
- **Registry lines already in place:** Money extra tab `bills`; Analytics tab id `payables`.
- **May touch minimally:**
  - `src/components/money/expense-sheet.tsx`: an attachment picker (reuse `useAttachments("expense", id)`).
  - `src/lib/analytics/**`: payables/cash-flow metrics in a new file; extend `AnalyticsData` only by adding optional fields.
  - `src/components/storage/storage-guard.tsx`: attachment storage warning (`attachmentUsage()` against `settings.attachments.warnTotalMb`).
  - `src/components/settings/**`: an "Attachments" and "Purchases" card.
- **Notes:** `purchases` rows carry their own `payments`; write a `prepare` in `src/db/purchases.ts` that computes `summary` and `paymentStatus` (pattern: `computeExpenseSummary`). Enforce `settings.attachments.maxFileKb` in the UI before `saveAttachment`. Attachment files are base64 in `attachmentBlobs` so health checks and lists never load them.
- **Tests:** `src/lib/purchases/*.test.ts`, `src/db/purchases.test.ts`, `src/db/attachments.test.ts`.

### E: GSTR-2B/IMS, ITC reconciliation, GSTR-3B worksheet

- **Owns:**
  - Schema section `[E] GSTR-2B / IMS & ITC` (`gstr2bImportSchema`, `gstr2bRowSchema`, `gstr2bMatchSchema`, `periodInputSchema`).
  - `src/db/gstr2b.ts`, `src/db/period-inputs.ts`.
  - `src/components/returns/panels/gstr2b-panel.tsx`, `src/components/returns/panels/gstr3b-panel.tsx` (replace with the full worksheet; may still render `gstr3b-tab.tsx` content inside), `src/components/returns/gstr3b-tab.tsx`.
  - `src/components/analytics/itc-tab.tsx`.
  - New files under `src/lib/gst/gstr2b/**`, `src/lib/gst/gstr3b/**`, `src/components/returns/gstr2b/**`.
- **Registry lines already in place:** Returns tabs `gstr2b` and `gstr3b`; Analytics tab id `itc`.
- **May touch minimally:**
  - `src/lib/gst/returns/**`: extend the GSTR-3B build via a new file plus one call site (keep existing outputs and tests unchanged unless a worksheet input is present).
  - `src/components/returns/tab-context.ts`: append fields if needed.
  - `src/lib/analytics/**`: ITC reconciliation metrics in a new file.
  - Reads `purchases` and `expenses` (owned by D and core); do not edit their db files.
- **Tests:** `src/lib/gst/gstr2b/*.test.ts`, `src/lib/gst/gstr3b/*.test.ts`, `src/db/gstr2b.test.ts`.

### F: GSTR-9/9C, GSTR-4, annual P&L, tax pack, year-over-year

- **Owns:**
  - Schema section `[F] ANNUAL RETURNS & TAX PACK` (`annualInputSchema`).
  - `src/db/annual-inputs.ts`.
  - `src/components/returns/panels/gstr9-panel.tsx`, `src/components/returns/panels/gstr4-panel.tsx` (composition dealers only; registry `audience` is `["composition"]`, change it in the registry if GSTR-4 should also show for regular filers).
  - `src/components/tax-pack/tax-pack-view.tsx` (route `/tax-pack`, page file already exists; sidebar highlights GST Returns for it).
  - `src/components/analytics/yoy-tab.tsx`.
  - New files under `src/lib/gst/annual/**`, `src/lib/tax-pack/**`, `src/components/returns/annual/**`, `src/components/tax-pack/**`.
- **Registry lines already in place:** Returns tabs `gstr4` and `gstr9`; Analytics tab id `yoy`; command palette entry "Tax pack for your CA".
- **May touch minimally:**
  - `src/components/returns/side-cards.tsx`: replace the composition "support is planned" text in `NotApplicableCard`.
  - `src/components/returns/tab-context.ts`: `fyKey` is already provided; append fields if needed.
  - `src/lib/analytics/**`: yoy metrics in a new file.
  - Reads `settings.gst.registrationType` to decide GSTR-4 vs GSTR-9 emphasis.
- **Tests:** `src/lib/gst/annual/*.test.ts`, `src/lib/tax-pack/*.test.ts`, `src/db/annual-inputs.test.ts`.

## Shared files (minimal edits, rebase friendly)

| File | Rule |
| --- | --- |
| `src/lib/schema.ts` | Edit only inside your own `BEGIN [X] ... END [X]` section. Adding fields: give them defaults so stored rows stay valid. Do not rename or remove fields (existing backups depend on them). Settings additions: append a new group at the end of the Phase 2-4 settings block with defaults. |
| `src/db/db.ts` | Do not edit the v3 block. If you need a new index, add `this.version(4).stores({...})` listing only the changed table; if two features need it, the second one rebases and merges the two `version(4)` objects. Never remove a table or index. |
| `src/db/hooks.ts` | Do not edit. Put extra live queries in `src/db/hooks-<feature>.ts` (e.g. `hooks-payments.ts`). |
| `src/db/read.ts`, `src/db/backup.ts`, `src/db/health.ts`, `src/db/records.ts`, `src/db/crud.ts` | Foundation only; do not edit. If you add a new table, tell the integrator (the table must be registered in `TABLE_SCHEMAS`, `V3_TABLES`, `COUNTED_TABLES`, the health labels and `TABLE_LABELS`). |
| `src/components/returns/returns-view.tsx` | Do not edit. Use `tab-registry.tsx` (one line per tab) and `tab-context.ts`. |
| `src/components/returns/tab-registry.tsx`, `src/components/money/money-tabs.tsx`, `src/components/analytics/analytics-model.ts` + `analytics-view.tsx` | Only change the line(s) for your tab (label, audience). Do not add new tabs without agreement. |
| `src/components/layout/nav.ts` | Keep primary navigation as is (decision: tabs, not nav items). |
| `src/components/layout/command-palette.tsx` | Add a palette entry only for a new route you own. |
| `src/components/settings/**` | Add a new card file and one line to the settings page; do not restructure sections. |

## Stub index (replace the whole file; each renders `ComingSoon`)

| Feature | Stub file | Where it shows |
| --- | --- | --- |
| A | `src/components/analytics/collections-tab.tsx` | Analytics > Collections |
| A | `src/components/customers/statement-view.tsx` | `/customers/statement` |
| B | `src/components/returns/panels/amendments-panel.tsx` | Returns > Amendments |
| B | `src/components/returns/panels/einvoice-panel.tsx` | Returns > E-invoice |
| C | `src/components/money/recurring-tab.tsx` | Money > Recurring |
| C | `src/components/import/import-view.tsx` | `/import` |
| D | `src/components/money/bills-tab.tsx` | Money > Bills & vendors |
| D | `src/components/analytics/payables-tab.tsx` | Analytics > Payables & cash flow |
| E | `src/components/returns/panels/gstr2b-panel.tsx` | Returns > GSTR-2B |
| E | `src/components/analytics/itc-tab.tsx` | Analytics > ITC reconciliation |
| F | `src/components/returns/panels/gstr4-panel.tsx` | Returns > GSTR-4 (composition) |
| F | `src/components/returns/panels/gstr9-panel.tsx` | Returns > GSTR-9 |
| F | `src/components/tax-pack/tax-pack-view.tsx` | `/tax-pack` |
| F | `src/components/analytics/yoy-tab.tsx` | Analytics > Year over year |

Returns panels receive `{ ctx: ReturnsTabContext }`; Analytics tabs receive `{ ctx: TabContext }`; Money tabs take no props (use hooks).

## Conventions every feature follows

- Writes go through the table's `crud` object or `guardedWrite` + `logAudit`; never call `db.table.put` directly from UI.
- Read through `readTable` / the live hooks so invalid rows are counted, not dropped silently.
- Money is decimal text; compute with `decimal.js`; dates are ISO strings.
- Derived fields (summaries, statuses) are recomputed in a `prepare` step, never trusted from input or a backup.
- No network calls (CSP `connect-src 'self'`). 360 px layouts: tab bars scroll horizontally, tables scroll inside a container.
- Run `npx prettier --write` on touched files; `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` must pass.
- New routes are picked up by `scripts/gen-sw-manifest.mjs` automatically (every exported HTML page is precached).
