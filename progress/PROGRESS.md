# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-21 14:51 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76 (Windows), 21 Nov 2026 ~16:45 UTC; baton kept.** Work is on **`wip/PD-03`, pushed HEAD in SESSION_LOG's last entry** (`73f46c8` + this progress commit). **Main is still `8c2a9f2`** (progress only since `d055dd6`): not pushed to main, the pre-push gate is red on Linux WebKit (below). **Waiting on a human decision** (question in the last reply; see 1).
- **Finished (21 Nov, Syedbadeshah76):** wip CI 44918269127 (`1375f2b`) green. PD-A review MEDIUM batch `d8656bf`: code M1 (fx + vault `@perf` skip by `browserName`), M2 (watchdog kills the tree on SIGINT/SIGTERM/SIGHUP, exit 130/143/129), design M2 (focus ring = reference; `--focus-ring` rgba(210,160,51,.55); DESIGN §3; AC4 E2E rewritten), M4 (`.m-dark[data-lift]:hover` rises 4px; `src/styles/molten.test.ts`). Main-push-gate specs fixed (`d8656bf`): route-transition hooks catch animations at creation (`catchRouteAnimations`), video via `saveAs`, morph nav 15 s, molten Language DOM scroll + `test.slow`. Merged main's checkpoint (`70f1856`); DECISIONS + FOLLOWUPS (`33cad23`); Semgrep fix in the new CSS test (`73f46c8`).
- **Root cause found:** Playwright's **Linux** WebKit (CPU compositor, `e2e:linux` container; same engine as CI's ubuntu nightly) runs ~1 frame/s for 1–2 s after a load or navigation and 0–6 fps on `/dev/molten` (host WebKit 58 fps on /dev/motion; JIT fine). Timing/frame-driven motion specs fail there deterministically and pass on host WebKit.
- **Half-done, continue here:** 1) **Human decision needed** on how Linux WebKit is handled (options in the last reply: (a) gate runs WebKit projects on the host browser, Chromium projects in Linux, nightly WebKit moves to a macOS runner (free while public, C-43); (b) keep making each spec frame-independent; (c) skip timing specs on Linux WebKit with a CARRIED row). 2) Latest gate on `73f46c8`: everything PASS up to tagged Linux E2E 403/6/61 (all WebKit): fx `:78`, molten `:65`, motion `:492`, `:671`, gilded-gate `:435`; alone on Linux 17/8 (webkit + iphone14 only), **host WebKit + iphone14 10/0**. 3) After main: `gh workflow run scheduled.yml --ref main -f suite=e2e` = the full 5-project run for the every-page focus-ring/`.rm` change; then PD-A `/subphase-complete` (H-48 DSN check on that deploy).
- **Tested:** watchdog signals in a Linux node container (old FAIL ×2, new PASS ×2; vitest case is POSIX-only, skipped on Windows); molten lift test fails on old CSS, passes new; AC4 fails on old CSS (host chromium); `pnpm e2e:linux` fixed motion specs 14/0 (5 projects), molten Language 5/0; gate on `73f46c8`: typecheck, lint, format, titles, unit 1788/0/22, int 1445/0/12, build, bundle, sast, lint:sh PASS. Screens inspected: `frame-morph-390--webkit` (host: real mid-morph; Linux video shows the pre-click page → FOLLOWUPS), `molten-language-390--iphone14` OK.
- **Not yet tested:** new AC4 focus-ring E2E after the CSS change (ran only as part of the gate's tagged set: its result is in the 403 passes, not separately); `@perf` step, changed-specs step and parity step of the gate (not run, earlier step failed); wip CI for this push.
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov; `docs/phases/PD.md`). Then P1 resumes with the P1-B close. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** **PD-A** Foundation: ~~PD-00~~ → ~~PD-01~~ → ~~PD-02~~ (Linux CI fix on main 21 Nov) → ~~PD-03~~ (on `wip/PD-03`) → ~~MEDIUM batch M1/M2~~ → ~~reviews~~ → ~~review MEDIUMs~~ → main → `/subphase-complete`; then PD-B (controls), PD-C (structure + signature moments, needs H-49). **P1-B** (P1-05..P1-09) is complete; its `/subphase-complete` runs after PD-C. (P1-A: everything done except the staging step, which waits for H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-21, Syedbadeshah76 (checkpoint: `wip/PD-03`; PD-A MEDIUMs done; main push gate red on Linux WebKit only, decision needed)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys roll back until H-48.
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-00..PD-02 done; PD-02's Linux CI red fix (`c072a49` + Semgrep fix `527fbb8`) verified with `pnpm e2e:linux` and squashed onto main 21 Nov (talha.syed). PD-03 done 21 Nov (talha.syed). 21 Nov: gate ~10.5 min (watchdog limits, Semgrep tar stream), `pnpm e2e:linux` built, Docker tidied (~15 GB).

## Next (top 3)
1. **Human decision: Linux WebKit in the gate/nightly** (handoff note 1); then apply it, gate, push main, full 5-project CI run.
2. PD-A `/subphase-complete` (MEDIUMs done in `d8656bf`).
3. **H-48 human part done 21 Nov** (real DSN set 13:49 UTC): Claude's part on the next staging deploy (DSN URL-shaped in web + worker, one probe error confirmed in Sentry) → then close P1-A and PD-A staging steps. Human any time: H-38, H-45, H-46.

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
- Human: **H-48 🔴** (staging Sentry DSN; blocks the next staging deploy once the batch lands). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (21 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- Gate `73f46c8` (Windows): all steps PASS up to Linux tagged E2E 403/6/61 (6 = Linux WebKit only; alone 17/8 Linux, host WebKit 10/0).
- `gate:task PD-03` (Mac) PASS on `4ecb0de`: unit 1804/0, int 1456/0/1, Linux e2e 51/0, perf 1/0, changed specs 97/0; wip CI 44909391859 green.
- Main push gate (b7d1c3f, tags PD-03/P0-10/PD-02/P1-03): Linux e2e 248/5/12 FAIL (5 existing P0-10/PD-02 specs, handoff note).
- Review fixes `675cdad`: `.rm` E2E failed before (`m-spin 0.15s`), passes after; RM specs 59/1; sast 5/0; gitleaks worktree scan clean + planted token blocked.
- Main CI 44901375933 (`83bb4e5`) green; Deploy fails on H-48 as expected.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
