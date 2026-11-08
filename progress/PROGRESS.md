# PROGRESS — read this first every session

_Keep under ~150 lines. Overwrite sections; move history to SESSION_LOG.md._

## Baton
Baton: held by talha.syed since 2026-11-08 15:12

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- Handed over by: —
- Finished: —
- Half-done and how to continue: —
- Tested (what, how, result): —
- Not yet tested: —
- Do first (env vars, migrations, seeds): —

## Status
- **Phase:** P0 — Foundation and design system (in progress, 8 of 15 tasks)
- **Last updated:** 2026-11-08 18:00 checkpoint, talha.syed session (nothing half-done; tree clean)
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- P0 task 9: motion primitives — page transition wrapper (View Transitions + fallback), press feedback, sheet/modal/side panel, skeletons; `/dev/motion` gallery skeleton.

## Next (top 3)
1. Motion primitives + `/dev/motion` (View Transitions, press, sheet/modal/side panel)
2. Sound module + haptics helper
3. App shells (customer, shop, admin); restyle auth pages with primitives

## Blockers
- Human: none 🔴. 🟠 for end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend, H-10 Sentry.
- Technical: —

## Map of the codebase
- `src/app/` — Next.js App Router (Next 16: `proxy.ts` not middleware; async request APIs; read `node_modules/next/dist/docs/`)
- `src/worker/index.ts` — worker entry (stub; BullMQ from P1)
- `tests/setup.ts` — Vitest setup (jest-dom); unit tests live next to code as `*.test.ts(x)`
- `tests/e2e/` — Playwright specs (chromium, webkit, pixel-7, iphone-14)
- `docker-compose.yml` — local Postgres 17 + PostGIS 3.5 (`moz`, `moz_test` DBs) and Redis 7 (password `moz`); init SQL in `infra/local/`
- `.env.local` — generated locally from `.env.example` with random secrets (never committed; share via H-02)
- `src/server/db/` — Drizzle client (`db()`), schema (`schema/auth.ts` Better Auth tables, `schema/core.ts` domain), `migrate.ts`
- `drizzle/` — SQL migrations (0000 init, 0001 append-only trigger `prevent_update_delete()`)
- `src/server/env.ts` — Zod-validated server env (`env()`); `src/server/integrations/email/` — console/memory/real providers
- `src/server/auth/` — Better Auth instance `auth.ts` (Google, magic link, staff password Argon2id, TOTP, passkey, HIBP, testUtils in local/test), `session.ts`, `mfa.ts`
- `src/server/authz/` — pure `decide*` policies + `requireCustomer/requireShopRole/requireAdminRole` (MFA + 12 h/2 h limits)
- `src/server/actionTemplate.ts` — `defineAction({input, authorize, handler})`; `src/server/errors.ts` AppError
- `src/features/auth/` + `src/app/(public)/sign-in`, `/staff/sign-in`, `/staff/security` — sign-in UI (temporary styling)
- `src/app/api/auth/[...all]` Better Auth handler; `src/app/api/dev/outbox` dev-only email reader
- `tests/authz/` — matrix harness (`authzMatrix`, 13 roles, `runAsPrincipal`), coverage guard, probes; add a `*.authz.test.ts` for every new action
- `src/server/services/` — `audit.ts` (recordAudit, hashIp), `flags.ts` (feature flags + FLAG_* env override); `src/features/flags/actions.ts` setFeatureFlag
- `tests/fixtures/auth.ts` — `createPasswordUser`, `totpFromUri`, `testEmail`
- `tests/integration/` — DB-backed tests (test DB `moz_test`, migrated by `tests/global-setup.ts`)
- `src/styles/tokens.css` (DESIGN tokens, reduced-motion retuning), `src/app/globals.css` (Tailwind `@theme inline` mapping + type-scale utilities `text-display/h1/h2/h3/body/small/caption`, `bg-gold-gradient`, `duration-fast/base/slow`, `pb-safe`), `src/styles/fonts.ts` (Fraunces + Manrope); `contrast.test.ts` guards WCAG pairs
- `src/lib/motion-preference.ts` — `useReducedMotion()`, `setMotionPreference()` (`<html data-motion>`); applied by `components/system/ApplyPreferences`
- `src/components/ui/` — design-system primitives (barrel `index.ts`), tests in `ui.test.tsx`; `src/lib/cx.ts`
- `src/app/dev/` — dev galleries (404 in production); `/dev/ui` = `src/features/dev/UiGallery.tsx`
- Configs: `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `pnpm-workspace.yaml` (allowed install scripts)

## Last verified
- `pnpm check`: ✅ 2026-11-08 (170 tests)
- Gallery E2E: ✅ 2026-11-08 axe (no serious/critical) + no horizontal overflow on chromium, webkit, pixel-7, iphone-14
- Screenshots: ✅ 2026-11-08 home + sign-in, Pixel 7 + desktop: Fraunces/Manrope loaded, ivory bg, focus ring visible
- `pnpm db:migrate` + `drizzle-kit check`: ✅ 2026-11-08, no drift
- `pnpm build`: ✅ 2026-11-08 (checkpoint, after authz harness)
- `pnpm e2e`: ✅ 2026-11-08 12/12 (smoke, magic link, staff TOTP enrol + sign-in) on chromium, webkit, pixel-7, iphone-14
- CI on main: — (not set up yet)
- Staging deploy: —
- E2E smoke on staging: —

## Open questions / assumptions
- Not yet tested: Google OAuth (needs H-03), passkey sign-in (needs a real device), real email provider (needs H-04).
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
