# Testing and self-verification — Moz Rewards

Goal: nothing is called done, and nothing reaches production, without proof. Claude verifies its own work continuously: it writes tests first for logic, runs them, drives the app in real browsers, looks at the screenshots, checks CI and staging after every push, and rehearses every client demo. "It compiles" or "the tests I just wrote pass" is never enough on its own.

Sections: [1 Layers and tools](#1-layers-and-tools) · [2 Coverage and test strength](#2-coverage-and-test-strength) · [3 Critical journeys](#3-critical-e2e-journeys) · [4 Gates](#4-gates) · [5 Load](#5-load-tests) · [6 Test data and isolation](#6-test-data-and-isolation) · [7 Rules](#7-rules) · [8 Self-verification loop](#8-self-verification-loop) · [9 External services in tests](#9-external-services-in-tests) · [10 Production verification](#10-production-verification)

---

## 1. Layers and tools

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Pure services: points calculation, multipliers, streaks, milestones, ingot overflow, tiers, expiry, plan state machine, Daily Drop limits, caps, fraud rules, code generators, time logic, open status, output filters |
| Integration | Vitest + real Postgres/PostGIS + Redis (Docker) | Actions and jobs end to end with the DB: constraints, transactions, locking, idempotency, concurrency, scoping |
| Authorisation | Vitest (`tests/authz/`) | Matrix: every action and route × every role → allow/deny; coverage script fails CI on any missing action |
| Component | Testing Library | Forms, overlays, critical UI states, accessibility wiring |
| End-to-end | Playwright | Projects: `chromium`, `webkit` (iOS Safari proxy), `pixel7`, `iphone14`, `desktop1440`; happy and unhappy paths |
| Accessibility | axe-core in Playwright | Every route; zero serious/critical violations |
| Visual | Playwright screenshots | 20 key screens × mobile WebKit, mobile Chromium, desktop; threshold 0.2%; deterministic data, animations disabled |
| Performance | Lighthouse CI + bundle size check | Customer routes vs DESIGN §12 (judgment rule); per-route JS size reported on every push |
| Test strength | Stryker (mutation testing) | Money/rules modules (see §2) |
| Load | k6 | Smoke at P1 and P3 phase ends; full scenario in P5 |
| Security | Semgrep, CodeQL, OSV, gitleaks, OWASP ZAP baseline + authenticated scan | CI + phase gates |
| Data integrity | Reconciliation job + test | Ledger sums vs cached balances, receipt numbering, reward states |

## 2. Coverage and test strength

- `server/services/**`: ≥ 90% lines and branches; loyalty engine ≥ 95%.
- Overall: ≥ 70%.
- **Mutation testing** (Stryker) on: loyalty engine, plan state machine, offers/Daily Drop limits, announcement caps, referral rules, fraud rules, game score validation. Target mutation score ≥ 80%. Run at each phase end for modules touched in that phase. Surviving mutants are reviewed; each either gets a test or a written reason.
- Coverage and mutation scores are signals; a test that cannot fail is worse than no test.

## 3. Critical E2E journeys

Must always pass on every project. Unhappy paths in brackets are part of the journey.

1. Scan landing (`src=qr`) → Gilded Gate → Collect points → magic-link sign-in (Mailpit) → profile → joined. [Expired link; invalid shop code; suspended shop.]
2. Request points → staff approves in a second browser context → customer sees points credited live → ledger + receipt correct. [Double tap; approval while customer offline → celebration on next open; server error on approve shows retry and no double award.]
3. Ingot fills → reward unlocked → redeem code → staff confirms. [Expired code; code from another shop.]
4. Member QR scan award at the counter (mocked camera stream). [Forged token; expired token; camera denied → manual entry.]
5. Rate visit with 1 star and 5 stars → identical actions → private feedback reaches shop. [Clipboard denied; AI provider down.]
6. Create Daily Drop → second the same UK day blocked → appears in Offers near me → claim → staff confirms. [Expired offer hidden.]
7. Happy hour active → award uses multiplier by `requested_at` (request before end, approve after).
8. Birthday and win-back suggestions → owner sends one, skips one → only the sent one reaches the customer. [Muted shop receives nothing.]
9. Marketplace: create listing (pre-moderation) → moderator approves → buyer reveals number → report → moderator removes → seller sees appeal. [21st reveal blocked; prohibited keyword held.]
10. Shop registration → admin records payment → activate → owner invite → owner signs in with TOTP. [Duplicate application; activation failure leaves nothing partial.]
11. Plan expiry → grace → restricted: offers blocked, approvals allowed.
12. Customer data export and account deletion.
13. PWA install (Chromium prompt), iOS guide sheet (WebKit), standalone hides install chip.
14. Reduced motion: every signature moment renders its end state.
15. Session expiry mid-action → friendly re-auth → action completes once.
16. Offline at the counter: member card renders offline; queued request sends once when back online.

E2E test titles start with the journey number and task IDs: `[J2][P1-12] approves request and credits gold once`.

## 4. Gates

**While working (per change):** typecheck, lint, the unit/integration tests for the area, the affected E2E spec.

**Task done (ENGINEERING §1):** every acceptance criterion has evidence; tests named with the task ID exist and pass; UI screenshots captured **and inspected** (§8).

**Sub-phase done (`/subphase-complete`):**
1. Full regression: all unit + integration + authz + every E2E journey built so far on all Playwright projects.
2. Console and network guard clean (§8).
3. Exploratory QA pass by the `qa-engineer` subagent on the sub-phase's screens/flows.
4. `code-reviewer` (+ `security-reviewer` / `design-reviewer` as the phase file says) with no BLOCK or high findings.
5. Commit, push, then **post-push verification**: CI green, staging deploy succeeded, staging smoke passed, no new Sentry errors (§8).

**Every push to `main` (CI):** frozen install, typecheck, lint, unit, integration, authz matrix + coverage script, migration test (§6), build, bundle size report, Semgrep, gitleaks, OSV → deploy staging → E2E smoke on staging (journeys 1, 2, 5 + any journey for the area changed).

**Phase done (`/phase-complete`):** everything in the sub-phase gate, plus full E2E on staging, axe on all routes, visual snapshots, Lighthouse CI, mutation testing (§2), k6 smoke (P1, P3), ZAP baseline (from P3), data-integrity reconciliation clean, **demo dry run** with video (§8). Failures are fixed, or explicitly deferred with a DECISIONS.md entry and a HUMAN_TASKS item if the client must know — never silently skipped.

**Pre-production release:** everything above + full k6 load test + authenticated ZAP + backup restore drill + human real-device run-through (Android, iPhone Safari, iPhone installed PWA, desktop browsers).

## 5. Load tests

- **Smoke (P1 and P3 phase ends):** 200 virtual users for 5 minutes against staging on the busiest endpoints built so far; p95 actions < 300ms, errors < 0.5%. Catches N+1 queries and missing indexes early.
- **Full (P5):** 70% browse (landing, offers feed, wallet), 20% customer actions (request points, claim, rate), 10% staff actions (approve, requests list with SSE open); ramp to 2,000 VUs over 10 min, hold 15 min. Pass: p95 < 300ms actions, < 800ms page server time, errors < 0.5%, queue backlog < 60s, no DB connection exhaustion.

## 6. Test data and isolation

- **Factories** in `tests/fixtures/` for every entity; tests build exactly the data they need.
- **Integration isolation:** each Vitest worker gets its own database (template DB cloned per worker) and is truncated between test files; Redis keys prefixed per worker. Tests never depend on order.
- **E2E isolation:** each spec creates its own shop/users via a test-only seeding API (enabled only when `APP_ENV=test` and never routed in production, verified by a test) — never relies on demo seed data.
- **Determinism:** injectable clock everywhere; fixed random seeds; Playwright `clock` API for time-dependent UI; no `sleep`.
- **Demo seed** (staging): 3 shops (Brew & Bloom Café — Camden, Patel's Corner Store — Leicester, Glow Studio — Manchester), 40 customers, 90 days of history, offers, listings, feedback, one pending application, fraud examples; idempotent; reset weekly and before each demo.
- **Migration test (CI):** apply all migrations to an empty DB and to a DB restored from the previous release's schema with seed data; app boots and smoke tests pass.
- Never use real personal data.

## 7. Rules

- **Test first for logic.** For services, rules and bug fixes: write the failing test(s) from the acceptance criteria, run them and see them fail, then implement until they pass without editing the tests' intent. For larger services, have a subagent read the tests and implementation to check the code isn't overfitted to the tests.
- A bug fix always starts with a failing regression test.
- Test titles include task IDs (`[P1-11]`) or journey IDs (`[J2]`) for traceability.
- Flaky tests are fixed or quarantined the same day with a PROGRESS.md note; a quarantined test blocks the phase gate until fixed.
- Time logic tests include Europe/London DST transitions (last Sunday of March and October) and month/year boundaries.
- Never weaken an assertion, skip a test, or widen a timeout to get green; find the root cause (CLAUDE.md debugging rule).

## 8. Self-verification loop

Claude runs this loop for every UI or flow task, not just at gates:

1. **Run it.** Start the app (and worker) and exercise the feature through Playwright, not just unit tests.
2. **Console and network guard.** A shared Playwright fixture fails any test on: uncaught exceptions, `console.error`, unhandled promise rejections, failed requests (status ≥ 500 or network errors) except those the test expects. Hydration warnings count as errors.
3. **Look at it.** Capture screenshots at 320, 390 (Chromium + WebKit) and 1440, and **open the images and inspect them**: alignment, spacing, truncation, overlap with fixed bars and safe areas, contrast, empty/loading/error states, and match to DESIGN.md and the reference image. Fix and re-capture until right (expect 2–3 iterations for important screens).
4. **Try to break it.** Exploratory checks: double taps, back button mid-flow, refresh mid-flow, slow 3G throttling, offline toggle, very long text, empty data, keyboard only, reduced motion, sound off, two tabs open.
5. **Check side effects.** DB rows (ledger, audit log), queued jobs, emails in Mailpit, push payloads in the fake push sink.
6. **After push:** `gh run watch` the CI run → confirm staging deploy → run the staging smoke for the area → check Sentry for new errors in the release. If anything fails, fix before starting the next task.
7. **Demo dry run (phase end):** run the phase's demo script as a scripted Playwright walkthrough on staging with video recording (mobile and desktop), save to `.artifacts/demo/`, review key frames, fix issues, and only then write DEMO_NOTES.md.

## 9. External services in tests

Every integration sits behind an interface with a fake used in local and test environments:

| Service | Local / test |
|---|---|
| Email | Mailpit (assert via its API) |
| Object storage | MinIO (S3-compatible) in Docker |
| Web Push | Fake push sink recording payloads |
| AI review help | Fake provider with scripted responses + failure modes |
| Postcodes | Fixture-backed fake |
| Google OAuth | Test provider / mocked callback in E2E |
| Turnstile | Official test keys |
| Google Places (optional) | Fixture fake |

A small **live smoke suite** (`pnpm test:live`, run on staging at phase end, not in normal CI) calls the real providers once each with test data, so integration drift is caught before production.

## 10. Production verification

- Post-release smoke on production (read-only checks + a dedicated test shop) after every deploy.
- **Synthetic monitoring:** scheduled Playwright checks every 10 minutes against production for: landing page, sign-in page, wallet (test account), offers feed, dashboard login page; alert on failure.
- Nightly **data-integrity reconciliation** job (ledger sums = cached balances; receipt numbers gapless per shop; no reward redeemed twice); any mismatch alerts the admin System page and Sentry.
