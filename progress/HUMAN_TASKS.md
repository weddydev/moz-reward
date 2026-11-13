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
| H-35 | 🟢 | Close GitHub issue #1 "Scheduled CI failing" (fixed in `dd05afe`, re-run 42812524717 green) | Any time | Claude may not write to GitHub issues | 1 min |
| H-34 | 🟠 | Sentry: **`SENTRY_DSN_STAGING` set** (12 Nov; project `mozrewards`, Next.js, receiving events, PII scrubbed). Org slug `mozereward`, project `mozrewards`; the alert email reaches the shared Gmail inbox (probe MOZREWARDS-1 seen, PII redacted). Alert `New issue → email` (13 Nov): WHEN a new issue is created (+ escalates), IF any event, THEN suggested assignees → recently active members; test notification arrived in the shared inbox. Still to confirm: Subscription = Developer with no pay-as-you-go, the 11 Nov wizard auth token deleted | Sun 15 Nov 2026 (P0-15 staging) | Error reporting for web + worker | 5 min |
| H-36 | 🟠 | Demo accounts: **steps 1–3 done** (12 Nov: shared inbox chosen, `DEMO_EMAIL_BASE_STAGING` set). Inbox is Gmail; plus addressing verified 13 Nov (`<inbox>+moz-test@…` landed in the Inbox). After the first staging deploy: steps 3–5 (run `demo:credentials` yourself, save the output in the password manager, add the six TOTP keys) | After the first P0-15 deploy | The demo customer signs in by email link; staff/admin demo accounts need password + code. Credentials are never committed or pasted into chat | 10 min |
| H-08b | 🟢 | Upload buckets for P2 (`moz-rewards`, `moz-rewards-staging`) on R2 once R2 can be enabled, or on B2 like the backups (decide then); bucket-scoped read/write keys | Before P2 (uploads) | S3 settings are optional at boot until uploads exist | 10 min |
| H-27 | 🟠 | UptimeRobot free account; mobile app on both phones; both emails as alert contacts | Sun 15 Nov 2026 (P0-15) | Uptime alerts to both developers | 10 min |
| H-04 | 🟠 | Email: Resend (primary) + Brevo (failover) on the sending subdomain `mail.mozrewards.com`, DNS records in Cloudflare (DNS only), keys → `EMAIL_API_KEY_STAGING` / `EMAIL_FALLBACK_API_KEY_STAGING` yourself. Brevo reviews new accounts (up to ~1 day): start early | Sun 15 Nov 2026 (staging sign-in) | Sign-in links, invites; failover when Resend's 100/day is reached | 30 min (+ DNS wait, + Brevo review) |
| H-28 | 🟠 | Google OAuth: separate **staging** and **production** clients; publish the consent screen with branding before P5-04 | Staging client Sun 15 Nov 2026; branding before Fri 8 Jan 2027 | Staging/production isolation; app name and logo on the Google screen | 20 min (+ Google brand review: minutes to 3 working days) |
| H-12 | 🟠 | Google Play Console — **organisation** developer account (avoids the 14-day closed test for new personal accounts); verification takes days | **Start now**; verified before P5-04 (~Fri 8 Jan 2027) | Android app; launch date | 20 min + Google verification |
| H-23 | 🟠 | Solicitor: review compliance drafts (ROPA, DPIA, processor register, retention schedule) after P0-21 | Before any real customer data (launch, Fri 22 Jan 2027); DPIA ideally by Mon 30 Nov 2026 | UK GDPR / PECR / DUAA obligations | Client side |
| H-37 | 🟠 | Listen and feel check of the four sounds and three haptic patterns on desktop Chrome, an **iPhone (Safari)** and an Android phone (Chrome) | Before P1-06 builds the points-credited moment (it is the first sound not started by a tap) | Claude can prove what is synthesised and when, not how it sounds; tuning "warm, short, never gamey" needs ears (DESIGN §9) | 10 min |
| H-09 | 🟢 | Gemini **paid** (pay-as-you-go) API key with a project spend cap | Fri 11 Dec 2026 (P3 start) | AI review help; UK apps may use only Gemini's paid services | 15 min |
| H-24 | 🟢 | Client: pen test (optional, client-funded); support after launch | Sat 2 Jan 2027 (P5 start) | Launch readiness; see steps | 20 min with the client |
| H-29 | 🟢 | Phase-end backup check: run `pnpm backup:verify` on your laptop (needs the backup private key from the password manager) | Every phase end, from P0 | Proves the encrypted backups can really be restored (the server never holds the private key) | 10 min / phase |
| H-13 | 🟢 | Test each demo on a real Android phone and a real iPhone | Every phase end | Real-device check | 15 min / phase |
| H-14 | 🟢 | Send the client the demo notes and collect feedback | Every phase end | Client sign-off | — |
| H-15 | 🟢 | Client's solicitor reviews the legal page drafts | P5 (by Tue 12 Jan 2027) | Launch | Client side |
| H-38 | 🟢 | Delete the merged branches `wip/P0-12-b`, `wip/P0-12`, `wip/P0-C-close` (and older `wip/P0-08`…`wip/P0-19` if you like) on GitHub: `git push origin --delete <branch>` — Claude's branch deletion is refused by this laptop's permission settings | Any time | Tidy branch list | 2 min |
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
Sending subdomain **`mail.mozrewards.com`**; sender `Moz Rewards <hello@mail.mozrewards.com>`. Every record in Cloudflare is **DNS only** (grey cloud).
1. **Resend** (resend.com, shared Gmail, 2FA): Domains → Add `mail.mozrewards.com`, region Ireland (eu-west-1) → DNS via "Auto configure with Cloudflare" if offered, else copy each record (MX + SPF TXT on `send.mail`, DKIM TXT on `resend._domainkey.mail`) → Verify. API Keys → `moz-staging`, Sending access, that domain → password manager.
2. **Brevo** (brevo.com, shared Gmail, 2FA; company details: Moz Rewards, mozrewards.com, UK address; account review up to ~1 day): Senders, Domains → Add `mail.mozrewards.com` → authenticate (automatic with Cloudflare if offered, else brevo-code TXT, two DKIM CNAMEs, DMARC TXT on `_dmarc`) → Senders → `hello@mail.mozrewards.com`. SMTP & API → API key `moz-staging` → password manager. If "Authorised IPs" blocking is on, leave it: Claude asks for the VPS IP to be added at the first staging send.
3. **Stop and show Claude** if Cloudflare reports an existing record with the same name, or two `v=spf1` TXT records would sit on one name.
4. `gh secret set EMAIL_API_KEY_STAGING` (Resend `re_…`) and `gh secret set EMAIL_FALLBACK_API_KEY_STAGING` (Brevo `xkeysib-…`) at the hidden prompts. Tell Claude "H-04 done" with screenshots of both Domains pages showing Verified. Claude sets the non-secret settings (`EMAIL_PROVIDER=resend`, `EMAIL_FALLBACK_PROVIDER=brevo`, `EMAIL_FROM`) and runs `pnpm test:live` on staging.

### H-20 — Turnstile keys (needs the Cloudflare account from H-07)
1. dash.cloudflare.com → **Turnstile** (account level) → **Add widget** → name `Moz Rewards staging` → hostname **`staging.mozrewards.com` only** (no `localhost`: local/test run without a real key; production gets its own widget at launch) → mode **Managed**, pre-clearance **No** → Create.
2. Secret key → `gh secret set TURNSTILE_SECRET_KEY_STAGING` (paste at the hidden prompt) and the password manager note "Moz Rewards Turnstile (staging)". Never in chat.
3. Site key (public by design) → paste it to Claude, who sets `NEXT_PUBLIC_TURNSTILE_SITE_KEY_STAGING` and checks `gh secret list`.

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
1. Send the solicitor the whole `docs/compliance/` folder (start with its README: ten questions that need a decision) and COMPLIANCE §2–§4, §7.
1a. Client side, before launch: pay the ICO data protection fee, name the data protection contact, and sign a processing agreement with each provider in `PROCESSOR_REGISTER.md`.
2. Return the changes to Claude before real customer data (launch).

### H-09 — Gemini (paid tier)
1. aistudio.google.com → project `Moz Rewards` → set up billing (pay-as-you-go) → set a **project spend cap** (Billing → spend cap) → create an API key.
2. Dev key → `.env.local` as `AI_API_KEY`; staging/production key → GitHub secrets yourself. The feature stays off (flag) until the key exists; the app also enforces its own daily cap.

### H-24 — Launch support decisions (client)
1. **Pen test:** optional and paid by the client. Without it, P5 relies on authenticated ZAP, the SECURITY checklist and our reviewers — we don't promise a pen test.
2. **Support after launch:** best-effort business hours by the two developers, uptime alerts to both phones, no 24/7 rota. Ongoing support is outside the build scope and needs a separate agreement.
3. Admin SSO is dropped (super admins use passkeys).

### H-32 — `.env.local` database roles (P0-20), each laptop
1. Open `.env.local` in your editor (not in a chat).
2. Replace the `DATABASE_URL=` line and add two lines, exactly as in `.env.example`:
   `DATABASE_URL=postgres://moz_app:moz_app@localhost:5432/moz`
   `DATABASE_URL_AUTH=postgres://moz_auth:moz_auth@localhost:5432/moz`
   `DATABASE_URL_WORKER=postgres://moz_worker:moz_worker@localhost:5432/moz`
   Keep `DATABASE_URL_MIGRATIONS` and `DATABASE_URL_TEST` on `moz:moz` (the owner). These are local Docker passwords only.
   **Windows laptop, 11 Nov:** these two lines are missing there. Add, exactly as in `.env.example`:
   `DATABASE_URL_MIGRATIONS=postgres://moz:moz@localhost:5432/moz`
   `DATABASE_URL_TEST=postgres://moz:moz@localhost:5432/moz_test`
   (Until then Claude sets the two values in the shell for each command; the local database is already migrated to 0013.)
3. `pnpm services:up`, then `pnpm db:reset` (a local 0009 applied before the final version must be replaced) — or `pnpm db:migrate` on a database that never had 0009.
4. `pnpm dev` starts; if it prints `[boot] refusing to start: DATABASE_URL…`, a line is still on the old value.
5. Mac only (found 10 Nov): two leftover test workers may still be running — `ps aux | grep src/worker/index` — stop them with `kill <pid>` (they were started by the integration tests, not by you).
6. Tell Claude "H-32 done" (per laptop).

### H-31 — Renovate GitHub App
1. Open https://github.com/apps/renovate → **Install** (or **Configure** if it is already on the account).
2. Choose **Only select repositories** → `weddydev/moz-reward` → **Install**.
3. If Renovate opens an onboarding PR, close it without merging (`renovate.json` is in the repo once P0-14 is on main).
4. Tell Claude "H-31 done". In `free` mode nothing auto-merges: a developer merges a Renovate PR after its CI is green.

### H-34 — Sentry (free Developer plan)
1. Sign up at https://sentry.io with the shared developer email (one owner; free plan has one user).
2. Create organisation `moz-rewards`, project platform **Next.js**, name `moz-rewards`.
3. Settings → Projects → moz-rewards → Client Keys: copy the **DSN** (not secret, but keep it out of the repo) into GitHub secrets as `SENTRY_DSN_STAGING` (and later `SENTRY_DSN_PRODUCTION`).
4. Alerts → Create alert → Issues → "A new issue is created" → action: email the owner. In the owner's mailbox add a forwarding rule for mail from sentry.io to the second developer.
5. Settings → Subscription: leave on the free plan (no pay-as-you-go budget). Tell Claude "H-34 done".
- **Don't run Sentry's setup wizard (`npx @sentry/wizard`) in the repo**: P0-13 already wires Sentry (own tunnel, scrubbing, CSP). It ran once on 11 Nov 2026 21:29 (Syedbadeshah76's laptop); its output is parked on the local, unpushed branch `local/sentry-wizard`. The org/project it used were `mozereward` / `mozrewards`: tell Claude the final slugs. It also left `.env.sentry-build-plugin` (git-ignored) holding a Sentry **auth token**: keep it out of chat; if source-map upload is wanted later, that token goes into GitHub secrets (P0-15), otherwise revoke it in Sentry → Settings → Auth Tokens.

### H-36 — Demo accounts on staging (P0-16)
1. Choose one mailbox both developers can read (no `+` in it), e.g. a shared team address. Gmail, Google Workspace, Outlook and Fastmail all deliver `name+anything@…` to `name@…`; check yours does.
2. GitHub → repo → Settings → Secrets and variables → Actions → New repository secret: `DEMO_EMAIL_BASE_STAGING` = that address. Tell Claude "H-36 step 2 done".
3. After the first staging deploy (P0-15), SSH to the VPS and run the `demo:credentials` command (P0-15 writes the exact line into RUNBOOK). Run it in your own terminal, never through Claude.
4. Copy the whole output into the password manager entry "Moz Rewards staging demo accounts". Do not paste it into chat, email or a ticket.
5. In your authenticator app add the six accounts (staff, owner, four admins) using each "TOTP key" (or the TOTP URI as a QR code). Both developers can add the same keys.
6. The weekly reset keeps the same passwords and keys, so this is done once. They change only if the staging `BLIND_INDEX_KEY` is rotated: then repeat steps 3–5.
7. Locally nothing is needed: `pnpm demo:credentials` shows your laptop's own demo sign-in details and `pnpm demo:credentials --codes` the current codes.

### H-16 — Reference images (done; kept for reference)
Images live in `design/reference/desktop-view/` and `mobile-view/`.

## Done

| ID | Task | Done by | Date |
|---|---|---|---|
| H-20 | Turnstile staging widget `Moz Rewards staging` (hostname `staging.mozrewards.com`, Managed); `TURNSTILE_SECRET_KEY_STAGING` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY_STAGING` set (both seen in `gh secret list`, 12 Nov 20:23 and 20:28 UTC). Production gets its own widget at launch | talha.syed | 13 Nov 2026 |
| H-31 | Renovate GitHub App installed on `moz-reward` (human's word; Claude can't read app installations, and no Renovate issue or PR had appeared yet at 02:08 IST: check at the P0-E close) | talha.syed | 13 Nov 2026 |
| H-08 | Backups bucket on **Backblaze B2** (R2 couldn't be enabled): `mozrewards-backups-dfd829`, EU Central, endpoint `s3.eu-central-003.backblazeb2.com`, private, encryption on, Object Lock off; key `moz-backups` (that bucket only, read/write) in the password manager note "Moz Rewards backups B2". Lifecycle "keep only the last version" and $0 caps: reported by the human, not seen by Claude. Key first exercised by the P0-15 backup upload | Syedbadeshah76 | 13 Nov 2026 |
| H-26 | Backup OpenPGP key (RSA 4096, encrypt, no expiry), fingerprint `1D1D1BF1F6FDA0F2EDA8FAA0D356B5CAA21C0F58`, generated with Gpg4win on the Windows laptop. Private key + passphrase + revocation certificate in the shared password manager ("Moz Rewards backup key"); public key committed as `infra/backup/moz-backup-public.asc`; encrypt/decrypt round trip OK. The private key also stays in the Windows laptop's GnuPG keyring until the first P0-15 decrypt-and-restore from the password-manager copy passes, then it is deleted there (PROGRESS follow-up) | Syedbadeshah76 (Claude ran the commands) | 12 Nov 2026 |
| H-06 | Hostinger KVM 4 (UK, Ubuntu 24.04), IP **72.61.17.208**; both developers' SSH keys added in hPanel, root key login tested; deploy key `~/.ssh/moz_deploy` on the VPS (key login tested) and in GitHub secret `DEPLOY_SSH_KEY` (+ password manager). Hardening script is Claude's (P0-15) | Syedbadeshah76 | 12 Nov 2026 |
| H-07 | Domain **mozrewards.com** on Cloudflare (zone active, DNS empty; both developers share one Cloudflare login, so no member invite; 2FA recovery in the shared password manager). Staging host `staging.mozrewards.com` | Syedbadeshah76 | 12 Nov 2026 |
| H-32 | `.env.local` DB role lines on both laptops (Windows confirmed by the human 11 Nov; verified by Claude on Windows 12 Nov 2026: `pnpm db:migrate` without shell overrides OK) | human | 11 Nov 2026 |
| H-33 | Deny rules narrowed so `.env.example` is editable (committed `ca9d3d8`) | talha.syed | 10 Nov 2026 |
| H-22 | Loyalty-rule defaults accepted as written (DECISIONS "Plan v4 defaults"); may be revised later | talha.syed | 10 Nov 2026 |
| H-32 (Mac) | `.env.local` DB roles updated, `pnpm db:reset`, app starts; Windows laptop still to do | talha.syed | 10 Nov 2026 |
| H-21 | Client confirmed in writing: launch tier (200 shops, 50,000 members, 30 req/s peak, 1,000 concurrent, 10,000-member announcement < 10 min), single-host risk (≈2 h down, ≤5 min data loss, internal target), Hostinger renewal ≈ £24.99/month | client (via talha.syed) | 10 Nov 2026 |
| H-17 | Human delegated the choice: Claude added the suggested deny rules (`Read(./.env.*)`, force-push to main, remote branch delete, `git clean`, `docker compose down -v`); real controls stay dev-only keys + pre-push hook | talha.syed | 10 Nov 2026 |
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

### H-37 — Sound and haptics listen check (P0-11)
1. Run `pnpm dev` and open `http://localhost:3000/dev/motion` on desktop Chrome (staging URL `/dev/motion` once P0-15 is live, for the phones).
2. Scroll to "Sound and haptics". Press each "Play …" button: `credit` (two rising notes), `reward` (three-note arpeggio), `tick` (one short blip), `arrival` (a soft swell). They should be quiet, warm and short; nothing harsh or game-like.
3. On the iPhone (the important one: audio unlock on iOS can only be proven on a real device): reload the page, tap once anywhere that is not a button, then press "Play credit": the very first press must produce sound (ring switch on, volume up). Then lock the phone for a minute, unlock, press "Play tick": it must sound on the first or second press, and never as a burst of several sounds at once; the "Vibrate" buttons say "No vibration" (expected: iPhone has none for web pages).
4. On the Android phone: the "Vibrate" buttons buzz (short press, double pulse for credit, longer pattern for reward).
5. Switch "Sounds and haptics" off: every button stays silent and still. Switch it on again: they work.
6. Tell Claude anything that sounds wrong (which sound, which device, too loud / too sharp / too long).

