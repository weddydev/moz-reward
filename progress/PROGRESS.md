# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by Syedbadeshah76, 2026-11-17 12:45 IST (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by Syedbadeshah76, 2026-11-17 ~12:45 IST (Windows); baton free.** Last code commit `e9aa786` (P0-15 E part 1: the 3 staging health URLs skip basic auth for UptimeRobot) is pushed **with this handoff commit**; its deploy follows the green push CI. `wip/P0-15` stale, unused.
- **Human request (15 Nov, standing for this run):** close P0 completely **with** staging and the client demo; demo guide `docs/DEMO_GUIDE.md`. `/demo` writes DEMO_NOTES.md at the phase close.
- **Finished:** P0-15 D1–D4 (backups on staging, laptop dump + PITR restore PASS) and E part 1 (`e9aa786`, security-reviewed, MEDIUMs fixed). Human decisions 16 Nov: production stack → P5-12 (C-47); health URLs without the staging password (DECISIONS).
- **Half-done: P0-15 E.** Exactly how to continue: (1) check the push CI of this handoff commit and the Deploy run after it (`gh run list --limit 3`); (2) `curl -s -o /dev/null -w "%{http_code}" https://staging.mozrewards.com/api/health/ready` → **200** without a password (17 Nov 06:30 UTC it was 401: `e9aa786` not yet deployed); (3) health.backup shows no alert with `BACKUPS_ENABLED=true` (System page or `/api/health/worker` with HEALTH_TOKEN); (4) human H-45 UptimeRobot monitors, then stop-staging phone alert test with Claude; (5) rest of E: B2 overwrite keeps the locked version (by design + capability check, record in the final review), C-35 request logs on the System page, ZAP/k6, final security review of the whole P0-15 diff incl. `51b67d7`, `8353e00`, `e9aa786` → C-40 → C-17 → `/subphase-complete` P0-E → `/phase-complete` → `/demo`; then P1-02.
- **Tested (17 Nov, Windows):** `gate:task` on `e9aa786`: typecheck, lint, format, titles, unit 1396/0, int 1231/0, build, check:bundle, sast, lint:sh all PASS; its last step "working tree unchanged" failed only because a progress file was edited during the run (no code change), so the gate was re-run on the final handoff tree and the pre-push hook lets the push through only on a pass. CI for `c212e67` green (43871015148) → Deploy green (43872448798); scheduled CI 16 Nov green.
- **Not yet tested:** push CI + deploy of `e9aa786`/this commit (running at handoff); health URLs 200 on staging; health.backup on staging with the flag on; UptimeRobot alerts; `walg-archive`/`backup-pipeline` integration suites skip on Windows (CI Linux runs them); demo guide clicks on staging (human); SSE through Cloudflare; Sentry release events from staging; seed-reset timer's first unattended run (Mon 23 Nov 04:30).
- **Do first:** `git pull`; no new env vars, migrations or seeds. A change to `infra/host/*` needs `scp -r infra <you>@72.61.17.208:moz-infra && ssh <you>@… 'sudo -n bash ~/moz-infra/host/harden.sh'` before a deploy uses it. Manual deploy dispatch: `-f sha=<commit with green push CI>`. Mac: long gates under `caffeinate -i`. Don't edit files while `gate:task` runs (its tree check fails).
- **VPS access:** root SSH off. Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`; `sudo -n` works. CI: `deploy@` forced command only.

## Status
- **Phase:** P0 closing: **P0-15 on `main`** (A, B, C1, C1b, C2, D1–D4 + staging checks C-23/C-32/C-36/C-37/C-38 done; E open; production stack → P5-12, C-47); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-17, Syedbadeshah76 (handoff: P0-15 E part 1 pushed, E continues)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8353e00`; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`.
- **P0-C closed** (C-40 quarantine open, P0 phase gate). **P0-D closed.** **P1-A started:** P1-01 done (13 Nov).
- P0-15 is the only P0-E task left: E remains. D4 (first staging backups, laptop dump + PITR restore PASS) done 16 Nov.

## Next (top 3)
1. After CI + deploy of `e9aa786`: health URLs 200 without password, health.backup no alert; H-45 UptimeRobot monitors (human) + stop-staging phone alert test.
2. **E** (C-35 request logs, UptimeRobot, ZAP/k6, RUNBOOK §12/§13, final P0-15 security review).
3. C-40 → C-17 → `/subphase-complete` P0-E → `/phase-complete` → `/demo`; then **P1-02** (closes C-15).


## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs **Backup half done 16 Nov (D4: heartbeats on staging, WAL from pg_stat_archiver, flag deployed with D4); left: health snapshot after deploy + request logs (E).** | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P0 phase gate | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-46 | P0-15 D4 | P5-12 | Production backups on: `moz-backup wal-on production`, first dump + `backup:verify --env production` (dump + `--wal`) PASS, then `BACKUPS_ENABLED=true` in `infra/deploy/production.env` | SESSION_LOG + production health snapshot |
| C-47 | P0-15 (human 16 Nov) | P5-12 | Production stack set up before go-live (DECISIONS 16 Nov): secrets, Tunnel/origin lock (C-44), `init-env production`, maintenance-only deploy, then backups (C-46) and UptimeRobot production monitors; P0-15 AC7 re-checked with both stacks running | deploy log + `docker stats` + SESSION_LOG |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human: none blocking. Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (17 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- 17 Nov gate:task on `e9aa786`: unit 1396/0, int 1231/0, build, bundle, sast, lint:sh PASS (re-run on the handoff tree before push); staging `/api/health/ready` 401 before the `e9aa786` deploy (expected).
- D4 laptop (human, from the password-manager key): `backup:verify --env staging` PASS; `--wal --target-time 2026-11-16T10:00:15Z` PASS (base …2A + 32 WAL, all checks).
- D4 host: dump 02:30 UTC in B2 (sha256 recorded); `wal-on` base 09:59 UTC; `pg_stat_archiver` 0 failures; `moz-backup drill staging` all pass.
- backup-verify integration 11/11 on Windows (fails without the MSYS fix with the human's exact error); deploy-env 12 (flag reaches the worker only).
- CI `43844301457` (D3b) green → Deploy `43845822169` green (release `8353e00`).


## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
