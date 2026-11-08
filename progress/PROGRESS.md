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
- **Phase:** P0 — Foundation and design system. Kit upgraded to 16 task briefs; audit done (`progress/AUDIT.md`): 0 fully met, 7 partial (P0-01/02/03/06/07/08/09), 9 missing. Fixing gaps in task order.
- **Last updated:** 2026-11-08 audit, talha.syed session
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- Security hotfix from the audit: block the staff/admin MFA bypass (magic link/Google → passkey) and remove fail-open env defaults (`APP_ENV`/`APP_URL` required, console email + dev outbox + testUtils only in local/test). Then P0-01 gaps.

## Next (top 3)
1. P0-01 gaps: `server-only` everywhere, ESLint strict-type-checked + import order + client→server boundary + hex ban, `exactOptionalPropertyTypes`, Vitest unit/integration split (`test:int`), Playwright pixel7/iphone14/desktop1440, lefthook, exact versions in DECISIONS
2. P0-02 gaps: serverEnv/clientEnv + fail-fast via instrumentation, env tests, Mailpit in `infra/docker-compose.dev.yml`, README Local setup
3. P0-03 gaps: content_settings, updated_at trigger, geography, `lib/codes.ts`, `repos/_base.ts`, db:seed/db:reset, constraint tests (then P0-04, P0-05, P0-06, P0-07, P0-08, P0-09 fixes, then P0-10+)

## Blockers
- Human: none 🔴. 🟠 for end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend, H-10 Sentry.
- Technical: audit HIGH findings tracked in `progress/AUDIT.md` (top risks section). Old PHASES ticks are void; nothing ticked until every criterion has evidence.

## Map of the codebase
- `src/app/` — Next.js App Router (Next 16: `proxy.ts` not middleware; async request APIs; read `node_modules/next/dist/docs/`)
- `src/worker/index.ts` — worker entry (stub; BullMQ is P0-04)
- `progress/AUDIT.md` — per-task audit vs `docs/phases/P0.md` (criterion / status / evidence / fix); `docs/phases/*.md` = task briefs; `docs/ENGINEERING.md` = definition of done
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
