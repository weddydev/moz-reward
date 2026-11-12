# Delivery phases — task index

This file is the **checklist**. The detail for every task (read list, build notes, acceptance criteria, edge cases, tests, verification) lives in `docs/phases/<phase>.md`. Always open the phase file section for the task you are doing.

Rules (gates are defined once, in TESTING §4):
- Tick `- [x]` only when every acceptance criterion and incoming CARRIED row has evidence from the session (ENGINEERING.md §1), with ≤ 5 evidence lines in SESSION_LOG.md in the same commit.
- **Task:** `pnpm gate:task` (fast: check, integration, production build, the task's E2E on the production build); `security-reviewer` on security-relevant task diffs.
- **Push:** CI runs the full suite on two Chromium projects within the free Actions budget; twice weekly all 5 projects + k6 smoke, weekly ZAP baseline (TESTING §4).
- **Sub-phase:** `/subphase-complete` is light — CI green, staging smoke, Sentry, reviews of unreviewed commits, scoped QA if screens changed. No gate may be "pending".
- **Phase:** `/phase-complete` is the one heavy gate (`pnpm gate:phase`) + DoD + demo; the phase's hardening task is that same run.
- **Phase start:** a brief review fills missing Edge cases / measurable Acceptance criteria in the phase file before its first task.
- No per-phase dates (human, 10 Nov 2026): the one target is everything done by 10 Dec 2026 (CLAUDE.md "Pace").

## P0 — Foundation and design system
Details: [`docs/phases/P0.md`](phases/P0.md)

**P0-A · Repository, tooling, local infrastructure**

- [x] P0-01 · Skills check and repository scaffold
- [x] P0-02 · Local infrastructure and environment validation
- [x] P0-03 · Database foundation
- [x] P0-04 · Background jobs infrastructure
- [x] P0-A closed with `/subphase-complete` (post-push CI/staging completed by P0-14/P0-15 — retro rule)

**P0-B · Security baseline, auth, authorisation**

- [x] P0-05 · Security baseline
- [x] P0-06 · Authentication for all roles
- [x] P0-07 · Authorisation layer, action template, error model
- [x] P0-B closed with `/subphase-complete` (review fixes done; closed 10 Nov 2026: P0-14 CI green on main, run 42682167002)

> **Plan v4 order:** after P0-B comes **P0-E** (production foundation), then P0-C, then P0-D.

**P0-E · Production foundation (do before P0-C and P0-D)**

- [x] P0-17 · Test infrastructure and self-verification tooling
- [x] P0-14 · CI pipeline, gate scripts and production-parity testing
- [x] P0-19 · Auth hardening and library security conformance
- [x] P0-18 · Reliability primitives: outbox, Redis split, failure modes, safe migrations
- [x] P0-20 · Row-Level Security (mandatory)
- [x] P0-13 · Observability, SLOs and runbook
- [x] P0-21 · Compliance foundations (drafts)
- [ ] P0-15 · VPS provisioning, staging stack, deploy without a registry, backups, restore drill, uptime (needs H-06, H-07, H-08, H-26, H-27)
- [x] P0-16 · Demo seeds
- [ ] P0-E closed with `/subphase-complete`

**P0-C · Design system, motion, sound**

- [x] P0-08 · Tokens, fonts, global styles, motion preference
- [x] P0-09 · UI primitives and gallery
- [x] P0-10 · Motion primitives and page transitions
- [x] P0-11 · Sound and haptics
- [x] P0-C closed with `/subphase-complete`

**P0-D · Portal shells**

- [x] P0-12 · App shells, navigation and route groups
- [ ] P0-D closed with `/subphase-complete`

- [ ] P0 closed with `/phase-complete`
- [ ] P0 definition of done met and demo delivered

## P1 — Core loyalty
Details: [`docs/phases/P1.md`](phases/P1.md)

**P1-A · Shops and entry**

- [ ] P1-01 · Shop entities, codes, hours, NFC records
- [ ] P1-02 · Shop landing page `/s/[code]`
- [ ] P1-03 · Gilded Gate entry animation
- [ ] P1-04 · Join flow, profile completion, member ID
- [ ] P1-A closed with `/subphase-complete`

**P1-B · Loyalty engine, Wallet, Vault**

- [ ] P1-05 · Loyalty programme model and basic settings
- [ ] P1-06 · Loyalty engine (pure services)
- [ ] P1-07 · Wallet
- [ ] P1-08 · Ingot component, pour-on-view, Gold Vault page
- [ ] P1-09 · Shop page (customer)
- [ ] P1-B closed with `/subphase-complete`

**P1-C · Requests, approvals, realtime**

- [ ] P1-10 · Realtime (SSE) infrastructure
- [ ] P1-11 · Points requests (customer)
- [ ] P1-12 · Approve / reject, owner approval, reversals, receipts
- [ ] P1-13 · Points expiry job
- [ ] P1-C closed with `/subphase-complete`

**P1-D · Celebrations, member QR, rewards**

- [ ] P1-14 · Member QR and offline member card
- [ ] P1-15 · Celebrations: points credited, reward unlocked, receipt
- [ ] P1-16 · Rewards and redemption
- [ ] P1-17 · Data-integrity reconciliation
- [ ] P1-18 · Phase hardening
- [ ] P1-D closed with `/subphase-complete`
- [ ] P1 closed with `/phase-complete`
- [ ] P1 definition of done met and demo delivered

## P2 — Shop dashboard, onboarding and admin core
Details: [`docs/phases/P2.md`](phases/P2.md)

**P2-A · Shop operations**

- [ ] P2-01 · Dashboard home
- [ ] P2-02 · Requests page and member QR scanning
- [ ] P2-03 · Customers, segments, customer profile, export
- [ ] P2-04 · Staff management
- [ ] P2-05 · Shop settings and upload pipeline v1
- [ ] P2-06 · QR & NFC kit
- [ ] P2-07 · Analytics page
- [ ] P2-A closed with `/subphase-complete`

**P2-B · Onboarding and billing**

- [ ] P2-08 · Public registration page
- [ ] P2-09 · Applications, activation, payments, invoices
- [ ] P2-10 · Plan state machine and restricted mode
- [ ] P2-11 · Email templates
- [ ] P2-B closed with `/subphase-complete`

**P2-C · Admin core**

- [ ] P2-12 · Admin shops: list, detail, suspend, close, view-as-shop
- [ ] P2-13 · Admin customers: lookup, recovery, data requests, blocking
- [ ] P2-14 · Admin QR & NFC batches
- [ ] P2-15 · Admin team, audit log, overview, system page
- [ ] P2-16 · Phase hardening
- [ ] P2-C closed with `/subphase-complete`
- [ ] P2 closed with `/phase-complete`
- [ ] P2 definition of done met and demo delivered

## P3 — Engagement
Details: [`docs/phases/P3.md`](phases/P3.md)

**P3-A · Reviews and feedback**

- [ ] P3-01 · Rate your visit (customer)
- [ ] P3-02 · AI review help
- [ ] P3-03 · Feedback inbox, replies, low-rating alerts, Google summary
- [ ] P3-A closed with `/subphase-complete`

**P3-B · Offers**

- [ ] P3-04 · Offers model, creation, banner builder, Daily Drop rules
- [ ] P3-05 · Offers feed, near me, featured, offer detail
- [ ] P3-06 · Claims, saved offers, reminders, private offers, admin removal
- [ ] P3-B closed with `/subphase-complete`

**P3-C · Notifications and announcements**

- [ ] P3-07 · Notifications: inbox, Web Push, email, preferences
- [ ] P3-08 · Announcements
- [ ] P3-C closed with `/subphase-complete`

**P3-D · Engagement suite**

- [ ] P3-09 · Happy hour gold
- [ ] P3-10 · Suggestions inbox: birthdays and win-back
- [ ] P3-11 · Refer a friend
- [ ] P3-12 · Share cards, monthly recap, weekly owner email
- [ ] P3-13 · Featured slots (admin)
- [ ] P3-14 · Phase hardening
- [ ] P3-D closed with `/subphase-complete`
- [ ] P3 closed with `/phase-complete`
- [ ] P3 definition of done met and demo delivered

## P4 — Marketplace, game, moderation and fraud
Details: [`docs/phases/P4.md`](phases/P4.md)

**P4-A · Marketplace**

- [ ] P4-01 · Listings: create, browse, detail, manage
- [ ] P4-02 · Upload pipeline hardening and CDN origin
- [ ] P4-03 · Reveal number, seller types, 18+ confirmation
- [ ] P4-04 · Moderation: keywords, pre-moderation, reports, actions, appeals, strikes
- [ ] P4-05 · Marketplace legal drafts and OSA risk-assessment template
- [ ] P4-A closed with `/subphase-complete`

**P4-B · Mini game**

- [ ] P4-06 · Stack the Gold game
- [ ] P4-07 · Leaderboards, game rewards, anti-cheat
- [ ] P4-B closed with `/subphase-complete`

**P4-C · Trust and platform settings**

- [ ] P4-08 · Fraud monitor
- [ ] P4-09 · Content settings and broadcasts
- [ ] P4-10 · Phase hardening
- [ ] P4-C closed with `/subphase-complete`
- [ ] P4 closed with `/phase-complete`
- [ ] P4 definition of done met and demo delivered

## P5 — Completeness, hardening, PWA, Play Store, release candidate
Details: [`docs/phases/P5.md`](phases/P5.md)

**P5-A · Customer completeness and installable app**

- [ ] P5-01 · Me, privacy and data, help
- [ ] P5-02 · PWA: manifest, service worker, offline, updates
- [ ] P5-03 · Install flows
- [ ] P5-04 · Android app (Trusted Web Activity) and Play listing
- [ ] P5-A closed with `/subphase-complete`

**P5-B · Legal and compliance completion**

- [ ] P5-05 · Legal pages and cookie notice
- [ ] P5-06 · Compliance audit
- [ ] P5-B closed with `/subphase-complete`

**P5-C · Quality gates**

- [ ] P5-07 · Security checklist completion
- [ ] P5-08 · Performance pass
- [ ] P5-09 · Accessibility pass
- [ ] P5-10 · Visual regression baselines
- [ ] P5-C closed with `/subphase-complete`

**P5-D · Production readiness**

- [ ] P5-12 · Production infrastructure, backups, monitoring
- [ ] P5-11 · Load test (on the production-shaped environment) and cross-device verification
- [ ] P5-13 · Runbook, operator docs, release workflow
- [ ] P5-14 · Release candidate
- [ ] P5-D closed with `/subphase-complete`
- [ ] P5 closed with `/phase-complete`
- [ ] P5 definition of done met and demo delivered

## S — Stabilisation and launch
Details: [`docs/phases/S.md`](phases/S.md)

- [ ] S-01 · Client acceptance testing (UAT)
- [ ] S-02 · Bug fixing and polish
- [ ] S-03 · Launch
- [ ] S-04 · Post-launch monitoring (first two weeks)
- [ ] S-05 · Handover
- [ ] Launch complete and handover done
