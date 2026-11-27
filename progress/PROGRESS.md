# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-27 (resume)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **P1 `/phase-complete` in progress (27 Nov, talha.syed, Mac)** on **`wip/P1-close`, HEAD `d1bc003`** (from main `141b136`; pushed, CI running: check it first). Main `141b136` CI 45959632024 green incl. image + Trivy; staging deploy 45961551766 green.
- **Done on the branch:** C-112 (FOLLOWUPS 104 quiet unlock, 108 redeem sheet idle preload + busy row after 150 ms + toast on a failed load, 109 receipt title sized by its longest word, 110 Overlay `fallbackFocus` → page h1 after Done/Esc), unit + E2E (chromium/webkit/iphone14) green; whole-phase reviews of `2972bc7..0662ac5`: code/security/design no BLOCK/HIGH, MEDIUMs fixed (Show all is a `Button`; 108 production-build E2E), LOWs → FOLLOWUPS; Lighthouse spec now measures `/shops/[id]`.
- **C-91 diagnosis:** landing LCP passes (0.77–0.80 s, 6/6 runs today; 25 Nov's 4.21 s not reproducible). **Still failing: initial JS gzip** landing 164.8 KB (band 149.5), wallet 196.4 (band 195.5), shop page 221.4 (band 195.5). Root-layout client chunk (~11 KB) ships cookie notice, FX engine, tier, sound (`AudioContext`), Button to every page; framework ~131 KB. Next: find what each route ships (lazy-load sound/FX/what only some pages use), then `pnpm test:lighthouse` green, motion parity unchanged.
- **Blocked on the human:** staging `db:seed --reset` (`sudo systemctl start moz-seed-reset` over SSH) was refused by Claude Code's auto-mode classifier; the human runs it or allows it. C-92/93/94 need H-54.
- **Next steps:** (1) CI on `wip/P1-close` `d1bc003`; (2) C-91 JS trim on the same branch; (3) land on main (green CI), progress closing commit; (4) staging reset, Demo 2 walkthrough on staging (P0 + P1), DoD walk, demo guide artifact; H-54.
## Status
- **Phase:** **P1 — Core loyalty** (PD closed 25 Nov; P1-B closed 25 Nov). P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **P1 `/phase-complete` in progress** (`wip/P1-close`). **P1-18 closed fast 27 Nov** (human; leftovers split, see Handoff). **P1-D closed 27 Nov** (P1-14..P1-17 + the close: reviews, QA, migration 0036). **P1-C closed 26 Nov** (P1-10..P1-13, P1-19 + the close: reviews, QA, code-review M2/M3, C-92..C-95). P1-B closed 25 Nov. PD-C closed 25 Nov, PD-B 23 Nov, PD-A 22 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-27, talha.syed (P1 close in progress, `wip/P1-close` `d1bc003`)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **P1-D:** P1-14 closed 26 Nov (member QR, offline card); P1-15 closed 27 Nov (celebrations; C-86 fixed); P1-16 closed 27 Nov (rewards ready lists, redeem codes as HMAC, staff confirm on Requests, guessing budget, reward validity); P1-17 closed 27 Nov (nightly integrity reconciliation, admin trigger). **P1-D closed 27 Nov.** **P1-18 closed fast 27 Nov** (human).
- **P1-C:** closed 26 Nov (P1-10..P1-13, P1-19, the close; C-95 SSE through Cloudflare + Caddy verified on staging).
- **Staging live** (release `4a1a912` since 26 Nov, `c12dfc8` next once main's CI is green, P1-C close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. P1 `/phase-complete` on `wip/P1-close` (see Handoff next steps: C-91 JS trim next). **Staging:** after the next deploy run `pnpm db:seed --reset` on staging. Demo guide artifact https://claude.ai/artifact/EMEPhqufVhTCbBnxiqWtyw ("P1-D steps": wording to match the real screens, status → Built).
2. Human any time: H-45 (🟠), H-53 (🟢 rotate staging password before launch), H-54 (🟢 side-by-side C-92/93/94, by the P1 phase close), H-38 (branches, list updated 26 Nov), H-51 (b), H-08b (private bucket for receipt PDFs); H-48b at P2 start.

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-91 | P1-10 (Lighthouse on main `79b19bc` and `wip/P1-10`, 25 Nov) | P1 `/phase-complete` (P1-18 fast close, human 27 Nov: demo step 1) | Landing `/s/[code]` Lighthouse mobile: LCP 4.21 s (budget 2.50; was 0.80 at P1-02) and JS 163.4 KB gzip (band 140) on main itself, score 82–85: root-caused and back inside budget (FOLLOWUPS 80 trim + the LCP regression); also P1-18 AC6: `/wallet` and `/shops/[id]` meet DESIGN §12 (or the judgment rule with a DECISIONS line) | `pnpm test:lighthouse` landing PASS + SESSION_LOG (27 Nov: LCP passes 6/6; JS gzip still over on landing/wallet/shop page) |
| C-92 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | Button coin animation (parity frames spec `tests/parity/fx.spec.ts` green): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-93 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | Fluid tabs spark on every variant and direction (parity per variant + /dev/ui E2E green): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-94 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | /dev/ui shows every component built (E2E + screenshots 320/1440 done): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1 `/phase-complete` (demo half); gate half → C-111 at P2-16 (human 27 Nov) | Client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2 screenshot walkthrough on staging after `db:seed --reset`). The `gate:phase` / P0 DoD half moved to C-111 (CARRIED_LATER, P2-16). | DEMO_NOTES + SESSION_LOG |
| C-112 | P1-18 fast close (human 27 Nov) | P1 `/phase-complete` (**built on `wip/P1-close` `d1bc003`, E2E green locally; closes when on main**) | FOLLOWUPS tagged `[P1 /phase-complete (was P1-18)]` on demo screens: skip before unlock plays bursts (104), Redeem feedback while the sheet loads on slow 3G (108), receipt long shop name hyphens at 320 (109), focus after the celebration's Done/Escape (110): fixed with tests | E2E + SESSION_LOG |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40, C-79 / T-7, C-83 / T-9, C-105 / T-12, C-106 and C-111 now block P2-16 (P1-18 fast close, human 27 Nov). Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (27 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
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
