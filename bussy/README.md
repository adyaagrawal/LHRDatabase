# BUSSY v2

Purchasing tracker for **Longhorn Racing Combustion** (UT Austin). Replaces the Microsoft Form + Excel
workbook: request form, approvals, ESL export, package log, raw data and a financial dashboard.

**Stack:** Next.js 15 (App Router, TypeScript) on Vercel · Supabase (Postgres, Google auth, RLS, Storage) ·
Tailwind · Zod · TanStack Table · Recharts · SheetJS (import) · ExcelJS (ESL export) · Vitest.

- **First time?** Follow [`SETUP.md`](SETUP.md) — click-by-click for Supabase, Google Cloud and Vercel.
- **Running the team's purchasing?** See [`ADMIN_GUIDE.md`](ADMIN_GUIDE.md).

## Commands

| Command | What it does |
|---|---|
| `pnpm install` | Install dependencies (creates `pnpm-lock.yaml` — commit it) |
| `pnpm dev` | Run locally at http://localhost:3000 |
| `pnpm build` | Production build (what Vercel runs) |
| `pnpm typecheck` / `pnpm lint` | Type check / lint |
| `pnpm test` | Unit tests (dashboard math, totals, export mapping, importer) |
| `pnpm test:db` | RLS tests against the local Supabase (`supabase start` first) |
| `pnpm import:forms --file <xlsx> --season 2026-27 [--dry-run]` | Import a Microsoft Forms export |
| `pnpm parity --season 2025-26` | Compare imported 2025-26 totals with last year's workbook |
| `pnpm db:types` | Regenerate Supabase TypeScript types |

## Layout

```
supabase/migrations/   schema, triggers, status machine, RLS, storage, views, seed  (run in order)
supabase/tests/        pgTAP RLS tests
src/middleware.ts      sign-in + approval gate for every route
src/app/login, pending, denied, auth/   sign-in flow
src/app/(app)/         the signed-in app
  page.tsx             Dashboard (/)
  request/new          Request form
  raw                  Raw data (TanStack Table, admin inline edit)
  requests/[id]        Request detail + audit timeline
  packages             Package log + quick check-in
  admin/approvals      Approvals queue
  admin/export         ESL export (+ /admin/export/file download route)
  admin/users          Users, roles, season, budgets, vendors, import
src/lib/               shared logic: schemas, totals, dashboard math, ESL mapping, importer
scripts/               import-forms.ts, parity.ts
tests/                 Vitest
```

## Where the rules live

- **Who can do what** is enforced in Postgres (RLS + `transition_request`, `check_in_package`,
  `mark_submitted_to_esl`), not only in the UI.
- **Totals** are recomputed by a trigger (`requests_compute_totals`) — the browser's number is never trusted.
- **Every change** to a request is written to `request_events` by a trigger.
- **Request numbers** display as `#19`; change `reqNo()` in `src/lib/format.ts` for `#2026-019`.
