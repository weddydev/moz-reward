# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by talha.syed, 2026-11-15 10:00 (Mac)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by talha.syed, 2026-11-15 ~10:00 (Mac); baton free.** No code changed this session: all **human tasks blocking staging are done and checked by Claude**. P0-15 code is still on **`wip/P0-15` HEAD `25e05cf`** (pushed, CI `43482813705` green). Steps: **`progress/P0-15-plan.md`** (read the "Close plan" line first: it now says staging is part of the P0 close).
- **Human request (15 Nov, interrupted by this handoff):** "continue and close P0 completely and make it demo ready", plus a guide for demoing to the client. Read as: staging + demo inside P0 (DECISIONS 15 Nov supersedes the 13 Nov "carry staging to P1"; C-42 is not opened if staging lands). The client demo guide = `/demo` at the phase close (rehearsal on staging → `progress/DEMO_NOTES.md`); give the human the presenter notes then (staging basic-auth user `moz`, password in "Moz Rewards staging secrets"; demo accounts' TOTP from H-36; Google consent screen may still be in Testing mode → only listed test users can sign in with Google).
- **Finished this session (main, progress only):** H-40 checked (DNS proxied; secrets parse, Cloudflare Origin CA ECC cert, SAN `staging.mozrewards.com`, to 2041, key matches; key has CRLF → strip `\r` in deploy); VPS host keys checked from the Mac and a GitHub runner, saved to the Mac's known_hosts (fingerprints in P0-15-plan step C); H-41 (a) fresh staging secrets + `ALERT_EMAILS_STAGING` (shared inbox); H-42 fixed by Claude with the b2 CLI: default retention governance 35 d, host keys bucket-only + prefix + `listFiles,writeFiles`, restore key bucket-only `listFiles,readFiles`; v4 authorize check OK. H-43, H-44 added (🟢).
- **Half-done and how to continue:** `git switch wip/P0-15 && git merge --ff-only origin/wip/P0-15 && pnpm install` (HEAD must be `25e05cf`). Then: **(1) B2 run** hardening from the Mac (`ssh root@72.61.17.208`, strict host keys work); **(2) C1b** origin lock via proxy (T-5; write the Origin key with `tr -d '\r'`; commit known_hosts with the recorded fingerprints); **(3) C2** first staging deploy; **(4) D3** `pnpm backup:verify`; **(5) D4** first B2 backup: proves `listFiles,writeFiles` suffice for PutObject/ListObjectVersions and decides staging retention (objects get 35 d, not 7 d: moz-backup sets no per-object retention); **(6) E** + C-40 + C-17 → `/subphase-complete` P0-E → `/phase-complete` + `/demo`. Suggest `/resume autopilot` to the human for this run.
- **Tested (this session):** read-only GitHub workflows on the throwaway branch `wip/h40-check` (never merge; deletion is in H-38): runs `43690841831` (origin cert/key metadata), `43691848477` (host keys), `43697242708` (B2 keys v4 authorize: bucket, prefix, caps). `ssh root@…` with strict host checking OK. HTTPS `staging.mozrewards.com` → 522 (origin firewalled, expected). Main code unchanged since `03e3afc` (gate:task PASS, CI `43578704624` green).
- **Not yet tested:** SSL Full (strict) and Authenticated Origin Pulls (dashboard-only; proven by C1b smoke + direct-IP test); B2 uploads with the new keys (D4); Backblaze's native v3 API rejects the new multi-bucket-format keys (S3 API unaffected; any native-API tool must use v4); the restore key's password-manager copy (first `pnpm backup:verify`, H-29); everything on a real host; deploy.yml never run.
- **Do first:** nothing new locally. `b2` CLI 5.0.3 installed on the Mac (signed out; `~/.b2_account_info` empty). Migrations: `wip/P0-15` adds 0016 + 0017. Host-script tests need bash ≥ 4 and gpg. Progress files on **main** only; code on `wip/P0-15`. **Windows laptop:** delete the obsolete `C:\Users\DELL\moz-secrets-staging-2026-11-13.env` (H-44); `ssh-add` once before VPS work; its known_hosts can confirm the host key (H-43). This terminal is zsh: unquoted `${x:+a b}` doesn't split (write bash scripts for multi-arg commands).

## Status
- **Phase:** P0 closing: **P0-15 on `wip/P0-15`** (A, B1, B2 files, C1, D1, D2 done); human 15 Nov: close P0 **with** staging and the client demo (DECISIONS 15 Nov), then P1-02.
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-15, talha.syed (handoff: human tasks for staging done; next B2 run → C1b → C2 → D3/D4 → E → P0 close + demo; baton free)
- **Staging and production:** one Hostinger VPS 72.61.17.208 (SSH from the Mac works, host keys pinned; not hardened; B2 keys + retention ready) — not provisioned yet. Origin lock via Cloudflare proxy until launch (T-5)

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- **P1-A started:** P1-01 done (13 Nov); C-34 closed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); human inputs for staging now in place (H-04, H-27, H-28 staging done 13 Nov); H-34/H-36 leftovers after the first deploy.

## Next (top 3)
1. **P0-15 staging**: B2 run (hardening) → C1b origin lock via proxy (T-5) → C2 first staging deploy (closes C-19, C-21, C-27, C-32, C-33, C-38 with evidence) → D3 `backup:verify` → D4 first B2 backup + restore drill → E (request logs, UptimeRobot monitors, ZAP/k6, RUNBOOK walks; C-23, C-35, C-36, C-37).
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
- `main` `03e3afc` (Mac): gate:task PASS (unit 1040, int 1134, build, bundle, sast); CI `43578704624` green. Later main commits are docs/progress only.
- `wip/P0-15` `25e05cf`: pre-push gate PASS (13 Nov); CI `43482813705` green. `40769e9` gate:task PASS (unit 1260, int 1172, build, bundle, sast, lint:sh 5); wal-g e2e 3/3.
- VPS: `ssh root@72.61.17.208` from the Mac OK with strict host keys (fingerprints matched from a GitHub runner, run `43691848477`), 15 Nov.
- Staging inputs: origin cert/key (run `43690841831`) and B2 keys (run `43697242708`) checked by read-only workflows, 15 Nov.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
