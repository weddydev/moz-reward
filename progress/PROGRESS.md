# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-28 12:44 IST (07:14 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint 28 Nov 2026 ~09:30 UTC, talha.syed (Mac), baton held.** KI-90 fix landed on main (`1795e5e`). Three wip branches:
  1. **`wip/wallet-quarantine`, HEAD `3af74b5`** (on main `1795e5e`): main CI 46126763689 is **red** on one intermittent spec, `wallet.spec.ts:297` (Enter on a Wallet card didn't navigate; desktop1440, shard + 1/5 alone; spec-repeat 46128861729 20/20 green, cause not found → quarantined on desktop1440 with failure diagnostics, C-113, KI-83 updated). **Next:** when CI on `3af74b5` is green, `git switch wip/wallet-quarantine && git merge origin/main` (progress-only diff) and push to main. Then remove the scratch worktree `../moz-dbg-wallet` (`git worktree remove ../moz-dbg-wallet`) and add `wip/dbg-wallet-enter` to H-38.
  2. **`wip/P2-01`, HEAD `871bbe5`** (on `1795e5e`): P2-01 steps A+B + owner shell visual baselines (darwin + linux regenerated, inspected). **CI 46127051817 green** (all jobs incl. perf; the earlier perf red on `f089691` was a slow runner, KI-48). Only C-88 left: **H-48b not done yet** (asked 28 Nov). Then closing commit on main (PHASES tick, PROGRESS, SESSION_LOG) after merging main in; it needs main green first.
  3. **`wip/P2-02`, HEAD `5f5ee28`** (stacked on `wip/P2-01` `871bbe5`): **step A done** = migration 0038 (team `scan` insert policy + guard), `src/server/repos/scan-awards.ts`, `src/server/services/scan-awards.ts` (`scanAward`: token or typed member ID, M5 re-verify, replay by key, `open_request` hand-back, one answer for non-members), `scanAwardAction` + `scanAwardInput` in `src/features/requests/`, authz matrix + cross-shop test; int+authz 81/0 locally; DECISIONS 28 Nov "P2-02 scan awards". CI on `5f5ee28` running (not yet seen).
- **P2-02 next steps:** **B** Requests page: 4 tabs per PRODUCT §14 (Pending / Awaiting owner / Approved today / Expired), cursor pagination, approve side panel (desktop) / number-pad sheet (mobile) with quick-picks, live gold preview, reject reasons; new-row slide-in + `tick` sound. **C** scanner: `BarcodeDetector` or lazy decoder, camera explainer, torch, manual member-ID entry (extend `verifyMemberQrAction` to take `{memberId}` so staff see the name before awarding), check `Permissions-Policy camera=self` on the scanner page (SECURITY §5). **D** E2E journey 4 (mocked camera), keyboard-only approve, C-107 (`ReceiptCard print="dashboard"` 400 ms), screenshots 320/390/1440. At P2-02 close: move C-96 row + criterion to P2-05 (DECISIONS 28 Nov).
- **Not yet tested:** CI on `3af74b5` and `5f5ee28`; WebKit for scan/dashboard specs only on CI.
## Status
- **Phase:** **P2 next.** P1 — Core loyalty **closed 27 Nov** (human; demo walkthrough H-55 and side-by-side H-54 with the human). PD closed 25 Nov. P0 closed 17 Nov (human).
- **Current sub-phase:** **P2-A · Shop operations** (brief review done 28 Nov; P2-A CARRIED rows moved here; P2-B/P2-C rows stay in CARRIED_LATER until their sub-phase starts, DECISIONS 28 Nov). **P1 closed 27 Nov** (P1-18 closed fast 27 Nov; P1-D, P1-C 26–27 Nov; P1-B 25 Nov). PD-C closed 25 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-28, talha.syed (checkpoint: KI-90 on main; wallet flake quarantined on wip (C-113); P2-01 CI green, waits H-48b; P2-02 step A on wip)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **P1-D:** P1-14 closed 26 Nov (member QR, offline card); P1-15 closed 27 Nov (celebrations; C-86 fixed); P1-16 closed 27 Nov (rewards ready lists, redeem codes as HMAC, staff confirm on Requests, guessing budget, reward validity); P1-17 closed 27 Nov (nightly integrity reconciliation, admin trigger). **P1-D closed 27 Nov.** **P1-18 closed fast 27 Nov** (human).
- **P1-C:** closed 26 Nov (P1-10..P1-13, P1-19, the close; C-95 SSE through Cloudflare + Caddy verified on staging).
- **Staging live** (release `4a1a912` since 26 Nov, `c12dfc8` next once main's CI is green, P1-C close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. Land `wip/wallet-quarantine` (`3af74b5`) on main once its CI is green (main red, C-113).
2. P2-02 step B (Requests page tabs + approve panel/number pad) on `wip/P2-02`, then C (scanner) and D (E2E J4, C-107).
3. P2-01 close as soon as H-48b is done (C-88; CI already green on `871bbe5`). Human any time: H-48b (🟠, now), H-45, H-53, H-38, H-51 (b), H-08b (needed by P2-05).

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-88 | P1-B close (human 25 Nov: Sentry held until the first demo) | P2-01 | Sentry reviewed for every staging release since 22 Nov (H-48b done): no unexplained new errors, each one fixed or a FOLLOWUPS line; the P1-B close and P1 close recorded Sentry as "deferred, H-48b" | H-48b done + SESSION_LOG |
| C-96 | P1-12 design check (MEDIUM 10) | P2-02 → P2-05 at the P2-02 close (DECISIONS 28 Nov) | Approve form: optional receipt photo (`receiptPhotoKey`), accepted only as a key the server issued to this shop under `incoming/` through the SECURITY §8 presigned upload, never a free-form key; P1-12 ships without it | integration + E2E |
| C-107 | P1-15 (DESIGN §8.5 dashboard variant) | P2-02 | After an approval the dashboard shows the receipt with the 400 ms print and no stamp bounce (`ReceiptCard print="dashboard"`, built in P1-15 and previewed on /dev/motion) | E2E: approve → receipt card printed (keyframes, 400 ms) |
| C-113 | main CI 46126763689 (28 Nov) | P2-16 (phase gate) | `[P1-18] Enter on a Wallet card` quarantined on desktop1440: Enter sometimes doesn't navigate (URL stays /wallet, wipe never starts); root-cause from the spec's failure diagnostics, then un-quarantine (KI-83) | spec-repeat desktop1440 ×20 green after the fix |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40, C-79 / T-7, C-83 / T-9, C-105 / T-12, C-106 and C-111 now block P2-16 (P1-18 fast close, human 27 Nov). Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (28 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- KI-90 on main: CI 46124676339 on `441e3cb` green (all jobs incl. image + Trivy); pushed to main as `1795e5e` (hook: CI passed on every job). Main CI 46126763689 red only on the C-113 wallet flake.
- P2-01 `871bbe5`: CI 46127051817 green (all jobs); owner shell baselines regenerated darwin + linux, 4 screenshots inspected.
- P2-02 step A `5f5ee28`: int + authz 81/0 (scan-awards 13, approvals, approvals-db, point-requests, approvals.authz incl. scanAwardAction matrix); typecheck + lint green; pre-push `pnpm check` + sast passed. NOT VERIFIED: CI on `5f5ee28`.
- C-113: spec-repeat 46128861729 (wallet Enter ×20, desktop1440) green; quarantine `3af74b5` pre-push check + sast passed. NOT VERIFIED: CI on `3af74b5`.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
