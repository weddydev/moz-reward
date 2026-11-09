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
| Database | PostgreSQL 16+ with PostGIS | Managed, London/EU region, HA standby, PITR, PgBouncer (transaction mode). Row-Level Security on every shop- and user-scoped table |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL migrations committed |
| Auth | Better Auth (Drizzle adapter) | Google OAuth, magic link, TOTP 2FA, passkeys (staff/admin), email+password (staff/admin only, Argon2id). If a required capability is missing at kickoff, fall back to Auth.js and log the decision |
| Cache / rate limit / queues | Redis 7 + BullMQ | Two instances: `redis-queue` (BullMQ + rate limits) and `redis-cache` (cache + pub/sub). See §12 |
| Realtime | Server-Sent Events (Route Handler) + Redis pub/sub | No third-party realtime service |
| Email | Resend (primary) + Brevo (secondary) behind a provider interface | React Email templates. Paid tier at launch; quota alert at 70%. Transactional/auth mail fails over to the secondary |
| Push | Web Push (VAPID) via `web-push` | Works in browsers, Android TWA, iOS Home Screen PWAs |
| Object storage | Cloudflare R2 (S3 API) | Served via Cloudflare on a separate domain (`cdn.`) |
| Images | `sharp` in the worker | Re-encode to AVIF/WebP, strip EXIF |
| PDF | Server-rendered (e.g. `@react-pdf/renderer`) in the worker | Receipts, invoices, posters |
| Share images | Satori/`@vercel/og`-style rendering | PNG cards |
| AI review help | Gemini Flash-class or similar low-cost model via server-only API | Behind a provider interface |
| Bot protection | Cloudflare Turnstile | Forms and sign-in |
| Analytics | Self-hosted Umami or PostHog (EU) | No advertising trackers |
| Errors | Sentry (free tier in dev/staging; paid at launch, quota alert) | PII scrubbing on |
| Metrics / traces / logs | OpenTelemetry, Prometheus-compatible metrics, logs shipped off-host | See §11 |
| Testing | Vitest, Testing Library, Playwright, axe-core, k6, Lighthouse CI | See TESTING.md |
| Android app | Bubblewrap Trusted Web Activity | Google Play |
| Hosting | Production: Cloudflare → ≥ 2 app hosts in separate failure domains (Docker Compose: web replicas, Caddy) → worker host(s) → managed Postgres → `redis-queue` + `redis-cache` → R2 | Staging on separate host(s) with separate databases and Redis; same config shape, smaller. Topology and targets in §9 (pending client budget confirmation, H-21) |
| CI/CD | GitHub Actions | Staging auto-deploy, production on tag with approval |

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
├─ infra/                   # docker-compose.{staging,prod}.yml, Caddyfile, backup scripts
└─ twa/                     # Bubblewrap project (Phase 5)
```

**Data ownership.** Each table is owned by exactly one domain module (e.g. `ledger_entries` → loyalty, `offer_claims` → offers). Only the owning module's repository reads or writes that table. Other modules call the owning module's service, never its repository. A lint rule or import test enforces this.

## 3. Code conventions

- Domain logic in `server/services` as plain functions taking explicit inputs; no framework imports; 90%+ unit-test coverage for loyalty, offers, plans, fraud rules.
- Every mutation (server action or mutating route handler) follows the action template in ENGINEERING §4 (`src/server/actionTemplate.ts`). This file does not restate its steps.
- Repos never accept a bare entity ID without a scope (`shopId`, `userId`), a `SystemScope` (scheduled jobs) or an `AdminScope` (cross-shop admin reads, audited).
- Layering: app filter first, Row-Level Security second. The scoped-transaction helper runs `SET LOCAL app.shop_id / app.user_id / app.scope` before any query. The web role `moz_app` has no `BYPASSRLS`. Cross-shop system sweeps run as the worker role `moz_worker` (`BYPASSRLS`) and are audit-logged. RLS policies exist on every shop- and user-scoped table (SECURITY §3).
- A module never touches another module's tables (see Data ownership in §2).
- Money stored as integer pence; points as integers; times as `timestamptz` (UTC), business rules computed in `Europe/London` via `src/lib/time.ts`.
- IDs: UUIDv7 primary keys; public short codes (shop code, member ID, claim codes) generated with crypto-random Crockford base32 and uniqueness retry.
- Errors: typed `AppError(code, message, status)`; user-facing messages friendly; no stack traces to clients.
- Feature flags: `feature_flags` table + env overrides (Google Business replies, AI help, game rewards).
- Conventional Commits; one commit per task. Once CI exists: branch `t/<task-id>`, one squash-merged PR per task, `main` protected by required CI.

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
- **outbox**: id, topic, payload (jsonb, ids only, no PII), created_at, dispatched_at, attempts — written in the same transaction as the change it describes (§5, §6)
- **feature_flags**, **content_settings** (chips, keywords, templates, categories)
- **integrity_issues**: id, check, entity, details, detected_at, resolved_at

Indexes: every FK; `memberships(user_id, shop_id)` unique; `point_requests(membership_id) WHERE status IN ('pending','awaiting_owner')` partial unique (one open request per membership); `offers(shop_id, kind, starts_at)`; GiST on `shops.location`; `listings(status, category, created_at)`; `outbox(created_at) WHERE dispatched_at IS NULL`.

Partitions: monthly partitions for `audit_logs` and `notifications` are created ahead by a scheduled job (at least 2 months ahead); a missing future partition raises an alert.

Scopes: repositories take a user/shop scope, `SystemScope` (scheduled jobs only, never reachable from a request) or `AdminScope` (cross-shop admin reads; every read writes an audit row).

Sweeps: system jobs that scan many rows (expiry, reminders, retention) page by keyset (`WHERE id > $last ORDER BY id LIMIT n`), never OFFSET and never one unbounded statement. Each scheduled job has a runtime alarm: an alert fires if a run exceeds its expected duration or does not run on schedule.

## 5. Key flows

**Scan → landing**: `/s/[code]` (RSC, CDN-cached per shop for 60s for anonymous users) → client shows Gilded Gate if `src` present → CTA "Collect points" → sign-in if needed (return URL validated) → membership upsert → shop page.

**CSP vs CDN caching**: a response cached at Cloudflare must not carry a per-request nonce (the cached nonce would be reused). Rule: dynamic and signed-in routes use the nonce CSP; CDN-cached public routes (shop landing `/s/[code]` for anonymous users, offers feed) use a static hash-based CSP with no nonce and no inline script outside the hashed set. A test asserts both cases. Decided and tested in P1-02.

**Side effects (outbox)**: every side effect (email, push, PDF, SSE publish, fraud check, referral check) is written as an `outbox` row in the same transaction as the change. Nothing is enqueued or published directly from a request. After commit the relay worker enqueues each row with `jobId = outbox.id` and marks it dispatched. A sweeper alerts on undispatched rows older than 2 min.

**Points request**: customer action `requestPoints(shopId, idemKey)` → checks (membership, open-request limit, daily cap, plan state) → transaction: insert `point_requests` + outbox row (`shop:{id}:requests` publish) → commit → relay publishes on Redis → SSE to dashboard. Customer page subscribes to `user:{id}:events`.

**Approve**: staff action `approveRequest(requestId, amount, items)` → authz (staff of that shop, limit) → transaction: lock request row, compute points (program version, happy hour by `requested_at`, streak), insert ledger entries, update membership counters, unlock rewards/milestones, create receipt row, write outbox rows (receipt PDF, push, referral check, fraud rules, `points_credited` publish to `user:{id}:events`), write audit row → commit → relay worker dispatches → customer celebration. A crash after commit loses nothing: undispatched rows are relayed on restart.

**Redeem**: customer `createRedemptionCode(rewardId)` → code (15 min) → staff `confirmRedemption(code)` within own shop → reward marked redeemed → event to customer.

**Daily Drop limit**: unique index on `(shop_id, kind='daily_drop', local_date)` (generated column using Europe/London date).

## 6. Background jobs

BullMQ queues in `src/worker/`: `notifications` (push + inbox fan-out in batches of 500), `email`, `images`, `pdf`, `share-cards`, `fraud`, `scheduled`. Repeatable schedules (Europe/London): request expiry (every 5 min), Daily Drop expiry (00:00), saved-offer reminders (hourly + 17:00), birthday suggestions (06:00), win-back suggestions (06:30), monthly recap (1st, 09:00), weekly owner email (Mon 09:00), plan state transitions + reminders (07:00), listing expiry (hourly), points expiry (daily), data-request deadlines (daily), backups verification (daily).

All jobs idempotent, with retries + exponential backoff and a dead-letter queue visible in super admin (simple table).

- Jobs are created from the `outbox` by the relay worker (`jobId = outbox.id`, so a re-relay never duplicates a job). Request code never calls `queue.add` directly. Scheduled jobs are the only other producer.
- Outbox relay: polls undispatched rows (oldest first, keyset-batched), enqueues, marks `dispatched_at`. Sweeper alerts when any row is older than 2 min.
- Queues live on `redis-queue` only (AOF everysec, `maxmemory-policy noeviction`, replica). Never on `redis-cache`.
- Cross-shop sweeps run under `SystemScope` as the `moz_worker` DB role, keyset-batched, each with a runtime alarm (§4).
- Graceful shutdown: on SIGTERM a worker stops taking new jobs and drains active jobs for up to 60 s; unfinished jobs return to the queue and are retried.
- Workers run on separate host(s) from web replicas in production.

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

## 9. Environments and deployment

| Env | URL | Deploys | Data |
|---|---|---|---|
| Local | localhost:3000 | `pnpm dev` + Docker (postgres, redis, Mailpit, MinIO) | Seed |
| Staging | `staging.<domain>` | Auto on every green push to `main` | Seed demo data, reset weekly. Separate host(s), separate Postgres and Redis |
| Production | `<domain>` (+ `cdn.`) | Git tag `v*` + manual approval in GitHub | Real |

**Production topology (target; budget confirmed by the client via H-21).**
- Cloudflare (proxy, WAF, bot rules) in front. The origin is reachable only through Cloudflare (Tunnel or Authenticated Origin Pulls; host firewall allows Cloudflare ranges only).
- ≥ 2 app hosts in separate failure domains, each running web replicas behind Caddy.
- Worker(s) on separate host(s).
- Managed Postgres (London/EU) with HA standby, point-in-time recovery and PgBouncer in transaction mode.
- `redis-queue` (BullMQ + rate limits; AOF everysec, `noeviction`, replica) and `redis-cache` (cache + pub/sub; `allkeys-lru`). See §12.
- Cloudflare R2 with versioning and cross-bucket replication for uploads and receipts.
- Staging: separate host(s), separate databases and Redis; same config shape as production, smaller sizes.
- If the client declines the budget, the single-host fallback (tested rebuild ≤ 2 h) is recorded in DECISIONS with the accepted risk.

**Targets.** Availability 99.9% per month. RPO ≤ 5 min (Postgres), ≤ 1 min (`redis-queue`). RTO ≤ 1 h. All infrastructure as code (compose files + provisioning scripts in `infra/`); a full host rebuild is rehearsed in P5 and then quarterly.

**Deploy.**
- Docker images built in CI, tagged with the commit SHA, pushed to GHCR, pulled on each host.
- Rolling deploy: one web replica at a time; a replica takes traffic only after `/api/health/ready` passes. Workers drain (§6) before replacement. SSE streams send a jittered `retry:` before close (§7).
- Rollback = redeploy the previous image tag. Rehearsed at every phase end from P0-15.

**Migrations at scale.**
- Expand-only per release (expand → migrate → contract across releases), so the previous image always runs against the new schema.
- Migrations run as a release step before switching traffic, with `lock_timeout = 5s` and a `statement_timeout`.
- Indexes on existing tables use `CREATE INDEX CONCURRENTLY` in a non-transactional migration.
- Backfills run as batched jobs, never inside a migration.
- A migration linter in CI rejects unsafe operations (non-concurrent index on an existing table, volatile default on a large table, column drop in the same release as its last use).

**Secrets.** Production secrets live in a secrets manager or GitHub Environments; on hosts only as root-only files. Never in the repo. Keys are separate per purpose (SECURITY §7).

**Backups.** Managed Postgres PITR + nightly logical dump to R2 (encrypted), retained 35 days. Restore drill monthly in an isolated DR environment (not staging).

- Staging is protected with HTTP basic auth + `noindex` so client demos are private.

## 10. Third-party services

The human creates accounts; you write the integration and document the exact env vars in `.env.example`.

Free tiers are for development and staging only. At launch every service that carries production traffic is on a paid tier with quota alerts at 70%.

| Service | Purpose | Tier at launch |
|---|---|---|
| App + worker hosts (London) | Web replicas, workers, Caddy (§9) | Paid, ≥ 2 app hosts + worker host |
| Managed Postgres (London/EU) | Database with HA standby, PITR, PgBouncer | Paid |
| Managed or self-hosted Redis | `redis-queue` (with replica) + `redis-cache` | Paid |
| Cloudflare | DNS, CDN, WAF, R2, Turnstile, Tunnel / Authenticated Origin Pulls | Paid plan if WAF/bot rules require it; R2 pay-per-use |
| Resend (primary) / Brevo (secondary) | Email | Paid tier (primary); secondary account active for failover |
| Google Cloud | OAuth client, (optional) Places / Business Profile APIs | Pay-per-use with budget alert |
| AI provider | Review help | Pay-per-use with budget alert |
| Sentry | Errors | Paid, quota alert |
| Logs / metrics / traces backend | Off-host logs (30 days), metrics, traces, alerting | Paid or self-hosted |
| Umami / PostHog | Analytics | Self-hosted / paid EU |
| GitHub | Repo, Actions, GHCR, Environments | Paid if Actions minutes or protection rules require it |
| Google Play Console | Android app | One-time fee |
| postcodes.io | Postcode → lat/long | Free, no key |

- Cost: a monthly cost model per 1,000 shops is maintained in P5-12 and updated when a tier changes.
- Every paid provider has a budget alert routed to the on-call channel.

## 11. Observability

Built in P0-13 (not P5).

- Structured logs (pino) with request IDs; never log tokens, phone numbers, emails, codes. Logs shipped off-host; 30-day retention.
- Metrics via OpenTelemetry, Prometheus-compatible: HTTP rate, latency and errors per route; DB pool usage; queue depth and lag; job failures; SSE connections; outbox age. Traces for requests and jobs.
- Health split: `/api/health/live` (public, process up, no detail) and `/api/health/ready` (internal only: DB, Redis, queue lag; used by the load balancer and deploys). Uptime monitor on staging and production.
- Sentry for web + worker, release tags per deploy; paid tier at launch with a quota alert.
- Dashboards: one per SLO. Alerts routed to an on-call channel (on-call rota is a human task before launch).
- Admin "System" page: queue depths, failed jobs, last backup time.

**SLOs.**

| SLO | Target |
|---|---|
| Availability | 99.9% per month |
| Approve → points credited on the customer screen | p95 < 2 s |
| SSE delivery | p95 < 3 s |
| Sign-in email sent | p95 < 30 s |

**Error-budget policy.** When a month's error budget is spent, feature work pauses and the next tasks are reliability work until the SLO is back within budget. The pause is recorded in PROGRESS.

**Runbook.** `docs/RUNBOOK.md` is created in P0-13 with: deploy, rollback, restore, Redis loss, key leak, email provider outage. Each phase extends it for what it added.

## 12. Scale plan

- Stateless web containers; scale horizontally behind Caddy.
- Read-heavy public pages cached at Cloudflare; offers feed cached 60s; shop landing 60s for anonymous. Cached routes use the static hash-based CSP, never a nonce (§5).
- DB: PgBouncer in transaction mode; read replica when analytics load grows. Session-level state is never relied on (RLS settings use `SET LOCAL` inside the transaction).
- Connection budget: (web replicas × pool size) + (workers × pool size) ≤ 80% of Postgres `max_connections`. Checked at boot from config; documented per environment in `infra/`.
- Fan-out via queues, never in request.

**Redis split.**

| Instance | Holds | Config |
|---|---|---|
| `redis-queue` | BullMQ queues, rate-limit counters | AOF everysec, `maxmemory-policy noeviction`, replica, password + TLS + key prefix (staging/prod) |
| `redis-cache` | Cache, pub/sub (SSE fan-out) | `allkeys-lru`, no persistence needed, password + TLS + key prefix (staging/prod) |

Dev and staging run the same two-instance split (two containers locally).

**Rate-limiter fail modes** (when `redis-queue` is unreachable):
- Auth and money endpoints (sign-in, magic link, 2FA, approve, redeem, claim confirm, points request) fail CLOSED with a friendly 503 and `Retry-After`.
- Public reads fail OPEN; Cloudflare rate rules are the backstop.
- Both modes have tests.

### 12.1 Capacity model

Planning numbers until the client confirms them (H-21):

| Dimension | Planning number |
|---|---|
| Shops | 2,000 |
| Members | 500,000 |
| Peak request rate | 300 req/s |
| Concurrent SSE connections | 20,000 |
| Announcement fan-out | 100,000 members in < 10 min |
| Scan spike on one shop | 50 scans/s |

Performance targets: actions p95 < 300 ms, p99 < 800 ms; page server time p95 < 800 ms; errors < 0.5% (< 1% during failover, no lost jobs); queue lag < 60 s; SSE delivery p95 < 3 s.

Load tests (details in TESTING.md): k6 smoke against staging at every phase end; first full load test at P2-16; release load test at P5-11 at 2× forecast peak for 30 min, a 2 h soak at peak, a 5× spike, and failover (kill one app host and the Redis primary during load), on a dataset seeded at 12-month forecast volume.
