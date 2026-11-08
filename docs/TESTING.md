# Testing — Moz Rewards

Goal: nothing reaches production that hasn't been proven on staging. Tests are written with the feature, not after.

## 1. Layers and tools

| Layer | Tool | What |
|---|---|---|
| Unit | Vitest | Services: points calculation, happy hour, streaks, milestones, ingot overflow, plan state machine, Daily Drop limits, announcement caps, fraud rules, code generators, time zone logic |
| Integration | Vitest + real Postgres + Redis (Docker / Testcontainers) | Server actions end to end with DB: request → approve → ledger → rewards; idempotency; transactions; jobs |
| Authorisation | Vitest (`tests/authz/`) | Matrix: every action × every role → allow/deny (SECURITY.md §3) |
| Component | Testing Library | Forms, critical UI states, a11y attributes |
| End-to-end | Playwright | Chromium, **WebKit** (iOS Safari proxy), Pixel 7 and iPhone 14 emulation, desktop 1440 |
| Accessibility | axe-core in Playwright | Every key screen, zero serious/critical violations |
| Visual | Playwright screenshots | 20 key screens (DESIGN.md §15), mobile + desktop, diff threshold 0.2% |
| Performance | Lighthouse CI | Customer routes vs DESIGN.md §12 budgets (judgment rule applies) |
| Load | k6 | Scenario mix (below) against staging |
| Security | Semgrep, CodeQL, OSV, gitleaks, OWASP ZAP baseline | CI + phase gates |

## 2. Coverage targets

- `server/services` (domain logic): ≥ 90% lines/branches.
- Overall: ≥ 70%.
- Coverage is a signal, not a goal: don't write empty tests to hit numbers.

## 3. Critical E2E journeys (must always pass)

1. Scan landing (`src=qr`) → Gilded Gate → Collect points → Google/magic-link sign-in (test provider) → profile → joined shop.
2. Request points → staff approves on dashboard (second browser context) → customer sees Points credited → ledger + receipt correct.
3. Ingot fills → Reward unlocked → Redeem code → staff confirms.
4. Member QR scan award at counter (mocked camera input).
5. Rate visit (1 star and 5 stars) → both show identical Google and private buttons → private feedback reaches shop.
6. Create Daily Drop → second Daily Drop same day blocked → appears in Offers → claim → staff confirms.
7. Happy hour active → award uses multiplier by `requested_at`.
8. Birthday and win-back suggestions appear → owner sends one, skips one → only sent one reaches customer.
9. Marketplace: create listing (pre-moderation) → admin approves → buyer reveals number (rate limit) → report → admin removes.
10. Shop registration → admin records payment → activate → owner invite → owner signs in with 2FA.
11. Plan expiry → grace → restricted behaviour.
12. Customer data export and account deletion.
13. PWA install prompt (Chromium) and iOS guide sheet (WebKit).
14. Reduced motion: signature moments render end state.

## 4. Gates

**Every commit (local, `pnpm check`)**: typecheck, lint, unit + affected integration tests.

**Every push to `main` (CI)**: install (frozen), typecheck, lint, unit, integration, authz matrix, build, Semgrep, gitleaks, OSV → deploy staging → E2E smoke (journeys 1, 2, 5) on staging.

**Phase complete (`/phase-complete`)**: full E2E on staging (all browsers), axe, visual snapshots, Lighthouse CI, ZAP baseline, review of PROGRESS blockers. Failures must be fixed or explicitly deferred with a DECISIONS.md entry (never silently skipped).

**Pre-production release**: everything above + k6 load test + backup restore drill + manual run-through on a real Android phone and a real iPhone (human) using `progress/DEMO_NOTES.md` checklist.

## 5. Load test (k6) scenario

- 70% browse: shop landing, offers feed, wallet.
- 20% customer actions: request points, claim offer, rate visit.
- 10% staff actions: approve, list requests (with SSE connections open).
- Ramp to 2,000 virtual users over 10 min, hold 15 min.
- Pass: p95 < 300ms for actions, < 800ms for pages (server time), error rate < 0.5%, no queue backlog > 60s.

## 6. Test data

- Factories in `tests/fixtures/` (shops, members, programmes, offers, listings).
- Seed script for staging demo: 3 shops (Brew & Bloom Café — Camden, Patel's Corner Store — Leicester, Glow Studio — Manchester), 40 customers, realistic history over 90 days, offers, listings, feedback, one pending application.
- Never use real personal data in tests or seeds.

## 7. Rules

- A bug fix starts with a failing test.
- Flaky tests are fixed or quarantined within the same day with an issue noted in PROGRESS.md.
- Time-dependent logic uses an injectable clock; tests cover Europe/London DST changes (last Sunday of March and October).
