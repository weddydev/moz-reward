# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by Syedbadeshah76 since 2026-11-15 14:44 (Windows)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by Syedbadeshah76, 2026-11-15 ~16:30 (Windows); baton held.** P0-15 code on **`wip/P0-15` HEAD `6bcba7a`** (pushed; pre-push gate:task PASS: unit 1243, int 1160, build, bundle, sast, lint:sh). Steps: **`progress/P0-15-plan.md`**: read the "C1b progress" and "C1b to do" lines.
- **Human request (15 Nov, standing for this run):** close P0 completely **with** staging and the client demo, plus a demo guide for the client (= `/demo` notes in DEMO_NOTES.md after the staging rehearsal; outline already given to the human: staging link + basic auth `moz`, H-36 demo accounts, click-through script, known limits such as Google sign-in for listed test users only).
- **Finished this session:** C1b part 1 (`7a05aa5`): cloudflared → production.yml; staging Caddy publishes `0.0.0.0:443/tcp` on bridge `moz-stg-in` (no masquerade), `client_auth require_and_verify` with committed Cloudflare AOP CA; site-level `access_log` (both Caddyfiles adapt); compose lint 32/32; draft `infra/host/moz-origin-firewall` (`6bcba7a` IFS fix). Windows-only skips of the Linux host-script/gpg suites (`3530d59` and two test commits; they run in CI and on the Mac). Security design check of C1b: no BLOCK/HIGH, findings 1–14 written into the plan (MEDIUM 1–4, 7, 8 required). H-28 done (production Google client secrets set; staging redirect checked) → H-28b branding; H-39 done on Windows (Claude's batch SSH as root works); H-43 done (Windows known_hosts matches).
- **Half-done and how to continue:** `git switch wip/P0-15 && git merge --ff-only origin/wip/P0-15` (HEAD `6bcba7a`). Then **(1) finish C1b** per "C1b to do" (firewall fixes + harden.sh/docker drop-in + daemon.json firewall-backend, origin-tls role, roll_rest per env, deploy.yml roles + exit-28 probes, Caddy mTLS integration test, docs, task-level security review); **(2) B2 run** from Windows: `ssh root@72.61.17.208` works (agent holds the key); `scp -r infra` + `bash harden.sh` twice (2nd = 0 changes), then a NEW session as `badeshah` + `sudo -n true` before closing root; reboot pending on the VPS ("System restart required"); do NOT `do-release-upgrade` (26.04 offered; harden.sh requires 24.04); **(3) C2** → D3 → D4 → E → C-40 → C-17 → `/subphase-complete` → `/phase-complete` → `/demo`.
- **Tested:** see Last verified. `caddy adapt` both Caddyfiles (pinned 2.11.9). Draft firewall `valid_ranges`/`render_rules` by hand only.
- **Not yet tested:** moz-origin-firewall on a host (no unit tests yet, not installed by harden.sh); Caddy mTLS behaviour (needs the integration test); everything on a real host; deploy.yml never run; Full (strict) + AOP (dashboard-only).
- **Do first:** nothing locally. Windows laptop: Docker Desktop must be running for the gitleaks hook (start `C:UsersDELLAppDataLocalProgramsDockerDesktopDocker Desktop.exe`); no Python (use node for scripted edits); `git worktree` breaks the gitleaks hook; pre-push on `wip/*` runs the full gate:task here (~25 min, sast ~19 min).

## Status
- **Phase:** P0 closing: **P0-15 on `wip/P0-15`** (A, B1, B2 files, C1, C1b part 1, D1, D2 done); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-15, Syedbadeshah76 (checkpoint: C1b part 1 on wip/P0-15 `6bcba7a`; H-28, H-39 Windows, H-43 done)
- **Staging and production:** one Hostinger VPS 72.61.17.208 (SSH from the Mac works, host keys pinned; not hardened; B2 keys + retention ready) — not provisioned yet. Origin lock via Cloudflare proxy until launch (T-5)

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- **P1-A started:** P1-01 done (13 Nov); C-34 closed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); human inputs for staging now in place (H-04, H-27, H-28 staging done 13 Nov); H-34/H-36 leftovers after the first deploy.

## Next (top 3)
1. **P0-15 staging**: finish C1b origin lock via proxy (T-5; plan "C1b to do") → B2 run (hardening) → C2 first staging deploy (closes C-19, C-21, C-27, C-32, C-33, C-38 with evidence) → D3 `backup:verify` → D4 first B2 backup + restore drill → E (request logs, UptimeRobot monitors, ZAP/k6, RUNBOOK walks; C-23, C-35, C-36, C-37).
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
- `wip/P0-15` `6bcba7a` (Windows): pre-push gate:task PASS (unit 1243 + 20 skipped on Windows, int 1160, build, bundle, sast, lint:sh); compose lint 32/32; `caddy adapt` both Caddyfiles OK.
- VPS: `ssh -o BatchMode=yes root@72.61.17.208` from Windows OK with strict host keys (15 Nov); still unhardened (no Docker, ufw inactive).
- `main` `03e3afc` (Mac): gate:task PASS (unit 1040, int 1134, build, bundle, sast); CI `43578704624` green. Later main commits are docs/progress only.
- `wip/P0-15` `25e05cf`: pre-push gate PASS (13 Nov); CI `43482813705` green. `40769e9` gate:task PASS (unit 1260, int 1172, build, bundle, sast, lint:sh 5); wal-g e2e 3/3.
- VPS: `ssh root@72.61.17.208` from the Mac OK with strict host keys (fingerprints matched from a GitHub runner, run `43691848477`), 15 Nov.
- Staging inputs: origin cert/key (run `43690841831`) and B2 keys (run `43697242708`) checked by read-only workflows, 15 Nov.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
