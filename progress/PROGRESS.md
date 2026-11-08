# PROGRESS — read this first every session

_Keep under ~150 lines. Overwrite sections; move history to SESSION_LOG.md._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-08 17:36

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- **Current state (Syedbadeshah76, 2026-11-08, mid-session — not a handoff yet):** security hotfix `dfcb50d` pushed (audit #1, #3, #6). Before that, P0-17 finished on `wip/p0-17-test-infra`, merged into `main` and ticked with evidence (SESSION_LOG). The branch is fully merged and can be deleted (`git push origin --delete wip/p0-17-test-infra`); do not work on it. Nothing half-done.
- **Before your next session on either laptop:** `pnpm install --frozen-lockfile` (new dev deps: Stryker), `pnpm services:up` (Mailpit :8025, MinIO :9000/:9001), `.env.local` must use `EMAIL_PROVIDER=smtp` + the SMTP/MAILPIT/S3 keys from `.env.example` (old `R2_*` keys are gone), Playwright browsers: `pnpm exec playwright install chromium webkit`. **Since P0-02:** compose moved to `infra/docker-compose.dev.yml` (`pnpm services:up` handles it); `.env.local` keys `TURNSTILE_SITE_KEY`/`VAPID_PUBLIC_KEY` are now `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (rename if you set them), and remove any `NODE_ENV=` line. **Since P0-03:** run `pnpm db:migrate` (migrations 0002/0003).
- **Windows laptop note:** `.env.local` in place (H-02, 8 Nov); `SENTRY_DSN` added (H-10): add it to the Mac copy via the shared note.

## Status
- **Phase:** P0 — Foundation and design system. Audit (`progress/AUDIT.md`): P0-01, P0-02, P0-03, P0-17 met; 4 partial (P0-06/07/08/09), 8 missing. Fixing gaps in task order.
- **Last updated:** 2026-11-08 23:30, Syedbadeshah76
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- P0-03 reworked and ticked (migrations 0002/0003: content_settings, geography location, `reject_mutation()`, `set_updated_at()`, `moz_app` role = security #7; branded scopes + `src/server/repos`; `db:seed`/`db:reset`; PostGIS pre-check; expand-only migration check). Next: P0-04 (background jobs).

## Next (top 3)
1. P0-04 background jobs (MISSING in AUDIT: BullMQ queues, worker, schedules; also queue magic-link email = low timing finding), then P0-05 … P0-09, then P0-10+. Each with evidence; P0-17 tooling available.
2. Remaining security items: magic-link response timing for staff vs customers (low, fix by queueing email in P0-04); #5 first-enrolment takeover (with P0-06), #8 Better Auth account endpoints for stale staff sessions (with P0-07).
3. Close sub-phases only with `/subphase-complete` (needs CI + staging: P0-14/15 and H-05/06/07).

## Blockers
- Human: 🔴 none blocking code work. 🟠 end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend.
- Technical: **intermittent WebKit E2E failures under full parallel load** (TESTING §7: open, not quarantined): 3 failures in ~10 full runs on the Windows laptop (staff TOTP spec once: stayed on `/staff/sign-in` after "Continue"; UI gallery twice in a row), never in isolation (`--repeat-each 4`) or in the last 5 consecutive full runs. Root cause not yet found; no speculative fix. Next occurrence: run with `--trace retain-on-failure` and read the trace in `test-results/`. Must be resolved before `/subphase-complete`.
- Technical: audit HIGH findings in `progress/AUDIT.md` (top risks). 14 surviving Stryker mutants (codes 7, return-to 3, policies 4) to review at phase end (TESTING §2).

## Map of the codebase
- `src/app/` — Next.js App Router (Next 16: `proxy.ts` not middleware; async request APIs; read `node_modules/next/dist/docs/`)
- `src/worker/index.ts` — worker entry (stub; BullMQ is P0-04)
- `progress/AUDIT.md` — per-task audit vs `docs/phases/P0.md`; `docs/phases/*.md` = task briefs; `docs/ENGINEERING.md` = definition of done
- `infra/docker-compose.dev.yml` (via `pnpm services:up`, pre-flight in `scripts/services.ts`) — Postgres 17 + PostGIS 3.5, Redis 7 (password `moz`), Mailpit (:1025 SMTP, :8025 UI/API), MinIO (:9000 S3, :9001 console; healthcheck creates bucket `moz-rewards`); init SQL in `infra/local/`
- `.env.local` — local secrets (never committed; share via H-02); `src/server/env.ts` — fail-closed server env (`APP_ENV`/`APP_URL` required; staging/prod need NODE_ENV=production), validated at startup in `src/instrumentation.ts` + worker; `src/lib/env.ts` — `clientEnv` (`NEXT_PUBLIC_*` only); `pnpm setup:env` creates `.env.local`
- `src/server/db/` — Drizzle client (`db()`), schema (`schema/auth.ts`, `schema/core.ts`, `_columns.ts` incl. `geographyPoint`), `migrate.ts` (PostGIS pre-check), `seed.ts` (`db:seed`), `reset.ts` (`db:reset`, local only)
- `src/server/authz/scope.ts` — branded scopes from `require*`; `src/server/repos/` — the only DB access for features (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`; ESLint-enforced)
- `drizzle/` — SQL migrations (0000 init, 0001 append-only trigger, 0002 hardening + geography, 0003 `reject_mutation()`/`set_updated_at()`/`moz_app` role); destructive statements need `-- contract:` (`scripts/check-migrations.ts`)
- `src/server/integrations/` — `email/` (SMTP→Mailpit, Resend, Brevo), `storage/` (S3: MinIO/R2), fakes `push/`, `ai/`, `postcodes/`, `places/` (fail closed outside local/test), `fake-support.ts`
- `src/server/auth/` — Better Auth `auth.ts` (Google, magic link, staff password Argon2id, TOTP, passkey, HIBP, testUtils only in `APP_ENV=test`), `session.ts`, `mfa.ts`
- `src/server/authz/` — pure `decide*` policies + `requireCustomer/requireShopRole/requireAdminRole`
- `src/server/actionTemplate.ts` — `defineAction({input, authorize, handler})`; `src/server/errors.ts` AppError
- `src/server/services/` — `audit.ts`, `flags.ts`; `src/features/flags/actions.ts`
- `src/server/testing/factories.ts` (re-exported by `tests/fixtures/factories.ts`) — factories + `makeActor(role)`
- `src/app/api/test/[action]/route.ts` — test-only API (404 unless `APP_ENV=test`): `POST session|user|fakes|reset-fakes`, `GET push`
- `src/features/auth/` + `/sign-in`, `/staff/sign-in`, `/staff/security` — sign-in UI (temporary styling)
- `src/app/dev/` — dev pages (404 in production): `/dev/ui` gallery, `/dev/guard-check` (guard self-test target)
- `src/styles/tokens.css`, `src/app/globals.css`, `src/styles/fonts.ts`; `src/lib/motion-preference.ts`; `src/components/ui/` primitives
- Tests: Vitest projects `unit` (`src/**`, `scripts/**`) and `integration` (`tests/integration`, `tests/authz`; per-worker DBs `moz_test_w1..4` from `moz_test_template`, `tests/support/db.ts`); `tests/authz/` matrix + coverage guard
- `tests/e2e/` — Playwright, own server :3100 (`APP_ENV=test`, DB `moz_test_e2e`, `.next-e2e`), projects chromium/webkit/pixel7/iphone14/desktop1440; **import `test` from `tests/e2e/support/test.ts`** (guard, `signInAs`, `createUser`, `freezeTime`, `shoot`, `mail`, `pushes`); add new routes to `support/warm-up.ts`
- `scripts/` — `test-regression.ts`, `check-test-titles.ts`, `load-smoke.ts`; `stryker.config.mjs`; `tests/load/smoke.js` (k6); `tests/live/` + `vitest.live.config.mts`
- Configs: `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `pnpm-workspace.yaml`

## Last verified
- `pnpm check` (typecheck + lint + unit, no Docker): ✅ 2026-11-08 123 unit, also on a fresh clone without `.env.local`; `pnpm test:int` ✅ 120; e2e ✅ 37/37
- `pnpm test:regression`: unit 117 ✅, integration 23 ✅, authz 95 ✅; e2e 36/37 in that run (WebKit intermittent, see Blockers), then 5 consecutive full E2E runs 37/37 ✅
- `pnpm test:mutation`: ✅ 90.1% (break 80); `pnpm test:live`: storage ✅, email skipped (H-04); `pnpm test:load:smoke`: runs (Docker k6), checks 100%, action p95 458 ms on `next dev` (not meaningful; staging gate)
- `pnpm test:titles --strict`: ✅ every test tagged
- `pnpm db:migrate`: ✅ 2026-11-08 (Windows; was silently skipped before the fix)
- `pnpm build`: ✅ 2026-11-08 19:45 (9 static pages; NODE_ENV must not be exported in the shell)
- CI on main: — (not set up yet) · Staging deploy: — · E2E smoke on staging: —

## Open questions / assumptions
- Not yet tested: Google OAuth (needs H-03), passkey sign-in (needs a real device), real email provider (needs H-04).
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
