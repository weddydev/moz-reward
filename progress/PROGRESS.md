# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-23 05:52 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed, 23 Nov 2026 ~16:30 UTC (Mac); baton held by talha.syed. Autopilot is OFF.** Human paused (usage limit); nothing is uncommitted.
- **PD-07 (`wip/PD-07`, HEAD `e612df5`), not on main yet.** (1) Keyboard-dock flake root-caused: the test focused a hydration-gated field before it was enabled (`focus()` on a disabled field is a no-op); test now waits `toBeEnabled` + `toBeFocused` (`9ff35f8`, KI-20). (2) **pixel7 `@fps` FX regression root-caused:** Tailwind scanned the whole repo, so a note naming the backdrop filter property (parity-parts.ts, DECISIONS.md) registered nine `--tw-backdrop-*` `@property`s carried by every element. CI bisect: PD-07 CSS only 57–60 fps (pass), PD-07 code only 46–56 (fail), main 59–60. Fix `e612df5`: `source("..")` in globals.css (Tailwind scans src/ only; built CSS loses only prose-made rules) + `check:bundle` fails on a registered property not on `REGISTERED_PROPERTIES` (KI-42, DECISIONS 23 Nov). **Check first:** CI 45153441770 on `e612df5` and perf runs 45153452036 (wip/PD-07) vs 45153456299 (main) were running at this checkpoint (`gh run view <id> --log | grep fx-trace`). Green → rebase `wip/PD-07` onto main locally and push `HEAD:main` (hook runs gate:task). Still failing → time-box is used up: quarantine with a CARRIED row to the PD-C close + TEMPORARY line, land PD-07 (`@fps` is nightly/phase-gate only, CLAUDE.md), never loosen the 58 fps bound.
- **PD-08 in progress on `wip/PD-08`, HEAD `13e39ad`** (pushed from local branch `wip/PD-08-ff`; the local `wip/PD-08` holds the same tree under rebased commits: run `git branch -f wip/PD-08 wip/PD-08-ff` with the human's OK, or just `git switch wip/PD-08-ff`). CI on `8430efc` GREEN (wallet stack fixed: `max-md:hidden` lost to unlayered `.m-stack` display → `data-folded` in molten.css; 768px hover reset inside the hover query). `13e39ad`: step (b) part: shop cover header (`ShopPageHeader` = reference `.cover`, logo 60 px ring, glass back to /wallet, grows for long names; loading state same cover) + `OfferCard` (in /dev/ui). Evidence: e2e:linux shop-page/wallet/join chromium+pixel7 38/0, ui-states+ui-gallery 16/0; screenshots 320/390/1440 inspected. CI on `13e39ad` running. **`wip/PD-08` lacks PD-07's `9ff35f8`-after fixes:** cherry-pick `e612df5` onto it (its build registers the same backdrop properties until then).
- **PD-08 left:** (b) /dev/molten phone gets the wallet stack + shop view (do with (c): the shop view only appears through the wipe); (c) wipe (values as before: pure `src/lib/motion/wipe.ts`, 620 ms `cubic-bezier(.65,0,.35,1)`, shop +110 ms, wallet .92/.4 600 ms, R = hypot×1.05, sparks 22 at 80 ms, rise 520 ms from 300 ms +60 ms stagger, bar 900 ms at 420 ms, back 520 ms + wallet 80 ms; fixed stage outside RouteTransition; back reverses from the back button; reduced motion 150 ms fade); (d) parity (`wallet-stack` + `shop` required, per-part `hide`, frames 0/260/620/730), spec rows, E2E wipe + back + slow network, Lighthouse wallet, screenshots, DECISIONS lines (demo shops; one-line card names; next/image config; morph during the wipe; cover is a rounded card inside the column with its own top bar, not full-bleed).
- **Cleanup:** delete throwaway branches `wip/PD-07-bisect-css`, `wip/PD-07-bisect-code` (remote) and worktrees `../moz-bisect`, `../moz-main`, `../moz-PD-07` once PD-07 lands. Headless Linux Chromium has no hyphenation dictionaries (long cover names break mid-word there; phones hyphenate).

## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov). Then P1 resumes with the P1-B close. P0 closed 17 Nov (human); its leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Don't wait on human tasks.
- **Current sub-phase:** **PD-C** (PD-07 built, not on main; PD-08 in progress; H-49 at its close). PD-B closed 23 Nov. PD-A closed 22 Nov. P1-B (P1-05..P1-09) complete; its close runs after PD-C.
- **GITHUB_MODE:** `free` (H-25, 9 Nov; ENGINEERING §16).
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-23, talha.syed (checkpoint: PD-07 fixes `e612df5` (fps root cause) awaiting CI/perf; PD-08 cover header `13e39ad`)
- **Staging and production:** one Hostinger VPS 72.61.17.208; staging live since 15 Nov (origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; **PD-B closed 23 Nov** (main `d59a2eb`). **PD-07 done 23 Nov** on `wip/PD-07` (gate PASS on `42e68ed`; main push after its CI is green). Next PD-08 (PD-C).

## Next (top 3)
1. `wip/PD-07` CI + the full 5-project run (every-page change: global CSS, portal shell) green → push to main (hook re-gates the tree with the progress files).
2. PD-08 · Wallet stack, gold wipe into the shop, shop photos (PD-C; CSP `img-src` check at its close).
3. Human any time: H-45, H-48b (🟠), then H-12; H-49 at the PD-C close.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs Backup half done 16 Nov (D4); left: health snapshot after deploy + request logs (E). | staging health snapshot + screenshot |
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
| C-78 | CI 45101535248 (PD-B close) | PD phase gate (PD-11) | Linux WebKit: `molten-fields` slider drag's final track press keeps 720 (3/3 there; passed in CI 45090767908 + 45096798286, host WebKit 6/6): root-caused and the WebKit assertion un-quarantined | CI WebKit run + SESSION_LOG |
| C-79 | PD-07 CI (perf 45153452036, main 45153456299) | PD-11 (PD-C close) | pixel7 `@fps` FX stress (≥ 58 fps, p95 ≤ 16.8 ms at 4× CPU) un-quarantined: cause found (runner variance vs. a dock/FX frame cost), fixed if real; TEMPORARY T-7 closed | nightly perf run green on pixel7 + SESSION_LOG |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (23 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- gate:task PD-07 PASS on `42e68ed` (unit 1972/0, int 1456/0, PD-07 E2E Linux 13/0/20, changed specs Linux 54/0/40, parity PD-07 8/0 both engines); earlier PASS on `7d34e58` before the review fixes.
- Host E2E `molten-dock` + `portal-shells` on pixel7 + desktop1440: 36/0/18; screens `.artifacts/screens/PD-07/` + `P0-12/*-320--pixel7.png` inspected (dock 320/412, rail 1440).
- Full parity run (all PD parts, both engines) 163/1: WebKit liquid-choice frame 0 at 2.01% under load, 3/3 alone (watch; FOLLOWUPS).
- Main CI 45112526437 + staging deploy of `d59a2eb` GREEN; staging health live/ready/worker 200 without password (23 Nov).

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
