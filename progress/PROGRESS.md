# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-10 16:21 IST

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed, 2026-11-10 17:45 IST (macOS); baton still held.** P0-13 is **in progress on `wip/P0-13`** (pushed, gate:task PASS): `0816b62`→`4a2bc7d` step A, `728995c` step B. Rebase it on main before continuing (`git checkout wip/P0-13 && git rebase main`). Squash into one P0-13 commit at the end.
- **Done on main this session:** `1b5588f` P0-20 re-review (0011: shops/shop_staff writes need admin owner/support, flags owner only, content settings owner/moderator, RLS helpers not PUBLIC, NULL-role outbox rows refused, worker refuses system job without its outbox row; catalog test pins definer functions; worker-process test kills its child when Vitest dies). `dd05afe` scheduled-CI fix (Chromium-only flag in csp-injection spec; 5-project Linux run 42812524717 green).
- **P0-13 step A (done):** `src/server/ops/alerts.ts` — securityAlert/opsAlert → Redis dedup per kind (5 min, counted, flushed by the monitor), memory fallback when Redis is down; worker sends directly (`enableDirectAlertDelivery`), web enqueues `email:ops-alert`; `ALERT_EMAILS` (local default `ops-alerts@moz.localhost`); lockout email ≤ 3/account/UK day (C-31 code part). Tests `tests/integration/alerts.test.ts` 8/8.
- **P0-13 step B (done):** `/api/health/{live,ready,worker}` (`src/server/ops/ready.ts`; detail only with `HEALTH_TOKEN`), health monitor `src/server/jobs/health-monitor.ts` (1-min timer in the worker, not BullMQ), thresholds `src/server/ops/health-rules.ts`, usage counters `src/server/ops/usage.ts` (email/day, Sentry/month in redis-queue), `ops_snapshot` table (0012, admin owner reads via RLS), `src/server/repos/ops.ts`. Tests `health.test.ts` 8/8, `health-rules.test.ts` 10/10.
- **Remaining steps:** **C** Sentry (`@sentry/nextjs` web + `@sentry/node` worker; DECISIONS dependency entry + library inventory; `beforeSend`/breadcrumbs strip PII and `token`/`code` query params (C-26); request id tag; release/env; per-process event cap + `countSentryEvent()`; action template + `onRequestError` report unexpected errors and raise `error.unexpected`; Better Auth `logger` through pino (C-03); client via a `/api/monitoring` tunnel route (validates DSN, body limit, rate limit) so CSP needs no Sentry host; local proof with a fake Sentry HTTP sink) → **D** admin System page `/admin/system` (admin owner, `readOpsSnapshot`, screenshots 320/390/1440) → **E** Umami loaded only after consent + basic cookie notice (`data-exclude-search`, C-26), C-06 slow-3G sign-in explanation → **F** `docs/RUNBOOK.md` (deploy, rollback, restore + `pnpm relay --replay-since … --dry-run` and replay limits (C-31), Redis loss, key leak, email outage/quota, VPS rebuild, Tunnel down, reading the System page; each alert kind by name), ARCHITECTURE §11 SLO wording, Docker log rotation config (`infra/`), then AC2 by hand (stop Redis with app + worker running → ready 503 + Mailpit mail), security-reviewer, squash, tick.
- **New env vars for `.env.example` (blocked by H-33):** `ALERT_EMAILS=` (comma list, required outside local/test), `EMAIL_DAILY_CAP=400`, `HEALTH_TOKEN=` (≥ 32 chars, optional), `DISK_PATH=/`, `BACKUPS_ENABLED=false`, `SENTRY_MONTHLY_QUOTA=5000` (+ Sentry/Umami vars in C/E).
- **Watch out:** E2E specs opening their own context pass `extraHTTPHeaders: clientHeaders()`. Untracked `moz-plan-v5-prompt.md` files are the human's (never commit). Remote `wip/P0-18` still exists (delete only with the human's OK). Orphaned test workers: check `ps` for `src/worker/index.ts` if an outbox test flakes.

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17, P0-19, P0-18, P0-20. In progress: P0-13 (`wip/P0-13`, steps A–B of A–F).
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → ~~P0-18~~ → ~~P0-20~~ → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-10 17:45 IST, talha.syed (P0-13 checkpoint)
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-13 observability on `wip/P0-13`: A alerts ✅, B health ✅; next C Sentry. P0-20 re-review (0011) and scheduled-CI WebKit fix on main.

## Next (top 3)
1. **P0-13 step C**: Sentry web + worker + tunnel, PII/query scrubbing (C-26), Better Auth logger via pino (C-03), action template reporting.
2. **P0-13 steps D–F**: System page, consent-gated Umami + cookie notice + C-06, RUNBOOK; AC2 by hand; security-reviewer; squash + tick.
3. **P0-21** compliance drafts, then **P0-15** (waits on H-06/07/08/26/27/34).

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
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-20 | P0-14 | P0-09 | Interactive UI primitives (Tabs, Chip, Switch, SegmentedControl, Toast, Table) never lose a press before hydration (disabled/inert until hydrated, like `useHydrated` in DeviceList/SignOutButton) | E2E with JS chunks held |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-22 | P0-19 (G), P0-18 | P0-13 | `securityAlert()` and `opsAlert()` events (first: `auth.lockout`, `outbox.stale`) reach both developers (Sentry alert rule or health-job email), not only the log, **deduplicated** (e.g. one per event kind per 5 min with a count) so a spray of unknown emails can't flood both inboxes or the email quota | integration + received alert |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-24 | B-SEC-13 (P0-19) | P0-12 | `ADMIN_IP_ALLOWLIST` (parsed, not yet enforced) applied to admin sign-in and the admin route group when set; a request from outside it gets the same answer as a wrong password / the 403 page | integration + E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-26 | P0-19 review | P0-13 | Sentry (`beforeSend` + breadcrumbs) and Umami strip `token` (and any `code`) query parameters: the sign-in confirm page URL carries the token | unit + Sentry event |
| C-31 | P0-18 review | P0-13 | RUNBOOK restore: replay limits (effects after the restore point may repeat; external idempotency keys), `outbox.stale`/`outbox.lost` deduped with C-22, lockout-email per-user daily cap | runbook + test |
| C-32 | P0-20 | P0-15 | Postgres bootstrap creates moz_app/moz_auth/moz_worker logins, moz_rls NOLOGIN WITH ADMIN to a non-superuser migration owner (boot asserts NOLOGIN), PostGIS revokes re-applied; four URLs only in their containers; staging max_connections 80; RLS EXPLAIN on staging data | staging boot + DECISIONS |
| C-33 | P0-20 review | P0-15 | Boot asserts each DB URL is its expected role (pg_has_role) and web logins can't SET ROLE worker/auth | integration |
| C-34 | P0-20 review | P1-01 | Checker fails moz_app `USING (true)` without reason marker; global marker only in the creating migration; adminRead enforced; membership counter column grants | lint test + integration |
| C-27 | P0-18 | P0-15 | Worker container stop grace ≥ 75 s (60 s drain); bundled worker keeps the `server-only` hook (emails render) | staging deploy log + worker-process test |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: **H-32** `.env.local` DB roles on the Windows laptop (Mac done). 🟠: **H-33** deny rule blocks `.env.example` (P0-13 needs it now), H-34 Sentry account, H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts` + `attempt-guard.ts` (atomic lockout), `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `withScope`, `transaction`, `adminRead`, `poolFor` (auth/system), `inShop`, `ownedBy`; scope → role pool + SET LOCAL); `src/server/services/` (audit incl. `auditAs`, flags, sessions)
- `src/server/ops/` (P0-13, on wip) — `alerts.ts` (dedup + delivery), `health-rules.ts`, `ready.ts` (health routes `src/app/api/health/*`), `usage.ts`; `src/server/jobs/health-monitor.ts`; `src/server/repos/ops.ts`
- `src/server/security/` — `headers.ts`, `rate-limit.ts` (`ipLimit` policy), `auth-limit.ts` (blanket `/api/auth/*`), `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`, `ip-bucket.ts` (IPv6 /64), `alert.ts` (`securityAlert`), `keys.ts` (HKDF purposes); `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry (`defineJob`: versioned `{ v, data }` payloads, `envelope.ts`), `outbox.ts` (`writeOutbox`; `tools.outbox` in actions), `relay.ts` (relay loop, `replayOutbox`, `sweepOutbox`), DLQ, scheduler (Europe/London, `RETIRED_SCHEDULES`); `scripts/relay.ts` (`pnpm relay --replay-since`); worker/CLI run via `scripts/server-only-hook.mjs` (not react-server)
- `src/server/db/` — Drizzle client (`dbAs(role)`: app/auth/system pools; `testOwnerDb()` tests only), schema, `migrate.ts` (+ local role logins), `seed.ts` (as moz_worker), `reset.ts`; `drizzle/` migrations 0000–0012 (0012 ops_snapshot; 0005 lower-case email CHECK, 0006 session revocation trigger, 0007 pinned search_path, 0008 outbox, **0009 RLS + roles**, 0010/0011 RLS review hardening); `drizzle/concurrent/` non-transactional index builds; `scripts/rls-bench.ts` (`pnpm db:rls-bench`)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis queue instance (:6379, noeviction) + redis-cache (:6380, allkeys-lru), Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026)
- P0-13 A–B (`728995c`, wip): gate:task PASS on push; unit 474, int 422. Scheduled 5-project E2E (Linux) green 42812524717 after `dd05afe`; CI green 42806357736 (0011).
- P0-20 re-review (0011): gate:task PASS (unit 462, int 406, build, bundle, sast, E2E P0-20 2/0). Full E2E after 0010: Chromium 69 + WebKit 51 pass, 0 fail (18 skipped by design).
- P0-20 (`9130581`): gate:task PASS (unit 462, int 401, E2E P0-20 2/0); CI 42785082564 green; e0fc442 CI green 42783610640; full E2E 272 + 5/5.
- P0-18 (`wip/P0-18` `cffc65b` → squashed to main): gate:task PASS (unit 448, int 357, build, bundle, sast); full E2E locally 268/0; real worker smoke (outbox → Mailpit, SIGTERM exit 0). CI: step C green 42771794684; step D red 42772627338 (axe flake, fixed), review fixes red 42774087662 (Semgrep, fixed); final branch run 42775110214 green.
- main `a1fc0c5` (P0-19): CI green 42761722399 incl. image + Trivy; full E2E Chromium+WebKit 116/0.
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
