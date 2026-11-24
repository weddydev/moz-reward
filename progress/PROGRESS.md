# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-24 17:41 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handoff by talha.syed, 24 Nov 2026 ~17:35 UTC (Mac); baton free. Autopilot OFF.**
- **Finished:** nothing ticked. PD-10 advanced on **`wip/PD-10` @ `18fb555`** (pushed; 5 commits on `3826a87`; base main `51ef92a`, main's later commits are progress-only). This session: CI 45404530673's reds root-caused (parity harness traps → KI-47; gate-replay axe scan mid-hand-off → test waits for `done`); app fixes found by parity: pour lands at the fill's end, not after the glint (~700 ms late before); reward heading greedy wrap; stream dash only while pouring; wave still in reduced motion (cured a vault E2E race); code ring wraps under the digits at 320 (+ E2E); component tests `src/components/ui/vault.test.tsx` 15/0; `test:parity <spec>` arg fix; frame-rate p95 median rounded to 0.01 ms (scheduled 45397054403's 16.800000000000068).
- **Half-done: PD-10. Continue exactly here:** (1) **CI 45441098126 on `8379344` RED, WebKit only** (559 passed, 2 failed, 1 flaky): the new `[PD-10] the pour lands when the liquid reaches its level…` (`tests/e2e/vault.spec.ts:530`) fails on Linux webkit + iphone14 (glint not seen running when the line changes; unlock − line < 200 ms; passes on Mac WebKit): KNOWN_ISSUES KI-10 first (starved Linux WebKit frames: read the fill/glint animation clocks, not observer timing), reproduce with `pnpm e2e:linux`; the other failure, `molten-fields` slider drag, is C-78 (known). CI 45448474577 on `18fb555` was running at the handoff: read it. (2) Design review = APPROVE WITH FIXES: **H1** (fix before the tick, test first) first-view pour lacks the reference's "+N" stamp ("+720", reference `pour()` always stamps): stamp `kind === "pour"` in `IngotPour.tsx` ~126 / `src/lib/motion/ingot.ts` ~137 (or a DECISIONS deviation) + a parity frame of the first-view pour ~500 ms; **M2** reduced motion: unlock ring still scales (skip or opacity-only, `IngotPour.tsx` ~383) and `.m-ingot` lift transitions .12 s (`transition: none` under `.rm` / `[data-reduce-motion="true"]`, `ingot-pour.css`) + E2E; **M3** `RedeemCode` measures clock skew at mount: take `skew`/`receivedAt` as a prop captured when the response arrives + CARRIED row to P1-16; **M4** one DECISIONS entry for PD-10's deviations (320 ring wrap, rays spin only when unlocked, stream under the liquid, 1.6 s multi-ingot hold, card fades in reduced motion, dimmed expired state, stamp). LOWs L5–L8 in FOLLOWUPS. (3) `gh workflow run scheduled.yml --ref wip/PD-10 -f suite=perf` (vault 60 fps pour trace, CI only; re-checks PD-09 convergence whose retry read 33.3 ms once). (4) `pnpm gate:task`, acceptance walk, tick PD-10, closing push to main via the hook after CI green.
- **Tested:** `pnpm gate:task` PASS on `5c7536d` (unit 2072/0, int 1456/0/1, PD-10 E2E 6/0, parity PD-10 4/0); on `18fb555`: vault parity 4/4 (Chromium + WebKit, Mac), 320 code-fit E2E 2/2 (desktop1440 + iphone14), pre-push `pnpm check` PASS; vault.spec desktop1440 48/48 (×3); screenshots 320/390/1440 of /dev/molten vault + /vault/<id> inspected; design review run.
- **Not yet tested:** CI 45448474577 on `18fb555` (running); Linux WebKit landing test (red, above); @fps pour trace; real devices (H-13).
- **Before work:** no new env vars, migrations or seeds. WSL laptop: Docker from WSL was down at the previous handoff (KI-46 / Docker Desktop WSL integration).
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov). Then P1 resumes with the P1-B close. P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **PD-C** (PD-07 + PD-08 on main 23 Nov, PD-09 24 Nov; PD-10 in progress on `wip/PD-10`; H-49 at its close). PD-B closed 23 Nov. PD-A closed 22 Nov. P1-B (P1-05..P1-09) complete; its close runs after PD-C.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-24 (~17:35 UTC), talha.syed (handoff; PD-10 on `wip/PD-10` `18fb555`, Linux WebKit landing test + design review H1/M2–M4 next)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; **PD-B closed 23 Nov** (main `d59a2eb`). **PD-07 on main 23 Nov** (CI 45177538333 green). **PD-08 on main 23 Nov** (CI 45211398059 green). **PD-09 on main 24 Nov** (CI 45357702882 green). **PD-10 in progress** (`wip/PD-10` `18fb555`, gate:task PASS on `5c7536d`; CI red on a Linux WebKit landing test; design review H1 + M2–M4 to fix; @fps pour trace left). Scheduled run 45397054403's float failure fixed on the branch (p95 rounding).

## Next (top 3)
1. Finish PD-10 on `wip/PD-10` (`18fb555`): Linux WebKit landing test (CI 45441098126), design review H1 + M2–M4, perf suite dispatch (@fps pour trace + PD-09 convergence), gate, tick → main.
2. PD-11 (restyle sweep, parity close) then the PD-C close (H-49).
3. Human any time: H-48b, H-45 (🟠), H-38 (branches; add `wip/PD-09`), H-51 (b).

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
| C-80 | PD-08 design review M4 | PD-11 (restyle sweep) | The app's shop page shows the reference's compact Gold Vault line (`MiniVault`, `data-wipe-bar` + a `data-rise` slot, so the wipe fills it 420 / 900 ms) beside or instead of the P1-08 vault card, decided with the page restyle; the offers row (`OfferCard`) comes with P3-05 | E2E: the bar fills during the wipe + screenshots 390/1440 |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate; C-79 / T-7 (pixel7 @fps FX stress quarantine) is re-checked at the PD-C close with the median of 3. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (24 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- PD-10 `5c7536d`: `pnpm gate:task` PASS (unit 2072/0, int 1456/0, E2E PD-10 6/0, parity PD-10 4/0 Chromium + WebKit).
- PD-10 CI 45441098126 on `8379344`: RED on WebKit only (new landing test on Linux webkit + iphone14; C-78 slider); every other job green incl. parity. CI 45448474577 on `18fb555` running.
- Scheduled 45397054403 on main: RED (PD-09 @fps convergence float 16.800000000000068; retry 33.3) → rounding on `wip/PD-10`; not re-verified on CI.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
