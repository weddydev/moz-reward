# RUNBOOK — Moz Rewards operations

For the two developers on call (best effort, business hours; ARCHITECTURE §11). Each procedure says **when** to use it, **steps**, and **how you know it worked**. Steps marked *(P0-15)* need the VPS and staging stack, which P0-15 builds; until then they are the plan, not yet rehearsed. Every phase extends this file for what it added.

Sections: [1 Alerts](#1-alerts-what-each-email-means) · [2 System page](#2-reading-the-system-page) · [3 Health endpoints](#3-health-endpoints) · [4 Deploy](#4-deploy) · [5 Rollback](#5-rollback) · [6 Restore and outbox replay](#6-restore-and-outbox-replay) · [7 Redis loss](#7-redis-loss) · [8 Worker down](#8-worker-down) · [9 Key leak](#9-key-leak) · [10 Email outage or quota](#10-email-provider-outage-or-quota) · [11 Free-tier quota exhausted](#11-free-tier-quota-exhausted) · [12 Disk full](#12-disk-nearly-full) · [13 Tunnel down](#13-cloudflare-tunnel-down) · [14 VPS rebuild](#14-full-vps-rebuild) · [15 Logs](#15-logs)

Ground rules: rotate or contain first, investigate second. Never paste a secret into chat, a ticket or a log. Record what happened in `progress/SESSION_LOG.md` (and a DECISIONS entry if you changed how something works).

---

## 1. Alerts: what each email means

Alert emails go to every address in `ALERT_EMAILS` (both developers). Subject: `[Moz <env>] <security|ops> alert: <kind>`. **One email per kind per window**; later events of the same kind are counted and reported in one follow-up ("N more …"). The window is 5 min, and 30 then 60 min while a kind keeps firing (back to 5 after 2 h quiet). Per UK day at most 4 deliveries per kind and 12 per pool (health/quota alerts have their own pool, so a noisy kind can't silence them), then one `alert.ceiling` email per pool: alerts can never use up the email quota that sign-in links need. The health monitor checks every minute.

| Kind | Means | Go to |
|---|---|---|
| `auth.lockout` | A staff/admin account (or an unknown address) hit the sign-in lockout. Many in a row = password spraying. | Check the audit log (`auth.lockout` rows) for one account vs many; if many, consider the Cloudflare rate-limit rule. The account owner also got an email (≤ 3/day). |
| `error.unexpected` | An unhandled error in an action, route, page, Better Auth or after-commit work. Detail: `where` and `requestId`. | Sentry (search the request id), then the host logs for that `requestId` (§15). |
| `outbox.stale` | Outbox rows waiting > 2 min to be dispatched: the relay or redis-queue is stuck. | §8 (worker) and §7 (Redis). |
| `outbox.lost` | Dispatched jobs vanished from redis-queue (re-dispatched automatically). | §7 — usually a Redis restart without its AOF. |
| `codes.exhausted` | Five random public codes in a row were taken (shop code, member ID…); nothing was created and the caller saw an error. Detail: `kind`, `attempts`. | One alert is chance-level impossible at today's size (30⁶ ≈ 729 M codes): look for a bug in the generator or a unique index on the wrong column; if the code space is genuinely filling up, lengthen the code (DECISIONS). |
| `health.db` | Postgres did not answer the monitor within 2 s. | `docker compose ps postgres`, its logs; disk (§12). |
| `health.redis` | redis-queue did not answer. Jobs, rate limits and alert dedup are affected; requests needing limits fail closed (503). | §7. |
| `health.scheduler` | No scheduler heartbeat for 3 min (checked once the worker has run 3 min): repeatable jobs aren't running. | §8. |
| `health.queue_lag` | A queue's oldest waiting job is > 60 s old. Detail names the queue. | §8; System page queue table. |
| `health.failed_jobs` | Jobs were dead-lettered in the last 10 min. | System page → failed jobs; Sentry (`where: job <queue>:<name>`). |
| `health.disk` | Disk ≥ 80% on `DISK_PATH`. | §12. |
| `health.backup` | (from P0-15) last dump > 26 h, WAL archive > 10 min, or restore drill > 35 days. | §6 backups; P0-15 backup scripts. |
| `quota.email` | ≥ 70% of today's combined email cap used. | §10. |
| `quota.sentry` | ≥ 70% of Sentry's monthly error quota used (our own count). | §11. |
| `alert.ceiling` | A pool's daily alert budget (12 deliveries; detail names the pool) is used up: later alerts until UK midnight are in the logs and on the System page only. | Open the System page now; something is badly wrong or an attack is under way (§1 kinds by frequency in the logs). |

## 2. Reading the System page

`/admin/system`, admin owner only (two-step verified). It shows the worker's latest health snapshot (taken every minute), not live queries.

- **Header**: when the snapshot was taken. A yellow banner "more than 3 minutes old" = the worker isn't writing snapshots → §8.
- **Alerts raised by this snapshot**: the same kinds as §1; the emails for them are deduplicated, the page is not.
- **Status**: Database, Redis (queue), Redis (cache) and Scheduler. The cache may be down without an outage (the app reads from Postgres, slower).
- **Free-tier quotas**: emails sent today vs `EMAIL_DAILY_CAP`; Sentry errors this month vs `SENTRY_MONTHLY_QUOTA` (amber at 70%).
- **Outbox and failed jobs**: rows waiting and the oldest wait; dead-lettered jobs (unresolved, and new in the last 10 min).
- **Host and backups**: disk use, database size, SSE connections (from P1-10), backups (from P0-15).
- **Queues**: waiting, active, delayed, failed and the oldest waiting job per queue (amber over 60 s).

## 3. Health endpoints

| Endpoint | Used by | 200 means | Body |
|---|---|---|---|
| `/api/health/live` | anyone | the web process answers | `{"status":"ok"}` |
| `/api/health/ready` | Caddy, deploys | Postgres and redis-queue answer (503 otherwise) | status only; with header `Authorization: Bearer $HEALTH_TOKEN` also per-check latency, cache and worker age |
| `/api/health/worker` | UptimeRobot (P0-15) | the worker's monitor ticked within 3 min | status only |

A stopped worker does **not** fail `ready` (it must not take the web out of Caddy); it fails `/api/health/worker`.

On staging these three URLs (exactly these paths) skip the basic-auth password, so UptimeRobot needs no password (DECISIONS 16 Nov); a Basic header sent to them is removed, a Bearer one passes. **UptimeRobot monitors (staging):** HTTP(s) `https://staging.mozrewards.com/api/health/ready` and `/api/health/worker`, and a keyword monitor on `/api/health/live` for `"status":"ok"`; 5-min interval; alert contacts: both developers' emails + the app on both phones. Production monitors are added in P5-12.

## 4. Deploy

*(P0-15)* Staging deploys on every green push to `main`; production on a `v*` tag, started by a human.
1. Check CI is green on the commit (`gh run list --limit 1`) and the System page shows no open alerts.
2. Production: `gh workflow run deploy.yml -f tag=vX.Y.Z` (GitHub Free mode refuses a tag without a green CI run).
3. The job ships the image (`docker save | zstd | ssh … docker load`), runs migrations in a one-off container, then replaces `web-1`, waits for `/api/health/ready`, replaces `web-2`, then the worker (it drains for 60 s).
4. **Worked when:** the job is green, `/api/health/ready` and `/api/health/worker` are 200, the System page snapshot is fresh, Sentry shows no new issues for the release (`APP_RELEASE` = the SHA).
- A failing health check aborts the deploy and leaves the previous version serving: read the job log, fix, deploy again.

## 5. Rollback

*(P0-15)* When a release misbehaves and a fix isn't minutes away.
1. `gh workflow run deploy.yml -f tag=<previous tag>` — the host keeps the last 3 images, so no rebuild.
2. Migrations are expand-only, so the previous image runs on the new schema; never roll a migration back by hand.
3. **Worked when:** as §4, with `APP_RELEASE` back to the previous SHA. Write down why in SESSION_LOG.

## 6. Restore and outbox replay

When data is lost or corrupted (or after §14). Targets: RPO ≤ 5 min (WAL), RTO ≤ 2 h.
1. *(P0-15)* Stop the web and worker containers (keep Postgres): no writes during the restore.
2. *(P0-15)* Restore: base backup + WAL to the chosen point (`wal-g backup-fetch` + `recovery_target_time`), or the latest nightly dump (`gpg --decrypt` with the private key from the password manager, then `pg_restore`). Note the **restore point** time with its time zone.
3. Start Postgres, run `pnpm db:migrate` (no-op if already current) and the integrity checks.
4. **Replay the outbox.** redis-queue died with the old data, so jobs written shortly before the restore point may never have run. First count, then send:
   ```
   pnpm relay --replay-since "2026-11-10T14:05:00+00:00" --dry-run   # restore point minus ~10 min
   pnpm relay --replay-since "2026-11-10T14:05:00+00:00"
   ```
   More than 24 h back needs `--force` (a typo there re-sends days of side effects).
5. Start the worker, then the web. **Worked when:** System page fresh with no alerts, outbox waiting = 0, a test sign-in email arrives.

**Prove a backup restores: `pnpm backup:verify` (P0-15 D3; every phase end, H-29; monthly after launch).** The
host never holds the private key, so only this proves the uploaded dumps decrypt. On an encrypted laptop disk,
with `pnpm services:up` running:
```
export B2_RESTORE_KEY_ID=… B2_RESTORE_KEY=…      # the read-only moz-backups-restore key, this shell only
pbpaste | pnpm backup:verify --env staging --key-file -   # key copied from the password manager (not typed: no scrollback)
unset B2_RESTORE_KEY_ID B2_RESTORE_KEY; pbcopy </dev/null   # Windows: Get-Clipboard | …, then Set-Clipboard $null
```
gpg asks for the key's passphrase. `--env production` (real customer data) refuses unless the disk is encrypted:
FileVault (macOS) or LUKS (Linux) is checked; on Windows add `--disk-encrypted` only with BitLocker on. It lists `<env>/dumps/`, takes the newest dump (fails if older than 26 h by the server's upload time, or named in the future,
`--max-age-hours` to change), checks its size, the sha256 recorded at upload and the OpenPGP header, imports the
key into a throwaway GNUPGHOME (must be the pinned fingerprint), decrypts straight into `pg_restore` in a
`--network none` scratch container and runs `infra/backup/checks.sql`. **Worked when:** the last line is
`backup:verify: PASS`; everything (container, key, files) is removed even on Ctrl-C. Note the result in SESSION_LOG.

**Prove point-in-time recovery: `pnpm backup:verify --wal --target-time <ISO with zone>` (P0-15 D3b, AC4; with
every `backup:verify`).** Same shell, key and disk rules as above; pick a time a few minutes ago (it must be after a
base backup finished and its WAL must be archived, so not within the last ~2 min):
```
pbpaste | pnpm backup:verify --env staging --key-file - --wal --target-time 2026-11-16T09:30:00Z
```
The first run builds the staging/production Postgres image from `infra/postgres` (amd64; a few minutes, emulated
on Apple silicon). It lists every version under `<env>/wal/`, takes the newest base backup that finished (and was
uploaded) before the target, and fetches its files plus its timeline's WAL up to 30 min after the target, the
**oldest** version of each object (a note says when a key has more). Every data object must be OpenPGP
ciphertext: a plaintext one fails the run. gpg on the laptop removes the encryption (the key never enters a
container) and the bytes go straight into a tmpfs of a scratch container with no network, where wal-g unpacks the
base backup and Postgres replays WAL to the target and promotes; then `checks.sql`. **Worked when:** a
`pitr|pass|…` line names the base backup and where recovery stopped, and the last line is `backup:verify: PASS`.
"The archived WAL ends before …" means the target is too recent (or WAL was uploaded late): pick an earlier time.
"No base backup … finished before …": run `sudo moz-backup base <env>` on the host, or pick a later time.
- Never `gpg --decrypt` a wal-g object by hand: wal-g writes text-mode literal packets and gpg rewrites their line
  endings, which corrupts the zstd stream. `gpg --output - --unwrap` keeps the bytes; backup:verify does this.

**Replay limits (C-31).**
- Replay re-dispatches outbox rows that still exist after the restore. Jobs are idempotent inside our database (a completed row is skipped), so repeats there are harmless.
- A side effect that happened **after** the restore point, recorded only in data the restore threw away, can run **again**: e.g. an email sent at 14:07 whose outbox row (completed at 14:07) was lost when restoring to 14:05 is sent a second time. Internal effects re-run idempotently; external ones (emails, push, payments later) need provider-side idempotency keys (P2 adds them for payments). Tell the client if customers may have received duplicates.
- Never replay further back than needed: every extra minute is more possible duplicates.

**WAL archiving and the archive-off lever (P0-15 D2).** Postgres archives WAL every minute through
`/usr/local/bin/moz-walg` (wal-g, encrypted to the pinned backup key); a weekly base backup runs Sundays 03:30
(`moz-basebackup@<env>.timer`). The System page shows "Last WAL archive" (from `pg_stat_archiver`) and "Last base
backup"; health.backup alerts when WAL is > 10 min old or failing, the base backup is > 8 days old or failed, the
lever is set, storage reaches 70% of the environment's B2 share, or the key expires within 30 days.
- **B2 down or the key pair wrong, and `pg_wal` growing** (disk alert, §12): `sudo moz-backup wal-off <env>` sets
  the lever (`/etc/moz/<env>/backup-lever/archive-off`, root-owned, mounted read-only into Postgres). Segments are
  then passed over and recycled. Point-in-time recovery has a **gap** from that moment; nightly dumps continue.
- **As soon as B2 works again:** `sudo moz-backup wal-on <env>`. It removes the lever and takes a base backup at
  once, so point-in-time recovery restarts from there. Never remove the file by hand without that backup.
- A new environment starts with the lever set (`moz-deploy init-env`): the first deploy with the B2 key pair
  (H-42) writes `/etc/moz/<env>/walg/walg.env`; then run `wal-on` once.
- Check: `sudo docker exec moz-<env>-postgres-1 psql -U postgres -Atc "SELECT * FROM pg_stat_archiver"` —
  `last_failed_time` newer than `last_archived_time` means archiving is failing; the reason is in
  `docker logs moz-<env>-postgres-1` (lines starting `moz-walg:`).

## 7. Redis loss

**redis-queue** (BullMQ, rate limits, alert dedup, email/Sentry counters; AOF everysec, `noeviction`).
- Symptoms: `health.redis`, `/api/health/ready` 503, actions needing a rate limit return "temporarily unavailable" (fail-closed), sign-in limits closed. Alerts still arrive (the worker dedups in memory while Redis is down).
1. `docker compose ps redis-queue` and its logs: OOM, disk, AOF corruption (`redis-check-aof --fix` on a copy first).
2. Restart it. With the AOF intact nothing is lost; BullMQ resumes.
3. If the data is gone: the outbox sweep re-dispatches rows dispatched > 10 min ago and still open (`outbox.lost` alert) — or run §6 step 4 from the time of the loss. Rate-limit and lockout counters restart from zero (accepted).
4. **Worked when:** ready 200, `health.redis` stops, outbox waiting drains, System page queues move.

**redis-cache** (cache + pub/sub, `allkeys-lru`): losing it is not an outage — reads fall back to Postgres (slower), SSE fan-out (P1-10) reconnects. Restart it; nothing to restore.

## 8. Worker down

Symptoms: `/api/health/worker` 503, stale System page banner, `health.scheduler`, `outbox.stale`, `health.queue_lag`.
1. `docker compose ps worker`; logs: look for `worker.start_failed` (env or database role refused at boot — the message names the variable) or crashes (Sentry, `process: worker`).
2. Restart it. It re-registers schedules idempotently and the relay picks up waiting outbox rows.
3. **Worked when:** `/api/health/worker` 200 within a minute, outbox waiting and queue lag fall back to 0.
- Locally: `pnpm worker` (needs `pnpm services:up`).

## 9. Key leak

Rotate first, investigate second. Inventory and rotation consequences: SECURITY §7.
1. Identify the secret and every environment that used it (each environment has its own values).
2. Generate the new value as in the inventory (`openssl rand -base64 32|48`, or the provider's console for Resend/Brevo/R2/Google/Turnstile/Sentry).
3. Update the GitHub secret and the password manager; redeploy (§4) so the deploy job rewrites the host env file. Revoke the old value at the provider.
4. Consequences: `AUTH_SECRET` signs everyone out; `MEMBER_QR_SIGNING_KEY` invalidates saved QR codes; `DATA_ENCRYPTION_KEY` is never rotated in place (new key + new ID + re-encryption job, P1-04); `BLIND_INDEX_KEY` rotation rebuilds lookup indexes; database passwords need the P0-15 bootstrap re-run; `HEALTH_TOKEN` needs the deploy scripts updated.
5. Investigate: how it leaked (gitleaks history, logs, a laptop), what it could reach (audit log, provider logs). Personal data exposed → COMPLIANCE §2 breach steps (72 h to the ICO if reportable).
6. **Worked when:** the old value is refused at the provider and the app is healthy on the new one.

## 10. Email provider outage or quota

- **Resend down or over its cap**: sends fail over to Brevo automatically (P0-19); logs show `email provider failed; sending through the fallback`. Nothing to do unless both fail.
- **Both failing**: auth emails fail; the action shows a retry message. Check status pages; if a key was revoked, see §9. Jobs retry with backoff, then dead-letter (`health.failed_jobs`); re-run them from the System page later (P2) or re-dispatch with §6 step 4.
- **`quota.email` (≥ 70% of the daily cap)**: until P2-11 adds the drop order, check what is sending (logs `kind`), stop any non-critical bulk send. Ops alerts and sign-in/security mail are never dropped (ARCHITECTURE §10). Counter resets at UK midnight.

## 11. Free-tier quota exhausted

| Service | What happens | Do |
|---|---|---|
| Sentry (5,000 errors/month) | Sentry drops events over quota; errors stay in the host logs; our per-process cap (30 per 10 min) limits a crash loop; browser errors have their own budget (20 per 10 min, `SENTRY_BROWSER_DAILY_CAP` per day) | Fix the noisy error first; lower `SENTRY_ERROR_SAMPLE_RATE` if needed; never pay without a DECISIONS entry + human approval |
| R2 (10 GB) | Overage is billed per GB — backups must **never** stop | Prune old uploads/derivatives; accept a small bill; record it |
| GitHub Actions | Scheduled workflows pause at 80%; push CI continues | `pnpm ci:usage`; postpone scheduled runs |
| Gemini (from P3) | Spend cap may overshoot ≈ 10 min; app daily cap + kill switch | Turn the `ai_review_help` flag off |

## 12. Disk nearly full

`health.disk` at 80%.
1. `df -h`, `docker system df`; largest: Postgres volume, `pg_wal` (WAL archiving stuck? → `health.backup`), Docker logs (rotation should cap them, §15), old images (deploy keeps 3).
2. `docker image prune` (keeps tagged releases), clear old build cache; never delete files inside the Postgres volume by hand.
3. **Worked when:** usage below 80% and the alert stops.

## 13. Cloudflare Tunnel down

*(P0-15)* Site unreachable from outside, UptimeRobot alerts, but the containers are healthy on the host.
1. `docker compose logs cloudflared`; Cloudflare dashboard → Zero Trust → Tunnels: connector status.
2. Restart `cloudflared`. If the tunnel token was revoked or leaked: create a new token, update the GitHub secret, redeploy (§9).
3. **Worked when:** `https://<domain>/api/health/live` is 200 from outside and UptimeRobot recovers.

**Staging until launch (T-5, C-44): no Tunnel; Cloudflare's proxy reaches Caddy on the VPS's 443.** Three walls: `moz-origin-firewall` (only Cloudflare's IPv4 ranges reach the ingress bridge), Authenticated Origin Pulls (Caddy requires Cloudflare's origin-pull client certificate) and basic auth.
- **Cloudflare settings that must stay:** DNS `staging` = **proxied A record only** (orange cloud; no AAAA: Docker publishes 443 on IPv4 only); SSL/TLS mode **Full (strict)**; **Authenticated Origin Pulls on** (zone level). Check them after any DNS or SSL change.
- **Symptoms:** 526 = Cloudflare doesn't accept the origin certificate (expired, wrong host, or mode not Full strict); 525/handshake errors = Caddy refused Cloudflare's client certificate (AOP off, or Cloudflare rotated its origin-pull CA: replace `infra/caddy/cloudflare-origin-pull-ca.pem` and redeploy); 522/timeouts = the firewall drops Cloudflare (`sudo moz-origin-firewall check`; System page "Origin firewall"; `journalctl -u moz-origin-firewall-refresh`).
- **Origin certificate renewal** (System page "Origin certificate" turns red, and health.origin_firewall alerts, 30 days before expiry): Cloudflare → SSL/TLS → Origin Server → create a certificate for the staging host (ECC, 15 years), put the certificate and key in the GitHub secrets `CLOUDFLARE_ORIGIN_CERT_STAGING` / `CLOUDFLARE_ORIGIN_KEY_STAGING` (human, H-40 steps), redeploy staging. `write-env staging origin-tls` validates the pair, installs it and recreates Caddy.
- **Worked when:** the deploy's smoke (200 via the hostname) and its direct-IP probes (curl exit 28 on 443 and 80) both pass.

## 14. Full VPS rebuild

*(P0-15; rehearsed once in P5)* When the VPS is lost or untrustworthy. RTO target 2 h.
1. New Hostinger VPS (UK), add both developers' SSH keys (HUMAN_TASKS H-06).
2. Run the `infra/` hardening script (idempotent), then the Postgres bootstrap (roles, C-32).
3. Deploy the last good tag (§4) with the services stopped after the migration step.
4. Restore (§6), including the outbox replay.
5. Start `cloudflared` with the existing tunnel token on the new host: the tunnel moves, no DNS change.
6. **Worked when:** §4's checks pass from outside; tell the client what was lost (between the last WAL segment and the failure).

## 15. Logs

- JSON lines (pino) from every container: `docker compose logs --since 30m web-1 | jq 'select(.level >= 50)'`. Search a request with `jq 'select(.requestId == "<id>")'` (the id is in Sentry and in the alert email).
- Never logged: tokens, cookies, emails, phone numbers, codes (redaction, SECURITY §12). Better Auth's own logs go through the same logger (`src: "better-auth"`).
- Repeated identical worker errors (e.g. Redis down) are logged once per 30 s per queue with `repeated: n`, so an outage doesn't flood the log.
- Retention: Docker's `json-file` driver with rotation from `infra/docker/daemon.json` (100 MB × 30 files per container ≈ 30 days at launch volumes); installed on the host by P0-15. Spikes rotate out early rather than filling the disk.

## 16. Demo accounts on staging

*(P0-16, H-36)* Sign-in details are derived on the host, never stored. Run in **your own terminal** (never through
Claude), then copy the output into the password manager entry "Moz Rewards staging demo accounts":
```
ssh <you>@72.61.17.208
sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs           # emails, passwords, TOTP keys/URIs
sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs --codes   # the current 6-digit codes (30 s)
```
Customers sign in by email link (the shared inbox, `inbox+moz-…@`); staff and admins with password + code.

**Demo reset (C-38):** `moz-seed-reset.timer` runs `moz-deploy seed-reset staging` every Monday 04:30 (London): the demo
shops and accounts are deleted and re-created (same passwords/keys), then the demo sign-in check runs (the owner's
password alone must give the two-step challenge and no session; `/two-factor/enable` must answer 401). Every staging
release runs the same check. **Before a demo**, reset by hand: `sudo systemctl start moz-seed-reset` (waits until done),
then `sudo journalctl -u moz-seed-reset -n 20` ends with `seed-reset staging: done`. Failure → the journal names the step;
a failed check means a password-only sign-in path exists: stop the demo prep and fix it first.
**Worked when:** each account signs in and lands in its own portal. The presenter's step-by-step demo script is `docs/DEMO_GUIDE.md`.
