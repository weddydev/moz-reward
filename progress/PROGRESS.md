# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-09 23:05

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed (Mac), 2026-11-10 00:15.** P0-14 is **nearly done on pushed branch `wip/P0-14`** (head `bab7c80`, `gate:task` PASS on every push). `main` has only progress commits since `20fcf24`. **Blocked by a GitHub Actions major outage** (githubstatus.com incident "Actions and Checks API", since 9 Nov 18:30 UTC): runs on `79c1279` created no `ci`/`scans` jobs, twice.
- **Done this session on `wip/P0-14`:**
  - First CI failures fixed: Semgrep (fixed in code, 3 justified `nosemgrep`), OSV → `pnpm osv:gate` (SECURITY §10: block high/critical with a fix), `pnpm audit --prod`, Semgrep + OWASP Top 10 + secrets packs, coverage (flags service tests).
  - Docker image builds without secrets: `tsconfig.build.json` + **lazy Better Auth (`getAuth()`)**. Image job on main: buildx (no push) + Trivy by checksum.
  - `scheduled.yml` (budget → pause job, E2E all 5 projects Tue/Fri, k6 + ZAP dormant until `vars.STAGING_URL`, issue on failure); `renovate.json` (7 days, no automerge); pnpm `minimumReleaseAge` 3 days + 15 exact excludes (**delete after 10 Nov 01:30 UTC**).
  - **Hook hole fixed:** lefthook skipped the pre-push command on new branches and `git push origin :main`; the guard is now a lefthook *script*. Dry runs: force-push refused, deleting main refused.
  - Postgres healthcheck over TCP (CI `ECONNRESET` in migrate; reproduced locally).
  - security-reviewer: no BLOCK/HIGH; MEDIUM + 5 LOW all fixed.
- **How to continue P0-14** (`git checkout wip/P0-14 && pnpm install`):
  1. Actions recovered 18:43 UTC. CI on `10d96b3` (run 42674763487) passed everything up to E2E, then **1 E2E failure: `tests/e2e/devices.spec.ts:87` [P0-06] keyboard confirm focus on desktop1440** (`toBeFocused`: element not found); 65 passed. Reproduce locally first: `pnpm e2e --project desktop1440 tests/e2e/devices.spec.ts` (root cause, TESTING §7). Run 42676480687 on `bab7c80` was in progress at checkpoint.
  2. AC2: push the 5 prepared red branches with hooks skipped (**human approved, `ci-red/*` only**): `LEFTHOOK=0 git push origin ci-red/unit-test ci-red/console-error ci-red/axe ci-red/unformatted ci-red/migration-lock` (local branches, rebased on `79c1279`; rebase onto `wip/P0-14` first). Check each fails for its reason, record run links, delete the branches (local + remote) and the worktree (`git worktree remove --force <scratchpad>/red`; on the other laptop just create the branches again).
  3. Squash onto main as one `feat(ci)` commit + the progress files: DECISIONS and H-31 are already on main (then delete the "on `wip/P0-14`" note line in DECISIONS). Push → image job + CI green on main = AC1 (closes P0-B); the progress-only push proves AC5 on main. Tick P0-14 and P0-B.
- **Evidence so far:** AC3 prod-build E2E P0-14 23/0 (Chromium+WebKit) each gate; AC4 gate:task/ci:usage summaries, tree clean; AC5 docs-only branch `ci-demo/docs-only` → no CI run; AC6 pre-push refused a push with a failing typecheck (real), dry-run force-push + delete-main refused. OSV/gate/flags/pre-push tests mutation-checked.
- **Not verified:** CI green end-to-end (outage), image job + Trivy on GitHub (Trivy was not run locally: the permission classifier blocked running the downloaded binary), `gate:phase` end to end, Windows behaviour of the shell/`.lefthook` script (other dev: run one push and confirm "guard-and-gate.sh" runs).
- **Known small issue:** the pre-commit gitleaks Docker fallback fails inside a git worktree (`.git` is a file) — worktrees only; normal checkouts fine.
- **Decisions recorded** (DECISIONS 9–10 Nov): lazy auth + build tsconfig; CI supply-chain gates; lefthook script + token least-privilege; Postgres TCP healthcheck.
- **Untracked from the human:** `moz-plan-v5-prompt.md`, `src/features/moz-plan-v5-prompt.md` (not committed).

## Status
- **Phase:** P0. Done: P0-01…07, P0-17. P0-A closed (post-push checks completed by P0-14/15). P0-B review fixes done; P0-B closes when P0-14's CI is green on its code. **P0-14 nearly done on `wip/P0-14` (blocked by a GitHub Actions outage).**
- **Next sub-phase:** P0-E production foundation: P0-14 → P0-19 → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Projected end:** P0 Wed 18 Nov 2026 · P1 Mon 30 Nov · P2 Thu 10 Dec · P3 Sat 19 Dec · P4 Sat 2 Jan 2027 · P5 Tue 12 Jan · **launch Fri 22 Jan 2027** (assumptions in PHASES.md; slips if human tasks are late or the Play account needs a 14-day closed test).
- **Last updated:** 2026-11-10 00:15, talha.syed
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- P0-14 nearly done on `wip/P0-14` (`bab7c80`, gate PASS); waiting for GitHub Actions to recover (major outage) for green CI + AC2 red runs. See handoff note.

## Next (top 3)
1. **P0-14** on `wip/P0-14`: rerun CI when Actions recovers → push the 5 `ci-red/*` branches (AC2) → squash to main (image job + AC5 on main) → tick P0-14, close P0-B.
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
| C-10 | A-SEC-L1, A-SEC-L2, A-CR-L6, A-CR-L7, A-SEC-L4, A-QA-9 | P0-14 | gitleaks ignore + pinned image; migration checker gaps; RuleTester; test API 404 for every method | CI |
| C-11 | A-CR-M3, B-CR-9, A-CR-L2 | P0-18 | `enqueue` and after-commit timeouts; schedule pruning safe in rolling deploys | integration |
| C-12 | A-SEC-M4, A-CR-L4 | P0-20 | `systemScope` imports restricted; `dbFor().transaction` bypass closed; tenant repos take ShopScope/CustomerScope | lint + integration |
| C-13 | A-QA-7, A-QA-8 | P0-09 | 320 px ShopCard titles and table scroll hint; Spinner under reduced motion | screenshots |
| C-14 | P0-B close | P0-14 | Regression incl. production-build E2E green (22 failures before the limiter fix) | CI run |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-18 | A-CR-L6 (part) | P0-18 | Migration linter: CREATE INDEX on an existing table must be CONCURRENTLY (needs the non-transactional migration helper) | lint negative fixture |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- External: **GitHub Actions major outage** (since 9 Nov 18:30 UTC) blocks P0-14's CI evidence.
- Human 🟠: H-31 Renovate app; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. Before P1 (Thu 19 Nov): H-22 loyalty defaults. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use — on `wip/P0-14`; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts`; `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`); `src/server/services/` (audit, flags, sessions)
- `src/server/security/` — `headers.ts`, `rate-limit.ts`, `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`; `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry, `enqueue`, DLQ, scheduler (Europe/London)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0006 (0005 lower-case email CHECK, 0006 session revocation trigger)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis 7, Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- CI/tooling (on `wip/P0-14` until squash): `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (10 Nov 2026, 00:15)
- `wip/P0-14` `bab7c80`: `gate:task` PASS (unit 373, int 269, production build, check:bundle, E2E P0-14 23/0 Chromium+WebKit). Coverage thresholds PASS locally (637 tests). Docker image builds without secrets (all routes dynamic). Semgrep (default+OWASP+secrets) and `pnpm audit --prod` clean locally. CI: OSV/Semgrep/check green on GitHub at `623e343`; later runs hit the Actions outage.
- `wip/P0-14` `fa8e676`: `pnpm gate:task P0-14` PASS (unit 349, int 266, production build, check:bundle, E2E P0-14 23/0 on Chromium+WebKit). Production-build E2E Chromium+WebKit 63/0 earlier. main `20fcf24`: `pnpm check` ✅ 304 unit.
- `pnpm check` ✅ 304 unit · `pnpm test:int` ✅ 263 · devices E2E 25/25 (5 projects, dev server) — after the P0-B fixes.
- **E2E on a production build: 95 passed / 22 failed before the limiter fix; NOT re-run since** (→ C-14, P0-14).
- `pnpm build` ✅ and `check:bundle` ✅ (P0-B QA run) · `test:titles --strict` ✅ · mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Untracked files `moz-plan-v5-prompt.md` (repo root) and `src/features/moz-plan-v5-prompt.md` (a duplicate) are the human's prompt — not committed; delete or move them when no longer needed.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
