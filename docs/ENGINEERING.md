# Engineering standards — Moz Rewards

The bar: code a senior reviewer at a top product agency would approve without comments. This is a SaaS product expected to run at scale for years; write it for the engineer who maintains it in two years. The `code-reviewer` subagent checks every task group against this file.

Sections: [1 Definition of done](#1-definition-of-done) · [2 TypeScript](#2-typescript) · [3 Structure and boundaries](#3-structure-and-boundaries) · [4 Server actions and APIs](#4-server-actions-and-route-handlers) · [5 Errors](#5-errors-and-failure-handling) · [6 Database](#6-database-and-migrations) · [7 Concurrency and money](#7-concurrency-idempotency-and-money) · [8 Time](#8-time-and-dates) · [9 React and UI](#9-react-and-ui-code) · [10 Forms](#10-forms) · [11 Performance](#11-performance-practices) · [12 Accessibility](#12-accessibility-in-code) · [13 Logging](#13-logging-and-observability) · [14 Dependencies](#14-dependencies) · [15 Tests](#15-test-quality) · [16 Git](#16-git-and-commits) · [17 Anti-patterns](#17-forbidden-shortcuts)

---

## 1. Definition of done

A task is done only when **all** of these are true, with evidence in the session:
1. Every acceptance criterion in the task's phase file is met.
2. Every listed edge case is handled and covered by a test or a documented manual check.
3. Required tests exist, are meaningful (they would fail if the behaviour broke) and pass.
4. Authorisation matrix entries exist for every new action/route.
5. `pnpm check` passes; no new lint suppressions without a justification comment.
6. UI tasks: checked at 390×844 (Chromium + WebKit) and 1440×900, keyboard-navigable, reduced-motion verified, loading/empty/error states present.
7. No TODO/FIXME left in the task's code unless it references a ticket in PROGRESS.md.
8. The `code-reviewer` subagent has reviewed the task group with no unresolved high findings.
9. Docs updated where behaviour or structure changed (PROGRESS map, DECISIONS, `.env.example`).

"It works on the happy path" is never done.

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
- `server/repos/*` are the only place that talks to the DB; every function requires a scope (`shopId` or `userId`).
- `features/<domain>/` groups UI + actions per domain. Cross-domain calls go through services, not UI imports.
- `server-only` imported in every server module; secrets never reachable from client bundles (ESLint rule + `server-only`).
- One responsibility per file; files > ~300 lines are split.
- Naming: domain language from PRODUCT.md (ingot, membership, Daily Drop, suggestion) used consistently in code, DB and UI.

## 4. Server actions and route handlers

Every mutation follows the template in `src/server/actionTemplate.ts`:
1. Authenticate (session).
2. Authorise (`server/authz` policy).
3. Validate with a strict Zod schema (lengths, ranges, enums).
4. Rate-limit if abuse-prone (SECURITY.md §6).
5. Call one service inside a transaction where more than one write happens.
6. Write an audit log entry for sensitive actions.
7. Return a typed `Result<T, AppErrorCode>`; never throw raw errors to the client.
8. Enqueue side effects (emails, push, PDFs) after commit, never inside the transaction.

Route handlers (SSE, uploads, health) follow the same steps plus `Origin` checks for mutations.

## 5. Errors and failure handling

- `AppError` with stable codes (`NOT_FOUND`, `FORBIDDEN`, `LIMIT_REACHED`, `CONFLICT`, `VALIDATION`, `PLAN_RESTRICTED`, …) mapped to friendly UK-English messages in one place.
- Expected failures are values (Result), unexpected ones are exceptions caught at the boundary, logged with request ID, reported to Sentry, and shown as a generic friendly error.
- Every external call (email, push, AI, storage, postcodes) has a timeout, retry policy where safe, and a defined fallback. The app never hangs on a third party.
- Jobs are idempotent and retry with backoff; poison messages land in a dead-letter queue.
- UI: every data-driven view has loading (skeleton), empty, error (with retry) states. `error.tsx` and `not-found.tsx` per route group.

## 6. Database and migrations

- Migrations are generated, reviewed and committed; never edit a merged migration.
- Expand → migrate → contract for any breaking change; old code must keep working during deploy.
- Every FK indexed; queries in hot paths have indexes verified with `EXPLAIN` on seeded data.
- Constraints in the DB, not only in code: unique, check, not-null, FK, partial unique indexes for business invariants (one pending request, one Daily Drop per day).
- Append-only tables (`ledger_entries`, `audit_logs`) protected by triggers that reject UPDATE/DELETE.
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
- Cache public reads (CDN + `revalidate`), never personalised responses.
- Avoid waterfalls: parallel fetches in server components.
- Check bundle output after adding any dependency.

## 12. Accessibility in code

- Semantic HTML first; ARIA only to fill gaps.
- Every interactive element reachable and operable by keyboard; visible focus.
- Live regions announce points credited, rewards unlocked, form results.
- Colour is never the only signal (status badges have text/icon).
- Target sizes ≥ 44×44px on touch.

## 13. Logging and observability

- `pino` structured logs: `requestId`, `userId` (hashed), `shopId`, `action`, `durationMs`, `result`.
- Redaction list enforced: tokens, cookies, phone, email, codes, `authorization` headers.
- Sentry: errors with request ID, release, environment; PII scrubbing on.
- Metrics that matter: request latency per action, queue depth, job failures, SSE connections.

## 14. Dependencies

- Prefer the platform and existing deps. Each new runtime dependency needs: why, size impact, maintenance health, licence; one-line DECISIONS.md entry.
- No packages with known high/critical vulnerabilities; no abandoned packages (no release in 18 months) for core paths.

## 15. Test quality

- Tests describe behaviour ("rejects a second pending request for the same shop"), not implementation.
- Arrange data through factories; no shared mutable fixtures between tests.
- Each bug fix adds a regression test that failed before the fix.
- No sleeping on time; inject clocks; use Playwright auto-waits, not timeouts.
- E2E selectors use roles/labels (`getByRole`), not CSS classes.

## 16. Git and commits

- Conventional Commits, small and focused; message explains why when not obvious.
- `main` is always deployable; CI green before push completes a task.
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
