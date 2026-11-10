# Engineering standards — Moz Rewards

The bar: code a senior reviewer at a top product agency would approve without comments. This is a SaaS product expected to run at scale for years; write it for the engineer who maintains it in two years. The `code-reviewer` subagent checks every task group against this file.

Sections: [1 Definition of done](#1-definition-of-done) · [2 TypeScript](#2-typescript) · [3 Structure and boundaries](#3-structure-and-boundaries) · [4 Server actions and APIs](#4-server-actions-and-route-handlers) · [5 Errors](#5-errors-and-failure-handling) · [6 Database](#6-database-and-migrations) · [7 Concurrency and money](#7-concurrency-idempotency-and-money) · [8 Time](#8-time-and-dates) · [9 React and UI](#9-react-and-ui-code) · [10 Forms](#10-forms) · [11 Performance](#11-performance-practices) · [12 Accessibility](#12-accessibility-in-code) · [13 Logging](#13-logging-and-observability) · [14 Dependencies](#14-dependencies) · [15 Tests](#15-test-quality) · [16 Git](#16-git-and-commits) · [17 Anti-patterns](#17-forbidden-shortcuts)

---

## 1. Definition of done

A task is done only when **all** of these are true, with evidence in the session:
1. Every acceptance criterion in the task's phase file is met, including any incoming CARRIED criteria (PROGRESS.md). A criterion moved elsewhere goes into the CARRIED table and the target task's acceptance list — never only into prose.
2. Every listed edge case is handled and covered by a test or a documented manual check.
3. Required tests exist, are meaningful (they would fail if the behaviour broke) and pass. For services, rules and bug fixes they were written **first** and seen failing (TESTING §7). Test titles carry the task ID (`[P1-11] …`).
4. Authorisation matrix entries exist for every new action/route.
5. `pnpm gate:task` passes (TESTING §4): check incl. `format:check`, integration, **production build**, and the task's E2E specs against the production build. No new lint suppressions without a justification comment.
6. UI tasks: the self-verification loop in TESTING §8 was run — console/network/axe guard clean; new or changed screens screenshotted at 320, 390 (Chromium + WebKit) and 1440 **and inspected by you**; keyboard-navigable; reduced motion verified; loading, empty and error states present.
7. Unhappy paths for the task work, via the shared unhappy-path kit: server error, offline, double submit, expired session or token where relevant. Security-relevant tasks (the list in CLAUDE.md §4): `security-reviewer` ran on the task diff with no BLOCK/HIGH open, and any library involved has its configuration inventoried (§14).
8. Side effects verified: DB rows, audit log, queued jobs, emails (Mailpit), push payloads (fake sink).
9. No TODO/FIXME left in the task's code unless it references an item in PROGRESS.md.
10. Docs updated where behaviour or structure changed (PROGRESS map, DECISIONS, `.env.example`).

A **sub-phase** is done only after `/subphase-complete` (TESTING §4, light): CI green on the last commit, staging deployed and smoke-tested, no new Sentry errors, reviews of not-yet-reviewed commits with no BLOCK/HIGH, scoped exploratory QA if screens changed. No gate may be "pending". A **phase** closes with the one heavy gate (`pnpm gate:phase`).

"It works on the happy path" is never done. "The tests I just wrote pass" is never enough on its own.

## 2. TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- No `any`. Use `unknown` + narrowing. No non-null assertions (`!`) except in tests.
- Types derive from a single source: Drizzle schema → inferred row types; Zod schemas → inferred input types. Never duplicate a shape by hand.
- Domain values use branded types where mixing would be a bug: `MemberId`, `ShopId`, `Pence`, `Points`.
- Exhaustive `switch` on unions with a `never` check.
- Public functions have explicit return types.

## 3. Structure and boundaries

- `app/` routes are thin: fetch via services/repos, render components. No business logic in pages or components.
- `server/services/*` hold business rules, are framework-free, take explicit inputs (including `now` and IDs) and are unit-tested.
- `server/repos/*` are the only place that talks to the DB; every function requires a branded scope (`CustomerScope`, `ShopScope`, `AdminScope` for audited cross-shop admin reads, `SystemScope` for jobs). Row-Level Security is the second wall (SECURITY §3): the scoped-transaction helper sets `SET LOCAL app.shop_id / app.user_id / app.scope`.
- **Data ownership:** every table belongs to exactly one domain module (map in ARCHITECTURE §4). Other modules call that module's service, never its repository. The service that owns a change opens the transaction and passes `tx` to its repositories.
- `features/<domain>/` groups UI + actions per domain. Cross-domain calls go through services, not UI imports.
- `server-only` imported in every server module; secrets never reachable from client bundles (ESLint rule + `server-only`).
- One responsibility per file; files > ~300 lines are split.
- Naming: domain language from PRODUCT.md (ingot, membership, Daily Drop, suggestion) used consistently in code, DB and UI.

## 4. Server actions and route handlers

Every mutation follows the template in `src/server/actionTemplate.ts` (`defineAction`; `defineRoute` for route handlers). This is the only definition of the steps; other docs link here.
1. Authenticate (session). Anonymous callers are refused here unless the action is explicitly `public`, before the input is read.
2. Validate with a strict Zod schema (lengths, ranges, enums). Validation precedes authorisation because policies need validated ids (e.g. `shopId`).
3. Authorise (`server/authz` policy) → branded scope.
4. Rate-limit if abuse-prone (SECURITY.md §6): per user, or per IP for public actions.
5. Call one service inside a transaction where more than one write happens.
6. Write an audit log entry for sensitive actions, in the same transaction.
7. Side effects (emails, push, PDFs, SSE publish, fraud checks) are written to the **outbox** in the same transaction; a relay delivers them after commit (ARCHITECTURE §6). Nothing is sent from inside a transaction, and nothing is lost if the process dies after commit.
8. Return a typed `Result<T, AppErrorCode>`; never throw raw errors to the client.

Route handlers (SSE, uploads) follow the same steps plus `Origin` checks for mutations. Health endpoints are the exception: `/api/health/live` is public with no detail; `/api/health/ready` is internal only.

## 5. Errors and failure handling

- `AppError` with stable codes (`NOT_FOUND`, `FORBIDDEN`, `LIMIT_REACHED`, `CONFLICT`, `VALIDATION`, `PLAN_RESTRICTED`, …) mapped to friendly UK-English messages in one place.
- Expected failures are values (Result), unexpected ones are exceptions caught at the boundary, logged with request ID, reported to Sentry, and shown as a generic friendly error.
- Every external call (email, push, AI, storage, postcodes) has a timeout, retry policy where safe, and a defined fallback. The app never hangs on a third party.
- Jobs are idempotent and retry with backoff; poison messages land in a dead-letter queue. Job payloads are versioned so old and new workers coexist during a rolling deploy.
- Infrastructure failures have a defined, tested behaviour: Redis down → auth and money endpoints fail closed with a friendly 503, public reads fail open; email provider down → secondary provider; SSE down → clients fall back to polling.
- UI: every data-driven view has loading (skeleton), empty, error (with retry) states. `error.tsx` and `not-found.tsx` per route group.

## 6. Database and migrations

- Migrations are generated, reviewed and committed; never edit a merged migration.
- Expand → migrate → contract for any breaking change; old code must keep working during deploy (rolling deploys run old and new code together).
- **At scale:** every migration sets `lock_timeout` (5 s); indexes on existing tables use `CREATE INDEX CONCURRENTLY` in a non-transactional migration; backfills run as batched jobs, never inside the migration; the migration linter (TESTING §6) enforces this. Connection budget: web replicas × pool + workers ≤ 80% of `max_connections`, checked at boot; no PgBouncer at launch (single VPS) — RLS uses `SET LOCAL`, so adding PgBouncer in transaction mode later needs no code change (ARCHITECTURE scale path); app `statement_timeout` 5 s (web), 60 s (worker).
- Every FK indexed; queries in hot paths have indexes verified with `EXPLAIN` on seeded data.
- Constraints in the DB, not only in code: unique, check, not-null, FK, partial unique indexes for business invariants (one pending request, one Daily Drop per day).
- Append-only tables (`ledger_entries`, `audit_logs`) protected by triggers that reject UPDATE/DELETE. They hold no PII (ids only), so erasure anonymises the subject rows and leaves them intact. Large append-only tables (`audit_logs`, `notifications`) are partitioned monthly; retention removes whole partitions only.
- No N+1 queries: list views use joins or batched loads.
- Pagination: cursor-based for feeds and long tables.
- Soft-delete only where PRODUCT.md says so; otherwise real deletes with FK rules.

## 7. Concurrency, idempotency and money

- Money in integer pence, points in integers. No floats in calculations.
- Point awards: single transaction, `SELECT … FOR UPDATE` on the request row, idempotency key unique constraint, retries safe.
- Any "check then act" (limits, caps, quotas) enforced by a DB constraint or a locked transaction, not by reading then writing.
- Codes (shop code, member ID, claim/redeem codes): crypto-random, collision retry, uniqueness constraint.

## 8. Time and dates

- Store `timestamptz` UTC. Business rules (Daily Drop day, happy hour, birthdays, recap, plan expiry) computed in `Europe/London` via `src/lib/time.ts` only.
- Services take `now` as a parameter; tests cover BST/GMT transitions.
- Display dates in UK format via one formatter.

## 9. React and UI code

- Server Components by default; `"use client"` only for interactivity, kept small and leaf-level.
- No data fetching in client components when a server component can do it.
- Components use design tokens only; no hard-coded colours, spacing or durations.
- Shared UI in `components/ui`; no one-off copies of primitives.
- Lists have stable keys; heavy lists virtualised (> 100 rows in dashboards).
- No layout shift: images have dimensions; skeletons match final layout.
- Animations follow DESIGN.md §7–8 and the installed Emil Kowalski skills.

## 10. Forms

- Client + server validation from the same Zod schema; server is authoritative.
- Inline errors linked with `aria-describedby`; focus moves to the first error on submit.
- Submit buttons show pending state and prevent double submit; actions are idempotent anyway.
- Inputs use correct `type`, `inputmode`, `autocomplete` (e.g. `tel`, `email`, `postal-code`); font-size ≥ 16px.

## 11. Performance practices

- Budgets in DESIGN.md §12 with the judgment rule in CLAUDE.md §3.
- `next/dynamic` for signature moments, game, charts, scanner, PDF previews.
- `next/image` for every raster image, with `sizes`.
- Cache public reads at the CDN only on routes designed for it (shop landing, offers feed), which use a static hash-based CSP instead of a per-request nonce (SECURITY §5); everything else renders per request. Never cache personalised responses.
- Avoid waterfalls: parallel fetches in server components.
- Check bundle output after adding any dependency.

## 12. Accessibility in code

- Semantic HTML first; ARIA only to fill gaps.
- Every interactive element reachable and operable by keyboard; visible focus.
- Live regions announce points credited, rewards unlocked, form results.
- Colour is never the only signal (status badges have text/icon).
- Target sizes ≥ 44×44px on touch.
- Standard: **WCAG 2.2 AA** (incl. focus not obscured by fixed bars, a non-drag alternative to every drag gesture, extendable time limits such as redeem codes). axe runs in the shared E2E guard on every page.

## 13. Logging and observability

- `pino` structured logs: `requestId`, `userId` (hashed), `shopId`, `action`, `durationMs`, `result`.
- Redaction list enforced: tokens, cookies, phone, email, codes, `authorization` headers.
- Sentry: errors with request ID, release, environment; PII scrubbing on.
- Logs are shipped off-host (30-day retention). Metrics (OpenTelemetry, Prometheus-compatible): latency/errors per route and action, DB pool use, queue depth and lag, job failures, outbox age, SSE connections. Traces across web → DB → queue. Dashboards per SLO; alerts route to on-call (ARCHITECTURE §11). Built in P0-13, not at launch.

## 14. Dependencies

- Prefer the platform and existing deps. Each new runtime dependency needs: why, size impact, maintenance health, licence; one-line DECISIONS.md entry.
- No packages with known high/critical vulnerabilities; no abandoned packages (no release in 18 months) for core paths. Renovate weekly (grouped; patch auto-merge on green CI only); pnpm `minimumReleaseAge` ≥ 3 days; install scripts only for allow-listed packages; GitHub Actions pinned by SHA; container images scanned (Trivy) and pinned by digest.
- **Security-relevant libraries** (auth, sessions, cookies, CSP, rate limiting, uploads, crypto, HTTP clients): the task that adds or upgrades one inventories its options, mounted endpoints and `NODE_ENV`/production-only branches, sets every value SECURITY.md specifies **explicitly**, disables what we don't use, and records the inventory in DECISIONS.md. The security conformance test (TESTING §1) proves the values at runtime on the production build.
- Tooling versions are exact (Prettier pinned); a formatter version or config change reformats the whole repo in the same commit. Line endings are fixed by `.gitattributes` (`eol=lf`).

## 15. Test quality

- Tests describe behaviour ("rejects a second pending request for the same shop"), not implementation.
- Arrange data through factories; no shared mutable fixtures between tests.
- Each bug fix adds a regression test that failed before the fix.
- No sleeping on time; inject clocks; use Playwright auto-waits, not timeouts.
- E2E selectors use roles/labels (`getByRole`), not CSS classes.

## 16. Git and commits

- Conventional Commits, small and focused; message explains why when not obvious.
- `main` is always deployable. A committed pre-push hook runs `pnpm gate:task` and refuses force-pushes. One documented setting, `GITHUB_MODE` (PROGRESS.md), switches the flow:
  - `pro` (GitHub Pro/Team): each task on branch `t/<task-id>`, PR merged with `gh pr merge --auto --squash`; branch protection requires CI and blocks force-push and deletion of `main`; deploy secrets may live in environments (no required reviewers on private repos at any plan below Enterprise).
  - `free` (GitHub Free, private repo — no branch protection, rulesets, auto-merge or environments): push to `main` through the pre-push hook; CI runs on every push; production deploy is a `workflow_dispatch` that refuses unless the target commit has a green CI run; secrets are repository secrets.
- Actions budget: stay under 75% of the monthly Actions credit (Free: $12 ≈ 2,000 Linux 2-core minutes); 1-core runners for light jobs; `concurrency` with cancel-in-progress; path filters; pnpm and Playwright caches; Actions artifacts small and short-lived (they share the 500 MB package storage).
- One commit per task: code, tests and progress files together (squash merge).
- Never commit generated secrets, `.env*` (except `.env.example`), large binaries, or coverage output.

## 17. Forbidden shortcuts

- Placeholder logic presented as finished ("for now we just…") without a PROGRESS.md ticket.
- Disabling a test, lint rule, type check or security header to get green.
- Catching and ignoring errors.
- Hard-coded IDs, URLs, secrets, prices, or copy that belongs in config/content.
- Mock data shipped in production code paths.
- Copy-pasted components instead of extending primitives.
- Business rules implemented only in the UI.
- Marking a task done without running the verification steps.
- Relying on a library default for any value SECURITY.md specifies (cookie names/flags, session lifetime per role, client-IP source, rate limits, verified-email rules).
- Treating E2E on `next dev` as evidence; production behaviour is verified on a production build.
- Closing a task, sub-phase or phase with a gate "pending".
- A check that only CI runs, with no local twin.
