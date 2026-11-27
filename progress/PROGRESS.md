# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-27 (resume)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **P1-18 in progress (27 Nov, talha.syed, Mac): branch `wip/P1-18`, HEAD `a37761e`** (3 commits on main `ea7eb5c`; CI on `cd18c4b` 45933446184 green; CI on `a37761e` running at checkpoint, check it first). Done on the branch: `ci:usage` hang fixed (KI-79); **C-110 proven** (tests/scale, `pnpm test:scale`: 100k memberships, run 6.8 s vs 900 s, 0 issues, EXPLAIN uses `ledger_entries_redeem_reward_idx`; evidence `.artifacts/c-110-integrity-scale.txt`); **C-53 fixed** (hand-built SED fixture, backup-pitr 9/9 on gpg 2.5, no skip); migration **0037** validates all 17 NOT VALID checks (dev DB 0 failing rows); one request pass in integrity; `integrity-check` CLI + RUNBOOK §20 triage, §21 stuck outbox/receipts, §22 SSE storms, `integrity.issue` alert row (AC8 written); FOLLOWUPS 117/118/125 fixed with tests; Stryker scope + redeem.ts, replay.ts.
- **Half-done:** `pnpm test:mutation` (AC4, C-17) fails its **dry run**: Stryker's `related` runs integration tests too, and "[P1-16] a reward that expires during the code's window can't be confirmed" (redemptions.test.ts ~line 340) fails under instrumentation (timing window). Fix next: make that test independent of wall-clock speed (or restrict Stryker to the unit project with a DECISIONS line), then run Stryker (no integration runs meanwhile: it shares the worker DBs), review survivors (C-17).
- **Next steps after that:** remaining P1-18 FOLLOWUPS (UI ones need screenshots; sw.js cast left), quarantines C-40/C-79/C-83/C-105/C-106 via spec-repeat, C-91 landing Lighthouse, then staging: run the RUNBOOK §4 NOT-VALID block on staging **before 0037 reaches main**, `db:seed --reset`, `node cli/integrity-check.mjs` (AC9; needs the new image), k6, rollback rehearsal, C-48/C-35/C-100, demo shots; `gate:phase` last.
- **Untested:** redeem on a real phone; the integrity CLI inside the built image (bundle test updated, image-check list updated).
## Status
- **Phase:** **P1 — Core loyalty** (PD closed 25 Nov; P1-B closed 25 Nov). P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **P1-18** (phase hardening) in progress on `wip/P1-18`. **P1-D closed 27 Nov** (P1-14..P1-17 + the close: reviews, QA, migration 0036). **P1-C closed 26 Nov** (P1-10..P1-13, P1-19 + the close: reviews, QA, code-review M2/M3, C-92..C-95). P1-B closed 25 Nov. PD-C closed 25 Nov, PD-B 23 Nov, PD-A 22 Nov.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-27, talha.syed (P1-18 checkpoint, `wip/P1-18` `a37761e`)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **P1-D:** P1-14 closed 26 Nov (member QR, offline card); P1-15 closed 27 Nov (celebrations; C-86 fixed); P1-16 closed 27 Nov (rewards ready lists, redeem codes as HMAC, staff confirm on Requests, guessing budget, reward validity); P1-17 closed 27 Nov (nightly integrity reconciliation, admin trigger). **P1-D closed 27 Nov.** P1-18 in progress (`wip/P1-18`; see Handoff).
- **P1-C:** closed 26 Nov (P1-10..P1-13, P1-19, the close; C-95 SSE through Cloudflare + Caddy verified on staging).
- **Staging live** (release `4a1a912` since 26 Nov, `c12dfc8` next once main's CI is green, P1-C close; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** closed 25 Nov (P1-05..P1-09 + the close: reviews, QA fixes, Wallet header, H-49).
- **PD (Molten design):** PD-A closed 22 Nov; PD-B closed 23 Nov; **PD-C closed 25 Nov** (PD-11 closed fast, human; leftovers C-78, C-79, C-83 → P1-18, C-84, C-85 → P1-B close).

## Next (top 3)
1. P1-18: fix the Stryker dry-run timing test, run mutation (AC4, C-17), then the Handoff's next steps; the P1 `/phase-complete` after. **Staging:** after the next deploy run `pnpm db:seed --reset` on staging (demo opening balances for P1-17). **Each P1-D task (human 26 Nov):** when it is built, update its step in the human's training doc "Moz Rewards: Phase 1 demo guide" (https://claude.ai/artifact/EMEPhqufVhTCbBnxiqWtyw, section "P1-D steps": wording to match the real screens, status table → Built).
2. Human any time: H-45 (🟠), H-53 (🟢 rotate staging password before launch), H-54 (🟢 side-by-side C-92/93/94, by the P1 phase close), H-38 (branches, list updated 26 Nov), H-51 (b), H-08b (private bucket for receipt PDFs); H-48b at P2 start.

## CARRIED (a task can't be ticked while a row targets it)
Rows that target P2–P5 live in `progress/CARRIED_LATER.md` (moved 23 Nov 2026, human-approved, to keep this file light): read it at every phase close and when a P2–P5 task starts, and move a phase's rows back here when that phase starts. The same rule applies there: a task can't be ticked while a row targets it.
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | P1-18 (moved from PD-11, human 25 Nov) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-83 | PD-11 CI 45548579038 | P1-18 | Linux-WebKit-only failures quarantined on CI WebKit (T-9): `molten-controls` /dev/ui 320 overflow 44 px, `shop-page` leave on day 1 (iphone14): root-caused, fixed, fixmes removed. Also from PD-11 E: gate "convergence at 4× full p95 ≤ 20" (fails on main's nightly 45397054403 too); Wallet→shop commit long task (FOLLOWUPS 79) | CI WebKit green with the tests active + nightly perf |
| C-91 | P1-10 (Lighthouse on main `79b19bc` and `wip/P1-10`, 25 Nov) | P1-18 | Landing `/s/[code]` Lighthouse mobile: LCP 4.21 s (budget 2.50; was 0.80 at P1-02) and JS 163.4 KB gzip (band 140) on main itself, score 82–85: root-caused and back inside budget (FOLLOWUPS 80 trim + the LCP regression) | `pnpm test:lighthouse` landing PASS + SESSION_LOG |
| C-100 | P1-12 (receipt PDFs, private bucket) | P1-18 (DECISIONS 26 Nov) | After H-08b: a receipt PDF downloads on staging from both routes; an anonymous GET of the private bucket and of the `cdn.` host's `receipts/` path is not 200 | curl on staging + SESSION_LOG |
| C-92 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | Button coin animation (parity frames spec `tests/parity/fx.spec.ts` green): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-93 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | Fluid tabs spark on every variant and direction (parity per variant + /dev/ui E2E green): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-94 | Human (25 Nov); built at the P1-C close | P1 `/phase-complete` (moved from the P1-D close 27 Nov; H-54 still open) | /dev/ui shows every component built (E2E + screenshots 320/1440 done): only the **human side-by-side check** against `design/reference/molten/` is left (H-54) | human's OK in SESSION_LOG |
| C-105 | P1-C close (CI 45803161974) | P1-18 | `molten-fields.spec` "[PD-06] slider drag" quarantined on CI WebKit (T-12): the pointer never lands over the slider's input there; root-caused on CI (spec-repeat), fixed, fixme removed, T-12 closed | spec-repeat ×10 webkit green with the test active + SESSION_LOG |
| C-106 | P1-C close (CI 45805824302; also 45733852636 at P1-13) | P1-18 | `gilded-gate.spec` "[PD-09] adds no long task while it plays @perf" fails on CI's perf runner now and then (inline gate script 74–76 ms under `GATE_SCRIPT_MS` 75, then a chunk of 129–174 ms; KI-48, T-8): root-caused with LoAF attribution, fixed or the budget re-decided with a DECISIONS line | perf job green ×3 in a row + SESSION_LOG |
| C-110 | P1-D close review (27 Nov) | P1-18 | P1-17 integrity run at 100k memberships finishes inside `maxRunSec` (15 min) and EXPLAIN of the reward-redeemed-twice check uses `ledger_entries_redeem_reward_idx` | timing + EXPLAIN in SESSION_LOG |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate; C-79 / T-7 (pixel7 @fps FX stress) and C-83 / T-9 (Linux-WebKit-only quarantines) block P1-18. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (27 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- P1-18 (wip, not ticked): `pnpm test:scale` 1/0 (100k: seed 28.5 s, integrity 6.8 s, 0 issues, index scan); backup-pitr int 9/0/0 on gpg 2.5.24; integrity + redemptions int 51/0; `pnpm check` unit 2316/0; `pnpm ci:usage` 38 s (12,493 min, public repo); CI `cd18c4b` 45933446184 green. NOT VERIFIED: mutation (dry run red, see Handoff).
- P1-D closed: `2972bc7` CI 45920008983 green (f07def4 CI 45916814961 green); gate:task PASS (unit 2315/0, int 1904/0/1, sast); reviews code/security/design all HIGH+MEDIUM fixed; QA 2 MAJOR fixed (New code contrast ≥ 4.5, celebration CLS 0.189 → ≤ 0.05), 5 MINOR logged; staging smoke OK; Sentry deferred (H-48b).
- P1-17 closed: gate:task PASS (unit 2313/0, int 1898/0/1, sast; no UI); integrity int 11/0 (each check clean + corrupted, demo seed clean, open issue kept, fixed resolved, overlap skip, keyset pages, read-only sums); authz 1 matrix + trigger test; coverage 4211/0; CI 45904334444 green (perf on re-run, C-106).
- P1-16 closed: gate:task PASS (unit 2307/0, int 1873/0/1, sast, e2e P1-16/J3 Linux Chromium 9/0); coverage 4180/0; redemption.spec chromium/webkit/iphone14/pixel7 green (+ ×2 locally), spec-repeat ×5 webkit/iphone14 after the hydration fix; security design check (2 HIGH + 5 MEDIUM taken) + final review OK (4 LOW → FOLLOWUPS); screenshots 320/390/1440 + staff 320/1440 inspected; CI 45900700721 green.
- P1-15 closed: gate:task PASS (unit 2299/0, int 1799/0/1, sast, e2e P1-15 Linux Chromium 21/0, perf 3/0); celebrations.spec ×3 chromium+webkit 39/0, pixel7 green; @perf/@fps celebration + vault reward ×3 18/18 with real taps (C-86); coverage 4097/0; design review: 4 HIGH + 7 MEDIUM fixed, LOWs fixed or logged; screenshots 320/390/1440 inspected; CI 45886425001 green.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
