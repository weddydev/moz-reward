# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-26 05:27 IST (25 Nov 23:57 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **P1-C close in progress (26 Nov, talha.syed, Mac)** on `wip/P1-C-close` (pushed, HEAD `470b216`, on main `3ad7427`; worktree `../moz-P1-C-close`). Autopilot OFF. Commits: C-94 `c2c4af4`, C-92/C-93 `ab00bb4`, fixes `179431d` (Scan coin stole taps from Offers/Market, KI-67; 3 flakes fixed; security M1 queue per user, M2 sweep audit), docs `1f68b88`, review batch `470b216`.
- **CI:** 45776909717 (`179431d`) red on WebKit: overlays toast axe + ui-gallery C-93 = the /dev/ui expiring-code toast (fixed in `470b216`), molten-fields = confirmed flake (FOLLOWUPS). **CI on `470b216` running at stop: read it first**; red → fix at the cause (spec-repeat on CI, not the Mac container: it timed out everything under load).
- **Reviews done:** security re-check M1/M2 CLOSED; design PASS WITH FIXES (M1 entrance + roll-end swap, M2 DECISIONS, M3 = P1-12 screenshots still to capture+inspect); code APPROVE WITH FIXES (M1 reversal note fixed: reason only). **Left (MEDIUM, fix before close):** code M2 customer sees reversal shortfall (Vault/shop page + E2E), code M3 owner badge/count for `awaiting_owner` on the Requests nav (live + E2E). Then scoped QA (qa-engineer: shop page, Requests, /dev/ui; it must stop any worker/server it starts, KI-68), human side-by-side of C-92/C-93/C-94, rebase, merge to main, staging deploy + smoke + C-95 (Claude: SSE trace through the site gate, password from the human, never stored, T-11), close commit (PHASES tick, SESSION_LOG, CARRIED).
- **Not yet tested:** CI on `470b216`; C-95 on staging; P1-11..P1-13 on staging; the human's side-by-side.
## Status
- **Phase:** **P1 — Core loyalty** (PD closed 25 Nov; P1-B closed 25 Nov). P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **P1-C** in progress (P1-10..P1-13 done; next the P1-C close). P1-B closed 25 Nov (reviews, QA, H-49 approved; Sentry held until P2, C-88). PD-C closed 25 Nov, PD-B 23 Nov, PD-A 22 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-26, talha.syed (P1-C close checkpoint)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `f588a5e` since 25 Nov, P1-B close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. P1-C close: CI on `470b216`, code-review M2/M3, P1-12 screenshots, QA, human side-by-side C-92/93/94, merge, staging + C-95 (Handoff note).
2. Human any time: H-45 (🟠), H-53 (🟢 rotate staging password before launch), H-38 (branches, now also `wip/P1-12`, `wip/dbg-P1-12-f`), H-51 (b), H-08b (private bucket for receipt PDFs); H-48b at P2 start.

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | P1-18 (moved from PD-11, human 25 Nov) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-81 | PD-10 design review M3 | P1-16 | `RedeemCode` gets `receivedAt` = the phone's `Date.now()` when the redeem response arrives (not at mount), with `serverNow`/`expiresAt` from that response | E2E: a code shown after a delay counts from the response |
| C-83 | PD-11 CI 45548579038 | P1-18 | Linux-WebKit-only failures quarantined on CI WebKit (T-9): `molten-controls` /dev/ui 320 overflow 44 px, `shop-page` leave on day 1 (iphone14): root-caused, fixed, fixmes removed. Also from PD-11 E: gate "convergence at 4× full p95 ≤ 20" (fails on main's nightly 45397054403 too); Wallet→shop commit long task (FOLLOWUPS 79) | CI WebKit green with the tests active + nightly perf |
| C-86 | P1-B close C-84 reward trace | P1-15 | The reward moment's first play has one long task of 182–288 ms at 4× CPU (repeat plays none): root-caused, fixed, `vault.spec` "[PD-10] the reward moment … @perf" un-quarantined; T-10 closed | @perf spec active and green + SESSION_LOG |
| C-91 | P1-10 (Lighthouse on main `79b19bc` and `wip/P1-10`, 25 Nov) | P1-18 | Landing `/s/[code]` Lighthouse mobile: LCP 4.21 s (budget 2.50; was 0.80 at P1-02) and JS 163.4 KB gzip (band 140) on main itself, score 82–85: root-caused and back inside budget (FOLLOWUPS 80 trim + the LCP regression) | `pnpm test:lighthouse` landing PASS + SESSION_LOG |
| C-95 | P1-10 (edge case: proxy buffering) | P1-C close (`/subphase-complete`) | An authenticated `/api/sse/me` stream on staging through Cloudflare + Caddy (`flush_interval -1`) delivers `ready` at once and a heartbeat comment every 25 s (no buffering) | curl/browser trace on staging + SESSION_LOG |
| C-100 | P1-12 (receipt PDFs, private bucket) | P1-18 (DECISIONS 26 Nov) | After H-08b: a receipt PDF downloads on staging from both routes; an anonymous GET of the private bucket and of the `cdn.` host's `receipts/` path is not 200 | curl on staging + SESSION_LOG |
| C-92 | Human, H-49 side-by-side re-check (25 Nov) | P1-C close (`/subphase-complete`) | Button tap: the **coin animation** that plays in the Molten demo (`design/reference/molten/`) doesn't play in the app's Button. Match the demo exactly (same trigger, timing, reduced-motion fallback); add the part to the parity harness so it can't drift again | parity spec (frames) + side-by-side check by the human |
| C-93 | Human, H-49 side-by-side re-check (25 Nov) | P1-C close (`/subphase-complete`) | Fluid tabs (gold blob gliding left/right): the **spark after the blob settles** shows in some examples but not all. It must appear on every tabs/segmented instance that the demo shows it on (every variant, every direction) | parity spec per variant + side-by-side check by the human |
| C-94 | Human (25 Nov) | P1-C close (`/subphase-complete`) | `/dev/ui` shows **every component built** (incl. Slider, StarRating, MemberCard and any other Molten part made in PD/P1 that isn't there yet), each in its states, so the human can review them side by side with the demo | E2E: each component visible on /dev/ui + screenshot 320/1440 |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate; C-79 / T-7 (pixel7 @fps FX stress) and C-83 / T-9 (Linux-WebKit-only quarantines) block P1-18. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (26 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- P1-13 closed: gate:task PASS (unit 2254/0, int 1724/0/1, sast; no E2E: no UI); points-expiry int 20/0 (injected clock, month end, BST, C-73 rejoin, 0031 walls); dry run on seed data (SESSION_LOG). CI 45733852636 green (re-run).
- P1-12 closed: gate:task PASS on rebased `wip/P1-12` (unit 2235/0, int 1704/0/1, sast, e2e P1-12 Linux Chromium 18/0); E2E requests.spec + shop-page 55/55 on 5 projects (production build); screenshots 320/390/1440 inspected; security-reviewer final diff OK (2 LOW: FOLLOWUPS + C-104). CI 45728932726 green.
- `e21ed4c` CI 45725890665 green (WebKit receipts fix, KI-10 resize note).
- Main `da8a321` (gate inline script 68 ms): CI 45674369167 green (all jobs).
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
