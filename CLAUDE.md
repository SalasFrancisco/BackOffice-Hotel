# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Back-office reservation system for Hotel Quinto Centenario's convention/event salons ("Centro de Convenciones"). React/TypeScript admin SPA + a standalone public booking site, backed by Supabase (Postgres + Auth + Storage + a single Edge Function).

## Commands

- `npm run dev` — start Vite dev server (port 3000, opens browser)
- `npm run build` — production build (outputs to `build/`, multi-entry — see Architecture)
- No test suite, no lint config, and no `tsconfig.json` exist in this repo. Type errors are only caught by the editor/Vite's transpile step (esbuild/swc), not enforced at build time — `npm run build` will succeed even with type errors.
- Supabase Edge Function (`supabase/functions/server`) is deployed independently via the Supabase CLI (`supabase functions deploy server`); there is no CI workflow in this repo. SQL migrations live in `supabase/migrations/` and are applied via `supabase db push` or the Supabase SQL editor.

## Architecture

### Three build entry points, one Vite config

`vite.config.ts` builds three independent HTML entries (see `build.rollupOptions.input`):

- **`index.html`** — a pure client-side redirect stub to `salones.html`. Not a real page.
- **`salones.html`** — a large (~4900 line) standalone, hand-written vanilla JS/HTML/CSS public marketing + booking site ("Centro de Convenciones"). It does **not** use React. This same file is also served at `/formulario-reserva.html` (rewritten in `vercel.json`) as an embeddable iframe widget for the public hotel website (`quintocentenariohotel.com`); the CSP `frame-ancestors` header is conditioned on that path. Treat `salones.html` as a separate app from the React SPA — changes to it don't touch `src/`.
- **`reservas/index.html`** — the actual React SPA entry point (the "back-office"/admin app), mounted via `src/main.tsx` → `src/App.tsx`. It sets `window.__INITIAL_PAGE__ = 'reservas'`, which gates PWA service-worker registration (`public/reservas/sw.js` + `manifest.webmanifest`) — only this entry installs as a PWA.

The local dev server (`vite.config.ts` `localRoutingPlugin`) redirects `/reservas` → `/reservas/` and rewrites `/formulario-reserva.html` → `/salones.html`, mirroring the `vercel.json` rewrites/redirects used in production.

### UI component imports use pinned version specifiers

Files under `src/components/ui/*` (shadcn/Radix-style primitives, originally generated from a Figma export — see `src/components/figma/`) import packages with version suffixes baked into the specifier, e.g. `from '@radix-ui/react-slot@1.1.2'` or `from 'sonner@2.0.3'`. These are **not** broken imports — `vite.config.ts`'s `resolve.alias` map translates each versioned specifier back to the real package. When adding a new Radix/shadcn-style primitive, follow the existing pattern (versioned import + matching alias entry) rather than "fixing" it to a bare import, or add the alias if you do use a bare import.

### Backend: single Hono-based Supabase Edge Function

All server-side logic lives in one file: `supabase/functions/server/index.ts` (~4400 lines, Deno/Hono). Key points:

- `supabase/config.toml` sets `verify_jwt = false` for this function — JWT verification is done manually per-route inside the handler, not by the platform.
- Every route is registered under **three** path prefixes: `/make-server-484a241a/<route>`, `/server/make-server-484a241a/<route>`, and a bare `/<route>` + `/server/<route>` via `proxyTo(...)`. This accommodates different invocation path conventions depending on how the function is called (direct vs. via `/functions/v1/server/...`). When adding a new route, register it the same three/four ways for consistency.
- Responsibilities handled here (vs. direct Supabase client calls from the frontend): user administration (create/delete user, reset password, update email — needs the service-role key), presupuesto (quote) PDF generation/email/short-link sharing (`/p/:token`), reserva deletion (also cleans up Storage files), reserva expiration/auto-cancel processing (`process-reserva-vencimiento`), and the **public** endpoints used by `salones.html`'s booking widget (`public-catalog`, `public-reserva`), which are rate-limited (see `ALLOWED_ORIGINS`, `*_RATE_LIMIT_*` env vars in `.env.example`).
- Most ordinary CRUD (reservas, salones, servicios, perfiles, etc.) is done directly from the React app via the `supabase-js` client (`src/utils/supabase/client.ts`) against Postgres tables protected by RLS — it does not go through this Edge Function.
- Email sending uses `nodemailer` over SMTP (Gmail, per `.env.example`); PDFs use `pdfmake`, loaded dynamically only when needed.

### Auth & RBAC

- Roles live in the `perfiles` table: `rol` is `'ADMIN' | 'OPERADOR'`, plus an `activo` boolean for soft-disabling users (checked on login and on every profile load in `App.tsx`).
- `App.tsx` restricts `dashboard` and `usuarios` pages to ADMIN client-side (`isAdminOnlyPage`); this is a UX guard only — real enforcement is via Postgres RLS policies (see `supabase/migrations/`) and the Edge Function's own checks.
- There's a known historical Postgres RLS infinite-recursion failure mode (error `42P17`, policies on `perfiles` querying `perfiles`). `App.tsx` detects this specific error and renders a self-service fix screen with the corrective SQL inline — if you touch `perfiles` RLS policies, be aware of this trap (don't reintroduce a policy that queries `perfiles` directly; use the `SECURITY DEFINER` helper function pattern shown in that fix SQL).
- Session inactivity timeout (15 min, `src/utils/sessionActivity.ts`) is enforced client-side via `localStorage`, synced across tabs via the `storage` event, independent of Supabase's own session/token expiry.

### Reserva (booking) domain logic

Business rules for reservations are factored into small, focused `src/utils/` modules rather than embedded in components:

- `reservaEstadoTransitions.ts` — the booking status state machine: `Pendiente validación → Validado → Confirmado → Pagado`, plus `Cancelado` from multiple states. Valid transitions are defined in `RESERVA_TRANSICIONES`; always go through this module instead of writing raw `estado` checks.
- `reservaConflict.ts` — date/salon overlap detection between bookings.
- `reservaCapacity.ts` — warns when `cantidad_personas` exceeds the salon's or distribución's capacity.
- `reservaExpiration.ts` — auto-cancel logic for bookings left in "pending" states too long (`RESERVA_AUTO_CANCEL_DAYS = 7`), surfaced as warnings client-side and enforced server-side via the `process-reserva-vencimiento` endpoint.
- `reservaDeletion.ts` — deletes a reserva plus its associated presupuesto PDF in Supabase Storage (calls the Edge Function, not a direct table delete, since storage cleanup needs service-role access).
- `presupuesto.ts` — client-side PDF quote generation (`pdfmake`); the Edge Function has a parallel server-side PDF generator used for emailing/short-linking quotes.
- `serviceIncomeCategories.ts` / `serviceCatalogOrder.ts` — service catalog categorization (for dashboard income breakdowns) and consistent ordering.

When working on reserva features, check whether the needed logic already exists in one of these modules before adding it inline in a component.
