# Security — Moz Rewards

Target: guided by **OWASP ASVS 5 Level 2**, OWASP Top 10, OWASP API Security Top 10. Treat this file as a checklist: each item is implemented, tested and ticked in the phase where it first applies (see PHASES.md). Run `/security-review` after every task group touching server code.

Ticked only with evidence (test name or command); unticked items are open.

Sections: [1 Threat model](#1-threat-model) · [2 Authentication](#2-authentication) · [3 Authorisation](#3-authorisation) · [4 Input, output, injection](#4-input-output-and-injection) · [5 Sessions, CSRF, headers](#5-sessions-csrf-and-headers) · [6 Abuse and rate limits](#6-abuse-and-rate-limits) · [7 Data protection](#7-data-protection) · [8 Files](#8-files-and-uploads) · [9 Third parties and AI](#9-third-parties-and-ai) · [10 Supply chain and CI](#10-supply-chain-and-ci) · [11 Infrastructure](#11-infrastructure) · [12 Logging and incidents](#12-logging-audit-and-incidents) · [13 Pre-launch](#13-pre-launch-checklist) · [14 Library security configuration](#14-library-security-configuration) · [15 Large-organisation controls](#15-large-organisation-controls)

---

## 1. Threat model

Top risks, in order:
1. **Cross-shop data access** (BOLA/IDOR): staff of shop A reading or changing shop B's customers, requests, offers.
2. **Points fraud**: fake requests, staff collusion, replayed approvals, game score cheating, referral farming.
3. **Account takeover**: magic-link interception, session theft, weak staff/admin credentials.
4. **Marketplace abuse**: scams, illegal items, scraping seller phone numbers.
5. **Data exposure**: phone numbers, emails, birthdays in logs, exports, share cards, error messages.
6. **Supply-chain**: compromised npm packages.
7. **Availability**: abusive traffic on public endpoints (scan pages, offers feed).

## 2. Authentication

- [ ] Customers: Google OAuth (state + PKCE) and email magic links (single-use, 15 min, bound to the requesting browser where the library supports it; constant-time compare; invalidated on use).
- [ ] Magic link opens a confirm page; the token is consumed only on POST from that page (mail scanners pre-fetch links with GET). A GET never consumes or invalidates the token.
- [ ] Staff and admins: email + password (Argon2id, min 12 chars, breached-password check via k-anonymity API) **and** mandatory TOTP 2FA or passkey. Recovery codes: 10, single-use, stored **encrypted** with the key derived from `AUTH_SECRET` (Better Auth limitation: it stores them encrypted, not hashed) and compared in constant time. Decision recorded in DECISIONS; revisit if the library adds hashing.
- [ ] Staff 2FA enrolment is tied to a single-use invite (built before P2 staff invites). An account cannot enrol a second factor with the password alone.
- [ ] Admin sign-in requires 2FA every session; optional IP allowlist via env.
- [ ] No account enumeration: identical responses/timing for known and unknown emails.
- [ ] Login throttling per account and per IP (exponential backoff after 5 failures); lockout notifications by email.
- [ ] Lockout cannot be used for denial of service: when an account is locked, the next attempt requires a Turnstile challenge instead of a flat refusal; repeated failures from one source lock by account + IP, not the account alone. Every lockout raises an alert.
- [ ] Second-factor failures (TOTP, recovery code, passkey) are counted per user and throttled like password failures.
- [ ] Re-authentication (2FA) for sensitive actions: changing staff roles, exporting customer lists, deleting a shop, admin team changes.
- [ ] Sign-out all devices; session list in Me and in dashboard.
- [ ] Session lifetimes: staff sessions have an **absolute** limit of 12 h from sign-in, admin sessions 2 h from sign-in, checked on every request (activity never extends them). Customer sessions expire after 30 days idle.
- [ ] Staff and admin sign-ins (success and failure) are audit-logged (§12).

## 3. Authorisation

- [ ] Central policy functions in `src/server/authz`: `requireCustomer()`, `requireShopRole(shopId, roles)`, `requireAdminRole(roles)`. Every server action and route handler calls one before any data access.
- [ ] Repositories require a scope parameter; no `findById(id)` without `shopId`/`userId`.
- [ ] Deny by default; explicit allow per action. Staff per-award limit enforced server-side.
- [ ] **Authorisation test matrix** (`tests/authz/`): for every action/route, assert anonymous, customer, staff of another shop, staff (own shop), owner, each admin role → expected allow/deny. Mandatory in CI.
- [ ] Public IDs are unguessable (UUIDv7 internally, random codes publicly); never rely on obscurity for access.
- [ ] "View as shop" for admins is read-only, time-limited, bannered and audit-logged.
- [ ] **Row-Level Security is mandatory** (built in P0, before any P1 table): policies on every shop- and user-scoped table. The scoped-transaction helper sets `SET LOCAL app.shop_id / app.user_id / app.scope` (safe with PgBouncer transaction mode).
- [ ] The web DB role `moz_app` has no `BYPASSRLS`. System jobs that sweep across shops use the worker role `moz_worker` (`BYPASSRLS`) under `SystemScope`, and each run is audit-logged.
- [ ] Cross-shop admin reads use `AdminScope` and write an audit row per read.
- [ ] The authz matrix includes a "bypass the app filter" test per shop-scoped table: a query without the app-level scope filter, run as `moz_app`, returns no rows from another shop (RLS alone blocks it). A new shop- or user-scoped table without a policy fails CI. P5-07 only verifies.

## 4. Input, output and injection

- [ ] Zod validation on every input (body, params, query, headers used); strict schemas (`.strict()`), length limits on all strings, numeric ranges.
- [ ] Drizzle query builder / parameterised SQL only; no string-concatenated SQL.
- [ ] React escaping; **no** `dangerouslySetInnerHTML` except sanitized, admin-authored rich text (DOMPurify) — preferably none.
- [ ] Redirect/return URLs validated against an allowlist of internal paths.
- [ ] No server-side fetching of user-supplied URLs (Google Business link is stored and displayed only, never fetched).
- [ ] Email templates escape all user data; no user data in email headers.
- [ ] CSV exports protected against formula injection (prefix `'` for cells starting with `= + - @`).

## 5. Sessions, CSRF and headers

- [ ] Session cookies: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, rotated on sign-in and privilege change; lifetimes per §2 (customers 30 days idle; staff 12 h and admins 2 h absolute from sign-in).
- [ ] CSRF: Server Actions' built-in origin check + `SameSite`; Route Handlers that mutate verify `Origin` header against allowed origins.
- [ ] Middleware is `proxy.ts` (Next 16). It sets headers and request IDs only. Authorisation never relies on it: every action and route handler calls `src/server/authz` itself (§3).
- [ ] Incoming `x-request-id` is validated: kept only when set by the trusted proxy and well-formed (strict charset, bounded length); otherwise a new ID is generated. A client-chosen or malformed value is never reflected into logs or headers.
- [ ] Prefetch requests (RSC/router prefetch) still receive the static security headers (HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, frame-ancestors). A test asserts this.
- [ ] CSP vs CDN caching: dynamic and signed-in routes use the nonce CSP below. CDN-cached public routes (shop landing `/s/[code]` for anonymous users, offers feed) use a static hash-based CSP with no nonce, so a cached nonce is never reused. Tests cover both. Decided and tested in P1-02.
- [ ] Security headers (set in `proxy.ts` / config): strict CSP with per-request nonces (`default-src 'self'`; scripts nonce-based; `img-src` self + cdn + data/blob; `connect-src` self + required APIs; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`); HSTS (`max-age=63072000; includeSubDomains; preload`); `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` (camera=self for scanner pages only, geolocation=self, others off); `Cross-Origin-Opener-Policy: same-origin`.
- [ ] `/dev/*` routes return 404 in production.

## 6. Abuse and rate limits

Redis sliding-window limits (per IP + per user where signed in). Defaults:

| Endpoint | Limit |
|---|---|
| Magic link request | 5 / hour / email, 20 / hour / IP |
| Staff/admin login | 10 / 15 min / IP, backoff per account |
| Points request | 5 / day / customer / shop, 1 pending |
| AI review help | 5 / day / user |
| Reveal seller number | 20 / day / user |
| Create listing | 3 active, 10 / day |
| Offer claim | 20 / day / user |
| Registration form | 5 / hour / IP + Turnstile |
| All `/api/auth/*` (blanket) | Per-IP Redis limit on every auth route, in addition to the per-route limits above |
| Second factor (TOTP / recovery code) | Counted per user; backoff after 5 failures |
| SSE connections | Per-user and per-shop open-stream caps (ARCHITECTURE §7) |
| Upload URL requests | Per-user limit on presigned URLs; per-user storage quota (P4) |
| Redeem / claim code confirm | Per staff member and per shop attempt limit; backoff on repeated misses |
| Public pages | Cloudflare rate rules + caching |

- [ ] Limiter fail modes when Redis is unreachable: auth and money endpoints (sign-in, magic link, 2FA, points request, approve, redeem, claim confirm) fail CLOSED with a friendly 503 and `Retry-After`; public reads fail OPEN with Cloudflare rules as the backstop. Both have tests.
- [ ] Client IP comes only from `TRUSTED_PROXY` handling. In staging and production, an "unknown" client IP is one strict shared bucket, never a bypass.
- [ ] Redemption and claim codes (6 chars Crockford base32, ~30 bits, crypto-random) are single-use, confirmable only within the issuing shop, and every wrong code counts towards the per-staff and per-shop attempt limit. The limit is set so the chance of guessing any live code in that shop stays below 1 in 1,000,000 per day; a test asserts the limit.
- [ ] Turnstile on registration, magic-link request, reveal number (after 5/day), report forms, and the next attempt on a locked account (§2).
- [ ] Fraud rules (PRODUCT.md §16) run as jobs after awards and game scores.
- [ ] Game scores validated server-side (min duration per score, max score rate); rewards capped.
- [ ] Member QR encodes a short-lived signed token (HMAC, 5 min rotation on screen), not the raw member ID.

## 7. Data protection

- [ ] TLS 1.2+ everywhere; HSTS preload.
- [ ] Encryption at rest by providers; **field-level encryption** (AES-256-GCM, key ID stored with each value for rotation) for phone numbers (customers and listings); HMAC-SHA256 blind index for lookups.
- [ ] Keys are separate per purpose, never one secret reused or derived for several: Better Auth secret; field-encryption data key (with key ID); blind-index key; QR HMAC key; log/IP hash key; VAPID keys. Boot fails if two are equal.
- [ ] Production secrets live in a secrets manager or GitHub Environments; on hosts only as root-only files, never elsewhere on disk.
- [ ] Rotation runbook for every key (in `docs/RUNBOOK.md`) and a tested re-encryption job that moves all encrypted fields to a new key ID (built in P1-04, verified in P5-07).
- [ ] Data minimisation: birthday stored as day+month only; no precise location stored; listing area not full address.
- [ ] The ledger holds no PII: subject is the membership ID only; no names, emails, phones or free text in any ledger column.
- [ ] Share cards, exports and logs never contain phone, email, member ID or tokens.
- [ ] Data export (JSON/CSV) and deletion workflows (PRODUCT.md §17); deletion anonymises the user and customer profile; ledger and audit rows stay (pseudonymous).
- [ ] Retention follows the schedule in COMPLIANCE §2 (each data type has a removal job and a test). Audit logs are removed only by dropping whole monthly partitions.
- [ ] Backups encrypted, retained 35 days; restore drill monthly in an isolated DR environment.

## 8. Files and uploads

- [ ] Presigned PUT with exact content-type and max size; uploads land in a private `incoming/` prefix.
- [ ] Server verifies magic bytes, re-encodes with sharp, strips metadata (EXIF/GPS), rejects animated/oversized/decompression-bomb images (pixel limit).
- [ ] Public files served from a separate origin (`cdn.`) with `Content-Disposition` and correct `Content-Type`; no HTML/SVG uploads.
- [ ] Banner text overlays rendered by us, not uploaded SVG.

## 9. Third parties and AI

- [ ] All third-party API keys server-side only; least-privilege scopes (Google OAuth: `openid email profile`).
- [ ] AI review help: input = stars, chip labels, user note (≤ 500 chars). System prompt forbids inventing details. Output ≤ 60 words, plain text, filtered for URLs/emails/phone numbers. No PII sent beyond the note. Provider can be swapped via interface.
- [ ] Web Push payloads contain no personal data beyond the message text.
- [ ] Analytics: no advertising trackers, IP anonymised, no session replay on authenticated pages.

## 10. Supply chain and CI

- [ ] Lockfile committed; `pnpm install --frozen-lockfile` in CI.
- [ ] Dependency audit (`pnpm audit --prod` + OSV-Scanner) — block on high/critical with a fix available.
- [ ] Static analysis: CodeQL (GitHub) and Semgrep (OWASP + secrets rules) on every push.
- [ ] Secret scanning: gitleaks pre-commit hook + CI.
- [ ] Renovate/Dependabot weekly, grouped minor/patch.
- [ ] SBOM generated per release (CycloneDX).
- [ ] Prefer well-maintained packages; justify each new runtime dependency in DECISIONS.md (one line).
- [ ] Security-relevant dependencies are configured explicitly per §14; adding or upgrading one without its inventory fails review.

## 11. Infrastructure

- [ ] Hosts: SSH key-only, non-root deploy user, UFW (443 from Cloudflare ranges only + SSH from allowlist), unattended security upgrades, fail2ban.
- [ ] Containers run as non-root, read-only filesystem where possible, resource limits.
- [ ] Redis: bound to the private network; password, TLS and a per-environment key prefix are required in staging and production (boot fails without them).
- [ ] Database access only from app and worker hosts (IP allowlist / private networking).
- [ ] Separate DB roles: owner/migrations, `moz_app` (web, no `BYPASSRLS`), `moz_worker` (cross-shop sweeps). Enforced at boot: the app refuses to start if connected as the owner role or a superuser, or if `moz_app` has `BYPASSRLS`.
- [ ] Caddy TLS; HTTP→HTTPS; staging behind basic auth.
- [ ] **Origin lock is mandatory**: the origin is reachable only through Cloudflare (Cloudflare Tunnel or Authenticated Origin Pulls), and the host firewall allows only Cloudflare IP ranges. A check from outside Cloudflare to the origin IP must fail.
- [ ] Cloudflare WAF managed rules and bot rules on.

## 12. Logging, audit and incidents

- [ ] Audit log entries for: sign-ins (staff/admin, success and failure), role changes, approvals/rejections, reversals, redemptions, offer publish, announcements, moderation actions, plan/payment changes, data exports, view-as-shop, admin reads of customer PII (`AdminScope`), cross-shop system sweeps.
- [ ] Audit rows are written in the same transaction as the action they record.
- [ ] Audit log is streamed (at least hourly) to write-once storage (R2 with Object Lock). Each row carries a hash chain (hash of the previous row + its own content); a verification job detects gaps or edits. Admins can export a date range as CSV (formula-injection safe).
- [ ] Alerts: error-rate spike, failed-login spike, account lockouts, fraud flags, queue backlog, outbox age > 2 min, backup failure, provider quota at 70%. All alerts route to the on-call channel.
- [ ] `docs/RUNBOOK.md` is created in P0-13 and extended every phase: deploy, rollback, restore, Redis loss, key leak and rotation, email provider outage, and the incident process (triage, contain, rotate secrets, notify client, ICO notification within 72 hours where required).

## 13. Pre-launch checklist

- [ ] All boxes above ticked or explicitly deferred with a DECISIONS.md entry.
- [ ] Authz matrix 100% passing.
- [ ] OWASP ZAP baseline scan against staging: no High/Medium unresolved.
- [ ] Semgrep/CodeQL/OSV: no unresolved High/Critical.
- [ ] Secrets rotated from staging values; production keys unique.
- [ ] Security headers verified (securityheaders.com grade A or better).
- [ ] Backup restore drill completed in an isolated DR environment (not staging), within the RTO (≤ 1 h).
- [ ] Independent penetration test by a third party completed before launch (not only ZAP); all High/Medium findings fixed or accepted in DECISIONS. Recommend Cyber Essentials Plus to the client.
- [ ] `/.well-known/security.txt` published with a contact and a vulnerability disclosure policy (VDP) page.
- [ ] SECURITY conformance test (§14) passes against the production build.

## 14. Library security configuration

Applies to every security-relevant dependency: auth, sessions, cookies, CSP, rate limiting, uploads, crypto, HTTP clients.

- [ ] The task that adds or upgrades such a dependency inventories its options, endpoints and `NODE_ENV`/production-only branches, and records the inventory in DECISIONS.
- [ ] Every value this file specifies is set explicitly in config. Relying on a library default for a value SECURITY.md specifies is a forbidden shortcut.
- [ ] Better Auth route allowlist test: every route under `/api/auth/*` is on a reviewed list; an unreviewed route fails CI.
- [ ] Unused Better Auth endpoints are disabled (`disabledPaths`).
- [ ] Blanket per-IP Redis limit on all `/api/auth/*` (§6), in addition to per-route limits.
- [ ] SECURITY conformance test, run against the production build in CI: cookie names, flags and Max-Age per role; session limits per role; client IP under spoofed forwarding headers; security headers; rate limits.

## 15. Large-organisation controls

Decide with the client (H-24); build in P5.

- [ ] Admin SSO via the client's identity provider (OIDC), optional.
- [ ] Passkeys mandatory for super admins.
- [ ] Sealed break-glass admin account; any use raises an alert and is audit-logged.
