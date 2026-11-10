# Testing and self-verification — Moz Rewards

Goal: nothing is called done, and nothing reaches production, without proof — and no heavy suite runs twice for the same code. Claude verifies its own work continuously: tests first for logic, the task's own E2E against a **production build**, screenshots it actually inspects, and CI on every push. Heavy suites run once per level (§4). "It compiles" or "the tests I just wrote pass" is never enough on its own.

Sections: [1 Layers and tools](#1-layers-and-tools) · [2 Coverage and test strength](#2-coverage-and-test-strength) · [3 Critical journeys](#3-critical-e2e-journeys) · [4 Gates](#4-gates) · [5 Load](#5-load-tests) · [6 Test data and isolation](#6-test-data-and-isolation) · [7 Rules](#7-rules) · [8 Self-verification loop](#8-self-verification-loop) · [9 External services in tests](#9-external-services-in-tests) · [10 Production verification](#10-production-verification)

---

## 1. Layers and tools

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Pure services: points calculation, multipliers, streaks, milestones, ingot overflow, tiers, expiry, plan state machine, Daily Drop limits, caps, fraud rules, code generators, time logic, open status, output filters |
| Integration | Vitest + real Postgres/PostGIS + Redis (Docker) | Actions and jobs end to end with the DB: constraints, transactions, locking, idempotency, concurrency, scoping, outbox delivery |
| Authorisation | Vitest (`tests/authz/`) | Matrix: every action and route × every role → allow/deny. Coverage script (in `pnpm lint`) fails on any action, route handler or `"use server"` export missing from the matrix. **Library-mounted routes count too:** a route-allowlist test fails when Better Auth (or any library) serves an unreviewed route. An RLS test proves cross-shop reads fail even with the app filter bypassed. |
| Security conformance | Vitest + Playwright against the production build | Every value SECURITY.md specifies, checked at runtime: cookie names/flags/Max-Age per role, session limits per role, client IP under spoofed headers, security headers, rate limits. Catches library defaults (ENGINEERING §14). |
| Component | Testing Library | Forms, overlays, critical UI states, accessibility wiring |
| End-to-end | Playwright, **against a production build** (`next build` + `next start`, NODE_ENV=production, APP_ENV=test) | Projects: `chromium`, `webkit` (iOS Safari proxy), `pixel7`, `iphone14`, `desktop1440`; happy and unhappy paths. `pnpm e2e:dev` (on `next dev`) is the fast inner loop only and never counts as evidence. |
| Accessibility | axe-core inside the shared E2E guard | Every page any E2E visits; zero serious/critical violations (WCAG 2.2 AA) |
| Visual | Playwright screenshots | 20 key screens × mobile WebKit, mobile Chromium, desktop; threshold 0.2%; deterministic data, animations disabled (phase gate) |
| Performance | Lighthouse CI + bundle size check | Customer routes vs DESIGN §12; bundle check fails at > 15% over budget (CLAUDE.md §3); Lighthouse at phase gate |
| Test strength | Stryker (mutation testing) | Money/rules modules (see §2) |
| Load | k6 | Smoke against staging at every phase end and twice weekly (scheduled CI); launch-tier load at P2-16 and P5-11 (§5) |
| Security scanning | Semgrep (SAST), OSV, gitleaks (CI); CodeQL only if available for the repo (private repos need GitHub Code Security — not assumed); OWASP ZAP baseline (weekly scheduled run against staging, and at every phase gate); authenticated ZAP once (P5-07) | No manual ZAP runs per phase |
| Data integrity | Reconciliation job + test | Ledger sums vs cached balances, receipt numbering, reward states, outbox rows older than 2 min |

## 2. Coverage and test strength

- `server/services/**`: ≥ 90% lines and branches; loyalty engine ≥ 95%. Overall ≥ 70%. Enforced by CI.
- **Mutation testing** (Stryker) on: loyalty engine, plan state machine, offers/Daily Drop limits, announcement caps, referral rules, fraud rules, game score validation. Target ≥ 80%. Runs at the phase gate **only for rules modules changed in that phase**; surviving mutants get a test or a written reason.
- Coverage and mutation scores are signals; a test that cannot fail is worse than no test.

## 3. Critical E2E journeys

Must always pass. Unhappy paths in brackets are part of the journey.

1. Scan landing (`src=qr`) → Gilded Gate → Collect points → magic-link sign-in (Mailpit; confirm page, token consumed on POST) → profile → joined. [Expired link; invalid shop code; suspended shop.]
2. Request points → staff approves in a second browser context → customer sees points credited live → ledger + receipt correct. [Double tap; approval while customer offline → celebration on next open; server error on approve shows retry and no double award; self-award refused.]
3. Ingot fills → reward unlocked → redeem code → staff confirms. [Expired code; code from another shop; second code voids the first.]
4. Member QR scan award at the counter (mocked camera stream). [Forged token; expired token; camera denied → manual entry.]
5. Rate visit with 1 star and 5 stars → identical actions → private feedback reaches shop. [Clipboard denied; AI provider down.]
6. Create Daily Drop → second the same UK day blocked → appears in Offers near me → claim → staff confirms. [Expired offer hidden; second claim by the same customer refused.]
7. Happy hour active → award uses multiplier by server `requested_at` (request before end, approve after).
8. Birthday and win-back suggestions → owner sends one, skips one → only the sent one reaches the customer. [Muted shop or no marketing opt-in receives nothing.]
9. Marketplace: create listing (pre-moderation) → moderator approves → buyer (18+) reveals number → report → moderator removes → seller sees appeal. [21st reveal blocked; prohibited keyword held; under-18 cannot reveal.]
10. Shop registration → admin records payment → activate → owner invite → owner signs in with TOTP. [Duplicate application; activation failure leaves nothing partial.]
11. Plan expiry → grace → restricted: matches the PRODUCT §15 state matrix.
12. Customer data export and account deletion (DSAR scope; ledger kept pseudonymous).
13. PWA install (Chromium prompt), iOS guide sheet (WebKit), standalone hides install chip.
14. Reduced motion: every signature moment renders its end state.
15. Session expiry mid-action → friendly re-auth → action completes once.
16. Offline at the counter: member card renders offline; queued request sends once when back online.

E2E test titles start with the journey number and task IDs: `[J2][P1-12] approves request and credits gold once`.

## 4. Gates

This section is the **single source** for gates. CLAUDE.md, commands and agents link here and never restate the list. Heavy suites run **once per level**; nothing is re-run "to be sure".

**While working (inner loop):** typecheck, lint, the unit/integration tests for the area, `pnpm e2e:dev` for the spec you are editing.

**Task done — `pnpm gate:task` (fast):**
1. `pnpm check` (typecheck + lint incl. coverage/migration/css checks + `format:check` + unit).
2. `pnpm test:int`.
3. `pnpm build` (+ `check:bundle`) and `pnpm sast` (Semgrep, the same command CI runs; Docker).
4. E2E for specs tagged with the task ID, against the production build, on Chromium + WebKit.
5. Every acceptance criterion has evidence; tests named with the task ID exist and pass; new/changed UI screenshotted **and inspected** (§8).
6. `security-reviewer` on the task diff when the task is on the security-relevant list in CLAUDE.md §4 (background; no BLOCK/HIGH open). Other tasks are reviewed at the sub-phase close.
No full regression, no exploratory QA agent, no all-project runs at task level.

**Every push (CI, from P0-14):** frozen install, `pnpm check`, integration + authz matrix, migration test + migration linter (§6), build, `check:bundle`, coverage thresholds, `test:titles --strict`, full E2E on the production build on **Chromium mobile (pixel7) and Chromium desktop (desktop1440)**, gitleaks, OSV, Semgrep (CodeQL only where available) → deploy staging → staging smoke (journeys 1, 2, 5 + the area changed). Budget (GitHub Free Actions credit, ARCHITECTURE §10): `concurrency` with cancel-in-progress; path filters (docs/progress-only changes skip build and E2E); pnpm and Playwright browser caches; 1-core runners for light jobs; sharding only if it saves wall time; target ≤ 75% of the monthly credit. In `pro` mode `main` merges only on green; in `free` mode the pre-push hook runs `gate:task` and production deploys refuse a commit without a green run. The developer does not wait: they start the next task and check the result before their next push; a red CI is fixed before anything else.

**Twice weekly (scheduled CI):** E2E on all 5 projects (adds WebKit/iPhone coverage the push CI skips) + k6 smoke against staging. **Weekly:** ZAP baseline against staging. The staging reconciliation job runs on the VPS (no Actions minutes). Failures open an issue and are fixed the next working session.

**Sub-phase done (`/subphase-complete`) — light:**
1. CI green on the last commit (CI already ran the full suite — do **not** re-run it locally). Print the Actions credit used this month (`gh api` billing usage, or the repository's Actions usage page); at ≥ 80% stop scheduled runs and tell the human.
2. Staging deploy succeeded, staging smoke passed, no new Sentry errors in the release.
3. `code-reviewer` (+ `security-reviewer` if server code) on commits not already reviewed at task level; no BLOCK/HIGH open.
4. Exploratory QA **only if the sub-phase added or changed screens**, scoped to those screens (320/390/1440, Chromium + WebKit).
5. Progress files updated in the same commit.
No gate may be "pending": if CI or staging does not exist yet, the infrastructure task moves earlier (P0 order A → B → E → C → D).

**Phase done (`/phase-complete`) — the one heavy gate; the phase's hardening task is this run:** `pnpm gate:phase` (runs **locally**, so it costs no Actions minutes) = sub-phase checks + E2E on all 5 projects + ZAP baseline + axe on all routes + visual snapshots + Lighthouse CI + mutation (changed rules modules) + k6 smoke on staging + `test:live --require-all` + reconciliation clean + rollback rehearsal (deploy N, roll back to N-1, smoke passes) + **demo** (§8.7). Failures are fixed, or explicitly deferred with a DECISIONS entry, a CARRIED row and a HUMAN_TASKS item if the client must know — never silently skipped.

**Pre-production release (P5):** phase gate + launch-tier load test (§5) against production behind the maintenance page + authenticated ZAP + the SECURITY checklist and reviewers (an independent penetration test only if the client funds one — never promised) + the full rebuild-and-restore rehearsal meeting RPO ≤ 5 min / RTO ≤ 2 h (ARCHITECTURE §9) + human real-device run-through (Android, iPhone Safari, iPhone installed PWA, desktop browsers, VoiceOver and TalkBack passes).

Repeated runs (`--repeat-each`, ×3) are a **diagnostic for a suspected flake**, never a routine gate.

## 5. Load tests

Targets come from the **launch tier** in ARCHITECTURE §12.1 (200 shops, 50,000 members, 30 req/s peak, 1,000 concurrent SSE, a 10,000-member announcement fan-out in < 10 min, 10 scans/s on one shop). The scale tier (2,000 shops / 500,000 members) is documented with its upgrade path but **not tested before launch**.

- **Smoke (every phase end + twice weekly):** 200 virtual users for 5 minutes against staging on the busiest endpoints built so far. Pass: actions p95 < 300 ms, p99 < 800 ms, errors < 0.5%, queue lag < 60 s. Staging has CPU/memory limits; the smoke never runs while production serves real users.
- **First launch-tier load (P2-16):** the P5 scenario at launch-tier numbers against staging, to find limits while there is time to fix them.
- **Release load (P5-11):** from a developer machine or a GitHub runner against production behind the maintenance page, before go-live. Mix 70% browse (landing, offers feed, wallet), 20% customer actions (request, claim, rate), 10% staff actions (approve, requests list with SSE open). Runs: 2× launch peak for 30 min; 1 h soak; a short 5× spike; 1,000 concurrent SSE; the 10,000-member fan-out; a **restart test** — restart one web replica, the worker, redis-queue and Postgres in turn during load. Dataset at launch-tier volume. Pass: actions p95 < 300 ms, p99 < 800 ms; page server time p95 < 800 ms; errors < 0.5% outside restarts; no lost jobs or outbox rows; recovery within target after each restart; SSE clients reconnect; queue lag < 60 s; no DB connection exhaustion.

## 6. Test data and isolation

- **Factories** in `tests/fixtures/` (owned by P0-17) for every entity; tests build exactly the data they need.
- **Integration isolation:** each Vitest worker gets its own database (template DB cloned per worker) and is truncated between test files; Redis keys prefixed per worker. Tests never depend on order.
- **E2E isolation:** each spec creates its own shop/users via a test-only seeding API (enabled only when `APP_ENV=test`, 404 for every method otherwise, verified by a test) — never relies on demo seed data. Rate limiters stay **on** in E2E; the seeding API partitions or resets limiter keys per spec.
- **Determinism:** injectable clock everywhere; fixed random seeds; Playwright `clock` API for time-dependent UI; no `sleep`.
- **Demo seed** (staging): 3 shops (Brew & Bloom Café — Camden, Patel's Corner Store — Leicester, Glow Studio — Manchester), 40 customers, 90 days of history, offers, listings, feedback, one pending application, fraud examples; idempotent; reset weekly and before each demo.
- **Migration test (CI):** apply all migrations to an empty DB and to a DB restored from the previous release's schema with seed data; app boots and smoke tests pass. A **migration linter** fails on locking operations without `lock_timeout`, non-concurrent indexes on existing tables, and destructive steps without a `-- contract:` line.
- Never use real personal data.

## 7. Rules

- **Test first for logic.** For services, rules and bug fixes: write the failing test(s) from the acceptance criteria, run them and see them fail, then implement until they pass without editing the tests' intent.
- A bug fix always starts with a failing regression test.
- **Gates we build** (coverage scripts, guards, linters, conformance tests) ship negative fixtures — one per form they must catch — and are shown failing once.
- Test titles include task IDs (`[P1-11]`) or journey IDs (`[J2]`) for traceability.
- Flaky tests are root-caused or quarantined the same day with a PROGRESS note; a quarantined test blocks the phase gate until fixed. Long flows are split rather than given longer timeouts unless they cannot be split (then the reason is written beside the timeout).
- Time logic tests include Europe/London DST transitions (last Sunday of March and October) and month/year boundaries.
- Never weaken an assertion, skip a test, or widen a timeout to get green without the root cause (CLAUDE.md debugging rule).
- A provider skipped for missing keys is reported as **NOT VERIFIED**, never as a pass.

## 8. Self-verification loop

For every UI or flow task (scaled to the task — no exploratory agent at task level):

1. **Run it** against the production build through Playwright, not just unit tests.
2. **Console, network and accessibility guard.** A shared Playwright fixture fails any test on: uncaught exceptions, `console.error`, unhandled rejections, failed requests (≥ 500 or network errors) unless expected, hydration warnings, and axe serious/critical violations.
3. **Look at it.** For new or changed screens: screenshots at 320, 390 (Chromium + WebKit) and 1440; **open and inspect them** (alignment, truncation, fixed bars and safe areas, contrast, empty/loading/error states, DESIGN.md match). Fix and re-capture until right.
4. **Unhappy-path kit.** Every form or flow spec calls the shared kit: offline submit, double submit, 320 px, reduced motion, keyboard-only. (Slow 3G, back/refresh mid-flow and two tabs belong to the sub-phase exploratory pass.)
5. **Check side effects.** DB rows (ledger, audit log, outbox), queued jobs, emails in Mailpit, push payloads in the fake sink.
6. **After push:** CI runs everything else. Check its result before the next push; fix red first.
7. **Demo (phase end):** record the existing journey specs for the phase's demo on staging with video (mobile and desktop) into `.artifacts/demo/`, review key frames, then write DEMO_NOTES.md. A full scripted rehearsal only for P2, P3 and P5.

## 9. External services in tests

Every integration sits behind an interface with a fake used in local and test environments:

| Service | Local / test |
|---|---|
| Email | Mailpit (assert via its API); secondary provider exercised through the same interface |
| Object storage | MinIO (S3-compatible) in Docker |
| Web Push | Fake push sink recording payloads |
| AI review help | Fake provider with scripted responses + failure modes |
| Postcodes | Fixture-backed fake |
| Google OAuth | Stubbed token and JWKS endpoints so the full callback runs in CI (incl. an unverified-email case); ID-token sign-in stays disabled and is asserted refused |
| Turnstile | Official test keys locally/test only; staging and production fail closed without a real secret |
| Google Places (optional) | Fixture fake |

A small **live smoke suite** (`pnpm test:live --require-all` at the phase gate, on staging) calls the real providers in scope once each with test data. A provider without keys fails the gate as NOT VERIFIED.

## 10. Production verification

- Post-release smoke on production (read-only checks + a dedicated test shop) after every deploy; automatic rollback trigger on failure (S-03 thresholds).
- **Uptime and synthetic checks (free tiers):** UptimeRobot keyword monitors every 5 minutes on the landing page, sign-in page, offers feed, dashboard login and `/api/health/live`, alerting both developers (email + mobile app); a scheduled Playwright check of the sign-in → wallet flow (test account) runs on the VPS every 30 minutes and mails both developers on failure (no Actions minutes).
- Nightly **data-integrity reconciliation** job on the VPS (ledger sums = cached balances; receipt numbers gapless per shop; no reward redeemed twice; no outbox row older than 2 min); any mismatch emails both developers and shows on the admin System page.
- **Monthly restore drill** (automated): latest dump restored into a scratch database, integrity + reconciliation checks run, result on the admin System page and in SESSION_LOG (ARCHITECTURE §9).
- SLOs are internal targets measured from logs and synthetic checks (ARCHITECTURE §11).
