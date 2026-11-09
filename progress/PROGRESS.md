# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-09 10:12

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- **9 Nov (night), Syedbadeshah76:** plan v4 applied after the plan audit (DECISIONS "Plan v4"). P0 order is now **A → B → E → C → D**. Next task: **P0-14** (CI, gate scripts, production-build E2E, formatting fix). Nothing half-done in code.
- **Before your next session:** `git pull`, read CLAUDE.md (rewritten), TESTING §4 (single source for gates), docs/phases/P0.md "How to work this phase" and P0-14. `pnpm install --frozen-lockfile`, `pnpm services:up`, `pnpm db:migrate` (migrations 0005–0006 since 8 Nov). Two git stashes on the Windows laptop hold the 55-file Prettier reformat; P0-14 commits it (or regenerate it with `pnpm format` after pinning Prettier).
- **Mac:** add `SENTRY_DSN` and the Google keys to `.env.local` from the shared note.

## Status
- **Phase:** P0. Done: P0-01…07, P0-17. P0-A closed (post-push checks completed by P0-14/15). P0-B review fixes done; P0-B closes when P0-14's CI is green on its code.
- **Next sub-phase:** P0-E production foundation: P0-14 → P0-19 → P0-18 → P0-20 → P0-13 → P0-21 → P0-15 → P0-16; then P0-C (P0-08…11), then P0-D (P0-12).
- **Last updated:** 2026-11-09 (night), Syedbadeshah76
- **Staging:** not deployed (P0-15; needs H-05/06/07/21) · **Production:** not deployed

## Now
- Plan v4 committed: CLAUDE.md, ENGINEERING, TESTING, ARCHITECTURE, SECURITY, PRODUCT, COMPLIANCE, PHASES, P0–P5/S phase files, `.claude` commands and agents. No code changed.

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
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code behind a CDN/WAF rule | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🟠 by 13 Nov: H-07 domain (+ staging Google URI), H-06 VPS, H-05 Neon, H-04 Resend, H-20 Turnstile, **H-21 capacity + hosting budget**, H-17 permissions. Before P1: H-22 loyalty defaults, H-23 solicitor review. **Start now:** H-12 Play organisation account.
- Technical: none blocking P0-14/18/19/20/13/21.

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
- Hosting budget and capacity numbers are planning assumptions until H-21. Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
