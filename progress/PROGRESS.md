# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-16 (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76, 2026-11-16 ~13:45 IST (Windows); baton held.** Staging release `8c33539` (deploy `43828459618` green). Work is on `main` (`wip/P0-15` stale, unused). Last CI `43827125636` on `8c33539` green.
- **Human request (15 Nov, standing for this run):** close P0 completely **with** staging and the client demo; demo guide `docs/DEMO_GUIDE.md` (H-36 done 16 Nov: demo TOTP keys in the human's authenticator). `/demo` writes the client-facing DEMO_NOTES.md at the phase close.
- **Finished this session:** C-23, C-36, C-38 closed (`51b67d7`: `cli/demo-signin-check.mjs` in every staging release + `moz-deploy seed-reset staging` + `moz-seed-reset.timer` Mon 04:30 London + deploy.yml auth-gated curls; RUNBOOK §16, DEMO_GUIDE reset step); C-32 closed (RLS EXPLAIN on staging → DECISIONS 16 Nov); Windows host-script test fix `e40b5e4`; CI flake fix `8c33539` (axe on /me/security mid-hydration → `data-hydrating`; other primitives in FOLLOWUPS). Host: harden.sh re-run (4 changes), timer enabled.
- **Exactly how to continue (P0-15):** **D3b** PITR (`progress/P0-15-plan.md` line 36: `pnpm backup:verify --wal --target-time`, MinIO test like walg-archive.test.ts) → **D4** first backups on staging + `BACKUPS_ENABLED=true` (then H-42 tail) → **E** (request logs C-35, UptimeRobot, ZAP/k6, RUNBOOK §12/§13 walks C-37, final security review of the whole P0-15 diff incl. `51b67d7`) → C-40 → C-17 → `/subphase-complete` → `/phase-complete` → `/demo`.
- **Tested:** gate:task PASS on `8c33539` (Windows: unit 1382, int 1192, sast, lint:sh 7). Deploy `43828459618`: release ran the demo sign-in check (200 challenge, no session; enable 401); C-23 client id replaced; C-36 `/u`, `/u/`, `/u/login`, `/u/script.js`, `/u/api/send` 404; C-38 enable without session = app 401; direct IP curl 28. `sudo systemctl start moz-seed-reset` on the host: 7 accounts + 3 shops re-created, check ok, Result=success.
- **Not yet tested:** the demo guide's clicks on staging (human, Part 2); backup:verify's passphrase prompt with a piped key; worker container health state (shows none); SSE/realtime through Cloudflare; Sentry release events from staging; the timer's first unattended run (Mon 23 Nov 04:30).
- **Do first:** `git pull`; nothing new to install. A change to `infra/host/*` needs `scp -r infra <you>@72.61.17.208:moz-infra && ssh <you>@… 'sudo -n bash ~/moz-infra/host/harden.sh'` before a deploy uses it (Windows: copy the script to the host before running a script that calls `docker exec -i`, it eats piped stdin). Manual deploy dispatch: pass `-f sha=<commit with green push CI>`. Mac: run long gates under `caffeinate -i`.
- **VPS access:** root SSH off. Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`; `sudo -n` works. CI: `deploy@` forced command only.

## Status
- **Phase:** P0 closing: **P0-15 on `main`** (A, B, C1, C1b, C2, D1, D2, D3 + staging checks C-23/C-32/C-36/C-38 done; D3b, D4, E open); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-16, Syedbadeshah76 (checkpoint: staging checks closed, release `8c33539`)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8c33539` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `8c33539`): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`.
- **P0-C closed** (C-40 quarantine open, P0 phase gate). **P0-D closed.** **P1-A started:** P1-01 done (13 Nov).
- P0-15 is the only P0-E task left: D3b, D4, E remain.

## Next (top 3)
1. **D3b** PITR (`backup:verify --wal --target-time`) → **D4** first B2 backups on staging + restore drill + `BACKUPS_ENABLED=true`.
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
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-37 | P0-13 AC4 | P0-15 | RUNBOOK §4 deploy, §5 rollback, §9 key rotation, §12 disk, §13 Tunnel walked once on staging **Done 15 Nov: §4 deploy (43738380893) + §5 rollback (43738687616) + redeploy (43738782802); §9 rotation of BASIC_AUTH_PASSWORD_STAGING (human set new value, redeploy 43742044923: caddy.env rewritten, Caddy recreated, smoke with the new password ready). Left: §12, §13.** | deploy/rollback logs + SESSION_LOG |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P0 phase gate | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human: none blocking. Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes). H-42 tail (delete `moz-backups` after D4).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (16 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `main` `8c33539` (Windows): gate:task PASS (unit 1382, int 1192, sast, lint:sh 7). CI `43827125636` green.
- Staging deploy `43828459618` green: demo sign-in check in the release (200 challenge/no session, enable 401); C-23 id replaced; C-36 `/u*` 404; C-38 enable 401 (app); direct-IP curl 28.
- Host: `moz-seed-reset.service` run by hand → re-seeded, check ok, Result=success; timer next Mon 23 Nov 04:30; moz-deploy hash = repo; `systemd-analyze verify` ok.
- C-32: RLS EXPLAIN on staging (PG 17.11): lookup p95 0.020 → 0.105 ms, page 0.023 → 0.107 ms; 0 other-shop rows (DECISIONS 16 Nov).


## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
