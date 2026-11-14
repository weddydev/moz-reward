# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-13 17:08 UTC (Mac)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **14 Nov (talha.syed, Mac): process changes after the speed audit** (DECISIONS 14 Nov): `/autopilot` mode (off by default), never wait idle for CI, `wip/*` pushes run `pnpm check` in the hook, map → `progress/MAP.md`, LOW follow-ups → `progress/FOLLOWUPS.md`, Linux check for motion/visual specs, `/resume` fetches all branches and verifies the wip HEAD. Repo public until launch (C-43). P0-15 state below is unchanged.
- **Checkpoint by talha.syed, 2026-11-13 (Mac); baton held.** P0-15 in progress; steps in **`progress/P0-15-plan.md`** (read its new **"Close plan"** line first).
- **Human decision (13 Nov, this session):** close P0 now. Finish everything that needs no human task, then move all staging-only work (needs H-39/H-40/H-41/H-42) into one CARRIED row **C-42 "P0-15 staging"** targeting the P1-A close, tick P0-15/close P0, and start P1-02. Nothing is dropped (DECISIONS 13 Nov).
- **Finished (on `wip/P0-15`, HEAD `25e05cf`, pushed):** A, B1, B2 files, C1, D1, **D2** (this session): `infra/postgres/moz-walg` wal-g wrapper, compose archive settings, key pin + archive-off lever + `walg.env` in moz-deploy, moz-backup `base`/`wal-on`/`wal-off` + storage/key-expiry metrics (migration **0017**), health rules (pg_stat_archiver, lever, base, storage, key), backup role in deploy.yml (secrets `B2_BACKUP_KEY_ID_<ENV>`/`B2_BACKUP_KEY_<ENV>`, as H-42 says).
- **Half-done and how to continue:** **D3 next** (no human input): `git switch wip/P0-15 && pnpm install`; build `pnpm backup:verify` (`scripts/backup-verify.ts`, plan D bullet) incl. `--wal --target-time` PITR against MinIO in the amd64 image (reuse `tests/integration/walg-archive.test.ts` setup) = AC4 local proof; RUNBOOK §6/§12; then the Close plan order: E local parts → C-40 → C-17 → `/phase-complete` without staging → C-42 → P1-02.
- **Tested (this session, Mac):** gate:task on `40769e9` PASS (unit 1260, int 1172, build, bundle, sast, lint:sh 5); pre-push gate on `25e05cf` PASS; wal-g e2e 3/3; actionlint clean. D1 push CI `43477028692` green.
- **Not yet tested:** push CI for `40769e9`/`25e05cf` (check `gh run list --branch wip/P0-15 --limit 2`; the integration job now builds the amd64 Postgres image); everything on a real host (units, timers, harden, moz-deploy, lever bind mount, compose stacks); deploy.yml never run; B2 storage estimate (RESOURCES, NOT VERIFIED); Umami `read_only`; C-40; `global-error.tsx`; H-37 devices; staging (none).
- **Do first:** nothing locally. **Migrations:** `wip/P0-15` adds 0016 + 0017; if main gets its own first (P1-02), renumber the wip ones before merging. Switching main ↔ `wip/P0-15` changes devDependencies (`pnpm install`). Progress files on **main** only; code on `wip/P0-15`. Host-script tests need bash ≥ 4 and gpg (`brew install bash gnupg`); gpg homes need a short path (agent socket). H-41's secrets file on the Windows laptop must be deleted by the human after import.
- **Windows laptop notes:** low memory can crash a Vitest worker in the pre-push gate (re-run); `pnpm sast` takes 10–23 min; commit progress edits separately before pushing; no Python (use node); check `df -h /c` before big image pulls.

## Status
- **Phase:** P0 closing: **P0-15 on `wip/P0-15`** (A, B1, B2 files, C1, D1, D2 done); human 13 Nov: finish the non-human work, carry staging to P1 as C-42, close P0, then P1-02 (plan "Close plan").
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-14, talha.syed (process changes after the speed audit; P0-15 unchanged, D3 next; baton held)
- **Staging and production:** one Hostinger VPS 72.61.17.208 (ready, not hardened; backups on B2) — not provisioned yet

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- **P1-A started:** P1-01 done (13 Nov); C-34 closed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); human inputs for staging now in place (H-04, H-27, H-28 staging done 13 Nov); H-34/H-36 leftovers after the first deploy.

## Next (top 3)
1. **P0-15** D3 `pnpm backup:verify` (+ PITR vs MinIO) → E local parts + final security review → C-40 → C-17 → P0 phase gate without staging → open C-42 → tick P0-15, close P0 (human, 13 Nov). Staging work (B2 run, C2, D4, E staging) runs whenever H-39/H-40/H-41/H-42 land.
2. **P1-02** shop landing page (closes C-15), then P1-03, P1-04 (P1-A; its close also closes C-42).
3. P0-15 carries: C-19, C-21, C-23, C-27, C-32, C-33, C-35, C-36, C-37, C-38; wal-g write-only + public-key encryption proven vs MinIO (D2); B2 itself unproven until D4.

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
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: **H-39** (SSH key into the Windows agent) and **H-40** (staging tunnel token) block running P0-15 steps B–C on the VPS.
- 🟠 for P0-15: **H-42** (B2 Object Lock + per-env keys, before D4); **H-41** (secrets file into the password manager + `ALERT_EMAILS_STAGING`) before the first deploy; after it: H-34 leftovers, H-36 steps 3–5. **Start now:** H-12 Play organisation account. **H-37** (🟠, before P1-06): iPhone + Android listen and vibrate check.
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (13 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `wip/P0-15` `4e25e42` (Mac): gate:task PASS (unit 1167, int 1139, build, bundle, sast, lint:sh); moz-deploy tests 70/0 under bash 5.3 (23/70 failed under macOS bash 3.2 before `scripts/lib/find-bash.ts`). `main` `6807a9c`: `pnpm check` PASS (unit 1037).
- `wip/P0-15` `f144411` step C1 (Windows): gate:task PASS (unit 1167, int 1139, build, bundle, sast, lint:sh 3 scripts); new unit: migrate-stdin 12, deploy-env 9, deploy-secrets 5, moz-deploy 70 (per-env load/images; failed 4 before the fix); bundled `dist/cli/migrate.mjs --url-stdin` with `env -i` migrated the local test DB (exit 0) and refused a non-Postgres/empty input without echoing it; actionlint deploy.yml clean; host key fingerprint SHA256:cufEaKz… matches the laptop's trusted entry.
- `wip/P0-15` `e5c0116` step B2 (Windows): gate:task PASS (unit 1134, int 1139, build, bundle, sast, lint:sh); moz-deploy tests 65/0 (a removed allowlist rule → 3 failures); ShellCheck clean; init-env in Ubuntu 24.04 idempotent; real Redis with the generated TLS/ACL: plaintext refused, default user off, CONFIG/FLUSHALL refused, health PING only, wrong SAN rejected; both compose stacks `config` OK.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
