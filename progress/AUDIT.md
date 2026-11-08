# AUDIT — prior work against the upgraded kit (P0)

**Date:** 8 Nov 2026 · **Baseline commit:** `814f443` (kit upgrade) · **Auditors:** `code-reviewer` ×2 (P0-A/B, P0-C/D/E), `security-reviewer`, `design-reviewer` · **Standard:** `docs/phases/P0.md`, `docs/ENGINEERING.md`, `docs/SECURITY.md`, `docs/DESIGN.md`.

Method: each task's acceptance criteria, edge cases, required tests and build notes were checked with evidence gathered in this session (commands run, file:line, test names, live measurements on `/dev/ui`, production-mode `curl`, proof-of-concept tests against the test DB). Reviewers were read-only; temporary probe files were deleted and the working tree stayed clean.

## Work mapped to the new task IDs

| New ID | Built under the old kit | Commits |
|---|---|---|
| P0-01 | Next 16 scaffold, TS strict, ESLint, Prettier, Vitest, Playwright (4 projects), scripts, skills check | 48372c7, cf1b6f4 |
| P0-02 | Root `docker-compose.yml` (PG17 + PostGIS, Redis 7), `.env.example`, `src/server/env.ts` | fcc766f |
| P0-03 | Drizzle schema + migrations 0000/0001, append-only audit trigger, test DB | c356520 |
| P0-04 | — (worker stub only) | — |
| P0-05 | audit writer only (`services/audit.ts`) | 0593a34 |
| P0-06 | Better Auth, Argon2id, TOTP + passkey, mfaVerified flag, sign-in UI, dev outbox, E2E | 37e4068, 9e7b01f |
| P0-07 | authz policies, `defineAction`, AppError, authz matrix harness + coverage guard, `setFeatureFlag` | 37e4068, 0593a34 |
| P0-08 | tokens, fonts, Tailwind theme, reduced-motion preference, contrast test | fbeace3 |
| P0-09 | 17 primitives, `/dev/ui`, component tests, axe + overflow E2E | f92b32f |
| P0-10 … P0-16 | — | — |

**Order deviations:** auth (P0-06) was built before background jobs (P0-04) and the security baseline (P0-05), so auth has no Redis throttling, no queued email and no security headers yet.

## Verdicts

| Task | Verdict |
|---|---|
| P0-01 Scaffold | PARTIAL |
| P0-02 Local infra + env | PARTIAL |
| P0-03 Database | PARTIAL |
| P0-04 Background jobs | MISSING |
| P0-05 Security baseline | MISSING |
| P0-06 Authentication | PARTIAL |
| P0-07 Authz + action template | PARTIAL |
| P0-08 Tokens / fonts / preferences | PARTIAL |
| P0-09 Primitives + gallery | PARTIAL |
| P0-10 … P0-16 | MISSING |

**Fully met: 0 · Partial: 7 · Missing: 9.** Nothing is ticked in `docs/PHASES.md`.

## Top risks

1. **Critical — staff/admin MFA bypass** (email link or Google → register passkey → passkey sign-in counts as 2FA). Proven by PoC. Fix first.
2. **Fail-open environment defaults** — a deploy missing `APP_ENV` would expose the dev outbox (read anyone's sign-in link), test utilities, console email and non-Secure cookies.
3. **No security headers / CSP**, `X-Powered-By` exposed; `/dev/*` answers 200 (not 404) in production.
4. **No production rate limiting or login throttling** (Better Auth limiter is in-memory and production-only).
5. **No `server-only` boundary and no lint rule** — server code/secrets could leak into client bundles unnoticed.
6. **Action template incomplete** (validates before authenticating; no rate limit / transaction / audit / after-commit) — every future action would copy the gap.
7. Smaller security items: open-redirect via dot-segments, magic-link tokens stored plain and printed in console logs, first-enrolment takeover, passkey without user verification, audit trigger bypassable by the table owner.
8. Design/a11y: focus ring wrong everywhere; touch targets < 44px; long words / big numbers overflow at 320px; auth screens bypass primitives.

## Fix plan (task order, per the brief: no new tasks until earlier ones are fully met)

0. **Security hotfix first** (critical #1 and fail-open env #2) — they affect existing code and the bypass is exploitable today.
1. P0-01 tooling (server-only, lint boundaries + hex ban, strict-type-checked, exactOptionalPropertyTypes, Vitest/Playwright projects, pre-commit, versions).
2. P0-02 (required APP_ENV, server/client env split + fail-fast, env tests, Mailpit, README local setup).
3. P0-03 (content_settings, updated_at trigger, geography, codes.ts, repos/_base, db:seed/db:reset, constraint tests, FK indexes, email uniqueness).
4. P0-04 background jobs.
5. P0-05 security baseline (proxy CSP/headers/request ID/dev 404, limiter, origin check, Turnstile, pino).
6. P0-06 auth gaps; 7. P0-07 template rebuild; then P0-C fixes (P0-08, P0-09) before P0-10 onwards.
Each sub-phase ends with a `code-reviewer` pass.

---

## Sub-phases P0-A and P0-B (code-reviewer, 8 Nov 2026, against `814f443`)

Commands run by the reviewer: `pnpm check` exit 0 (170 tests); `pnpm build` ✓; production server (`APP_ENV=production`) + `curl -I /`, `/dev/ui`, `/api/dev/outbox`; temporary lint probe (`"use client"` file importing `@/server/env` + hex colours) → ESLint exit **0**; temporary coverage probe → coverage test failed, then passed after removal; `pnpm db:migrate:test` re-run (no-op); `psql \d audit_logs`; `tsc --exactOptionalPropertyTypes` → 4 errors; grep of `.next/static` for server env names.

### P0-01 · Skills check and repository scaffold — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| Skills present | met | `skills-lock.json`, `.claude/skills/*` | – |
| Next latest, App Router, `src/` | met | next 16.4.5 | – |
| TS flags per ENGINEERING §2 | partial | `exactOptionalPropertyTypes` missing → 4 errors (`playwright.config.ts`, `Button.tsx`, `TextField.tsx` ×2) | enable + fix |
| Node LTS pinned (`.nvmrc` + engines), `packageManager` | partial | `.nvmrc`=24, `engines` `>=24` (floor, not pin), packageManager ✓ | pin `24.x` |
| ESLint typescript-eslint strict-type-checked | missing | `eslint.config.mjs` uses next presets only | add `strictTypeChecked` + projectService |
| Import ordering | missing | no rule | add |
| Client files can't import `@/server/*` | missing | probe passed lint | boundary rule + `server-only` |
| Hex colours banned in components/app | missing | probe passed; real hex in `layout.tsx`, `EnrolTotp.tsx`, `globals.css` | lint rule (TS) + CSS check outside tokens.css |
| Prettier | met | `.prettierrc.json`, scripts | – |
| Vitest unit + integration projects | partial | one project; DB globalSetup every run | split projects |
| Playwright projects chromium/webkit/pixel7/iphone14/desktop1440 | partial | 4 projects, names differ, no desktop1440 | rename + add |
| Folder layout per ARCHITECTURE §2 | partial | no `server/repos`, `server/jobs`, `components/motion`, `lib/time.ts`, infra compose | create with their tasks |
| `src/server/**` imports `server-only` | missing | 0 hits | add everywhere |
| Scripts; `check` = typecheck+lint+unit; `test:int` | partial | `check` runs integration too; no `test:int`, `db:seed`, `db:reset` | split |
| Pre-commit hook (format, lint-staged, gitleaks) | missing | none | lefthook |
| AC: fresh clone → install → check; dev serves `/` | partial | passes but needs Docker (integration in check) | via split |
| AC: client import of `@/server` fails lint | missing | probe exit 0 | – |
| AC: hex colour fails lint | missing | probe exit 0 | – |
| AC: exact versions in DECISIONS (Next, React, TS, Drizzle, auth, Motion) | partial | Better Auth 1.7.18 and exact Drizzle 0.45.4 not recorded; Motion not installed | record |
| Test: unit smoke | met | `src/app/page.test.tsx` | – |
| Test: Playwright smoke on 5 projects | partial | 4 projects | add fifth |
| ENG §2 no `any` / no `!` | partial | `!` in `Tabs.tsx`, `SegmentedControl.tsx` | guards |
| ENG §2 explicit return types | partial | missing on `session.ts`, `authz/index.ts`, `services/flags.ts`, `_columns.ts` | add + lint rule |

### P0-02 · Local infrastructure and environment validation — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| `infra/docker-compose.dev.yml` (PG16+PostGIS, Redis 7, Mailpit, health checks, volumes) | partial | root `docker-compose.yml`; PG **17**; health checks, Redis password, volumes, loopback ports ✓; **no Mailpit** | move/log location; log PG17; add Mailpit |
| `src/lib/env.ts` split serverEnv/clientEnv | partial | `src/server/env.ts` server only; no clientEnv; no `server-only` | split |
| Fails fast naming variables (never values) | partial | names listed, but lazy (first `env()` call) | validate in `instrumentation.ts` + worker start |
| `.env.example` complete, commented | met | all groups present | add SMTP/Mailpit vars |
| README "Local setup" verified | missing | none | write + follow literally |
| AC: compose up + `pnpm dev` from fresh clone | partial | works via root compose | – |
| AC: missing variable → clear startup error naming it | partial | names it, but at first request; no recorded evidence | instrumentation + evidence |
| AC: no server-only variable names in `.next/static` | partial | 9/10 absent; `AUTH_SECRET` name in Better Auth client shim (name only) | document allowlisted false positive |
| Edge: Docker not running → clear message | missing | raw Docker error | pre-flight check |
| Edge: port conflicts documented | missing | – | README |
| Test: env schema unit tests | missing | no `env.test.ts` | add |
| Safe defaults | **high risk** | `APP_ENV` defaults to `local` → testUtils, dev outbox, console email could run in a misconfigured prod | required, cross-checked with NODE_ENV |

### P0-03 · Database foundation — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| Drizzle client with pooling; separate migration connection | met | `db/client.ts`, `migrate.ts` | server-only, return types |
| Scripts db:generate/migrate/seed/reset (reset local-only) | partial | no `db:seed`, `db:reset` | add (reset drops schema; TRUNCATE on audit_logs is blocked) |
| UUIDv7, `timestamps()`, `updated_at` trigger | partial | app-side `$onUpdate`, no DB trigger | `set_updated_at()` trigger |
| Tables incl. `content_settings`; memberships unique | partial | `content_settings` **missing**; unique ✓ | migration |
| `location geography(Point,4326)` | deviation | `geometry(point, 4326)` | switch to geography now (empty data) |
| Shop status enum | met | `0000_init.sql` | – |
| Generic `reject_mutation()` trigger | partial (naming) | `prevent_update_delete()` (also blocks TRUNCATE) | rename or record |
| `server/repos/_base.ts` scoped helpers | missing | services/authz query `db()` directly | repos + branded scope types |
| `src/lib/codes.ts` Crockford base32 + retry | missing | harness uses `Math.random` codes | implement (crypto, 5 retries on 23505) |
| AC: migrations apply to empty DB; re-run no-op | met | re-run no-op (journal 2 rows) | – |
| AC: UPDATE/DELETE on audit_logs errors in DB | met | `tests/integration/audit-log.test.ts`; `\d audit_logs` triggers | add TRUNCATE assertion |
| AC: code generator alphabet/length/retry | missing | – | – |
| Edge: PostGIS missing → clear message | missing | raw error | pre-check in migrate |
| Edge: expand-only on non-empty DB | missing | no policy/check | document + CI check |
| Test: integration unique constraints | missing | – | add |
| Test: unit code generator incl. 10k distribution | missing | – | add |
| ENG §6 every FK indexed | partial | `invited_by` ×2, `feature_flags.updated_by` unindexed | indexes |
| ENG §6 constraints in DB | partial | `sessions.mfa_verified` nullable; case-sensitive `users.email` unique | NOT NULL; `lower(email)` unique |
| ENG §8 `src/lib/time.ts` | missing | – | before P1 business-time rules |

### P0-04 · Background jobs — MISSING
No BullMQ/ioredis, no queue registry, no `enqueue`, no `failed_jobs` table, no scheduler, no heartbeat; `src/worker/index.ts` stub exits immediately on SIGTERM. All acceptance criteria and Redis integration tests missing.

### P0-05 · Security baseline — MISSING

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| `proxy.ts` with nonce CSP + SECURITY §5 headers | missing | prod `curl -I /`: no CSP/HSTS/nosniff/Referrer/Permissions/COOP; **`X-Powered-By: Next.js` present** | `src/proxy.ts`; `poweredByHeader:false` |
| `/dev/*` 404 in production | **partial — wrong status** | prod `/dev/ui` → **HTTP 200** with a not-found body (`notFound()` after streaming starts inside Suspense); `/api/dev/outbox` → 404 ✓ | gate in proxy with real 404 |
| Request ID | missing | – | proxy + logger |
| Redis sliding-window limiter, IP/user keys, 429 | missing | Better Auth limiter in-memory, prod-only | implement; Redis storage for Better Auth |
| `assertSameOrigin` | missing | – | implement + test |
| Turnstile component + verify | missing | env only | implement |
| pino logger with redaction | missing | `console.*` | `src/server/log.ts` |
| `audit()` writer | partial | `services/audit.ts` `recordAudit` (no PII stripping, not wired into actions) | wire into `defineAction` |
| AC: headers, nonce blocking, limiter + spoofing, redaction | missing | – | – |
| Tests: limiter, redaction, header snapshot, origin | missing | – | – |

### P0-06 · Authentication for all roles — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| Better Auth + Drizzle adapter | met | `auth.ts` | server-only |
| Google OAuth, state+PKCE, minimal scopes | partial | scopes set; untested (needs H-03) | – |
| Reject unverified Google emails | missing | library creates `emailVerified:false` users | DB hook reject + test |
| Magic link single-use, 15 min, **hashed token** | partial | single-use + 15 min ✓ (`auth-flows.test.ts`); token stored **plain** | `storeToken: "hashed"` |
| No customer passwords | met | `disableSignUp`; test | – |
| Argon2id, min 12 | met | `password.ts`, `password.test.ts` | – |
| HIBP with timeout, fail-open + warning | partial | plugin has no timeout and fails closed | own k-anonymity check with timeout |
| Mandatory TOTP before any dashboard access | partial | `mfaVerified` flag + policies; no route groups yet; **bypass via passkey (security #1)** | fix bypass; route-group guards (P0-12) |
| 10 hashed single-use recovery codes | partial | ≥10 asserted; stored encrypted; reuse untested | decide hash vs encrypted; reuse test |
| Passkeys (optional) | met (untested) | `auth.ts` | require user verification |
| Account-linking rule documented | partial | implicit default | explicit config + DECISIONS |
| `__Host-` cookies | missing | `moz` prefix / `__Secure-` | override cookie names |
| Idle timeouts 30d/12h/2h | partial (logged deviation) | staff/admin absolute limits in authz | acceptable as recorded |
| Rotation on sign-in and privilege change | partial | none on role change | revoke sessions on role change |
| Session list + sign out everywhere | missing | – | build |
| Return-URL allowlist, role-home fallback | partial | internal-path check; caller fallback; **dot-segment bypass (security #3)** | fix + role fallback |
| Throttling per SECURITY §6 + lockout email | missing | – | after P0-05 limiter |
| UI: sign-in with shop context, check inbox, expired/used page; staff sign-in, enrolment, challenge, recovery | partial | shop context and expired/used page missing | build |
| Magic-link email via React Email through Mailpit | missing | plain text console/memory; real providers throw | React Email + SMTP/Resend with timeout |
| Role switcher; default portal per role | missing | – | with P0-12 |
| AC: Google + magic link work; friendly reused/expired page | partial | magic link ✓; no friendly page; Google untested | – |
| AC: no staff/admin route before TOTP (per route group) | partial | actions ✓ via matrix; no route groups | P0-12 tests |
| AC: `https://evil.com`, `//evil.com`, `/\evil.com` fall back | met (with caveat) | `return-to.test.ts`; but `/.//evil` bypass found | fix |
| AC: identical response known vs unknown magic-link email | partial | library returns same body; no test; timing differs (inline send) | test + queue the email |
| AC: per-role session timeouts with injected clock | partial | staff/admin via `now`; customer untested | add |
| Edge: unverified Google / email casing / user deleted mid-session / TOTP ±1 step / recovery reuse | missing or untested | – | tests |
| Tests: link lifecycle, TOTP gate, recovery, return-URL, throttling, timeouts; E2E via Mailpit | partial | TOTP gate + link single-use ✓; E2E uses dev outbox | add |
| ENG §17 placeholder logic | partial | resend/brevo throw "wired once H-04 is done" | implement Resend now (key optional) |

### P0-07 · Authorisation layer, action template, error model — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| `requireCustomer/ShopRole/AdminRole` returning typed scope context | partial | plain strings, no branded IDs, no return types | branded contexts used by repos |
| `requireStaffAwardLimit` | missing | column exists | implement + test |
| `defineAction`: auth → authz → validate → rate limit → handler in tx → audit → Result | partial | validates **before** authenticating; no rate limit, transaction, audit or after-commit | rebuild in order |
| Route-handler equivalent | missing | – | `defineRoute` + origin check |
| AppError codes + one UK-English message map; `Result<T, AppErrorCode>` | partial | messages ad hoc; `LIMIT_REACHED`, `PLAN_RESTRICTED` missing; type named ActionResult | central map + codes |
| `tests/authz/` declarative matrix | met (shape differs) | 13 roles incl. no-MFA/inactive | tighten "allow" assertion (passes on INTERNAL) |
| `scripts/check-authz-coverage.ts` failing CI | partial | Vitest test, regex on `defineAction` only | script + route handlers + AST |
| AC: sample action demonstrates every step | partial | `setFeatureFlag` lacks rate limit; tx/audit outside template | after template rebuild |
| AC: matrix runner executes all role cases | met | 13 roles × 7 matrices pass | – |
| AC: coverage fails without entry, passes once added | met | demonstrated with a temporary action | – |
| Test: policy unit tests | met | `policies.test.ts` | add award-limit tests |
| Test: matrix self-test | partial | no negative self-test | add |
| ENG §3 repos-only DB access | missing | – | repos |
| ENG §5 unexpected errors logged with request ID / Sentry | partial | logs `err.name` only | pino + Sentry |
| ENG §2 exhaustive switch with `never` | partial | email provider switch | `assertNever` |

---

## Sub-phases P0-C, P0-D, P0-E (code-reviewer, 8 Nov 2026)

Commands run by the reviewer: `pnpm vitest run src/components src/styles src/lib` → 47 passed; `pnpm typecheck` ✓; `pnpm lint` ✓; Playwright `ui-gallery` + `smoke` → 8/8 (chromium, webkit, pixel-7, iphone-14); ad-hoc Playwright probes on `/dev/ui` (CLS, overflow at 320/390/1440, touch targets, press timing, tab order, focus ring, reduced motion, long-content injection).

### P0-08 · Tokens, fonts, global styles, motion preference — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| Every colour token in tokens.css | partial | `src/styles/tokens.css:7-28` has 14 colours + gradient; `--focus` missing | add `--focus`, use in focus rule |
| Space tokens | missing | no `--space-*` | add DESIGN §3 scale (4…96), map in `@theme` |
| Radius / shadow tokens | met | `tokens.css:31-39` | – |
| Motion tokens | partial | durations + easings present; spring (380/32), sheen 600ms, exit 160ms not tokens | add `--dur-sheen`, `--dur-exit`; TS motion-token module with spring |
| Tailwind reads CSS vars, no duplicated values | partial | `@theme inline` ✓; default palette not reset (`text-white`, `white` used in `Button.tsx`, `Badge.tsx`); `layout.tsx` repeats `#FBF8F1` | `--color-*: initial`; replace literals; one themeColor constant |
| Fraunces 500–650 / Manrope 400–700, Latin, swap | partial | `src/styles/fonts.ts` loads full variable ranges (Fraunces 67 KB preload) | DECISIONS entry or drop `opsz` |
| Preload only the above-the-fold heading weight | met | one preload link (Fraunces); Manrope `preload:false` | – |
| Base type scale | met | `globals.css` `@utility text-*` | – |
| Focus ring (ink + 2px gold outer) | partial | component shadows override the gold ring; `border-radius: inherit` reshapes elements | ring via box-shadow in a higher layer; remove radius inherit |
| `::selection`, tap highlight off, `touch-action` | met | `globals.css` base layer | – |
| `100dvh` / safe-area utilities | partial | only `pb-safe`/`pt-safe` | add `pl-safe`/`pr-safe` |
| `tabular-nums` utility, inputs ≥16px | met | `.tabular`, input rule | – |
| System reduced motion + user toggle (profile when signed in) | partial | localStorage only; `customer_profiles.reduce_motion` unused | sync to profile |
| `data-reduce-motion` on `<html>` | partial (naming) | implemented as `data-motion`; applied after hydration (`ApplyPreferences.tsx`) → one full-motion first paint | rename or record; inline head script before paint |
| `useMotionPreference()` | partial (naming) | `useReducedMotion()` boolean only, no consumers | `{pref, reduced, setPref}` |
| `useSoundPreference()` | missing | grep | build (localStorage → profile) |
| AC: `/dev/ui` token page lists every token | partial | colours + gradient only | add spacing/radius/shadow/motion/type sections from one token list |
| AC: contrast table on `/dev/ui` | missing | only `contrast.test.ts` (16 pairs); used pairs missing (white on danger 5.58, surface on ink 17.36, success on 6% tint 4.62, ink-3 placeholder on surface-2 3.08) | render table from shared PAIRS; add pairs |
| AC: CLS ≈ 0 on `/dev/ui` | met | measured 0 (320), 0 (390), 0.0095 (1440) | – |
| AC: toggles persist across reloads and sign-in | partial / missing | reload ✓ via localStorage; sign-in ✗; no toggle UI anywhere | toggles on `/dev/ui`, profile sync, E2E |
| Test: preference hook unit tests | partial | pure resolver/storage tested; hook not; no sound tests | renderHook tests |
| Test: visual snapshot of token page | missing | no `toHaveScreenshot` | add at 390 + 1440 |
| ENG: tokens only | partial | literals `globals.css` (600ms, rgba, `#faf5ea`, 160ms) | tokens |
| ENG: reduced motion = fades only | partial | durations shortened but toast/segmented/switch still translate | zero motion distance under reduced motion |

### P0-09 · UI primitives and gallery — PARTIAL

| Criterion | Status | Evidence | Fix needed |
|---|---|---|---|
| Button (variants, sizes, loading keeps width) | met | `Button.tsx` | size 40 < 44px hit area |
| IconButton | missing | – | build (44×44, required aria-label) |
| Card, HeroCard (foil) | met | `Card.tsx`, `.foil` | – |
| ShopCard | met | `ShopCard.tsx` | gold-700 12px caption (§13 rule deviation) |
| ProgressBar | met | `ProgressBar.tsx` | – |
| MilestoneTrack (static) | missing | – | build |
| Input / Textarea | met | `TextField.tsx` | `{...input}` spread can override `aria-describedby` |
| Select, Checkbox, Radio | missing | – | build |
| Switch | partial | 48×28 control | 44px hit area / whole row |
| Chip, SegmentedControl, Tabs, Badge | met | files present | 40px tall; `!` in Tabs/SegmentedControl |
| Table (sticky, density, empty + loading rows) | partial | sticky ✓ density ✓ empty ✓; no loading rows; clickable rows not keyboard-operable | loading prop; keyboard rows |
| KPI card + SVG sparkline | met | `KpiCard.tsx`, `Sparkline.tsx` | `text-[28px]` off scale; large-number overflow |
| BottomSheet (focus trap, swipe velocity, safe area, scroll lock) | missing | – | build |
| Modal, SidePanel | missing | – | build |
| Toast system (queue, live region) | partial | live region ✓; no queue — `slice(-2)` drops oldest silently | real queue; `role=alert` for errors; ref not getElementById |
| Skeleton, EmptyState | met | reduced motion → no animation | shimmer animates background-position (not transform) |
| ErrorState with retry (ENG §5) | missing | – | build |
| Avatar | missing | – | build |
| Icon wrapper | missing | lucide imported directly with repeated stroke | build `Icon` |
| Every state on `/dev/ui` (hover in fine-pointer query, focus, pressed, disabled, loading, error) | partial | hover gated by `(hover:hover)` only; disabled/error states missing for most controls | `@custom-variant hover-fine`; state matrix |
| AC: axe zero serious/critical | met | `tests/e2e/ui-gallery.spec.ts`, 4/4 projects | – |
| AC: logical tab order | met | measured sequence | – |
| AC: Esc closes overlays, focus return, focus trap | missing | no overlays | with BottomSheet/Modal |
| AC: touch targets ≥ 44×44 | **missing** | 15 elements too small at 390 (Button 40, Chip 40, Segmented 40, Switch 48×28, Table toggle 77×36) | 44px hit areas |
| AC: press scale .97 < 150ms | met | measured 0.97 at 135–142ms | real iPhone check later |
| AC: 320px no horizontal scroll | met (current content) | overflow 0 at 320/390/1440 | see edge cases |
| Edge: long/short text | partial | ShopCard only | cover others |
| Edge: very long words | **missing** | no `overflow-wrap`; injected long word → 112–122px overflow at 320 | `overflow-wrap:anywhere` base |
| Edge: large KPI numbers | **missing** | `£1,234,567,890.00` → 91px overflow at 320 | wrap/min-w-0/fluid size |
| Edge: empty values | missing | – | gallery + tests |
| Test: Button states | partial | loading only | disabled, variants, keyboard |
| Test: Input aria-describedby | met | `ui.test.tsx` | – |
| Test: BottomSheet focus trap / Modal focus return | missing | – | – |
| Test: Toast queue | partial | asserts dropping, not queueing | rewrite with queue |
| Test: Playwright axe | met | `ui-gallery.spec.ts` | – |
| Verify: screenshots 320/390 (Chromium+WebKit)/1440; design-reviewer pass | missing | screenshots only with SCREENSHOT_DIR; no review recorded | run + record |
| ENG §2 explicit return types | **missing** | ~25 exported components without return types | add + lint rule |
| ENG §2 no `!` | **missing** | `Tabs.tsx:43`, `SegmentedControl.tsx:34` | guarded lookups |
| ENG §2 exactOptionalPropertyTypes | missing | tsconfig | enable (P0-01) |
| ENG §9 small leaf client components / ≤300 lines | partial | `UiGallery.tsx` 361-line client component | server page + client islands |
| ENG §9 tokens only | partial | `text-white`, `white`, `text-[28px]`, `size-[22px]`, 700ms literal | tokens |
| ENG §1.4 authz/route test for `/dev/*` gate | missing | 404-in-production gate untested | test |

### P0-10 · Motion primitives and page transitions — MISSING
No `/dev/motion`, no `motion` dependency, no `startViewTransition`/`viewTransitionName`. All criteria missing (route transition wrapper, shared-element helper, directional tabs, sheet/modal/popover presets, stagger helper, reduced-motion variants, `/dev/motion`, tests, review-animations). Partial groundwork: `.pressable`/`.btn-gold` press + sheen in `globals.css`; CSS reduced-motion safety net. Spring token missing.

### P0-11 · Sound and haptics — MISSING
No `src/lib/sound.ts` / `haptics.ts`; no AudioContext / vibrate usage; no sound preference; no tests; no 🟢 listen-check HUMAN_TASKS item.

### P0-12 · App shells, navigation and route groups — MISSING
Only `(public)`, `api`, `dev` route folders; no `loading.tsx`/`error.tsx`/`not-found.tsx`/403 anywhere; no shells, nav, role switcher, route-level authz, E2E or snapshots. Layout tokens exist (`tokens.css`).

### P0-13 · Observability and analytics — MISSING
No Sentry, no `/api/health`, no analytics, no cookie notice, no tests.

### P0-14 · CI pipeline — MISSING
No `.github/workflows`. (`playwright.config.ts` is already CI-aware.) No branch-protection HUMAN_TASKS item.

### P0-15 · Staging and deployment — MISSING
No Dockerfile, Caddyfile, staging compose, deploy/rollback/bootstrap scripts. Only the `/dev` production gate exists (untested).

### P0-16 · Seeds and factories — MISSING
No factories (except `tests/fixtures/auth.ts`), no `db:seed`/`db:reset` scripts (CLAUDE.md §7 lists them), no idempotency test.

### HIGH findings (P0-C…E)
1. Touch targets < 44px (Button 40, Chip, SegmentedControl, Switch, Table toggle).
2. Long words / large KPI numbers overflow at 320px (no overflow-wrap; KpiCard/EmptyState/TextField label).
3. Clickable table rows not keyboard-operable (`Table.tsx` `onClick` on `<tr>`).
4. Ten DESIGN §6 primitives missing → overlay keyboard criteria and tests missing.
5. Motion preference not synced to profile; sound preference missing; no toggle UI.
6. Contrast table not on `/dev/ui`; used pairs missing from the test.
7. No visual snapshot tests.
8. ENG §2: `!` in Tabs/SegmentedControl; ~25 missing return types; exactOptionalPropertyTypes off.
9. Toast drops the oldest message silently (no queue).
10. No code-reviewer/design-reviewer pass recorded for P0-C.

---

## Security and compliance review (security-reviewer, 8 Nov 2026)

Verdict: authorisation design sound, deny-by-default policies well tested; **one critical MFA bypass and three fail-open configuration issues** to fix before any staff/admin account is live. Checks run: vitest (135 tests ✓), `pnpm audit --prod` (clean); OSV/Semgrep/gitleaks not installed (not run); two proof-of-concept tests against the test DB (kept outside the repo).

| # | Finding | Severity | File | Evidence | Recommended fix |
|---|---|---|---|---|---|
| 1 | **Staff/admin MFA bypass:** magic link or Google sign-in → register a passkey → passkey sign-in sets `mfaVerified=true` (skips password and TOTP) | **critical** | `src/server/auth/auth.ts`, `src/server/auth/mfa.ts` | PoC: TOTP-enrolled staff signs in by magic link (session mfaVerified=false); `/passkey/generate-register-options` returns 200 for that fresh session; passkey path is in `MFA_SESSION_PATHS`. Google auto-links verified emails to existing users. | (a) refuse magic link + Google for users with staff/admin roles or a credential account (generic 200, no enumeration); (b) passkey registration requires an MFA-verified session; (c) integration tests |
| 2 | Fail-open env defaults: `APP_ENV` defaults to `local`, `APP_URL` to http → a misconfigured deploy exposes the dev outbox (read anyone's magic link), testUtils, console email, `/dev/*`, non-Secure cookies | high | `src/server/env.ts`, `src/app/api/dev/outbox/route.ts`, `auth.ts` | schema defaults; no NODE_ENV/APP_ENV cross-check | `APP_ENV`/`APP_URL` required; throw if NODE_ENV=production with local/test; https outside local/test; drop REDIS_URL default credential; testUtils only in a test-only instance |
| 3 | Open-redirect bypass in `safeReturnTo` via dot-segments (`/.//evil.example/x` → `//evil.example/x`), followed by `router.push` after 2FA | medium | `src/lib/return-to.ts`; `StaffSignInForm.tsx`, `EnrolTotp.tsx` | tsx run | reject when normalised pathname starts with `//`; add the cases to tests |
| 4 | Magic-link tokens and recipient emails written to logs wherever `EMAIL_PROVIDER=console` (staging allowed today) | medium | `src/server/integrations/email/index.ts`, `env.ts` | console.warn prints URL | console provider only in local/test; elsewhere real provider or redacted sink |
| 5 | First-enrolment takeover: password-only session can enrol TOTP and the enrolment verify immediately mints an MFA session | medium | `mfa.ts`, `EnrolTotp.tsx` | PoC session rows `[true,false]` | tie enrolment to invite flow, or count MFA only for challenge-cookie verifies; expire un-enrolled staff |
| 6 | Passkey counts as MFA without user verification (`preferred` default) | medium | `auth.ts` passkey config | no `authenticatorSelection` | `userVerification: "required"` |
| 7 | Append-only audit trigger bypassable by the table owner (app uses owner role) | medium | `drizzle/0001_*.sql`, `.env.example` | same role for app and migrations | separate DB roles; app role INSERT/SELECT only on append-only tables |
| 8 | Better Auth account endpoints (`/list-sessions`, `/revoke-*`, `/link-social`, `/update-user`) usable by non-MFA or stale staff sessions | medium | `auth.ts`, `authz/policies.ts` | Better Auth routes bypass `requireShopRole` | mostly closed by 1(a); hooks.before for staff/admin; per-role session expiry at creation |
| 9 | Rate limiting only in NODE_ENV=production, in-memory, keyed on spoofable `x-forwarded-for` | medium (known gap) | `auth.ts` | Better Auth defaults | Redis-backed `rateLimit` with SECURITY §6 limits; trusted IP header |
| 10 | Origin/CSRF checks disabled under `NODE_ENV=test`, so tests never exercise them | low | `auth.ts` | PoC: foreign callbackURL accepted under vitest | `disableOriginCheck:false`; tests for foreign Origin/callbackURL → 403 |
| 11 | Backup codes encrypted (not hashed) and compared non-constant-time | low | `auth.ts` | plugin default | hash them, or accept + DECISIONS |
| 12 | Deny reason order leaks shop membership (`forbidden` vs `mfa_required`) | low | `authz/policies.ts` | check order | check MFA/age before membership, or same reason |
| 13 | `/two-factor/verify-otp` in MFA paths though OTP isn't configured | low | `mfa.ts` | – | remove |
| 14 | No `server-only` imports in `src/server/**` | low | `src/server/**` | grep | add `import "server-only"` |
| 15 | Authz coverage guard only detects `export const x = defineAction(` | low | `tests/authz/coverage.test.ts` | regex | scan all `"use server"` exports and mutating route handlers |
| 16 | Session tokens stored in plaintext (Better Auth default) | low | `schema/auth.ts` | – | accept + DECISIONS, or Redis secondary storage |
| 17 | `.claude/settings.json` permissive (`node:*`, `pnpm:*`, `cat` can read `.env`) | low (tooling) | `.claude/settings.json` | allow list | **human decision** — not changed by Claude |
| 18 | `hashIp` reuses `AUTH_SECRET` as HMAC key | low | `src/server/services/audit.ts` | key reuse | dedicated `AUDIT_IP_HMAC_KEY` |

**Checked OK:** runAsPrincipal/currentPrincipal throw outside `APP_ENV=test` (safe once #2 is fixed); `mfaVerified` cannot be set via `/update-session`; identical error/status + dummy Argon2 hash for unknown email vs wrong password; public sign-up disabled; magic links single-use, 15 min, non-MFA; Argon2id OWASP params, 12–128 chars, HIBP on; Google scopes minimal; no raw SQL or dangerouslySetInnerHTML; actionTemplate leaks nothing; `.gitignore` and git history clean; Docker binds 127.0.0.1; `/dev/*` 404 in production.

### SECURITY.md checklist (P0-applicable)

| § | Item | Status |
|---|---|---|
| 2 | Customer Google OAuth + single-use 15-min magic link | done |
| 2 | Staff Argon2id, ≥12 chars, HIBP | done (HIBP applies once a password-set flow exists) |
| 2 | Mandatory TOTP/passkey for staff/admin | **partial — bypassable (#1, #5, #6)** |
| 2 | 10 hashed single-use recovery codes | partial (encrypted, not hashed) |
| 2 | Admin 2FA every session; IP allowlist | partial (allowlist not enforced) |
| 2 | No account enumeration | done |
| 2 | Login throttling + lockout email | missing |
| 2 | Re-auth for sensitive actions | missing (none yet) |
| 2 | Sign out all devices, session list | missing (UI) |
| 3 | Central require* policies; deny by default; UUIDv7 + random codes | done |
| 3 | Authz matrix in tests | done (guard narrow, #15) |
| 4 | Zod strict; parameterised SQL; no dangerouslySetInnerHTML | done |
| 4 | Return-URL allowlist | **partial — bypass (#3)** |
| 5 | `__Host-` cookies, Secure, rotation, per-role idle timeouts | partial |
| 5 | CSRF / origin checks | partial (#10) |
| 5 | CSP nonce + security headers | missing |
| 5 | `/dev/*` 404 in production | done (depends on #2) |
| 6 | Redis sliding-window limits; Turnstile | missing |
| 7 | Field-level phone encryption | partial (columns/env only) |
| 7 | No PII/tokens in logs | **partial (#4)** |
| 9 | Keys server-side; minimal OAuth scopes | done (no server-only guard, #14) |
| 10 | Lockfile; `pnpm audit` | done locally, not in CI |
| 10 | OSV, Semgrep/CodeQL, gitleaks, Renovate, SBOM | missing |
| 11 | Separate DB roles | missing (#7) |
| 12 | Audit log append-only | partial (owner can bypass) |
| 12 | Audit staff/admin sign-ins, role changes | partial |
| 12 | Structured logging + alerts | missing |

COMPLIANCE.md: nothing applicable at P0 yet.

---

## Design review (design-reviewer, 8 Nov 2026)

Overall: token layer faithful to DESIGN §3/§4/§7 (colours, radii, shadows, motion tokens, Fraunces/Manrope, type scale, 16px inputs); press scale .97/120ms verified live; no horizontal overflow at 320px. Highest-impact problems: focus ring wrong on every element type, ShopCard truncates the demo name on phones, auth screens bypass the primitives. Screenshots at 320×640 (Chromium), 390×844 (Chromium + WebKit), 1440×900. No reference images exist in design/reference/.

| Finding | Severity | Where | Evidence | Fix |
|---|---|---|---|---|
| Focus ring inverted (gold inside, ink offset outside); gold lost entirely on primary buttons (`.btn-gold` shadow wins) | high | `src/app/globals.css` focus rule + `.btn-gold` | computed styles on focus | box-shadow ring `0 0 0 2px ink, 0 0 0 4px gold-500` + transparent outline for forced colours; `.btn-gold:focus-visible` keeps shadow-gold + ring; drop `border-radius: inherit` |
| Auth inputs show only a 2px gold-500 ring (~2.3:1, below 3:1 for focus indicators) | high | `src/features/auth/AuthCard.tsx` `inputClass` | computed `outline:none` + gold ring | use `<TextField>` |
| Auth screens skip primitives: flat `bg-gold-500` button, default 150ms easing, label swap causes width shift, no spinner | high | `AuthCard.tsx`, `CustomerSignInForm.tsx`, `StaffSignInForm.tsx`, `EnrolTotp.tsx`, `SignOutButton.tsx` | screenshots + computed transition | `<TextField>`, `<Button block loading>` |
| Sign-in is a generic centred card on all sizes; not DESIGN §15 screen 2 (shop context, desktop split with ingot art), no brand mark | high (interim) | `AuthCard.tsx` | 1440 screenshot: 400px card in empty ivory | build §15-2 split layout; full-bleed mobile, top-anchored; shop header when coming from a shop |
| ShopCard truncates "Brew & Bloom Café" on phones (badge shares the name row) | high | `src/components/ui/ShopCard.tsx` | 390: "Brew & Bloom C…", 320: "Brew & …" | badges on their own row below `lg`, or `line-clamp-2` name |
| Ink on left end of gold gradient slightly below AA (4.36–4.42:1) | medium | `globals.css` `.btn-gold` | pixel sampling behind labels | `background-size:160%`, start ~15–20%; re-measure |
| Touch targets < 44px: Chip 40, Segmented 40, Button 40, Table toggle 36, Switch 48×28, "Use a backup code" ~20px | medium | `Chip.tsx`, `SegmentedControl.tsx`, `Button.tsx`, `Table.tsx`, `Switch.tsx`, `StaffSignInForm.tsx` | live measurement | extend hit area to 44px (pseudo-element / `min-h-11` on touch); whole switch row clickable |
| gold-700 used for small text (§13 allows large text/icons only) | medium | `ShopCard.tsx` caption, `UiGallery.tsx`, `StaffSignInForm.tsx` link | screenshot | ink-2 for captions/small links |
| Skip link loses padding when shown (`focus:not-sr-only` resets it) | medium | `src/app/layout.tsx` | focus screenshot | `focus:px-4 focus:py-2 focus:min-h-11` |
| Label/field spacing ambiguous in auth forms | medium | auth forms | 320 screenshot | `<TextField>` in a `gap-5` stack |
| Disabled input looks enabled | low | `TextField.tsx` | screenshot | `disabled:opacity-55 disabled:cursor-not-allowed` |
| Hard-coded colours (`#faf5ea`, rgba shadow, `white`, `text-white`, QR hex) | low | `globals.css`, `Badge.tsx`, `Button.tsx`, `EnrolTotp.tsx` | grep | tokens (`--surface`, `text-surface`, computed ink/surface for QR) |
| Hover gating inconsistent (`(hover:hover)` only, or bare `hover:`) | low | `Button.tsx`, `Tabs.tsx`, `Table.tsx`, `StaffSignInForm.tsx` | grep | custom variant `hover-fine` = `(hover:hover) and (pointer:fine)` |
| Reduced motion: toast still slides 12px; spinner freezes after one turn (iteration-count:1 net) | low | `globals.css`, `Spinner.tsx` | probe | toast fade-only under reduced motion; exempt spinner or use opacity pulse |
| Loading button dims to 55% (aria-disabled styling) | low | `Button.tsx` | screenshot | opacity only when `disabled` |
| Suspense fallbacks use `animate-pulse` instead of `.skeleton` | low | sign-in / staff pages | code | `<Skeleton>` |
| "Check your email" state lacks "Use a different email"/resend; Google button branding unchecked | low | `CustomerSignInForm.tsx` | code | add action; follow Google button guidelines |
| No manifest / apple-touch-icon / public assets | low (P5) | `src/app/layout.tsx` | `ls public` | P5 PWA |
| Copy tone UK English, warm, short | ok | — | — | — |
| Gold area ≤10% (sign-in ~4.4%) | ok | — | — | — |

**Missing DESIGN §6/§7 components:** Ingot (P1), MilestoneTrack, BottomSheet, Modal, SidePanel, Member card (P1), Checkbox, Charts (later), Google sign-in button, `motion` package not installed.
