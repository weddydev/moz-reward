# UK compliance rules for the build — Moz Rewards

These are product rules the code must enforce. They are not legal advice; the client's solicitor reviews policies before launch. When a feature touches one of these areas, read the section first.

## 1. Reviews (DMCC Act 2024, CMA fake-review guidance CMA208, Google Maps content policy)

- **No review gating.** Every rating (1–5) shows the same two options with equal size, colour weight and order: "Post on Google" and "Send to the shop privately". No extra steps, questions, delays or exit buttons for low ratings. No logic anywhere branches on rating to change what the customer can do.
- **No incentives** for reviews: no points, offers, game plays or entries linked to rating or reviewing.
- **Review-incentive guard** (shops must not reward or punish feedback indirectly):
  - The feedback inbox has no "send offer" or reward action.
  - Star rating is never a customer segment, filter for offers, or offer audience.
  - Any private offer sent to a customer within 14 days of that customer's feedback is flagged to the moderation queue (the offer still sends; moderation reviews the pattern).
- The only rating-dependent behaviour allowed: alerting the shop to low ratings so it can resolve problems. Resolution is never conditional on changing a review.
- AI review help only rephrases the customer's own chips and note; never invents experiences; never defaults to 5 stars; the customer edits before posting.
- Shops cannot delete or hide private feedback.
- We do not publish shop star ratings in the app at launch. If ever added: publish a fake-review policy, show all ratings including negative and recent ones, take reasonable steps against fake reviews.
- Add a test asserting that the review sheet renders identical actions for ratings 1–5.

## 2. Personal data (UK GDPR, DPA 2018, Data (Use and Access) Act 2025)

- Privacy notice explains: what we collect, why, sharing with the joined shop (name, phone, member ID, visit history, birthday day+month if given), retention, rights.
- Data export and deletion available in-app; admin queue tracks deadlines (1 month).
- Minimise: no precise location stored; birthday day+month only; birth year used only for the 18+ flag; phone not shown in share cards or public pages.
- Shops are told (Shop Terms) how they may use customer data (only for their own loyalty/offers, no export for other purposes). Customer list export is owner-only, 2FA re-auth, audit-logged.

**Drafts and review.** Claude drafts the ROPA, DPIA, processor register and retention schedule in task P0-21 under `docs/compliance/`. The client's solicitor reviews them (human task H-23). Code follows the defaults below until the solicitor confirms or changes them.

### 2.1 Controller roles

- **Platform (Moz Rewards) = controller** for accounts, sign-in, security, fraud prevention, the Offers feed, marketplace, game, notifications delivery and admin.
- **Each shop = independent controller** for its member data (membership, visits, notes, its marketing). Shop Terms set this out, with data-sharing terms: purpose limits, security duties, no onward export, help with rights requests, prompt breach notice to each other.
- Privacy notice and Shop Terms state these roles in plain words.

### 2.2 ROPA and lawful basis

The ROPA lists every purpose. Lawful basis per purpose (draft, solicitor to confirm):

| Purpose | Lawful basis | Controller |
|---|---|---|
| Account, sign-in, profile | Contract | Platform |
| Loyalty membership, points, rewards, receipts | Contract | Shop (platform delivers) |
| Marketing push / inbox from shops (never email) | Consent (`marketing_opt_in`) | Shop |
| Transactional messages | Contract | Platform / shop |
| Fraud and abuse prevention, device signals | Legitimate interests (LIA in DPIA) | Platform |
| Security, audit and application logs | Legitimate interests; legal obligation where it applies | Platform |
| Private feedback, AI review help | Contract (feature the customer chooses) | Platform; shop for feedback it receives |
| Marketplace listings, reveal logs, reports | Contract; legitimate interests (safety) for reveal logs | Platform |
| Game and leaderboard | Contract; consent for leaderboard display (opt-in) | Platform |
| 18+ flag (birth year), 13+ declaration | Legitimate interests (child safety) | Platform |
| Birthday treats | Consent (optional field + marketing opt-in) | Shop |
| "Near me" location | Consent on tap; never stored | Platform |
| First-party analytics | Legitimate interests (statistical purposes, with opt-out) | Platform |
| Shop applications, plans, invoices | Contract; legal obligation (accounting) | Platform |
| Rights requests and complaints | Legal obligation | Platform |

### 2.3 Processor register

Each processor is listed with: purpose, data categories, location, transfer basis, DPA signed (yes/no), sub-processors link. Transfer basis is one of: UK adequacy (incl. EU/EEA and the UK–US data bridge for certified US companies), IDTA, or the UK Addendum to the EU SCCs. No processor goes live without an entry.

Processors to register:

| Processor | Purpose | Notes |
|---|---|---|
| Hostinger | VPS host for the app, worker, Postgres, Redis, logs and Umami (production and staging) | Server located in the UK; confirm the contracting entity and any support-access locations in its DPA |
| Cloudflare | DNS, CDN, Tunnel, WAF, Turnstile, R2 (uploads and encrypted backups) | Backups are encrypted before upload; retained 35 days |
| Resend, Brevo | Email (primary, failover) | Transactional and auth mail only; marketing is never emailed (§3) |
| Sentry | Error monitoring | PII scrubbing on; choose the EU data region at sign-up where offered |
| UptimeRobot | Uptime monitoring | Receives public URLs and the developers' contact details only; no customer data |
| Google | OAuth sign-in; Gemini API (review help); Business Profile API only if that optional feature is enabled | Gemini on **paid** services only: UK users may only use paid services, and paid terms do not use prompts or responses to improve Google's products. Minimal input (stars, chips, note) |
| GitHub | Code and CI only | No production personal data; staging and test data are synthetic |

Umami analytics is self-hosted on our VPS, so it adds no processor. postcodes.io receives postcodes only and is noted as a third party, not a processor.

### 2.4 DPIA

A DPIA is completed **before Phase 1 goes live** to real customers. It covers at least: fraud monitoring and device signals, children and age checks, AI review help, marketing notifications, marketplace reveal logs. It is updated when a feature changes the risk.

### 2.5 Complaints (Data (Use and Access) Act 2025)

- A data protection complaints process: in-app and email route, acknowledgement within 30 days, decision without undue delay, records kept.
- The privacy notice explains how to complain to us and then to the ICO.

### 2.6 Retention schedule

Defaults — solicitor to confirm. Removal is a scheduled job per row, except audit logs.

| Data | Kept for |
|---|---|
| Magic-link tokens | 24 h |
| Sessions | Role session lifetime + 30 days |
| Notifications (inbox) | 12 months |
| Rejected / expired requests | 24 months |
| Private feedback | 24 months |
| Game sessions | 12 months |
| Marketplace listings | 30 days after end |
| Reveal logs | 12 months |
| Device signals | 90 days |
| Receipt photos | 12 months |
| Audit logs | 2 years (monthly partitions; dropping a partition is the only removal) |
| Application logs | 30 days |
| Backups (dumps, base backups and WAL) | 35 days |
| Shop invoices and payment records | 6 years (accounting) |
| Inactive customer accounts | Reviewed at 24 months of inactivity (notice, then erasure) |

### 2.7 Ledger, erasure and DSAR

- The ledger holds no personal data: membership / subject IDs only.
- **Erasure** anonymises the user and the customer profile (name, email, phone ciphertext, birthday, birth year). Ledger and audit rows stay, pseudonymous.
- **Deletion cascade**: marketplace listings removed; feedback text redacted; live redeem and claim codes voided; sessions and push subscriptions revoked; a sole shop owner must transfer or close the shop first; backups age out within 35 days. Completed within 1 month of the request.
- **DSAR export scope**: profile, memberships, ledger, requests, redemptions, claims, feedback, listings, reveal logs, notifications, consents, devices, fraud flags (where lawful to disclose), notes about the customer.
- Google Play requires a public web URL for account deletion: `/delete-account` (PRODUCT.md §17).

### 2.8 Device signals

Device signals (fingerprint hash, user agent, IP hash) are used **only** for fraud and security, never for marketing or analytics. They are disclosed in the Cookie Notice. Whether they fall under the PECR storage/access exemptions (as amended by DUAA 2025) is checked in the DPIA. Kept 90 days.

## 3. Marketing messages and cookies (PECR as amended)

- **Marketing goes by push and in-app inbox only, never by email** (email budget, ARCHITECTURE §10).
- **One marketing-consent rule for every channel** (push, in-app inbox, and email if marketing email is ever added):
  - `membership.marketing_opt_in` defaults to false and is asked clearly at join (unticked). It can be changed any time.
  - Marketing (announcements, offer notifications, private offers, birthday, win-back, happy-hour push, saved-offer and Daily Drop reminders) goes only to opted-in, unmuted members.
  - Transactional messages (approval, rejection, expiry, redeem, receipt, sign-in, security) ignore opt-in but respect mute for push.
  - Consent, mute and category checks run at send time; a change takes effect immediately.
  - Every consent change is recorded (who, when, how, wording version) and included in the DSAR export.
- If marketing email is ever added, every marketing email has a one-click unsubscribe. The weekly owner email (to shop owners, not customers) has an opt-out.
- Announcement cap: 2 per shop per rolling 7 days.
- **Quiet hours**: no marketing push 21:00–08:00 Europe/London.
- **Cross-shop cap**: at most 5 marketing pushes per customer per rolling 7 days across all shops.
- Cookies: strictly necessary + privacy-friendly first-party analytics with a visible notice and opt-out (no advertising or cross-site tracking). If any non-exempt tracker is ever added, a consent banner is required before setting it.

## 4. Marketplace (Online Safety Act 2023, consumer law, HMRC platform reporting)

- Report button on every listing and seller profile; Block on the seller profile; reporter acknowledgement with a stated timeframe (default 48 h — client to confirm) and a decision update; complaints and appeals flow.
- EXIF/GPS metadata stripped from every upload before it is served.
- Moderation queue with recorded decisions (`moderation_actions`); illegal items removed on sight.
- Prohibited items enforced by keyword filter + review (list maintained in admin content settings): weapons and bladed items, crossbows, air guns, replica firearms, ammunition, fireworks; tobacco, vapes, e-liquids, alcohol; medicines, prescription items, controlled drugs, paraphernalia, cure claims; live animals; counterfeit/replica goods, pirated software/media; stolen goods, ID documents, bank cards, accounts/logins; adult products/services; recalled/unsafe products, used child car seats and helmets; event tickets, gift cards, vouchers; loans, investments, crypto, gambling, jobs with upfront fees; hazardous chemicals, gas canisters, ivory/protected wildlife.
- 18+ confirmation required to list AND to reveal a number; business sellers labelled and show business name and address.
- **No payments in the app** (keeps the platform outside HMRC digital platform reporting rules as a listing/advertising-only site). Adding payments later requires a compliance review.
- Marketplace Rules, Prohibited Items and Reporting and Complaints pages (marked for solicitor review) **ship with the marketplace in Phase 4**. The marketplace cannot go live without them.
- Keep records needed for the Online Safety Act assessments: the illegal-content risk assessment AND the children's-access assessment (the client completes both; you provide draft templates in `docs/legal-templates/` in Phase 4).

## 5. Mini game (Gambling Act 2005)

- Free to play. No purchase, payment or points stake to play. No paid extra plays.
- Rewards (if enabled by a shop) are small, skill-based score thresholds, paid at most once per day per shop. No random prize draws. The leaderboard has no prizes.
- Game Rules page published.

## 6. Offers and advertising (CAP Code, DMCC unfair practices)

- Featured placements always labelled "Featured".
- Countdown/expiry text must reflect the real end time.
- Admin can remove misleading offers; Shop Terms make shops responsible for accuracy.

## 7. Children

- Customer app 13+: a required "I am 13 or over" declaration at sign-up; without it no profile is stored.
- Optional birth year is used only to set an 18+ flag (`is_adult_confirmed` + date). It is never shown to shops or used for segments, offers or ads.
- Age-restricted offers (alcohol, etc.) are hidden unless 18+ is confirmed.
- Marketplace listing AND number reveal require 18+ confirmation.
- Leaderboard is opt-in; names of anyone not 18+ confirmed are always hidden (anonymous handle).
- Online Safety Act: a children's-access assessment is done alongside the illegal-content assessment (§4).
- High-privacy defaults; no profiling for ads.

## 8. Policy pages (templates you generate, clearly marked "Draft — requires legal review")

Store in `src/content/legal/*.mdx`, rendered at `/legal/*`. Each page ships with the feature it covers:
- **Phase 4, with the marketplace**: Marketplace Rules, Prohibited Items, Reporting and Complaints.
- **Phase 5**: Terms of Use, Shop Terms (incl. controller roles and data-sharing terms, §2.1), Privacy Policy (incl. the complaints process, §2.5), Cookie Notice (incl. device signals, §2.8), Review and Fake Review Policy, Game Rules, Acceptable Use.
