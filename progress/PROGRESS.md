# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by Syedbadeshah76, 2026-11-21 18:30 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handoff by Syedbadeshah76 (Windows), 21 Nov 2026 18:30 UTC; baton free.** **Main = `d43774c`** (PD-03 + PD-A review fixes + gate split landed; main CI 44930544722 green; staging deployed `d43774c`, Deploy 44931894973 green). **`wip/PD-03` pushed HEAD `1354def`** = main + 3 fix commits not yet on main (`899890f`, `1354def`, plus FOLLOWUPS/DECISIONS lines in them).
- **Finished (21 Nov):** Linux WebKit decision (human: "do whichever is best"): `gate:task` runs webkit + iphone14 on the host's WebKit, Chromium projects in the Linux container, nothing skipped (`d649410`, TESTING §4, CLAUDE.md). Fixes found by the gate: moz-deploy bash-spawn describe timeout (`d3a6ea1`); `CI_CPU_SCORE` 28,000 → 70,000 (`d43774c`). PD-A close: code review APPROVE, design review PASS (earlier HIGH/M2/M4 confirmed fixed; LOWs in FOLLOWUPS on wip). Docker tidy: 5 anonymous volumes. Staging smoke (deploy job): web-1/web-2 ready on `d43774c`, demo sign-in check ok, live/ready ok.
- **Half-done, continue here (in order):** 1) **fx 200-burst stress `@perf` on pixel7 depends on the machine**: CI runners score ~46,000–77,000; at a fixed 4× a slow one gets 53–55 fps (< 58): wip CI 44930544649 and the full 5-project run 44930551230 (both `d43774c`) red on that one spec only; main CI on the same commit passed (58.4). Fix on wip: `899890f` calibrates CI too (`throttleRate`, unit test). 2) `1354def`: test-API route's cold import in `beforeAll` (int timed out under load). 3) **Then gate + push main:** `git switch wip/PD-03`, `pnpm gate:task PD-03 P0-17` **with the laptop idle** (last run: laptop CPU score fell to 8,780–11,000, below the reference device even unthrottled → pixel7 54.5 fps; at 15,000–23,000 it passed 59–60), then `git push origin wip/PD-03:main`. If the laptop stays that slow, run the gate on the Mac, or decide (DECISIONS) that a host scoring under `CI_CPU_SCORE/4` reports "can't emulate the reference" instead of a verdict. 4) `gh workflow run scheduled.yml --ref main -f suite=e2e` (full 5-project run) green. 5) **H-48 Claude part:** SSH as `badeshah@72.61.17.208` with **Windows OpenSSH** (`/c/Windows/System32/OpenSSH/ssh.exe`; root login is off) → DSN URL-shaped in web + worker (length only) + one probe error; this laptop's IP was banned by fail2ban ~17:55 UTC (two root attempts; 1 h, increments). 6) Tick "PD-A closed" in PHASES + SESSION_LOG "code-review done `1354def`" → PD-B (PD-04 first; C-75).
- **Tested:** gate on `d43774c` all PASS (unit 1789/0, int 1445/0, Linux Chromium E2E 34/0, host WebKit 22/0, perf 3/0, changed specs 149/0); gate on `1354def`: all PASS except perf pixel7 (slow laptop, above); `throttleRate` unit 4/0; test-api int 9/0 alone (first case 5.7 s → 0.24 s); wip push check + sast PASS.
- **Not yet tested:** `899890f` on CI (wip CI for `1354def` running at handoff); Sentry "no new errors for release `d43774c`" (no SSH, no Sentry access): NOT VERIFIED.

## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov; `docs/phases/PD.md`). Then P1 resumes with the P1-B close. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** **PD-A** Foundation: ~~PD-00~~ → ~~PD-01~~ → ~~PD-02~~ → ~~PD-03~~ → ~~reviews + MEDIUMs~~ → ~~main (`d43774c`)~~ → ~~close reviews~~ → fx-perf CI fix to main (wip `1354def`) + full run + Sentry check → tick PD-A; then PD-B (controls), PD-C (structure + signature moments, needs H-49). **P1-B** (P1-05..P1-09) is complete; its `/subphase-complete` runs after PD-C. (P1-A: everything done except the staging step, H-48 Claude part.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-22 (00:00 local; 21 Nov 18:30 UTC), Syedbadeshah76 (handoff: main `d43774c` deployed; wip `1354def` = fx-perf CI calibration + int timeout fix; PD-A close almost done)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `d43774c` since 21 Nov 17:51 UTC, first deploy with the real Sentry DSN; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-00..PD-02 done; PD-02's Linux CI red fix (`c072a49` + Semgrep fix `527fbb8`) verified with `pnpm e2e:linux` and squashed onto main 21 Nov (talha.syed). PD-03 done 21 Nov (talha.syed). 21 Nov: gate ~10.5 min (watchdog limits, Semgrep tar stream), `pnpm e2e:linux` built, Docker tidied (~15 GB).

## Next (top 3)
1. Handoff steps 1–4: gate `wip/PD-03` (`1354def`) with the laptop idle or on the Mac, push to main, full 5-project run green.
2. H-48 Claude part on staging (SSH `badeshah@`, Windows OpenSSH), then tick PD-A (and P1-A's staging step).
3. PD-B: PD-04 (buttons, icon button, toast; C-75 tile parity). Human any time: H-38, H-45, H-46.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-75 | PD-A code review M3 | PD-04 | Placed-card **tile** surfaces get a static parity part (a bare `.tile` compared, required), plus the reference `.tile` scroll-in rise (`animation-timeline:view()`, `translateY(36px) scale(.975)` over entry 0–30%), the `::before` pointer highlight at `--mx/--my` (320 px, .26, .35s, fine pointer only), `.rm .tile{animation:none}`; spec rows for them | parity static + spec table |
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs **Backup half done 16 Nov (D4: heartbeats on staging, WAL from pg_stat_archiver, flag deployed with D4); left: health snapshot after deploy + request logs (E).** | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-46 | P0-15 D4 | P5-12 | Production backups on: `moz-backup wal-on production`, first dump + `backup:verify --env production` (dump + `--wal`) PASS, then `BACKUPS_ENABLED=true` in `infra/deploy/production.env` | SESSION_LOG + production health snapshot |
| C-47 | P0-15 (human 16 Nov) | P5-12 | Production stack set up before go-live (DECISIONS 16 Nov): secrets, Tunnel/origin lock (C-44), `init-env production`, maintenance-only deploy, then backups (C-46) and UptimeRobot production monitors; P0-15 AC7 re-checked with both stacks running | deploy log + `docker stats` + SESSION_LOG |
| C-51 | P1-02 | P5-05 | Landing footer "Terms" / "Privacy" links (`/terms`, `/privacy`, plain `<a>`) resolve to the legal pages | E2E: links 200 |
| C-55 | P1-04 security review LOW 4 | P5-01 | Customers can withdraw (and give) per-shop marketing consent themselves through `recordConsentChange` (source `settings`) before any real customer joins; the join sheet's wording ("change this any time in the shop's settings") names where it really is | E2E: toggle off → consent row false + membership false |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-57 | P1-A close CR-M2 | P2-13 | "Has a profile" = "profile complete" (DECISIONS 18 Nov): an erasure or edit that clears the phone or the 13+ declaration but keeps the profile row must make the next join ask again (`isProfileComplete`), or delete the row | integration |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-62 | P1-07 | P1-12 | Approvals write `progress_gold` / `ingots_completed`; the Wallet reads rewards-ready count, recent activity, and the last 10 awards for "N more visits"; Wallet statement count unchanged | integration |
| C-63 | P1-07 | P4-06 | Wallet daily game card (hidden until P4) | E2E |
| C-66 | P1-08 | P1-12 | Gold Vault streak chip shows the member's current streak from the ledger; tier never goes down when an owner raises a threshold (membership stores the highest tier reached) | integration + E2E |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-68 | P1-09 | P1-11 | Leaving cancels the member's open points requests in `leaveShop`'s transaction; a left member can't request; the shop page's Request points button and pending state | integration + E2E |
| C-69 | P1-09 | P1-12 | Approvals refuse a left membership (progress frozen); the shop page's Recent receipts card lists the last receipts (empty state today) | integration + E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-71 | P1-09 | P3-06 | Leaving voids the member's live offer claim codes for that shop in `leaveShop`'s transaction | integration |
| C-72 | P1-09 | P3-11 | Referral bonuses are never re-earned after leaving and rejoining | integration |
| C-73 | P1-09 | P1-13 | A rejoin after the 30-day window gets no frozen progress back even if the forfeit job hasn't run yet (forfeit at rejoin, or the join refuses to restore) | integration |
| C-74 | P1-09 | P3-05 | Shop page offers carousel (screen 4 slot; hidden until offers exist) | E2E 390 + 1440 |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (21 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- Main CI 44930544722 (`d43774c`) green; Deploy 44931894973 green (staging `d43774c`, demo sign-in check ok).
- Gate `d43774c` (Windows) PASS: unit 1789/0, int 1445/0, Linux Chromium E2E 34/0, host WebKit 22/0, perf 3/0, changed 149/0.
- Full 5-project run 44930551230 (`d43774c`): 1 failed, fx stress pixel7 (slow runner at fixed 4×; fix `899890f` on wip).
- Gate `1354def`: all PASS but perf pixel7 54.5 fps (laptop score 8,780, below the reference device unthrottled).
- PD-A close reviews: code APPROVE, design PASS (range `4ecb0de..d43774c`).
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
