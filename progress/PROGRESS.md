# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-25 00:30 IST (24 Nov 19:00 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **P1-B closed 25 Nov 2026, talha.syed (Mac); baton held. Autopilot OFF.** Everything is on main (`wip/P1-B-close` landed; the worktree `../moz-P1-B-close` can be removed). Next: **P1-10 · Realtime (SSE) infrastructure**: start a new `wip/P1-10` from main; read CARRIED rows targeting P1-10 first (C-28 SSE jittered `retry:`, C-58 programme-change notice).
- **P1-B close done:** reviews (code, security, design) of PD-C + fixes; design HIGH Wallet header + 2 MEDs; QA (1 HIGH + 3 MEDIUM fixed, 8 LOW → FOLLOWUPS); H-49 parity approved by the human; CI fixes KI-56/57/58/59; visual baselines darwin + linux. Sentry held until P2 start (C-88, H-48b).
- **Not yet tested:** staging journeys behind basic auth by hand (the deploy's own smoke passed: health ready/live, staging checks C-23/C-36/C-38, demo sign-in); Sentry for releases since 22 Nov (held, C-88). Staging runs `f588a5e`; `480285a` (KI-59 test-only fix) reaches staging with the next deploy.
- **Before work:** no env/migration changes.
## Status
- **Phase:** **P1 — Core loyalty** (PD closed 25 Nov; P1-B closed 25 Nov). P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **P1-C** next, from P1-10. P1-B closed 25 Nov (reviews, QA, H-49 approved; Sentry held until P2, C-88). PD-C closed 25 Nov, PD-B 23 Nov, PD-A 22 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-25, talha.syed (P1-B closed; next P1-10)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `f588a5e` since 25 Nov, P1-B close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. P1-10 · Realtime (SSE) infrastructure (CARRIED C-28, C-58).
2. P1-11 after it.
3. Human any time: H-45 (🟠), H-38 (branches), H-51 (b); H-48b at P2 start, after the first demo (C-88).

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
| C-78 | CI 45101535248 (PD-B close) | P1-18 (moved from PD-11, human 25 Nov) | Linux WebKit: `molten-fields` slider drag's final track press keeps 720 (3/3 there; passed in CI 45090767908 + 45096798286, host WebKit 6/6): root-caused and the WebKit assertion un-quarantined | CI WebKit run + SESSION_LOG |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | P1-18 (moved from PD-11, human 25 Nov) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-81 | PD-10 design review M3 | P1-16 | `RedeemCode` gets `receivedAt` = the phone's `Date.now()` when the redeem response arrives (not at mount), with `serverNow`/`expiresAt` from that response | E2E: a code shown after a delay counts from the response |
| C-83 | PD-11 CI 45548579038 | P1-18 | Linux-WebKit-only failures quarantined on CI WebKit (T-9): `molten-controls` /dev/ui 320 overflow 44 px, `gilded-gate` src=qr ends 6.8 s vs < 4.88 s, `shop-page` leave on day 1 (iphone14): root-caused, fixed, fixmes removed. Also from PD-11 E: gate "convergence at 4× full p95 ≤ 20" (fails on main's nightly 45397054403 too); Wallet→shop commit long task (FOLLOWUPS 79) | CI WebKit green with the tests active + nightly perf |
| C-86 | P1-B close C-84 reward trace | P1-15 | The reward moment's first play has one long task of 182–288 ms at 4× CPU (repeat plays none): root-caused, fixed, `vault.spec` "[PD-10] the reward moment … @perf" un-quarantined; T-10 closed | @perf spec active and green + SESSION_LOG |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate; C-79 / T-7 (pixel7 @fps FX stress) and C-83 / T-9 (Linux-WebKit-only quarantines) block P1-18. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (25 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- Main `f588a5e`: CI 45585092326 green; staging deploy 45587066510 green (health ready/live, staging checks, demo sign-in ok).
- `480285a` (KI-59, test-only): CI 45586152876 green (no flake warnings); host 20/20 webkit + iphone14, wipe spec 43/0, mutation (no rise) fails as it should.
- KI-58: mid-wipe reduced-motion spec 40/40 webkit + iphone14. QA batch `6a006c7`: gate:task PASS, visual darwin + linux 10/0.
- H-49 approved by the human (25 Nov): /dev/ui perfect, /dev/motion motion perfect.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
