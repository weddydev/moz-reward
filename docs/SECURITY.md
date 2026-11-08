# Security — Moz Rewards

Target: guided by **OWASP ASVS 5 Level 2**, OWASP Top 10, OWASP API Security Top 10. Treat this file as a checklist: each item is implemented, tested and ticked in the phase where it first applies (see PHASES.md). Run `/security-review` after every task group touching server code.

Sections: [1 Threat model](#1-threat-model) · [2 Authentication](#2-authentication) · [3 Authorisation](#3-authorisation) · [4 Input, output, injection](#4-input-output-and-injection) · [5 Sessions, CSRF, headers](#5-sessions-csrf-and-headers) · [6 Abuse and rate limits](#6-abuse-and-rate-limits) · [7 Data protection](#7-data-protection) · [8 Files](#8-files-and-uploads) · [9 Third parties and AI](#9-third-parties-and-ai) · [10 Supply chain and CI](#10-supply-chain-and-ci) · [11 Infrastructure](#11-infrastructure) · [12 Logging and incidents](#12-logging-audit-and-incidents) · [13 Pre-launch](#13-pre-launch-checklist)

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
- [ ] Staff and admins: email + password (Argon2id, min 12 chars, breached-password check via k-anonymity API) **and** mandatory TOTP 2FA or passkey. Recovery codes (10, hashed, single-use).
- [ ] Admin sign-in requires 2FA every session; optional IP allowlist via env.
- [ ] No account enumeration: identical responses/timing for known and unknown emails.
- [ ] Login throttling per account and per IP (exponential backoff after 5 failures); lockout notifications by email.
- [ ] Re-authentication (2FA) for sensitive actions: changing staff roles, exporting customer lists, deleting a shop, admin team changes.
- [ ] Sign-out all devices; session list in Me and in dashboard.

## 3. Authorisation

- [ ] Central policy functions in `src/server/authz`: `requireCustomer()`, `requireShopRole(shopId, roles)`, `requireAdminRole(roles)`. Every server action and route handler calls one before any data access.
- [ ] Repositories require a scope parameter; no `findById(id)` without `shopId`/`userId`.
- [ ] Deny by default; explicit allow per action. Staff per-award limit enforced server-side.
- [ ] **Authorisation test matrix** (`tests/authz/`): for every action/route, assert anonymous, customer, staff of another shop, staff (own shop), owner, each admin role → expected allow/deny. Mandatory in CI.
- [ ] Public IDs are unguessable (UUIDv7 internally, random codes publicly); never rely on obscurity for access.
- [ ] "View as shop" for admins is read-only, time-limited, bannered and audit-logged.
- [ ] Optional defence in depth (Phase 5): Postgres Row-Level Security on shop-scoped tables using `SET LOCAL app.shop_id` inside transactions — implement if it does not complicate pooling; otherwise log decision.

## 4. Input, output and injection

- [ ] Zod validation on every input (body, params, query, headers used); strict schemas (`.strict()`), length limits on all strings, numeric ranges.
- [ ] Drizzle query builder / parameterised SQL only; no string-concatenated SQL.
- [ ] React escaping; **no** `dangerouslySetInnerHTML` except sanitized, admin-authored rich text (DOMPurify) — preferably none.
- [ ] Redirect/return URLs validated against an allowlist of internal paths.
- [ ] No server-side fetching of user-supplied URLs (Google Business link is stored and displayed only, never fetched).
- [ ] Email templates escape all user data; no user data in email headers.
- [ ] CSV exports protected against formula injection (prefix `'` for cells starting with `= + - @`).

## 5. Sessions, CSRF and headers

- [ ] Session cookies: `__Host-` prefix, `Secure`, `HttpOnly`, `SameSite=Lax`, rotated on sign-in and privilege change; idle timeout 30 days customers, 12 h staff, 2 h admin.
- [ ] CSRF: Server Actions' built-in origin check + `SameSite`; Route Handlers that mutate verify `Origin` header against allowed origins.
- [ ] Security headers (Next middleware): strict CSP with per-request nonces (`default-src 'self'`; scripts nonce-based; `img-src` self + cdn + data/blob; `connect-src` self + required APIs; `frame-ancestors 'none'`; `object-src 'none'`; `base-uri 'self'`); HSTS (`max-age=63072000; includeSubDomains; preload`); `X-Content-Type-Options: nosniff`; `Referrer-Policy: strict-origin-when-cross-origin`; `Permissions-Policy` (camera=self for scanner pages only, geolocation=self, others off); `Cross-Origin-Opener-Policy: same-origin`.
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
| Public pages | Cloudflare rate rules + caching |

- [ ] Turnstile on registration, magic-link request, reveal number (after 5/day), report forms.
- [ ] Fraud rules (PRODUCT.md §16) run as jobs after awards and game scores.
- [ ] Game scores validated server-side (min duration per score, max score rate); rewards capped.
- [ ] Member QR encodes a short-lived signed token (HMAC, 5 min rotation on screen), not the raw member ID.

## 7. Data protection

- [ ] TLS 1.2+ everywhere; HSTS preload.
- [ ] Encryption at rest by providers; **field-level encryption** (AES-256-GCM, key from env, key ID stored for rotation) for phone numbers (customers and listings); HMAC-SHA256 blind index for lookups.
- [ ] Data minimisation: birthday stored as day+month only; no precise location stored; listing area not full address.
- [ ] Share cards, exports and logs never contain phone, email, member ID or tokens.
- [ ] Data export (JSON/CSV) and deletion workflows (PRODUCT.md §17); deletion anonymises ledger rows.
- [ ] Retention: expired listings' contact data deleted after 30 days; audit logs kept 2 years; sessions purged on expiry.
- [ ] Backups encrypted; restore drill monthly.

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

## 11. Infrastructure

- [ ] VPS: SSH key-only, non-root deploy user, UFW (80/443 + SSH from allowlist), unattended security upgrades, fail2ban.
- [ ] Containers run as non-root, read-only filesystem where possible, resource limits.
- [ ] Redis bound to the private Docker network with a password.
- [ ] Database access only from app servers (IP allowlist / private networking), separate DB roles for app and migrations.
- [ ] Caddy auto-TLS; HTTP→HTTPS; staging behind basic auth.
- [ ] Cloudflare WAF managed rules on; origin IP not exposed where possible.

## 12. Logging, audit and incidents

- [ ] Audit log entries for: sign-ins (staff/admin), role changes, approvals/rejections, reversals, redemptions, offer publish, announcements, moderation actions, plan/payment changes, data exports, view-as-shop.
- [ ] Alerts: error-rate spike, failed-login spike, fraud flags, queue backlog, backup failure.
- [ ] Incident runbook in `docs/RUNBOOK.md` (create in Phase 5): triage, contain, rotate secrets, notify client, ICO notification within 72 hours where required.

## 13. Pre-launch checklist

- [ ] All boxes above ticked or explicitly deferred with a DECISIONS.md entry.
- [ ] Authz matrix 100% passing.
- [ ] OWASP ZAP baseline scan against staging: no High/Medium unresolved.
- [ ] Semgrep/CodeQL/OSV: no unresolved High/Critical.
- [ ] Secrets rotated from staging values; production keys unique.
- [ ] Security headers verified (securityheaders.com grade A or better).
- [ ] Backup restore drill completed on staging.
- [ ] Recommend independent penetration test and Cyber Essentials Plus to the client (third-party).
