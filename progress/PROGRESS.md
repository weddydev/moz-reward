# PROGRESS — read this first every session

_Keep under ~150 lines. Overwrite sections; move history to SESSION_LOG.md._

## Baton
Baton: free — last held by Syedbadeshah76, 2026-11-08 22:38

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- **Handed over by Syedbadeshah76, 2026-11-08 22:38 (Windows laptop).** The human's usage limit ran out, so this is a clean stop.
- **Finished:** P0-01…P0-04 (all of P0-A) are ticked with evidence. `/subphase-complete P0-A` started: completeness ✅, `code-reviewer` ✅ (APPROVE WITH FIXES), `security-reviewer` ✅ (no BLOCK/HIGH). Both reports are condensed below under "P0-A review findings".
- **Half-done: `/subphase-complete P0-A`.** No code was changed for it and `main` is green. The full-regression / exploratory-QA agent was stopped part-way: E2E run 1 of 3 was underway with 68 intentional skips (guard self-tests run on chromium only), and no failures were reported before it stopped. **To continue:** (1) fix code-review **H1** test-first: in `src/server/jobs/worker.ts` add `worker.on("failed")`, which upserts `failed_jobs` when attempts are exhausted or the job stalled past `maxStalledCount`; wrap the in-processor `recordFailedJob` in try/catch that logs and rethrows the original error; add integration tests for a job that hits the stall limit and for a DB error while recording. (2) Fix security **M1** (redaction: spaced phone numbers, `?token=` query values, `*Id` passthrough, plus a test that registry payloads carry IDs only) and **M5** (`isPrivilegedEmail` must compare `lower(users.email)`; add a mixed-case staff test). (3) Ideally also fix code-review M1–M4 and L1/L3/L8 (small). (4) Re-run the full regression (E2E 3× with `--trace retain-on-failure`) and exploratory QA. (5) Finish steps 5–6 of the skill. CI/staging/Sentry cannot be verified until P0-14/15 and H-05/06/07 exist: record them as pending, never as passed.
- **Tested this session:** `pnpm check` ✅ 175 unit (22:30 and 22:38); `pnpm db:migrate` ✅; `pnpm services:up` ✅. The code-reviewer reran the P0-A unit tests (51/51) and integration tests (30/30) ✅.
- **Not yet tested this session:** full `test:int`, full E2E ×3 (the WebKit intermittent is still open), `build` + `check:bundle`, exploratory QA.
- **Before your next session on either laptop:** `pnpm install --frozen-lockfile` (new dev deps: Stryker), `pnpm services:up` (Mailpit :8025, MinIO :9000/:9001), `.env.local` must use `EMAIL_PROVIDER=smtp` + the SMTP/MAILPIT/S3 keys from `.env.example` (old `R2_*` keys are gone), Playwright browsers: `pnpm exec playwright install chromium webkit`. **Since P0-02:** compose moved to `infra/docker-compose.dev.yml` (`pnpm services:up` handles it); `.env.local` keys `TURNSTILE_SITE_KEY`/`VAPID_PUBLIC_KEY` are now `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (rename if you set them), and remove any `NODE_ENV=` line. **Since P0-03/04:** `pnpm install` (bullmq, ioredis) and `pnpm db:migrate` (migrations 0002–0004).
- **Windows laptop note:** `.env.local` in place (H-02, 8 Nov); `SENTRY_DSN` added (H-10): add it to the Mac copy via the shared note.

## Status
- **Phase:** P0 — Foundation and design system. Audit (`progress/AUDIT.md`): P0-01 … P0-04, P0-17 met; 4 partial (P0-06/07/08/09), 7 missing. Fixing gaps in task order.
- **Last updated:** 2026-11-08 22:38, Syedbadeshah76
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- `/subphase-complete P0-A` in progress: reviews done (findings below); fixes and full regression/QA still to do.

## P0-A review findings (2026-11-08; resolve the 🔴 ones before ticking P0-A)
- 🔴 CR-H1 `jobs/worker.ts`: a job that stalls past the limit, or a `recordFailedJob` that throws, never reaches `failed_jobs`. Fix: `worker.on("failed")` upsert + try/catch-rethrow; add tests.
- 🔴 SEC-M1 `jobs/redact.ts`: spaced UK phones, `?token=` URLs and `memberId`/`*Id` values pass redaction (probe inputs in the review). Switch to an allowlist, or add the patterns plus a registry "IDs only" test.
- 🔴 SEC-M5 `auth/privileged.ts:25`: case-sensitive email comparison fails open for mixed-case staff rows. Compare `lower(users.email)`; consider `CHECK (email = lower(email))`.
- Before the first staging deploy (P0-15): SEC-M2 assert at boot that the app runs as `moz_app` (not the owner); SEC-M3 Redis password + `rediss://` + key prefix required in staging/production; SEC-L3 crypto keys required/length-checked in staging/production; SEC-L1 `.gitleaksignore` for `TEST_PASSWORD` (the CI full-history scan fails otherwise).
- Before P1 repos: SEC-M4 restrict `systemScope` imports; lint `patterns` to catch relative imports; tenant repos take `ShopScope`/`CustomerScope`.
- Medium: CR-M1 tests for the `db:reset`/`db:seed` guards + `assertExtensionsAvailable`; CR-M2 worker shutdown order (workers, then queues); CR-M3 `enqueue` timeout (`commandTimeout`); CR-M4 a real BST/GMT next-run test.
- Low: CR-L1 assert default `attempts`; CR-L2 schedule pruning during rolling deploys; CR-L3 install signal handlers before `startWorkers`; CR-L4 `dbFor().transaction` bypasses the ALS guard; CR-L5 `z.url()` for DATABASE_URL/REDIS_URL; CR-L6 migration checker gaps (DROP INDEX, non-CONCURRENTLY index, NOT VALID); CR-L7 RuleTester for `no-server-in-client`; CR-L8 pino logger (P0-05) + `jobId ?? "unknown"`; SEC-L2 pin the gitleaks image digest; SEC-L4 token/loopback gate on the test API.

## Next (top 3)
1. Fix 🔴 CR-H1, SEC-M1 and SEC-M5 test-first (plus the small medium/low items if quick), then finish `/subphase-complete P0-A`: full regression (E2E 3× with trace), exploratory QA, PROGRESS/SESSION_LOG, push. CI/staging/Sentry stay pending until P0-14/15 (record as pending, don't fake). Then P0-05 … P0-09.
2. Remaining security items: magic-link response timing for staff vs customers (low, queue the email in P0-06; see DECISIONS P0-04); #5 first-enrolment takeover (with P0-06), #8 Better Auth account endpoints for stale staff sessions (with P0-07).
3. Close sub-phases only with `/subphase-complete` (needs CI + staging: P0-14/15 and H-05/06/07).

## Blockers
- Human: 🔴 none blocking code work. 🟠 end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend.
- Technical: **intermittent WebKit E2E failures under full parallel load** (TESTING §7: open, not quarantined): 3 failures in ~10 full runs on the Windows laptop (staff TOTP spec once: stayed on `/staff/sign-in` after "Continue"; UI gallery twice in a row), never in isolation (`--repeat-each 4`) or in the last 5 consecutive full runs. Root cause not yet found; no speculative fix. Next occurrence: run with `--trace retain-on-failure` and read the trace in `test-results/`. Must be resolved before `/subphase-complete`.
- Technical: audit HIGH findings in `progress/AUDIT.md` (top risks). 14 surviving Stryker mutants (codes 7, return-to 3, policies 4) to review at phase end (TESTING §2).

## Map of the codebase
- `src/app/` — Next.js App Router (Next 16: `proxy.ts` not middleware; async request APIs; read `node_modules/next/dist/docs/`)
- `src/worker/index.ts` — worker entry (`pnpm worker`); `src/server/jobs/` — registry, `enqueue`, worker + DLQ, scheduler (Europe/London), shutdown; tables `failed_jobs`, `job_heartbeats`
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
