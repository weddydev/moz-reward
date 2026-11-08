# PROGRESS — read this first every session

_Keep under ~150 lines. Overwrite sections; move history to SESSION_LOG.md._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-08 17:36

## Handoff note
_Overwritten by `/handoff`. The next developer reads this first._
- **Handed over by:** talha.syed, 2026-11-08 17:34
- **Finished (on `main`):** kit v2 audit (`progress/AUDIT.md`: 0 met / 7 partial / 9 missing, 1 critical MFA bypass) and kit v3 merge (P0-17 added, `/subphase-complete`, TESTING §7–8, H-18). `main` = `415686a` + this note. No code changed on `main` since the last green run.
- **Half-done — P0-17 test infrastructure, on branch `wip/p0-17-test-infra` (`f5b6b3d`, pushed):**
  - Built: Mailpit + MinIO in `docker-compose.yml`; fail-closed `src/server/env.ts` (`APP_ENV`/`APP_URL` required, local/test only on localhost, https elsewhere, `parseServerEnv` + `env.test.ts`); email providers SMTP (→ Mailpit) / Resend / Brevo with timeouts (console provider + `/api/dev/outbox` removed); `src/lib/codes.ts` (test-first, 8 tests pass); Vitest projects `unit` + `integration` (per-worker DBs `moz_test_w1..4` cloned from migrated `moz_test_template`, per-file truncation, `tests/support/db.ts`); factories `src/server/testing/factories.ts` (+ `makeActor(role)`); seeding API `src/app/api/test/[action]/route.ts` (`POST /api/test/session {role}`, 404 unless `APP_ENV=test`); `tests/support/mailpit.ts`, `storage.ts`; isolation demo `tests/integration/isolation-a/b.test.ts`; auth/authz tests migrated (Mailpit, factories, `[P0-xx]` titles); testUtils now only in `APP_ENV=test`.
  - **Failing:** `pnpm exec vitest run --project integration` — every authz matrix case and "creates an actor and an MFA-verified staff session" fail. Not diagnosed yet. First look: `tests/authz/harness.ts` line ~63 still has a leftover `.insert(shopStaff)` from before the factory migration (imports were removed) — fix that, then re-run and read the first real error.
  - **Not started in P0-17:** Playwright fixtures (console/network guard, `signInAs(role)` via `/api/test/session`, clock, `shoot()` to `.artifacts/screens/<task>/`, Mailpit asserts), Playwright projects `chromium/webkit/pixel7/iphone14/desktop1440` + test web server on port 3100 with `APP_ENV=test` and its own DB (plan: `distDir` from env so it can run beside `pnpm dev`), `/dev/guard-check` page + guard self-test (`test.fail()`), fakes for push/AI/postcodes/Places + S3 storage provider (MinIO) with integration test, Stryker config (rules modules: `authz/policies.ts`, `lib/return-to.ts`, `lib/codes.ts`), `tests/load/` k6 skeleton, scripts `test:int`, `test:regression` (per-suite counts), `test:mutation`, `test:load:smoke`, `test:live`, test-title check script; migrate `tests/e2e/*.spec.ts` (still use the removed `/api/dev/outbox`) onto the fixtures; DECISIONS entries (Chainguard MinIO image pinned by digest, SMTP/Mailpit replacing console email, test API in prod bundle but 404-gated).
- **Tested:** on the WIP branch, `src/lib/codes.test.ts` 8/8 ✅; integration project ❌ (see above). On `main`: last full run `pnpm check` 170 ✅ and e2e 12/12 ✅ at `f92b32f`; nothing in code changed since.
- **Not yet tested:** Google OAuth (H-03), passkeys on a real device, Resend/Brevo for real (H-04), the whole WIP branch end to end.
- **Do first on the other laptop:**
  1. `git pull` on `main`, run `/resume` (it will show this note), then `git checkout wip/p0-17-test-infra` to continue P0-17.
  2. `pnpm install --frozen-lockfile` (new deps on the branch: nodemailer, @aws-sdk/client-s3).
  3. `docker compose up -d --wait` (branch adds Mailpit :1025/:8025 and MinIO :9000/:9001).
  4. `.env.local`: copy the shared one (H-02) and add/align from `.env.example` on the branch: `EMAIL_PROVIDER=smtp`, `SMTP_HOST=localhost`, `SMTP_PORT=1025`, `MAILPIT_API_URL=http://localhost:8025`, `S3_ENDPOINT=http://localhost:9000`, `S3_REGION=auto`, `S3_ACCESS_KEY_ID=moz`, `S3_SECRET_ACCESS_KEY=moz-minio-local`, `S3_BUCKET=moz-rewards`, `S3_FORCE_PATH_STYLE=true`, `S3_PUBLIC_BASE_URL=` (remove old `R2_*`). Note: `main`'s code still expects `EMAIL_PROVIDER=console` — use `smtp` only on the WIP branch.
  5. Install GitHub CLI + `gh auth login` (H-18).
  6. When P0-17 is green: merge the branch into `main` (fast-forward or merge commit), push, delete the branch, tick P0-17 only with evidence for every criterion, then continue the fix plan below.

## Status
- **Phase:** P0 — Foundation and design system. Kit upgraded to 16 task briefs; audit done (`progress/AUDIT.md`): 0 fully met, 7 partial (P0-01/02/03/06/07/08/09), 9 missing. Fixing gaps in task order.
- **Last updated:** 2026-11-08 17:34 handoff, talha.syed
- **Staging:** not deployed yet
- **Production:** not deployed

## Now
- P0-17 test infrastructure on branch `wip/p0-17-test-infra` (see Handoff note): fix failing integration project, then finish Playwright fixtures/guard, fakes, scripts, migrate e2e specs.

## Next (top 3)
1. Finish P0-17 and merge to `main` (criteria: parallel isolation demo, console guard fail→pass, `/api/test/*` 404 outside test, `pnpm test:regression` per-suite counts).
2. Security hotfix from the audit: block staff/admin MFA bypass (magic link/Google → passkey) — refuse magic link + Google for staff/admin accounts, require MFA session to register passkeys, `userVerification: "required"`; fix `safeReturnTo` dot-segment bypass. (Fail-open env + dev outbox are already fixed on the WIP branch.)
3. Then fix audit gaps in task order P0-01 → P0-09 (see `progress/AUDIT.md` "Fix plan"), each with evidence, then P0-04/05, then P0-10+. Close sub-phases only with `/subphase-complete`.

## Blockers
- Human: 🔴 H-19 (Windows laptop: local PostgreSQL services hold port 5432, so Docker Postgres can't start) and 🔴 H-02 (`.env.local` not yet on the Windows laptop). Both block all tests and P0-17 there. 🟠 for end of P0: H-07 domain, H-06 VPS, H-05 Neon, H-03 Google OAuth, H-04 Resend, H-10 Sentry.
- Technical: audit HIGH findings tracked in `progress/AUDIT.md` (top risks section). Old PHASES ticks are void; nothing ticked until every criterion has evidence.

## Map of the codebase
- `src/app/` — Next.js App Router (Next 16: `proxy.ts` not middleware; async request APIs; read `node_modules/next/dist/docs/`)
- `src/worker/index.ts` — worker entry (stub; BullMQ is P0-04)
- `progress/AUDIT.md` — per-task audit vs `docs/phases/P0.md` (criterion / status / evidence / fix); `docs/phases/*.md` = task briefs; `docs/ENGINEERING.md` = definition of done
- `tests/setup.ts` — Vitest setup (jest-dom); unit tests live next to code as `*.test.ts(x)`
- `tests/e2e/` — Playwright specs (chromium, webkit, pixel-7, iphone-14)
- `docker-compose.yml` — local Postgres 17 + PostGIS 3.5 (`moz`, `moz_test` DBs) and Redis 7 (password `moz`); init SQL in `infra/local/`
- `.env.local` — generated locally from `.env.example` with random secrets (never committed; share via H-02)
- `src/server/db/` — Drizzle client (`db()`), schema (`schema/auth.ts` Better Auth tables, `schema/core.ts` domain), `migrate.ts`
- `drizzle/` — SQL migrations (0000 init, 0001 append-only trigger `prevent_update_delete()`)
- `src/server/env.ts` — Zod-validated server env (`env()`); `src/server/integrations/email/` — console/memory/real providers
- `src/server/auth/` — Better Auth instance `auth.ts` (Google, magic link, staff password Argon2id, TOTP, passkey, HIBP, testUtils in local/test), `session.ts`, `mfa.ts`
- `src/server/authz/` — pure `decide*` policies + `requireCustomer/requireShopRole/requireAdminRole` (MFA + 12 h/2 h limits)
- `src/server/actionTemplate.ts` — `defineAction({input, authorize, handler})`; `src/server/errors.ts` AppError
- `src/features/auth/` + `src/app/(public)/sign-in`, `/staff/sign-in`, `/staff/security` — sign-in UI (temporary styling)
- `src/app/api/auth/[...all]` Better Auth handler; `src/app/api/dev/outbox` dev-only email reader
- `tests/authz/` — matrix harness (`authzMatrix`, 13 roles, `runAsPrincipal`), coverage guard, probes; add a `*.authz.test.ts` for every new action
- `src/server/services/` — `audit.ts` (recordAudit, hashIp), `flags.ts` (feature flags + FLAG_* env override); `src/features/flags/actions.ts` setFeatureFlag
- `tests/fixtures/auth.ts` — `createPasswordUser`, `totpFromUri`, `testEmail`
- `tests/integration/` — DB-backed tests (test DB `moz_test`, migrated by `tests/global-setup.ts`)
- `src/styles/tokens.css` (DESIGN tokens, reduced-motion retuning), `src/app/globals.css` (Tailwind `@theme inline` mapping + type-scale utilities `text-display/h1/h2/h3/body/small/caption`, `bg-gold-gradient`, `duration-fast/base/slow`, `pb-safe`), `src/styles/fonts.ts` (Fraunces + Manrope); `contrast.test.ts` guards WCAG pairs
- `src/lib/motion-preference.ts` — `useReducedMotion()`, `setMotionPreference()` (`<html data-motion>`); applied by `components/system/ApplyPreferences`
- `src/components/ui/` — design-system primitives (barrel `index.ts`), tests in `ui.test.tsx`; `src/lib/cx.ts`
- `src/app/dev/` — dev galleries (404 in production); `/dev/ui` = `src/features/dev/UiGallery.tsx`
- Configs: `vitest.config.mts`, `playwright.config.ts`, `eslint.config.mjs`, `.prettierrc.json`, `pnpm-workspace.yaml` (allowed install scripts)

## Last verified
- `pnpm check`: ✅ 2026-11-08 (170 tests)
- Gallery E2E: ✅ 2026-11-08 axe (no serious/critical) + no horizontal overflow on chromium, webkit, pixel-7, iphone-14
- Screenshots: ✅ 2026-11-08 home + sign-in, Pixel 7 + desktop: Fraunces/Manrope loaded, ivory bg, focus ring visible
- `pnpm db:migrate` + `drizzle-kit check`: ✅ 2026-11-08, no drift
- `pnpm build`: ✅ 2026-11-08 (checkpoint, after authz harness)
- `pnpm e2e`: ✅ 2026-11-08 12/12 (smoke, magic link, staff TOTP enrol + sign-in) on chromium, webkit, pixel-7, iphone-14
- CI on main: — (not set up yet)
- Staging deploy: —
- E2E smoke on staging: —

## Open questions / assumptions
- Not yet tested: Google OAuth (needs H-03), passkey sign-in (needs a real device), real email provider (needs H-04).
- Domain name not chosen yet (H-07); staging URLs written as `staging.<domain>` until then.
