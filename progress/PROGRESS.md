# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-10 08:08 IST

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by talha.syed (Mac), 2026-11-10 02:01 IST.** P0-19 is ~60% done on the pushed branch **`wip/P0-19`** (head `4b4f931`). `main` is untouched apart from progress files. The gate PASSed on every push. **First, check the CI run for `4b4f931` (run 42693725417, still queued at handover):** step F's run 42692488662 was green; step E's run 42690679564 was red with a one-off axe `document-title` failure, which `4b4f931` fixes.
- **Done on `wip/P0-19`:** A boot fails closed + key/Redis/DB-role rules (closes C-09) · B migration 0007 trigger search_path · C prefetch security headers · D Better Auth route allowlist + `/update-user` validation · **E** blanket `/api/auth/*` limit of 100/min/IP (`src/server/security/auth-limit.ts`; Redis down → 503, sign-out exempt); `ipLimit()` makes an "unknown" IP one strict shared bucket (¼ of the allowance) for magic link, staff login, 2FA and anonymous actions (it used to be a bypass); `humanWait` "1 minutes" fixed · **F** email link → `/sign-in/confirm` (plain form, works without JS) → POST `/api/sign-in/confirm` (`src/server/auth/link-confirm.ts`) calls the library's verify through its handler; public GET `/api/auth/magic-link/verify` and `/error` are 404 (`INTERNAL_AUTH_ROUTES` in routes.ts); `onAPIError.errorURL` = `/sign-in`. Plus two E2E axe-guard fixes (waits for finite animations and for the streamed `<title>`).
- **Remaining P0-19 (in this order):** G lockout redesign: Turnstile on a locked account, lock by account+IP, alert, atomic Lua check-and-reserve, 2FA failures per user (AC4, AC5; `src/server/auth/staff-login.ts` still uses a non-atomic HMGET then write) · H Brevo wired as failover behind the email interface · I SECURITY conformance test on the production build (AC1: cookies per role, session limits, client IP under spoofed XFF, §5 headers, `/api/auth/*` 429 + Retry-After; run the E2E server with TRUSTED_PROXY=caddy and set X-Forwarded-For per request, because "local" skips per-IP limits) · J secrets-handling notes (B4) in RUNBOOK/SECURITY · then security-reviewer on the whole branch diff, squash to main, tick P0-19, close C-08/C-09.
- **Tested (this session):** `pnpm gate:task` PASS on the last push (unit 394, int 296, build, bundle, E2E P0-19 10/0); E2E Chromium+WebKit for link-confirm/auth/sign-in-edges/devices 31/1 → the failure was the axe fade race, fixed, then devices ×8 WebKit 48/0; auth.spec ×4 on desktop1440+pixel7 24/0.
- **Not yet tested:** the CI run of `4b4f931`; the confirm page's design review (screenshot `customer-confirm-sign-in` in `.artifacts/screens`; design-reviewer not run); the Redis-down 503 on a real HTTP request (covered in integration via an injected limiter only).
- **First steps for the next person:** `git checkout wip/P0-19 && git pull`; no new env vars or migrations since 0007. `.env.local` needs `DATA_ENCRYPTION_KEY`, `BLIND_INDEX_KEY`, `MEMBER_QR_SIGNING_KEY` (base64, 32 bytes; `openssl rand -base64 32`). Links emailed before step F (old `/api/auth/magic-link/verify` URL) now 404: request a new one.
- **Still pending from earlier:** `wip/P0-14` can be deleted (its src/scripts/tests tree equals main; human to confirm). Untracked `moz-plan-v5-prompt.md` files are the human's (not committed). Done 10 Nov: release-age exclusion list removed; Windows pre-push hook confirmed (`guard-and-gate.sh` printed).

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17. P0-A closed; **P0-B closed 10 Nov** (CI green on main). Next: P0-19.
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → P0-19 → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Projected end:** P0 Wed 18 Nov 2026 · P1 Mon 30 Nov · P2 Thu 10 Dec · P3 Sat 19 Dec · P4 Sat 2 Jan 2027 · P5 Tue 12 Jan · **launch Fri 22 Jan 2027** (assumptions in PHASES.md; slips if human tasks are late or the Play account needs a 14-day closed test).
- **Last updated:** 2026-11-10 02:01 IST, talha.syed
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-19 in progress on `wip/P0-19` (A–F done; G–J next). E: blanket `/api/auth/*` limit 100/min/IP, unknown IP = strict shared bucket. F: email link → `/sign-in/confirm` page, token consumed only by POST `/api/sign-in/confirm`; public GET verify and `/error` are 404; OAuth errors → `/sign-in`. Axe guard waits for transitions (WebKit flake fixed).

## Next (top 3)
1. **P0-19** on `wip/P0-19`: check CI of `4b4f931`, then steps G–J → security-reviewer → squash → tick (closes C-08, C-09).
2. **P0-18**: outbox, Redis split, failure modes, safe migrations (+ C-11, C-18).
3. **P0-20**: mandatory RLS (+ C-12).

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
| C-08 | B-SEC-5, B-CR-5, B-SEC-3, B-SEC-9, B-SEC-10, B-SEC-8, B-SEC-13, B-SEC-14, L10 | P0-19 | Items listed in P0-19 Build | P0-19 acceptance 1–7 |
| C-09 | A-SEC-M2, A-SEC-M3, A-SEC-L3, A-QA-6 | P0-19 | Boot refuses owner DB role / Redis without password / weak keys; invalid env exits | integration — **done on wip/P0-19 (step A)** |
| C-11 | A-CR-M3, B-CR-9, A-CR-L2 | P0-18 | `enqueue` and after-commit timeouts; schedule pruning safe in rolling deploys | integration |
| C-12 | A-SEC-M4, A-CR-L4 | P0-20 | `systemScope` imports restricted; `dbFor().transaction` bypass closed; tenant repos take ShopScope/CustomerScope | lint + integration |
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-18 | A-CR-L6 (part) | P0-18 | Migration linter: CREATE INDEX on an existing table must be CONCURRENTLY (needs the non-transactional migration helper) | lint negative fixture |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-20 | P0-14 | P0-09 | Interactive UI primitives (Tabs, Chip, Switch, SegmentedControl, Toast, Table) never lose a press before hydration (disabled/inert until hydrated, like `useHydrated` in DeviceList/SignOutButton) | E2E with JS chunks held |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🟠: H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. Before P1 (Thu 19 Nov): H-22 loyalty defaults. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts`, `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`); `src/server/services/` (audit, flags, sessions)
- `src/server/security/` — `headers.ts`, `rate-limit.ts` (`ipLimit` policy), `auth-limit.ts` (blanket `/api/auth/*`), `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`; `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry, `enqueue`, DLQ, scheduler (Europe/London)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0006 (0005 lower-case email CHECK, 0006 session revocation trigger)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis 7, Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026, 02:00 IST)
- `wip/P0-19` `4b4f931`: gate:task PASS (unit 394, int 296, E2E P0-19 10/0). CI: step F run 42692488662 green; step E run 42690679564 red (axe title race, fixed in `4b4f931`); run 42693725417 pending at handover.
- main `9fd32ad` CI green (run 42682167002): check, integration + coverage, migration test, production build + bundle, E2E pixel7+desktop1440, OSV, audit, Semgrep, gitleaks, **image build + Trivy**. AC2 red runs 42678683969/42678688078/42678695896/42678701681/42678708263. `ci:usage`: 89 of 2000 min (4%) after a heavy day (×7 ≈ 31%).
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Untracked files `moz-plan-v5-prompt.md` (repo root) and `src/features/moz-plan-v5-prompt.md` (a duplicate) are the human's prompt — not committed; delete or move them when no longer needed.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
