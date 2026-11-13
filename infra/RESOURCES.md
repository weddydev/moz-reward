# VPS resource budget (plan v5)

One Hostinger KVM 4: **4 vCPU, 16 GB RAM, 200 GB NVMe**. Production and staging run as separate Compose projects on this host. Every container has a memory limit (`mem_limit` / `deploy.resources.limits.memory`); staging also has CPU limits so it can never starve production. The P0-15 compose files must match this table; change both together.

## Memory

| Stack | Container | Limit | Notes |
|---|---|---|---|
| Production | postgres (17 + PostGIS; app + Umami databases) | 4.5 GB | `shared_buffers` 2 GB, `effective_cache_size` 6 GB, `work_mem` 16 MB, `max_connections` 100 (budget, P0-20 per-role pools: (2 web + 1 deploy overlap) × 14 (app 10 + auth 4) + 1 worker × 12 (app 4 + system 8) + 15 reserved = 69 ≤ 80, checked at boot) |
| Production | web ×2 | 1 GB each (2 GB) | Node `--max-old-space-size=768`; pool 10 each |
| Production | worker (+ outbox relay) | 1.5 GB | image (sharp) and PDF jobs; pool 10 |
| Production | redis-queue | 512 MB | `maxmemory 384mb`, `noeviction`, AOF everysec |
| Production | redis-cache | 384 MB | `maxmemory 256mb`, `allkeys-lru` |
| Production | caddy | 128 MB | |
| Production | cloudflared | 128 MB | Tunnel for production hostnames |
| Production | umami | 384 MB | uses the production Postgres (own database) |
| **Production total** | | **≈ 9.5 GB** | |
| Staging | postgres | 1 GB | `shared_buffers` 256 MB, `max_connections` 80 (connection budget, P0-20: (2 web + 1 deploy overlap) × 14 + 1 worker × 12 + 5 reserved = 59 ≤ 64 = 80% — checked at boot; idle connections cost a few MB each) |
| Staging | web ×2 | 512 MB each (1 GB) | two replicas so rolling deploys are rehearsed on staging |
| Staging | worker | 768 MB | |
| Staging | redis-queue | 256 MB | `maxmemory 192mb`, `noeviction`, AOF |
| Staging | redis-cache | 192 MB | `maxmemory 128mb`, `allkeys-lru` |
| Staging | caddy | 64 MB | basic auth, noindex |
| Staging | cloudflared | 64 MB | Tunnel for `staging.<domain>` |
| **Staging total** | | **≈ 3.3 GB** | may be stopped after launch when not in use |
| Host | OS, Docker, page cache, backup jobs (pg_dump, wal-g, age) | ≈ 3.2 GB headroom | 4 GB swap configured; alert if swap use > 1 GB sustained |
| **Total limits** | | **≈ 12.8 GB of 16 GB** | |

Connection budget (checked at boot, ENGINEERING §6; per-role pools since P0-20): production web 14 × 2 + worker 12 (+ deploy overlap 14, Umami and admin 15 reserved) = 69 ≤ 80% of 100.

## CPU

- Production: no CPU limits (it owns the host).
- Staging: `cpus` 1.5 in total across its containers (web 0.4 each, worker 0.25, postgres 0.25, caddy/cloudflared/redis-queue/redis-cache 0.05 each; `infra/compose/staging.yml`); k6 smoke against staging never runs while production serves real users.

## Disk (200 GB)

- Postgres data: production + staging, alert at 80% disk (health job).
- WAL: local retention capped (archive to R2 via wal-g; never let `pg_wal` grow unbounded).
- Docker images: last 3 production images + staging images; prune older ones in the deploy job.
- Logs: JSON logs rotated, 30 days.

## When to move to the scale path

Triggers (ARCHITECTURE §12.1): CPU > 70% or RAM > 80% sustained for 1 h at peak → bigger VPS first; DB CPU > 70% sustained or DB size > 60% of disk → managed Postgres; p95 over target at peak after a bigger VPS → second app host; connections > 80% of max → PgBouncer + read replica.
