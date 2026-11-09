# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-09 10:12

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint 9 Nov 2026 (late night), Syedbadeshah76 (Windows laptop) — baton kept; continuing in a new chat.**
- **State:** plan v4 (audit) + plan v5 (single VPS, free tiers) are committed and pushed. GitHub plan = **Free** (`GITHUB_MODE=free`). No code changed since the P0-B review fixes (`bbc7752`). Nothing half-done.
- **Next task: P0-14** (docs/phases/P0.md). Start with repo hygiene: pin Prettier to an exact version (package.json has `^3.9.10`), add `.gitattributes` (`* text=auto eol=lf`), add `format:check` to `pnpm check`, run `pnpm format`, check the diff is formatting-only, commit as one `style:` commit. Two old git stashes (`stash@{0}`, `stash@{1}`) hold the same reformat — not needed after that commit; ask the human before dropping them. Then the production-build `pnpm e2e`, `gate:task` / `gate:phase` / `ci:usage`, a lefthook `pre-push` hook (lefthook.yml has only pre-commit today), GitHub Actions within the free budget, scheduled workflows, Renovate.
- **Human tasks:** the human said "everything set up" — at the start of the next session, confirm which of H-06, H-07, H-08, H-26, H-27, H-04, H-20, H-28, H-21, H-17, H-12, H-22 are actually done before marking them.
- **Untracked files from the human:** `moz-plan-v5-prompt.md` and `src/features/moz-plan-v5-prompt.md` — not committed; the human may delete them.
- **Before your next session:** `git pull`; read CLAUDE.md (now imports AGENTS.md), TESTING §4, DECISIONS "Plan v5" and "Plan v4", P0.md header + P0-14.

## Status
- **Phase:** P0. Done: P0-01…07, P0-17. P0-A closed (post-push checks completed by P0-14/15). P0-B review fixes done; P0-B closes when P0-14's CI is green on its code.
- **Next sub-phase:** P0-E production foundation: P0-14 → P0-19 → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Projected end:** P0 Wed 18 Nov 2026 · P1 Mon 30 Nov · P2 Thu 10 Dec · P3 Sat 19 Dec · P4 Sat 2 Jan 2027 · P5 Tue 12 Jan · **launch Fri 22 Jan 2027** (assumptions in PHASES.md; slips if human tasks are late or the Play account needs a 14-day closed test).
- **Last updated:** 2026-11-09 (night), Syedbadeshah76
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- Plan v4 and plan v5 committed (docs, phase files, `.claude` commands/agents, progress, `infra/RESOURCES.md`); GitHub Free chosen (H-25). No code changed. Next: P0-14.

## Next (top 3)
1. **P0-14**: pin Prettier + `.gitattributes` + commit the repo reformat; `pnpm e2e` on a production build, `e2e:dev`; `gate:task` / `gate:phase`; GitHub Actions + nightly; branch protection; then switch to `t/<task-id>` PRs.
2. **P0-19**: auth hardening + Better Auth inventory + conformance test (closes the "before staging" CARRIED rows).
3. **P0-18**: outbox, Redis split, failure modes, safe migrations.

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
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🟠: **H-25 GitHub plan (Tue 10 Nov, P0-14)**; by Sun 15 Nov for P0-15: H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth client, H-21 client's written risk acceptance, H-17 permissions. Before P1 (Thu 19 Nov): H-22 loyalty defaults. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550) — fix planned; fallback documented.

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (+ hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts`; `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `dbFor`, `transaction`, `inShop`, `ownedBy`); `src/server/services/` (audit, flags, sessions)
- `src/server/security/` — `headers.ts`, `rate-limit.ts`, `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`; `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry, `enqueue`, DLQ, scheduler (Europe/London)
- `src/server/db/` — Drizzle client, schema, `migrate.ts`, `seed.ts`, `reset.ts`; `drizzle/` migrations 0000–0006 (0005 lower-case email CHECK, 0006 session revocation trigger)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis 7, Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- UI: `src/styles/tokens.css`, `src/app/globals.css`, `src/components/ui/`, `src/features/auth/`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (9 Nov 2026)
- `pnpm check` ✅ 304 unit · `pnpm test:int` ✅ 263 · devices E2E 25/25 (5 projects, dev server) — after the P0-B fixes.
- **E2E on a production build: 95 passed / 22 failed before the limiter fix; NOT re-run since** (→ C-14, P0-14).
- `pnpm build` ✅ and `check:bundle` ✅ (P0-B QA run) · `test:titles --strict` ✅ · mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04).
- CI: none yet · Staging: none yet.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Untracked files `moz-plan-v5-prompt.md` (repo root) and `src/features/moz-plan-v5-prompt.md` (a duplicate) are the human's prompt — not committed; delete or move them when no longer needed.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
