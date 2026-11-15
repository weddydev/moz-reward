# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-15 14:44 (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76, 2026-11-15 ~18:45 (Windows); baton held.** **C1b done and the VPS is hardened (B2 run).** `wip/P0-15` `eca36ec` (+ this progress commit) is about to fast-forward `main` for **C2** (first staging deploy: deploy.yml runs automatically after green CI on a push to main).
- **Human request (15 Nov, standing for this run):** close P0 completely **with** staging and the client demo, plus a demo guide for the client (= `/demo` notes in DEMO_NOTES.md after the staging rehearsal). The human wants it fast (same quality).
- **Finished this session:** C1b 2c `e66d9ac`, 2d `58a9c63`, task-level security review fixes `eca36ec` (plan "C1b done"); B2 run on the VPS + `harden.sh` fixes `75fba2d` (plan "B2 run"); `init-env staging`; merged origin/main into wip (`4210aea`, progress files = main's).
- **Half-done and how to continue:** C2: if main is not yet at the wip head, `git switch main && git merge --ff-only wip/P0-15 && git push` (pre-push runs gate:task); then watch CI on main → Deploy (staging) run: write-env (incl. origin-tls) → load → release (firewall check, migrations, seed, rolling web, host mTLS probe, port check) → smoke via hostname → direct-IP probes (exit 28). Then rollback once (`gh workflow run deploy.yml -f environment=staging -f action=rollback`) and redeploy (C-37 §5); collect C-19/C-21/C-27/C-32/C-33/C-38 evidence. Then D3 → D4 → E → C-40 → C-17 → `/subphase-complete` → `/phase-complete` → `/demo`.
- **SSH from Windows:** use `C:/Windows/System32/OpenSSH/ssh.exe` (holds the agent key; Git Bash's ssh can't). Root SSH is now refused: `ssh badeshah@72.61.17.208` + sudo. CI key: `~/.ssh/moz_ci_deploy` → forced command.
- **Not yet tested:** everything on the deployed stack (first deploy pending); Cloudflare Full (strict) + AOP end to end; CI for `58a9c63` was running (`43714435786`) at this checkpoint, `eca36ec` not yet in CI.
- **Do first:** nothing locally. Windows: Docker Desktop must run (gitleaks hook); no Python (node for scripted edits); `git worktree` breaks the gitleaks hook.

## Status
- **Phase:** P0 closing: **P0-15 on `wip/P0-15`** (A, B1, B2 files, C1, C1b parts 1–2, D1, D2 done); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-15, Syedbadeshah76 (C1b done, VPS hardened; C2 next)
- **Staging and production:** one Hostinger VPS 72.61.17.208, **hardened 15 Nov** (harden.sh, 0 changes on re-run; Docker 29.9.3; origin firewall on; `init-env staging` done); not deployed yet. Origin lock via Cloudflare proxy until launch (T-5)

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- **P1-A started:** P1-01 done (13 Nov); C-34 closed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); human inputs for staging now in place (H-04, H-27, H-28 staging done 13 Nov); H-34/H-36 leftovers after the first deploy.

## Next (top 3)
1. **P0-15 C2**: fast-forward main to wip → CI → automatic staging deploy → rollback once + redeploy (closes C-19, C-21, C-27, C-32, C-33, C-38 with evidence) → D3 `backup:verify` → D4 first B2 backup + restore drill → E (request logs, UptimeRobot, ZAP/k6, RUNBOOK walks; C-23, C-35, C-36, C-37).
2. C-40 (quarantined Pixel 7 motion test) → C-17 (mutants) → `/subphase-complete` P0-E → `/phase-complete` → `/demo` (client notes in DEMO_NOTES.md).
3. Then **P1-02** shop landing page (closes C-15), P1-03, P1-04.


## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-19 | P0-14 | P0-15 | Migration test against the previous release's schema + seed (no release exists yet) | CI/staging deploy |
| C-21 | P0-14 | P0-15 | Runtime image without dev deps/tool binaries; Trivy passes with no `--skip-dirs` — **built + local evidence (step A); closes on the main image job** | CI image job |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-32 | P0-20 | P0-15 | Postgres bootstrap creates moz_app/moz_auth/moz_worker logins, moz_rls NOLOGIN WITH ADMIN to a non-superuser migration owner (boot asserts NOLOGIN), PostGIS revokes re-applied; four URLs only in their containers; staging max_connections 80; RLS EXPLAIN on staging data | staging boot + DECISIONS |
| C-33 | P0-20 review | P0-15 | Boot asserts each DB URL is its expected role (pg_has_role) and web logins can't SET ROLE worker/auth — **built + integration (step A); closes when staging boots** | integration |
| C-27 | P0-18 | P0-15 | Worker container stop grace ≥ 75 s (60 s drain); bundled worker keeps the `server-only` hook (emails render) | staging deploy log + worker-process test |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-36 | P0-13 review | P0-15 | Caddy proxies only `/u/script.js` + `/u/api/send` to Umami; dashboard on its own host behind auth | staging curl `/u/` → 404 |
| C-37 | P0-13 AC4 | P0-15 | RUNBOOK §4 deploy, §5 rollback, §9 key rotation, §12 disk, §13 Tunnel walked once on staging | deploy/rollback logs + SESSION_LOG |
| C-38 | P0-16 | P0-15 | Staging release runs `db:seed` as moz_worker with `DEMO_EMAIL_BASE` (exit 0 incl. the TOTP check); weekly `db:seed --reset` + RUNBOOK line; slim image can run `db:seed` / `demo:credentials`; demo owner password alone → challenge, enable 401 on staging | deploy log + staging curl |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P0 phase gate | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human: **none blocking** the next steps (H-40, H-41, H-42 done 15 Nov). Needed later: H-36 steps 3–5 after the first deploy (demo TOTP keys, needed for the demo); at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes). H-42 tail (delete `moz-backups` after D4).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (15 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `wip/P0-15` (Windows): `pnpm check` PASS on `58a9c63` (unit 1327 + 21 skipped); targeted after `eca36ec`: moz-deploy + moz-origin-firewall 176/0 (1 skipped: jq), caddy-mtls 6/6, host-heartbeat + health 34/0, rls 29/0, lint:sh 7 clean; `30f21f5` CI `43710655447` green.
- VPS (15 Nov): harden.sh runs 4–5 `harden: 0 changes`; after reboot docker/fail2ban/ufw/refresh timer active; `moz-origin-firewall check` ok (15 ranges), also after `systemctl restart docker`; `sshd -T`: permitrootlogin no, passwordauthentication no, AllowUsers deploy badeshah talha; root SSH refused, badeshah sudo OK.
- `caddy adapt` both Caddyfiles (2.11.9) OK after `https_port`/`ocsp_stapling off`.
- Staging inputs: origin cert/key (run `43690841831`: issuer CloudFlare Origin SSL ECC CA, P-256, SAN staging.mozrewards.com, to 11 Nov 2041) and B2 keys (run `43697242708`); every staging secret deploy.yml reads is set (`gh secret list`, names only).


## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
