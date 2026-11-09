# HUMAN TASKS — things only the developers can do

Claude keeps this list current. It is reviewed and updated at the end of every phase and sub-phase, at every `/handoff`, and whenever a new dependency appears. Claude does everything it can itself first (CLI tools, generated configs, scripts); only what truly needs a human is listed here, with exact steps.

**Priority legend**
- 🔴 **Blocking now**: work is waiting on it; Claude has moved on to other tasks meanwhile
- 🟠 **Needed soon**: needed within the current or next phase
- 🟢 **Later**: needed before launch or a later phase; do it whenever convenient

**Nothing is blocking code work right now.** Local development uses stand-ins (Mailpit for email, MinIO for storage, fake push/AI) until the real accounts exist. Plan v4 (9 Nov) added client decisions H-21…H-24: **H-21 is needed before staging (P0-15)**. When you finish one, tell Claude e.g. "H-21 done" and put any keys in `.env.local` yourself (never paste secrets into chat or Git).

## Open

| ID | Priority | Task | Needed by | Why | Est. time |
|---|---|---|---|---|---|
| H-07 | 🟠 | Buy domain; Cloudflare account; move DNS to Cloudflare | 13 Nov 2026 (end of P0) | Staging URL `staging.<domain>`, email domain, CDN | 30 min (+ up to 24 h DNS) |
| H-06 | 🟠 | Staging VPS (London) + SSH access | 13 Nov 2026 (end of P0) | Demo 1 runs on staging | 30 min |
| H-05 | 🟠 | Postgres database for staging (Neon, London/EU) | 13 Nov 2026 (end of P0) | Staging data | 10 min |
| H-04 | 🟠 | Email provider (Resend) + API key + domain verification | 13 Nov 2026 (Demo 1 shows email-link sign-in) | Magic-link and invite emails | 15 min (+ DNS wait) |
| H-20 | 🟠 | Cloudflare Turnstile site + keys (after H-07) | 13 Nov 2026 (P0-06 puts Turnstile on the sign-in link form; staging fails closed without a real secret) | Bot protection on sign-in (SECURITY §6) | 5 min |
| H-08 | 🟢 | Cloudflare R2 bucket + API token | P2 start (~16 Nov 2026) | Image uploads | 10 min |
| H-09 | 🟢 | AI provider API key (Google Gemini) | P3 start (~23 Nov 2026) | AI review help | 5 min |
| H-11 | 🟢 | Production VPS + production database | P5 (~7 Dec 2026) | Launch | 30 min |
| H-21 | 🟠 | Client: confirm capacity model + hosting budget (managed multi-host production) | Before P0-15 staging (~13 Nov 2026) | Production topology, load-test targets, cost (ARCHITECTURE §1, §12) | 30 min with the client |
| H-22 | 🟠 | Client: confirm loyalty-rule defaults (PRODUCT §4–§6, §15 state matrix, §16 recovery) | Before P1 starts | P1 builds these rules; changing them later costs rework | 45 min with the client |
| H-23 | 🟠 | Solicitor: review compliance drafts (ROPA, DPIA, processor register, retention schedule) | Before real customer data (P1 go-live) | UK GDPR/PECR/DUAA obligations (COMPLIANCE §2) | Client side |
| H-24 | 🟢 | Client: decide large-organisation controls (admin SSO, pen-test vendor, on-call rota) | Before P5 (~30 Nov 2026) | SECURITY §15, launch readiness | 30 min with the client |
| H-12 | 🟠 | Google Play Console account — **organisation** developer account (avoids the 14-day closed-test rule for new personal accounts); verification takes days | **Start now**; must be verified before P5-04 | Android app; Play release timing (S-03) | 20 min + Google verification |
| H-13 | 🟢 | Test each demo on a real Android phone and a real iPhone | Every phase end | Real-device check | 15 min / phase |
| H-14 | 🟢 | Send the client the demo notes and collect feedback | Every phase end | Client sign-off | — |
| H-15 | 🟢 | Client's solicitor reviews the legal page drafts | P5 | Launch | Client side |
| H-17 | 🟠 | Decide whether to tighten Claude Code permissions in `.claude/settings.json` (audit security #17 + plan audit H7: `node:*`/`pnpm:*` run anything without a prompt, incl. `pnpm add`; `cat`/`node` can read `.env*`, so the Read deny is bypassable) | Before staging secrets exist (~13 Nov 2026) | Tooling safety; Claude will not change its own permissions | 5 min |

## Steps

### H-19 — Free port 5432 on the Windows laptop
1. Open **PowerShell as Administrator** (Start → type "PowerShell" → right-click → Run as administrator).
2. Run: `Stop-Service postgresql-x64-14, postgresql-x64-18 -ErrorAction SilentlyContinue`
3. Run: `Set-Service postgresql-x64-14 -StartupType Manual; Set-Service postgresql-x64-18 -StartupType Manual` (stops them coming back after a reboot; start them by hand if another project needs them).
4. Check: `netstat -ano | findstr :5432` prints nothing.
5. Tell Claude "H-19 done"; Claude runs `pnpm services:up`.

### H-07 — Domain + Cloudflare (do this first: H-04 and H-06 depend on the domain)
- After the domain exists: Google Cloud → Moz Rewards → Google Auth Platform → Clients → Moz Rewards client (`404449…-1f0s…`): add origin `https://staging.<domain>` and redirect URI `https://staging.<domain>/api/auth/callback/google` (from H-03).
1. Buy a domain (e.g. `mozrewards.co.uk`) — Cloudflare Registrar (dash.cloudflare.com → Domain Registration) is simplest because DNS is then already on Cloudflare.
2. If bought elsewhere: Cloudflare → Add a site → enter the domain → Free plan → copy the two nameservers → set them at your registrar.
3. Tell Claude the domain name. Claude will list the exact DNS records (staging A record, email records) once H-06 and H-04 exist.

### H-06 — Staging VPS
1. Create a VPS in **London**: e.g. Hetzner (no London — use DigitalOcean/Vultr/Linode London), Ubuntu 24.04 LTS, 2 vCPU / 4 GB RAM.
2. During creation add your SSH public key (`cat ~/.ssh/id_ed25519.pub`; if missing run `ssh-keygen -t ed25519`).
3. Note the server's public IPv4.
4. Create a separate deploy key for GitHub Actions: `ssh-keygen -t ed25519 -f ~/.ssh/moz_deploy -N ""`, then `ssh-copy-id -i ~/.ssh/moz_deploy.pub root@<IP>`.
5. Tell Claude the IP. Claude will write the server hardening script (deploy user, firewall, fail2ban) and ask you to add the private key to GitHub secrets with one `gh` command.

### H-05 — Staging database (Neon)
1. neon.tech → sign up → New project → name `moz-rewards-staging`, **Postgres 17** (same major as local), region **AWS Europe (London) eu-west-2** (or Frankfurt if London is unavailable).
2. SQL Editor → run `CREATE EXTENSION IF NOT EXISTS postgis;`
3. Dashboard → Connection details → copy the **pooled** connection string (for the app) and the **direct** one (for migrations).
4. Keep both in your password manager; Claude will tell you the exact `gh secret set` commands when the deploy workflow is ready.
5. App login role (audit security #7). The migrations already create the group role `moz_app`, which may read and write but can never change or delete audit history.
   1. Give Claude the **direct** (owner) string first. Claude runs `pnpm db:migrate` against it once, which creates `moz_app`.
   2. Neon → your project → **Roles** → **New role** → name `moz_app_login` → save the generated password in your password manager.
   3. Neon → **SQL Editor** → run: `GRANT moz_app TO moz_app_login;`
   4. Connection details → choose role `moz_app_login` → copy its **pooled** string. This is the app's `DATABASE_URL`. The owner's **direct** string is `DATABASE_URL_MIGRATIONS` (migrations only, never the running app).

### H-03 — Google OAuth client
1. console.cloud.google.com → create project `Moz Rewards`.
2. APIs & Services → OAuth consent screen → External → app name "Moz Rewards", support email, scopes `openid`, `email`, `profile` only → add yourself and your partner as test users.
3. Credentials → Create credentials → OAuth client ID → Web application.
4. Authorised JavaScript origins: `http://localhost:3000` and `https://staging.<domain>`.
5. Authorised redirect URIs: `http://localhost:3000/api/auth/callback/google` and `https://staging.<domain>/api/auth/callback/google`.
6. Copy Client ID and Client secret into `.env.local` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Tell Claude "H-03 done".
- **Done 9 Nov:** localhost redirect URI added; real Google sign-in verified. The staging URI is a step in H-07.

### H-04 — Email provider (Resend)
1. resend.com → sign up → API Keys → Create key (sending access) → put it in `.env.local` as `EMAIL_API_KEY`.
2. Domains → Add domain → use `mail.<domain>` → add the DNS records it shows in Cloudflare (DNS only / grey cloud) → wait for "Verified".
3. Set `EMAIL_FROM="Moz Rewards <hello@mail.<domain>>"` in `.env.local`. Tell Claude "H-04 done".

### H-10 — Sentry
1. sentry.io → sign up (EU data region) → Create project → Next.js → name `moz-rewards`.
2. Copy the DSN into `.env.local` as `SENTRY_DSN`. Tell Claude "H-10 done".

### H-02 — Share `.env.local`
1. Claude creates `.env.local` locally with generated secrets (never committed).
2. Copy its full contents into a shared password-manager note (1Password/Bitwarden) named "Moz Rewards .env.local".
3. Partner pastes it into `.env.local` in their copy of the project. Update the note whenever you add a key.

### H-20 — Turnstile keys (needs the Cloudflare account from H-07)
1. Cloudflare → Turnstile → Add widget → name "Moz Rewards" → hostnames `localhost`, `staging.<domain>` (add the production domain later) → Widget mode **Managed** → Create.
2. Copy the **Site key** → `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the **Secret key** → `TURNSTILE_SECRET_KEY` in the shared password-manager note (staging gets them with P0-15). Do not use Cloudflare's public test keys (1x000…AA): the server refuses them outside local/test.
3. Locally you can leave both empty: the widget is skipped and the server accepts the local bypass only in local/test.

### H-08 — R2 bucket
1. Cloudflare → R2 → enable (free tier) → Create bucket `moz-rewards`, location hint Europe.
2. R2 → Manage API tokens → Create token → Object Read & Write, this bucket only → copy Account ID, Access Key ID, Secret → staging env: `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET=moz-rewards`, `S3_FORCE_PATH_STYLE=false`.

### H-09 — Gemini key
1. aistudio.google.com → Get API key → create in the `Moz Rewards` project → `.env.local` as `AI_API_KEY`.

### H-12 — Google Play Console
1. play.google.com/console → sign up as an organisation (needs a D-U-N-S number for the client's company) or individual → pay $25.
2. Complete identity verification (can take several days — start early).
3. Tell Claude when the account is verified; the TWA listing assets are prepared in P5.

### H-18 — GitHub CLI on both machines
**macOS:** 1. `brew install gh` 2. `gh auth login` → GitHub.com → HTTPS → "Login with a web browser" → sign in as an account with write access to `weddydev/moz-reward` 3. Check: `gh auth status` and `gh repo view weddydev/moz-reward`.
**Windows:** 1. `winget install --id GitHub.cli` (or download from cli.github.com) 2. Reopen the terminal, then `gh auth login` as above 3. Check with `gh auth status`.
Tell Claude "H-18 done on <machine>".

### H-17 — Claude Code permissions (your decision)
1. Open `.claude/settings.json`.
2. Options: add `"Bash(cat .env*)"`, `"Bash(head .env*)"`, `"Bash(tail .env*)"` to `deny`; consider replacing `"Bash(node:*)"` with specific `node` commands; decide whether `git push` should still be auto-allowed.
3. Commit the change yourself (or tell Claude exactly which entries to set).

### H-16 — Reference images (optional)
1. Save images as `design/reference/m03-wallet.png`, `d15-shop-dashboard.png` etc. (numbers from `docs/DESIGN.md` §15).
2. Commit them or tell Claude to commit them.

### H-21 — Capacity model and hosting budget (client)
1. Ask the client for 12-month forecasts: number of shops, total members, busiest hour (requests per second or "customers per shop per hour"), largest single shop, biggest announcement audience.
2. Show them the target in ARCHITECTURE §1 (≥ 2 app hosts, managed Postgres with HA, two Redis instances, Cloudflare WAF) and its rough monthly cost (Claude prepares a one-page estimate on request).
3. Get a yes/no on the budget. Tell Claude the numbers and the answer; Claude updates ARCHITECTURE §12 and DECISIONS (a "no" records the single-host fallback and its risk).

### H-22 — Loyalty-rule defaults (client)
1. Read PRODUCT §4 (leave/rejoin), §5 (award guards, reversals, platform cap), §6 (progress model, expiry, redemption, programme changes, streak/tier defaults), §15 (shop state matrix), §16 (account recovery). Every "default — client to confirm" item is a question.
2. Mark each as accepted or changed; tell Claude the changes before P1 starts.

### H-23 — Solicitor review of compliance drafts
1. After Claude finishes P0-21, send the client's solicitor the files in `docs/compliance/` (ROPA, DPIA, processor register, retention schedule) and COMPLIANCE.md §2–§4, §7.
2. Return the solicitor's changes to Claude before P1 goes live with real customers.

### H-24 — Large-organisation controls (client)
1. Decide: admin sign-in via the organisation's identity provider (SSO), yes/no; who runs the independent penetration test (and when, ≥ 2 weeks before launch); who is on call after launch (names, hours, escalation).
2. Tell Claude; P5 tasks are adjusted accordingly.

## Done

| ID | Task | Done by | Date |
|---|---|---|---|
| H-03 | Google OAuth client; localhost redirect URI added; real Google sign-in verified (staging URI waits for H-07, see H-07 step) | Syedbadeshah76 | 9 Nov 2026 |
| H-01 | Private GitHub repo `weddydev/moz-reward` pushed; collaborators added; `gh` signed in as `weddydev` | talha.syed | 8 Nov 2026 |
| — | Local tools: pnpm 12.18, Docker 29.9, gh 2.103, Node 26.11 (installed by Claude) | Claude | 8 Nov 2026 |
| H-02 | `.env.local` on the Windows laptop (all keys set, app env check passes, `pnpm dev` serves /, /sign-in, /staff/sign-in, session API with it; verified by Claude, names only) | Syedbadeshah76 | 8 Nov 2026 |
| H-10 | Sentry org `mozereward` + project; `SENTRY_DSN` in `.env.local` (shape verified). Keep the shared password-manager note updated so the Mac gets it; staging gets it with P0-15 | Syedbadeshah76 | 8 Nov 2026 |
| H-18 | GitHub CLI on both laptops: Mac (8 Nov) and Windows (gh 2.103.3, signed in as `weddydev`, repo admin; verified by Claude 8 Nov) | both developers | 8 Nov 2026 |
| H-19 | Windows laptop: local PostgreSQL services stopped, port 5432 free for Docker | Syedbadeshah76 | 8 Nov 2026 |
| H-16 | Reference images: 17 desktop + 11 mobile screenshots in `design/reference/desktop-view/` and `mobile-view/` (descriptive names, not m01/d01 numbering) | Syedbadeshah76 | 8 Nov 2026 |
