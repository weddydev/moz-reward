# HUMAN TASKS — things only the developers can do

Claude keeps this list current. It is reviewed and updated at every sub-phase and phase close, at every `/handoff`, and whenever a new dependency appears. Claude does everything it can itself first (CLI tools, generated configs, scripts); only what truly needs a human is listed here, with exact steps.

**Priority legend**
- 🔴 **Blocking now**: work is waiting on it; Claude has moved on to other tasks meanwhile
- 🟠 **Needed soon**: needed within the current or next phase
- 🟢 **Later**: needed before launch or a later phase; do it whenever convenient

**Secrets rule (SECURITY, plan v5).** Laptops hold **dev-only** keys (`.env.local`, shared through the password-manager note). **Staging and production secrets go only into GitHub secrets (you run `gh secret set NAME` and paste the value into your own terminal) and the password manager.** Never paste a staging or production secret into chat, and never give one to Claude — Claude never needs to see it.

**Plan v5 (9 Nov 2026):** one Hostinger VPS (production + staging) and free tiers. Order of work: H-25 now (P0-14); H-06, H-07, H-08, H-26, H-27, H-04, H-20, H-28 before P0-15 (target Sun 15 Nov); H-21 client acknowledgement before P0-15; H-22 before P1 (Thu 19 Nov).

## Open

| ID | Priority | Task | Needed by | Why | Est. time |
|---|---|---|---|---|---|
| H-07 | 🟠 | Buy domain; Cloudflare account (free); move DNS to Cloudflare | Sun 15 Nov 2026 (P0-15) | Tunnel hostnames, email domain, Turnstile | 30 min (+ up to 24 h DNS) |
| H-06 | 🟠 | Buy Hostinger KVM 4 (UK location), add both developers' SSH keys, give Claude the IP | Sun 15 Nov 2026 (P0-15) | Hosts production **and** staging (plan v5) | 30 min |
| H-08 | 🟠 | Cloudflare R2: two buckets (uploads, backups) with separate bucket-scoped tokens | Sun 15 Nov 2026 (P0-15) | Uploads (P2) and encrypted backups (P0-15) | 15 min |
| H-26 | 🟠 | Generate the backup encryption key pair (**OpenPGP**, one pair for dumps and WAL); private key to the password manager only; give Claude the **public** key | Sun 15 Nov 2026 (P0-15) | Backups are encrypted before upload; the private key never sits on the VPS | 10 min |
| H-27 | 🟠 | UptimeRobot free account; mobile app on both phones; both emails as alert contacts | Sun 15 Nov 2026 (P0-15) | Uptime alerts to both developers | 10 min |
| H-04 | 🟠 | Email: Resend (primary) + Brevo (failover), domain verification for both | Sun 15 Nov 2026 (staging sign-in) | Sign-in links, invites; failover when Resend's 100/day is reached | 30 min (+ DNS wait) |
| H-20 | 🟠 | Cloudflare Turnstile keys (after H-07) | Sun 15 Nov 2026 | Bot protection on sign-in; staging fails closed without a real secret | 5 min |
| H-28 | 🟠 | Google OAuth: separate **staging** and **production** clients; publish the consent screen with branding before P5-04 | Staging client Sun 15 Nov 2026; branding before Fri 8 Jan 2027 | Staging/production isolation; app name and logo on the Google screen | 20 min (+ Google brand review: minutes to 3 working days) |
| H-21 | 🟠 | Client: confirm launch-tier numbers and accept the single-host risk **in writing**; note the Hostinger renewal price | Sun 15 Nov 2026 | Plan v5 targets and risk acceptance | 20 min with the client |
| H-17 | 🟠 | Your decision on Claude Code permissions (see steps: deny rules are best effort; the real controls are B4/A5) | Sun 15 Nov 2026 (before staging secrets exist) | Tooling safety; Claude will not change its own permissions | 10 min |
| H-12 | 🟠 | Google Play Console — **organisation** developer account (avoids the 14-day closed test for new personal accounts); verification takes days | **Start now**; verified before P5-04 (~Fri 8 Jan 2027) | Android app; launch date | 20 min + Google verification |
| H-22 | 🟠 | Client: confirm loyalty-rule defaults (PRODUCT §4–§6, §15, §16; DECISIONS "Plan v4 defaults") | Thu 19 Nov 2026 (P1 start) | P1 builds these rules | 45 min with the client |
| H-23 | 🟠 | Solicitor: review compliance drafts (ROPA, DPIA, processor register, retention schedule) after P0-21 | Before any real customer data (launch, Fri 22 Jan 2027); DPIA ideally by Mon 30 Nov 2026 | UK GDPR / PECR / DUAA obligations | Client side |
| H-09 | 🟢 | Gemini **paid** (pay-as-you-go) API key with a project spend cap | Fri 11 Dec 2026 (P3 start) | AI review help; UK apps may use only Gemini's paid services | 15 min |
| H-24 | 🟢 | Client: pen test (optional, client-funded); support after launch | Sat 2 Jan 2027 (P5 start) | Launch readiness; see steps | 20 min with the client |
| H-29 | 🟢 | Phase-end backup check: run `pnpm backup:verify` on your laptop (needs the backup private key from the password manager) | Every phase end, from P0 | Proves the encrypted backups can really be restored (the server never holds the private key) | 10 min / phase |
| H-13 | 🟢 | Test each demo on a real Android phone and a real iPhone | Every phase end | Real-device check | 15 min / phase |
| H-14 | 🟢 | Send the client the demo notes and collect feedback | Every phase end | Client sign-off | — |
| H-15 | 🟢 | Client's solicitor reviews the legal page drafts | P5 (by Tue 12 Jan 2027) | Launch | Client side |
| H-30 | 🟢 | On each laptop: `gh auth refresh -h github.com -s user` (adds the read-only billing scope) | Next sub-phase close (P0-E) | `pnpm ci:usage` then reads the exact Actions minutes instead of an estimate | 2 min |

## Steps

### H-25 — GitHub plan (decide before P0-14 finishes)
GitHub Free on a **private** repo has no branch protection, no rulesets, no auto-merge and no environments (verified on docs.github.com, 9 Nov 2026). Required reviewers on environments are not available for private repos even on Pro/Team, so neither option relies on them.
- **(a) Recommended — GitHub Pro (owner account) or Team:** about $4/month (GitHub's pricing page lists Team at $4 per user/month; check the Pro price at checkout). Then branch protection (CI required, no force-push, no deletion of `main`), auto-merge and environment secrets work. github.com → Settings → Billing and plans → Upgrade.
- **(b) Stay Free:** no server-side protection; the committed pre-push hook refuses force-pushes and failing gates; CI runs on every push; the production deploy is a manual `workflow_dispatch` that refuses a commit without a green CI run; secrets are repository secrets.
Tell Claude "H-25: pro" or "H-25: free"; Claude sets `GITHUB_MODE` in PROGRESS.md and configures the repo accordingly.

### H-07 — Domain + Cloudflare (do this early: H-04, H-20 and H-28 depend on the domain)
1. Buy a domain (e.g. `mozrewards.co.uk`) — Cloudflare Registrar is simplest (DNS already on Cloudflare).
2. If bought elsewhere: Cloudflare → Add a site → Free plan → copy the two nameservers → set them at your registrar.
3. Tell Claude the domain name. Claude lists the exact DNS records and the Tunnel hostnames (`staging.<domain>`, later the production names); there are no A records pointing at the VPS (Cloudflare Tunnel only).

### H-06 — Hostinger KVM 4 (production + staging)
1. hostinger.com/uk/vps-hosting → **KVM 4** (4 vCPU, 16 GB RAM, 200 GB NVMe) → location **United Kingdom** → OS **Ubuntu 24.04 LTS**. Note the price: the first term is a promo (about £9.99/month on 24 months); **renewal is about £24.99/month** — tell the client (H-21).
2. Add **both developers'** SSH public keys during setup (`cat ~/.ssh/id_ed25519.pub`; if missing: `ssh-keygen -t ed25519`).
3. Create a deploy key for GitHub Actions on your laptop: `ssh-keygen -t ed25519 -f ~/.ssh/moz_deploy -N ""`. Add the **public** key to the VPS (`ssh-copy-id -i ~/.ssh/moz_deploy.pub root@<IP>`; Claude's hardening script moves it to the `deploy` user). Put the **private** key into GitHub yourself: `gh secret set DEPLOY_SSH_KEY < ~/.ssh/moz_deploy` — never paste it into chat.
4. Give Claude the **IP address** only. Claude writes and runs the hardening script (deploy user, key-only SSH, firewall default-deny, fail2ban, unattended upgrades, swap, Docker) over SSH.
5. Hostinger's weekly backups are free and on by default — leave them on as an extra layer; our own encrypted backups are the real ones.

### H-08 — Cloudflare R2: two buckets
1. Cloudflare → R2 → enable (free tier: 10 GB storage in total, no egress charge).
2. Create bucket `moz-rewards` (uploads) and bucket `moz-rewards-backups` (backups), location hint Europe. For staging use a separate bucket `moz-rewards-staging` (or a `staging/` prefix — Claude will say which in P0-15).
3. R2 → Manage API tokens → create **two** tokens, each **Object Read & Write, one bucket only**: one for `moz-rewards`, one for `moz-rewards-backups`.
4. Put the values into GitHub secrets yourself (Claude gives the exact `gh secret set` names in P0-15) and the password manager. Do not paste them into chat.

### H-26 — Backup encryption key (OpenPGP, one pair for dumps and WAL)
wal-g (the continuous WAL archiver) supports OpenPGP but not `age`, so one OpenPGP key pair encrypts both the nightly dumps and the WAL archive (plan v5, human's choice).
1. Install GnuPG (`brew install gnupg` / `winget install GnuPG.Gpg4win`).
2. `gpg --quick-generate-key "Moz Rewards backups <backups@<domain>>" rsa4096 encrypt never` (choose a strong passphrase; store it in the password manager).
3. Export: `gpg --armor --export-secret-keys "Moz Rewards backups" > moz-backup-private.asc` → put the file's contents and the passphrase into the password manager (both developers), then delete the file. The private key must **never** be on the VPS or in GitHub.
4. `gpg --armor --export "Moz Rewards backups" > moz-backup-public.asc` → give Claude this **public** key (safe to share).
5. Restores and the phase-end decrypt test are done by a developer who imports the private key from the password manager on their laptop.

### H-27 — UptimeRobot
1. uptimerobot.com → free account (one login; free plan allows commercial use, 50 monitors, 5-minute checks).
2. Install the UptimeRobot app on **both** phones and sign in with that login; add both developers' emails as alert contacts.
3. Tell Claude "H-27 done"; Claude lists the monitors to add (staging now, production at launch).

### H-04 — Email (Resend primary, Brevo failover)
1. resend.com → sign up (free: 100/day, 3,000/month) → Domains → add `mail.<domain>` → add its DNS records in Cloudflare (DNS only) → wait for "Verified".
2. brevo.com → sign up (free: 300/day after approval) → add and authenticate the same sending domain.
3. Create API keys in both. Dev keys may go in `.env.local`; **staging/production keys go into GitHub secrets yourself** (`gh secret set EMAIL_API_KEY`, `EMAIL_FAILOVER_API_KEY`) and the password manager.
4. Tell Claude "H-04 done".

### H-20 — Turnstile keys (needs the Cloudflare account from H-07)
1. Cloudflare → Turnstile → Add widget → name "Moz Rewards" → hostnames `localhost`, `staging.<domain>` (production domain later) → mode **Managed** → Create.
2. Site key and secret key → GitHub secrets yourself (`gh secret set TURNSTILE_SECRET_KEY`; the site key is public: `NEXT_PUBLIC_TURNSTILE_SITE_KEY`) and the password manager. Don't use Cloudflare's public test keys outside local/test.

### H-28 — Google OAuth for staging and production
Sign-in-only apps (scopes `openid email profile`) are exempt from Google's "Testing" limits (no 100-user cap, no 7-day expiry); publishing is needed only to show the app name and logo.
1. Google Cloud → project `Moz Rewards` → Google Auth Platform → Clients → **Create client** (Web) named "Moz Rewards staging": origin `https://staging.<domain>`, redirect `https://staging.<domain>/api/auth/callback/google`.
2. Before P5-04: create "Moz Rewards production" with the production origin/redirect.
3. Client secrets → GitHub secrets yourself (`gh secret set GOOGLE_CLIENT_SECRET_STAGING` etc.) and the password manager. The localhost dev client stays as it is.
4. Before P5-04: Branding → app name, logo, support email, privacy policy and terms URLs → **Publish app** → complete brand verification (automated in minutes, or 2–3 working days).

### H-21 — Launch numbers and single-host risk (client)
Answered: one VPS and free tiers (no multi-host, no managed HA database, no paid service tiers). Still needed from the client, in writing (an email is enough):
1. Confirm the **launch tier**: 200 shops, 50,000 members, 30 requests/second at peak, 1,000 people with the app open at once, an announcement reaching 10,000 members in under 10 minutes.
2. Accept the single-host risk: if the VPS fails the service can be down for up to about **2 hours** while it is rebuilt, and up to **5 minutes** of data may be lost; this is an internal target, not an SLA.
3. Budget for the Hostinger **renewal price** (about £24.99/month after the promo term).
4. Tell Claude the answers; Claude records them in DECISIONS.

### H-17 — Claude Code permissions (your decision)
Deny rules in `.claude/settings.json` are **best effort**: denying `cat .env*` still leaves `grep`, `node -e`, `cp`, `docker compose exec`; and rules match by prefix, so `git push origin main --force` slips past `git push --force:*`. The real controls are:
- **dev-only keys on laptops** (the secrets rule above): there is nothing valuable for a tool to read locally;
- **server-side protection** against force-push and deletion of `main` (H-25 option a);
- the committed **pre-push hook** if you stay on GitHub Free.
Suggested extra deny entries you may add yourself: `Read(./.env.*)`, `Bash(docker compose down -v:*)`, `Bash(git push origin --delete:*)`, `Bash(git clean:*)`. Commit the change yourself (or tell Claude exactly which entries to set).

### H-12 — Google Play Console
1. play.google.com/console → sign up as an **organisation** (needs the client's D-U-N-S number) → pay $25. An organisation account avoids the closed-testing requirement (12 testers for 14 days) that new personal accounts must complete before production.
2. Complete identity verification (can take several days — start now).
3. Tell Claude when verified; the TWA listing assets are prepared in P5.

### H-22 — Loyalty-rule defaults (client)
1. Read PRODUCT §4 (leave/rejoin), §5 (award guards, reversals, platform cap), §6 (progress, expiry, redemption, programme changes, streak/tier defaults), §15 (shop state matrix), §16 (account recovery) and DECISIONS "Plan v4 defaults". Every "default — client to confirm" item is a question.
2. Tell Claude the changes before P1 starts.

### H-23 — Solicitor review of compliance drafts
1. After P0-21, send the solicitor `docs/compliance/` (ROPA, DPIA, processor register, retention schedule) and COMPLIANCE §2–§4, §7.
2. Return the changes to Claude before real customer data (launch).

### H-09 — Gemini (paid tier)
1. aistudio.google.com → project `Moz Rewards` → set up billing (pay-as-you-go) → set a **project spend cap** (Billing → spend cap) → create an API key.
2. Dev key → `.env.local` as `AI_API_KEY`; staging/production key → GitHub secrets yourself. The feature stays off (flag) until the key exists; the app also enforces its own daily cap.

### H-24 — Launch support decisions (client)
1. **Pen test:** optional and paid by the client. Without it, P5 relies on authenticated ZAP, the SECURITY checklist and our reviewers — we don't promise a pen test.
2. **Support after launch:** best-effort business hours by the two developers, uptime alerts to both phones, no 24/7 rota. Ongoing support is outside the build scope and needs a separate agreement.
3. Admin SSO is dropped (super admins use passkeys).

### H-16 — Reference images (done; kept for reference)
Images live in `design/reference/desktop-view/` and `mobile-view/`.

## Done

| ID | Task | Done by | Date |
|---|---|---|---|
| H-25 | GitHub plan: **Free** for now (`GITHUB_MODE=free`: pre-push hook, CI on every push, manual production deploy gated on green CI). Upgrade to Pro later only if server-side branch protection is wanted | human | 9 Nov 2026 |
| H-05 | **Removed (plan v5):** the database is self-hosted on the VPS (no Neon). The owner connection string goes only into the password manager and GitHub secrets | — | 9 Nov 2026 |
| H-11 | **Merged into H-06 (plan v5):** production runs on the same VPS; no separate production VPS or database | — | 9 Nov 2026 |
| H-03 | Google OAuth dev client; localhost redirect URI; real Google sign-in verified (staging/production clients → H-28) | Syedbadeshah76 | 9 Nov 2026 |
| H-01 | Private GitHub repo `weddydev/moz-reward` pushed; collaborators added; `gh` signed in as `weddydev` | talha.syed | 8 Nov 2026 |
| — | Local tools: pnpm 12.18, Docker 29.9, gh 2.103, Node 26.11 (installed by Claude) | Claude | 8 Nov 2026 |
| H-02 | `.env.local` (dev-only keys) on the Windows laptop; shared via the password-manager note | Syedbadeshah76 | 8 Nov 2026 |
| H-10 | Sentry (free plan: **one user** — the owner; alerts forwarded to both developers per plan v5); dev `SENTRY_DSN` in `.env.local`; staging/production DSN via GitHub secrets in P0-15 | Syedbadeshah76 | 8 Nov 2026 |
| H-18 | GitHub CLI on both laptops (Mac 8 Nov; Windows gh 2.103.3, signed in as `weddydev`) | both developers | 8 Nov 2026 |
| H-19 | Windows laptop: local PostgreSQL services stopped, port 5432 free for Docker | Syedbadeshah76 | 8 Nov 2026 |
| H-16 | Reference images: 17 desktop + 11 mobile screenshots in `design/reference/` | Syedbadeshah76 | 8 Nov 2026 |
| H-21 | **Answered (plan v5):** single VPS, free tiers; client written acknowledgement still open (see Open) | client | 9 Nov 2026 |
