# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-20 09:28 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76 (Windows), 20 Nov 2026.** Baton still held. Done this session: (1) the **Linux 5-project red** (run 44689683099, P1-08/P1-03 timing specs) **fixed on main** `aa45bcc` (frame/animation-clock bounds, finish() proof, IO hold for the 60 fps spec, hydration-gated /dev/motion field, CPU throttle calibrated to the CI runner `tests/e2e/support/cpu-throttle.ts`; DECISIONS ×2); (2) **PD-01 Parity harness done** (`ac885b4`): spec table `src/lib/motion/molten-spec.ts` (all rows pending), `/dev/molten`, reference copy `tests/parity/reference/` (`pnpm parity:reference`), `tests/parity/{static,frames,curves}.spec.ts`, `pnpm test:parity`, gate:task parity step for PD IDs, CI wiring; test titles accept `[PD-nn]`. CLAUDE.md rule: never end a turn just to wait for a background job (`12c9acf`). Nothing half-done.
- **How to continue: PD-02** (`docs/phases/PD.md` PD-02). For each part you build: put it on `/dev/molten` with `data-parity="<name>"` from production components, flip its rows in `molten-spec.ts` to `required` with `prod` locators (and add the ids to `molten-spec.lock.json`), flip its parts in `src/features/dev/molten/parity-parts.ts` to `required`, add triggers in `tests/parity/support/motion.ts` (`TRIGGERS`: target + events, dispatched and paused in one evaluation). PD-02's rows: placed-card, gilded-edge, living-background; part: language. **Fonts:** the app's Fraunces has only `opsz`; the reference uses SOFT/WONK + italics; parity renders both pages with the app's fonts, so add the axes in PD-02 and assert them.
- **Tested (Windows, 20 Nov):** `pnpm test:parity --repeat-each 5` 50/0 (Chromium + WebKit); units 10/0; `gate:task PD-01` (see SESSION_LOG).
- **Not yet tested:** main CI for `ac885b4` (push run, includes parity Chromium) was running at checkpoint: check it first. Linux run 44745075902 (`wip/PD-01`): E2E 1108 passed / 0 failed / 2 flaky (P1-03 gate specs, FOLLOWUPS; human 20 Nov: PD first, these later), so its parity step didn't run; parity on Linux is proven by the next main CI (Chromium) and twice-weekly run (WebKit). Real phones (H-13). **P1-A still not ticked:** waits for **H-48 🔴**.
- **Human's priority (20 Nov):** all PD tasks first (PD-02 → PD-11), then P1 where it was left; don't spend time on non-PD fixes unless they block PD. Push hook note: it takes task IDs from the whole commit message, so never name other task IDs in a commit body (it re-runs the gate).
- **Other laptop:** `git pull`, `pnpm install` (no lockfile change). No migrations, no env vars. Remote branches `wip/e2e-timing` and `wip/PD-01` are merged content (add to H-38).
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov; `docs/phases/PD.md`). Then P1 resumes with the P1-B close. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** **PD-A** Foundation: ~~PD-00~~ → ~~PD-01~~ → PD-02 → PD-03 → `/subphase-complete`; then PD-B (controls), PD-C (structure + signature moments, needs H-49). **P1-B** (P1-05..P1-09) is complete; its `/subphase-complete` runs after PD-C. (P1-A: everything done except the staging step, which waits for H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-20, Syedbadeshah76 (Linux red fixed `aa45bcc`; PD-01 parity harness done; next PD-02)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys roll back until H-48.
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-00 done 20 Nov (reference `design/reference/molten/`, sha256 `81a2994f…`; DESIGN v2; rules in CLAUDE.md). Next PD-01 parity harness. 20 Nov: the Linux 5-project red (run 44689683099, motion timing specs) fixed on main; CPU-throttled specs calibrated to the CI runner (`tests/e2e/support/cpu-throttle.ts`).

## Next (top 3)
1. **PD-02 Tokens, fonts, surfaces, living background, gilded edge**, then PD-03 and the PD-A close (`docs/phases/PD.md`). PD-02 flips its rows in `molten-spec.ts` (placed-card, gilded-edge, living-background) and parts in `parity-parts.ts` (language) to `required`. Note: the app's Fraunces has only the `opsz` axis; the reference uses SOFT/WONK + italics (parity renders both pages with the app's fonts, so add the axes in PD-02 and assert them).
2. Human: **H-48** (staging Sentry DSN) → then close P1-A (deploy, smoke, Sentry, tick).
3. Human, any time: H-38 (delete merged branches, now incl. `wip/P1-09`), H-45 UptimeRobot monitors (then C-48), H-46 Cloudflare `/s/*` rule.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
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

## Last verified (20 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- PD-01 (Windows): `pnpm test:parity --repeat-each 5` 50/0 (Chromium + WebKit: static, frames, curves self-tests; 3 px offset caught; offline); molten-spec + parity-parts units 10/0.
- Motion timing fix (Windows, 20 Nov): Linux run 44723422284 1108/0 failed/2 flaky (both then fixed); local edge cases 45/0 on 3 browsers, 60 fps 4/4 calibrated; gate long-task spec 2/4 here (pre-existing, FOLLOWUPS).
- P1-09 landed on main `2dd6039`: Mac `gate:task P1-09 P1-04 P1-08 P1-07 P0-10` PASS (unit 1697/0, int 1456/0/1, e2e 118/0/2/0); pre-push hook gate PASS; branch CI 44689671179 green; main CI 44692872344 in progress at handoff.
- P1-09 (Windows, 19 Nov): leave-shop int 10/0, membership authz 28/0, shop-page E2E 5/0 Chromium + WebKit, screens 390/320/1440 inspected.
- PD-00 docs: `pnpm check` PASS after the docs commit; reference fingerprint `81a2994f…` = `shasum -a 256 design/reference/molten/index.html`.
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
