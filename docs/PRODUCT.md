# Product specification — Moz Rewards

Sections: [1 Overview](#1-overview) · [2 Roles](#2-roles) · [3 Entry and onboarding](#3-entry-and-onboarding) · [4 Wallet and shop page](#4-wallet-and-shop-page) · [5 Points requests](#5-points-requests-and-approval) · [6 Gold Vault](#6-gold-vault-loyalty) · [7 Reviews](#7-reviews-and-feedback) · [8 Offers](#8-offers) · [9 Notifications](#9-notifications-and-announcements) · [10 Engagement suite](#10-engagement-suite) · [11 Receipts and sharing](#11-receipts-share-cards-exports) · [12 Mini game](#12-mini-game-stack-the-gold) · [13 Marketplace](#13-marketplace) · [14 Shop dashboard](#14-shop-dashboard) · [15 Registration and plans](#15-shop-registration-and-plans) · [16 Super admin](#16-super-admin) · [17 Account and data](#17-customer-account-and-data) · [18 Install and platforms](#18-install-and-platforms) · [19 Edge cases](#19-edge-cases)

---

## 1. Overview

Moz Rewards is a loyalty and engagement platform for UK shops, cafés, restaurants and hotels. A customer taps an NFC tag or scans a QR code in a shop, joins that shop's programme, requests points after a purchase, and watches gold pour into a gold ingot (the **Gold Vault**). Full ingots unlock rewards. Customers also rate visits, browse offers from all shops, play a short game, and use a simple marketplace.

Three portals in one codebase:
- **Customer app** — mobile-first, distinct desktop layout.
- **Shop dashboard** — desktop-first, with a phone "counter view".
- **Super admin** — desktop-first panel for the platform team.

Language: UK English. Currency: GBP. Region: United Kingdom. Time zone for all business rules: `Europe/London`.

## 2. Roles

| Role | Can do |
|---|---|
| Visitor (not signed in) | View shop landing pages, public Offers feed, marketplace listings (no seller numbers), registration page |
| Customer | Everything in the customer app for their own account |
| Shop Owner | Everything for their shop, including staff, settings, plan view |
| Shop Staff | Requests, member scan, customer list (read), offers (if allowed by owner); per-award points limit set by owner |
| Admin: Owner | Everything in super admin, including team management |
| Admin: Support | Shops, customers, applications, data requests (no team management, no finance edits) |
| Admin: Moderator | Moderation queues, reports, content settings |
| Admin: Finance | Plans, payments, invoices, featured slots |

A user can be a customer and also staff of a shop (separate role contexts, explicit switch in UI).

## 3. Entry and onboarding

- Every shop has: a unique **shop code** (6 chars, Crockford base32, no 0/O/1/I/L), a **QR code** and an **NFC tag link** to `/s/{shopCode}?src=qr|nfc|code`. NFC tags hold a plain NDEF URL record.
- Manual entry: Scan screen has "Enter shop code".
- **Shop landing page** (`/s/[code]`): viewable without account. Primary CTA "Collect points"; secondary "Rate your visit", "Today's offer"; reward preview; shop details.
- **Entry animation** plays when arriving from `src=qr|nfc` (see DESIGN.md §Motion "Gilded Gate").
- **Sign-in**: Google OAuth or email magic link (single-use, 15-minute expiry). No passwords for customers.
- **Complete profile** (first sign-in): full name (required), UK mobile (required, stored encrypted, not SMS-verified), birthday day+month (optional), marketing opt-in toggle per joined shop (default off until chosen; asked clearly).
- On sign-in from a shop landing page, the shop is joined automatically (membership created) and the user returns to the shop page.
- **Member ID**: 6 chars Crockford base32 formatted `XXX-XXX`, unique, immutable. Customer member QR encodes a signed token, not the raw ID.

## 4. Wallet and shop page

- **Wallet**: list of joined shops sorted by (purchase count desc, current points desc, last visit desc). Card: photo, name, 1-line truncated address, gold progress bar with label ("72% · 1 more visit"), Happy hour badge if active now, Open now/Closed.
- Summary strip: rewards ready count, ingots completed total. Daily game card.
- **Shop page**: cover, logo, name, Open now badge, Directions (Google Maps URL with coordinates) and Call buttons, Gold Vault card (pour animation on every view — DESIGN.md), Request points, Show member QR, shop offers carousel, rate visit row, recent receipts, details (hours, special closures, address, about).
- **Leave shop**: enabled only after 30 days of membership. Before that, show "You can leave from {date}". **Mute notifications** is available at any time. Leaving keeps the ledger but hides the shop; points frozen 30 days in case of rejoin, then expire.

## 5. Points requests and approval

- Customer taps "Request points" on a shop page. Creates `point_request` (status `pending`) with `requested_at`.
- Constraints: one `pending` request per customer per shop; max 5 requests per customer per shop per day; request expires after 24 h (`expired`).
- Shop sees request instantly (SSE) in the queue with customer name, member ID, time, membership stats.
- Staff approve: enter amount (£, optional if programme is per-visit), items (optional quick-picks), attach receipt photo (optional) or generate a digital receipt. Server computes points from programme rules + active multipliers (Happy hour uses `requested_at`). Staff above their per-award limit need owner approval.
- Reject requires a reason (preset list + free text).
- **Member QR scan** (counter shortcut): staff scan customer QR (camera via `BarcodeDetector` where available, fallback to a small JS decoder loaded on demand), enter amount, award directly (creates an already-approved request for audit).
- Customer receives result in real time if the shop page is open (SSE), plus push notification. Approved → **Points credited celebration** (DESIGN.md).
- **Ledger**: append-only `ledger_entries` (type: `earn`, `bonus_streak`, `bonus_referral`, `bonus_game`, `redeem`, `reversal`, `expiry`, `adjustment`). Balance = sum. Every award carries an idempotency key. Refund = `reversal` entry; balance floors at 0 and a shortfall is shown to the shop.

## 6. Gold Vault (loyalty)

Programme per shop (versioned; changes never reduce existing progress):
- `earn_mode`: `per_visit` (N gold per approved visit) or `per_pound` (N gold per £1, rounded down).
- `ingot_size`: gold needed to fill one ingot (default 1,000).
- `main_reward`: text + optional image; unlocked at 100%.
- `milestones`: up to 3 at 25/50/75% (each: reward text, `is_mystery` boolean). Mystery rewards show "?" until reached.
- `streak`: window in days + bonus gold per streak visit (optional).
- `tiers`: Bronze (0 ingots), Silver (≥2), Gold (≥5) — thresholds editable.
- `points_expiry_months`: optional, minimum 12.
- Templates: "Café classic", "Restaurant", "Retail", "Beauty".

When an ingot fills: main reward becomes a **redeemable reward**; overflow gold carries into the next ingot; completed ingot added to the Vault shelf. Milestone reached → milestone reward becomes redeemable.

**Redemption**: customer taps Redeem → one-time 6-char code valid 15 minutes, shown large with shop name; staff confirm code in dashboard → `redemptions` row + `redeem` handling (milestone/main rewards don't deduct gold — they are unlocked by progress; record redemption only).

Nudges: Wallet label "1 more visit" when next approval would complete the ingot (estimated from average award).

## 7. Reviews and feedback

**Legal rule — read COMPLIANCE.md §1.** Same options for every rating; no incentives.

Flow:
1. Stars 1–5 + experience chips (configurable list in admin: Friendly staff, Great coffee, Quick service, Cosy space, Clean, Value for money, Long wait, Order wrong, Too noisy) + optional note.
2. Optional **AI help** ("Help me write it ✦"): generates a short draft (≤ 60 words) using only the user's stars, chips and note; user can edit. Plain, specific, no superlatives not supported by input, no invented details. Rate limit 5/day/user.
3. Two equal buttons for every rating: **Post on Google** (copies text to clipboard, opens `https://search.google.com/local/writereview?placeid={placeId}`) and **Send to the shop privately** (stores feedback; shop notified). User may do both. Hide Google button if shop has no Place ID.
4. Rating ≤ 2 → shop gets an immediate alert. Shops can reply; they cannot hide or delete feedback.

Shop dashboard: feedback inbox, replies, average rating from private feedback, Google rating summary (Places API, optional), reply to Google reviews via Business Profile API when the owner connects Google (optional; feature-flagged; Phase 3 stretch).

Our app does not display public star ratings for shops at launch (avoids publisher duties). If added later, COMPLIANCE.md §1 publisher rules apply.

## 8. Offers

| | Shop offer | Daily Drop |
|---|---|---|
| Where | Shop page (members) and Offers feed | Offers feed "Today's Drops" + shop page |
| Limit | Unlimited | 1 per shop per calendar day (Europe/London) |
| Validity | 1–30 days | Until 23:59 the same day; "Re-post" button next day copies it |

- Fields: title (≤ 60), description (≤ 300), terms (≤ 500), banner (template or upload), validity, audience (all / members only / segment), optional notify (counts toward announcement cap).
- **Offers feed** (public): search by shop name or offer title; category chips; "Near me · 5 km" (asks for geolocation only on tap, postcode fallback via postcodes.io; never stores precise location); Featured shops (max 3, labelled "Featured"); bookmark.
- **Claim**: generates a one-time claim code (6 chars) valid until offer end; staff confirm in dashboard; counts claims.
- **Private offers**: shop → one customer or a segment; customer sees Accept / Skip (Accept saves it with a claim code).
- **Saved offers**: reminder push 24 h before end; Daily Drops reminder at 17:00.
- Banner builder: 6 gold-styled templates (text overlay), or upload (re-encoded). Admin can remove misleading offers.

## 9. Notifications and announcements

- Channels: Web Push (VAPID) for browsers and the Android TWA; iOS only when installed to Home Screen (iOS 16.4+); in-app inbox always; transactional email (sign-in links, receipts on request, plan reminders, owner weekly email).
- Customer preferences: per shop (on/muted), global categories (offers, rewards, reminders), sounds on/off.
- **Announcements**: shop → all members; hard cap 2 per shop per rolling 7 days (offer notifications count); scheduling allowed.
- Notification sound: push uses the system sound. In-app moments use the app's synthesized sounds (DESIGN.md §Sound).

## 10. Engagement suite

- **Happy hour gold**: shop defines windows (weekday + start/end), multiplier 1.5×/2×/3×, pause toggle. Badge "Happy hour now" on cards and Offers. Optional push at start (counts toward cap).
- **Birthday treats**: customers optionally store day+month. 7 days before, a draft offer per birthday appears in the shop's **Suggestions inbox**. Owner chooses Send / Edit and send / Skip. Owner can save a default template. Nothing sends automatically.
- **Win-back**: nightly job finds members whose last visit exceeds the shop's threshold (30/60/90 days) → draft offer in Suggestions inbox. Owner approves/edits/skips. Max one win-back per customer per 60 days.
- **Refer a friend**: per-shop invite link with referral code. When the friend's first purchase at that shop is approved, both get the shop-defined bonus (or none if disabled). Cap 10 referral bonuses per referrer per month. Self-referral blocked (same user/device).
- **Monthly recap**: on the 1st (09:00 UK), customers with ≥1 visit last month get a recap card (visits, gold earned, ingots filled, favourite shop) + share.
- **Open now / Directions**: weekly hours + special closures; "Closes soon" within 30 min.
- **Featured slots**: admin-scheduled, max 3 concurrent, label "Featured".
- **Weekly owner email**: Monday 09:00 UK, opt-out available.

## 11. Receipts, share cards, exports

- Digital receipt on every approval: shop, date/time, items, amount, gold earned, staff initials, receipt number. Download PDF (server-rendered). Wording "Digital receipt" — not "VAT invoice" unless the shop added VAT details (then show VAT number).
- **Receipt animation** when a receipt is generated (DESIGN.md).
- Share cards (PNG, server-generated with `@vercel/og`/Satori or equivalent): reward unlocked, ingot filled, monthly recap. Sizes 1080×1350 and 1080×1920. Never include phone, email, member ID. Shared with Web Share API (files) or downloaded.
- Customer data export: JSON + CSV of their loyalty history (also used for GDPR access requests).

## 12. Mini game: Stack the Gold

- One-tap timing game on `<canvas>`: a gold bar slides horizontally; tap drops it; overlap stays, overhang slices off and falls; speed increases; game ends when overlap is zero.
- Score = bars stacked. Personal best stored. Weekly leaderboard per shop (customer picks which joined shop to play for; display first name + initial).
- Rewards: optional, shop-defined small gold bonus for reaching a score threshold, max once per day per shop. Free to play, no purchases, no staking points (COMPLIANCE.md §5).
- Limits: 10 rewarded plays per day; unlimited practice plays (no reward). Server validates plausibility (min game duration per score) to stop cheating.
- Lazy-loaded route; ≤ 40 KB gzipped JS for game code; 60 fps target; pauses when tab hidden.

## 13. Marketplace

- **Create listing**: up to 5 photos, title (≤ 70), description (≤ 1,000), price (£, 0 allowed = "Free"), category, contact number, area (town or postcode district — not full address), seller type (Private / Business; Business requires business name and address shown on listing), rules checkbox.
- Max 3 active listings per user; expiry 30 days; renew one tap.
- Categories (10): Electronics, Mobiles and tablets, Home and furniture, Fashion, Kids and baby, Sports and outdoors, Books and hobbies, Vehicles and parts, Collectibles, Other.
- **Buyer view**: feed, category chips, search, near me (postcode district distance), listing detail with **Reveal number** (signed-in only, rate-limited 20/day, logged), safety tips, Report.
- **Moderation**: prohibited-items keyword filter (admin-editable list) → held for review; a new seller's first 3 listings are pre-moderated; reports go to moderation queue; takedown notifies seller with reason + appeal link; 3 upheld violations → suspension.
- Sellers must be 18+ (self-declared on first listing with date of birth check year/month; stored as boolean `is_adult_confirmed` + confirmation date).
- No chat, no payments in app (COMPLIANCE.md §4).

## 14. Shop dashboard

Navigation: Overview, Requests, Customers, Suggestions, Offers, Announcements, Loyalty programme, Feedback, Analytics, QR & NFC kit, Staff, Settings.

- **Overview**: KPIs (visits today, gold issued, new customers, offers claimed), live request queue, suggestions preview, happy hour status, weekly visits chart, latest feedback.
- **Requests**: tabs Pending / Approved today / Expired; approve side panel; scan member QR.
- **Customers**: table (name, member ID, phone, joined, visits, spend, last visit, progress) with search and segments (Lapsed 30 days, Close to reward ≥75%, Top 10% by spend, New this month). Customer profile: stats, purchase history, vault progress, notes, send private offer.
- **Suggestions inbox**: birthday and win-back drafts with Send / Edit / Skip.
- **Offers**: list, create (shop offer / Daily Drop), banner builder, claims count, end early.
- **Announcements**: compose, schedule, history, remaining quota this week.
- **Loyalty programme**: builder for §6 with live preview of the ingot and milestones; happy hour; referrals; game reward.
- **Feedback**: inbox, filters by stars, reply.
- **Analytics**: visits/day, repeat rate, gold issued vs redeemed, offer claims, member growth; date range 7/30/90 days.
- **QR & NFC kit**: download A5 poster and table tent PDFs (gold design), shop code, NFC tag status; request replacement.
- **Staff**: invite by email, role, per-award limit, deactivate.
- **Settings**: profile, photos (logo, cover, up to 6 gallery), category, hours, special closures, location pin, Google Place ID (with helper link), VAT details (optional), notification preferences, weekly email toggle, plan status (read-only).

## 15. Shop registration and plans

- Public page `/join`: business name, trading name, category, owner name, email, phone, address + map pin (postcode lookup), Google Business link (optional), Companies House number (optional), plan preference (Monthly / Lifetime), terms. Turnstile bot check. Confirmation email.
- Application → admin Applications inbox. Admin records payment manually (amount, method, reference, date), sets plan + start + expiry (lifetime: no expiry), activates → shop + owner invite email + shop code + QR + NFC tag ID generated.
- Plan states: `pending` → `active` → `expiring` (≤14 days) → `grace` (7 days after expiry, banner) → `restricted` (read-only dashboard: no new offers/announcements; customers keep points and can still redeem; requests still approvable) → `suspended` (admin action) / `closed`.
- Renewal reminders: 14, 7, 1 days before expiry (email + dashboard banner). PDF invoices generated by admin for recorded payments.

## 16. Super admin

Navigation: Overview, Applications, Shops, Plans & payments, QR & NFC, Customers, Moderation, Fraud monitor, Featured slots, Content settings, Broadcasts, Audit log, Team.

- **Overview**: KPIs, applications waiting, alerts (reports, fraud flags, expiring plans), activity chart, shops by region list.
- **Shops**: search/filter, detail (profile, plan, payments, staff, stats), suspend/restore, **View as shop** (read-only, banner, logged).
- **QR & NFC**: batch-generate shop codes and tag IDs, printable sheets, replace tag (old link redirects to new).
- **Customers**: lookup by name/email/phone/member ID; data export and deletion requests with due date (1 month); block account.
- **Moderation**: listings, banners, feedback reports; actions with reasons; appeals.
- **Fraud monitor**: rule-based flags — awards > 3× shop average; > 10 awards/day to one customer; one staff member awarding the same customer > 5×/week; many accounts per device fingerprint; game scores failing plausibility. Flag → review → dismiss/act.
- **Content settings**: marketplace categories, prohibited keywords, review chips, banner templates, game settings.
- **Broadcasts**: email + dashboard banner to all shops.
- **Audit log**: append-only, filter by actor/action/entity.
- **Team**: invite admins, roles, 2FA status.

## 17. Customer account and data

- Me: profile edit, member card (QR), stats, monthly recap, receipts, saved offers, my listings, refer a friend, notifications settings, sounds toggle, install app, privacy & data (export, delete account), help & policies, sign out.
- Delete account: confirms unredeemed rewards will be lost; deletes personal data within 30 days; ledger rows anonymised (user_id → tombstone).

## 18. Install and platforms

- PWA: manifest, icons (maskable), offline shell, offline member QR and wallet snapshot, update prompt.
- Install button: header chip on every screen until installed. Android/desktop Chrome: `beforeinstallprompt`. iOS Safari: animated "Share → Add to Home Screen" guide sheet. Hidden when running standalone.
- Android: Google Play app via **Trusted Web Activity** (Bubblewrap), Digital Asset Links at `/.well-known/assetlinks.json`.
- No iOS App Store build.

## 19. Edge cases

| Situation | Behaviour |
|---|---|
| QR photographed and used from home | Staff approval required; 24 h expiry; daily cap; fraud flag if request far outside shop area (only if user grants location — never required) |
| Double tap / retry | Idempotency key; duplicate ignored |
| Shop never approves | Expires; customer notified; shop reminder after 30 min |
| Refund after award | Reversal entry; floor at 0; shortfall shown |
| Programme changed mid-progress | Existing balance kept; new rules apply to new awards |
| Plan lapses | Grace → restricted; customers keep and redeem points |
| Shop closes | Members notified; rewards honoured 30 days; then archived |
| Customer leaves before 30 days | Blocked with date; mute available |
| Lost Google/email access | Admin-assisted recovery with identity checks |
| Multi-account farming | Device + account limits; game reward caps |
| No signal at counter | Member QR offline; request queued and retried |
| Fake QR sticker | App only accepts our domain; verified shop badge |
| Daily Drop at midnight / clock change | Computed in Europe/London |
| Shop not on Google | Hide Google review button |
| Same customer at two branches | Separate shops, separate progress |
| Under-18 | Loyalty allowed; marketplace blocked |
| Too many announcements | Hard cap 2 / 7 days |
