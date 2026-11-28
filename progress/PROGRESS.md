# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-28 12:44 IST (07:14 UTC)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint 28 Nov 2026 08:25 UTC, talha.syed (Mac), baton held.** P2-01 step B built, gate:task PASS on it; KI-90 fix rebased onto main. Two wip branches, stacked, neither on main yet:
  1. **`wip/apt-refresh`, HEAD `441e3cb`** (= `fba3d91` rebased onto `2aa1f1b`): KI-90 fix (Trivy HIGH libzstd1; main CI red since 46119536513). `fba3d91`'s CI went green on a re-run (46121459459 attempt 2; attempt 1's perf job hit KI-48 on a slow runner, 3/3). CI on `441e3cb`: push 46124522801 + dispatch 46124676339 (image + Trivy). **Next:** when both are green, `git switch wip/apt-refresh && git merge origin/main` (only progress files differ, so the hook accepts it via the green ancestor) and push it to main; then check main's CI image job.
  2. **`wip/P2-01`, HEAD `f089691`** (on `441e3cb`): step A `b8a085f` + step B `f089691` = Overview page (KPIs with icons + sparklines, live queue top 5 via `RequestsQueue`, suggestions/happy hour/feedback placeholders, HTML-bar weekly chart `VisitsChart`, owner-only plan banner), `KpiCard` icon prop, `observeQueries` now passes params, scale test `tests/scale/dashboard.scale.test.ts`, E2E `tests/e2e/dashboard.spec.ts`, KI-91 (molten `display` beats Tailwind `lg:hidden`) + KI-48 note. CI 46124658901 running.
- **P2-01 left before the tick:** (a) **C-88 needs H-48b (human)**: Sentry review, then SESSION_LOG line; (b) CI green on `f089691`; (c) owner shell visual baselines (`shell-owner-390/1440`, darwin + linux; chart + greeting now masked) regenerate with `pnpm e2e:visual --update-snapshots` for that test (gate:phase runs @visual); (d) closing commit on main: PHASES tick, PROGRESS, SESSION_LOG (after rebasing P2-01 onto main once apt-refresh lands: needs its own CI). Every acceptance criterion except C-88 has evidence (SESSION_LOG 28 Nov).
- **Half-done:** P2-01 (built and gated; waiting on H-48b + CI). **Not yet tested:** CI 46124522801, 46124676339 (`441e3cb`), 46124658901 (`f089691`); WebKit for the dashboard spec runs only on CI. Main stays red until `441e3cb` lands.
## Status
- **Phase:** **P2 next.** P1 — Core loyalty **closed 27 Nov** (human; demo walkthrough H-55 and side-by-side H-54 with the human). PD closed 25 Nov. P0 closed 17 Nov (human).
- **Current sub-phase:** **P2-A · Shop operations** (brief review done 28 Nov; P2-A CARRIED rows moved here; P2-B/P2-C rows stay in CARRIED_LATER until their sub-phase starts, DECISIONS 28 Nov). **P1 closed 27 Nov** (P1-18 closed fast 27 Nov; P1-D, P1-C 26–27 Nov; P1-B 25 Nov). PD-C closed 25 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-28, talha.syed (checkpoint: P2-01 steps A+B on wip, gate PASS; KI-90 fix rebased, CI running)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **P1-D:** P1-14 closed 26 Nov (member QR, offline card); P1-15 closed 27 Nov (celebrations; C-86 fixed); P1-16 closed 27 Nov (rewards ready lists, redeem codes as HMAC, staff confirm on Requests, guessing budget, reward validity); P1-17 closed 27 Nov (nightly integrity reconciliation, admin trigger). **P1-D closed 27 Nov.** **P1-18 closed fast 27 Nov** (human).
- **P1-C:** closed 26 Nov (P1-10..P1-13, P1-19, the close; C-95 SSE through Cloudflare + Caddy verified on staging).
- **Staging live** (release `4a1a912` since 26 Nov, `c12dfc8` next once main's CI is green, P1-C close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. Land `wip/apt-refresh` (`441e3cb`) on main (main CI red, KI-90). P2-01 close once H-48b is done (C-88) and CI is green on `f089691`. Then P2-02 (note: C-96 receipt photo needs the P2-05 upload pipeline), P2-03, P2-04.
2. Human any time: H-45 (🟠), H-53 (🟢 rotate staging password before launch), H-38 (branches, list updated 26 Nov), H-51 (b), H-08b (buckets: receipt PDFs + uploads, needed by P2-05); **H-48b now** (Sentry review, C-88 blocks the P2-01 tick).

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
| C-96 | P1-12 design check (MEDIUM 10) | P2-02 | Approve form: optional receipt photo (`receiptPhotoKey`), accepted only as a key the server issued to this shop under `incoming/` through the SECURITY §8 presigned upload, never a free-form key; P1-12 ships without it | integration + E2E |
| C-107 | P1-15 (DESIGN §8.5 dashboard variant) | P2-02 | After an approval the dashboard shows the receipt with the 400 ms print and no stamp bounce (`ReceiptCard print="dashboard"`, built in P1-15 and previewed on /dev/motion) | E2E: approve → receipt card printed (keyframes, 400 ms) |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40, C-79 / T-7, C-83 / T-9, C-105 / T-12, C-106 and C-111 now block P2-16 (P1-18 fast close, human 27 Nov). Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (28 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- KI-89 `994daed`: CI 46033221996 green (wip/demo-fixes-2, all jobs); pushed to main 28 Nov (hook: CI passed on every job). Staging: deploy 46033819447 (`36ac629`) success, `seed-reset staging: done` 27 Nov 16:31 UTC. NOT VERIFIED: main CI + deploy of `994daed` (running at handoff).
- Demo fixes: gate:task PASS (unit 2366/0, int 1908/0, build, sast); E2E redemption/point-requests/celebrations/ui-gallery/fx chromium+webkit+iphone14 118/0 (+1 KI-77 load flake, 3/3 alone); CI 46019463277 green (parity, perf); Wallet rail 1440 + redeem sheet 390 screenshots inspected.
- P1 close: celebration @fps + @perf (FPS=1 PERF=1, chromium) 2/2 after KI-87 (each sample ends with the moment, ~3.9 s, was 12 s cap); staging `seed-reset staging: done` 11:58 + demo sign-in check ok; KI-87 spec fix CI 45995805698 green, on main; staging deployed `20252fb` (main CI 45994270566 green on re-run, C-106 flake).
- P1 close (main): CI on rebased `3a87a43` 45992063576 green (f6ba211 45989769059 green); celebrations focus ×10 + skip ×10 green on CI iPhone14; overlay unit 43/0; E2E landing/shop-page/ui-states/member-card chromium+webkit+iphone14 107/0; Lighthouse JS 161.5 / 193.3 / 219.0 KB (accepted ceilings), LCP observed 0.15–0.2 s (lantern varies, KI-86).
- P1 close (wip `d1bc003`): unit 321/0 (rewards + components/ui), E2E celebrations/redemption/vault/wallet/shop-page chromium+webkit+iphone14 113/0 + 15/0 + 3/0; receipt 320 screenshots inspected (words whole); Lighthouse: landing LCP 0.77–0.80 s ×6, JS 164.8 KB (fail), wallet 196.4 KB (fail), shop page LCP 1.06 s / JS 221.4 KB (fail). NOT VERIFIED: CI on `d1bc003`.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
