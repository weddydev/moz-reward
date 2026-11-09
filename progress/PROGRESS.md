# PROGRESS — read this first every session

_Keep under ~150 lines. Overwrite sections; move history to SESSION_LOG.md._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-09 10:12

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- **Handed over by Syedbadeshah76, 2026-11-08 22:38 (Windows laptop).** The human's usage limit ran out, so this is a clean stop.
- **Finished:** P0-01…P0-04 (all of P0-A) are ticked with evidence. `/subphase-complete P0-A` started: completeness ✅, `code-reviewer` ✅ (APPROVE WITH FIXES), `security-reviewer` ✅ (no BLOCK/HIGH). Both reports are condensed below under "P0-A review findings".
- **Superseded:** P0-A was closed on 2026-11-09 (see Now). This note is overwritten at the next `/handoff`.
- **Tested this session:** `pnpm check` ✅ 175 unit (22:30 and 22:38); `pnpm db:migrate` ✅; `pnpm services:up` ✅. The code-reviewer reran the P0-A unit tests (51/51) and integration tests (30/30) ✅.
- **Not yet tested this session:** full `test:int`, full E2E ×3 (the WebKit intermittent is still open), `build` + `check:bundle`, exploratory QA.
- **Before your next session on either laptop:** `pnpm install --frozen-lockfile` (new dev deps: Stryker), `pnpm services:up` (Mailpit :8025, MinIO :9000/:9001), `.env.local` must use `EMAIL_PROVIDER=smtp` + the SMTP/MAILPIT/S3 keys from `.env.example` (old `R2_*` keys are gone), Playwright browsers: `pnpm exec playwright install chromium webkit`. **Since P0-02:** compose moved to `infra/docker-compose.dev.yml` (`pnpm services:up` handles it); `.env.local` keys `TURNSTILE_SITE_KEY`/`VAPID_PUBLIC_KEY` are now `NEXT_PUBLIC_TURNSTILE_SITE_KEY`/`NEXT_PUBLIC_VAPID_PUBLIC_KEY` (rename if you set them), and remove any `NODE_ENV=` line. **Since P0-03/04:** `pnpm install` (bullmq, ioredis) and `pnpm db:migrate` (migrations 0002–0004).
- **Windows laptop note:** `.env.local` in place (H-02, 8 Nov); `SENTRY_DSN` added (H-10): add it to the Mac copy via the shared note.

## Status
- **Phase:** P0 — Foundation and design system. P0-A closed (P0-01…04 + P0-17 met). Remaining partial: P0-06/07/08/09; missing: P0-05, P0-10…16. Fixing in task order.
- **Last updated:** 2026-11-09 11:09, Syedbadeshah76
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- **P0-A closed** (2026-11-09): regression green, QA done, review 🔴s fixed. Post-push CI/staging/Sentry checks are **pending P0-14/15** (DECISIONS 2026-11-09). Next: P0-05 security baseline.

## P0-A follow-ups (from reviews + QA; owners noted)
- Before the first staging deploy (P0-15): SEC-M2 assert at boot that the app runs as `moz_app` (not the owner); SEC-M3 Redis password + `rediss://` + key prefix required in staging/production; SEC-L3 crypto keys required/length-checked in staging/production; SEC-L1 `.gitleaksignore` for `TEST_PASSWORD` (the CI full-history scan fails otherwise); QA-6 `next start` with invalid env keeps serving 500s; exit instead.
- Before P1 repos: SEC-M4 restrict `systemScope` imports; lint `patterns` to catch relative imports; tenant repos take `ShopScope`/`CustomerScope`.
- P0-06 rework: QA-1 (major) sign-in forms hang and throw `Failed to fetch` when offline (`CustomerSignInForm.tsx:33`, `StaffSignInForm.tsx:33,57`, `EnrolTotp.tsx:34,59`: try/catch, reset state, offline message); QA-2 in-flight ref guard (3 synchronous submits sent 3 emails); QA-3 an invalid email shows "Something went wrong" instead of a field error; QA-4 a 254-char email overflows the "Check your email" card; SEC-M5b `CHECK (email = lower(email))`; P0-05 owns the magic-link rate limit (QA-10).
- P0-09 rework: QA-7 at 320 px ShopCard titles truncate ("Brew & …", seen in the screenshot) and the table hides columns with no scroll hint; QA-8 the Spinner freezes under reduced motion (`globals.css:158`).
- Open, small: CR-M3 `enqueue` timeout (`commandTimeout` + unreachable-Redis test); CR-L2 schedule pruning during rolling deploys; CR-L4 `dbFor().transaction` bypasses the ALS guard; CR-L6 migration checker gaps; CR-L7 RuleTester for `no-server-in-client`; CR-L8 pino logger (P0-05); SEC-L2 gitleaks image digest; SEC-L4 + QA-9 test API: token/loopback gate and 404 (not 405) for every method.

## Next (top 3)
1. P0-05 security baseline (docs/phases/P0.md §P0-05): headers/CSP, rate limits (incl. magic link 5/hour/email), pino logger with redaction (CR-L8), Turnstile. Test-first.
2. P0-06 rework incl. the QA-1…4 sign-in fixes and security #5; P0-07 incl. security #8. Then `/subphase-complete P0-B`.
3. P0-08/P0-09 rework (incl. QA-7/8), then P0-10+.

## Blockers
- Human: 🔴 none blocking code work. 🟠 end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend, H-17 permissions decision.
- Technical: post-push verification (CI, staging, Sentry) can't run until P0-14/15. WebKit E2E intermittent: the gallery part is fixed (b4e1b1c); the staff TOTP spec failed once on 8 Nov and hasn't failed since (0/6 full runs). If it fails again, read the trace in `test-results/`.
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
- `pnpm check`: ✅ 2026-11-09 207 unit; `pnpm test:int` ✅ 151 (incl. authz 95 + coverage guard); `pnpm e2e` ✅ 47/47 three full runs in a row (5 projects, 68 intended skips)
- P0-A gate 2026-11-09: QA agent regression (check 205, int 151, e2e 2 of 3 runs clean, gallery flake root-caused and fixed), then the 3 clean runs above; `build` ✅, `check:bundle` ✅ 45 names / 19 files, `test:titles --strict` ✅
- `pnpm test:mutation`: ✅ 90.1% (break 80); `pnpm test:live`: storage ✅, email skipped (H-04); `pnpm test:load:smoke`: runs (Docker k6), checks 100%, action p95 458 ms on `next dev` (not meaningful; staging gate)
- `pnpm test:titles --strict`: ✅ every test tagged
- `pnpm db:migrate`: ✅ 2026-11-08 (Windows; was silently skipped before the fix)
- `pnpm build`: ✅ 2026-11-08 19:45 (9 static pages; NODE_ENV must not be exported in the shell)
- CI on main: — (not set up yet) · Staging deploy: — · E2E smoke on staging: —

## Open questions / assumptions
- Not yet tested: Google OAuth (needs H-03), passkey sign-in (needs a real device), real email provider (needs H-04).
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
