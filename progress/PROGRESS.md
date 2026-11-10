# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-10 11:59 IST

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **talha.syed, 2026-11-10 (macOS): P0-18 done and squashed to `main`.** Baton still held (checkpoint, not a handoff). Next task: **P0-20** (RLS).
- **P0-18 in short:** outbox (migration 0008: written in the change's transaction, `tools.outbox` / `writeOutbox`), relay in the worker (lease + SKIP LOCKED, `jobId = outbox.id`, backoff), completion and dead-letter marks, sweep (stale > 2 min alert, lost jobs re-dispatched, 7-day prune), `pnpm relay --replay-since … [--dry-run] [--force]`, versioned `{ v, data }` payloads, required `failMode` (closed → 503 UNAVAILABLE), one 2 s after-commit deadline, `RETIRED_SCHEDULES`, 60 s drain, Redis pair check at boot. Staff lockout email goes through the outbox.
- **Changed how things run:** `pnpm worker` / `pnpm relay` use `tsx --import ./scripts/server-only-hook.mjs` (react-server broke email rendering; `tests/integration/worker-process.test.ts` spawns the real worker). `pnpm sast` (Semgrep in Docker) is now in `gate:task` and is what CI runs. `<html data-hydrated>` marks hydration; the E2E axe guard waits for it.
- **First steps for the next person:** `git pull`; `pnpm services:up`; `pnpm db:migrate` (0008 was regenerated before merge: if your local DB applied an earlier 0008 from `wip/P0-18`, run `pnpm db:reset`). Docker must be running for `gate:task` (Semgrep).
- **P0-20 notes:** Better Auth reads the user-scoped auth tables through its own adapter, outside our SET LOCAL helper, so RLS on `users`/`sessions`/`accounts`/`two_factors`/`passkeys` needs a deliberate design (e.g. its own connection/policy). Also C-29 (outbox INSERT-only for `moz_app`), C-30 (scope on outbox rows), C-12 (systemScope allowlist incl. staff-login).
- **Not yet tested:** real Resend/Brevo sends (H-04); Turnstile at 320 px with a real site key; X-Request-Id overwrite needs Caddy (C-23 → P0-15).
- **Watch out:** E2E specs that open their own browser context must pass `extraHTTPHeaders: clientHeaders()`. Server-side `auth.api.signInEmail/verify*` is a lint error. Untracked `moz-plan-v5-prompt.md` files are the human's (never commit them). Remote branch `wip/P0-18` still exists (not deleted without the human's OK).

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17, P0-19, **P0-18**. P0-A closed; P0-B closed 10 Nov. Next: P0-20.
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → ~~P0-18~~ → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-10, talha.syed
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-18 done 10 Nov (outbox, Redis split, fail modes, safe migrations; see SESSION_LOG). Next: P0-20.

## Next (top 3)
1. **P0-20**: mandatory RLS (+ C-12). The outbox and worker run under systemScope: RLS must leave the relay/worker able to read every tenant's rows (worker DB role).
2. **P0-13**: observability (+ C-03, C-06, C-22, C-26).
3. **P0-21**: compliance drafts.

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
| C-12 | A-SEC-M4, A-CR-L4, P0-18 review | P0-20 | `systemScope` imports restricted (allowlist incl. staff-login lockout, with reason); `dbFor().transaction` bypass closed; tenant repos take ShopScope/CustomerScope | lint + integration |
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
| C-29 | P0-18 review | P0-20 | `moz_app` INSERT-only on `outbox`; relay/worker as `moz_worker` | integration |
| C-30 | P0-18 review | P0-20 | Outbox rows carry the originating scope; tenant handlers run under it (RLS), authz matrix covers jobs | integration + matrix |
| C-31 | P0-18 review | P0-13 | RUNBOOK restore: replay limits (effects after the restore point may repeat; external idempotency keys), `outbox.stale`/`outbox.lost` deduped with C-22, lockout-email per-user daily cap | runbook + test |
| C-27 | P0-18 | P0-15 | Worker container stop grace ≥ 75 s (60 s drain); bundled worker keeps the `server-only` hook (emails render) | staging deploy log + worker-process test |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
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
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry (`defineJob`: versioned `{ v, data }` payloads, `envelope.ts`), `outbox.ts` (`writeOutbox`; `tools.outbox` in actions), `relay.ts` (relay loop, `replayOutbox`, `sweepOutbox`), DLQ, scheduler (Europe/London, `RETIRED_SCHEDULES`); `scripts/relay.ts` (`pnpm relay --replay-since`); worker/CLI run via `scripts/server-only-hook.mjs` (not react-server)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0008 (0005 lower-case email CHECK, 0006 session revocation trigger, 0007 pinned search_path, 0008 outbox); `drizzle/concurrent/` non-transactional index builds
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis queue instance (:6379, noeviction) + redis-cache (:6380, allkeys-lru), Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026)
- P0-18 (`wip/P0-18` `cffc65b` → squashed to main): gate:task PASS (unit 448, int 357, build, bundle, sast); full E2E locally 268/0; real worker smoke (outbox → Mailpit, SIGTERM exit 0). CI: step C green 42771794684; step D red 42772627338 (axe flake, fixed), review fixes red 42774087662 (Semgrep, fixed); final branch run 42775110214 green.
- main `a1fc0c5` (P0-19): CI green 42761722399 incl. image + Trivy; full E2E Chromium+WebKit 116/0.
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
