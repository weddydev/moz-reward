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
- **Phase:** P0 — Foundation and design system (in progress, 4 of 15 tasks)
- **Last updated:** 2026-11-08, talha.syed session
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- P0 task 5: Auth — config skeleton exists in `src/server/auth/auth.ts`; next: Argon2id, mfaVerified hook, session helpers, `server/authz` policies, action template, sign-in pages.

## Next (top 3)
1. Auth (Better Auth: Google, magic link, staff/admin password + TOTP)
2. Authz test harness (`tests/authz/`)
3. Design tokens + fonts

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
- `src/server/auth/auth.ts` — Better Auth instance (Google, magic link, password for staff, TOTP, passkey, HIBP)
- `tests/integration/` — DB-backed tests (test DB `moz_test`, migrated by `tests/global-setup.ts`)
- Configs: `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `pnpm-workspace.yaml` (allowed install scripts)

## Last verified
- `pnpm check`: ✅ 2026-11-08 (typecheck, lint, 3 tests incl. append-only integration test)
- `pnpm db:migrate` + `drizzle-kit check`: ✅ 2026-11-08, no drift
- `pnpm build`: ✅ 2026-11-08
- `pnpm e2e`: ✅ 2026-11-08 smoke, 4/4 projects
- CI on main: — (not set up yet)
- Staging deploy: —
- E2E smoke on staging: —

## Open questions / assumptions
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
