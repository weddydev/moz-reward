# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-13 (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by talha.syed, 2026-11-13 05:45 IST (Mac)** after an autopilot session (the human asked to keep going without stops).
- **Finished:** **P0-12** (`8f3f3b8`) and **P0-D closed** (fixes `af3aa57`, `f91af95`): shells per DESIGN §5, role + shop switchers (tabs stay in sync), gates on every portal page (lint: each page awaits its own table path), route authz matrix (34 routes × 18 columns), C-24 admin IP allowlist at sign-in/session/account endpoints, `/portal` landing, C-05, `Cache-Control: private, no-store` on portal paths, `/me/security` inside the customer portal. Reviews: security (2 MEDIUM fixed), design (1 HIGH + 4 MEDIUM fixed), code (4 MEDIUM fixed), QA (2 majors + 3 minors fixed); LOWs in Follow-ups. **P1 phase-start brief review done** (`docs/phases/P1.md`).
- **CI:** run `43364016465` on `f91af95` **green** (the two runs before failed only on a Linux 320px label truncation, fixed in `f91af95`).
- **Half-done:** nothing. **Next: P1-01** (nothing started). Plan from reading the code: C-34 has four parts. (a) `scripts/check-migrations.ts` `checkRls`: fail a `moz_app` policy with `USING (true)` / `WITH CHECK (true)` unless the same migration has `-- rls: open <table> — <reason>`; the existing `audit_logs_append` (0009, `WITH CHECK (true)` to moz_app) needs a new migration that drops and re-creates it with the marker (never edit applied migrations). (b) A `-- rls: global` marker only counts in the migration that creates the table. (c) Admin cross-shop reads only via `adminRead`: a type or lint guard on repos taking `AdminScope` (today `readOpsSnapshot`, `upsertFlag` use `withScope(adminScope)`, which are own-table/admin-only rows; decide and record). (d) Customers can't write `memberships` counters: `memberships_own` is `FOR ALL` to moz_app and staff use the same role, so column grants can't separate them; a BEFORE INSERT/UPDATE trigger that, when `current_setting('app.scope') = 'customer'`, refuses changes outside the customer-writable columns (muted, marketing_opt_in, left_at) and non-default counters on insert; plus a catalog test that fails when a new memberships column isn't classified. Then the rest of P1-01 (shop_hours, shop_closures, nfc_tags, `openStatus`, QR service, builders).
- **Tested:** see "Last verified". **Not yet tested:** quarantined pixel7 motion test (C-40); `global-error.tsx`; real-device sound/haptics (H-37); rail labels toggle and More sheet on a real phone/tablet; staging (none until P0-15).
- **Pending by the human's autopilot instruction (not passed):** P0-D close staging smoke + Sentry for the release (no staging until P0-15); P0-E and P0 phase closes wait on P0-15's human tasks.
- **Do first:** nothing new (no env vars, migrations or seeds). A blank `ADMIN_IP_ALLOWLIST=` is fine locally; it fails the boot only on staging/production.
- **Human side:** open 🟠 for P0-15 (H-27, H-04, H-28, H-34 leftovers, H-36 after deploy), H-12 Play account, H-37; new 🟢 H-38 (delete merged wip branches; Claude's branch deletion is refused here).
- **Windows laptop notes:** low memory can crash a Vitest worker in the pre-push gate (re-run); start Docker Desktop before `pnpm services:up`; `pnpm sast` takes 10–23 min there.

## Status
- **Phase:** P0 open (P0-15 and the P0-E/P0 closes pending human tasks; P0-D closed 13 Nov). Working on **P1** meanwhile (human, 13 Nov: keep going, mark pending gates).
- **Current sub-phase:** P0-E production foundation: ~~P0-14~~ → ~~P0-19~~ → ~~P0-18~~ → ~~P0-20~~ → ~~P0-13~~ → ~~P0-21~~ → P0-15 → ~~P0-16~~; then P0-C (P0-08…11), then P0-D (P0-12).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-13 05:45 IST, talha.syed (handoff after P0-D close)
- **Staging and production:** one Hostinger VPS 72.61.17.208 (ready, not hardened; P0-15 needs H-27; backups on B2) — not provisioned yet

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); waits on H-27 (+ H-34, H-36, H-04 for the full staging sign-in).

## Next (top 3)
1. **P1-01** (shop entities, codes, hours, NFC; closes C-34). P1 starts while P0-15 waits on H-27/H-04/H-28 (human's autopilot instruction: move on, mark the P0 phase gate pending).
2. P0-15 parts that need no human input (hardening script as code, compose stacks, deploy/rollback scripts) when a P1 sub-phase closes or the human tasks land.
3. **P0-15**: VPS + staging (+ C-19, C-21, C-23, C-27, C-32, C-33, C-35, C-36, C-37, C-38); hardening script can start now (VPS ready, backups bucket + key ready); staging sign-in waits on H-04.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` (esbuild + lefthook skipped until then) | CI image job |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
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
| C-40 | P0-C flaky (CI 43206412851) | P0 phase gate | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up | DECISIONS + processor register |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: none.
- 🟠 (needed by Sun 15 Nov for P0-15): H-27 UptimeRobot, H-04 Resend + Brevo, H-28 staging OAuth, H-34 Sentry, H-36 demo inbox, H-21 client's written risk acceptance, H-17 permissions. **Start now:** H-12 Play organisation account. **H-37** (🟠, before P1-06): iPhone + Android listen and vibrate check.
- Technical: C-40 (quarantined test) blocks the P0 phase gate. CI queue stalled during the Actions outage (see handoff). Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
- `src/app/` — Next.js 16 App Router (`proxy.ts`, not middleware); `/sign-in`, `/staff/sign-in`, `/staff/security`, `/me/security`, `/sign-in/link-expired`; `src/app/dev/` (404 in production); `src/app/api/test/[action]/route.ts` test-only API (404 unless `APP_ENV=test`)
- `src/server/actionTemplate.ts` — `defineAction` / `defineRoute` (ENGINEERING §4); `src/server/errors.ts` (ERROR_MESSAGES, Result)
- `src/server/auth/` — Better Auth `auth.ts` (`getAuth()`, created on first use; + hooks, staff gate), `session.ts` (`sessionFromHeaders`, role limits), `mfa.ts`, `privileged.ts`, `cookies.ts`, `ip.ts`, `social.ts`, `magic-link.ts`, `staff-login.ts` + `attempt-guard.ts` (atomic lockout), `link-confirm.ts` (POST confirm of email links; page `/sign-in/confirm`, route `/api/sign-in/confirm`); `src/server/integrations/breach/` (HIBP)
- `src/server/portal/` (P0-12, on `wip/P0-12-b`) — `decide.ts` (pure route gate, active shop, layout route), `gate.ts` (`gate*Route`, `gatePortalLayout`), `active-shop.ts`; route table `src/features/portal/routes.ts`
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

## Last verified (13 Nov 2026)
- `main` `af3aa57` (P0-D fixes): gate:task PASS (unit 998, int 1111 incl. route matrix 613, build, sast); shells spec 63/0 on 5 projects; visual baselines regenerated and inspected; CI `43364016465` on `f91af95` green.
- `main` P0-12 squash (Mac): `pnpm check` PASS (unit 998, titles strict); route authz matrix 562/0; full 5-project E2E on the production build 826 passed + the 5 failures (rls.spec, unscoped list) fixed and re-run 5/5; shells 56/0 on 5 projects; visual baselines (6) inspected; gate:task on the push (see SESSION_LOG).
- `wip/P0-12-b` `7878fdf` (P0-12 step D, Mac): gate:task PASS (unit 987, int 475, build, bundle, sast, E2E P0-12 30/0); `pnpm e2e portal-pages.spec.ts portal-layouts.spec.ts system-page.spec.ts` on Chromium + WebKit + iPhone 14 (production build): 54/0; screenshots of the 403, both not-found pages and the error page inspected at 320, 390, 1440.
- `wip/P0-12-b` `aebb93f` (P0-12 step C, Mac): gate:task PASS (unit 949, int 475, build, bundle, sast, E2E P0-12 10/0); `pnpm e2e portal-layouts.spec.ts system-page.spec.ts` on Chromium + iPhone 14 (production build): 16/0; system-page screenshots inspected (sidebar at desktop, bottom bar on iPhone).
- `main` `576b73e` (P0-C flaky fixes): gate:task PASS (unit 838, int 475, build, bundle, sast); toast + overlay specs 27/0 (3 skipped: pixel7 quarantine) on 5 projects; routes-axe motion 18/0 (Chromium + WebKit ×3). 5-project run `43221794416` on `6ad688a`: 674 passed, 0 failed, 1 flaky (fixed in `576b73e`). `wip/P0-12-b`: unit portal 29/0, proxy 7/0; CI `43226256972` green on `341433e`.
- `main` `72b668a` (P0-11): gate:task P0-11 PASS (unit 818, int 475, build, bundle, sast, E2E 6/0); full 5-project E2E 646/0 (169 skipped by design); CI workflow_dispatch `43129226265`: success.
- P0-C close: gate:task PASS on `4a8851e` (unit 834, int 475, build, bundle, sast); push CI `43194017373` green; 5-project Linux E2E `43194053878` on `4a8851e`: 675 passed, 0 failed, 1 flaky (AC5, fixed after). After the last fixes: Linux WebKit + iPhone 14 in the Playwright image 12/0; Chromium 3/0; unit toast 16/0. `main` `32c0513`: gate:task PASS (unit 836, int 475, sast, E2E 39/0); push CI `43206390543` green; 5-project Linux E2E `43206412851`: 674 passed, 0 failed, 2 flaky (NOT green). `wip/P0-12` `faabf3b`: gate:task PASS.
- `main` `ee83173` (P0-10): gate:task P0-10 PASS (E2E 46/0); motion specs 109/0 on 5 projects; full E2E 616/0; AC5 popover flake fixed at the cause (120/0 ×3 after).
- P0-09 and P0-08: see SESSION_LOG (12 Nov).
- Mutation 90.1% · `test:live`: storage ✅, email NOT VERIFIED (H-04). Staging: none yet.

## Follow-ups (LOW, not fixed; owner task in brackets)
- [P0-15] From the P0-12 security review (LOW): prefetch requests (`next-router-prefetch` / `purpose: prefetch`) skip the proxy, so a client-sent `x-pathname` reaches the layout gate (only weakens a deny to a content-free 200 for the sender) and such responses carry Next's default cache header, not ours; a full HTML page fetched with `purpose: prefetch` has no CSP. Run the proxy for prefetches on portal paths or mark proxied requests; add a strict CSP + Cache-Control to the prefetch `headers()` rule.
- [P1] From the P0-D code review and QA (LOW/minor): `forbidden.tsx` "Go to my home page" can point at a portal that refuses the user too (off-list admin, moderator) — gate it like `signedInStaffDestination`, fall back to `/wallet`; `forbidden.tsx` reloads the principal uncached (reuse the gate's `requestPrincipal`); `shell.ts` `memberShops` opens one scoped transaction per membership in parallel (sequential or one query); `/staff/sign-in?returnTo=/admin` for shop staff lands on the 403 page (fall back to home for portals the user can't open); a toast raised while any modal dialog is open sits behind it (the shop switcher now shows its error inline; a top-layer Toaster would fix it for every caller).
- [P1] From the P0-12 design review (LOW): rail PortalSwitcher stays icon-only when the rail opens (render its label with `rail-label`); `px-[18px]` off the spacing scale; shop sidebar list overflows below ~865px height with no scroll cue (fade mask or tighter gap); toast visual baselines use `maxDiffPixelRatio 0.002`, which misses ~200-pixel changes (use `--update-snapshots=all` when a shell changes).
- [P1-06] From the `deca234` re-review. `sound.ts` `unlock`: ignore untrusted events (`!event.isTrusted`) and a `touchend` that ends a scroll (`navigator.userActivation?.isActive === false`), which would make an AudioContext without activation. `play()` returns true while waking even if that resume is then refused. `preferences.ts:222`: a change made while the profile is "unknown" is marked pending, so a different account signing in next on the device gets the device's motion/sound choice.
- [P0-15] After the first decrypt-and-restore from the **password-manager copy** of the backup key passes, delete the private key from the Windows laptop's GnuPG keyring (`gpg --delete-secret-keys 1D1D1BF1F6FDA0F2EDA8FAA0D356B5CAA21C0F58`); it was kept only as a safety net (H-26).
- [P0-15] `pnpm sast` takes ~23 min on the Windows laptop (Semgrep over the bind mount): consider scanning `git ls-files` copied into a volume.
- [P0-12 E] `/dev/motion/shop/nope` re-check: root `not-found.tsx` now exists (designed page), but the status under that page's Suspense is still 200. Browser Sentry: Safari reports a prefetch cancelled by a page load as an uncaught error ("…_rsc… due to access control checks"): drop it in `beforeSend`. In-shell state pages sit at the top of the content area, not centred.
- [P0-12] Shared primitives (Checkbox, Chip, Radio, SegmentedControl, Select, Switch, Table, Tabs, ErrorState) and the auth forms disable until hydration but rely only on the root `data-hydrated`; the E2E guard can scan them mid-fade (same cause as the `/dev/motion` flaky). Put `data-hydrating` on those primitives before the portal pages multiply.
- [P0-12] Popover tab-out of its last control leaves the document (should return to the trigger); `place()` runs on every scroll event (wrap in rAF); morph box radius `--r-md` vs header `--r-lg`; a 60–80ms content-fade delay during the morph would keep text readable.
- [P1] `hasTypedViewTransitions` is used by tests only (remove or use). Avatar: broken image before hydration shows the broken icon (check `naturalWidth` on mount). Toast: keyboard dismiss drops focus to body; `toast()` with no Toaster queues silently; `EXIT_MS` duplicates `--dur-exit`. Tabs/SegmentedControl: ids from values with spaces; unmatched value leaves all tabs `tabIndex=-1`. `use-sheet-drag`: Esc mid-drag leaves inline `transition: none`. Preferences: sign-out keeps the previous customer's values on the device (add a DECISIONS line or clear). Audio: `arrival` uses a 120ms attack (DESIGN §9 now notes it).
- [P1] Toast: the same message twice within a second outside a burst leaves the status text unchanged, so the second is not announced (alternate a trailing U+00A0, or accept in DECISIONS); a later error replaces an earlier one still being spoken (normal for `role=alert`).
- [P0-C close] Reduced-motion watcher on the morph (fade-only enter) and the `role=status` text repeat (same text pressed twice is not re-read).
- Safari streamed-content check on customer pages. Safe-area padding only checkable on a real iPhone.

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (H-04).
