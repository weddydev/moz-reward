# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-23 05:52 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed, 23 Nov 2026 ~14:30 UTC (Mac); baton held by talha.syed. Autopilot is OFF.** Main CI 45189184351 + staging deploy 45199067573 of `8c4b8cd` (PD-07) GREEN.
- **PD-07 is on main** (this merge of main's checkpoint onto `77ea565`; CI 45177538333 on `77ea565` GREEN, every spec). Since `c5b9d34`: the throttled specs' long-task limit is 65 ms (`LONG_TASK_MS`; human 23 Nov, CLAUDE.md "Small overshoots don't block"); the PD-04 keyboard focus-ring spec focuses and checks together (flaked in CI 45167467906). The pixel7 `@fps` quarantine (C-79 → PD-11, T-7) stays.
- **PD-08 moved to `wip/PD-08-b`, HEAD `9f7e7bb`** (local branch `wip/PD-08-b`): PD-08's own 11 commits replayed onto main `8c4b8cd` (the old `wip/PD-08` sat on the pre-rebase PD-07 and its CI 45189429015 on `b5246e8` failed only on the PD-04 focus-ring flake that main has fixed). Code = old `b5246e8` + PD-07's late fixes, nothing else. Old `wip/PD-08` / `wip/PD-08-ff` are superseded (delete once `wip/PD-08-b` CI is green). Step (b) done: `/dev/molten` phone wallet + shop + the reference's wipe on `WIPE`; parity parts `wallet-stack` + `shop` + spec row `wallet-stack` required; shop frames at 0/260/620/730 ms (`Trigger.atMs`); parity `[PD-08]` 10/10 on the Mac (Chromium + host WebKit), Linux Chromium 8/9 at 1.09% on shop 390 before its 1.5% Chromium tolerance (not re-run since). DECISIONS "PD-08 wipe parity" (8 items). **Check first:** CI on `9f7e7bb`.
- **PD-08 next (c), design worked out (build it as written):** (1) `src/lib/motion/wipe-stage.ts` (imperative controller, unit-tested pure parts) + `src/components/motion/WipeStage.tsx` (a fixed full-viewport `.m-wipe-stage` holding the metal `.m-wipe`, z-index below the dock/rail/top bar and above page content), mounted in `src/features/portal/PortalShell.tsx` outside `RouteTransition`. (2) Forward: the Wallet card's `TransitionLink` onClick (plain click, motion on; reduced motion skips all of this and keeps the normal 150 ms fade) calls `setWipe(href, wipePoint(e, cardRect, {0,0}), performance.now())` and `startWipe(point)`: metal circle 0→`wipeRadius(innerWidth, innerHeight)` 620 ms, sparks (22, [160,420]) at 80 ms, and `[data-route-content]` (the same element stays across the navigation) to scale .92 / opacity .4 over 600 ms. (3) `RouteContent`'s layout effect: before `takeNavIntent`, `takeWipe(pathname, performance.now())`; if found, cancel the wallet scale on `el`, give `el` position relative + z-index above the stage + pearl background, and animate its clip-path circle 0→R from the tap point relative to `el.getBoundingClientRect()` (R from the viewport, not the page height) with delay `remainingDelay(110, elapsed)`, 620 ms, `WIPE.easing`; rise `[data-rise]` inside (delay `riseDelay(k)` minus elapsed) and fill `[data-wipe-bar]` (420 ms); on finish remove the clip and styles and hide the stage. The loading.tsx commit is the pathname change, so the clip reveals the loading cover and the page streams in behind; on a slow network the metal simply holds. If nothing takes the wipe within `WIPE.ttlMs`, the stage fades out and the wallet scale is cancelled. (4) Shop page: `ShopPageHeader` gets `rise="meta"` (only the area line rises; logo and name ride the view-transition morph) and the page body sections `data-rise` 3+. (5) Back: the cover's back link onClick clones `el` into the stage at its rect and closes the clone's circle onto the back button (520 ms) while `/wallet`'s RouteContent (a `setWipeBack` token) returns the wallet from .92/.4 with an 80 ms delay instead of sliding; back during the forward wipe cancels it the same way. (6) `WalletPage`: `eager` on the first stack's cards (LCP). DECISIONS: wipe on every width (it isn't a slide, so FADE_IN_PLACE doesn't apply); stage z-order. Then (d) E2E wipe + back + back-mid-wipe + slow network (route delay) + reduced motion, Lighthouse wallet, screenshots 320/390/1440, design review.
- Headless Linux Chromium has no hyphenation dictionaries. Laptop Linux WebKit stalls (~1.7 min per parity test): WebKit evidence is CI only.

## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov). Then P1 resumes with the P1-B close. P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **PD-C** (PD-07 on main 23 Nov; PD-08 in progress on `wip/PD-08`; H-49 at its close). PD-B closed 23 Nov. PD-A closed 22 Nov. P1-B (P1-05..P1-09) complete; its close runs after PD-C.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-23, talha.syed (PD-08 replayed onto main as `wip/PD-08-b` `9f7e7bb`; step (c) design in the handoff)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; **PD-B closed 23 Nov** (main `d59a2eb`). **PD-07 on main 23 Nov** (CI 45177538333 green). Now PD-08 (PD-C).

## Next (top 3)
1. PD-08 (c): the app's WipeStage (plan in the handoff), then (d) E2E wipe + back + slow network, Lighthouse wallet, screenshots, design review. Check CI on `wip/PD-08-b` `9f7e7bb` first.
2. Cleanup now that PD-07 is on main: remote `wip/PD-07`, `wip/PD-07-b`, `wip/PD-07-bisect-*`, `wip/PD-08` (after `wip/PD-08-b` is green); worktrees `../moz-bisect`, `../moz-PD-07`; local `wip/PD-08-ff`.
3. Human any time: H-51 (b), H-48b, H-38, H-45, H-46; H-49 at the PD-C close.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-46 | P0-15 D4 | P5-12 | Production backups on: `moz-backup wal-on production`, first dump + `backup:verify --env production` (dump + `--wal`) PASS, then `BACKUPS_ENABLED=true` in `infra/deploy/production.env` | SESSION_LOG + production health snapshot |
| C-47 | P0-15 (human 16 Nov) | P5-12 | Production stack set up before go-live (DECISIONS 16 Nov): secrets, Tunnel/origin lock (C-44), `init-env production`, maintenance-only deploy, then backups (C-46) and UptimeRobot production monitors; P0-15 AC7 re-checked with both stacks running | deploy log + `docker stats` + SESSION_LOG |
| C-51 | P1-02 | P5-05 | Landing footer "Terms" / "Privacy" links (`/terms`, `/privacy`, plain `<a>`) resolve to the legal pages | E2E: links 200 |
| C-55 | P1-04 security review LOW 4 | P5-01 | Customers can withdraw (and give) per-shop marketing consent themselves through `recordConsentChange` (source `settings`) before any real customer joins; the join sheet's wording ("change this any time in the shop's settings") names where it really is | E2E: toggle off → consent row false + membership false |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-57 | P1-A close CR-M2 | P2-13 | "Has a profile" = "profile complete" (DECISIONS 18 Nov): an erasure or edit that clears the phone or the 13+ declaration but keeps the profile row must make the next join ask again (`isProfileComplete`), or delete the row | integration |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-62 | P1-07 | P1-12 | Approvals write `progress_gold` / `ingots_completed`; the Wallet reads rewards-ready count, recent activity, and the last 10 awards for "N more visits"; Wallet statement count unchanged | integration |
| C-63 | P1-07 | P4-06 | Wallet daily game card (hidden until P4) | E2E |
| C-66 | P1-08 | P1-12 | Gold Vault streak chip shows the member's current streak from the ledger; tier never goes down when an owner raises a threshold (membership stores the highest tier reached) | integration + E2E |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-68 | P1-09 | P1-11 | Leaving cancels the member's open points requests in `leaveShop`'s transaction; a left member can't request; the shop page's Request points button and pending state | integration + E2E |
| C-69 | P1-09 | P1-12 | Approvals refuse a left membership (progress frozen); the shop page's Recent receipts card lists the last receipts (empty state today) | integration + E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-71 | P1-09 | P3-06 | Leaving voids the member's live offer claim codes for that shop in `leaveShop`'s transaction | integration |
| C-72 | P1-09 | P3-11 | Referral bonuses are never re-earned after leaving and rejoining | integration |
| C-73 | P1-09 | P1-13 | A rejoin after the 30-day window gets no frozen progress back even if the forfeit job hasn't run yet (forfeit at rejoin, or the join refuses to restore) | integration |
| C-74 | P1-09 | P3-05 | Shop page offers carousel (screen 4 slot; hidden until offers exist) | E2E 390 + 1440 |
| C-78 | CI 45101535248 (PD-B close) | PD phase gate (PD-11) | Linux WebKit: `molten-fields` slider drag's final track press keeps 720 (3/3 there; passed in CI 45090767908 + 45096798286, host WebKit 6/6): root-caused and the WebKit assertion un-quarantined | CI WebKit run + SESSION_LOG |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | PD-11 (PD-C close) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (23 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- gate:task PD-07 PASS on `42e68ed` (unit 1972/0, int 1456/0, PD-07 E2E Linux 13/0/20, changed specs Linux 54/0/40, parity PD-07 8/0 both engines); earlier PASS on `7d34e58` before the review fixes.
- Host E2E `molten-dock` + `portal-shells` on pixel7 + desktop1440: 36/0/18; screens `.artifacts/screens/PD-07/` + `P0-12/*-320--pixel7.png` inspected (dock 320/412, rail 1440).
- Full parity run (all PD parts, both engines) 163/1: WebKit liquid-choice frame 0 at 2.01% under load, 3/3 alone (watch; FOLLOWUPS).
- Main CI 45112526437 + staging deploy of `d59a2eb` GREEN; staging health live/ready/worker 200 without password (23 Nov).

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
