# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: free — last held by talha.syed, 2026-11-15 (Mac)

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Handed over by talha.syed, 2026-11-15 (Mac); baton free.** No task code changed this session (14–15 Nov): a speed audit, process changes, and the human-task path to staging. P0-15 code is still on **`wip/P0-15` HEAD `25e05cf`** (pushed, CI `43482813705` green). Steps: **`progress/P0-15-plan.md`** (read its "Close plan" line first).
- **Finished this session (all on main):** `/autopilot` mode (off by default; `.claude/commands/autopilot.md`), never wait idle for CI, the pre-push hook runs `pnpm check` for pushes only to `wip/*` (`gateFor` in `scripts/pre-push.ts`), `/resume` fetches every branch and stops if the wip HEAD differs from this note, PROGRESS split (`progress/MAP.md`, `progress/FOLLOWUPS.md`), **`progress/TEMPORARY.md`** register of stopgaps (T-1…T-5; gates P5-14; standing rule in CLAUDE.md §3). H-39 done from the Mac (SSH as root verified). Issue #1 closed (H-35).
- **Human decisions (14 Nov):** (1) repo public until launch (T-2, C-43). (2) **No Cloudflare Tunnel for now** (Zero Trust wants a card): staging origin lock = proxied `A` record + ufw 443 only from Cloudflare ranges + Authenticated Origin Pulls + Origin certificate, Full (strict); Tunnel back before launch (T-5, C-44 → P5-12, SECURITY §11 exception, DECISIONS 14 Nov). H-40 now has these dashboard steps. **H-40 done 15 Nov** (checked by Claude; Full strict + AOP proven in C1b). **H-41 done 15 Nov** (fresh staging secrets from the Mac; alert emails = shared inbox). VPS host key checked from two networks (H-43 later). **H-42 done 15 Nov** (narrow B2 keys + 35 d retention by Claude via b2 CLI; human: import the keys file, later delete `moz-backups`).
- **Half-done and how to continue:** `git switch wip/P0-15 && git merge --ff-only origin/wip/P0-15 && pnpm install` (HEAD must be `25e05cf`). Then, no human input needed: **(a) new step "C1b origin lock via proxy" (T-5)** on `wip/P0-15`: drop `cloudflared` from the staging stack, Caddy publishes 443 with the Origin certificate (secrets `CLOUDFLARE_ORIGIN_CERT_STAGING` / `CLOUDFLARE_ORIGIN_KEY_STAGING`, written by deploy.yml's caddy role) and requires Cloudflare's origin-pull client certificate, trusted proxies = Cloudflare ranges; harden.sh: ufw 443 only from Cloudflare's published ranges + a refresh timer, 80 closed; deploy.yml smoke via `https://staging.mozrewards.com`; deploy-env/deploy-secrets/tests/RUNBOOK §13 updated; test that a direct TLS hit on the VPS IP without the client cert fails. **(b) D3** `pnpm backup:verify` (+ `--wal --target-time` PITR vs MinIO). Then the Close plan: E local parts → C-40 → C-17.
- **Waiting on the human:** H-40 (origin settings + two secrets), H-41 choice **(a) regenerate the staging secrets on the Mac** (nothing deployed with them; `gh secret delete` the 7 generated ones, then `node scripts/deploy-secrets.mjs staging` writes a new file in the Mac's home) **or (b)** import the Windows file — plus `ALERT_EMAILS_STAGING`; H-42 (B2). Open question to the human: close P0 without staging as decided on 13 Nov (C-42 → P1-A), or keep P0 open until the staging demo works.
- **Tested (this session, Mac):** gate:task on `03e3afc` PASS (unit 1040, int 1134, build, bundle, sast); `scripts/pre-push.test.ts` 13/0 (3 new `gateFor` tests failed first); CI `43578704624` on `03e3afc` green; CI `43482813705` on `wip/P0-15` `25e05cf` green; `ssh root@72.61.17.208` from the Mac OK (Ubuntu 24.04.5, 15 GB RAM, 192 GB free, Docker not installed).
- **Not yet tested:** the new `gateFor` path on a real `wip/*` push; `/autopilot` never run; everything on a real host (harden, moz-deploy, units, compose); deploy.yml never run; the proxy origin lock (not built); B2 storage estimate (NOT VERIFIED); C-40; H-37 devices; staging (none).
- **Do first:** nothing new locally. Migrations: `wip/P0-15` adds 0016 + 0017 (renumber if main gets its own first). Host-script tests need bash ≥ 4 and gpg (`brew install bash gnupg`). Progress files on **main** only; code on `wip/P0-15`. **Windows laptop:** `/resume` renames the stale `..\CLAUDE.md`; before any VPS work there, load the key once (`ssh-add` in PowerShell, old H-39 steps); H-41's Windows secrets file must be deleted (after import, or as obsolete if H-41 (a)). Low memory can crash a Vitest worker in the pre-push gate (re-run); `pnpm sast` takes 10–23 min; no Python (use node).

## Status
- **Phase:** P0 closing: **P0-15 on `wip/P0-15`** (A, B1, B2 files, C1, D1, D2 done); human 13 Nov: finish the non-human work, carry staging to P1 as C-42, close P0, then P1-02 (plan "Close plan").
- **Current sub-phase:** P1-A shops and entry: ~~P1-01~~ → P1-02 → P1-03 → P1-04. P0-E waits only on P0-15 (human tasks).
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** everything done by **Thu 10 Dec 2026** (human, 10 Nov). Per-phase dates are not tracked (CLAUDE.md "Pace").
- **Last updated:** 2026-11-15, talha.syed (H-40 checked; P0-15 next: C1b origin lock via proxy, then D3; baton free)
- **Staging and production:** one Hostinger VPS 72.61.17.208 (SSH from the Mac works; not hardened; backups on B2) — not provisioned yet. Origin lock via Cloudflare proxy until launch (T-5)

## Now
- **P0-C closed** (`576b73e`; 5-project run `43269125099` 675/0/0 flaky). C-40 quarantine open (P0 phase gate).
- **P0-D closed** (P0-12 + fixes; staging smoke pending until P0-15). P1 brief reviewed.
- **P1-A started:** P1-01 done (13 Nov); C-34 closed.
- P0-15 is the only P0-E task left: VPS (H-06) and domain (H-07) ready; backups bucket ready (B2); human inputs for staging now in place (H-04, H-27, H-28 staging done 13 Nov); H-34/H-36 leftovers after the first deploy.

## Next (top 3)
1. **P0-15** C1b origin lock via proxy (T-5) → D3 `pnpm backup:verify` (+ PITR vs MinIO) → E local parts + final security review → C-40 → C-17 → P0 phase gate without staging → open C-42 → tick P0-15, close P0 (human, 13 Nov). Staging work: B2 run (hardening) can start now from the Mac (H-39 done); C2 first deploy needs H-40 + H-41; D4 needs H-42.
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
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-17 | Stryker | P0 phase gate | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |

## Blockers
- Human 🔴: **H-40** (Cloudflare origin settings: proxied DNS, Full strict, origin pulls, Origin certificate secrets; no Tunnel until launch, T-5) blocks the first staging deploy (C2). H-39 done 14 Nov from the Mac: the VPS hardening run (B2 run) is unblocked from the Mac; the Windows laptop needs its one-time `ssh-add` before it does VPS work.
- 🟠 for P0-15: **H-42** (B2 Object Lock + per-env keys, before D4); **H-41** (secrets file into the password manager + `ALERT_EMAILS_STAGING`) before the first deploy; after it: H-34 leftovers, H-36 steps 3–5. **Start now:** H-12 Play organisation account. **H-37** (🟠, before P1-06): iPhone + Android listen and vibrate check.
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk for P0-15: wal-g `wal-push` hangs against R2 without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (15 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- `main` `03e3afc` (Mac): gate:task PASS (unit 1040, int 1134, build, bundle, sast); CI `43578704624` green. Later main commits are docs/progress only.
- `wip/P0-15` `25e05cf`: pre-push gate PASS (13 Nov); CI `43482813705` green. `40769e9` gate:task PASS (unit 1260, int 1172, build, bundle, sast, lint:sh 5); wal-g e2e 3/3.
- VPS: `ssh root@72.61.17.208` from the Mac (agent + Keychain) OK, 15 Nov.

## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
