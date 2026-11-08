# DECISIONS — architecture and trade-off log

Newest first. 2–4 lines each: date, decision, why, consequence. Includes accepted budget overruns (CLAUDE.md §3) and new runtime dependencies.

Template:

```
## YYYY-MM-DD — <short title>
Decision: …
Why: …
Consequence / revisit when: …
```

---

## 2026-11-08 — Scoped data access: branded scopes + repositories (P0-03)
Decision: `requireCustomer` / `requireShopRole` / `requireAdminRole` now return branded, frozen scopes (`src/server/authz/scope.ts`). Repositories (`src/server/repos/*`) reach the DB only through `dbFor(scope)` / `transaction(scope, fn)`, and build tenant filters with `inShop(col, scope)` / `ownedBy(col, scope)`. Work no user asked for uses `systemScope("why")`. ESLint enforces three rules: only repos, `db/`, `auth/`, `authz/principal.ts` and `testing/` may import `db`; only `authz/` (and testing) may mint scopes; `as …Scope` casts are banned. A plain object does not type-check as a scope.
Why: the brief asks that unscoped access be awkward. A brand, a lint rule and filters built from the scope make a cross-shop query take deliberate effort, and the effort shows up in review.
Consequence: new data access means a repo function taking a scope. Services call repos and take the scope from the action's `authorize`. `setFlag(scope, input)` is the first example; it records `admin:<role>` in the audit log through `auditActor(scope)`.

## 2026-11-08 — DB foundation details (P0-03)
Decision:
- `shops.location` is `geography(Point,4326)`, through a custom column (`geographyPoint`, `{ lng, lat }`, EWKT in, EWKB out, ranges validated).
- `prevent_update_delete()` is replaced by the brief's generic `reject_mutation()` in a new migration (0003), because merged migrations are never edited.
- A `set_updated_at()` trigger is attached to every table with `updated_at`.
- Group role `moz_app` (NOLOGIN) has DML on all tables but no UPDATE/DELETE/TRUNCATE on append-only tables, plus default privileges for future tables. Each environment's login role is granted `moz_app` (H-05 steps).
- Local `DATABASE_URL` stays the owner role for now. The restricted role is proven by integration tests using `SET ROLE moz_app`, and staging runs as `moz_app_login`.
- Destructive migrations need a `-- contract: <why>` line, enforced by `scripts/check-migrations.ts` in `pnpm lint`.
- `db:seed` (P0-03) is the idempotent baseline: feature flags and marketplace categories, insert-only, refused in production. P0-16 adds the demo shops and per-role accounts.
- `db:reset` is local-only (APP_ENV=local and localhost). It drops the schemas, because audit_logs blocks TRUNCATE by design.
Why: these are ENGINEERING §6 and SECURITY §11 requirements. Geography gives distances in metres for "Near me · 5 km", with no projection maths.
Consequence:
- Append-only tables need `REVOKE UPDATE, DELETE, TRUNCATE ON <t> FROM moz_app` plus both `reject_mutation` triggers. New tables need a `set_updated_at` trigger.
- `tests/integration/db-foundation.test.ts` fails if any of these is missed.
- drizzle-kit emits `"undefined"."geography(...)"` for custom types, so hand-fix the generated SQL and add a `USING` cast.

## 2026-11-08 — Local infrastructure and env layout (P0-02)
Decision: **Local Postgres 17** + PostGIS 3.5 (`imresamu/postgis:17-3.5`, multi-arch) instead of the brief's 16; compose file at `infra/docker-compose.dev.yml` as the brief says (moved from the repo root; `pnpm services:up` wraps it with a Docker and port pre-flight check). MinIO's healthcheck creates the `moz-rewards` bucket with the image's own `mc`, so `up --wait` only returns once the bucket exists: no extra init container or script.
Why: production will run whatever managed Postgres (Neon, H-05) offers, and 17 is current there. PostGIS image `postgis/postgis` is amd64-only and the second developer's Mac is arm64. A healthcheck-created bucket works with plain `docker compose … up --wait` too.
Consequence: if H-05 ends up on a different major, pin the local image to match. The bucket name in the healthcheck must match `S3_BUCKET` in `.env.example`.

## 2026-11-08 — Env split: `@/server/env` (server) + `@/lib/env` (client), validated at startup (P0-02)
Decision: The brief's single `src/lib/env.ts` is split in two. Server variables live in `src/server/env.ts` (`server-only`). Browser variables live in `src/lib/env.ts` (`clientEnv`, strict schema, `NEXT_PUBLIC_*` only). Each value there is read with a literal `process.env.NEXT_PUBLIC_…` so Next inlines it. Public-by-design keys are renamed to `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. The server env is validated at startup in `src/instrumentation.ts` (Next) and at the top of `src/worker/index.ts`. `pnpm worker` runs with `--conditions=react-server` and loads `.env.local` through `scripts/load-env` (same as `db:migrate`), so `server-only` modules load outside Next. Staging/production also require `NODE_ENV=production`. `NODE_ENV` was removed from `.env.example`: exporting it broke `next build`.
Why: one module holding both schemas would put every server variable name into the client bundle, which is the exact leak the P0-02 grep forbids.
Consequence: new browser variables go in `clientEnvSchema` and the literal read list in `src/lib/env.ts`. `pnpm check:bundle` (after `pnpm build`) fails on any server variable name in `.next/static`. One reviewed exception: the `@better-auth/core` env shim's `get AUTH_SECRET(){…}` getter, which is a name only and reads an empty `process.env` in the browser. It is matched by an exact pattern, so any other mention still fails. P0-14 adds `check:bundle` to CI.

## 2026-11-08 — Exact versions and lint/tooling baseline (P0-01)
Decision: Node 24.x (`.nvmrc` 24, `engines` 24.x), pnpm 12.18.0, Next 16.4.5, React 19.3.0, TypeScript 5.9.3, Drizzle ORM 0.45.4 (+ drizzle-kit 0.31.11, postgres 4.1.0), Better Auth 1.7.18 (+ @better-auth/passkey 1.7.18), Zod 4.6.7, Tailwind 4.3.5, Vitest 5.1.0, Playwright 1.65.0, typescript-eslint 8.72.1, Stryker 10.1.1, lefthook 2.2.2. Motion: not installed yet (arrives with P0-10). ESLint: strictTypeChecked + explicit module boundary types + custom `moz/no-server-in-client` and `moz/require-server-only`; `require-await` off (async interface implementations); hex colours banned in TS/TSX and in CSS outside tokens.css. Pre-commit (lefthook): prettier + eslint on staged files, gitleaks on staged changes (local binary or pinned `zricethezav/gitleaks:v8.21.2`; blocks the commit if neither is available).
Why: ENGINEERING §2–3 and the P0-01 brief; the audit found these missing.
Consequence: `pnpm check` is typecheck + lint + unit (no Docker); `pnpm check:full` adds integration. `server-only` is required in `src/server/**` except `db/schema/**` and `db/migrate.ts` (they run in plain Node: drizzle-kit and the migrate CLI). Update this entry when a listed dependency moves a major version. Folder layout follows ARCHITECTURE §2 for everything that exists; folders for later work (`components/motion` P0-10, `server/repos` P0-03, `server/jobs` P0-04, `lib/time.ts` with the first time logic, `infra/` P0-15, `twa/` P5) are created by the task that first needs them, not as empty placeholders. `globals.css` stays in `src/app/` (Next convention: imported by the root layout); tokens live in `src/styles/`. Vitest uses fixed fake `AUTH_SECRET`/`EMAIL_FROM` so tests pass on a fresh clone and never read real secrets.

## 2026-11-08 — Staff/admin sign-in is password + second factor only; passkeys need MFA to register
Decision: Accounts with a staff row, admin row or password credential can get a session only from `/sign-in/email` or an MFA endpoint (session-create hook); they never receive email links (silent, same response). Registering a passkey requires an MFA-verified session for everyone, and passkeys require user verification.
Why: audit security #1 (critical bypass via email link/Google → passkey) and #6; SECURITY §2 makes staff/admin MFA mandatory, and passkeys are not a customer feature.
Consequence: staff add a passkey only after TOTP is on, and cannot turn TOTP off (`/two-factor/disable` refused before Better Auth deletes the secret; change-password re-issues a non-MFA session). No deployed environment has ever existed, so no passkey registered via the old bypass can exist: no clean-up migration needed (re-check if that changes). Magic-link timing difference for staff vs customers (low) is removed when email moves to the P0-04 queue. A customer later invited as staff loses email-link/Google sign-in for that account (invite flow must explain this, P2). Remaining medium items #5 (first-enrolment takeover) and #8 (Better Auth account endpoints for stale staff sessions) are fixed with P0-06/P0-07 rework.

## 2026-11-08 — P0-17 test infrastructure choices
Decision: E2E runs its own `next dev` on port 3100 (`APP_ENV=test`, DB `moz_test_e2e` recreated on server start, build dir `.next-e2e`), with a globalSetup that warms routes; specs create data only via the 404-gated `/api/test/*` API (`session`, `user`, `fakes`, `reset-fakes`, `GET push`). Fakes for push/AI/postcodes/Places keep state on `globalThis` and fail closed outside local/test until real providers land. SMTP→Mailpit replaces the console email provider and the dev outbox.
Why: run beside `pnpm dev`; Playwright can't import `server-only` code; cold on-demand compilation under 5 parallel projects caused Chromium-only timeouts (fixed at the cause, not by widening timeouts); no Redis client exists before P0-04.
Consequence: add new top-level routes to `tests/e2e/support/warm-up.ts`. CI should run E2E against `next build && next start` (P0-14). Move the push sink to Redis once BullMQ lands if workers need to send pushes.

## 2026-11-08 — Mutation testing and load tooling
Decision: Stryker 10 (vitest runner) on rules modules (`authz/policies`, `lib/return-to`, `lib/codes`; extend per TESTING §2), break threshold 80. k6 smoke via local `k6` or pinned `grafana/k6:1.0.0` Docker image. `test:live` is a separate Vitest config, skipped per provider until credentials exist.
Why: no extra installs needed on either laptop; live checks must never run in normal CI.
Consequence: first run 90.1% (codes 86.8, return-to 82.6, policies 94.7; 14 survivors to review at phase end). k6 numbers from `next dev` are not meaningful (action p95 458 ms locally); the real gate runs against staging (TESTING §5).

## 2026-11-08 — Session create hook stays strict; test API sets mfaVerified on the row
Decision: `databaseHooks.session.create.before` keeps forcing `mfaVerified` from the request path; the test-only session API updates the row after `login()` instead.
Why: loosening the hook would let any internal caller mint MFA sessions, the exact class of bug the audit flagged as critical.
Consequence: if Better Auth test utils change, re-check `tests/integration/test-api.test.ts`.

## 2026-11-08 — Kit v3: testing and self-verification
Decision: Kit v3: test-first for logic, self-verification loop with console/network guard and screenshot inspection, `/subphase-complete` regression + post-push CI/staging verification, mutation testing for rules modules, reconciliation job, synthetic monitoring.
Why: agency-grade reliability for a large-scale SaaS.
Consequence: P0-17 (test infrastructure) is done before any other unfinished task and existing tests migrate onto it; sub-phases close only via `/subphase-complete`; PHASES gained P0-17, P1-17 (reconciliation), P1-18 (hardening) and close lines.

## 2026-11-08 — Kit upgrade and audit
Decision: Kit upgraded to detailed phase briefs, ENGINEERING.md standards and code-reviewer; prior work audited against new task IDs.
Why: the earlier kit had one-line tasks; the new briefs define acceptance criteria, edge cases and required tests per task (P0-01 … P0-16).
Consequence: Old PHASES ticks are void; results in `progress/AUDIT.md`. Project-specific additions to CLAUDE.md (autopilot cadence rule, extra scripts) and README (task/review sounds) were re-added on top of the new kit text.

## 2026-11-08 — Autopilot cadence (human's rule)
Decision: After each task: progress update, commit, push, soft "task" sound, continue. Stop for review after 3–5 tasks (by size) and always at phase end, with the louder two-tone "review" sound. Written into CLAUDE.md §1; sounds in `.claude/hooks/notify.mjs` (`task`, `review`).
Why: the human wants to follow progress and be able to stop or hand off at any point without babysitting every task.
Consequence: Every task ends pushed; `/handoff` is always possible.

## 2026-11-08 — UI primitives
Decision: Own primitives in `src/components/ui/` (no component library): Button (+`buttonClasses` for links), Card/HeroCard, Badge, ProgressBar, Skeleton, EmptyState, TextField/TextArea, Switch, Chip/ChipGroup, SegmentedControl, Tabs, Toast (`toast()` + `<Toaster/>`), Sparkline, KpiCard, Table, ShopCard. Icons: `lucide-react` (per-icon imports, 1.5 stroke). Sheet/Modal/SidePanel come with the motion primitives (task 9). `/dev/*` is 404 only in production so the gallery can be demoed on staging.
Why: DESIGN §6 is specific enough that a library would mostly be overridden; keeps bundles small.
Consequence: axe found and we fixed: hidden loading label (use opacity, not visibility), ink-3 is not for readable text (placeholders/decoration only), success badge tint 6%, focusable scroll regions, and grid items need `min-w-0` (ShopCard caused page overflow on phones). The gallery E2E asserts zero serious axe issues and no horizontal overflow.

## 2026-11-08 — Authz matrix harness
Decision: `tests/authz/harness.ts` builds real DB principals for 13 roles (anonymous, customer, other-shop staff/owner, own-shop staff/owner, owner without MFA, inactive staff, 4 admin roles, admin without MFA) and `authzMatrix("<action>", { allow, run })` asserts allow/deny for each. `coverage.test.ts` fails if any `export const x = defineAction(` lacks a matrix entry. Actions are run as a role via `runAsPrincipal()` (AsyncLocalStorage), which throws unless `APP_ENV=test`.
Why: SECURITY §3 makes the matrix mandatory; real principals also exercise `loadPrincipal` (active flags, roles).
Consequence: New actions must add a `*.authz.test.ts` entry or CI fails. Route handlers that mutate data must be added to the coverage guard when the first one appears.

## 2026-11-08 — Auth flows, MFA enforcement and session limits
Decision: Customers: Google + magic link only. Staff/admin: email+password (Argon2id via `@node-rs/argon2`, HIBP check on password set) then mandatory TOTP or passkey; a password-only session goes straight to `/staff/security` to enrol, and enrolment ends with sign-out + fresh sign-in so the portal session is MFA-verified. `requireShopRole`/`requireAdminRole` deny unless `session.mfaVerified`; staff sessions are capped at 12 h and admin at 2 h **absolute** from sign-in (stricter than the idle timeout in SECURITY §5, and simple to prove).
Why: one users table per PRODUCT §2 (customer can also be staff) means 2FA must be checked per session, not per account.
Consequence: A staff member signed in as a customer (Google) must sign in again via `/staff/sign-in` to use the dashboard — that is the "explicit switch". Better Auth's built-in rate limiter is still in-memory; moved to Redis in the rate-limit task. `__Host-` cookie prefix is handled in the security-headers task (`useSecureCookies` gives `__Secure-` on https today).

## 2026-11-08 — Forms are uncontrolled until submit
Decision: Auth forms use uncontrolled inputs read with `FormData` on submit, `method="post"`, and a `useHydrated()` gate on the submit button. Apply the same pattern to every form typed into on first load.
Why: E2E on iPhone emulation showed React resetting controlled inputs on hydration, wiping what a fast typist had entered; a pre-hydration native GET submit could also put a password in the URL.
Consequence: Use `formValue()` from `src/lib/use-hydrated.ts`; validate on submit (and server-side, always).

## 2026-11-08 — Dev-only email outbox
Decision: `EMAIL_PROVIDER=console` prints emails and keeps the last 50 in memory; `/api/dev/outbox?to=` returns the latest one, and 404s unless `APP_ENV` is `local` or `test`. `env()` refuses `console` in production.
Why: E2E and local demos need sign-in links without a real email account (H-04 not done yet).
Consequence: Staging must use a real provider (Resend) — staging E2E reads links via provider test inbox or seeded sessions instead.

## 2026-11-08 — Database layer
Decision: Drizzle 0.45 + postgres.js (`prepare: false` for Neon/PgBouncer pooling), `casing: "snake_case"`, UUIDv7 ids generated in app (`src/lib/id.ts`, `uuid` pkg; Better Auth uses the same via `advanced.database.generateId`), all timestamps `timestamptz`. Local image `imresamu/postgis:17-3.5` (official `postgis/postgis` is amd64-only; same maintainers' multi-arch build). Tests run against a separate `moz_test` DB migrated by Vitest globalSetup; `pnpm test` needs `pnpm services:up`.
Why: ARCHITECTURE §3/§4; native arm64 speed on dev Macs; integration tests on a real Postgres (TESTING §1).
Consequence: Drizzle's `geometry` drops the SRID, so `0000_init.sql` was hand-edited to `geometry(point, 4326)` (test asserts it). Append-only tables use the `prevent_update_delete()` trigger (migration 0001) — reuse it for `ledger_entries`.

## 2026-11-08 — Auth schema and staff/admin role tables
Decision: Better Auth tables generated with its CLI (now the `auth` package; `@better-auth/cli` is deprecated) then adapted to uuid/timestamptz. Added `admin_members(user_id, role owner|support|moderator|finance)` (not in the PHASES list but needed for `requireAdminRole`). `sessions.mfa_verified` flag marks sessions created by TOTP/backup-code/passkey verification; staff/admin authz will require it.
Why: one users table for all roles (PRODUCT §2: a user can be customer and staff); 2FA must be provable per session, not just "enabled on the account".
Consequence: When adding an auth plugin, regenerate to a scratch file and merge by hand into `src/server/db/schema/auth.ts`.

## 2026-11-08 — Scaffold versions and tooling
Decision: Next.js 16.4.5 (App Router, Turbopack, `cacheComponents` + `partialPrefetching` on as generated), React 19.3.0, TypeScript 5.9.3 (not TS 7: eslint-config-next/typescript-eslint target TS 5), Tailwind 4.3.5 via `@tailwindcss/turbopack`, ESLint 9 flat config + eslint-config-prettier, Prettier 3.9, Vitest 5.1 (native tsconfig paths), Playwright 1.65 (chromium, webkit, Pixel 7, iPhone 14), pnpm 12.18, Node ≥ 24 (dev machine on 26.11 LTS; `.nvmrc` = 24).
Why: latest stable at kickoff per ARCHITECTURE §1; TS 7 is too new for the lint toolchain.
Consequence: Next 16 renames middleware → `proxy.ts`, request APIs are async, and `LayoutProps`/`PageProps` are generated globals — `pnpm typecheck` runs `next typegen` first. Read `node_modules/next/dist/docs/` before using a Next API (see AGENTS.md). pnpm blocks install scripts by default; allowed builds live in `pnpm-workspace.yaml` (esbuild, sharp). Markdown/kit files are excluded from Prettier.

## (kickoff) — Agent skills and working rules
Decision: Install only four Emil Kowalski skills (emil-design-eng, animation-performance, mobile-native, review-animations). Adopt root-cause debugging and verification-before-done as CLAUDE.md rules instead of installing the full Superpowers plugin. Not used: Ponytail, UI UX Pro Max, Graphify (revisit around P3 if search becomes slow), Gatekeeper, OmniRoute.
Why: motion quality is a core requirement; the full Superpowers workflow adds approval gates and token cost that conflict with phase-based autopilot; UI UX Pro Max would override the chosen design direction; Ponytail's minimalism conflicts with the premium UI spec; OmniRoute routes client code through third-party providers.
Consequence: DESIGN.md §8 signature moments are documented exceptions to the skills' sub-300ms rule.

## (kickoff) — Initial stack
Decision: Next.js App Router + TypeScript, Drizzle + Postgres (PostGIS), Better Auth, Redis + BullMQ, SSE, Cloudflare R2, Web Push, Bubblewrap TWA for Android. No iOS App Store build.
Why: one codebase for three portals, low running costs, free tiers available, no vendor lock-in for realtime.
Consequence: record exact versions here after scaffolding.
