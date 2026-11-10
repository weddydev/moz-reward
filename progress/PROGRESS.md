# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-10 21:20 IST

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by Syedbadeshah76, 2026-11-10 21:50 IST (Windows).** P0-21 done and ticked (documents only, nothing to test; the gate was not run because the push is docs-only). Half-done: nothing. Not run on this laptop this session: `pnpm services:up`, `db:migrate`, `pnpm check` (H-32 still open on Windows). The notes below are talha.syed's P0-13 handoff and still apply.
- **Handed over by talha.syed, 2026-11-10 19:05 IST (macOS). P0-13 done 10 Nov.** One squashed commit on main. Remote `wip/P0-13` and `wip/P0-18` are stale (delete only with the human's OK).
- **What P0-13 is:** alerts (`src/server/ops/alerts.ts`: Redis dedup per kind, windows 5→30→60 min, ≤ 4/kind and ≤ 12/pool per day + one `alert.ceiling` notice, memory fallback; worker sends directly, web enqueues `email:ops-alert`; `ALERT_EMAILS`); health (`/api/health/{live,ready,worker}`, detail with `Authorization: Bearer $HEALTH_TOKEN`); health monitor in the worker (1-min timer, not BullMQ; `ops_snapshot` table 0012; scheduler grace 3 min after start); Sentry (`@sentry/node` web+worker, `@sentry/browser` lazy via `/api/monitoring` tunnel with placeholder DSN and its own budget; `src/lib/sentry-scrub.ts`; explicit `dataCollection`); Better Auth logger via pino; `/admin/system` (admin owner); consent-gated Umami (`NEXT_PUBLIC_UMAMI_PATH`/`_WEBSITE_ID`) + cookie notice; C-06 hint; `docs/RUNBOOK.md`; `infra/docker/daemon.json` (log rotation). DECISIONS has 8 P0-13 entries incl. the Sentry inventory and both security reviews.
- **Tested:** gate:task PASS (unit 491, int 444, build, bundle, sast, E2E P0-13 16/0); full 5-project E2E 313/0/0 flaky (on 07c8463, before the review fixes; the fixes' E2E specs passed in gate:task); hands-on: Redis stop → ready 503 + `health.redis` email in Mailpit; worker stop → `/api/health/worker` 503 after 3 min; local restore drill + replay dry run; start-up grace and log throttle re-checked on the real worker. security-reviewer: 2 HIGH + 5 should-fix fixed, re-review 0 BLOCK/HIGH, its 2 new should-fix fixed.
- **Not yet tested:** real Sentry account and alert rule (H-34); real Umami behind Caddy (C-36, P0-15); RUNBOOK VPS procedures (C-37); real Resend/Brevo (H-04); CI on the squashed commit (check before the next push).
- **Also done:** speed/token rules (CLAUDE.md §4, `3b7b8a8`): gate pass stamps (verified: push skipped the duplicate gate), quiet hooks, `pnpm fix`, QA agent pinned to Opus high. CI green on P0-13 (`7997853`, run 42823223240); check CI on `3b7b8a8` first.
- **Token rules, round 2 (Syedbadeshah76, 10 Nov 21:00, CLAUDE.md §4):** `/checkpoint` + human `/clear` + `/resume` after every task; task-level security review only for the 23 listed tasks; no task-level full E2E, 20-minute flake limit; findings policy. Audit findings not yet in the phase files are listed in SESSION_LOG (last entry).
- **Checkpoint by Syedbadeshah76, 10 Nov 21:45 IST: P0-21 done** (`docs/compliance/`: README with 10 questions for the solicitor, ROPA 41 rows, controller roles, processor register, DPIA, retention schedule with 11 proposed periods, DSAR and erasure, complaints). Documents only; nothing to test. H-23 steps updated.
- **Checkpoint by talha.syed, 10 Nov 22:05 IST (macOS): P0-16 done and pushed (`89a2a1e`)**, gate:task PASS. Nothing half-done. `pnpm db:seed` now also creates the demo data; `pnpm db:seed --reset` re-creates it; `pnpm demo:credentials [--codes]` prints the derived sign-in details (local ones are dev-only). The local DB on the Mac was reset and re-seeded. Staging part → C-38; human part → H-36.
- **Next:** P0-15 when H-06/07/08/26/27 land (C-19/21/23/27/32/33/35/36/37/38). Until then start P0-C: do the P0-08 brief check in `docs/phases/P0.md` (Acceptance, Edge cases, Tests, Verify), then P0-08. Check CI on `89a2a1e` before the next push.
- **Watch out:** E2E pages get a default `moz_consent=denied` cookie (fixture option `analyticsConsent`; `null` shows the notice). The web process has no worker pool, so System-page E2E data comes from the `ops-snapshot` test action. Server env names must not collide with strings in client bundles (`SENTRY_RELEASE` did → renamed `APP_RELEASE`).

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17, P0-19, P0-18, P0-20, P0-13, P0-21, P0-16. Next: P0-15 (waits on human tasks); P0-C can start meanwhile (P0-08).
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → ~~P0-18~~ → ~~P0-20~~ → ~~P0-13~~ → ~~P0-21~~ → P0-15 → ~~P0-16~~; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-10, talha.syed (P0-16 done)
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-16 done 10 Nov (demo seed: 3 shops, 7 accounts, derived credentials, TOTP pre-enrolled; `pnpm db:seed [--reset]`, `pnpm demo:credentials`). P0-15 is the only P0-E task left and waits on H-06/07/08/26/27.

## Next (top 3)
1. **P0-15**: VPS + staging (+ C-19, C-21, C-23, C-27, C-32, C-33, C-35, C-36, C-37, C-38); waits on H-06/07/08/26/27 (+ H-34 Sentry, H-36 demo inbox).
2. Meanwhile **P0-C**: P0-08 tokens, fonts, global styles (phase order A → B → E → C → D; P0-E closes with `/subphase-complete` once P0-15 lands).
3. P0-09 UI primitives and gallery (C-13, C-20).

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-01 | P0-06 | P0-12 | No staff/admin route before TOTP, tested per route group | authz route-group tests |
| C-02 | P0-06 | P0-12 | Role switcher; default portal per role | E2E |
| C-04 | B-CR-11 | P0-12 | `error.tsx` / `not-found.tsx` per route group | E2E |
| C-05 | B-QA-6, B-QA-7 | P0-12 | Signed-in staff on /staff/sign-in redirected; /wallet and /dashboard exist after sign-in | E2E |
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-20 | P0-14 | P0-09 | Interactive UI primitives (Tabs, Chip, Switch, SegmentedControl, Toast, Table) never lose a press before hydration (disabled/inert until hydrated, like `useHydrated` in DeviceList/SignOutButton) | E2E with JS chunks held |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-24 | B-SEC-13 (P0-19) | P0-12 | `ADMIN_IP_ALLOWLIST` (parsed, not yet enforced) applied to admin sign-in and the admin route group when set; a request from outside it gets the same answer as a wrong password / the 403 page | integration + E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-32 | P0-20 | P0-15 | Postgres bootstrap creates moz_app/moz_auth/moz_worker logins, moz_rls NOLOGIN WITH ADMIN to a non-superuser migration owner (boot asserts NOLOGIN), PostGIS revokes re-applied; four URLs only in their containers; staging max_connections 80; RLS EXPLAIN on staging data | staging boot + DECISIONS |
| C-33 | P0-20 review | P0-15 | Boot asserts each DB URL is its expected role (pg_has_role) and web logins can't SET ROLE worker/auth | integration |
| C-34 | P0-20 review | P1-01 | Checker fails moz_app `USING (true)` without reason marker; global marker only in the creating migration; adminRead enforced; membership counter column grants | lint test + integration |
| C-27 | P0-18 | P0-15 | Worker container stop grace ≥ 75 s (60 s drain); bundled worker keeps the `server-only` hook (emails render) | staging deploy log + worker-process test |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-36 | P0-13 review | P0-15 | Caddy proxies only `/u/script.js` + `/u/api/send` to Umami; dashboard on its own host behind auth | staging curl `/u/` → 404 |
| C-37 | P0-13 AC4 | P0-15 | RUNBOOK §4 deploy, §5 rollback, §9 key rotation, §12 disk, §13 Tunnel walked once on staging | deploy/rollback logs + SESSION_LOG |
| C-38 | P0-16 | P0-15 | Staging release runs `db:seed` as moz_worker with `DEMO_EMAIL_BASE` (exit 0 incl. the TOTP check); weekly `db:seed --reset` + RUNBOOK line; slim image can run `db:seed` / `demo:credentials`; demo owner password alone → challenge, enable 401 on staging | deploy log + staging curl |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: **H-32** `.env.local` DB roles on the Windows laptop (Mac done). 🟠: H-34 Sentry account, H-36 demo inbox + staging demo credentials, H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts` + `attempt-guard.ts` (atomic lockout), `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `withScope`, `transaction`, `adminRead`, `poolFor` (auth/system), `inShop`, `ownedBy`; scope → role pool + SET LOCAL); `src/server/services/` (audit incl. `auditAs`, flags, sessions)
- `src/server/ops/` (P0-13) — `alerts.ts` (dedup + delivery), `health-rules.ts`, `ready.ts` (health routes `src/app/api/health/*`), `usage.ts`; `src/server/jobs/health-monitor.ts`, `log-throttle.ts`; `src/server/repos/ops.ts`; `src/server/observability/` (Sentry, tunnel `/api/monitoring`, request errors); `src/lib/sentry-scrub.ts`, `sentry-browser.ts`, `consent.ts`; `src/features/admin/system/` (+ `src/app/(admin)/admin/system`), `src/features/consent/`; `docs/RUNBOOK.md`
- `src/server/security/` — `headers.ts`, `rate-limit.ts` (`ipLimit` policy), `auth-limit.ts` (blanket `/api/auth/*`), `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`, `ip-bucket.ts` (IPv6 /64), `alert.ts` (`securityAlert`), `keys.ts` (HKDF purposes); `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry (`defineJob`: versioned `{ v, data }` payloads, `envelope.ts`), `outbox.ts` (`writeOutbox`; `tools.outbox` in actions), `relay.ts` (relay loop, `replayOutbox`, `sweepOutbox`), DLQ, scheduler (Europe/London, `RETIRED_SCHEDULES`); `scripts/relay.ts` (`pnpm relay --replay-since`); worker/CLI run via `scripts/server-only-hook.mjs` (not react-server)
- `src/server/db/` — Drizzle client (`dbAs(role)`: app/auth/system pools; `testOwnerDb()` tests only), schema, `migrate.ts` (+ local role logins), `seed.ts` (as moz_worker; baseline + demo), `demo-seed.ts` (P0-16: demo shops/accounts with fixed ids, derived credentials, `resetDemo`, `privilegedWithoutTotp`; `scripts/demo-credentials.ts`), `reset.ts`; `drizzle/` migrations 0000–0012 (0012 ops_snapshot; 0005 lower-case email CHECK, 0006 session revocation trigger, 0007 pinned search_path, 0008 outbox, **0009 RLS + roles**, 0010/0011 RLS review hardening); `drizzle/concurrent/` non-transactional index builds; `scripts/rls-bench.ts` (`pnpm db:rls-bench`)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis queue instance (:6379, noeviction) + redis-cache (:6380, allkeys-lru), Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026)
- P0-16: gate:task PASS (unit 511, int 457, build, bundle, sast; no E2E specs: no screens); `pnpm db:reset && pnpm db:seed` twice → identical counts and checksums; `--reset` and `demo:credentials` run locally. Staging: NOT VERIFIED (C-38).
- P0-13: gate:task PASS (unit 491, int 444, E2E P0-13 16/0); full 5-project E2E 313/0 (07c8463); AC2 by hand (Redis stop → 503 + alert mail); security re-review 0 BLOCK/HIGH.
- P0-20 re-review (0011): gate:task PASS (unit 462, int 406, build, bundle, sast, E2E P0-20 2/0). Full E2E after 0010: Chromium 69 + WebKit 51 pass, 0 fail (18 skipped by design).
- P0-20 (`9130581`): gate:task PASS (unit 462, int 401, E2E P0-20 2/0); CI 42785082564 green; e0fc442 CI green 42783610640; full E2E 272 + 5/5.
- P0-18 (`wip/P0-18` `cffc65b` → squashed to main): gate:task PASS (unit 448, int 357, build, bundle, sast); full E2E locally 268/0; real worker smoke (outbox → Mailpit, SIGTERM exit 0). CI: step C green 42771794684; step D red 42772627338 (axe flake, fixed), review fixes red 42774087662 (Semgrep, fixed); final branch run 42775110214 green.
- main `a1fc0c5` (P0-19): CI green 42761722399 incl. image + Trivy; full E2E Chromium+WebKit 116/0.
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
