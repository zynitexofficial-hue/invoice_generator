# Invoice Studio

Free, browser-only GST invoicing for India. No login, no backend: everything is stored in your browser (IndexedDB) and nothing is uploaded.

Built with Next.js (static export), TypeScript, Dexie, Zod and decimal.js.

## What it does

- Tax invoice, bill of supply, export invoice, proforma/quotation, credit and debit notes.
- Six customisable templates; PDF through the browser's print dialog; UPI QR and pay link.
- Customers, item catalogue, history, payments received, receivables ageing.
- Expenses and other income, with GST/ITC on expenses.
- GST Returns: GSTR-1 (JSON and CSV), GSTR-3B worksheet, filing tracker, due dates and late-fee estimate. These are drafts prepared from your records; check them on the GST portal or with your CA before filing.
- Dashboard, analytics and printable registers.
- Encrypted and automatic backups, PIN lock, offline support, share via WhatsApp / email.

## Develop

Needs the Node version in `.nvmrc` and [pnpm](https://pnpm.io).

```bash
pnpm install
pnpm dev          # http://localhost:3000
```

```bash
pnpm typecheck    # next typegen + tsc
pnpm lint
pnpm test         # vitest
pnpm build        # static export to out/, then the service-worker manifest
```

## Docs

- `plans/prd.md`: original MVP requirements.
- `plans/feature-list.md`: current feature list and implementation status.
- `plans/business-gst-suite.md`: research, phased roadmap (Phases 1–4) and Phase 1 design.

Next.js here is a newer version than most documentation covers; see `AGENTS.md` and `node_modules/next/dist/docs/`.
