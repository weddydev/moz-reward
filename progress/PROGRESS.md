# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by talha.syed, 2026-11-26 01:45 IST (25 Nov 20:15 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by talha.syed (Mac), 26 Nov 01:45 IST, mid P1-12 step (f), on the human's request.** Autopilot OFF. Branches: **`wip/P1-12` HEAD `4c0d217`** (steps a–e; pushed; on main `6770f64`, rebase onto main before the closing push) and the scratch branch **`wip/dbg-P1-12-f` HEAD `0ff6b33`** = `4c0d217` + one uncommitted-quality WIP commit for step (f) (pushed; `wip/dbg-*` gets no CI run; it was used so the push didn't cancel CI on `wip/P1-12`, KI-14). **Continue:** `git switch wip/P1-12 && git merge --ff-only origin/wip/dbg-P1-12-f` (fast-forward, then delete the dbg branch), fix the 2 failing tests below, then build the rest of (f).
- **CI first:** run 45689617776 on `4c0d217` was still running at handoff: **perf job GREEN** (so the `b5c4b27` perf red was not repeated), but **WebKit shard 3/4 FAILED** (log only readable once the run ends: `gh run view 45689617776 --log-failed`; search KNOWN_ISSUES first). spec-repeat 45689625606 (gilded-gate ×10, desktop1440): **9/10 passed, 1 failed** (long task 123.8 ms, 103.5 ms in chunk `074w5tig5y7rj.js`; another run 62–75 ms): intermittent, KI-48 symptom → update KI-48 (run ids, 1/10) + a FOLLOWUPS line owned by C-91/P1-18 unless it grows; not caused by P1-12.
- **Done (a–e):** 0029 + DB walls; `65f0bfe` approvals service/actions; `c2538e8` Wallet/Vault/shop-page reads (C-62, C-66, C-69 proofs: rows close with the task); `b5c4b27` receipt PDF (private bucket `S3_PRIVATE_BUCKET`); `4c0d217` same-device fraud flag (C-101/C-102 → P4-08, C-103 → P2-13).
- **Step (f) so far (`0ff6b33`):** `security-reviewer` design check of the staff member-card read: **OK with changes**, applied: migration `drizzle/0030_shop_member_cards.sql` (`shop_member_cards(uuid[])` plpgsql SECURITY DEFINER owned by moz_rls; 3 columns; own shop's members incl. left ones; active staff only via `(SELECT app_shop_role())`; > 100 ids raises 22023; column grants + moz_rls policies), applied locally (`pnpm db:migrate`). Repo `listTeamOpenRequests(scope, {requestedAfter})` + `memberCards()` + `TEAM_QUEUE_LIMIT` 50 in `src/server/repos/point-requests.ts`. Tests `tests/integration/member-cards.test.ts` (+ `shop_member_cards` in the rls.test definer list). Erased-user card → **C-104 → P2-13** (CARRIED_LATER + P2-13 criterion).
- **Remaining for (f):** (1) fix 2 test-setup failures in member-cards.test.ts: the rejected seed row needs `rejectReason` (constraint `point_requests_rejected_has_reason`); the moz_rls member-list assertion (check which roles are members locally/CI and pin exactly those; never moz_app/auth/worker). (2) Page `src/app/(shop)/(pages)/dashboard/requests/page.tsx` (dynamic, `no-store`; requestedAfter = now − `REQUEST_TTL_MS` from `src/server/services/point-request-jobs.ts`): rows with name, member ID, time, visits, last visit; approve (£ amount + items), reject (preset reason + note; labels for `REJECT_REASONS`), owner approve for awaiting_owner; actions in `src/features/requests/actions.ts` (show `res.error.message`). (3) `ShopRealtime` via `useRealtime("/api/sse/shop/<id>", …)` on request_created/request_decided. (4) Test API `relay-realtime {shopId}` in `src/app/api/test/[action]/route.ts`: outbox rows queue `notifications`, job `publish`, `scope_shop_id = shopId`, undispatched → the worker's own `deliverRealtime` → `markDispatched`; add it to the 404-outside-test proof. (5) Authz matrix: the Requests page + `relay-realtime`. (6) E2E J2 `tests/e2e/requests.spec.ts` as planned (realtime, staff + customer contexts, double approve = one receipt, over-limit → owner, reject); screenshots 320/390/1440. Names never in logs/SSE payloads. FOLLOWUPS LOW added: admin view-as-shop gets no cards (needs the admin read + audit).
- **At close:** unchanged: rebase onto main; DECISIONS staff initials; COMPLIANCE §2.6 (fraud_flags G6) + §2.7 DSAR rows; FOLLOWUPS VALIDATE 0029's NOT VALID checks; CARRIED C-100 → P1-C close; `security-reviewer` on the final diff; gate:task.
- **Tested:** `pnpm typecheck` PASS on the (f) work; `member-cards.test.ts` 5/7 (every `shop_member_cards` access case passes: own/left member, other shop, forged scope, deactivated staff, customer, admin, empty/NULL, > 100 raises); 2 fail on setup only. **Not yet tested:** the rest of int/unit on the (f) diff; CI on `4c0d217` (WebKit 3/4 red, other shards still running); receipt PDFs on staging (H-08b); C-95; P1-11 on staging. **First thing next session:** `pnpm db:migrate` (0030).
## Status
- **Phase:** **P1 — Core loyalty** (PD closed 25 Nov; P1-B closed 25 Nov). P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **P1-C** in progress (P1-10, P1-11 done; P1-12 on `wip/P1-12`). P1-B closed 25 Nov (reviews, QA, H-49 approved; Sentry held until P2, C-88). PD-C closed 25 Nov, PD-B 23 Nov, PD-A 22 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-26, talha.syed (handoff mid P1-12 step f: `wip/P1-12` `4c0d217` + `wip/dbg-P1-12-f` `0ff6b33`)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `f588a5e` since 25 Nov, P1-B close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. Read CI 45689617776's WebKit 3/4 failure; fast-forward `wip/P1-12` to `wip/dbg-P1-12-f`; fix the 2 member-cards test setups; then the requests page, realtime, test relay, authz rows and J2 E2E (Handoff note); then the close list; then P1-13.
2. Human any time: H-45 (🟠), H-38 (branches), H-51 (b); H-48b at P2 start, after the first demo (C-88).

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-62 | P1-07 | P1-12 | Approvals write `progress_gold` / `ingots_completed`; the Wallet reads rewards-ready count, recent activity, and the last 10 awards for "N more visits"; Wallet statement count unchanged | integration |
| C-66 | P1-08 | P1-12 | Gold Vault streak chip shows the member's current streak from the ledger; tier never goes down when an owner raises a threshold (membership stores the highest tier reached) | integration + E2E |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-69 | P1-09 | P1-12 | Approvals refuse a left membership (progress frozen); the shop page's Recent receipts card lists the last receipts (empty state today) | integration + E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-73 | P1-09 | P1-13 | A rejoin after the 30-day window gets no frozen progress back even if the forfeit job hasn't run yet (forfeit at rejoin, or the join refuses to restore) | integration |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | P1-18 (moved from PD-11, human 25 Nov) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-81 | PD-10 design review M3 | P1-16 | `RedeemCode` gets `receivedAt` = the phone's `Date.now()` when the redeem response arrives (not at mount), with `serverNow`/`expiresAt` from that response | E2E: a code shown after a delay counts from the response |
| C-83 | PD-11 CI 45548579038 | P1-18 | Linux-WebKit-only failures quarantined on CI WebKit (T-9): `molten-controls` /dev/ui 320 overflow 44 px, `shop-page` leave on day 1 (iphone14): root-caused, fixed, fixmes removed. Also from PD-11 E: gate "convergence at 4× full p95 ≤ 20" (fails on main's nightly 45397054403 too); Wallet→shop commit long task (FOLLOWUPS 79) | CI WebKit green with the tests active + nightly perf |
| C-86 | P1-B close C-84 reward trace | P1-15 | The reward moment's first play has one long task of 182–288 ms at 4× CPU (repeat plays none): root-caused, fixed, `vault.spec` "[PD-10] the reward moment … @perf" un-quarantined; T-10 closed | @perf spec active and green + SESSION_LOG |
| C-91 | P1-10 (Lighthouse on main `79b19bc` and `wip/P1-10`, 25 Nov) | P1-18 | Landing `/s/[code]` Lighthouse mobile: LCP 4.21 s (budget 2.50; was 0.80 at P1-02) and JS 163.4 KB gzip (band 140) on main itself, score 82–85: root-caused and back inside budget (FOLLOWUPS 80 trim + the LCP regression) | `pnpm test:lighthouse` landing PASS + SESSION_LOG |
| C-95 | P1-10 (edge case: proxy buffering) | P1-C close (`/subphase-complete`) | An authenticated `/api/sse/me` stream on staging through Cloudflare + Caddy (`flush_interval -1`) delivers `ready` at once and a heartbeat comment every 25 s (no buffering) | curl/browser trace on staging + SESSION_LOG |
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
- P1-12 (e) `4c0d217` (`wip/P1-12`): int fraud-award-check 14/0; approvals+receipt-pdf 44/0; related int (receipt-download, point-requests, db-foundation, rls, approvals-db, receipts, wallet) 108/0; `pnpm check` PASS (unit 2225/0); ESLint device-signal rule proven to fire on a non-fraud import. CI 45689617776 running; `b5c4b27` CI 45687131601 red (perf gate spec only, see Handoff).
- P1-12 (d) `b5c4b27` (`wip/P1-12`): unit receipt-pdf 17/0, shop view 18/0, env+jobs 81/0; int receipt-pdf 7/0, receipt-download 7/0, approvals+db+storage+receipts+wallet 58/0; authz receipts 26/0; E2E shop-page `--grep P1-12` 5/5 on 5 projects (production build), screenshots 320/390/1440 inspected; pre-push check (unit 2225/0) + SAST PASS. CI pending.
- P1-12 (c) `c2538e8`: CI 45683593425 green.
- Main `da8a321` (gate inline script 68 ms): CI 45674369167 green (all jobs); gate:task PASS (unit 2199/0, int 1540/0/1).
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
