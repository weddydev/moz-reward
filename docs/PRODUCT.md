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
  - The magic link opens a confirm page ("Sign in to Moz Rewards" button). Opening the link (GET) never consumes the token; only the button's POST does. Mail scanners that pre-fetch links therefore cannot use it up.
- **Complete profile** (first sign-in): full name (required), UK mobile (required, stored encrypted, not SMS-verified), birthday day+month (optional), birth year (optional).
  - **13+ declaration** (required tick: "I am 13 or over"). If not ticked, sign-up stops and no profile is stored.
  - **Birth year** is used only to set the 18+ flag (`is_adult_confirmed` + confirmation date). It is never shown to shops, never used for segments, offers or ads. Without it, the customer is treated as not 18+ confirmed.
- **Marketing consent is per membership and asked at join**: `membership.marketing_opt_in` defaults to false; the join sheet asks clearly ("Get offers and news from {shop}?", unticked). It can be changed any time in the shop's settings. The full rule is in §9.
- On sign-in from a shop landing page, the shop is joined automatically (membership created, consent asked on the join sheet) and the user returns to the shop page.
- **Member ID**: 6 chars Crockford base32 formatted `XXX-XXX`, unique, immutable. Customer member QR encodes a signed token, not the raw ID.

## 4. Wallet and shop page

- **Wallet**: list of joined shops sorted by (purchase count desc, current points desc, last visit desc). Card: photo, name, 1-line truncated address, gold progress bar with label ("72% · 1 more visit"), Happy hour badge if active now, Open now/Closed.
- Summary strip: rewards ready count, ingots completed total. Daily game card.
- **Shop page**: cover, logo, name, Open now badge, Directions (Google Maps URL with coordinates) and Call buttons, Gold Vault card (pour animation on every view — DESIGN.md), Request points, Show member QR, shop offers carousel, rate visit row, recent receipts, details (hours, special closures, address, about).
- **Leave shop**: allowed at any time (no minimum membership). **Mute notifications** is also available at any time. Leaving keeps the ledger, hides the shop, voids live redeem and claim codes and freezes progress.
  - Rejoining within 30 days of leaving restores the frozen progress. After 30 days the frozen progress expires (`expiry` ledger entry). Unredeemed rewards are not revoked: they keep their own validity date (§6) and reappear on rejoin.
  - Join and referral bonuses are never re-earned on rejoin.

## 5. Points requests and approval

- Customer taps "Request points" on a shop page. Creates `point_request` (status `pending`) with `requested_at`.
- `requested_at` is the **server receipt time**. A request queued offline is stamped when the server receives it; the client timestamp is stored as advisory only and is never used for multipliers or expiry.
- Constraints: one open request per customer per shop, where open = `pending` or `awaiting_owner` (enforced by a partial unique index); max 5 requests per customer per shop per day; request expires 24 h after `requested_at` (`expired`).
- Shop sees request instantly (SSE) in the queue with customer name, member ID, time, membership stats.
- Staff approve: enter amount (£, optional if programme is per-visit), items (optional quick-picks), attach receipt photo (optional) or generate a digital receipt. Server computes points from programme rules + active multipliers (Happy hour uses `requested_at`; stacking rule in §6).
- **Award guards** (server-side, on every approval and member-QR award):
  - **Self-award ban**: the server rejects any award where the approving staff member's user is the customer.
  - **Staff limit → owner-approval queue**: an award above the staff member's per-award limit moves the request to `awaiting_owner`. It stays open, still expires at the original 24 h, and the owner gets a push and a badge on Requests. The owner approves (amount editable) or rejects.
  - **Platform absolute cap**: no single award may exceed the platform cap (default £500 or 500 gold, whichever is hit first; configurable by an Admin Owner). Above it the award is rejected, even for owners.
  - **Same-device flag**: an award from a staff member to a customer account seen on the same device is allowed but raises a fraud flag (§16).
- Reject requires a reason (preset list + free text).
- **Member QR scan** (counter shortcut): staff scan customer QR (camera via `BarcodeDetector` where available, fallback to a small JS decoder loaded on demand), enter amount, award directly (creates an already-approved request for audit). The award guards apply.
- Customer receives result in real time if the shop page is open (SSE), plus push notification. Approved → **Points credited celebration** (DESIGN.md).
- **Ledger**: append-only `ledger_entries` (type: `earn`, `bonus_streak`, `bonus_referral`, `bonus_game`, `redeem`, `reversal`, `expiry`, `adjustment`). Ledger rows reference the membership, never personal data. Every award carries an idempotency key. `redeem` entries carry 0 gold and reference the redemption (rewards do not deduct gold, §6). Progress rules are in §6.
- **Reversal** (refund or mistaken award): a `reversal` entry with a reason; audited.
  - Who: the owner, or the staff member who made the award within 15 min of it.
  - Effect: reduces current-ingot progress only, floored at 0. Any shortfall is recorded on the membership (`gold_shortfall`), shown to the shop, and offsets the customer's future earns before they count as progress.
  - The customer is told (inbox + push). An unlocked reward is never revoked by a reversal.

## 6. Gold Vault (loyalty)

Programme per shop (versioned; changes never reduce existing progress):
- `earn_mode`: `per_visit` (N gold per approved visit) or `per_pound` (N gold per £1, rounded down).
- `ingot_size`: gold needed to fill one ingot (default 1,000).
- `main_reward`: text + optional image; unlocked at 100%.
- `milestones`: up to 3 at 25/50/75% (each: reward text, `is_mystery` boolean). Mystery rewards show "?" until reached. Milestones repeat in every ingot (default — client to confirm).
- `streak` (optional): a streak is the number of consecutive ISO weeks (Mon–Sun, Europe/London) with ≥ 1 approved visit. The shop sets bonus gold paid on the first approved visit of each week that extends a streak of ≥ 2 weeks (default — client to confirm).
- `tiers`: Bronze (0 ingots), Silver (≥2), Gold (≥5) — thresholds editable; based on lifetime `ingots_completed`, never lowered. Tiers are a status label only and grant no extra gold (default — client to confirm).
- `points_expiry_months`: optional, minimum 12. Rolling: measured from the customer's last approved visit at that shop. Warnings (inbox + push, transactional) 30 and 7 days before. Expiry removes only current-ingot progress (`expiry` entry); unlocked rewards and completed ingots are untouched.
- **Multiplier stacking**: active multipliers multiply together; the result is rounded down to whole gold after stacking (default — client to confirm).
- Templates: "Café classic", "Restaurant", "Retail", "Beauty".

**Progress model.** Progress = gold in the customer's current ingot (overflow carried in + ledger gold since that ingot started, less any shortfall offset, §5). When progress reaches `ingot_size`: the ingot fills, `ingots_completed` increments, the main reward unlocks as a **redeemable reward**, overflow gold carries into the next ingot, and the completed ingot is added to the Vault shelf. Milestone reached → milestone reward becomes redeemable. An unlocked reward is never revoked.

**Programme changes.** The programme is versioned. A customer's current ingot completes under the version active when that ingot started. A new `ingot_size` applies from the next ingot. Changes to rewards or milestones give affected members 14 days' notice (inbox + push, transactional) before they apply.

**Redemption**: customer taps Redeem → one-time 6-char code valid 15 minutes, shown large with shop name; staff confirm code in dashboard → `redemptions` row + a `redeem` ledger entry with 0 gold that references it (rewards are unlocked by progress, never paid for with gold).
- One live code per reward: generating a new code voids the old one.
- Confirmation is atomic and single-use: a second confirm of the same code fails with "Already redeemed".
- Rewards are valid 90 days from unlock unless the shop sets a longer period.

Nudges: Wallet label "1 more visit" when next approval would complete the ingot (estimated from average award).

## 7. Reviews and feedback

**Legal rule — read COMPLIANCE.md §1.** Same options for every rating; no incentives.

Flow:
1. Stars 1–5 + experience chips (configurable list in admin: Friendly staff, Great coffee, Quick service, Cosy space, Clean, Value for money, Long wait, Order wrong, Too noisy) + optional note.
2. Optional **AI help** ("Help me write it ✦"): generates a short draft (≤ 60 words) using only the user's stars, chips and note; user can edit. Plain, specific, no superlatives not supported by input, no invented details. Rate limit 5/day/user.
3. Two equal buttons for every rating: **Post on Google** (copies text to clipboard, opens `https://search.google.com/local/writereview?placeid={placeId}`) and **Send to the shop privately** (stores feedback; shop notified). User may do both. Hide Google button if shop has no Place ID.
4. Rating ≤ 2 → shop gets an immediate alert. Shops can reply; they cannot hide or delete feedback.

Review-incentive guard: the feedback inbox has no "send offer" (or any reward) action; star rating is never a customer segment or an offer audience; a private offer sent to a customer within 14 days of their feedback is flagged to the moderation queue (COMPLIANCE.md §1).

Shop dashboard: feedback inbox, replies, average rating from private feedback, reply to Google reviews via Business Profile API when the owner connects Google (optional; feature-flagged; Phase 3 stretch). No Google Places API is used (the Place ID is entered by the shop).

Our app does not display public star ratings for shops at launch (avoids publisher duties). If added later, COMPLIANCE.md §1 publisher rules apply.

## 8. Offers

| | Shop offer | Daily Drop |
|---|---|---|
| Where | Shop page (members) and Offers feed | Offers feed "Today's Drops" + shop page |
| Limit | Unlimited | 1 per shop per calendar day (Europe/London) |
| Validity | 1–30 days | Until 23:59 the same day; "Re-post" button next day copies it |

- Fields: title (≤ 60), description (≤ 300), terms (≤ 500), banner (template or upload), validity, audience (all / members only / segment), optional notify (marketing: §9 rules; counts toward announcement cap), **age-restricted** flag (alcohol, etc.), claims per customer (default 1), optional stock limit.
- **Age-restricted offers** are hidden (feed, shop page, notifications) from anyone who is not 18+ confirmed (§3), including visitors.
- **Offers feed** (public): search by shop name or offer title; category chips; "Near me · 5 km" (asks for geolocation only on tap, postcode fallback via postcodes.io; never stores precise location); Featured shops (max 3, labelled "Featured"); bookmark.
- **Claim**: generates a one-time claim code (6 chars) valid until offer end; staff confirm in dashboard; counts claims.
  - One claim per customer per offer unless the shop sets more. When the stock limit is reached the offer shows "All claimed" and no new codes are issued.
  - Confirmation is atomic and single-use; stock and per-customer limits are checked in the same transaction.
- **Private offers**: shop → one customer or a segment of opted-in members; customer sees Accept / Skip (Accept saves it with a claim code). Never sent to a non-opted-in or muted member.
- **Saved offers**: reminder push 24 h before end; Daily Drops reminder at 17:00. Both are marketing (§9): sent only to opted-in, unmuted members of that shop. Saving an offer from a shop the customer has not joined sends no reminder; the saved list shows the end date.
- Banner builder: 6 gold-styled templates (text overlay), or upload (re-encoded). Admin can remove misleading offers.

## 9. Notifications and announcements

- Channels: Web Push (VAPID) for browsers and the Android TWA; iOS only when installed to Home Screen (iOS 16.4+); in-app inbox always.
- **Email is used only for**: sign-in links and security notices (lockouts, account-recovery holds), staff invites, shop-account mail (application received/approved/rejected, activation, invoices, suspension notices), plan reminders, data-request mails and the weekly owner email. Announcements, offers and all marketing go by **push + in-app inbox only, never by email**. Receipts are downloaded in-app, not emailed. (Email budget and degradation order: ARCHITECTURE §10.)
- Customer preferences: per shop (marketing opt-in on/off; on/muted), global categories (offers, rewards, reminders), sounds on/off.
- **One marketing-consent rule for every channel** (push, in-app inbox):
  - Marketing = announcements, offer notifications, private offers, birthday treats, win-back offers, happy-hour push, saved-offer and Daily Drop reminders. These go only to members with `marketing_opt_in = true` who have not muted the shop (and whose global category is on).
  - Transactional = approval, rejection, request expiry, redeem, receipt, sign-in, security, points-expiry warnings, reversal notices, programme-change notices. These ignore opt-in, but push respects mute (muted → in-app inbox only).
  - **Quiet hours**: no marketing push 21:00–08:00 Europe/London. A marketing push due in quiet hours is held to 08:00, or dropped if its content has ended by then (e.g. happy hour, today's Daily Drop). Transactional push is not held.
  - **Cross-shop cap**: at most 5 marketing pushes per customer per rolling 7 days across all shops. Pushes over the cap are not sent; the item still appears in the in-app inbox.
  - The checks run at send time (not at scheduling), so a later opt-out or mute always wins.
- **Announcements**: shop → opted-in, unmuted members; hard cap 2 per shop per rolling 7 days (offer notifications count); scheduling allowed.
- Notification sound: push uses the system sound. In-app moments use the app's synthesized sounds (DESIGN.md §Sound).

## 10. Engagement suite

- **Happy hour gold**: shop defines windows (weekday + start/end), multiplier 1.5×/2×/3×, pause toggle. Badge "Happy hour now" on cards and Offers. Optional push at start (marketing, §9 rules; counts toward the announcement cap).
- **Birthday treats**: customers optionally store day+month. 7 days before, a draft offer per birthday appears in the shop's **Suggestions inbox** — only for opted-in, unmuted members. Owner chooses Send / Edit and send / Skip. Owner can save a default template. Nothing sends automatically; sending re-checks §9 rules.
- **Win-back**: nightly job finds opted-in, unmuted members whose last visit exceeds the shop's threshold (30/60/90 days) → draft offer in Suggestions inbox. Owner approves/edits/skips. Max one win-back per customer per 60 days.
- **Refer a friend**: per-shop invite link with referral code. When the friend's first purchase at that shop is approved, both get the shop-defined bonus (or none if disabled). Cap 10 referral bonuses per referrer per month. Self-referral blocked (same user/device). Not re-earned after leaving and rejoining (§4).
- **Monthly recap**: on the 1st (09:00 UK), customers with ≥1 visit last month get a recap card (visits, gold earned, ingots filled, favourite shop) + share.
- **Open now / Directions**: weekly hours + special closures; "Closes soon" within 30 min.
- **Featured slots**: admin-scheduled, max 3 concurrent, label "Featured".
- **Weekly owner email**: Monday 09:00 UK, opt-out available.

## 11. Receipts, share cards, exports

- Digital receipt on every approval: shop, date/time, items, amount, gold earned, staff initials, receipt number. Download PDF (server-rendered). Title always "Digital receipt — not a VAT invoice". VAT number is optional: shown only if the shop added VAT details in Settings.
- **Receipt animation** when a receipt is generated (DESIGN.md).
- Share cards (PNG, server-generated with `@vercel/og`/Satori or equivalent): reward unlocked, ingot filled, monthly recap. Sizes 1080×1350 and 1080×1920. Never include phone, email, member ID. Shared with Web Share API (files) or downloaded.
- Customer data export: JSON + CSV covering the full DSAR scope in §17 (also used for GDPR access requests).

## 12. Mini game: Stack the Gold

- One-tap timing game on `<canvas>`: a gold bar slides horizontally; tap drops it; overlap stays, overhang slices off and falls; speed increases; game ends when overlap is zero.
- Score = bars stacked. Personal best stored. Weekly leaderboard per shop (customer picks which joined shop to play for). The leaderboard has no prizes.
- **Leaderboard is opt-in** (default off). Opted-in, 18+ confirmed customers show as first name + initial. Customers without the 18+ flag always show as an anonymous handle (e.g. "Stacker 4821"); their names are never shown.
- Rewards: optional, shop-defined small gold bonus (`bonus_game`) for reaching a score threshold. Paid at most once per day per shop. Free to play, no purchases, no staking points (COMPLIANCE.md §5).
- Limits: 10 eligible plays per customer per day (only these can earn the threshold bonus); further plays are practice (no reward, unlimited). Server validates plausibility (min game duration per score) to stop cheating.
- Lazy-loaded route; ≤ 40 KB gzipped JS for game code; 60 fps target; pauses when tab hidden.

## 13. Marketplace

- **Create listing**: up to 5 photos, title (≤ 70), description (≤ 1,000), price (£, 0 allowed = "Free"), category, contact number, area (town or postcode district — not full address), seller type (Private / Business; Business requires business name and address shown on listing), rules checkbox.
- Max 3 active listings per user; expiry 30 days; renew one tap.
- Categories (10): Electronics, Mobiles and tablets, Home and furniture, Fashion, Kids and baby, Sports and outdoors, Books and hobbies, Vehicles and parts, Collectibles, Other.
- **Buyer view**: feed, category chips, search, near me (postcode district distance), listing detail with **Reveal number** (signed-in, 18+ confirmed only, rate-limited 20/day, logged), safety tips, Report.
- **Seller profile**: first name + initial (or business name), member since, active listings; **Report** and **Block** on the profile and on every listing. Blocking hides the blocked user's listings from the blocker and stops each from revealing the other's number.
- **Photos**: every upload is re-encoded and has EXIF/GPS metadata stripped before it is served.
- **Moderation**: prohibited-items keyword filter (admin-editable list) → held for review; a new seller's first 3 listings are pre-moderated; reports go to moderation queue; takedown notifies seller with reason + appeal link; 3 upheld violations → suspension.
- **Reporter acknowledgement**: every report gets an in-app acknowledgement with the stated timeframe ("We'll review this within 48 hours"; 48 h is the default — client to confirm) and an update when it is decided.
- **18+ only for listing AND reveal**: before the first listing or first reveal, the customer confirms they are 18+ by giving their birth year (§3). Stored as `is_adult_confirmed` + confirmation date. Without it, both actions are blocked with a clear message; browsing stays open.
- Marketplace Rules, Prohibited Items and Reporting and Complaints pages ship with the marketplace and are linked from the create-listing form, the rules checkbox and the Report sheet.
- No chat, no payments in app (COMPLIANCE.md §4).

## 14. Shop dashboard

Navigation: Overview, Requests, Customers, Suggestions, Offers, Announcements, Loyalty programme, Feedback, Analytics, QR & NFC kit, Staff, Settings.

- **Overview**: KPIs (visits today, gold issued, new customers, offers claimed), live request queue, suggestions preview, happy hour status, weekly visits chart, latest feedback.
- **Requests**: tabs Pending / Awaiting owner / Approved today / Expired; approve side panel; scan member QR. Awaiting owner is visible to staff; only the owner can act on it (§5).
- **Customers**: table (name, member ID, phone, joined, visits, spend, last visit, progress, marketing opt-in) with search and segments (Lapsed 30 days, Close to reward ≥75%, Top 10% by spend, New this month). Star rating is never a segment or filter here. Customer profile: stats, purchase history, vault progress, notes, send private offer (opted-in members only; flagged to moderation if within 14 days of that customer's feedback, §7).
- **Suggestions inbox**: birthday and win-back drafts with Send / Edit / Skip.
- **Offers**: list, create (shop offer / Daily Drop), banner builder, claims count, end early.
- **Announcements**: compose, schedule, history, remaining quota this week.
- **Loyalty programme**: builder for §6 with live preview of the ingot and milestones; happy hour; referrals; game reward.
- **Feedback**: inbox, filters by stars, reply. No "send offer" or reward action anywhere in the inbox (§7).
- **Analytics**: visits/day, repeat rate, gold issued vs redeemed, offer claims, member growth; date range 7/30/90 days.
- **QR & NFC kit**: download A5 poster and table tent PDFs (gold design), shop code, NFC tag status (tag ID, date of the last visit that arrived with `src=nfc`, replacement requested / sent); request replacement.
- **Staff**: invite by email, role, per-award limit, deactivate.
- **Settings**: profile, photos (logo, cover, up to 6 gallery), category, hours, special closures, location pin, Google Place ID (with helper link), VAT details (optional), notification preferences, weekly email toggle, plan status (read-only).

## 15. Shop registration and plans

- Public page `/join`: business name, trading name, category, owner name, email, phone, address + map pin (postcode lookup), Google Business link (optional), Companies House number (optional), plan preference (Monthly / Lifetime), terms. Turnstile bot check. On-screen confirmation plus an "application received" email (shop-account mail, ARCHITECTURE §10).
- Application → admin Applications inbox. Admin records payment manually (amount, method, reference, date), sets plan + start + expiry (lifetime: no expiry), activates → shop + owner invite email + shop code + QR + NFC tag ID generated.
- Plan states: `pending` → `active` → `expiring` (≤14 days) → `grace` (7 days after expiry, banner) → `restricted` (read-only dashboard: no new offers/announcements; customers keep points and can still redeem; requests still approvable) → `suspended` (admin action) / `closed`.
- Renewal reminders: 14, 7, 1 days before expiry (email + dashboard banner). PDF invoices generated by admin for recorded payments.

**Shop state matrix.** `expiring` and `grace` behave as **active** (plus a banner). `pending` shops are not public. Enforced server-side; every cell has a test.

| Feature | Active | Restricted | Suspended | Closed |
|---|---|---|---|---|
| Landing page `/s/[code]` | Full | Full | "Temporarily unavailable" notice, no actions | "This shop has closed" + reward deadline; archived after 30 days |
| Join | Yes | Yes | No | No |
| Customer requests | Yes | Yes | No (open requests expire as normal) | No (open requests expire) |
| Approvals / member-QR awards | Yes | Yes | No | No |
| Redeem rewards | Yes | Yes | No (reward validity paused while suspended) | Yes for 30 days after closure, then no |
| Offer claims | Yes | Existing offers until they end | No | No |
| Daily Drop | Yes | No new drops | Hidden | Hidden |
| Announcements | Yes (cap §9) | No | No | One closure notice (sent by the system) |
| Push to members | Marketing (§9) + transactional | Transactional only | Transactional only | Closure notice + transactional |
| Game rewards | Yes | Yes | No | No (shop removed from the game picker) |
| Staff invites | Yes | No | No | No |
| Offers feed / search listing | Yes | Existing offers until they end; never Featured | Hidden | Hidden |
| Owner customer-list export | Yes (owner, 2FA re-auth) | Yes | No (admin handles requests) | No (admin handles requests) |
| Customer's own data export (§17) | Yes | Yes | Yes | Yes |

Dashboard access: restricted = read-only except approvals, redeem and claims; suspended = sign-in shows the suspension notice and support contact only; closed = redeem-only for 30 days.

## 16. Super admin

Navigation: Overview, Applications, Shops, Plans & payments, QR & NFC, Customers, Moderation, Fraud monitor, Featured slots, Content settings, Broadcasts, Audit log, Team.

- **Overview**: KPIs, applications waiting, alerts (reports, fraud flags, expiring plans), activity chart, shops by region list.
- **Shops**: search/filter, detail (profile, plan, payments, staff, stats), suspend/restore, **View as shop** (read-only, banner, logged).
- **QR & NFC**: batch-generate shop codes and tag IDs, printable sheets, replace tag (old link redirects to new).
- **Customers**: lookup by name/email/phone/member ID; data export and deletion requests with due date (1 month); block account.
- **Account recovery** (lost Google/email access): the customer proves member ID + last shop visited + phone number. One admin opens the request; a second, different admin approves. The change then waits a 72 h hold, with a notice and cancel link sent to the old email. Every step is audited.
- **Moderation**: listings, banners, feedback reports, private offers flagged under §7; actions with reasons; appeals.
- **Fraud monitor**: rule-based flags — awards > 3× shop average; > 10 awards/day to one customer; one staff member awarding the same customer > 5×/week; staff award to a customer account seen on the same device; many accounts per device fingerprint; game scores failing plausibility. Flag → review → dismiss/act. (Self-awards are rejected outright, §5.)
- **Content settings**: marketplace categories, prohibited keywords, review chips, banner templates, game settings, platform absolute cap per award (Admin Owner only, §5).
- **Broadcasts**: dashboard banner + in-app inbox (and push) to all shops' staff; not email (email budget, ARCHITECTURE §10).
- **Audit log**: append-only, filter by actor/action/entity.
- **Team**: invite admins, roles, 2FA status.

## 17. Customer account and data

- Me: profile edit, member card (QR), stats, monthly recap, receipts, saved offers, my listings, refer a friend, notifications settings, sounds toggle, install app, privacy & data (export, delete account), help & policies, sign out.
- **Data export (DSAR)** covers: profile, memberships (incl. consents and opt-in history), ledger, requests, redemptions, claims, feedback, marketplace listings, reveal logs, notifications, devices / push subscriptions, fraud flags (where lawful to disclose), and shop notes about the customer. Delivered as JSON + CSV via a job; download link by email and in-app.
- **Delete account**: confirms unredeemed rewards will be lost; deletes personal data within 30 days. Erasure anonymises the user and customer profile (name, email, phone ciphertext, birthday, birth year removed); ledger and audit rows stay, pseudonymous (they hold only membership/subject IDs).
  - Cascade: marketplace listings removed; feedback text redacted (rating and date kept for the shop's averages); live redeem and claim codes voided; open requests cancelled; sessions and push subscriptions revoked; backups age out within 35 days.
  - A customer who is the **sole owner** of a shop must transfer ownership or close the shop first; deletion is blocked with that message.
- **Web deletion page** `/delete-account` (public URL, listed in Google Play Console): explains what is deleted, asks the customer to sign in, then starts the same deletion flow. Works without the Android app installed.

## 18. Install and platforms

- PWA: manifest, icons (maskable), offline shell, offline member QR and wallet snapshot, update prompt.
- **Offline member QR**: the cached QR token keeps its normal lifetime (5 min, SECURITY.md). Offline, the QR shows only while the cached token is unexpired; after that the card shows the member ID large with "Offline — ask staff to type your member ID".
- **Update prompt**: a new version waits and shows a non-blocking "Update available" toast; it applies only when the user taps it. It is never shown, and never reloads, while a redeem code, a pending request, a celebration, the staff approve panel or the member-QR scanner is open.
- **Notification permission**: asked only after the user taps a "Turn on notifications" pre-prompt, never on first launch. On Android 13+ the TWA requests the `POST_NOTIFICATIONS` runtime permission at that moment. If denied, settings explain how to enable it and the in-app inbox still works.
- **iOS storage eviction**: Safari may clear site storage (cache, IndexedDB, push subscription) after a period of non-use, especially when not installed. The app treats every cache as optional: an empty cache shows a normal online load, never an error; the push subscription is re-checked on each open and re-created if permission is still granted.
- Install button: header chip on every screen until installed. Android/desktop Chrome: `beforeinstallprompt`. iOS Safari: animated "Share → Add to Home Screen" guide sheet. Hidden when running standalone.
- Android: Google Play app via **Trusted Web Activity** (Bubblewrap), Digital Asset Links at `/.well-known/assetlinks.json`.
  - **TWA fallback**: if no TWA-capable browser (e.g. Chrome) is installed, the app falls back to Custom Tabs, then to a WebView. Sign-in, wallet, requests and member QR must work in the fallback. Google blocks OAuth inside WebViews, so the WebView fallback hides the Google button and offers the email magic link. Web Push is not available there: the in-app inbox is used and settings say why.
- No iOS App Store build.

## 19. Edge cases

| Situation | Behaviour |
|---|---|
| QR photographed and used from home | Staff approval required; 24 h expiry; daily cap; fraud flag if request far outside shop area (only if user grants location — never required) |
| Double tap / retry | Idempotency key; duplicate ignored |
| Shop never approves | Expires; customer notified; shop reminder after 30 min |
| Refund after award | Reversal by owner (or awarding staff within 15 min) with reason; current-ingot progress floored at 0; shortfall recorded and offset against future earns; customer told (§5) |
| Programme changed mid-progress | Current ingot completes under the version it started with; new `ingot_size` from the next ingot; reward/milestone changes after 14 days' notice (§6) |
| Plan lapses | Grace → restricted; behaviour per the §15 state matrix |
| Shop closes | Members notified; rewards honoured 30 days; then archived (§15 state matrix) |
| Customer leaves | Allowed any time; progress frozen; rejoin within 30 days restores it; join/referral bonuses not re-earned (§4) |
| Staff member is also the customer | Award rejected (self-award ban, §5) |
| Award above staff limit, owner away | Request waits in `awaiting_owner`; owner gets push + badge; expires at the original 24 h |
| Request queued offline, sent later | `requested_at` = server receipt time; happy hour judged on that time |
| Lost Google/email access | Two-admin recovery with member ID + last shop + phone; 72 h hold with notice to the old email (§16) |
| Multi-account farming | Device + account limits; same-device award flag; game reward caps |
| No signal at counter | Member QR offline while the cached token is valid, then member ID for manual entry (§18); request queued and retried |
| Fake QR sticker | App scanner opens only our domain; any other URL shows a warning. The landing page always shows the shop's name and address so the customer can check it matches |
| Daily Drop at midnight / clock change | Computed in Europe/London |
| Shop not on Google | Hide Google review button |
| Same customer at two branches | Separate shops, separate progress |
| Under-18 (or no 18+ confirmation) | Loyalty allowed; marketplace browsing allowed but listing and reveal blocked; age-restricted offers hidden; leaderboard name hidden |
| Under-13 | Cannot complete sign-up (13+ declaration, §3) |
| Too many announcements | Hard cap 2 per shop / 7 days; 5 marketing pushes per customer / 7 days across shops; quiet hours 21:00–08:00 (§9) |
