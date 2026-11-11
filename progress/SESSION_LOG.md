# SESSION LOG — append-only

One entry per session or checkpoint, newest at the bottom. Keep each entry to 5–8 lines.

```
## YYYY-MM-DD HH:MM — <phase> — <one-line summary>
Done: …
Commits: <short hashes>
Tests: <what ran, result>
Left off: <exact next step>
Notes: <anything a future session must know>
```

---

## 2026-11-08 15:30 — P0 — scaffold, local services, database layer
Done: installed local tools (pnpm, gh, Docker CLI link); P0 tasks 1–4 (skills check, Next 16 scaffold, Docker Compose + .env.example, Drizzle schema + migrations + test DB); HUMAN_TASKS steps for all tasks.
Commits: 6ea39b8 cf1b6f4 48372c7 fcc766f c356520
Tests: pnpm check ✅ (3 tests), pnpm build ✅, pnpm e2e smoke ✅ 4/4 projects, drizzle-kit check ✅
Left off: P0 task 5 (auth) — config skeleton in src/server/auth/auth.ts; next Argon2id hashing, mfaVerified session hook, authz policies, sign-in pages.
Notes: run `pnpm services:up` before `pnpm test`; local .env.local generated with random secrets (share via H-02).

## 2026-11-08 16:30 — P0 — checkpoint: auth + authz harness done (6/15)
Done: P0 task 5 (Better Auth server: Argon2id, mfaVerified session flag, authz policies, action template; sign-in UI for customers + staff TOTP enrolment; dev outbox) and task 6 (authz matrix harness, coverage guard, setFeatureFlag + audit/flags services).
Commits: 37e4068 9e7b01f 0593a34
Tests: pnpm check ✅ 136 tests; pnpm e2e ✅ 12/12 on 4 projects; pnpm build ✅; mutation check showed the matrix catches a removed MFA rule.
Left off: start P0 task 7 — design tokens (src/styles/tokens.css per DESIGN §3), Fraunces + Manrope via next/font, Tailwind theme, reduced-motion handling; then restyle auth pages with the primitives in task 8.
Notes: `pnpm services:up` before tests. Never pipe `pnpm check` into grep before `&&` commit (hides failures). Forms: uncontrolled + useHydrated (see DECISIONS).

## 2026-11-08 18:00 — P0 — checkpoint: tokens + UI primitives done (8/15)
Done: P0 task 7 (tokens, fonts, Tailwind theme, reduced motion, contrast test) and task 8 (UI primitives + /dev/ui gallery, component tests, axe + overflow E2E). New standing rule in CLAUDE.md §1: push after every task, soft `task` sound, stop for review every 3–5 tasks and at phase end with the `review` sound.
Commits: fbeace3 f92b32f
Tests: pnpm check ✅ 170 tests; gallery E2E ✅ 4/4 projects (axe clean, no overflow); pnpm build ✅
Left off: start P0 task 9 — motion primitives (View Transitions wrapper + fallback, press feedback, Sheet/Modal/SidePanel, skeletons) and `/dev/motion`. Load `emil-design-eng` + `mobile-native`; run `review-animations` on the diff.
Notes: Testing Library cleanup is explicit in tests/setup.ts (globals off). Grid items holding truncating text need `min-w-0`. ink-3 is never for readable text.

## 2026-11-08 — P0 — kit upgrade + audit
Done: kit upgraded (docs/phases briefs, ENGINEERING.md, code-reviewer); project-specific CLAUDE.md/README additions re-applied; full audit of prior work by code-reviewer ×2, security-reviewer, design-reviewer → progress/AUDIT.md.
Result: 0 tasks fully met; partial P0-01/02/03/06/07/08/09; missing P0-04/05/10–16. Nothing ticked. Critical: staff/admin MFA bypass via magic link/Google → passkey (PoC). High: fail-open APP_ENV default, no headers/CSP, /dev 200 in prod, no Redis rate limiting, no server-only boundary, incomplete action template.
Commits: 814f443 (kit), audit commit below
Left off: security hotfix (MFA bypass + env defaults), then P0-01 gaps in order.

## 2026-11-08 17:34 — P0 — kit v3 merge, P0-17 started (WIP branch), handoff
Done: kit v3 merged into CLAUDE/PHASES/ARCHITECTURE/settings/HUMAN_TASKS/DECISIONS/README (415686a). P0-17 partly built on `wip/p0-17-test-infra` (f5b6b3d): Mailpit+MinIO, fail-closed env + tests, SMTP/Resend/Brevo email, codes.ts (8 tests ✅), Vitest unit/integration projects with per-worker DBs, factories, /api/test/session, Mailpit/MinIO helpers, isolation pair, migrated auth/authz tests.
Tests: codes 8/8 ✅; integration project ❌ (authz world + test-api session failing, undiagnosed). main unchanged in code since last green (170 tests, e2e 12/12).
Left off: diagnose integration failures (start with leftover `.insert(shopStaff)` in tests/authz/harness.ts ~line 63), then Playwright fixtures + guard, fakes, scripts.
Notes: re-audit of ticked tasks against tightened ENGINEERING §1 = nothing to untick (no task was ticked). AUDIT.md still reflects kit v2 criteria; add v3 items (P0-02 MinIO, P0-14 additions, §1 items 6–8) when P0-17 lands.

## 2026-11-08 19:45 — P0 — P0-17 finished and merged (Syedbadeshah76, Windows laptop)
Done: integration suite fixed (harness leftover insert, Zod 4 superRefine TypeError, test-API MFA flag, Vitest groupOrder); fakes push/AI/postcodes/Places + S3 storage; Playwright E2E server :3100 + fixtures + console/network guard + self-tests; specs migrated (Mailpit, no sleeps, task-ID titles); test:regression/mutation/load:smoke/live/titles. Kit v2 audit and v3 merge were already applied by talha.syed (verified item by item, not redone).
Evidence (P0-17 ticked): isolation a/b on moz_test_w2/w1 in separate pids, same PK, both pass; guard.spec 17/17 incl. test.fail for every bad mode; test API 404 in staging/production; test:regression PASS unit 100 / integration 18 / authz 95 / e2e 37 (5 projects, 0 flaky); mutation 90.1%; build ✅.
Fixed on the way: db:migrate no-op on Windows; session cookie expiring in 1970; dev badge in screenshots; Chromium-only cold-compile timeouts (route warm-up, not longer timeouts).
Next: security hotfix (MFA bypass, safeReturnTo), then audit fix plan P0-01 → P0-09.

## 2026-11-08 — P0 — security hotfix (Syedbadeshah76)
Done: audit #1 critical staff/admin MFA bypass (email link/Google → passkey) closed in the session-create hook + no email links for privileged accounts + passkey registration needs MFA; #6 passkey user verification required; #3 safeReturnTo checks the normalised path. Commit dfcb50d.
Evidence: mfa-bypass.test.ts 5/5 and session-guard.test.ts 11/11 (all seen failing first, bypass reproduced); return-to 19/19 (+6 cases seen failing); pnpm check 235 ✅; regression unit 117 / integration 23 / authz 95.
Open: WebKit E2E intermittent under full load (3 in ~10 runs, not reproducible since; see PROGRESS Blockers). Security #5/#7/#8 with P0-06/03/07 rework.

## 2026-11-08 — P0 — P0-01 rework (Syedbadeshah76)
Done: exactOptionalPropertyTypes; Node 24.x pin; `pnpm check` = typecheck + lint + unit (`check:full` adds integration); typescript-eslint strictTypeChecked, import order, explicit boundary types, `moz/no-server-in-client`, `moz/require-server-only`, hex ban (TS + CSS); server-only in all server modules; lefthook pre-commit (prettier, eslint, gitleaks); versions in DECISIONS. Rule findings fixed at source (clipboard rejection unhandled, FormData File stringified, dead checks, `!` assertions, hex → tokens).
Evidence (P0-01 ticked): fresh clone → install → check ✅ (no .env.local; fixed tests that silently needed it); fresh clone dev serves / 200; lint probes (server import in client, hex in TSX/CSS, missing server-only) all fail; staged fake AWS key blocked; pre-commit ran on real commits; e2e 37/37, test:int 120.
Next: P0-02 rework.

## 2026-11-08 — P0 — P0-02 rework (Syedbadeshah76)
Done: compose → `infra/docker-compose.dev.yml` (MinIO healthcheck creates the bucket); `pnpm services:up/down` with Docker + port pre-flight; `src/lib/env.ts` clientEnv (NEXT_PUBLIC_* only) next to server-only `src/server/env.ts`; startup validation in `src/instrumentation.ts` + worker ("missing (required)" wording, names only); staging/prod require NODE_ENV=production; `pnpm setup:env`; `pnpm check:bundle`; README "Local setup"; NODE_ENV removed from `.env.example`; Turnstile/VAPID public keys renamed NEXT_PUBLIC_*.
Evidence (P0-02 ticked): fresh GitHub clone followed README literally → dev `/` 200, `/sign-in` 200, check 141 ✅, build ✅, check:bundle 0 hits; AUTH_SECRET removed → dev + worker exit 1 naming it; bad value → `next start` fails to prepare; bucket auto-created on empty volume; Docker-stopped / no-CLI / port-8025 conflict messages; test:int 120, e2e 37/37.
Next: P0-03 rework.

## 2026-11-08 — P0 — P0-03 rework (Syedbadeshah76)
Done: migrations 0002 (content_settings, FK indexes, NOT NULL flags, lower(email) unique, geography location) and 0003 (`reject_mutation()`, `set_updated_at()` on all updated_at tables, `moz_app` least-privilege role = security #7); branded scopes from `require*` + `src/server/repos` (`dbFor`/`transaction`/`inShop`/`ownedBy`) with ESLint guards; flags service on a repo; PostGIS pre-check; `scripts/check-migrations.ts` in lint; `db:seed` (idempotent baseline, refused in prod), `db:reset` (local only); codes format + length guard; `src/lib/geo.ts`.
Evidence (P0-03 ticked): `\d audit_logs` shows both reject_mutation triggers; db:reset twice on an empty throwaway DB → identical counts; re-run of migrations no-op; no-PostGIS Postgres → clear message exit 1; lint/type probes for unscoped access fail; db-foundation.test.ts (privilege matrix, 42501 for app role UPDATE, TRUNCATE 23001, constraints, geography distance, seed idempotency); unit 167, integration 137, e2e 37/37.
Next: P0-04 background jobs.

## 2026-11-08 — P0 — P0-04 background jobs (Syedbadeshah76)
Done: bullmq 6.4.2 + ioredis 6.0.0; queue registry; typed enqueue (after-commit guard); DLQ to failed_jobs (redacted); London schedules (upsert + prune); heartbeat; graceful worker; migration 0004.
Evidence (P0-04 ticked): jobs.test.ts 11 with real Redis (restart, in-flight close, crash recovery, backoff, DLQ after 3, scheduler idempotency); worker log + heartbeat row; unit 175, integration 148, e2e 37/37.
Next: /subphase-complete for P0-A (CI/staging parts blocked on P0-14/15 + H-05/06/07).

## 2026-11-08 22:38 — P0 — /subphase-complete P0-A started, handoff (Syedbadeshah76)
Done: resume (pull, install, services:up, db:migrate, check 175 ✅). Completeness: P0-01…04 ticked with evidence. code-reviewer: APPROVE WITH FIXES (1 HIGH: DLQ misses stalled-limit jobs and recordFailedJob errors; 4 MED; 8 LOW). security-reviewer: no BLOCK/HIGH (5 MED incl. redaction gaps and case-sensitive privileged-email check; 4 LOW). All findings are listed in PROGRESS "P0-A review findings".
Not done: fixes, full regression ×3 + exploratory QA (agent stopped part-way because the usage limit ran out; no failures reported before it stopped), push verification. No code changed. P0-A not ticked.

## 2026-11-09 — P0 — P0-A closed (Syedbadeshah76, Windows laptop)
Done: review fixes test-first: CR-H1 DLQ backstop (44cab95), SEC-M5 case-insensitive privileged email (4fd7c9f), SEC-M1 allowlist redaction + id-only registry test (fcc3395), CR-M1/M4 guard + London DST tests (e424519), CR-M2/L3/L8 worker shutdown order, signal handlers, no shared job id. QA findings: the gallery E2E flake was root-caused (one test over budget under load; when split, page.screenshot caret hiding caused a hydration mismatch) and fixed in b4e1b1c; DATABASE_URL/REDIS_URL protocol validation and lint ignore for .artifacts (e56b9d7).
Evidence: check 207 ✅; test:int 151 ✅ (authz 95); e2e 47/47 ×3 consecutive (5 projects); jobs.test 13/13, new DLQ tests 5/5 repeats; build ✅; check:bundle ✅; titles ✅; worker starts with the real env. Exploratory QA screenshots in .artifacts/qa/p0-a/ (320/390 Chromium+WebKit, 1440), inspected: ShopCard truncation at 320 logged for P0-09.
Reviews: code-reviewer APPROVE WITH FIXES (HIGH fixed); security-reviewer no BLOCK/HIGH (M1, M5 fixed). Remaining items in PROGRESS "P0-A follow-ups".
Post-push: CI / staging deploy / staging smoke / Sentry pending P0-14/15 (DECISIONS 2026-11-09), not verified.

## 2026-11-09 — P0 — P0-05 security baseline (Syedbadeshah76, Windows laptop)
Done: `src/proxy.ts` (per-request nonce CSP, SECURITY §5 headers, x-request-id, /dev 404 in production), `poweredByHeader:false`; Redis sliding-window limiter (`limiter` Redis role), `clientIp` via TRUSTED_PROXY, `assertSameOrigin`; pino logger with redaction; Turnstile widget + `verifyTurnstile`; `audit()` writer with meta scrubbing; worker logs via pino. PPR / Cache Components turned off (nonce needs per-request rendering; DECISIONS).
Evidence (P0-05 ticked): `curl -I /` on a production build shows every §5 header (CSP with nonce, HSTS preload, nosniff, Referrer-Policy, Permissions-Policy, COOP, x-request-id), no X-Powered-By. Nonce blocking checked by hand in a production build: with PPR on, Chromium and WebKit blocked Next's chunks and nothing hydrated (root cause of the config change); after the change, /, /sign-in, /staff/sign-in and /dev/ui hydrate with 0 console issues, and an injected nonce-less inline script did not run (CSP violation logged) in both browsers. Now an E2E: csp-injection.spec + security-headers.spec, 10/10 on 5 projects. Production-env server: /dev/ui and /dev/guard-check 404 with headers. Tests: rate-limit.test 10 (threshold, recovery, sliding, no lockout extension, 25-way atomicity, key isolation, TTL, 429/Retry-After, Redis down open/closed); request.test 8 (XFF spoofing per proxy mode, origin lookalikes/null/scheme/port; mutation-checked); headers inline snapshot 6; proxy 6; log redaction 4; turnstile 6 + widget 2; audit 2 integration; env TRUSTED_PROXY. check 240, test:int 163, e2e 57/57, build ✅, check:bundle ✅, titles ✅.
Left to P0-06/07 (see PROGRESS Now): wiring limits + Turnstile into sign-in, Better Auth limiter to Redis, defineAction logging/audit. New human task H-20 (Turnstile keys, 🟠 13 Nov).

## 2026-11-09 — P0 — P0-06 rework, piece A (Syedbadeshah76, Windows laptop) — checkpoint
Done: magic-link request checks (Turnstile + 5/h/email HMAC + 20/h/IP) in a Better Auth hook; hashed tokens; delivery after the response; React Email template; /sign-in/link-expired; Google error copy; QA-1…4 fixes for customer + staff + enrolment forms; sessions repo; test API `user` with `totp: true`; msgpackr-extract build declined (frozen install exited 1).
Evidence: magic-link.test 8/8 (captcha, per-email incl. casing, per-IP, no email in Redis keys, HTTP 400 without token, identical known/unknown/staff responses, HTML email + hashed storage, used/expired → friendly page); sign-in-edges E2E 25/25 (5 projects: reused link page, invalid email, 3 submits → 1 email, offline customer + staff); staff TOTP flake reproduced 3/4 in isolation, root cause = one ~20-step flow > 30 s under WebKit load; split → 24/24 under repeat. check 243, test:int 171, e2e 87/87.
Next: P0-06 piece C — security #5 (enrolment verify must not mint mfaVerified), staff login throttle + lockout email, HIBP timeout fail-open, TOTP ±1 / recovery reuse tests. Then B + D (see PROGRESS Next).

## 2026-11-09 — P0 — P0-06 rework, piece C (staff) (Syedbadeshah76, Windows laptop) — checkpoint
Done: security #5 (enrolment verify-totp no longer creates an mfaVerified session; test reproduced [true] first); staff login throttle (10/15 min/IP, per-account pause after 5 failures 1→15 min, cleared on a correct password, counted for unknown emails, one lockout email to real staff) + second-factor IP limit; own HIBP k-anonymity check (3 s timeout, fail-open + warning, test fake list) replacing the plugin that called the real API from tests; TOTP ±1/±2 and recovery-code single-use tests.
Evidence: mfa-bypass incl. #5 and breached-password over HTTP (mutation-checked); staff-login.test 6 (+ second run clean after switching tests to unique IPv6 addresses); breach unit 4; sign-in-edges E2E 75/75 (×3 repeat; offline tests now wait for fonts). check 247, test:int 181.
Next: P0-06 piece B (unverified Google, linking rule) then D (cookies, sessions, timeouts), screenshots, tick P0-06.

## 2026-11-09 (afternoon) — P0 — P0-06 piece D + shop context (Syedbadeshah76, Windows laptop)
Done: Google scope sent once (f1c70c3); `__Host-moz.*` cookies on https (1252b6a; verified live: `__Host-moz.state; Path=/; HttpOnly; Secure; SameSite=Lax`); DB trigger ends a user's sessions on any staff/admin privilege change + `users_email_lowercase` CHECK (6c1c0bf, migrations 0005/0006); customer 30-day idle timeout with injected clock + user deleted mid-session (b285bd5, mutation-checked); signed-in devices list, per-device sign-out, sign out everywhere (13f56e8); sign-in names the shop for returnTo=/s/<code> (4e2c887, verified on dev: "Sign in to collect gold at Brew & Bean."); 307 redirects on /me/security and /staff/security (0a8aba5; curl 200 → 307).
Evidence: check 271; test:int 225; session-rotation 6, session-lifetime 3, signed-in-devices 5, sessions authz matrix 26 + 2, shop context 2; devices E2E 15/15 on 5 projects; auth-related E2E 55/55; screenshots .artifacts/screens/P0-06/devices-list--*.png inspected (iphone14, pixel7, desktop1440).
Not done: P0-06 not ticked — H-03 step 5: Google still answers redirect_uri_mismatch after the human's change (client 404449…-1f0s…); waiting for propagation / re-check. Formatting drift (55 files) stashed twice, decision pending (PROGRESS Next 2).

## 2026-11-09 (late afternoon) — P0 — P0-06 ticked (Syedbadeshah76, Windows laptop)
Done: H-03 finished by the human (localhost redirect URI on client 404449…-1f0s…). Live check: Google now shows its sign-in page (no redirect_uri_mismatch), scope `email profile openid` once. Real Google sign-in by the human with a test user: DB shows the user email_verified=true, one `google` account, one live session, mfa_verified=false; no duplicate emails. Sign-in screens E2E (801451d): shop context asserted (known shop named, unknown code shows nothing), screenshots on 5 projects + 320 px, inspected (320 WebKit shop context, iPhone check-email, 1440 staff enrolment).
P0-06 acceptance: Google + magic link work, reused/expired → friendly page (auth.spec, sign-in-edges, magic-link.test); TOTP gate on actions (authz matrix no-MFA roles denied, mfa-bypass) — per-route-group checks belong to P0-12 (its brief lists them); return URL (return-to.test incl. dot-segment cases); known vs unknown email identical (magic-link.test); per-role timeouts with injected clock (policies tests staff/admin, session-lifetime customer). Edge cases: unverified Google (social.test + hook), casing (CHECK, mfa-bypass, magic-link), user deleted mid-session, TOTP ±1, recovery reuse — all tested. check 271, test:int 227.
Carried: role switcher + default portal per role → P0-12. Sign-in screen styling is still the temporary AuthCard (DESIGN screen 2 split layout comes with the design tasks).

## 2026-11-09 (evening) — P0 — P0-07 ticked (Syedbadeshah76, Windows laptop)
Done: 7a5a9c5 template rebuild: defineAction authenticate → validate → authorise → rate limit → handler in tx → audit in tx → after-commit → Result (order decision in DECISIONS); defineRoute (same steps + assertSameOrigin, GET from query); ERROR_MESSAGES/ERROR_STATUS in one place, LIMIT_REACHED + PLAN_RESTRICTED, Result<T, Code>; requireStaffAwardLimit (principal carries perAwardLimit); setFeatureFlag is the reference action using every step; scripts/check-authz-coverage.ts (TS AST, actions + route handlers, exemptions with reasons) in pnpm lint, old regex test removed; matrix verdict fails on INTERNAL + harness self-test; award probes. 07a4ea4 security #8: before-hook gate on Better Auth endpoints for staff/admin (stale > 12 h / 2 h → sign out only; password-only → enrol/change password only).
Evidence (P0-07 AC): sample action — actionTemplate.test 15 (step order, anonymous before validation, public, validation, denial, rate limit, INTERNAL logged with request id, after-commit failure, no-tx, null audit, custom key, defineRoute origin/status/GET; anonymous-check mutation → 2 fail) + action-template integration 3 (audit row with actor, 31st call RATE_LIMITED with Redis, failing handler rolls back write + audit). Matrix runner: tests/authz 154 (13 roles). Coverage fail → pass: temp action "demoUncovered" → exit 1, with authzMatrix entry → exit 0; temp route POST /api/zz-demo → exit 1. Policy unit tests 19 (award limit 5). privileged-endpoints integration 5 (gate-off mutation → 4 fail). check 295, test:int 260, auth E2E 70/70.
Carried: Sentry reporting of unexpected errors → P0-13 (logged with request id now).

## 2026-11-09 (night) — P0 — /subphase-complete P0-B, part 1 (Syedbadeshah76, Windows laptop)
Regression before fixes (qa-engineer): check 295, test:int 260 (authz 150), coverage script exit 0, titles strict 0, e2e dev 117/117 ×2 (68 intended skips), build + check:bundle ok; **e2e against a production build 95 passed / 22 failed** — all 429s from Better Auth's built-in limiter (on only with NODE_ENV=production; 5 links/min per IP). Method: e2eServerEnv() + NEXT_DIST_DIR=.next-e2e-prod, next build, next start --port 3100, pnpm e2e reusing the server (revert the tsconfig include Next adds, delete the folder).
Reviews: code-reviewer BLOCK (HIGH: Google ID-token sign-in bypassed the unverified-email rule; coverage script missed plain "use server" exports; 4 MEDIUM, 6 LOW). security-reviewer: same HIGH + 5 MEDIUM, 8 LOW; verified closed #1, #3, #6, #8, SEC-M5b. Exploratory QA: 9 issues (2 major).
Fixed: 5f1d334, 30cc9ac, bbc7752 (see PROGRESS Now). Evidence: check 304, test:int 263, devices E2E 25/25 (5 projects), mutation checks on the IP option (spoofed XFF stored without it) and the gate. Open items → PROGRESS "P0-B review follow-ups".
Not done: regression re-run after the fixes (stopped at the human's request: plan audit first). P0-B not ticked.

## 2026-11-09 (night) — Plan v4 applied after the plan audit (Syedbadeshah76, Windows laptop)
Audit: 5 read-only reviewers read 39 plan files end to end; report published as a shareable doc (claude.ai artifact "Moz Rewards — Plan and Architecture Audit"): 9 Critical, 14 High gaps; 22 contradictions.
Applied (docs only, no code): production parity (`pnpm e2e` on a production build), CI first (P0 order A→B→E→C→D), no pending gates, new P0-18/19/20/21, observability + SLOs + RUNBOOK in P0-13, production target topology + RPO/RTO + capacity model (H-21), mandatory RLS, library-defaults rule + conformance test, loyalty core rules (PRODUCT §4–6, §15), data-protection foundations (COMPLIANCE §2), right-sized testing (task fast / CI full / light sub-phase / one heavy phase gate), one commit per task, CARRIED table, AUDIT frozen.
Next: P0-14.

## 2026-11-09 (night) — Plan v5 applied: single VPS + free tiers, audit follow-ups (Syedbadeshah76, Windows laptop)
Verified provider/GitHub limits on official pages first (research agent): Sentry free = 1 user; GitHub Free private = no protection/rulesets/auto-merge/environments; GHCR currently free; Gemini: UK must use paid; OAuth sign-in-only exempt from Testing limits; wal-g has no age support (OpenPGP) and a known R2 CA-bundle issue; R2 free 10 GB shared. Human decisions: Sentry free + alert forwarding; deploy via docker save|ssh; one OpenPGP key for dumps + WAL.
Applied (docs/config only): topology, backups, free tiers, launch-tier capacity, GitHub modes + CI minutes budget, HTML never CDN-cached, FORCE RLS, secrets rule, @AGENTS.md, timeline re-baseline (launch Fri 22 Jan 2027), HUMAN_TASKS rewrite (H-25…H-28), infra/RESOURCES.md. Checks: lint ✅, test:titles ✅, prettier --check ✅ on all changed docs.

## 2026-11-09 (late night) — checkpoint before a new chat (Syedbadeshah76, Windows laptop)
Done: H-25 answered (GitHub Free, GITHUB_MODE=free); plan v5 follow-ups (deploy via SSH, one OpenPGP backup key, backup:verify + H-29). No code changed. Baton kept.
Next: P0-14 — start with Prettier pin + .gitattributes + format:check + one style: commit (see PROGRESS handoff note).

## 2026-11-09 (late night) — P0 — P0-14 started, handed over half-done (Syedbadeshah76, Windows laptop)
Done: main `20fcf24` style commit (Prettier pinned, .gitattributes eol=lf, format:check in check, 21 files token-equivalent); stashes dropped (human OK). `wip/P0-14` `fa8e676`: production-build `pnpm e2e` + `e2e:dev`, gate:task / gate:phase / ci:usage, pre-push guard, axe in guard + every-route spec, /api/test/runtime, C-10 items (404 every method, token, .gitleaksignore, gitleaks digest, migration lock rules, RuleTester), ci.yml, Dockerfile.
Evidence: gate:task P0-14 PASS via pre-push (unit 349, int 266, build, bundle, E2E 23/0); prod E2E chromium+webkit 63/0 earlier; mutations seen failing (OPTIONS, limiter on, token, axe, NOT VERIFIED summary); full-history gitleaks clean; root-caused gate failure: .env.local NODE_ENV leaked into Vitest (fixed + test).
Not done: CI result (run 42662735390 queued), Docker build (fails: tests/ excluded but type-checked), scheduled.yml, Renovate, minimumReleaseAge, AC2/5/6 demos. Two one-off 15 s integration timeouts (jobs close(), test-api session) — watch.

## 2026-11-10 (00:15) — P0 — P0-14 nearly done, checkpoint (talha.syed, Mac)
Done on `wip/P0-14` (`bab7c80`): CI fixes (Semgrep, OSV gate, audit, coverage), secret-free Docker build (lazy `getAuth()`, `tsconfig.build.json`) + image job with Trivy, scheduled.yml, Renovate, minimumReleaseAge, lefthook pre-push hole fixed (new branches / deleting main were skipped), Postgres TCP healthcheck, security-reviewer MEDIUM + 5 LOW fixed.
Evidence: gate:task PASS (unit 373, int 269, E2E P0-14 23/0); coverage 637 PASS; CI green on GitHub through OSV/Semgrep/check at `623e343`; AC6 real refusal of a failing gate + dry-run refusals; AC5 docs-only branch → no CI run.
Blocked: GitHub Actions major outage (9 Nov 18:30–18:43 UTC) — no CI evidence for the final head yet.
Next: rerun CI on `wip/P0-14` → push the 5 `ci-red/*` branches (AC2, hooks skipped with human approval) → squash to main → tick P0-14, close P0-B.

## 2026-11-10 (01:00) — P0 — P0-14 squashed onto main (talha.syed, Mac)
Done: CI flake root-caused (button pressed before hydration; reproduced by holding JS chunks) and fixed with `useHydrated`; CI green on `wip/P0-14` run 42677704427 (E2E 68/0/0 flaky); AC2 red runs each failing for their reason (42678683969 unit, 42678688078 console.error, 42678695896 axe, 42678701681 Prettier, 42678708263 lock_timeout); throwaway branches deleted; squashed to main.
Next: main CI (first image job + Trivy) green → tick P0-14 + P0-B (docs-only push = AC5 on main) → P0-19.

## 2026-11-10 (00:30 local) — P0 — P0-14 ticked, P0-B closed (talha.syed, Mac)
AC1: main CI green incl. image + Trivy (run 42682167002; first main run 42680350385 failed on Trivy → npm removed from runtime, esbuild/lefthook binaries skipped until P0-15 = C-21). AC2: 5 red runs, each for its reason (42678683969 unit, 42678688078 console.error, 42678695896 axe, 42678701681 Prettier, 42678708263 lock_timeout). AC3: `pnpm e2e` on a production build, E2E 68/0/0 flaky on CI projects; limiter-off runtime test. AC4: gate:task/gate:phase/ci:usage summaries, tree-clean step. AC5: docs-only pushes skip gate + CI (branch demo, and this push); ci:usage 89/2000 (4%), heavy day ×7 ≈ 31% < 75%. AC6 (free): pre-push refused a failing-gate push, force-push and deleting main.
Next: P0-19.

## 2026-11-10 (~01:45 local) — P0 — P0-19 half done, checkpoint (talha.syed, Mac)
Done on `wip/P0-19` (`46599fe`): A boot fails closed + key/Redis/DB-role rules + per-purpose keys (image exits 1 on bad env); B migration 0007 trigger search_path (exploit test first); C prefetch security headers (E2E Chromium+WebKit); D Better Auth route allowlist + /update-user validation (mounted-vs-reviewed test). Evidence: unit 380+, int 278, E2E Chromium+WebKit 92/0; gate PASS each push. Also: CLAUDE.md now says human rules are written to the repo (both laptops).
Next: P0-19 step E (blanket /api/auth/* limit + unknown-IP bucket), then F–J.

## 2026-11-10 (02:01 IST) — P0 — P0-19 steps E–F, handoff (talha.syed, Mac)
Done on `wip/P0-19`: E blanket `/api/auth/*` limit (100/min/IP, 503 fail-closed, sign-out exempt) + `ipLimit` (unknown IP = strict shared bucket, was a bypass); F email link → `/sign-in/confirm` page → POST-only token use (GET verify + `/error` now 404, OAuth errors → `/sign-in`).
Evidence: gate:task PASS (unit 394, int 296, E2E P0-19 10/0); new tests `auth-limit`, `link-confirm` (scanner GET consumes nothing, CSRF 403, open-redirect fallback, staff → FORBIDDEN, retry keeps token), E2E scanner + no-JS sign-in on Chromium+WebKit.
Fixed: axe-guard races (mid-fade contrast on WebKit 1/24 → 48/0; streamed `<title>` after client nav, CI run 42690679564). CI of `4b4f931` pending at handover.
Next: check CI, then P0-19 G (lockout redesign) → H → I → J → security-reviewer → squash.

## 2026-11-10 (08:08–10:00 IST) — P0 — P0-19 done (Syedbadeshah76, Windows)
Done: G atomic lockout guard (per-account Turnstile challenge, account+IP backoff, 2FA per user, alert/audit/owner mail) · H email failover · I conformance spec on the production build (E2E server as behind Caddy, per-test client IP; staff/admin cookie Max-Age per role; IPv6 limits per /64) · J SECURITY §7 secret inventory · security-reviewer (0 blockers, 5 should-fix + 12 nits) and design-reviewer (0 blockers, 6 should-fix) findings fixed or carried (C-24 → P0-12, C-25 → P2-04, C-26 → P0-13, C-23 → P0-15, C-22 widened). Also `chore(deps)` release-age list removed on main.
Evidence: gate:task PASS on every push (last: unit 419, int 322, E2E P0-19 30/0); full E2E Chromium+WebKit 116/0; CI green 42747422177 (G), 42748449980 (H), 42751913848 (I+J), 42755271081 (review fixes); AC4/AC5 over HTTP (15 parallel wrong passwords → exactly 5 × 401); AC1 conformance 14/14 on two browsers.
Decision (human): keep HKDF subkeys of BLIND_INDEX_KEY; SECURITY §7 reworded. Mistake fixed: human's `src/features/moz-plan-v5-prompt.md` was committed in 61c8376, removed in 52b734d (now in `.git/info/exclude` locally).
Next: P0-18 (outbox, Redis split, failure modes, safe migrations; C-11, C-18).

## 2026-11-10 (10:00–11:48 IST) — P0 — P0-18 steps A–B, handoff (Syedbadeshah76, Windows)
Done on `wip/P0-18` (`dd2314a`): A non-transactional `drizzle/concurrent/` index helper + linter (C-18), migration lock/statement timeouts, web 5 s / worker 60 s statement limits, connection budget at boot · B Redis split (queue instance noeviction + redis-cache allkeys-lru on :6380), `REDIS_CACHE_URL`, fail-open `cached()`, producer 2 s command timeout (CR-M3).
Evidence: gate:task PASS (unit 430, int 331); new integration tests concurrent-migrations 3/3, db-session 2/2, redis-split 4/4; CI step A 42765978050 green. A gate failure mid-session was a Windows clock step (same files green alone, re-run green).
Also: remote `wip/P0-14` and `wip/P0-19` deleted (human approved).
Next: P0-18 step C (outbox) → D (fail modes, timeouts) → reviewer → squash.

## 2026-11-10 — P0 — P0-18 steps C–D, security review, done (talha.syed, macOS)
Done: C outbox (0008) + relay + replay CLI + sweep + versioned payloads + lockout email via outbox · D required `failMode` (closed → 503), after-commit deadline, `RETIRED_SCHEDULES`, 60 s drain · security-reviewer (0 BLOCK/HIGH, 9 should-fix: 6 fixed, 3 carried C-29/C-30/C-12 → P0-20; nits → C-31 → P0-13) · worker runs via `server-only-hook.mjs` (react-server broke email rendering, found by a real-worker smoke) · `pnpm sast` local twin · axe guard waits for `<html data-hydrated>`.
Evidence: CI green 42775110214 (cffc65b); gate:task PASS (unit 448, int 357, sast); AC1/4/6/7 + edge cases in outbox.test 22/22, AC2 fail-modes 4/4, AC3/AC5/C-18 from A–B; worker-process test fails under the old flag, passes now; full E2E local 268/0.
Mistake: pushed 758acc2 before reading step D's red CI (axe flake); both reds fixed at root cause before the squash.
Rule (human): one target, everything by 10 Dec 2026; per-phase dates no longer tracked (CLAUDE.md "Pace", 9face36).

## 2026-11-10 — P0 — P0-20 RLS built (talha.syed, macOS)
Done: 0009 roles (moz_app/moz_auth/moz_worker) + ENABLE/FORCE/policies (DB re-checks shop/admin roles) · per-role pools, withScope/transaction SET LOCAL, dbFor removed (CR-L4) · Public/Auth scopes + ESLint allowlists (C-12) · outbox INSERT-only + scope columns + runAs tenant jobs (C-29, C-30) · checker RLS rule + negative fixtures · audited sweeps/replay, adminRead · boot role check every env.
Evidence: gate:task PASS (unit 462, int 396, sast, E2E P0-20 2/0); full E2E 272 + P0-20 5/5 after a UA fix; rls.test 21/21, jobs.authz 16/16; AC3 rls-bench: page +8–15% p95 (noise ±3%), lookup +0.03 ms fixed (DECISIONS).
Open: security-reviewer result pending (task not ticked). Found 2 orphaned test workers (tsx CLI grandchild) — test fixed; kill needs the human (H-32 step 5).
Review: 2 HIGH (system job from tenant row; 0009 definer ownership needs superuser) + 7 should-fix, listed in PROGRESS handoff; fix in 0010 before tick.
Review fixes: 0010 (moz_rls definer owner, worker refuses system job from tenant row, role-bound staff/admin/outbox writes, narrow identity grants, audit actor bound, flags admin-only); C-33 → P0-15, C-34 → P1-01. P0-20 ticked.
Handoff 14:15 IST by talha.syed: P0-20 ticked; CI on 9130581 running at handover (e0fc442 green); next P0-13; H-32 for both laptops.
Handoff 14:30 IST by talha.syed: CI green on 9130581; H-21/H-22/H-17 closed, H-32 Mac done (Windows pending); baton free.

## 2026-11-10 (16:20– IST) — P0 — P0-20 re-review fixed (talha.syed, macOS)
Done: full E2E after 0010 (Chromium 69 / WebKit 51 pass, 0 fail) · security-reviewer on 9130581: 1 HIGH (any admin role could write shop_staff/shops → owner of any shop) + 5 should-fix, fixed in 0011 (admin-role-bound writes, flags owner-only, content settings owner/moderator, helpers not PUBLIC, NULL-role outbox rows refused), worker refuses a system job whose outbox row is missing, stale `rls: global` markers removed, C-32 updated (moz_rls NOLOGIN WITH ADMIN to the migration owner).
Evidence: new tests seen failing first (5), then pass; gate:task PASS (unit 462, int 406, E2E P0-20 2/0).
Found: an outbox flake was two orphaned worker processes (3–4 h old) relaying `moz_test_w4`'s outbox; killed (human allowed); `tests/support/exit-with-parent.mjs` makes the spawned worker exit when Vitest dies (Node 26 caches `process.ppid`, so it probes with signal 0; verified).
Then: scheduled CI red (Linux WebKit refused a Chromium-only flag in csp-injection spec) fixed `dd05afe`, re-run green 42812524717. P0-13 started on `wip/P0-13`: A alerts (dedup, delivery, lockout cap) 8/8 tests, B health endpoints + monitor + ops_snapshot (0012) 18 tests; unit 474, int 422, gate:task PASS on push.
Blocked: `.env.example` edits (H-33 deny rule), closing issue #1 (human). Checkpoint 17:45 IST. Next: P0-13 step C (Sentry) on `wip/P0-13` after `git rebase main`.

## 2026-11-10 (17:50–18:45 IST) — P0 — P0-13 done (talha.syed, macOS)
Done: C Sentry web/worker/browser tunnel + scrubbing (C-03, C-26) · D `/admin/system` · E consent-gated Umami + cookie notice, C-06 hint · F RUNBOOK, log rotation, SLO measurement · security review (2 HIGH: tunnel budget, alert ceiling; 5 should-fix) + re-review (2 should-fix) all fixed · walk-through fixes: scheduler grace, worker.error throttle.
Evidence: gate:task PASS (unit 491, int 444, E2E 16/0); full 5-project E2E 313/0; AC2 by hand (ready 503, `health.redis` mail); worker-down 503 after 3 min; restore drill + replay dry run; screens system-page 320/390/1440, cookie-notice, preparing hint.
Carried: C-36 (Umami proxy scope), C-37 (VPS RUNBOOK walks) → P0-15. H-33 done; H-35 close issue #1. Next: P0-21.
Speed/token rules (human, 10 Nov): gate pass stamps + pre-push skip, quiet lefthook, `pnpm fix`, design-first security check, E2E/screenshot scope, QA agent Opus high (CLAUDE.md §4). Task splitting and a cheaper QA model rejected.
Handoff 2026-11-10 19:05 IST by talha.syed: P0-13 done + CI green; speed rules in place; next P0-21; human: H-34 (Sentry), H-35 (close issue #1), H-32 (Windows .env.local).

## 2026-11-10 (20:55– IST) — plan audit (read-only) + token rules, round 2 (Syedbadeshah76, Windows)
Done: read-only audit of the plan, progress logs, agents and gate scripts (no code reviewed, no tests run); four rules added to CLAUDE.md §4 (fresh context per task, named security-relevant list, no task-level full E2E + flake limit, findings policy); `/resume` light path; old "touches auth…" wording replaced in TESTING §4, ENGINEERING §1 and the P1–P5 headers.
Evidence: one local session record (10 Nov): 134 M tokens re-read vs 0.34 M written; 60 min model, 80 min tools in 3.8 h.
Open (audit findings not yet in the phase files; human to decide): push-endpoint allowlist (P3-07), private-file rule (P1-12/P2-09/P2-13), staff password reset (P2-04), device-signal capture, passkey task (C-16), age-restricted offers + birth year, leaderboard privacy (P4-07), customer Scan screen, reference-image names, stale lines in ENGINEERING §11/§13, DESIGN §12, README.
Left off: P0-21 not started. Next: `/clear`, `/resume`, then P0-21.

## 2026-11-10 (21:10–21:50 IST) — P0 — P0-21 done, handoff (Syedbadeshah76, Windows)
Done: `docs/compliance/` — README (10 questions for the solicitor), ROPA (41 activities, basis + controller + retention each), CONTROLLER_ROLES, PROCESSOR_REGISTER (every ARCHITECTURE §10 provider + push services, HIBP), DPIA (30 risks mapped to tasks, LIA, PECR, Children's code), RETENTION_SCHEDULE (11 proposed periods), DSAR_AND_ERASURE, COMPLAINTS_PROCESS. H-23 steps updated. P0-21 ticked.
Evidence: AC1 every ⚠ ROPA row maps to a proposed period G1–G11; AC2 register rows checked against ARCHITECTURE §1/§10; AC3 DPIA §5 "Built in" column; AC4 H-23 open. Documents only: no tests; docs-only push skips the gate and CI.
Not verified: nothing run on this laptop this session (no services:up, migrate or `pnpm check`); H-32 still open on Windows.
Left off: next P0-16 demo seeds (P0-15 waits on H-06/07/08/26/27).


## 2026-11-10 (21:20–21:50 IST) — P0 — P0-16 done (talha.syed, macOS)
Done: demo seed in `pnpm db:seed` (3 shops, 7 accounts, fixed ids, ON CONFLICT DO NOTHING), `--reset`, derived credentials (HKDF purpose `demo-seed`), `pnpm demo:credentials`, staff/admin pre-enrolled with TOTP, staging check for password-only staff; H-36, C-38 → P0-15, C-07 now P2-04 only.
Evidence: AC1 `pnpm db:reset && pnpm db:seed` twice on the local DB: identical counts (users 7, accounts 6, two_factors 6, shops 3, staff 2, admins 4, memberships 3) and identical id/code/email checksums; second seed inserts 0.
Evidence: AC2 integration `[P0-16]` 13/13 as moz_worker: for all 6 staff/admin accounts the password alone returns the two-step challenge, no session, `/two-factor/enable` 401; password + derived code → `mfaVerified` session. Seen failing (8 of 13) with TOTP pre-enrolment switched off.
Evidence: gate:task result in the commit's PROGRESS "Last verified".
Not verified: anything on staging (none yet) → C-38.
Left off: checkpoint 22:05 IST, baton kept. Next: P0-08 (P0-C) while P0-15 waits on H-06/07/08/26/27; check CI on `89a2a1e` first.

## 2026-11-10 (22:10–22:55 IST) — P0 — P0-08 step A (talha.syed, macOS)
Done: standing rule "every stop says whether to /clear" in CLAUDE.md §1 (`d86eb08`); P0-08 brief tightened (8 ACs, edge cases, tests); step A tokens + global styles on `wip/P0-08`.
Evidence: gate:task PASS (unit 562, int 457, build, bundle, sast); full 5-project E2E 313 passed / 0 failed; gallery screenshots (1440, iPhone 14) inspected.
Left off: checkpoint, baton kept. Next: step B on `wip/P0-08` (preference hooks, pre-paint script, profile sync, toggles), then step C (token page, contrast table, E2E, snapshots).

## 2026-11-10 (23:00–23:25 IST) — P0 — P0-08 step B (talha.syed, macOS)
Done: display preferences on `wip/P0-08` (`592d77c`): hooks, inline pre-paint script with the CSP nonce, profile sync (`savePreferences`, migration 0013), toggles on `/dev/ui`.
Evidence: gate:task PASS (unit 594, int 475, build, bundle, sast, E2E P0-08 6/0); full 5-project E2E 313 passed / 0 failed; `preferences.spec.ts` 15/0 across the five projects.
Left off: checkpoint, baton kept. Next: step C on `wip/P0-08` (token page, contrast table, remaining E2E, snapshots, screenshots), then squash to main and tick. Branch is merged with main: do not rebase.

## 2026-11-10 (to 22:28 IST) — P0 — P0-08 step C started, handoff (talha.syed, macOS)
Done: on `wip/P0-08` (`d722abe`): token page and contrast table on `/dev/ui` (`TokenPage.tsx`, values read with `getComputedStyle`), `Section.tsx`, thumb hooks for tests.
Evidence: gate:task PASS on the branch (unit 594, int 475, build, bundle, sast, E2E P0-08 6/0). The new page was NOT viewed in a browser and has no E2E yet.
Left off: handoff, baton free. Next: the step C list in the PROGRESS handoff note (tokens.spec.ts, screenshots, visual-snapshot decision, DECISIONS, full E2E, squash, tick).

## 2026-11-11 (08:24–11:25 IST) — P0 — P0-08 step C, P0-08 done (Syedbadeshah76, Windows)
Done: `tests/e2e/tokens.spec.ts`; `parseHex` reads 3-digit hex (the production minifier's `#fff` broke the contrast table); `@visual` snapshots (`pnpm e2e:visual`, `VISUAL=1` in gate:phase); `pnpm fix` on Windows; two integration tests robust on Windows; 3 DECISIONS entries. P0-08 squashed to main and ticked.
Evidence: AC1/AC2 E2E: 57 token rows with values equal to tokens.css by meaning, contrast "24 pairs checked, 0 failing."; unit: token list, pairs, hex (seen failing first). AC3 lint css-hex + unit (step A). AC4 two-ring box-shadow on gold button, ink button, input, chip (Chromium, WebKit, 1440), same box and radius, crops inspected; forced-colours outline 2px solid.
Evidence: AC5 computed styles of toast, switch thumb, segmented thumb: no transform transition, ≤ 150ms, system and toggle; "Full" keeps 120ms transform. AC6 CLS 0.000 at 320/390/1440 (also fonts blocked); fonts 1.5 s late 0.000/0.048/0.009 (DECISIONS). AC7/AC8 preferences.spec (step B) + signed-out choice → profile at sign-in → fresh browser.
Evidence: gate:task PASS (unit 595, int 475, build, bundle, sast, E2E P0-08 35/0); tokens spec 5 projects 55/0; screenshots 320, 390 (Chromium + iPhone WebKit), 1440 inspected; CI green on `wip/P0-08` `8f241c0` (run 42967476496; first run red on one race in the new spec, fixed).
Not verified: `e2e:visual` on macOS (no baseline yet). Left off: checkpoint, baton kept. Next: P0-09.

## 2026-11-11 (12:50–13:12 IST) — P0 — P0-09 brief review, step A started, handoff (Syedbadeshah76, Windows)
Done: P0-09 brief tightened and pushed (`0f73db7`: steps A–D, 13 numbered criteria incl. C-13 and C-20, edge cases, tests, verify). Step A: tests written first (toast queue and announcers, table loading/keyboard rows, field `aria-describedby` merge, Switch, Chip, ProgressBar), saved as `progress/wip/P0-09-step-a-tests.patch`.
Evidence: `git apply --check` of the patch on main passes; CI green on main `2eea12e` (run 42978402482), the last code commit. No gate run: main has docs/progress commits only since then.
Not verified: the new tests have never run (the components they describe are not built); no component changed.
Left off: handoff (human's usage limit), baton free. Next: `git checkout -b wip/P0-09`, `git apply progress/wip/P0-09-step-a-tests.patch`, `git rm` the patch, build step A per the PROGRESS handoff note.

## 2026-11-11 (13:21–13:35 IST) — P0 — P0-09 step A (talha.syed, macOS)
Done: resume (full path: pull brought P0-08 + brief); saved test patch applied on `wip/P0-09`; step A built (toast queue + announcers, Table loading/row button/density/scroll hint, field `aria-describedby` merge, ProgressBar, Chip, Switch row target, fine-pointer hover variant, `hit-44`, reduced-motion press/spinner/skeleton, `useHydrated` disabling, ShopCard/KpiCard). Pushed `a7b3193` to `wip/P0-09`.
Evidence: `pnpm check` exit 0 (unit 624); patch tests 17 red → green; E2E (prod build) ui-gallery/tokens/preferences chromium + iphone14, gallery webkit: pass; built CSS 8/8 `:hover` inside `(hover:hover) and (pointer:fine)`; 320px screenshots inspected (found + fixed mid-word table name wrap).
Not verified: CI 42984090179 (full 5-project E2E) still running at checkpoint; gate:task not run (at the tick).
Next: `git checkout wip/P0-09`, check CI 42984090179, then step B (tests first).

## 2026-11-11 (13:40–14:20 IST) — P0 — P0-09 step B + scrubber fix (talha.syed, macOS)
Done: H-32 moved to Done (human confirmed; verify on Windows). Step A CI red on an unrelated flake: Sentry scrubber redacted request ids with 10+ digits → `4627f41` (test first, UUIDs skipped by digit rules). Step B on `wip/P0-09` (`a3246f9`): Icon, IconButton, Select, Checkbox, RadioGroup, Avatar, MilestoneTrack, ErrorState, shared `field.tsx`, gallery sections.
Evidence: CI green 42987287808 (step A + main merge, full E2E); step B tests 26 new red → green; gate:task PASS (unit 653, int 475, E2E P0-09 6/0); gallery/tokens E2E 3 projects 46/0; screenshots 320 + 1440 inspected (unchecked outlines `line` 1.25:1 → `ink-3` 3.35:1).
Not verified: step B CI run (started at push); AC E2E for steps A–B (step D).
Next: `git checkout wip/P0-09`, check CI, then step C (overlays, tests first).

## 2026-11-11 (14:20–14:35 IST) — tooling — `pnpm clear:check` (talha.syed, macOS)
Done: human's standing rule: prove the session is saved before saying `/clear`. `scripts/check-clear.ts` (+ 10 unit tests), CLAUDE.md §1 rule, `/checkpoint` + `/handoff` final step.
Evidence: unit 10/0 (each failure case seen failing); first real run correctly FAILED on the then-uncommitted files.
Next: unchanged — `git checkout wip/P0-09`, check CI 42989846839, then P0-09 step C.

## 2026-11-11 (14:28–15:00 IST) — P0 — P0-09 step C overlays (talha.syed, macOS)
Done: resume (pull --rebase rewrote wip/P0-09; restored with `reset --keep` + merge, human approved). Step C on `wip/P0-09` (`0553311`): Overlay engine (native modal dialog, focus trap, Esc top-only, scroll-lock counter, Safari trigger memory), Modal/SidePanel/BottomSheet, sheet drag (pure close rule), tokens `--scrim`/`--motion-on`, gallery Overlays section, overlays.spec.ts; DECISIONS entry.
Evidence: unit tests first (close rule 14, scroll lock 5, overlays 31) red → green; first E2E run found 4 real issues (WebKit focus return, full-width panel had no backdrop on phones, scroll body not focusable for axe, test measured scroll before click scrolled) → fixed; overlays.spec 5 projects 55/0; screenshots inspected; gate:task PASS (unit 713, int 475, E2E P0-09 34/0) after root-causing a WebKit axe mid-fade (old spec 3/8 fail, new 16/16).
Not verified: step C CI (running); AC 11 touch paths, C-20 chunks held, other ACs' E2E (step D).
Next: `git checkout wip/P0-09 && git pull && git merge origin/main`, check CI on 0553311, then P0-09 step D (see PROGRESS handoff).

## 2026-11-11 (15:10–15:39 IST) — P0 — P0-09 step D part 1 (talha.syed, macOS)
Done: resume (light path); gallery rebuilt per primitive with state matrix + long-text fixtures; `gallery-list.ts` + unit test; `ui-states.spec.ts` (AC 1, 3–7, 9, 10, 12, 13) and AC 11 touch paths (CDP) in `overlays.spec.ts`.
Evidence: new tests found 5 real defects, each fixed at the root cause (Button long label, MilestoneTrack long word, Table row height 47 vs 45px, ErrorState pre-hydration retry, toast shared pause flag; the last two unit test first); AC4 check seen failing with `hit-44` removed (Sell 81×41).
Evidence: `pnpm check` PASS (unit 720); the three P0-09 specs green on all 5 projects after fixes.
Not verified: gate:task, screenshots inspection, e2e:visual (macOS), design-reviewer. Next: step D part 2 (PROGRESS handoff).
