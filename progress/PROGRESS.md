# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-09 23:05

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **talha.syed (Mac), 2026-11-10 01:00.** P0-14 is **squashed onto main** as one `feat(ci)` commit (from `wip/P0-14` `19705be`; the branch is kept until main CI is green, then deleted). **Do first:** check the CI run on that main commit — `ci` + `scans` + the **image job (build + Trivy, first time ever)**. When green: tick P0-14 and P0-B in PHASES.md with a docs-only progress commit (its push also shows AC5 on main: hook "docs/progress-only", no CI run). If Trivy blocks, fix the base image/packages it names (HIGH/CRITICAL with a fix only).
- **P0-14 evidence (this session):** AC1 CI green on `wip/P0-14` run 42677704427 (unit 47 files, coverage 70 files incl. thresholds, E2E pixel7+desktop1440 68 passed / 0 failed / 0 flaky, OSV pass, audit 1 low, Semgrep default+OWASP+secrets clean) — main run pending. AC2 red runs, each failing for its reason: unit 42678683969, console.error 42678688078, axe 42678695896, Prettier 42678701681, migration lock_timeout 42678708263 (branches deleted). AC3 `pnpm e2e` = production build; `/api/test/runtime` limiter-off test in the P0-14 specs. AC4 gate:task/gate:phase/ci:usage exist, compact summaries, tree-clean step. AC5 docs-only branch push → no CI run (on main: next push). AC6 free mode: pre-push refused a push with a failing gate (typecheck), and refuses force-push / deleting main (dry runs, after the lefthook fix).
- **Also fixed on the way:** lefthook skipped the pre-push guard on new branches and `git push origin :main` (now a lefthook script); Postgres healthcheck over TCP (CI ECONNRESET); devices/sign-out buttons disabled until hydrated (CI E2E flake, reproduced by holding JS chunks); secret-free Docker build (lazy `getAuth()`); flags service tests (coverage).
- **Not verified:** image job + Trivy (runs only on main — first run now); `gate:phase` end to end (phase gate); Windows behaviour of the `.lefthook` script and the shell guard — **Syedbadeshah76: on your next push confirm the hook prints `guard-and-gate.sh`**; scheduled.yml real run (Tue 03:17 UTC, or `gh workflow run scheduled.yml` once on main).
- **Delete after 10 Nov 01:30 UTC:** the `minimumReleaseAgeExclude` list in `pnpm-workspace.yaml` (then `pnpm install --frozen-lockfile` must still pass).
- **Known small issue:** pre-commit gitleaks Docker fallback fails inside a git worktree only.
- **Untracked from the human:** `moz-plan-v5-prompt.md`, `src/features/moz-plan-v5-prompt.md` (not committed).

## Status
- **Phase:** P0. Done: P0-01…07, P0-17. P0-A closed (post-push checks completed by P0-14/15). P0-B review fixes done; P0-B closes with P0-14 (CI green on main). **P0-14 squashed onto main; tick after main CI (image job) is green.**
- **Next sub-phase:** P0-E production foundation: P0-14 → P0-19 → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Projected end:** P0 Wed 18 Nov 2026 · P1 Mon 30 Nov · P2 Thu 10 Dec · P3 Sat 19 Dec · P4 Sat 2 Jan 2027 · P5 Tue 12 Jan · **launch Fri 22 Jan 2027** (assumptions in PHASES.md; slips if human tasks are late or the Play account needs a 14-day closed test).
- **Last updated:** 2026-11-10 01:00, talha.syed
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-14 on main; waiting for its first main CI run (image job + Trivy). See handoff note.

## Next (top 3)
1. **P0-14 close:** main CI green (incl. image + Trivy) → tick P0-14 + P0-B (docs-only push = AC5 on main) → delete `wip/P0-14`.
2. **P0-19**: auth hardening + Better Auth inventory + conformance test (closes the "before staging" CARRIED rows).
3. **P0-18**: outbox, Redis split, failure modes, safe migrations (+ C-18 concurrent-index rule).

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
| C-09 | A-SEC-M2, A-SEC-M3, A-SEC-L3, A-QA-6 | P0-19 | Boot refuses owner DB role / Redis without password / weak keys; invalid env exits | integration |
| C-11 | A-CR-M3, B-CR-9, A-CR-L2 | P0-18 | `enqueue` and after-commit timeouts; schedule pruning safe in rolling deploys | integration |
| C-12 | A-SEC-M4, A-CR-L4 | P0-20 | `systemScope` imports restricted; `dbFor().transaction` bypass closed; tenant repos take ShopScope/CustomerScope | lint + integration |
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-18 | A-CR-L6 (part) | P0-18 | Migration linter: CREATE INDEX on an existing table must be CONCURRENTLY (needs the non-transactional migration helper) | lint negative fixture |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-20 | P0-14 | P0-09 | Interactive UI primitives (Tabs, Chip, Switch, SegmentedControl, Toast, Table) never lose a press before hydration (disabled/inert until hydrated, like `useHydrated` in DeviceList/SignOutButton) | E2E with JS chunks held |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🟠: H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. Before P1 (Thu 19 Nov): H-22 loyalty defaults. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts`; `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`); `src/server/services/` (audit, flags, sessions)
- `src/server/security/` — `headers.ts`, `rate-limit.ts`, `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`; `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry, `enqueue`, DLQ, scheduler (Europe/London)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0006 (0005 lower-case email CHECK, 0006 session revocation trigger)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis 7, Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026, 01:00)
- CI green on `wip/P0-14` `19705be` (run 42677704427): check, integration+coverage, migration test, production build + bundle, E2E pixel7+desktop1440 68/0/0 flaky, OSV, audit, Semgrep, gitleaks. AC2 red runs 42678683969, 42678688078, 42678695896, 42678701681, 42678708263. Local: gate:task PASS (unit 374, int 269), Docker image builds without secrets.
- Earlier: mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Untracked files `moz-plan-v5-prompt.md` (repo root) and `src/features/moz-plan-v5-prompt.md` (a duplicate) are the human's prompt — not committed; delete or move them when no longer needed.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
