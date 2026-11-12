# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by talha.syed, 2026-11-12 06:33 IST (macOS)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handoff by talha.syed, 2026-11-12 06:33 IST (macOS).** The P0-C sub-phase close is **not** done. P0-08, 09, 10 and 11 are ticked and on `main`; P0-C close (`/subphase-complete`) is pending.
- **Finished on `main`:** P0-10 (`ee83173`, squashed), P0-11 (`72b668a`), with the design re-review and the code review (APPROVE WITH FIXES, 0 BLOCK) done at task level.
- **Half-done, pushed to branch `wip/P0-C-close` (HEAD `85335e9`, NOT on main):** the review and QA fix batch (`85335e9`): sound unlock on pointerup/touchend/click (not touch-down) and never scheduling on a suspended context; the slide clip kept on a quick second navigation; overlays ignore the tail of a double-click on their trigger (300 ms backdrop guard); every toast fired in the same moment is announced; a preference changed while the profile is unreachable stays pending; Table observes the `<table>`; overlay trigger tracking installed at module load; the slow demo page with its loading state; stagger chips disabled before hydration; gallery intro spacing; Escape/Shift/Control/Alt/Meta are not audio gestures.
- **How to continue:** (1) `git fetch && git checkout wip/P0-C-close && git pull`; (2) `pnpm install --frozen-lockfile && pnpm db:migrate` (migration 0013, preferences, is on main); (3) `pnpm e2e tests/e2e/overlays.spec.ts tests/e2e/motion.spec.ts tests/e2e/sound.spec.ts tests/e2e/motion-primitives.spec.ts --reporter=line`: the new double-click, slow-page, second-slide and toast tests have **not** been run in E2E yet; fix any failure at its root; (4) full `pnpm e2e` (the trigger tracker, Overlay and Toast change every page); (5) add the SESSION_LOG line `code-review done 72b668a` and the P0-C close entry; `git checkout main && git merge --squash wip/P0-C-close`, commit, tick the P0-C line in PHASES.md, push; (6) then start P0-12.
- **Exact stop point (the session was force-stopped here):** every fix in `85335e9` was written and its *unit* tests were green (`pnpm test:unit` 832/0, run after the last edit to `Overlay.tsx`, `Toast.tsx` and `sound.ts`). Stopped before the E2E run. The last actions were: the unit tests for the key filter and toast announcements went red, were fixed, and the full unit suite went green; then the batch was committed and pushed. Nothing is half-written in the tree; `git status` is clean on both branches.
  - **Check first:** `tests/e2e/overlays.spec.ts` `[P0-09] … page behind is inert and locked; axe clean while open` clicks the backdrop straight after opening. The new 300 ms backdrop guard may make that click do nothing, so expect it to fail until that test waits ~300 ms (or clicks after `settle`). This is a test to update, not a reason to drop the guard.
  - **Written, never run in E2E:** `overlays.spec.ts` double-click tests (×3 demos), `motion.spec.ts` slow-page, second-slide clip, tab-hidden and query-change tests, `sound.spec.ts` changes, `motion-primitives.spec.ts` section list (now 8 titles).
- **Tested:** on `wip/P0-C-close` `85335e9`: `pnpm test:unit` 832/0; `gate:task` PASS (unit 818 in the gate run, int 475, build, bundle, sast, E2E P0-11 6/0). Earlier on `main` `72b668a`: full 5-project E2E 646 passed / 0 failed / 169 skipped by design; `gate:task P0-11` PASS. CI `43129226265` (workflow_dispatch on `72b668a`): **success**.
- **Not yet tested:** the E2E of the fix batch (above); CI on `wip/P0-C-close`; real-device sound and haptics (H-37); the QA checks on iPhone WebKit for background scroll lock and touch-scroll (NOT VERIFIED by QA); staging (none until P0-15).
- **CI state:** the Actions major outage (12 Nov, ~00:30–01:50 UTC) left push runs `43098330001` (`72b668a`), `43096958119` (`ee83173`), `43096702111` and `43095228870` (wip) queued with no jobs. They cannot be cancelled. If they are still queued, ignore them and use the workflow_dispatch run as evidence; do not push a second time just to re-trigger.
- **Next person must do first:** nothing new in `.env.local`; run `pnpm install --frozen-lockfile` and `pnpm db:migrate`. No seed changes.

## Status
- **Phase:** P0. Done: P0-01…07, P0-14, P0-17, P0-19, P0-18, P0-20, P0-13, P0-21, P0-16, P0-08, P0-09, P0-10, P0-11. Next: P0-C close (on `wip/P0-C-close`), then P0-12 (P0-D); P0-15 waits on human tasks.
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → ~~P0-18~~ → ~~P0-20~~ → ~~P0-13~~ → ~~P0-21~~ → P0-15 → ~~P0-16~~; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-12 06:33 IST, talha.syed (P0-10 and P0-11 on main; P0-C close pending on wip/P0-C-close)
- **Staging and production:** one Hostinger VPS (P0-15; needs H-06, H-07, H-08, H-26, H-27) — not provisioned yet

## Now
- **P0-C close in progress on `wip/P0-C-close`** (`85335e9`, pushed): code review done on `72b668a` (APPROVE WITH FIXES, 0 BLOCK; HIGH and MEDIUM fixed, one MEDIUM documented as a CARRIED row); design re-review done; exploratory QA done (one MAJOR and one MINOR fixed in the batch; the rest in follow-ups). E2E of the batch not yet run.
- P0-10 and P0-11 done on `main`. CI on `main` `72b668a`: success (`43129226265`).
- P0-15 is the only P0-E task left and waits on H-06/07/08/26/27.

## Next (top 3)
1. **Finish the P0-C close** on `wip/P0-C-close`: E2E of the batch (new tests first), full `pnpm e2e`, SESSION_LOG `code-review done 72b668a`, squash to main, tick P0-C in PHASES, push.
2. **P0-12** app shells, navigation and route groups (CARRIED C-01, C-02, C-04, C-05, C-24 land here; security-reviewer design check first: P0-12 is on the security list; Popover-in-overlay C-39 is not needed until P1).
3. **P0-15**: VPS + staging (+ C-19, C-21, C-23, C-27, C-32, C-33, C-35, C-36, C-37, C-38); waits on H-06/07/08/26/27 (+ H-34 Sentry, H-36 demo inbox).

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-01 | P0-06 | P0-12 | No staff/admin route before TOTP, tested per route group | authz route-group tests |
| C-02 | P0-06 | P0-12 | Role switcher; default portal per role | E2E |
| C-04 | B-CR-11 | P0-12 | `error.tsx` / `not-found.tsx` per route group | E2E |
| C-05 | B-QA-6, B-QA-7 | P0-12 | Signed-in staff on /staff/sign-in redirected; /wallet and /dashboard exist after sign-in | E2E |
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-24 | B-SEC-13 (P0-19) | P0-12 | `ADMIN_IP_ALLOWLIST` (parsed, not yet enforced) applied to admin sign-in and the admin route group when set; a request from outside it gets the same answer as a wrong password / the 403 page | integration + E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-32 | P0-20 | P0-15 | Postgres bootstrap creates moz_app/moz_auth/moz_worker logins, moz_rls NOLOGIN WITH ADMIN to a non-superuser migration owner (boot asserts NOLOGIN), PostGIS revokes re-applied; four URLs only in their containers; staging max_connections 80; RLS EXPLAIN on staging data | staging boot + DECISIONS |
| C-33 | P0-20 review | P0-15 | Boot asserts each DB URL is its expected role (pg_has_role) and web logins can't SET ROLE worker/auth | integration |
| C-34 | P0-20 review | P1-01 | Checker fails moz_app `USING (true)` without reason marker; global marker only in the creating migration; adminRead enforced; membership counter column grants | lint test + integration |
| C-27 | P0-18 | P0-15 | Worker container stop grace ≥ 75 s (60 s drain); bundled worker keeps the `server-only` hook (emails render) | staging deploy log + worker-process test |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-36 | P0-13 review | P0-15 | Caddy proxies only `/u/script.js` + `/u/api/send` to Umami; dashboard on its own host behind auth | staging curl `/u/` → 404 |
| C-37 | P0-13 AC4 | P0-15 | RUNBOOK §4 deploy, §5 rollback, §9 key rotation, §12 disk, §13 Tunnel walked once on staging | deploy/rollback logs + SESSION_LOG |
| C-38 | P0-16 | P0-15 | Staging release runs `db:seed` as moz_worker with `DEMO_EMAIL_BASE` (exit 0 incl. the TOTP check); weekly `db:seed --reset` + RUNBOOK line; slim image can run `db:seed` / `demo:credentials`; demo owner password alone → challenge, enable 401 on staging | deploy log + staging curl |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: none.
- 🟠 (needed by Sun 15 Nov for P0-15): H-06 Hostinger VPS, H-07 domain + Cloudflare, H-08 R2 buckets, H-26 backup key, H-27 UptimeRobot, H-04 Resend + Brevo, H-20 Turnstile, H-28 staging OAuth, H-34 Sentry, H-36 demo inbox, H-31 Renovate app, H-21 client's written risk acceptance, H-17 permissions. **Start now:** H-12 Play organisation account. **H-37** (🟠, before P1-06): iPhone + Android listen and vibrate check.
- Technical: CI queue stalled during the Actions outage (see handoff). Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts` + `attempt-guard.ts` (atomic lockout), `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/authz/` — `decide*` policies, `require*` (incl. `requireStaffAwardLimit`, `requireOwnAccount`), `principal.ts`, `scope.ts`
- `src/server/repos/` — the only DB access (`_base.ts`: `withScope`, `transaction`, `adminRead`, `poolFor` (auth/system), `inShop`, `ownedBy`; scope → role pool + SET LOCAL); `src/server/services/` (audit incl. `auditAs`, flags, sessions)
- `src/server/ops/` (P0-13) — `alerts.ts` (dedup + delivery), `health-rules.ts`, `ready.ts` (health routes `src/app/api/health/*`), `usage.ts`; `src/server/jobs/health-monitor.ts`, `log-throttle.ts`; `src/server/repos/ops.ts`; `src/server/observability/` (Sentry, tunnel `/api/monitoring`, request errors); `src/lib/sentry-scrub.ts`, `sentry-browser.ts`, `consent.ts`; `src/features/admin/system/` (+ `src/app/(admin)/admin/system`), `src/features/consent/`; `docs/RUNBOOK.md`
- `src/server/security/` — `headers.ts`, `rate-limit.ts` (`ipLimit` policy), `auth-limit.ts` (blanket `/api/auth/*`), `request.ts` (`clientIp`, `assertSameOrigin`), `turnstile.ts`, `ip-bucket.ts` (IPv6 /64), `alert.ts` (`securityAlert`), `keys.ts` (HKDF purposes); `src/server/log.ts` (pino + `serializeError`)
- `src/server/jobs/` + `src/worker/index.ts` — BullMQ registry (`defineJob`: versioned `{ v, data }` payloads, `envelope.ts`), `outbox.ts` (`writeOutbox`; `tools.outbox` in actions), `relay.ts` (relay loop, `replayOutbox`, `sweepOutbox`), DLQ, scheduler (Europe/London, `RETIRED_SCHEDULES`); `scripts/relay.ts` (`pnpm relay --replay-since`); worker/CLI run via `scripts/server-only-hook.mjs` (not react-server)
- `src/server/db/` — Drizzle client (`dbAs(role)`: app/auth/system pools; `testOwnerDb()` tests only), schema, `migrate.ts` (+ local role logins), `seed.ts` (as moz_worker; baseline + demo), `demo-seed.ts` (P0-16: demo shops/accounts with fixed ids, derived credentials, `resetDemo`, `privilegedWithoutTotp`; `scripts/demo-credentials.ts`), `reset.ts`; `drizzle/` migrations 0000–0012 (0012 ops_snapshot; 0005 lower-case email CHECK, 0006 session revocation trigger, 0007 pinned search_path, 0008 outbox, **0009 RLS + roles**, 0010/0011 RLS review hardening); `drizzle/concurrent/` non-transactional index builds; `scripts/rls-bench.ts` (`pnpm db:rls-bench`)
- `src/server/integrations/` — email (SMTP→Mailpit, Resend, Brevo), storage (MinIO/R2), fakes (push, ai, postcodes, places)
- `infra/docker-compose.dev.yml` via `pnpm services:up` — Postgres 17 + PostGIS, Redis queue instance (:6379, noeviction) + redis-cache (:6380, allkeys-lru), Mailpit (:8025), MinIO (:9000/:9001)
- `src/server/env.ts` (fail-closed server env) / `src/lib/env.ts` (client); `.env.local` never committed
- Motion (P0-10): `src/lib/motion/` (`route-transitions.ts`: NAV, `enterKeyframes`, `FADE_IN_PLACE_QUERY`, `vtName`, `cssTimeMs`, `viewTransitionActive`, VT downgrade; `nav-intent.ts`; `presets.ts`: `MOTION_PRESETS`, `staggerDelay`/`staggerStyle`, `transformOriginFor`, `placePopover`), `src/components/motion/` (`RouteTransition`/`RouteContent`, `TransitionLink`, `SharedElement` (`fit="cover"` for images), `Popover`; fixed UI stays outside `RouteTransition`), `/dev/motion` demos (`src/features/dev/motion/`); `src/features/dev/DevGate.tsx` (/dev 404 in production)
- Sound and haptics (P0-11): `src/lib/sound.ts` (`armSound`, `play`, `SOUNDS`), `src/lib/haptics.ts` (`haptic`, `HAPTICS`); both obey the sound preference
- UI: `src/styles/tokens.css` (+ `tokens.ts` list), `src/app/globals.css` (hover variant, `hit-44`, `[data-press]`, `.spinner`, `.skeleton`), `src/components/ui/` (overlays: `Overlay.tsx` + `Modal`/`SidePanel`/`BottomSheet`; gallery `src/features/dev/UiGallery.tsx`), `src/lib/use-hydrated.ts`, `src/features/auth/`
- CI/tooling: `.github/workflows/ci.yml` + `scheduled.yml`; `scripts/gate-task.ts`, `gate-phase.ts`, `lib/gate.ts`, `pre-push.ts` (+ `.lefthook/pre-push/guard-and-gate.sh`), `osv-gate.ts`, `ci-usage.ts`, `e2e.ts`; `Dockerfile`, `tsconfig.build.json`, `renovate.json`
- Tests: Vitest `unit` + `integration` (per-worker DBs); `tests/authz/` (matrix, harness self-test); `scripts/check-authz-coverage.ts` (AST, in `pnpm lint`); `tests/e2e/` (Playwright :3100, import `test` from `support/test.ts`); `tests/load/`, `tests/live/`, `stryker.config.mjs`

## Last verified (12 Nov 2026)
- `main` `72b668a` (P0-11): gate:task P0-11 PASS (unit 818, int 475, build, bundle, sast, E2E 6/0); full 5-project E2E 646/0 (169 skipped by design); CI workflow_dispatch `43129226265`: success.
- `wip/P0-C-close` `85335e9`: unit 832/0; gate:task PASS (the push). E2E of the batch NOT VERIFIED (next step).
- `main` `ee83173` (P0-10): gate:task P0-10 PASS (E2E 46/0); motion specs 109/0 on 5 projects; full E2E 616/0; AC5 popover flake fixed at the cause (120/0 ×3 after).
- P0-09 and P0-08: see SESSION_LOG (12 Nov).
- Mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04). Staging: none yet.

## Follow-ups (LOW, not fixed; owner task in brackets)
- [P0-12] `/dev/motion/shop/nope` returns HTTP 200 with the default white 404 (no `src/app/not-found.tsx`): real shop pages would soft-404. Add not-found per route group (C-04).
- [P0-12] Popover tab-out of its last control leaves the document (should return to the trigger); `place()` runs on every scroll event (wrap in rAF); morph box radius `--r-md` vs header `--r-lg`; a 60–80ms content-fade delay during the morph would keep text readable.
- [P1] `hasTypedViewTransitions` is used by tests only (remove or use). Avatar: broken image before hydration shows the broken icon (check `naturalWidth` on mount). Toast: keyboard dismiss drops focus to body; `toast()` with no Toaster queues silently; `EXIT_MS` duplicates `--dur-exit`. Tabs/SegmentedControl: ids from values with spaces; unmatched value leaves all tabs `tabIndex=-1`. `use-sheet-drag`: Esc mid-drag leaves inline `transition: none`. Preferences: sign-out keeps the previous customer's values on the device (add a DECISIONS line or clear). Audio: `arrival` uses a 120ms attack (DESIGN §9 now notes it).
- [P0-C close] Reduced-motion watcher on the morph (fade-only enter) and the `role=status` text repeat (same text pressed twice is not re-read).
- Safari streamed-content check on customer pages. Safe-area padding only checkable on a real iPhone.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
