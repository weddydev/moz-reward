# UK compliance rules for the build — Moz Rewards

These are product rules the code must enforce. They are not legal advice; the client's solicitor reviews policies before launch. When a feature touches one of these areas, read the section first.

## 1. Reviews (DMCC Act 2024, CMA fake-review guidance CMA208, Google Maps content policy)

- **No review gating.** Every rating (1–5) shows the same two options with equal size, colour weight and order: "Post on Google" and "Send to the shop privately". No extra steps, questions, delays or exit buttons for low ratings. No logic anywhere branches on rating to change what the customer can do.
- **No incentives** for reviews: no points, offers, game plays or entries linked to rating or reviewing.
- The only rating-dependent behaviour allowed: alerting the shop to low ratings so it can resolve problems. Resolution is never conditional on changing a review.
- AI review help only rephrases the customer's own chips and note; never invents experiences; never defaults to 5 stars; the customer edits before posting.
- Shops cannot delete or hide private feedback.
- We do not publish shop star ratings in the app at launch. If ever added: publish a fake-review policy, show all ratings including negative and recent ones, take reasonable steps against fake reviews.
- Add a test asserting that the review sheet renders identical actions for ratings 1–5.

## 2. Personal data (UK GDPR, DPA 2018, Data (Use and Access) Act 2025)

- Privacy notice explains: what we collect, why, sharing with the joined shop (name, phone, member ID, visit history, birthday day+month if given), retention, rights.
- Data export and deletion available in-app; admin queue tracks deadlines (1 month).
- Minimise: no precise location stored; birthday day+month only; phone not shown in share cards or public pages.
- Shops are told (Shop Terms) how they may use customer data (only for their own loyalty/offers, no export for other purposes). Customer list export is owner-only, 2FA re-auth, audit-logged.

## 3. Marketing messages and cookies (PECR as amended)

- Notifications are opt-in per shop (clear toggle at join). Mute per shop and global categories at any time, immediately effective.
- Every marketing email has a one-click unsubscribe.
- Announcement cap: 2 per shop per 7 days.
- Cookies: strictly necessary + privacy-friendly first-party analytics with a visible notice and opt-out (no advertising or cross-site tracking). If any non-exempt tracker is ever added, a consent banner is required before setting it.

## 4. Marketplace (Online Safety Act 2023, consumer law, HMRC platform reporting)

- Report button on every listing and seller profile; reporter acknowledgement with expected timeframe; complaints and appeals flow.
- Moderation queue with recorded decisions (`moderation_actions`); illegal items removed on sight.
- Prohibited items enforced by keyword filter + review (list maintained in admin content settings): weapons and bladed items, crossbows, air guns, replica firearms, ammunition, fireworks; tobacco, vapes, e-liquids, alcohol; medicines, prescription items, controlled drugs, paraphernalia, cure claims; live animals; counterfeit/replica goods, pirated software/media; stolen goods, ID documents, bank cards, accounts/logins; adult products/services; recalled/unsafe products, used child car seats and helmets; event tickets, gift cards, vouchers; loans, investments, crypto, gambling, jobs with upfront fees; hazardous chemicals, gas canisters, ivory/protected wildlife.
- Sellers 18+; business sellers labelled and show business name and address.
- **No payments in the app** (keeps the platform outside HMRC digital platform reporting rules as a listing/advertising-only site). Adding payments later requires a compliance review.
- Pages to generate (templates, marked for solicitor review): Marketplace Rules, Prohibited Items, Reporting and Complaints.
- Keep records needed for an Online Safety illegal-content risk assessment (the client completes the assessment; you provide a draft template in `docs/legal-templates/` in Phase 4).

## 5. Mini game (Gambling Act 2005)

- Free to play. No purchase, payment or points stake to play. No paid extra plays.
- Rewards (if enabled by a shop) are small, skill-based score thresholds, capped daily. No random prize draws.
- Game Rules page published.

## 6. Offers and advertising (CAP Code, DMCC unfair practices)

- Featured placements always labelled "Featured".
- Countdown/expiry text must reflect the real end time.
- Admin can remove misleading offers; Shop Terms make shops responsible for accuracy.

## 7. Children

- Customer app 13+ (stated at sign-up); marketplace 18+ (confirmation before first listing or reveal).
- High-privacy defaults; no profiling for ads.

## 8. Policy pages (templates you generate in Phase 5, clearly marked "Draft — requires legal review")

Terms of Use, Shop Terms, Privacy Policy, Cookie Notice, Review and Fake Review Policy, Marketplace Rules, Prohibited Items, Reporting and Complaints, Game Rules, Acceptable Use. Store in `src/content/legal/*.mdx`, rendered at `/legal/*`.
