# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-25 00:30 IST (24 Nov 19:00 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed, 25 Nov 2026 ~10:45 IST (Mac); baton held. Autopilot OFF.**
- **On `wip/PD-11`, pushed HEAD `dae3b95`** (code + tests; CI 45548579038 running at this note). It fixes CI 45537212442 (WebKit red on `5e97ee4`): (a) a real defect (KI-53): a fast commit (16–70 ms) cancelled the Wallet's sink after 0–2 frames → `startWipe` takes a stage copy, `openWipe` sinks it under the metal (`walletCopyAt`, unit test); wipe spec invariant `gone` = 0 (31–33 frames fail without the copy); (b) KI-10 test waits: C-80 bar by keyframes + fill (frames on Chromium only), vault pour end state 15 s, mid-pour reduced motion ≤ 3 frames. C-82 + T-8 closed (perf-budget 8/8 at 65 ms on `2c4ece1`).
- **Continue exactly here:** (1) read CI 45548579038 on `dae3b95` — red → fix first (local Linux container is only meaningful at `--workers=1`; 5 workers = 44 false failures, KI-02). (2) **C-79** (pixel7 FX stress 55.6–58.1 fps on CI): cause measured with a CDP sampling profile at 4× (pixel7, `/dev/motion`, 200 bursts): engine JS ≈ 1 ms/frame; native "(program)" ≈ 8.5 ms/frame vs 2.9 idle → FX canvas raster ≈ 5.6 ms/frame. A dirty-rect clear changed nothing (reverted). DPR/cap cuts would break parity (reference uses `min(2, dpr)`). Next ideas: per-size device-px sprite cache (no 64 px downscale per draw), batch spark strokes; measure each A/B the same way (profile = `Profiler.start/stop`, self time by function, idle vs stress), then `gh workflow run scheduled.yml --ref wip/PD-11 -f suite=perf`. If nothing moves it: ask the human (frame budget never moves). (3) Gate "convergence at 4× full p95 ≤ 20" fails on main's nightly too (45397054403, `51ef92a`, before PD-11) → not D's split; same family as C-79. (4) C-78 slider press on CI WebKit. (5) Rest of E: Lighthouse (landing 156.5 KB vs 140), Wallet→shop commit long task (FOLLOWUPS 79), 4× traces, visual baselines darwin + Linux, full parity with `PARITY_SET=1`, final full 5-project E2E, gate:task, E closing commit with progress lines. Then F (reviews, QA, H-49, tick, PD-C close).
- **PD-11 plan:** A ✓ B ✓ C ✓ D ✓ E in progress F reviews, QA, H-49 set, tick, PD-C close.
- **Not yet tested:** CI on `dae3b95`; real devices (H-13); C-79 on CI.
- **Before work:** no env/migration changes. A `next dev` from 23 Nov may still listen on :3000 (PID 20343).
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov). Then P1 resumes with the P1-B close. P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **PD-C** (PD-07 + PD-08 on main 23 Nov, PD-09 24 Nov; PD-10 on main 25 Nov; PD-11 next; H-49 at its close). PD-B closed 23 Nov. PD-A closed 22 Nov. P1-B (P1-05..P1-09) complete; its close runs after PD-C.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-25 (~10:45 IST), talha.syed (PD-11 E: KI-53 wipe fix + WebKit waits `dae3b95`, C-82/T-8 closed; next: CI 45548579038, C-79)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; **PD-B closed 23 Nov** (main `d59a2eb`). **PD-07 on main 23 Nov** (CI 45177538333 green). **PD-08 on main 23 Nov** (CI 45211398059 green). **PD-09 on main 24 Nov** (CI 45357702882 green). **PD-10 on main 25 Nov** (`2cb621f`, CI 45467487343 green; gate perf limit T-8 until C-82).

## Next (top 3)
1. CI 45548579038 on `dae3b95` (red → fix first); then C-79 FX raster cost (see Handoff (2)); gate convergence @fps; C-78 on CI.
2. Rest of PD-11 E (Lighthouse, commit long task, 4× traces, baselines, parity + H-49 set, full E2E, gate), then F and the PD-C close (`/subphase-complete`, H-49).
3. Human any time: H-48b, H-45 (🟠), H-38 (branches), H-51 (b).

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-62 | P1-07 | P1-12 | Approvals write `progress_gold` / `ingots_completed`; the Wallet reads rewards-ready count, recent activity, and the last 10 awards for "N more visits"; Wallet statement count unchanged | integration |
| C-66 | P1-08 | P1-12 | Gold Vault streak chip shows the member's current streak from the ledger; tier never goes down when an owner raises a threshold (membership stores the highest tier reached) | integration + E2E |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-68 | P1-09 | P1-11 | Leaving cancels the member's open points requests in `leaveShop`'s transaction; a left member can't request; the shop page's Request points button and pending state | integration + E2E |
| C-69 | P1-09 | P1-12 | Approvals refuse a left membership (progress frozen); the shop page's Recent receipts card lists the last receipts (empty state today) | integration + E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-73 | P1-09 | P1-13 | A rejoin after the 30-day window gets no frozen progress back even if the forfeit job hasn't run yet (forfeit at rejoin, or the join refuses to restore) | integration |
| C-78 | CI 45101535248 (PD-B close) | PD phase gate (PD-11) | Linux WebKit: `molten-fields` slider drag's final track press keeps 720 (3/3 there; passed in CI 45090767908 + 45096798286, host WebKit 6/6): root-caused and the WebKit assertion un-quarantined | CI WebKit run + SESSION_LOG |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | PD-11 (PD-C close) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-81 | PD-10 design review M3 | P1-16 | `RedeemCode` gets `receivedAt` = the phone's `Date.now()` when the redeem response arrives (not at mount), with `serverNow`/`expiresAt` from that response | E2E: a code shown after a delay counts from the response |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate; C-79 / T-7 (pixel7 @fps FX stress quarantine) is re-checked at the PD-C close with the median of 3. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (25 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `dae3b95` (wip): unit wipe-stage 5/5; host E2E wipe + vault × 4 projects × 3: 306/0; wipe @perf 4× pixel7 + desktop1440 4/4; Linux container (1 worker) wipe forward/back 6/6, C-80 + vault changed tests 14/0 (container at 5 workers: 44 false failures, KI-02).
- KI-53 proof: forward wipe with the copy disabled fails `gone` 31–33 frames (iphone14 + pixel7), passes with it.
- CI 45537212442 (`5e97ee4`): all green except WebKit (1 failed C-80 bar + 4 flaky, all KI-10/KI-53 → fixed in `dae3b95`); perf-budget 8/8 at 65 ms (C-82 closed).
- C-79 profile (local, 4×): stress 60.0 fps; "(program)" 8.5 ms/frame vs idle 2.9; engine JS ≈ 1 ms/frame.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
