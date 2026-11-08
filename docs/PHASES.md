# Delivery phases — Moz Rewards

Six build phases (about one week each), then a stabilisation period. Every phase ends on **staging** with a client demo. Tick tasks here as you finish them (`- [x]`). Work top to bottom inside a phase unless a dependency says otherwise.

Phase index: [P0 Foundation](#p0--foundation-and-design-system-week-1) · [P1 Core loyalty](#p1--core-loyalty-week-2) · [P2 Shop + admin core](#p2--shop-dashboard-registration-and-admin-core-week-3) · [P3 Engagement](#p3--engagement-week-4) · [P4 Marketplace, game, trust](#p4--marketplace-game-moderation-fraud-week-5) · [P5 Hardening and release](#p5--hardening-pwa-play-store-release-candidate-week-6) · [S Stabilisation](#s--stabilisation-and-launch)

Every phase's definition of done includes: `pnpm check` green, CI green, staging deployed, PHASES ticks updated, PROGRESS.md updated, `progress/DEMO_NOTES.md` written via `/demo`.

---

## P0 — Foundation and design system (week 1)

- [x] Confirm the Emil Kowalski skills are present in `.claude/skills/` (`emil-design-eng`, `animation-performance`, `mobile-native`, `review-animations`); if missing, add a 🔴 task to `progress/HUMAN_TASKS.md` asking the human to run the install commands in README
- [x] Scaffold Next.js (App Router, TS strict), pnpm, ESLint, Prettier, Vitest, Playwright, path aliases; scripts from CLAUDE.md §6
- [x] Docker Compose for local Postgres (PostGIS) + Redis; `.env.example` complete
- [x] Drizzle setup, first migration (users/auth tables, customer_profiles, shops, shop_staff, memberships, audit_logs, feature_flags)
- [x] Auth: customer Google OAuth + magic link; staff/admin email+password + mandatory TOTP; session helpers; `server/authz` policies; action template
- [x] Authz test harness (`tests/authz/`) with the role matrix pattern
- [x] Design tokens, fonts (Fraunces + Manrope via next/font), Tailwind theme, globals, reduced-motion handling
- [x] UI primitives (DESIGN.md §6) + `/dev/ui` gallery
- [ ] Motion primitives: page transition wrapper (View Transitions + fallback), press feedback, sheet/modal, skeletons; `/dev/motion` gallery skeleton
- [ ] Sound module (Web Audio synthesis, unlock on first gesture, toggle) + haptics helper
- [ ] App shells: customer (mobile bottom nav + desktop rail), shop dashboard (sidebar + mobile nav), admin (sidebar) with placeholder pages
- [ ] Security headers + CSP nonce middleware; rate-limit utility (Redis); Turnstile component
- [ ] GitHub Actions CI (typecheck, lint, unit, integration, build, Semgrep, gitleaks, OSV)
- [ ] Staging infra: Dockerfile(s), compose for staging, Caddy, deploy workflow, basic auth on staging, `/api/health`, Sentry
- [ ] Seed script (demo shops, customers) — expanded each phase

**Demo 1:** design system gallery on staging; sign in as customer (Google + email link), as shop owner and admin (with 2FA); all three portal shells navigable on phone and desktop; page transitions and press feedback visible.

## P1 — Core loyalty (week 2)

- [ ] Shop codes, QR generation, NFC tag records; `/s/[code]` landing (RSC, cached) per DESIGN screen 1
- [ ] **Gilded Gate** entry animation (DESIGN §8.1) with skip + reduced motion
- [ ] Sign-in return flow + membership auto-join + Complete profile (name, phone encrypted, birthday, opt-in) + member ID
- [ ] Wallet (screen 3) with sorting rules, summary strip, pull-to-refresh
- [ ] Shop page (screen 4) with Directions/Call, hours, Open now
- [ ] Loyalty programme model + default templates + basic programme settings page in dashboard
- [ ] **Ingot component** + pour-on-view (DESIGN §8.3); Gold Vault page (screen 5)
- [ ] Points request action + limits + expiry job; SSE infra (`/api/sse/me`, `/api/sse/shop/[id]`) with Redis pub/sub
- [ ] Approve/reject actions with ledger transaction, idempotency, happy-hour-ready calculation hook, streaks, milestones, overflow; receipts rows
- [ ] **Points credited** (DESIGN §8.2), **Reward unlocked** (§8.4), **Receipt generated** (§8.5) moments
- [ ] Member QR (signed rotating token) on Me + shop page; offline caching of member card
- [ ] Rewards + redemption codes (§8.6) + staff confirmation
- [ ] Unit tests for all loyalty services; integration test request→approve→ledger; authz matrix for new actions
- [ ] E2E journeys 1–3

**Demo 2:** scan a printed QR on a phone → Gilded Gate → sign in → request points → approve from the dashboard on a laptop → celebration and ingot pour on the phone → fill an ingot → redeem.

## P2 — Shop dashboard, registration and admin core (week 3)

- [ ] Dashboard home (screen 15) with live queue, KPIs, sparklines
- [ ] Requests page (screen 18) + approve side panel + member QR scanning (BarcodeDetector + lazy fallback)
- [ ] Customers table + segments + customer profile (screen 16) + notes
- [ ] Staff management (invite, roles, per-award limit, deactivate)
- [ ] Shop settings: profile, photos (upload pipeline v1), hours, closures, location pin via postcode, Google Place ID, VAT details
- [ ] QR & NFC kit: poster + table tent PDFs (worker)
- [ ] Public registration page (screen 14) + Turnstile + confirmation email
- [ ] Admin: overview (screen 19), applications + review/activation (screen 20), record payments, plans, invoices PDF, plan state machine + reminder jobs + restricted mode
- [ ] Admin: shops list/detail, view-as-shop (read-only, logged), customers lookup, team management with 2FA status, audit log viewer
- [ ] Email templates (React Email): magic link, invites, application received, activation, plan reminders
- [ ] Tests: plan state machine units, authz matrix for all dashboard/admin actions, E2E journeys 4, 10, 11

**Demo 3:** a new café applies on the registration page → admin records payment and activates → owner receives invite, signs in with 2FA, sets hours and photos, prints the QR poster → staff approve requests from the requests page and by scanning a member QR.

## P3 — Engagement (week 4)

- [ ] Rate your visit (screen 6) with chips, AI help (provider interface + rate limit), Google hand-off, private feedback; low-rating alert; feedback inbox + replies
- [ ] Compliance test: identical review actions for ratings 1–5
- [ ] Offers: model, create offer (screen 17) with banner builder templates, Daily Drop limit + repost, claims + staff confirm, end early
- [ ] Offers feed (screen 7) with search, categories, Near me (postcodes.io + PostGIS), featured slots; offer detail (screen 8); saved offers + reminders
- [ ] Private offers (one customer / segment) with Accept/Skip
- [ ] Notifications: inbox (screen 13), Web Push (VAPID) subscribe flow incl. iOS Home Screen explanation, preferences, per-shop mute; email notifications
- [ ] Announcements with 2-per-7-days cap + scheduling
- [ ] Happy hour windows + multiplier applied by `requested_at` + badges
- [ ] Suggestions inbox: birthday + win-back jobs, send/edit/skip
- [ ] Referrals with caps and self-referral guard
- [ ] Share cards (reward, ingot, recap) + Web Share/download; monthly recap job; weekly owner email job
- [ ] Featured slots admin
- [ ] Tests: offers limits, happy hour (incl. DST), caps, referral rules; E2E journeys 5–8

**Demo 4:** rate a visit both low and high (same options), use AI help, post to Google; shop publishes a Daily Drop with a template banner and it appears in Offers near me; happy hour doubles gold; birthday and win-back suggestions sent from the inbox; push notification arrives on Android and on an installed iPhone PWA.

## P4 — Marketplace, game, moderation, fraud (week 5)

- [ ] Marketplace home (screen 9), listing detail (screen 10), create listing (screen 11), my listings, expiry + renew
- [ ] Upload pipeline hardened (magic bytes, re-encode, EXIF strip, pixel limits), separate cdn origin
- [ ] Reveal number with rate limit + logging; safety tips; seller types; 18+ confirmation
- [ ] Prohibited keyword filter + first-3-listings pre-moderation; reports + moderation queue + actions + appeals + strikes
- [ ] Legal templates drafts: Marketplace Rules, Prohibited Items, Reporting and Complaints, OSA risk-assessment template
- [ ] Stack the Gold game (canvas, lazy, 60 fps), personal best, weekly leaderboard per shop, server-side plausibility, optional shop reward with caps
- [ ] Fraud monitor rules + flags UI; content settings (categories, keywords, chips, templates); broadcasts to shops
- [ ] Tests: moderation flows, rate limits, game validation; E2E journey 9

**Demo 5:** list a bike with photos, admin approves it, buyer reveals the number; a prohibited item is held automatically; report and takedown; play Stack the Gold and appear on the shop leaderboard; fraud monitor shows a flagged pattern from seed data.

## P5 — Hardening, PWA, Play Store, release candidate (week 6)

- [ ] PWA: manifest, icons (maskable), service worker (offline shell, member card, wallet snapshot), update prompt; install button everywhere + iOS guide sheet
- [ ] Android TWA with Bubblewrap; Digital Asset Links; Play listing assets (icons, screenshots, short/long descriptions, privacy policy URL) in `twa/listing/`
- [ ] Remaining screens: Me (screen 12) complete, privacy & data (export, delete), help & legal pages (all templates from COMPLIANCE §8)
- [ ] Complete SECURITY.md checklist; optional RLS decision; ZAP baseline clean
- [ ] Performance pass vs DESIGN §12 (judgment rule); image audit; bundle analysis
- [ ] Accessibility pass (axe + keyboard + screen reader spot checks)
- [ ] Visual regression baselines for 20 screens × 2
- [ ] k6 load test on staging; fix bottlenecks
- [ ] Production infra: compose, Caddy, Cloudflare, backups + restore drill, uptime monitors, alerting; `docs/RUNBOOK.md`
- [ ] Release workflow (tag → approval → deploy) dry run to production with maintenance page

**Demo 6 (release candidate):** full walkthrough on a real Android phone (Play internal testing build) and a real iPhone (Safari + installed PWA), desktop dashboard and admin; security, performance and load-test summary.

## S — Stabilisation and launch

- [ ] Client acceptance testing: log feedback in `progress/UAT.md`, triage (bug / polish / change request)
- [ ] Fix bugs and polish; change requests only after human approval
- [ ] Production launch; Play Store production rollout
- [ ] Post-launch monitoring: errors, performance, queues, fraud flags; daily summary in PROGRESS.md for the first two weeks
- [ ] Handover docs: README for operators, environment list, runbook, admin guide
