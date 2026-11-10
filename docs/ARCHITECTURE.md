# Architecture — Moz Rewards

Sections: [1 Stack](#1-stack) · [2 Repository layout](#2-repository-layout) · [3 Code conventions](#3-code-conventions) · [4 Data model](#4-data-model) · [5 Key flows](#5-key-flows) · [6 Background jobs](#6-background-jobs) · [7 Realtime](#7-realtime) · [8 Files and images](#8-files-and-images) · [9 Environments and deployment](#9-environments-and-deployment) · [10 Third-party services](#10-third-party-services) · [11 Observability](#11-observability) · [12 Scale plan](#12-scale-plan)

---

## 1. Stack

Use the **latest stable** version of each at project start; record exact versions in `progress/DECISIONS.md`.

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | `noUncheckedIndexedAccess` on |
| Framework | Next.js (App Router) | RSC by default; Server Actions for mutations; Route Handlers for SSE, uploads, webhooks |
| Package manager | pnpm | Node LTS |
| Styling | Tailwind CSS + CSS variables (DESIGN.md tokens) | No CSS-in-JS runtime |
| Animation | `motion` + CSS + SVG/Canvas | Lazy-load heavy pieces |
| Validation | Zod | Shared schemas client/server |
| Database | PostgreSQL 17 with PostGIS | Self-hosted in Docker on the production VPS (pinned image, named volume, internal network only). WAL archiving + nightly encrypted dumps to R2 (§9). No pooler at launch (§12). Row-Level Security, forced, on every shop- and user-scoped table |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL migrations committed |
| Auth | Better Auth (Drizzle adapter) | Google OAuth, magic link, TOTP 2FA, passkeys (staff/admin), email+password (staff/admin only, Argon2id). If a required capability is missing at kickoff, fall back to Auth.js and log the decision |
| Cache / rate limit / queues | Redis 7 + BullMQ | Two instances: `redis-queue` (BullMQ + rate limits) and `redis-cache` (cache + pub/sub). See §12 |
| Realtime | Server-Sent Events (Route Handler) + Redis pub/sub | No third-party realtime service |
| Email | Resend (primary) + Brevo (secondary) behind a provider interface | React Email templates. Free tiers at launch (Resend 100/day, Brevo 300/day); email budget, 70% alert and drop order in §10. Auth/security mail fails over to the secondary |
| Push | Web Push (VAPID) via `web-push` | Works in browsers, Android TWA, iOS Home Screen PWAs |
| Object storage | Cloudflare R2 (S3 API) | Served via Cloudflare on a separate domain (`cdn.`) |
| Images | `sharp` in the worker | Re-encode to AVIF/WebP, strip EXIF |
| PDF | Server-rendered (e.g. `@react-pdf/renderer`) in the worker | Receipts, invoices, posters |
| Share images | Satori/`@vercel/og`-style rendering | PNG cards |
| AI review help | Gemini Flash-class model via the **paid** pay-as-you-go API (never the free tier: UK users may only use paid services, and paid terms exclude product-improvement use of prompts) | Server-only, behind a provider interface and a feature flag (off until the key exists); project spend cap + app daily cap + kill switch (§10) |
| Bot protection | Cloudflare Turnstile | Forms and sign-in |
| Analytics | Self-hosted Umami (own database in the production Postgres) | No advertising trackers |
| Errors | Sentry Developer (free): one owner account, alert rules forward to both developers; sample rates keep errors under ~4,000/month | PII scrubbing on; quota alert at 70% |
| Metrics / logs | Structured JSON logs on the host (rotated, 30 days) + Sentry + admin System page; no paid metrics backend | See §11 |
| Testing | Vitest, Testing Library, Playwright, axe-core, k6, Lighthouse CI | See TESTING.md |
| Android app | Bubblewrap Trusted Web Activity | Google Play |
| Hosting | One Hostinger KVM 4 VPS (UK; 4 vCPU, 16 GB RAM, 200 GB NVMe), Ubuntu LTS, Docker Compose. Cloudflare (free) → Cloudflare Tunnel → Caddy → 2 web replicas; worker (+ outbox relay); Postgres 17 + PostGIS; `redis-queue` + `redis-cache`; Umami. R2 for files and backups | Staging is a separate Compose project on the same VPS with CPU/memory limits and nothing shared with production. Topology and targets in §9 (H-21 answered: single VPS, free tiers) |
| CI/CD | GitHub Actions | Staging auto-deploy on green `main`; production deploy on a `v*` tag, started by a human. Image shipped by `docker save \| zstd \| ssh` (no registry). Works on GitHub Free or Pro/Team (ENGINEERING) |

## 2. Repository layout

```
.
├─ CLAUDE.md
├─ docs/                    # specs (this folder)
├─ progress/                # PROGRESS.md, DECISIONS.md, SESSION_LOG.md, DEMO_NOTES.md
├─ design/reference/        # AI-generated reference images (mNN-*.png, dNN-*.png)
├─ src/
│  ├─ app/
│  │  ├─ (public)/          # /, /join, /legal/*, /s/[code]
│  │  ├─ (customer)/        # /wallet, /shops/[id], /vault/[shopId], /offers, /market, /me, /notifications, /game
│  │  ├─ (shop)/dashboard/  # shop dashboard routes
│  │  ├─ (admin)/admin/     # super admin routes
│  │  ├─ api/               # route handlers: sse, uploads, push, health, cron hooks
│  │  └─ dev/               # /dev/ui, /dev/motion (dev only, blocked in prod)
│  ├─ components/
│  │  ├─ ui/                # design-system primitives
│  │  └─ motion/            # signature moments (lazy)
│  ├─ features/<domain>/    # UI + server actions per domain (loyalty, offers, reviews, market, ...)
│  ├─ server/
│  │  ├─ db/                # drizzle schema, client, seed
│  │  ├─ auth/              # auth config, session helpers
│  │  ├─ authz/             # policy functions: requireCustomer, requireShopRole, requireAdminRole
│  │  ├─ services/          # domain logic (pure where possible, unit-tested)
│  │  ├─ repos/             # data access, always scoped
│  │  ├─ jobs/              # enqueue helpers
│  │  └─ integrations/      # email, push, storage, ai, google, postcodes
│  ├─ worker/               # BullMQ processors + scheduler entry
│  ├─ lib/                  # utils, zod schemas, crypto, sound, time (Europe/London)
│  └─ styles/               # tokens.css, globals.css
├─ drizzle/                 # migrations
├─ tests/                   # e2e/, load/, fixtures/, authz/
├─ public/                  # manifest, icons, .well-known/assetlinks.json
├─ infra/                   # docker-compose.{staging,prod}.yml, Caddyfile, VPS hardening script, backup/restore scripts, RESOURCES.md (memory budget)
└─ twa/                     # Bubblewrap project (Phase 5)
```

**Data ownership.** Each table is owned by exactly one domain module (e.g. `ledger_entries` → loyalty, `offer_claims` → offers). Only the owning module's repository reads or writes that table. Other modules call the owning module's service, never its repository. A lint rule or import test enforces this.

## 3. Code conventions

- Domain logic in `server/services` as plain functions taking explicit inputs; no framework imports; 90%+ unit-test coverage for loyalty, offers, plans, fraud rules.
- Every mutation (server action or mutating route handler) follows the action template in ENGINEERING §4 (`src/server/actionTemplate.ts`). This file does not restate its steps.
- Repos never accept a bare entity ID without a scope (`shopId`, `userId`), a `SystemScope` (scheduled jobs) or an `AdminScope` (cross-shop admin reads, audited).
- Layering: app filter first, Row-Level Security second. The scoped-transaction helper runs `SET LOCAL app.shop_id / app.user_id / app.scope` before any query. The web role `moz_app` has no `BYPASSRLS`; Better Auth and identity lookups use `moz_auth` (no `BYPASSRLS`, identity tables only). Cross-shop system sweeps run as the worker role `moz_worker` (`BYPASSRLS`) and are audit-logged. One pool per role; the scope picks it (`repos/_base.ts`, DECISIONS P0-20). Postgres is self-hosted, so we hold the superuser and create `moz_worker` with `BYPASSRLS` ourselves in the provisioning/migration bootstrap (no provider-specific role steps). RLS is enabled **and forced** with policies on every shop- and user-scoped table (SECURITY §3).
- A module never touches another module's tables (see Data ownership in §2).
- Money stored as integer pence; points as integers; times as `timestamptz` (UTC), business rules computed in `Europe/London` via `src/lib/time.ts`.
- IDs: UUIDv7 primary keys; public short codes (shop code, member ID, claim codes) generated with crypto-random Crockford base32 and uniqueness retry.
- Errors: typed `AppError(code, message, status)`; user-facing messages friendly; no stack traces to clients.
- Feature flags: `feature_flags` table + env overrides (Google Business replies, AI help, game rewards).
- Conventional Commits; one commit per task. Once CI exists: with GitHub Pro/Team, branch `t/<task-id>`, one squash-merged PR per task, `main` protected by required CI; on GitHub Free, the committed pre-push hook + CI on every push (ENGINEERING, `GITHUB_MODE`).

## 4. Data model

Core tables (snake_case). Columns abbreviated; add `created_at`, `updated_at` everywhere.

- **users** (auth-managed) · **sessions**, **accounts**, **verifications**, **two_factor**, **passkeys** (auth lib)
- **customer_profiles**: user_id PK/FK, full_name, phone_enc, phone_hash (HMAC for lookup), birthday_day, birthday_month, member_id (unique), sound_on, reduce_motion, is_adult_confirmed, adult_confirmed_at
- **shops**: id, slug, shop_code (unique), name, trading_name, category, description, address fields, postcode, location (PostGIS point), google_place_id, phone, logo_url, cover_url, vat_number, status (pending/active/expiring/grace/restricted/suspended/closed), timezone fixed
- **shop_hours** (shop_id, weekday, opens, closes) · **shop_closures** (shop_id, date, note)
- **shop_staff**: shop_id, user_id, role (owner/staff), per_award_limit, active
- **nfc_tags**: id, shop_id, tag_uid, status, replaced_by
- **memberships**: id, user_id, shop_id, joined_at, muted, marketing_opt_in, left_at, purchase_count, last_visit_at
- **loyalty_programs**: id, shop_id, version, earn_mode, earn_rate, ingot_size, main_reward, milestones (jsonb), streak (jsonb), tiers (jsonb), expiry_months, active_from
- **point_requests**: id, membership_id, status (pending/awaiting_owner/approved/rejected/expired), seen_at, requested_at, decided_at, decided_by, amount_pence, items (jsonb), reject_reason, source (request/scan), idempotency_key (unique)
- **ledger_entries** (append-only): id, membership_id, type, points, program_version, request_id, ref (jsonb), created_by, created_at — never updated or deleted (DB trigger blocks UPDATE/DELETE). Holds no PII: subject is the membership id only; `ref` never contains names, emails, phones or free text. Erasure leaves ledger rows untouched (pseudonymous)
- **rewards**: id, membership_id, kind (milestone/main/game/other), label, unlocked_at, redeemed_at
- **redemption_codes**: id, reward_id or offer_claim_id, code, expires_at, confirmed_by, confirmed_at
- **receipts**: id, request_id, number, pdf_url, data (jsonb)
- **feedback**: id, membership_id, rating, chips (text[]), note, ai_used, posted_google_clicked, created_at · **feedback_replies**
- **offers**: id, shop_id, kind (shop/daily_drop), title, description, terms, banner_url, starts_at, ends_at, audience (jsonb), status
- **offer_claims**: id, offer_id, user_id, code, claimed_at, confirmed_at · **saved_offers** · **private_offers** (offer_id, user_id, status accepted/skipped)
- **announcements**: id, shop_id, title, body, scheduled_for, sent_at
- **notifications** (partitioned monthly by `created_at`): id, user_id, kind, title, body, data, read_at · **push_subscriptions**: id, user_id, endpoint, keys, ua, last_seen
- **happy_hours**: id, shop_id, weekday, start_time, end_time, multiplier, paused
- **referrals**: id, shop_id, referrer_user_id, referee_user_id, status, rewarded_at
- **suggestions**: id, shop_id, kind (birthday/winback), user_id, draft (jsonb), status (pending/sent/skipped), created_at
- **game_scores**: id, user_id, shop_id, score, duration_ms, rewarded, created_at
- **listings**: id, user_id, title, description, price_pence, category, area, contact_phone_enc, seller_type, business_name, status (pending_review/live/expired/removed), expires_at · **listing_photos** · **listing_reveals** (listing_id, viewer_id, at)
- **reports**: id, target_type, target_id, reporter_id, reason, status · **moderation_actions**
- **applications**: id, payload (jsonb), status, reviewed_by · **plans** (shop_id, type monthly/lifetime, starts_at, expires_at) · **payments** (shop_id, amount_pence, method, reference, paid_at, recorded_by) · **invoices**
- **featured_slots**: id, shop_id, starts_at, ends_at
- **fraud_flags**: id, rule, entity, details, status
- **data_requests**: id, user_id, kind (export/delete), due_at, status
- **audit_logs** (append-only, partitioned monthly by `at`): id, actor_id, actor_role, action, entity, entity_id, meta, ip_hash, at. Dropping a whole partition past retention is the only removal
- **outbox**: id, queue, job_name, payload (jsonb `{ v, data }`, ids only, no PII, ≤ 8 KB), created_at, next_attempt_at (backoff + relay lease), attempts, last_error, dispatched_at, completed_at (set by the worker; a replayed job of a completed row is a no-op) — written in the same transaction as the change it describes (§5, §6)
- **feature_flags**, **content_settings** (chips, keywords, templates, categories)
- **integrity_issues**: id, check, entity, details, detected_at, resolved_at

Indexes: every FK; `memberships(user_id, shop_id)` unique; `point_requests(membership_id) WHERE status IN ('pending','awaiting_owner')` partial unique (one open request per membership); `offers(shop_id, kind, starts_at)`; GiST on `shops.location`; `listings(status, category, created_at)`; `outbox(created_at, id) WHERE dispatched_at IS NULL`, `outbox(dispatched_at, id) WHERE dispatched_at IS NOT NULL AND completed_at IS NULL` (replay).

Partitions: monthly partitions for `audit_logs` and `notifications` are created ahead by a scheduled job (at least 2 months ahead); a missing future partition raises an alert.

Scopes: repositories take a user/shop scope, `SystemScope` (scheduled jobs only, never reachable from a request) or `AdminScope` (cross-shop admin reads; every read writes an audit row).

Sweeps: system jobs that scan many rows (expiry, reminders, retention) page by keyset (`WHERE id > $last ORDER BY id LIMIT n`), never OFFSET and never one unbounded statement. Each scheduled job has a runtime alarm: an alert fires if a run exceeds its expected duration or does not run on schedule.

## 5. Key flows

**Scan → landing**: `/s/[code]` (RSC, rendered per request; the shop's public landing data is cached in `redis-cache` for 60 s) → client shows Gilded Gate if `src` present → CTA "Collect points" → sign-in if needed (return URL validated) → membership upsert → shop page.

**CSP and caching**: HTML is **never** cached at the CDN. Every page renders per request with the nonce CSP (SECURITY §5); a hash-based CSP is not workable with the App Router because the inline RSC payload scripts change with the page's data. Hot public pages (shop landing `/s/[code]`, offers feed) cache their **data** in `redis-cache` for 60 s, not their HTML. HTML responses carry `Cache-Control: private, no-store` (or Next's dynamic default) and no Cloudflare cache rule matches HTML. Cloudflare caches only static assets (`/_next/static/*`, icons, fonts) and `cdn.` images. A test asserts that `/s/[code]` and the offers feed carry a fresh nonce per request and are not cacheable by a shared cache. Decided and tested in P1-02.

**Side effects (outbox)**: every side effect (email, push, PDF, SSE publish, fraud check, referral check) is written as an `outbox` row in the same transaction as the change. Nothing is enqueued or published directly from a request. After commit the relay worker enqueues each row with `jobId = outbox.id` and marks it dispatched. A sweeper alerts on undispatched rows older than 2 min.

**Points request**: customer action `requestPoints(shopId, idemKey)` → checks (membership, open-request limit, daily cap, plan state) → transaction: insert `point_requests` + outbox row (`shop:{id}:requests` publish) → commit → relay publishes on Redis → SSE to dashboard. Customer page subscribes to `user:{id}:events`.

**Approve**: staff action `approveRequest(requestId, amount, items)` → authz (staff of that shop, limit) → transaction: lock request row, compute points (program version, happy hour by `requested_at`, streak), insert ledger entries, update membership counters, unlock rewards/milestones, create receipt row, write outbox rows (receipt PDF, push, referral check, fraud rules, `points_credited` publish to `user:{id}:events`), write audit row → commit → relay worker dispatches → customer celebration. A crash after commit loses nothing: undispatched rows are relayed on restart.

**Redeem**: customer `createRedemptionCode(rewardId)` → code (15 min) → staff `confirmRedemption(code)` within own shop → reward marked redeemed → event to customer.

**Daily Drop limit**: unique index on `(shop_id, kind='daily_drop', local_date)` (generated column using Europe/London date).

## 6. Background jobs

BullMQ queues in `src/worker/`: `notifications` (push + inbox fan-out in batches of 500), `email`, `images`, `pdf`, `share-cards`, `fraud`, `scheduled`. Repeatable schedules (Europe/London): request expiry (every 5 min), Daily Drop expiry (00:00), saved-offer reminders (hourly + 17:00), birthday suggestions (06:00), win-back suggestions (06:30), monthly recap (1st, 09:00), weekly owner email (Mon 09:00), plan state transitions + reminders (07:00), listing expiry (hourly), points expiry (daily), data-request deadlines (daily), backups verification (daily), health job (every 5 min, §11), restore drill (monthly, §9).

All jobs idempotent, with retries + exponential backoff and a dead-letter queue visible in super admin (simple table).

- Jobs are created from the `outbox` by the relay worker (`jobId = outbox.id`, so a re-relay never duplicates a job). Request code never calls `queue.add` directly. Scheduled jobs are the only other producer.
- Outbox relay: polls undispatched rows (oldest first, keyset-batched), enqueues, marks `dispatched_at`. Sweeper alerts when any row is older than 2 min.
- **Replay mode** (`relay --replay-since <timestamp>`): re-dispatches outbox rows dispatched within N minutes before a restore point. Used by the RUNBOOK restore procedure, because `redis-queue` contents are lost if the VPS is lost; safe because jobs are idempotent and `jobId = outbox.id`. Tested (P0-18, P0-15).
- Queues live on `redis-queue` only (AOF everysec, `maxmemory-policy noeviction`). Never on `redis-cache`. The daily email send counter (§10) also lives on `redis-queue`.
- Cross-shop sweeps run under `SystemScope` as the `moz_worker` DB role, keyset-batched, each with a runtime alarm (§4).
- Graceful shutdown: on SIGTERM a worker stops taking new jobs and drains active jobs for up to 60 s; unfinished jobs return to the queue and are retried.
- In production the worker is its own container on the same VPS as the web replicas, with its own memory limit (`infra/RESOURCES.md`). A separate worker host is a scale-path step (§12.2).

## 7. Realtime

- SSE endpoints: `/api/sse/shop/[shopId]` (staff only) and `/api/sse/me` (customer). Heartbeat every 25s. Redis pub/sub (on `redis-cache`) fan-out so multiple web containers work.
- One shared Redis subscriber connection per web process, multiplexed to all local streams. Never one Redis connection per SSE client.
- Connection caps: per user (default 5 open streams) and per shop (default 50 staff streams). Over the cap, the oldest stream is closed.
- Long-lived streams re-check authorisation every 5 min (session still valid, role and shop membership unchanged); on failure the stream closes with an auth event.
- Clients reconnect with exponential backoff plus random jitter and refetch state on reconnect (SSE is a hint, DB is truth).
- On shutdown or deploy the server sends `retry:` with a jittered delay, then closes, so clients do not reconnect all at once.
- Redis down: the stream sends a `degraded` event and the client falls back to polling (every 15 s) until SSE recovers. No user action fails because realtime is down.

## 8. Files and images

- Uploads: client requests a presigned PUT URL (`/api/uploads`) with declared type/size → upload to R2 `incoming/` → server enqueues `images` job → sharp validates magic bytes, re-encodes (AVIF + WebP), strips EXIF, generates sizes → moves to `public/` path → DB updated. Originals deleted.
- Limits: images ≤ 8 MB in, JPEG/PNG/WebP/HEIC only; max 5 per listing, 6 per shop gallery.
- Served from `cdn.<domain>` (separate origin) with long cache and content hashes.
- Durability: uploaded images rely on R2's own durability (no versioning or cross-bucket replication at launch) — an accepted risk recorded in DECISIONS. Receipt PDFs and share cards are regenerable from the database.

## 9. Environments and deployment

| Env | URL | Deploys | Data |
|---|---|---|---|
| Local | localhost:3000 | `pnpm dev` + Docker (postgres, redis, Mailpit, MinIO) | Seed |
| Staging | `staging.<domain>` | Auto on every green push to `main` | Seed demo data, reset weekly. Separate Compose project on the production VPS: own Postgres, Redis, secrets, R2 bucket or prefix, Google OAuth client |
| Production | `<domain>` (+ `cdn.`) | Git tag `v*`, deploy started by a human (see Deploy) | Real |

**Production topology (H-21 answered: single VPS, free tiers).**
- **Host:** one Hostinger KVM 4 VPS in the UK (4 vCPU, 16 GB RAM, 200 GB NVMe), Ubuntu LTS, Docker Compose. Provisioned by an idempotent hardening script in `infra/` (SECURITY §11).
- **Edge:** Cloudflare free plan (DNS, proxy, TLS, free WAF managed rules and rate-limit rule as a backstop). The origin is reachable **only through Cloudflare Tunnel** (`cloudflared` container, one tunnel per environment); the host has no inbound 80/443. ufw default-deny; SSH key-only as a non-root deploy user.
- **Production containers** (every container has a memory limit; the budget table lives in `infra/RESOURCES.md` and must fit 16 GB with headroom):
  - `cloudflared` → `caddy` → `web-1`, `web-2` (two replicas so rolling deploys work on one host);
  - `worker` (+ outbox relay);
  - `postgres` (17 + PostGIS, pinned image with wal-g and `ca-certificates`, named volume, internal network only, never published to a host port; `shared_buffers` ≈ 2 GB). Holds the app database and Umami's own database (own role, no access to the app database);
  - `redis-queue` (BullMQ + rate limits + email counter; AOF everysec, `noeviction`) and `redis-cache` (data cache + pub/sub; `allkeys-lru`) as two containers (§12);
  - `umami`.
- **Staging:** a separate Compose project on the same VPS at `staging.<domain>` (basic auth + `noindex`): its own networks, volumes, Postgres, Redis containers, secrets, R2 bucket or prefix, Google OAuth client and tunnel. It shares nothing with production. It has CPU and memory limits so it can never starve production, and may be stopped after launch when not in use. Same Postgres/PostGIS image and version as production (parity).
- **No pooler at launch.** The connection-budget rule (§12) is checked at boot; `SET LOCAL` keeps RLS pooler-safe, so adding PgBouncer later needs no code change (§12.2).

**Targets (internal, never a client SLA).**
- Availability 99.5% per month (single host).
- RPO ≤ 5 min (WAL archiving). If wal-g against R2 is blocked in P0-15, the fallback is nightly dumps only (RPO 24 h) with a DECISIONS entry and the client informed (H-21).
- RTO ≤ 2 h: build a fresh VPS from the `infra/` scripts, restore, replay the outbox, move the Tunnel.
- The full rebuild-and-restore is rehearsed once before launch (P5), locally or on a temporary hourly-billed VPS. After that, the monthly automated restore drill (below) keeps the backups proven.

**Deploy.**
- CI builds the production image tagged with the commit SHA and ships it straight to the VPS: `docker save | zstd | ssh deploy@<vps> docker load`. No registry: images go only from the GitHub runner to our host, so the deploy has no dependency on GHCR pricing or availability. Keep Actions artifacts small and short-lived (they share the GitHub Packages storage quota).
- The host keeps the last 3 production images; the deploy job prunes older ones.
- Release step from the deploy job, before any replica switches: migrations (expand-only) run in a one-off container from the new image on the production network. The owner connection string lives only in GitHub secrets and the password manager; it is passed to that container over the SSH session and never written to the host.
- Rolling deploy: replace `web-1`, wait for `/api/health/ready`, then `web-2` (Caddy health-checks both upstreams). Then the worker drains (§6) and is replaced. SSE streams send a jittered `retry:` before close (§7). A failing health check aborts and leaves the previous version serving.
- Rollback = redeploy the previous image tag (scripted). Rehearsed at every phase end from P0-15.
- Production deploys are started by a human on a `v*` tag. GitHub Pro/Team: `production` environment secrets and a deployment-branch rule (required reviewers are not available for private repos below Enterprise, so no approval gate is planned). GitHub Free: a `workflow_dispatch` that refuses unless the tag's commit has a green CI run, with repository secrets. One documented setting (`GITHUB_MODE`, ENGINEERING) switches between them.

**Migrations at scale.**
- Expand-only per release (expand → migrate → contract across releases), so the previous image always runs against the new schema.
- Migrations run as a release step before switching traffic, with `lock_timeout = 5s` and a `statement_timeout`.
- Indexes on existing tables use `CREATE INDEX CONCURRENTLY` in a non-transactional migration.
- Backfills run as batched jobs, never inside a migration.
- A migration linter in CI rejects unsafe operations (non-concurrent index on an existing table, volatile default on a large table, column drop in the same release as its last use).

**Secrets.** Developers' laptops hold dev-only keys. Staging and production secrets live only in GitHub secrets, in root-only files on the host written by the deploy job, and in the developers' password manager. Claude never sees a staging or production secret, and no step asks a human to paste one into chat. Never in the repo. Keys are separate per purpose (SECURITY §7).

**Backups and recovery.**
- **Nightly dumps:** `pg_dump -Fc` of each production database (app + Umami), encrypted with the backup **OpenPGP public key** (`gpg --encrypt`; only the public key is on the host) and uploaded to a dedicated R2 backup bucket. The backup bucket has its own R2 API token scoped to that bucket only, different from the app's uploads token. An R2 lifecycle rule deletes objects after 35 days.
- **WAL archiving:** wal-g to the same backup bucket (S3-compatible endpoint, path-style), `archive_timeout = 60s`, weekly base backup, retention `delete retain FULL 5` (≈ 35 days) so neither the bucket nor the local `pg_wal` grows without bound. WAL and base backups are encrypted with the **same** OpenPGP public key (`WALG_PGP_KEY`; wal-g supports OpenPGP but not `age`, so one OpenPGP key pair serves both — human's decision, plan v5). The Postgres image includes `ca-certificates` (wal-g issue #2550: `wal-push` hangs against R2 without it).
- **Keys:** one backup OpenPGP key pair. The private key is never on the VPS; it lives only in the developers' password manager (HUMAN_TASKS H-26).
- **Alerts** (health job, §11): no successful dump in 26 h; WAL archive lag > 10 min; disk > 80%; R2 storage ≥ 70% of the free 10 GB (uploads + backups together).
- **Monthly automated restore drill:** on the 1st, the host restores that night's dump into a scratch database (from the local plaintext copy kept only until the drill finishes; the private key is not on the host), runs the integrity and reconciliation checks, verifies that the uploaded ciphertext in R2 matches the checksum recorded at upload, then drops the scratch database and deletes the plaintext. The result is recorded on the admin System page and in SESSION_LOG. Decryption with the offline private key is exercised in the P5 rehearsal and after any change to the backup scripts. A developer also runs a **full decrypt-and-restore from R2** (private key from the password manager, into a local scratch database) at every phase end, and the full rebuild-and-restore rehearsal runs once in P5.
- **Restore procedure** (RUNBOOK): fresh VPS from `infra/` → restore base backup + WAL to the target point (or the latest dump) → `relay --replay-since <restore point − N min>` (§6), because `redis-queue` contents die with the VPS → integrity + reconciliation → start `cloudflared` with the production tunnel token on the new host (no DNS change).
- Receipts and share cards are regenerable from the database. User-uploaded images rely on R2 durability (accepted risk, §8).
- Hostinger's automatic weekly VPS backups are an extra layer only; recovery never relies on them.

## 10. Third-party services

The human creates accounts; you write the integration and document the exact env vars in `.env.example`.

**Free tiers are the launch plan.** The only recurring paid items are the VPS, Gemini usage (capped) and, if chosen, GitHub Pro. Every quota has an alert at 70% (the health job checks usage counters or the provider's usage API; where a provider gives no API, its own usage alert email goes to both developers). When a quota runs out the system degrades gracefully, as documented below; no user action fails with a 500.

| Service | Purpose | Plan at launch | Limit we watch | When the quota runs out |
|---|---|---|---|---|
| Hostinger KVM 4 (UK) | Production + staging host (§9) | Paid VPS (promo term, renewal price higher — budgeted by the client, H-21) | CPU, RAM, disk (80%) | Scale path §12.2 |
| Cloudflare | DNS, CDN (static + `cdn.` only), Tunnel, Turnstile, free WAF managed rules + rate-limit rule (backstop; our Redis limits are the real control) | Free | — | — |
| Cloudflare R2 | Uploads bucket + backup bucket (separate scoped tokens) | Free tier: 10 GB-month, 1M Class A, 10M Class B, zero egress | Storage ≥ 70% of 10 GB (uploads + backups together) | Overage is billed per GB; the alert lets us prune or accept a small bill — never stop backups |
| Resend (primary) / Brevo (failover) | Email | Free: Resend 100/day, 3,000/month; Brevo 300/day | Combined daily cap (≈ 400/day): alert at 70% (≈ 280/day) | Drop order below |
| Google Cloud | OAuth (staging and production clients); Business Profile API only if the optional feature is enabled | Free | — | — |
| Gemini API | Review help | Paid pay-as-you-go (never the free tier) | Project monthly spend cap (≈ 10-min lag, may overshoot) + our own app daily cap + kill-switch flag (the real control) | Feature hides "Help me write it"; the customer writes their own text |
| Sentry | Errors (web + worker) | Developer (free): one user, 5,000 errors/month, 30-day retention | Sample rates keep errors under ~4,000/month; quota alert at 70% | Errors still logged on the host (§11); Sentry drops events over quota |
| UptimeRobot | Uptime and keyword monitors | Free: 50 monitors, 5-min interval | — | — |
| Umami | Analytics | Self-hosted (§9) | — | — |
| GitHub | Repo, Actions | Free or Pro/Team (HUMAN_TASKS, `GITHUB_MODE`); Actions credit budget < 75%, stop rule at 80% (ENGINEERING) | Monthly Actions credit | Scheduled workflows pause; push CI continues |
| Google Play Console | Android app | One-time fee | — | — |
| postcodes.io | Postcode → lat/long | Free, no key | — | "Near me" by postcode shows a friendly retry; geolocation still works |

**Email budget.**
- Email is used only for: sign-in links; auth/security mail (lockout and account-recovery notices); staff invites; shop-account mail (application received/approved/rejected, activation, invoices, suspension notices); plan reminders; data-request mails; the weekly owner email; and critical ops/health alerts to the developers. Announcements, offers and all marketing go by push + in-app inbox only, never by email (PRODUCT §9).
- A daily send counter lives in `redis-queue` (not the cache). At 70% of the combined daily cap (≈ 280/day) an alert goes to both developers.
- The weekly owner email is paced at ≤ 150/day (spread across days if needed), so it never crowds out critical mail.
- Near the cap, mail is shed in this order: weekly owner email first (dropped for that week) → plan reminders (dropped; the dashboard banner still shows them) → data-request notices, staff invites and shop-account mail are queued to the next day, never dropped (data requests have a one-month legal deadline) → auth/security mail (sign-in, lockout, recovery) and ops alerts are **never** dropped or delayed.
- Resend → Brevo failover and the drop order are both tested.

- Cost: a cost model (VPS at renewal price, Gemini spend, optional GitHub Pro, R2 overage, and the cost of each scale-path step) is maintained in P5-12.
- Every metered provider (Gemini, R2) has a budget alert to both developers.
- Grafana Cloud free may be added later for dashboards; it must never become a dependency.

## 11. Observability

Built in P0-13 (not P5).

- Structured JSON logs (pino) with request IDs; never log tokens, phone numbers, emails, codes. Kept on the host with Docker log rotation, 30-day retention. No paid log or metrics backend.
- Health split (P0-13): `/api/health/live` (public, process up, no detail), `/api/health/ready` (DB + redis-queue; Caddy and deploys; public status only, per-check detail with `Authorization: Bearer <HEALTH_TOKEN>`) and `/api/health/worker` (the worker's health monitor ticked within 3 min; UptimeRobot). The worker is not part of `ready`, so a stopped worker never takes the web out of Caddy (RUNBOOK §3).
- Sentry for web + worker (free Developer plan, one owner account): release tags per deploy; alert rules forward to both developers (email / webhook to the health-mail channel); the second developer gets details through the owner or the forwarded alert.
- UptimeRobot monitors staging and production (one owner account; both developers' emails as alert contacts; the mobile app on both phones).
- **Admin "System" page** (instead of a metrics backend): queue depth and lag, outbox age, failed jobs; last backup, WAL archive lag, last restore drill; disk, DB size, SSE connections; request rate, p95 latency and error rate per route over the last hour (aggregated from the request logs by a scheduled job); email sends today vs cap; provider quota usage.
- **Health monitor** (in the worker on its own 1-minute timer, not a BullMQ job, so it still runs and emails while redis-queue is down; P0-13): checks the alert thresholds (outbox age > 2 min, queue lag, failed jobs, backup age > 26 h, WAL lag > 10 min, disk > 80%, quotas ≥ 70%, missing partitions, job runtime alarms) and emails both developers. These alerts are critical mail (never dropped, §10).
- On-call: best-effort business hours by the two developers, uptime alerts to both phones, no 24/7 rota (post-launch support is a separate agreement).

**SLOs** (internal targets, measured from logs and synthetic checks; never a client SLA).

| SLO | Target |
|---|---|
| Availability | 99.5% per month |
| Approve → points credited on the customer screen | p95 < 2 s |
| SSE delivery | p95 < 3 s |
| Sign-in email sent | p95 < 30 s |

How each is measured: availability from UptimeRobot on `/api/health/ready` and `/api/health/worker` (5-min checks, P0-15); approve → credited and SSE delivery from the request/job logs (timestamps of the approval, the ledger write and the SSE send; per-route aggregation on the System page, C-35) and the P1 E2E timings; sign-in email from the outbox row's `created_at` to the job's completion (logs).

**Error-budget policy.** Reviewed at each sub-phase close and monthly after launch. If an SLO was missed in the month, the next task is the reliability fix for its cause, recorded in PROGRESS; feature work continues once that fix ships.

**Runbook.** `docs/RUNBOOK.md` is created in P0-13 with: deploy, rollback, restore (with outbox replay), full VPS rebuild, Redis loss, key leak, email provider outage, free-tier quota exhausted, Tunnel down. Each phase extends it for what it added.

## 12. Scale plan

- Stateless web containers; two replicas behind Caddy on the VPS, more replicas or hosts on the scale path (§12.2).
- HTML is never CDN-cached (§5). Hot public data (offers feed, shop landing) is cached in `redis-cache` for 60 s and rendered per request with the nonce CSP. The CDN caches only static assets and `cdn.` images.
- DB: no pooler at launch. Session-level state is never relied on (RLS settings use `SET LOCAL` inside the transaction), so a transaction-mode pooler can be added later with no code change.
- Connection budget: (web replicas × pool size) + (workers × pool size) + Umami ≤ 80% of Postgres `max_connections`. Checked at boot from config; documented per environment in `infra/RESOURCES.md`.
- Fan-out via queues, never in request.

**Redis split.**

| Instance | Holds | Config |
|---|---|---|
| `redis-queue` | BullMQ queues, rate-limit counters, daily email counter | AOF everysec, `maxmemory-policy noeviction`, password + TLS + key prefix (staging/prod) |
| `redis-cache` | Data cache, pub/sub (SSE fan-out) | `allkeys-lru`, no persistence needed, password + TLS + key prefix (staging/prod) |

Dev, staging and production run the same two-container split. `redis-queue` survives a container restart (AOF); if the VPS is lost, queued jobs are rebuilt from the outbox (replay mode, §6).

**Rate-limiter fail modes** (when `redis-queue` is unreachable):
- Auth and money endpoints (sign-in, magic link, 2FA, approve, redeem, claim confirm, points request) fail CLOSED with a friendly 503 and `Retry-After`.
- Public reads fail OPEN; the Cloudflare free rate-limit rule is the backstop.
- Both modes have tests.

### 12.1 Capacity model

**Launch tier (tested)** — until the client gives a forecast (H-21):

| Dimension | Launch tier |
|---|---|
| Shops | 200 |
| Members | 50,000 |
| Peak request rate | 30 req/s |
| Concurrent SSE connections | 1,000 |
| Announcement fan-out | 10,000 members in < 10 min |
| Scan spike on one shop | 10 scans/s |

Performance targets: actions p95 < 300 ms, p99 < 800 ms; page server time p95 < 800 ms; errors < 0.5% (outside the restart test, no lost jobs); queue lag < 60 s; SSE delivery p95 < 3 s.

Load tests (details in TESTING.md §5): k6 smoke against staging at every phase end; a small load test at launch-tier numbers at P2-16; release load test at P5-11, run from a developer machine or a GitHub runner against production behind the maintenance page before go-live (load generator's IP allowed through the Cloudflare rules for the run): 2× launch peak for 30 min, 1 h soak, a short 5× spike, 1,000 SSE connections, the 10,000-member fan-out, and a **restart test** (restart one web replica, the worker, `redis-queue` and Postgres in turn during load: no lost jobs, recovery within target, clients reconnect). Dataset at launch-tier volume, removed before go-live.

### 12.2 Scale path (not targets)

Documented only; **not built or tested before launch**. Scale tier: 2,000 shops / 500,000 members. Take the steps in order, each when its trigger metric holds (from the System page, health job and host metrics):

| Step | Change | Trigger |
|---|---|---|
| 1 | Bigger VPS | CPU > 70% or RAM > 80% sustained for 1 h at peak |
| 2 | Postgres moved to a managed service (with HA standby and point-in-time recovery) | DB CPU > 70% sustained, or DB size > 60% of disk |
| 3 | Second app host (web replicas in a separate failure domain; worker on its own host) | p95 over target at peak after step 1 |
| 4 | PgBouncer (transaction mode) + read replica for analytics | Connections > 80% of `max_connections`, or analytics queries slow the primary |

Later options at the same stage, each with a DECISIONS entry and a client cost decision: a `redis-queue` replica, R2 versioning and cross-bucket replication, paid email/Sentry plans, an off-host log and metrics backend.
