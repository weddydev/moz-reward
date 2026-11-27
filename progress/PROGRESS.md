# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-27 (resume)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **P1 closed 27 Nov (human: "close it fast"; talha.syed, Mac).** On main: C-91 (human-accepted JS ceilings 161.5 / 193.3 / 219.0 KB), C-112, the iPhone14 CI fixes (KI-85), the celebration @fps loop fix (KI-87, scheduled 45988427357 timed out). Staging demo data reset 27 Nov 11:58 (`seed-reset staging: done`, as `talha@`; root login is off).
- **With the human (not blocking P2 work; P2-16 can't tick while open):** H-55 Demo 2 walkthrough (C-49 demo half), H-54 side-by-side (C-92/93/94). Rows in CARRIED_LATER.
- **Watch:** FOLLOWUPS P2-16: a 229 ms idle long task right after a celebration at 4× CPU (outside the moment's window); Lighthouse LCP flips under lantern (KI-86); the undone `getImageProps` trim.
- **Next steps:** P2 start: brief review of `docs/phases/P2.md` (CLAUDE.md §1 "Phase start"), move P2 rows from CARRIED_LATER into the CARRIED table, H-48b (Sentry) at P2 start; then the first P2 task.
## Status
- **Phase:** **P2 next.** P1 — Core loyalty **closed 27 Nov** (human; demo walkthrough H-55 and side-by-side H-54 with the human). PD closed 25 Nov. P0 closed 17 Nov (human).
- **Current sub-phase:** none open: P2 starts with its brief review. **P1 closed 27 Nov** (P1-18 closed fast 27 Nov; P1-D, P1-C 26–27 Nov; P1-B 25 Nov). PD-C closed 25 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-27, talha.syed (P1 closed; P2 next)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **P1-D:** P1-14 closed 26 Nov (member QR, offline card); P1-15 closed 27 Nov (celebrations; C-86 fixed); P1-16 closed 27 Nov (rewards ready lists, redeem codes as HMAC, staff confirm on Requests, guessing budget, reward validity); P1-17 closed 27 Nov (nightly integrity reconciliation, admin trigger). **P1-D closed 27 Nov.** **P1-18 closed fast 27 Nov** (human).
- **P1-C:** closed 26 Nov (P1-10..P1-13, P1-19, the close; C-95 SSE through Cloudflare + Caddy verified on staging).
- **Staging live** (release `4a1a912` since 26 Nov, `c12dfc8` next once main's CI is green, P1-C close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. P2 start: brief review of `docs/phases/P2.md`, P2 rows from CARRIED_LATER into CARRIED, H-48b; then the first P2 task. Human: H-55 demo walkthrough, H-54 side-by-side.
2. Human any time: H-45 (🟠), H-53 (🟢 rotate staging password before launch), H-54 (🟢 side-by-side C-92/93/94, by the P1 phase close), H-38 (branches, list updated 26 Nov), H-51 (b), H-08b (private bucket for receipt PDFs); H-48b at P2 start.

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40, C-79 / T-7, C-83 / T-9, C-105 / T-12, C-106 and C-111 now block P2-16 (P1-18 fast close, human 27 Nov). Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (27 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- P1 close: celebration @fps + @perf (FPS=1 PERF=1, chromium) 2/2 after KI-87 (each sample ends with the moment, ~3.9 s, was 12 s cap); staging `seed-reset staging: done` 11:58 + demo sign-in check ok; KI-87 spec fix CI 45995805698 green, on main; staging deployed `20252fb` (main CI 45994270566 green on re-run, C-106 flake).
- P1 close (main): CI on rebased `3a87a43` 45992063576 green (f6ba211 45989769059 green); celebrations focus ×10 + skip ×10 green on CI iPhone14; overlay unit 43/0; E2E landing/shop-page/ui-states/member-card chromium+webkit+iphone14 107/0; Lighthouse JS 161.5 / 193.3 / 219.0 KB (accepted ceilings), LCP observed 0.15–0.2 s (lantern varies, KI-86).
- P1 close (wip `d1bc003`): unit 321/0 (rewards + components/ui), E2E celebrations/redemption/vault/wallet/shop-page chromium+webkit+iphone14 113/0 + 15/0 + 3/0; receipt 320 screenshots inspected (words whole); Lighthouse: landing LCP 0.77–0.80 s ×6, JS 164.8 KB (fail), wallet 196.4 KB (fail), shop page LCP 1.06 s / JS 221.4 KB (fail). NOT VERIFIED: CI on `d1bc003`.
- P1-18 (wip, not ticked): `pnpm test:mutation` 93.22% (break 80; engine 94.97, redeem 90.32, replay 90.63, codes 92.06, return-to 88.57, policies 93.75); C-17 survivors reviewed; `pnpm check` 2336 unit (gallery fix after); int redemptions+alerts 48/0, approvals 24/0; E2E wallet/vault/member-card/redemption chromium+webkit+iphone14 green locally; CI `99493c4` red (shine spec on lite CI, fixed). NOT VERIFIED: full 5-project E2E (local run void), CI on `3424140`.
- P1-D closed: `2972bc7` CI 45920008983 green (f07def4 CI 45916814961 green); gate:task PASS (unit 2315/0, int 1904/0/1, sast); reviews code/security/design all HIGH+MEDIUM fixed; QA 2 MAJOR fixed (New code contrast ≥ 4.5, celebration CLS 0.189 → ≤ 0.05), 5 MINOR logged; staging smoke OK; Sentry deferred (H-48b).
- P1-17 closed: gate:task PASS (unit 2313/0, int 1898/0/1, sast; no UI); integrity int 11/0 (each check clean + corrupted, demo seed clean, open issue kept, fixed resolved, overlap skip, keyset pages, read-only sums); authz 1 matrix + trigger test; coverage 4211/0; CI 45904334444 green (perf on re-run, C-106).
- P1-16 closed: gate:task PASS (unit 2307/0, int 1873/0/1, sast, e2e P1-16/J3 Linux Chromium 9/0); coverage 4180/0; redemption.spec chromium/webkit/iphone14/pixel7 green (+ ×2 locally), spec-repeat ×5 webkit/iphone14 after the hydration fix; security design check (2 HIGH + 5 MEDIUM taken) + final review OK (4 LOW → FOLLOWUPS); screenshots 320/390/1440 + staff 320/1440 inspected; CI 45900700721 green.
- P1-15 closed: gate:task PASS (unit 2299/0, int 1799/0/1, sast, e2e P1-15 Linux Chromium 21/0, perf 3/0); celebrations.spec ×3 chromium+webkit 39/0, pixel7 green; @perf/@fps celebration + vault reward ×3 18/18 with real taps (C-86); coverage 4097/0; design review: 4 HIGH + 7 MEDIUM fixed, LOWs fixed or logged; screenshots 320/390/1440 inspected; CI 45886425001 green.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
