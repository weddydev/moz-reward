# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-22 09:17 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76, 22 Nov 2026 ~10:30 UTC; baton held (same developer continues in WSL).** **This laptop now works in WSL2** (H-51: human steps done; Claude set up `~/moz-reward` on Ubuntu 24.04, node 24, Docker integration, Playwright browsers, `.env.local`, services, migrations; DECISIONS 22 Nov). **Open the VS Code WSL window and `/resume` there**; the old `D:moz-reward-git` checkout is retired (still on main, clean).
- **PD-05 half-done on `wip/PD-05`, HEAD `a6236e1`** (checkpoint commit, not a task close). Built: `Switch` (coin knob), new `LiquidChoice` (goo blob + droplets; backs `SegmentedControl` and `RadioGroup variant="cards"`), seal `Checkbox`, `GooFilter` (`#m-goo`) in the root layout (**every-page change**), the three lab tiles on `/dev/molten`, `/dev/ui` LiquidChoice block, parity parts + triggers (+ liquid beats .42/.76), spec rows PD-05 required, 4 colour tokens. Also **main CI red fixes** (run 45006025356, PD-04): gilded-gate timeline ignores infinite idle loops; portal-shells `settledBox` waits on the toast's own animations, not its progress bar.
- **Continue here (in order):** 1) CI for `a6236e1` (run 45011219404; it tells whether the two main-CI fixes hold). 2) PD-05 E2E spec (`tests/e2e/molten-choices.spec.ts`: keyboard for all three; rapid toggling; resize mid-pour; lite tier (no filter, no drops); reduced motion; targets ≥ 44 px; screens 320/390/1440 of the three tiles); update `tokens.spec.ts` "[P0-08] AC5 Full" (switch thumb transition is now the .7 s coin, not dur-fast) and check `ui-states.spec.ts` segmented one-line test. 3) Parity WebKit + Linux container runs; decide the WebKit goo fallback (brief: "no filter, plain spring", reviewed and logged). 4) `review-animations` / design-reviewer on the diff, then `pnpm gate:task` (+ full 5-project E2E: root layout changed). 5) Close PD-05, merge to main.
- **Tested so far (`a6236e1`):** parity Chromium PD-05 + Buttons tile 24/24 (ownHeight removed); component tests `molten-choices.test.tsx` 22/0; `pnpm check` PASS (unit 1857/0). WSL: `pnpm check` PASS, unit 1879/0 (0 skipped: the suites Windows skipped now run).
- **Not yet tested:** WebKit parity, Linux container runs, the two CI-fix specs locally, PD-05 E2E, gate:task, CI on `a6236e1`. Main `f153279` CI is **red** until `wip/PD-05` lands (the fixes are on it).
- **Before work (WSL):** nothing (env, services, migrations, browsers done). H-51 leftovers (VPS key, optional dev keys) are the human's, not blocking.
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov; `docs/phases/PD.md`). Then P1 resumes with the P1-B close. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** **PD-B** Controls: ~~PD-04~~ → PD-05 → PD-06 → close; then PD-C (structure + signature moments, needs H-49). **PD-A closed 22 Nov.** **P1-B** (P1-05..P1-09) is complete; its `/subphase-complete` runs after PD-C. (P1-A: everything done; staging step done 22 Nov with H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-22 (~10:30 UTC), Syedbadeshah76 (PD-05 checkpoint on `wip/PD-05` `a6236e1`; laptop moved to WSL2)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; PD-04 on main 22 Nov (`f153279`, **main CI red**: fixes ride on `wip/PD-05`). **PD-05 in progress** (`wip/PD-05` `a6236e1`). Next PD-06, PD-B close.

## Next (top 3)
1. Finish PD-05 on `wip/PD-05` from WSL (handoff note order); it carries the main CI fixes, so land it promptly.
2. Check the first nightly `perf` job (scheduled.yml, 02:29 UTC) and red CI first, as always.
3. PD-06, PD-B close. Human any time: H-51 leftovers, H-48b, H-38, H-45, H-46.

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
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (22 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- PD-04 (`2fbeb3e`): parity 26/26 Chromium + WebKit; unit 1852/0; PD-04 E2E Linux Chromium 32/0, host WebKit 9/0.
- Gate `2fbeb3e`: all PASS except changed specs 94/10 (load timeouts; the 10 pass on 2 workers, 18/0).
- PD-05 checkpoint `a6236e1` in WSL2 (first run there): `pnpm check` PASS, unit 1879/0; parity Chromium PD-05 24/24 (Windows host).
- Main CI 45006025356 (`f153279`, PD-04) **red**: gilded-gate timeline (Infinity from idle loops) + portal-shells toast settle (progress bar); fixes in `a6236e1`. Last green main CI 44999822284.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
