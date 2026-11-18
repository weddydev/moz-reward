# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by Syedbadeshah76, 2026-11-18 21:45 PKT

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **18 Nov 21:45 PKT, handed over by Syedbadeshah76 (Windows): P1-07 Wallet built, NOT ticked — on `wip/P1-07`, HEAD `d05e6c0` (pushed).** `git switch wip/P1-07 && git merge --ff-only origin/wip/P1-07`, check HEAD = `d05e6c0`. Contains: migration 0025 (`memberships.progress_gold` / `ingots_completed`, server-owned via the guard; RLS `loyalty_programs_member_read`), `readOwnWallet` + `loadWallet` + pure `src/features/wallet/view.ts`, `WalletPage` (mobile list, desktop 3-col grid + right column, empty state, suspended/closed greyed), pull-to-refresh, ShopCard shared-element names, demo seed (Aisha at Brew: 720/1,000, 3 ingots), Lighthouse route `wallet-50`, 3 DECISIONS entries, FOLLOWUPS, MAP, carried criteria already written into P1.md / P4.md.
- **Half-done, exactly how to finish P1-07:** (1) AC "cards transition into the shop page via shared element": both pages carry `SharedElement` `shoplogo`/`shopname` keyed by shop id, but the E2E only checks the navigation. Add to `tests/e2e/wallet.spec.ts` the view-transition group check from `tests/e2e/motion.spec.ts` (~lines 640–670: `record(page)`, click, `groupNames` contains `vtName("shoplogo", shopId)` and `vtName("shopname", shopId)`; Chromium; WebKit: navigation still works). (2) `pnpm gate:task P1-07 P1-04 P0-12 P0-09 J1`. (3) One task commit: tick P1-07 in PHASES, add the CARRIED rows below, SESSION_LOG ≤ 5 lines, push to main.
- **CARRIED rows to add with the P1-07 commit** (criteria already in the phase files on the branch): C-62 → P1-12 (approvals write the two counters; Wallet reads rewards-ready count, recent activity, last 10 awards for "N more visits", statement count unchanged); C-63 → P4-06 (Wallet daily game card); C-64 → P1-08 (landing initial JS 155.2 KB > 149.5 KB judgment limit: the P1-04 join-sheet chunk, 12 KB, loads eagerly → `next/dynamic`; pre-existing, found by the new Lighthouse run); C-65 → P1-16 (right-column rewards list with Redeem).
- **Tested (18 Nov, Windows):** unit 1630/0 (21 wallet cases); int 1380/0/12 skip (`wallet.test.ts`: 1 vs 50 memberships send identical statements via test-only `observeQueries`; left and other customers hidden; suspended/closed flagged; programme RLS for member/stranger/leaver/staff; `membership-guard`: new columns refused for customer, staff and joins); gate:task run 2: typecheck, lint, format, titles, unit, int, build, check:bundle, sast, lint:sh PASS; e2e 155/5 → 4 fixed (a live region inside the route content; h1 must be exactly "Wallet"), affected specs re-run 59/0; Lighthouse `wallet-50` PASS (LCP 0.99 s, CLS 0, JS 165.1/170 KB). Screens inspected at 390/320/1440 (Chromium, WebKit): `.artifacts/screens/P1-07/`.
- **Not yet tested:** a full green `gate:task` after the two E2E fixes (only the affected specs were re-run); the morph check (above); pull-to-refresh on real phones (H-13; E2E drives it through Chromium touch emulation); CI for `d05e6c0` (wip push, not looked at yet). **Known, not P1-07:** `ui-states.spec.ts` "[P0-09] AC3 Tab order" fails on WebKit **on Windows**, also on clean main `594a25c` (FOLLOWUPS on the branch); Linux CI passes it.
- **Do first on the other laptop:** `git fetch`, switch to `wip/P1-07` (above), `pnpm install`, `pnpm db:migrate` (0025), `pnpm db:seed --reset` (demo progress). **P1-A still not ticked:** waits for **H-48 🔴**; then re-run Deploy for current main → staging smoke → Sentry check → tick P1-A (docs-only commit). CI for `2479b62` green. VPS: Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`.

## Status
- **Phase:** **P1**. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** P1-B loyalty engine, Wallet, Vault: ~~P1-05~~ → ~~P1-06~~ → P1-07 → P1-08 → P1-09 → `/subphase-complete`. (P1-A: everything done except the staging step, which waits for H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-18, Syedbadeshah76 (handoff: P1-07 on `wip/P1-07` `d05e6c0`, not ticked)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys roll back until H-48.
- **P1-B:** P1-05, P1-06 done (18 Nov). P1-07 built on `wip/P1-07` (`d05e6c0`), not ticked: morph E2E check + full gate left (Handoff note).

## Next (top 3)
1. Finish P1-07 on `wip/P1-07` (morph check, gate, tick, CARRIED C-62..C-65), then P1-08.
2. Human: **H-48** (staging Sentry DSN) → then close P1-A (handoff note: deploy, smoke, Sentry, tick).
3. Human, any time: H-45 UptimeRobot monitors (then the stop-staging phone alert test, C-48); H-46 Cloudflare `/s/*` rule.


## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs **Backup half done 16 Nov (D4: heartbeats on staging, WAL from pg_stat_archiver, flag deployed with D4); left: health snapshot after deploy + request logs (E).** | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-46 | P0-15 D4 | P5-12 | Production backups on: `moz-backup wal-on production`, first dump + `backup:verify --env production` (dump + `--wal`) PASS, then `BACKUPS_ENABLED=true` in `infra/deploy/production.env` | SESSION_LOG + production health snapshot |
| C-47 | P0-15 (human 16 Nov) | P5-12 | Production stack set up before go-live (DECISIONS 16 Nov): secrets, Tunnel/origin lock (C-44), `init-env production`, maintenance-only deploy, then backups (C-46) and UptimeRobot production monitors; P0-15 AC7 re-checked with both stacks running | deploy log + `docker stats` + SESSION_LOG |
| C-50 | P1-02 | P1-08 | Shop landing `/s/[code]` shows the reward preview with a static ingot (next reward + gold needed) once the loyalty programme exists; public data only, inside the cached landing payload (bump `shop-landing:v1` key version) | E2E on the landing |
| C-51 | P1-02 | P5-05 | Landing footer "Terms" / "Privacy" links (`/terms`, `/privacy`, plain `<a>`) resolve to the legal pages | E2E: links 200 |
| C-54 | P1-04 design check M6 | P1-09 | "Leave shop" sets `marketing_opt_in` false and writes a consent row (`recordConsentChange`, source `leave`) in the same transaction; rejoin (already in `joinOwnMembership`) restores frozen progress | integration |
| C-55 | P1-04 security review LOW 4 | P5-01 | Customers can withdraw (and give) per-shop marketing consent themselves through `recordConsentChange` (source `settings`) before any real customer joins; the join sheet's wording ("change this any time in the shop's settings") names where it really is | E2E: toggle off → consent row false + membership false |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-57 | P1-A close CR-M2 | P2-13 | "Has a profile" = "profile complete" (DECISIONS 18 Nov): an erasure or edit that clears the phone or the 13+ declaration but keeps the profile row must make the next join ask again (`isProfileComplete`), or delete the row | integration |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-59 | P1-05 | P1-08 | Loyalty settings preview uses the Ingot component (static mode) instead of `IngotPreview` | screenshot 320/1440 |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: **H-48 🔴** (staging Sentry DSN; blocks the next staging deploy once the batch lands). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (18 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- P1-07 (`wip/P1-07` `d05e6c0`, not ticked): gate:task run 2 — unit 1630/0, int 1380/0/12 skip, build, sast PASS; e2e 155/5 → 4 fixed, affected specs re-run 59/0; the 5th is the Windows-WebKit P0-09 Tab test, failing on clean main too.
- Wallet query count: 1 and 50 memberships send identical SQL statements (`tests/integration/wallet.test.ts`, test-only `observeQueries`).
- Lighthouse mobile `wallet-50`: LCP 0.99 s, CLS 0, JS 165.1 KB (≤ 170) PASS; landing JS 155.2 KB FAIL (pre-existing, C-64 → P1-08).
- P1-06 evidence (`2479b62`, CI green) is in SESSION_LOG.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
