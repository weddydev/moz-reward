# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-17 (Mac)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **talha.syed, 2026-11-17 (Mac), baton held.** **P1-03 Gilded Gate done and ticked** (squash of `wip/P1-03` `5ec3982` on main; `wip/P1-02` and `wip/P1-03` can be deleted once main CI is green). Design: CSS timeline from first paint + pre-paint script, inline morph script after the landing markup, lazy sound-only chunk (DECISIONS 17 Nov ×2).
- **Next = P1-04 Join flow** (security-relevant: `security-reviewer` design check first; closes C-52). Code may go to a `wip/P1-04` branch; progress files only on main.
- **P1-A MEDIUM batch (fix together before `/subphase-complete` P1-A):** (a) landing screenshot test seeds a real cover image (test API `shop` needs a `coverUrl` option + a served image) so the m01 composition / LCP image is shown; (b) cookie notice screenshots without consent at 320 and 390, before and after hydration (overlap with Collect at 320×720).
- **Local gpg 2.5.24 (Mac):** backup-pitr "unprotected WAL" case skips locally (fixture can't be built), runs in CI — C-53.
- **Tested (17 Nov, Mac):** gate:task P1-03 + P1-02 PASS on the final tree (Last verified); Linux container (Playwright noble image) P1-02 + P1-03 on Chromium, WebKit, Pixel 7, iPhone 14: 70/0. CI of the P1-03 main push: check before the next push.
- **Not yet tested:** Gilded Gate on a real phone (H-13: feel, frame rate, `arrival` after a soft unlock); health.backup with the flag on (C-48); UptimeRobot alerts (H-45, C-48); demo guide clicks on staging (human); SSE through Cloudflare; Sentry release events from staging; seed-reset timer's first unattended run (Mon 23 Nov 04:30).
- **Do first:** `git pull`; no new env vars, migrations or seeds. A change to `infra/host/*` needs `scp -r infra <you>@72.61.17.208:moz-infra && ssh <you>@… 'sudo -n bash ~/moz-infra/host/harden.sh'` before a deploy uses it. Manual deploy dispatch: `-f sha=<commit with green push CI>`. Mac: long gates under `caffeinate -i`. Don't edit files while `gate:task` runs (its tree check fails).
- **VPS access:** root SSH off. Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`; `sudo -n` works. CI: `deploy@` forced command only.

## Status
- **Phase:** **P1**. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → ~~P1-02~~ → ~~P1-03~~ → **P1-04**.
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-17, talha.syed (P1-03 ticked; P1-04 next)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`.
- **P0 closed 17 Nov (human: no more time on P0).** P0-15 ticked; leftovers C-48/C-49 → P1-18. **P1-A:** P1-01 (13 Nov), P1-02 and P1-03 (17 Nov) done; Lighthouse CI exists.

## Next (top 3)
1. **P1-04** join flow (security-relevant; closes C-52).
2. P1-A close: MEDIUM batch (Handoff note) → `/subphase-complete` P1-A (also reviews the unreviewed P0-E commits, C-49).
3. Human, any time: H-45 UptimeRobot monitors (then the stop-staging phone alert test, C-48); H-46 Cloudflare `/s/*` rule (🟢).


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
| C-52 | P1-02 | P1-04 | Landing "Collect points": signed-out → sign-in with returnTo (done); signed-in non-member → join sheet; member → shop page / request (today: `/wallet` placeholder in `src/app/(public)/s/[code]/page.tsx`) | E2E per visitor state |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking. Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (17 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- gate:task P1-03 P1-02 (final tree): PASS, counts in the P1-03 commit message on main.
- P1-03 E2E (production build, Mac): 17/0 + 1 Chromium-only skip; Linux container 4 projects 70/0 (P1-02 + P1-03). Frames 0/500/850/1000/1200/1400 ms at 390/320/1440 inspected (Chromium + WebKit).
- Lighthouse with the gate playing (`?src=qr`): LCP 0.81 s, CLS 0, score 100, JS 147.6 KB gzip (17 Nov judgment). Gate JS chunk < 1 KB gzip, loaded only when it plays.
- CI `44051042111` (P1-02 main) + Deploy `44052730072` green.


## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
