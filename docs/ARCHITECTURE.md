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
| Database | PostgreSQL 16+ with PostGIS | Managed (Neon or Supabase, EU/UK region) |
| ORM / migrations | Drizzle ORM + drizzle-kit | SQL migrations committed |
| Auth | Better Auth (Drizzle adapter) | Google OAuth, magic link, TOTP 2FA, passkeys (staff/admin), email+password (staff/admin only, Argon2id). If a required capability is missing at kickoff, fall back to Auth.js and log the decision |
| Cache / rate limit / queues | Redis 7 + BullMQ | Self-hosted on the app server |
| Realtime | Server-Sent Events (Route Handler) + Redis pub/sub | No third-party realtime service |
| Email | Resend (or Brevo) | React Email templates |
| Push | Web Push (VAPID) via `web-push` | Works in browsers, Android TWA, iOS Home Screen PWAs |
| Object storage | Cloudflare R2 (S3 API) | Served via Cloudflare on a separate domain (`cdn.`) |
| Images | `sharp` in the worker | Re-encode to AVIF/WebP, strip EXIF |
| PDF | Server-rendered (e.g. `@react-pdf/renderer`) in the worker | Receipts, invoices, posters |
| Share images | Satori/`@vercel/og`-style rendering | PNG cards |
| AI review help | Gemini Flash-class or similar low-cost model via server-only API | Behind a provider interface |
| Bot protection | Cloudflare Turnstile | Forms and sign-in |
| Analytics | Self-hosted Umami or PostHog (EU) | No advertising trackers |
| Errors | Sentry (free tier) | PII scrubbing on |
| Testing | Vitest, Testing Library, Playwright, axe-core, k6, Lighthouse CI | See TESTING.md |
| Android app | Bubblewrap Trusted Web Activity | Google Play |
| Hosting | One VPS in London (Docker Compose: web, worker, redis, caddy) | Staging and production on separate VPS or separate compose projects |
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

## 3. Code conventions

- Domain logic in `server/services` as plain functions taking explicit inputs; no framework imports; 90%+ unit-test coverage for loyalty, offers, plans, fraud rules.
- Every server action / route handler: (1) authenticate, (2) authorise via `server/authz`, (3) validate input with Zod, (4) call a service, (5) return typed result. Template in `src/server/actionTemplate.ts`.
- Repos never accept a bare entity ID without a scope (`shopId`, `userId`).
- Money stored as integer pence; points as integers; times as `timestamptz` (UTC), business rules computed in `Europe/London` via `src/lib/time.ts`.
- IDs: UUIDv7 primary keys; public short codes (shop code, member ID, claim codes) generated with crypto-random Crockford base32 and uniqueness retry.
- Errors: typed `AppError(code, message, status)`; user-facing messages friendly; no stack traces to clients.
- Feature flags: `feature_flags` table + env overrides (Google Business replies, AI help, game rewards).
- Conventional Commits; small PR-sized commits on `main` (trunk-based) with CI green.

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
- **point_requests**: id, membership_id, status (pending/approved/rejected/expired), requested_at, decided_at, decided_by, amount_pence, items (jsonb), reject_reason, source (request/scan), idempotency_key (unique)
- **ledger_entries** (append-only): id, membership_id, type, points, program_version, request_id, ref (jsonb), created_by, created_at — never updated or deleted (DB trigger blocks UPDATE/DELETE)
- **rewards**: id, membership_id, kind (milestone/main/game/other), label, unlocked_at, redeemed_at
- **redemption_codes**: id, reward_id or offer_claim_id, code, expires_at, confirmed_by, confirmed_at
- **receipts**: id, request_id, number, pdf_url, data (jsonb)
- **feedback**: id, membership_id, rating, chips (text[]), note, ai_used, posted_google_clicked, created_at · **feedback_replies**
- **offers**: id, shop_id, kind (shop/daily_drop), title, description, terms, banner_url, starts_at, ends_at, audience (jsonb), status
- **offer_claims**: id, offer_id, user_id, code, claimed_at, confirmed_at · **saved_offers** · **private_offers** (offer_id, user_id, status accepted/skipped)
- **announcements**: id, shop_id, title, body, scheduled_for, sent_at
- **notifications**: id, user_id, kind, title, body, data, read_at · **push_subscriptions**: id, user_id, endpoint, keys, ua, last_seen
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
- **audit_logs** (append-only): id, actor_id, actor_role, action, entity, entity_id, meta, ip_hash, at
- **feature_flags**, **content_settings** (chips, keywords, templates, categories)

Indexes: every FK; `memberships(user_id, shop_id)` unique; `point_requests(membership_id) WHERE status='pending'` partial unique; `offers(shop_id, kind, starts_at)`; GiST on `shops.location`; `listings(status, category, created_at)`.

## 5. Key flows

**Scan → landing**: `/s/[code]` (RSC, CDN-cached per shop for 60s for anonymous users) → client shows Gilded Gate if `src` present → CTA "Collect points" → sign-in if needed (return URL validated) → membership upsert → shop page.

**Points request**: customer action `requestPoints(shopId, idemKey)` → checks (membership, pending limit, daily cap, plan state) → insert `point_requests` → publish `shop:{id}:requests` on Redis → SSE to dashboard. Customer page subscribes to `user:{id}:events`.

**Approve**: staff action `approveRequest(requestId, amount, items)` → authz (staff of that shop, limit) → transaction: lock request row, compute points (program version, happy hour by `requested_at`, streak), insert ledger entries, update membership counters, unlock rewards/milestones, create receipt row → commit → enqueue: receipt PDF, push, referral check, fraud rules → publish `user:{id}:events` (`points_credited`) → customer celebration.

**Redeem**: customer `createRedemptionCode(rewardId)` → code (15 min) → staff `confirmRedemption(code)` within own shop → reward marked redeemed → event to customer.

**Daily Drop limit**: unique index on `(shop_id, kind='daily_drop', local_date)` (generated column using Europe/London date).

## 6. Background jobs

BullMQ queues in `src/worker/`: `notifications` (push + inbox fan-out in batches of 500), `email`, `images`, `pdf`, `share-cards`, `fraud`, `scheduled`. Repeatable schedules (Europe/London): request expiry (every 5 min), Daily Drop expiry (00:00), saved-offer reminders (hourly + 17:00), birthday suggestions (06:00), win-back suggestions (06:30), monthly recap (1st, 09:00), weekly owner email (Mon 09:00), plan state transitions + reminders (07:00), listing expiry (hourly), points expiry (daily), data-request deadlines (daily), backups verification (daily).

All jobs idempotent, with retries + exponential backoff and a dead-letter queue visible in super admin (simple table).

## 7. Realtime

- SSE endpoints: `/api/sse/shop/[shopId]` (staff only) and `/api/sse/me` (customer). Heartbeat every 25s. Redis pub/sub fan-out so multiple web containers work.
- Clients reconnect with backoff and refetch state on reconnect (SSE is a hint, DB is truth).

## 8. Files and images

- Uploads: client requests a presigned PUT URL (`/api/uploads`) with declared type/size → upload to R2 `incoming/` → server enqueues `images` job → sharp validates magic bytes, re-encodes (AVIF + WebP), strips EXIF, generates sizes → moves to `public/` path → DB updated. Originals deleted.
- Limits: images ≤ 8 MB in, JPEG/PNG/WebP/HEIC only; max 5 per listing, 6 per shop gallery.
- Served from `cdn.<domain>` (separate origin) with long cache and content hashes.

## 9. Environments and deployment

| Env | URL | Deploys | Data |
|---|---|---|---|
| Local | localhost:3000 | `pnpm dev` + Docker (postgres, redis) | Seed |
| Staging | `staging.<domain>` | Auto on every green push to `main` | Seed demo data, reset weekly |
| Production | `<domain>` (+ `cdn.`) | Git tag `v*` + manual approval in GitHub | Real |

- Docker images built in CI, pushed to GHCR, pulled on the VPS; `docker compose up -d` with zero-downtime (two web replicas behind Caddy, health checks).
- Migrations run as a release step before switching traffic; must be backward-compatible (expand → migrate → contract).
- Secrets in GitHub Environments + server `.env` (root-only perms). Never in the repo.
- Backups: managed Postgres point-in-time recovery + nightly logical dump to R2 (encrypted), restore drill monthly.
- Staging is protected with HTTP basic auth + `noindex` so client demos are private.

## 10. Third-party services

The human creates accounts; you write the integration and document the exact env vars in `.env.example`.

| Service | Purpose | Tier at launch |
|---|---|---|
| VPS (London) | App, worker, Redis, Caddy | Small paid |
| Neon / Supabase | Postgres | Free → paid when needed |
| Cloudflare | DNS, CDN, R2, Turnstile | Free |
| Resend / Brevo | Email | Free tier |
| Google Cloud | OAuth client, (optional) Places / Business Profile APIs | Free usage |
| AI provider | Review help | Free tier / pay-per-use |
| Sentry | Errors | Free |
| Umami / PostHog | Analytics | Free / self-hosted |
| GitHub | Repo, Actions, GHCR | Free / low |
| Google Play Console | Android app | One-time fee |
| postcodes.io | Postcode → lat/long | Free, no key |

## 11. Observability

- Structured logs (pino) with request IDs; never log tokens, phone numbers, emails, codes.
- `/api/health` (DB, Redis, queue lag). Uptime monitor on staging and production.
- Sentry for web + worker, release tags per deploy.
- Admin "System" page: queue depths, failed jobs, last backup time.

## 12. Scale plan

- Stateless web containers; scale horizontally behind Caddy.
- Read-heavy public pages cached at Cloudflare; offers feed cached 60s; shop landing 60s for anonymous.
- DB: connection pooling (Neon pooler / PgBouncer); read replica when analytics load grows.
- Fan-out via queues, never in request.
- Load test targets (TESTING.md): 2,000 concurrent users mixed traffic, p95 < 300ms for API actions, error rate < 0.5%.
