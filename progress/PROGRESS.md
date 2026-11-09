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
- **Phase:** P0 — Foundation and design system. P0-A closed; P0-05, P0-06 met. Next: P0-07, then close P0-B. Remaining partial: P0-07/08/09; missing: P0-10…16.
- **Last updated:** 2026-11-09 (afternoon), Syedbadeshah76
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- **P0-06 ticked 9 Nov** (evidence in SESSION_LOG). Real Google sign-in verified after H-03; sign-in screens E2E + screenshots `801451d`. Carried to P0-12: route-group TOTP guards (per group), role switcher + default portal per role. Piece D today: `f1c70c3` Google scopes once; `1252b6a` `__Host-` cookies on https; `6c1c0bf` DB trigger ends sessions on any staff/admin privilege change + `users_email_lowercase` CHECK (migrations 0005/0006); `b285bd5` customer 30-day idle timeout (injected clock) + user deleted mid-session; `13f56e8` signed-in devices (`/me/security`, `/staff/security`); `4e2c887` sign-in shows the shop when returnTo is `/s/<code>`; `0a8aba5` security pages redirect signed-out visitors with a real 307 (was a streamed client-side redirect). Earlier: piece A, the sign-in link (`d7f2c34`: Turnstile, limits, hashed tokens, after-response delivery, React Email, `/sign-in/link-expired`, QA-1…4). Piece C, staff (`6131b96` security #5: the enrolment verify no longer mints an MFA session; `c8b3a4d` staff login 10/15 min/IP + per-account pause 1→15 min + lockout email + second-factor IP limit; `780ffbe` own HIBP check with timeout and fail-open, TOTP ±1 and recovery-reuse tests). Recovery codes stay encrypted (DECISIONS).
- P0-05 met earlier today (proxy/CSP, limiter, logger, Turnstile, audit; PPR off — DECISIONS).

## P0-A follow-ups (from reviews + QA; owners noted)
- Before the first staging deploy (P0-15): SEC-M2 assert at boot that the app runs as `moz_app` (not the owner); SEC-M3 Redis password + `rediss://` + key prefix required in staging/production; SEC-L3 crypto keys required/length-checked in staging/production; SEC-L1 `.gitleaksignore` for `TEST_PASSWORD` (the CI full-history scan fails otherwise); QA-6 `next start` with invalid env keeps serving 500s; exit instead.
- Before P1 repos: SEC-M4 restrict `systemScope` imports; lint `patterns` to catch relative imports; tenant repos take `ShopScope`/`CustomerScope`.
- P0-06 rework: QA-1 (major) sign-in forms hang and throw `Failed to fetch` when offline (`CustomerSignInForm.tsx:33`, `StaffSignInForm.tsx:33,57`, `EnrolTotp.tsx:34,59`: try/catch, reset state, offline message); QA-2 in-flight ref guard (3 synchronous submits sent 3 emails); QA-3 an invalid email shows "Something went wrong" instead of a field error; QA-4 a 254-char email overflows the "Check your email" card; SEC-M5b `CHECK (email = lower(email))`; P0-05 owns the magic-link rate limit (QA-10).
- P0-09 rework: QA-7 at 320 px ShopCard titles truncate ("Brew & …", seen in the screenshot) and the table hides columns with no scroll hint; QA-8 the Spinner freezes under reduced motion (`globals.css:158`).
- Open, small: CR-M3 `enqueue` timeout (`commandTimeout` + unreachable-Redis test); CR-L2 schedule pruning during rolling deploys; CR-L4 `dbFor().transaction` bypasses the ALS guard; CR-L6 migration checker gaps; CR-L7 RuleTester for `no-server-in-client`; SEC-L2 gitleaks image digest; SEC-L4 + QA-9 test API: token/loopback gate and 404 (not 405) for every method.

## Next (top 3)
1. P0-07 (security #8: defineAction + requestLogger + audit + 429 mapping), then `/subphase-complete P0-B` (incl. a production-build E2E run on WebKit to re-check the load-only timeouts).
2. Formatting drift: `pnpm format` rewrites 55 committed files (CI `format:check` would fail). Two stashes hold that output (`git stash list`); decide whether to commit it as one `style:` commit or find the config mismatch first. Use `prettier --write <files>`, not `pnpm format`, until then.
3. P0-08/09 rework (QA-7, QA-8), then P0-10 onwards.

## Blockers
- Human: 🔴 none blocking code work. 🟠 by 13 Nov: H-07 domain (+ staging Google URI), H-06 VPS, H-05 Neon, H-04 Resend, H-20 Turnstile keys, H-17 permissions decision.
- Technical: post-push verification (CI, staging, Sentry) can't run until P0-14/15. WebKit E2E intermittent: both parts root-caused and fixed (gallery b4e1b1c; staff TOTP flow split in d7f2c34, 24/24 under repeat load).
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
- `src/server/auth/magic-link.ts` (request checks + after-response delivery), `staff-login.ts` (throttle/backoff/lockout email), `src/server/integrations/breach/` (HIBP k-anonymity), `src/server/security/email-key.ts`, `src/server/emails/` (React Email templates), `src/features/auth/network.ts` (`withNetworkGuard`), `src/server/repos/sessions.ts`, `/sign-in/link-expired`
- `src/server/auth/` — Better Auth `auth.ts` (Google, magic link, staff password Argon2id, TOTP, passkey, HIBP, testUtils only in `APP_ENV=test`), `session.ts`, `mfa.ts`
- `src/server/authz/` — pure `decide*` policies + `requireCustomer/requireShopRole/requireAdminRole`
- `src/server/actionTemplate.ts` — `defineAction({input, authorize, handler})`; `src/server/errors.ts` AppError
- `src/server/services/` — `audit.ts` (`audit(tx,{actor: scope,…})`, meta scrubbed, IP hashed), `flags.ts`; `src/features/flags/actions.ts`
- `src/proxy.ts` — per-request CSP nonce + SECURITY §5 headers, `x-request-id`, `/dev/*` 404 in production; `src/server/security/` — `headers.ts`, `rate-limit.ts` (`limit`, `limitOrThrow`, `tooManyRequests`, `ipKey`/`userKey`), `request.ts` (`clientIp` via `TRUSTED_PROXY`, `assertSameOrigin`), `turnstile.ts` (`verifyTurnstile`); `src/components/security/Turnstile.tsx`; `src/server/log.ts` (pino, `log()`, `requestLogger`)
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
- `pnpm check`: ✅ 2026-11-09 271 unit; `pnpm test:int` ✅ 225 (incl. authz 125+); E2E: full run 101 passed / 1 failed (devices flake → root-caused, fixed in 0a8aba5), then devices+auth+sign-in-edges 55/55 on 5 projects; auth.spec 60/60 ×4. Combined devices+auth ×4 on 5 projects overloads `next dev` on WebKit (17/18 failures = 30 s test timeouts) — stress artefact, not a regression; re-check on a production build at P0-B close
- P0-A gate 2026-11-09: QA agent regression (check 205, int 151, e2e 2 of 3 runs clean, gallery flake root-caused and fixed), then the 3 clean runs above; `build` ✅, `check:bundle` ✅ 45 names / 19 files, `test:titles --strict` ✅
- `pnpm test:mutation`: ✅ 90.1% (break 80); `pnpm test:live`: storage ✅, email skipped (H-04); `pnpm test:load:smoke`: runs (Docker k6), checks 100%, action p95 458 ms on `next dev` (not meaningful; staging gate)
- `pnpm test:titles --strict`: ✅ every test tagged
- `pnpm db:migrate`: ✅ 2026-11-08 (Windows; was silently skipped before the fix)
- `pnpm build`: ✅ 2026-11-08 19:45 (9 static pages; NODE_ENV must not be exported in the shell)
- CI on main: — (not set up yet) · Staging deploy: — · E2E smoke on staging: —

## Open questions / assumptions
- Not yet tested: passkey sign-in (needs a real device), real email provider (needs H-04).
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
