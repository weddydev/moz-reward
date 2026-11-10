# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-10 11:59 IST

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by Syedbadeshah76 (Windows), 2026-11-10 11:48 IST.** P0-19 is done and on `main` (`a1fc0c5`, CI green 42761722399). **P0-18 is ~40% done on the pushed branch `wip/P0-18`** (head `dd2314a`); `main` has no P0-18 code.
- **Done on `wip/P0-18`:** **A** `drizzle/concurrent/` non-transactional `CREATE INDEX CONCURRENTLY IF NOT EXISTS` helper (applied after Drizzle migrations, once each, INVALID leftovers rebuilt) + linter rules (C-18, AC5); migration sessions lock_timeout 5 s / statement 5 min; web pool statement_timeout 5 s, worker 60 s (`setDbProcess`); connection budget checked at boot (staging `max_connections` → 60 in infra/RESOURCES.md) · **B** Redis split: dev `redis` = queue instance (noeviction, AOF everysec) + new `redis-cache` on 6380 (allkeys-lru); `REDIS_CACHE_URL`; `cached()` fail-open helper (`src/server/cache.ts`); producer commands time out after 2 s (CR-M3) — AC3 tested.
- **Remaining P0-18 (in this order):** **C** `outbox` table (migration 0008) + writer in the action template (`tools.outbox(queue, name, payload)` inside the tx) + relay in the worker (keyset, `FOR UPDATE SKIP LOCKED`, `jobId = outbox.id`, mark `dispatched_at`, exponential retry) + per-row `completed_at` so replayed jobs are no-ops + sweeper alert for rows > 2 min (`securityAlert`→ generalise to an ops alert) + `relay --replay-since` CLI + payload versioning in the registry (`{ v, data }` + upgrade chain) — AC1, AC4, AC6, AC7; first real producer: move the staff lockout email to the outbox (job `email:staff-lockout`) · **D** action-template `rateLimit.failMode: "closed"` → 503 for auth/money (AC2), after-commit callback timeout (B-CR-9), schedule pruning only for an explicit `RETIRED_SCHEDULES` list (CR-L2), worker drain 60 s, SSE `retry:`+jitter helper (or carry to the SSE task) · then DECISIONS (Redis split + fail modes + concurrent helper), security-reviewer, squash to main, tick P0-18, close C-11/C-18.
- **First steps for the next person:** `git fetch && git checkout wip/P0-18`; **`pnpm services:up`** (starts the new `redis-cache` container on 127.0.0.1:6380); `pnpm db:migrate`. Optional `.env.local` lines: `REDIS_CACHE_URL=redis://:moz@localhost:6380`, `REDIS_CACHE_URL_TEST=redis://:moz@localhost:6380/1` (both default to these). From P0-19: `EMAIL_FALLBACK_PROVIDER`/`EMAIL_FALLBACK_API_KEY` optional locally.
- **Tested (this session):** gate:task PASS on the last push of `wip/P0-18` (unit 430, int 331, build, bundle); new tests `concurrent-migrations`, `db-session` (5 s statement cancel), `redis-split` (eviction only on the cache), boot budget unit test. One earlier gate run failed only because the Windows clock was stepped back mid-run (heartbeat age 128 s, timeouts); the same files passed alone and the re-run was green.
- **Not yet tested:** CI run 42767558077 of `dd2314a` was queued at handover (step A's run 42765978050 green); real Resend/Brevo sends (H-04); Turnstile at 320 px with a real site key; X-Request-Id overwrite needs Caddy (C-23 → P0-15).
- **Watch out:** E2E specs that open their own browser context must pass `extraHTTPHeaders: clientHeaders()` (E2E server runs as behind Caddy). Server-side `auth.api.signInEmail/verify*` is a lint error. Untracked `moz-plan-v5-prompt.md` files are the human's (never commit them).

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17, **P0-19**. P0-A closed; P0-B closed 10 Nov. Next: P0-18.
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-10 11:48 IST, Syedbadeshah76
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-18 in progress on `wip/P0-18` (A–B done; C–D next). P0-19 done 10 Nov (see SESSION_LOG).

## Next (top 3)
1. **P0-18** on `wip/P0-18`: step C (outbox + relay + replay + payload versioning), step D (fail-closed actions, timeouts, schedule pruning, drain), reviewer, squash (closes C-11, C-18).
2. **P0-20**: mandatory RLS (+ C-12).
3. **P0-13**: observability (+ C-03, C-06, C-22, C-26).

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-01 | P0-06 | P0-12 | No staff/admin route before TOTP, tested per route group | authz route-group tests |
| C-02 | P0-06 | P0-12 | Role switcher; default portal per role | E2E |
| C-03 | P0-07, B-SEC-4b | P0-13 | Unexpected errors reported to Sentry; Better Auth logger through pino | integration + Sentry event |
| C-04 | B-CR-11 | P0-12 | `error.tsx` / `not-found.tsx` per route group | E2E |
| C-05 | B-QA-6, B-QA-7 | P0-12 | Signed-in staff on /staff/sign-in redirected; /wallet and /dashboard exist after sign-in | E2E |
| C-06 | B-QA-8 | P0-13 | Slow-3G: sign-in button state explained before hydration | screenshot + E2E |
| C-07 | B-SEC-2 | P0-16 + P2 invites | No staff TOTP enrolment with the password alone (invite token) | integration |
| C-11 | A-CR-M3, B-CR-9, A-CR-L2 | P0-18 | `enqueue` and after-commit timeouts; schedule pruning safe in rolling deploys | integration |
| C-12 | A-SEC-M4, A-CR-L4 | P0-20 | `systemScope` imports restricted; `dbFor().transaction` bypass closed; tenant repos take ShopScope/CustomerScope | lint + integration |
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-18 | A-CR-L6 (part) | P0-18 | Migration linter: CREATE INDEX on an existing table must be CONCURRENTLY (needs the non-transactional migration helper) | lint negative fixture |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-20 | P0-14 | P0-09 | Interactive UI primitives (Tabs, Chip, Switch, SegmentedControl, Toast, Table) never lose a press before hydration (disabled/inert until hydrated, like `useHydrated` in DeviceList/SignOutButton) | E2E with JS chunks held |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-22 | P0-19 (G) | P0-13 | `securityAlert()` events (first: `auth.lockout`) reach both developers (Sentry alert rule or health-job email), not only the log, **deduplicated** (e.g. one per event kind per 5 min with a count) so a spray of unknown emails can't flood both inboxes or the email quota | integration + received alert |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-24 | B-SEC-13 (P0-19) | P0-12 | `ADMIN_IP_ALLOWLIST` (parsed, not yet enforced) applied to admin sign-in and the admin route group when set; a request from outside it gets the same answer as a wrong password / the 403 page | integration + E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-26 | P0-19 review | P0-13 | Sentry (`beforeSend` + breadcrumbs) and Umami strip `token` (and any `code`) query parameters: the sign-in confirm page URL carries the token | unit + Sentry event |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🟠: H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. Before P1 (Thu 19 Nov): H-22 loyalty defaults. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts` + `attempt-guard.ts` (atomic lockout), `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`); `src/server/services/` (audit, flags, sessions)
- `src/server/security/` — `headers.ts`, `rate-limit.ts` (`ipLimit` policy), `auth-limit.ts` (blanket `/api/auth/*`), `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`, `ip-bucket.ts` (IPv6 /64), `alert.ts` (`securityAlert`), `keys.ts` (HKDF purposes); `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry, `enqueue`, DLQ, scheduler (Europe/London)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0007 (0005 lower-case email CHECK, 0006 session revocation trigger, 0007 pinned search_path)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis queue instance (:6379, noeviction) + redis-cache (:6380, allkeys-lru, from P0-18 branch), Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026, 11:48 IST)
- `wip/P0-18` `dd2314a`: gate:task PASS (unit 430, int 331, build, bundle). CI: step A run 42765978050 green; step B run 42767558077 queued at handover.
- main `a1fc0c5` (P0-19): gate:task PASS; CI green 42761722399 incl. image + Trivy; full E2E Chromium+WebKit 116/0.
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
