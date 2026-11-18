# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-18 07:35 PKT

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **18 Nov, Syedbadeshah76 (Windows): P1-06 done** (`2479b62` on main, ticked; C-56 closed). Pure engine `src/lib/loyalty/engine.ts` + branded types `src/lib/brand.ts`; also fixed a P1-04 audit-scrubber bug (key ids with 7+ digits were redacted). Nothing half-done. **Next exact step:** P1-07 Wallet. Note: memberships have no progress/ingot columns yet (P1-12 adds them with C-60, see DECISIONS "Loyalty engine rules"); P1-07 should read progress through one membership-state read (0 until P1-12) or add the columns early — decide at its start. The "< 3 visits" unreliable-estimate rule is the Wallet's (the engine estimates from any history).
- **P1-A still not ticked:** waits for **H-48 🔴** (real `SENTRY_DSN_STAGING`). The Deploy of `ab29272` failed at the demo seed on the placeholder DSN (as expected); staging still serves `8353e00` (`/api/health/ready` 200), and migrations 0022/0023 did apply there (guards only). Once H-48 is done: re-run Deploy for current main → staging smoke (`/s/BREW22` member/non-member, join sheet, `/dashboard/loyalty` as the demo owner, `/api/health/ready`) → Sentry release with no new errors → tick P1-A in PHASES + SESSION_LOG line (docs-only commit).
- **Not yet seen:** CI for `2479b62` and this progress commit (check first; red is fixed first). CI for `f1b2658` green.
- **Do first on the other laptop:** `git pull`, `pnpm install` (fast-check added), `pnpm db:migrate` (0024), `pnpm db:seed` (Brew gets programme v1; or `pnpm db:seed --reset`). VPS: Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`.

## Status
- **Phase:** **P1**. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** P1-B loyalty engine, Wallet, Vault: ~~P1-05~~ → ~~P1-06~~ → P1-07 → P1-08 → P1-09 → `/subphase-complete`. (P1-A: everything done except the staging step, which waits for H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-18, Syedbadeshah76 (P1-06 done)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys roll back until H-48.
- **P1-B:** P1-05, P1-06 done (18 Nov). Next P1-07.

## Next (top 3)
1. P1-07 Wallet.
2. Human: **H-48** (staging Sentry DSN) → then close P1-A (handoff note: deploy, smoke, Sentry, tick).
3. Human, any time: H-45 UptimeRobot monitors (then the stop-staging phone alert test, C-48); H-46 Cloudflare `/s/*` rule.


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
| C-50 | P1-02 | P1-08 | Shop landing `/s/[code]` shows the reward preview with a static ingot (next reward + gold needed) once the loyalty programme exists; public data only, inside the cached landing payload (bump `shop-landing:v1` key version) | E2E on the landing |
| C-51 | P1-02 | P5-05 | Landing footer "Terms" / "Privacy" links (`/terms`, `/privacy`, plain `<a>`) resolve to the legal pages | E2E: links 200 |
| C-54 | P1-04 design check M6 | P1-09 | "Leave shop" sets `marketing_opt_in` false and writes a consent row (`recordConsentChange`, source `leave`) in the same transaction; rejoin (already in `joinOwnMembership`) restores frozen progress | integration |
| C-55 | P1-04 security review LOW 4 | P5-01 | Customers can withdraw (and give) per-shop marketing consent themselves through `recordConsentChange` (source `settings`) before any real customer joins; the join sheet's wording ("change this any time in the shop's settings") names where it really is | E2E: toggle off → consent row false + membership false |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-57 | P1-A close CR-M2 | P2-13 | "Has a profile" = "profile complete" (DECISIONS 18 Nov): an erasure or edit that clears the phone or the 13+ declaration but keeps the profile row must make the next join ask again (`isProfileComplete`), or delete the row | integration |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-59 | P1-05 | P1-08 | Loyalty settings preview uses the Ingot component (static mode) instead of `IngotPreview` | screenshot 320/1440 |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: **H-48 🔴** (staging Sentry DSN; blocks the next staging deploy once the batch lands). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (18 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- P1-06 (`2479b62`): gate:task P1-06 P1-02 P1-04 PASS — unit 1609/0, int 1373/0/12 skip, build, sast, e2e 40/0 (Chromium + WebKit, production build); pre-push reused the stamp.
- Engine 47 unit + 3 fast-check properties (gold conserved, progress in range, no double milestone, rewards never revoked); coverage engine.ts 98.0% lines / 96.2% branches / 100% functions.
- C-56: `brand.test.ts` `@ts-expect-error` swaps; weakening a brand fails typecheck (shown once).
- Audit scrubber fix: `audit.test.ts` regression (failing key id `kc011910373`) + key-rotation int 6/0.
- P1-05 evidence (`f1b2658`, CI green) moved to SESSION_LOG.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
