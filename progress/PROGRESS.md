# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-16 (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handoff by talha.syed, 2026-11-15 23:30 IST (Mac); baton free.** **P0-15 C2 done: staging is live** at `https://staging.mozrewards.com` (gate user `moz`; password rotated 15 Nov, in the human's password manager), release `4c3d240`. Work is on `main` (`wip/P0-15` is stale, unused). Last CI `43737509611` on `4c3d240` green; later commits are docs/progress only. gate:task PASS on `87cf27d` at handoff.
- **Human request (15 Nov, standing for this run):** close P0 completely **with** staging and the client demo, plus a client demo guide. Guide written: `docs/DEMO_GUIDE.md` (click-by-click; Part 1 setup, Part 2 practice, Part 3 13-step demo). `/demo` still writes the client-facing DEMO_NOTES.md at the phase close.
- **Finished this session:** six staging deploy blockers fixed (origin-tls on a fresh host `1219f7d`; ufw SSH limit → CI SSH multiplexing `4f7f0e9`; runtime APP_ENV `cc2c8b2`; H-36 secret (human); Caddy listen wait `5f7a25d`; probe step under bash -e `4c3d240`); deploy → rollback → redeploy green; RUNBOOK §9 rotation walked (basic-auth password); D3 `pnpm backup:verify` + security-review fixes (`7ccc6d6`, `68e25e8`, `bc431d6`); RUNBOOK §6 (backup:verify) + §16 (demo accounts); Mac host-script tests use GNU tools; CI E2E flake precondition `2fa398c`. CARRIED closed: C-19, C-21, C-27, C-33; C-32/C-37/C-38 partly; C-45 added.
- **Half-done / exactly how to continue (P0-15):** (1) **C-23/C-36/C-38 staging checks behind basic auth:** add a manual `workflow_dispatch` job (deploy.yml or a small staging-check.yml) that reads `BASIC_AUTH_PASSWORD_STAGING` into a netrc and curls: `-H 'X-Request-Id: chosen-by-client'` not reflected (C-23); `/u/` and `/u/login` → 404 (C-36); demo owner password alone → two-step challenge, `/api/auth/two-factor/enable` → 401 (C-38). (2) C-32 RLS EXPLAIN on staging data (psql as moz_app in `moz-staging-postgres-1`) → DECISIONS. (3) C-38 weekly `seed --reset` schedule: check it exists (timer/scheduled job), else add. (4) **D3b** PITR (`progress/P0-15-plan.md` line 36) → **D4** first backups on staging + `BACKUPS_ENABLED=true` → **E** (request logs C-35, UptimeRobot, ZAP/k6, RUNBOOK §12/§13 walks C-37) → C-40 → C-17 → `/subphase-complete` → `/phase-complete` → `/demo`.
- **Tested:** gate:task PASS on `87cf27d` (unit 1378, int 1214, sast, lint:sh 7); staging deploy `43738380893` (migrations over the previous release + seed, rolling web, mTLS refusal curl 56, smoke ready, direct-IP 443/80 curl 28), rollback `43738687616`, redeploy `43738782802`, password-rotation redeploy `43742044923`: all green. From the Mac: VPS IP 443/80 dropped; hostname 401 via Cloudflare with `x-robots-tag: noindex`. Host: web has no DATABASE_URL_WORKER, max_connections 80, worker stop grace 90 s; `demo-credentials.mjs` (+ `--codes`) exit 0 in the slim image. backup:verify unit 10 + integration 11.
- **Not yet tested:** the demo guide's clicks on staging (written from the code; the human runs Part 2); backup:verify's passphrase prompt with a piped key; worker container health state (shows none); SSE/realtime through Cloudflare; Sentry release events from staging.
- **Do first:** `git pull`; nothing new to install (Mac: `brew install bash coreutils gnu-sed openssl@3` for host-script tests). A change to `infra/host/*` needs `scp -r infra <you>@72.61.17.208:moz-infra && ssh <you>@… 'sudo -n bash ~/moz-infra/host/harden.sh'` before a deploy uses it. Manual deploy dispatch: pass `-f sha=<commit with green push CI>`. Mac: run long gates under `caffeinate -i`.
- **VPS access:** root SSH off. Mac `ssh talha@72.61.17.208`, Windows `C:/Windows/System32/OpenSSH/ssh.exe badeshah@72.61.17.208`; `sudo -n` works. CI: `deploy@` forced command only.

## Status
- **Phase:** P0 closing: **P0-15 on `main`** (A, B, C1, C1b, **C2**, D1, D2, **D3** done; D3b, D4, E open); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-15, talha.syed (handoff: staging live, demo guide written)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `4c3d240`; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live 15 Nov** (release `4c3d240`): deploy, rollback, redeploy green; origin lock proven from outside. Demo guide `docs/DEMO_GUIDE.md`.
- **P0-C closed** (C-40 quarantine open, P0 phase gate). **P0-D closed.** **P1-A started:** P1-01 done (13 Nov).
- P0-15 is the only P0-E task left: D3 done; D3b, D4, E and the staging curls (C-23/C-36/C-38) remain.

## Next (top 3)
1. **P0-15 staging checks:** auth-gated curl job (C-23, C-36, C-38), C-32 RLS EXPLAIN → DECISIONS, C-38 weekly reset check.
2. **D3b** PITR → **D4** first B2 backups on staging + restore drill + `BACKUPS_ENABLED=true` → **E** (C-35 request logs, UptimeRobot, ZAP/k6, RUNBOOK §12/§13).
3. C-40 → C-17 → `/subphase-complete` P0-E → `/phase-complete` → `/demo`; then **P1-02** (closes C-15).


## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-15 | B-SEC-11 | P1-02 | Shop-name lookup by code: data cached in redis-cache (60 s), HTML never CDN-cached, our Redis rate limit + Cloudflare free rule as backstop | P1-02 test |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-23 | P0-19 (I) | P0-15 | Caddy sets `X-Request-Id` itself on every request, overwriting any client value (the app keeps a well-formed incoming id when a trusted proxy is configured) | staging curl with a chosen id → not reflected |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-32 | P0-20 | P0-15 | Postgres bootstrap creates moz_app/moz_auth/moz_worker logins, moz_rls NOLOGIN WITH ADMIN to a non-superuser migration owner (boot asserts NOLOGIN), PostGIS revokes re-applied; four URLs only in their containers; staging max_connections 80; RLS EXPLAIN on staging data **Done 15 Nov on staging: bootstrap roles, web has no _WORKER/_MIGRATIONS, max_connections 80, boot role checks pass. Left: RLS EXPLAIN on staging data → DECISIONS.** | staging boot + DECISIONS |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P0-15 | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs | staging health snapshot + screenshot |
| C-36 | P0-13 review | P0-15 | Caddy proxies only `/u/script.js` + `/u/api/send` to Umami; dashboard on its own host behind auth | staging curl `/u/` → 404 |
| C-37 | P0-13 AC4 | P0-15 | RUNBOOK §4 deploy, §5 rollback, §9 key rotation, §12 disk, §13 Tunnel walked once on staging **Done 15 Nov: §4 deploy (43738380893) + §5 rollback (43738687616) + redeploy (43738782802); §9 rotation of BASIC_AUTH_PASSWORD_STAGING (human set new value, redeploy 43742044923: caddy.env rewritten, Caddy recreated, smoke with the new password ready). Left: §12, §13.** | deploy/rollback logs + SESSION_LOG |
| C-38 | P0-16 | P0-15 | Staging release runs `db:seed` as moz_worker with `DEMO_EMAIL_BASE` (exit 0 incl. the TOTP check); weekly `db:seed --reset` + RUNBOOK line; slim image can run `db:seed` / `demo:credentials`; demo owner password alone → challenge, enable 401 on staging **Done 15 Nov: release runs db:seed with DEMO_EMAIL_BASE, exit 0 (3 shops, 7 accounts; re-run idempotent). `demo:credentials` (+ `--codes`) runs in the slim staging image (exit 0, 7 accounts; RUNBOOK §16). Left: weekly --reset schedule check, password-alone → challenge + enable 401 (needs basic auth: do it in a workflow step with BASIC_AUTH_PASSWORD_STAGING).** | deploy log + staging curl |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P0 phase gate | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human: none blocking. Needed later: H-36 steps 3–5 after the first deploy (demo TOTP keys, needed for the demo); at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes). H-42 tail (delete `moz-backups` after D4).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (15 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `main` `87cf27d` (Mac): gate:task PASS (unit 1378, int 1214, build reused, bundle, sast, lint:sh 7). Last CI `43737509611` (`4c3d240`) green.
- Staging: deploy `43738380893` → rollback `43738687616` → redeploy `43738782802` → rotation redeploy `43742044923`, all green (migrations, seed, rolling web, mTLS curl 56, smoke ready, direct-IP curl 28).
- From outside (Mac): `https://72.61.17.208/` and `:80` curl 28; `https://staging.mozrewards.com/` 401 via Cloudflare, `x-robots-tag: noindex, nofollow`.
- Host: web env without DATABASE_URL_WORKER/_MIGRATIONS; max_connections 80; worker StopTimeout 90; demo-credentials exit 0 in the slim image; host scripts = repo (harden.sh 1 change, hashes match).


## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
