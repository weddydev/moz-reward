# Record of processing activities (ROPA)

**Status: Draft — requires legal review (H-23). Not legal advice.** UK GDPR Art. 30. Last updated 10 Nov 2026.

## Controller details

| | |
|---|---|
| Platform controller | [Client legal name], [registered address], company number [ ] |
| ICO registration number | [to add once the data protection fee is paid] |
| Contact for data protection | [name, email] |
| Data protection officer | [none appointed / name] — question 10 in the README |
| Shop controllers | Each shop is its own controller for its member data ([CONTROLLER_ROLES.md](CONTROLLER_ROLES.md)). A shop keeps its own record; this document shows what the platform does for it. |

## How to read the table

- **Basis** is the draft lawful basis under UK GDPR Art. 6, from COMPLIANCE §2.2. "LI" means legitimate interests.
- **Controller**: P = platform, S = shop. "S (P delivers)" means the shop decides the purpose and the platform runs the system.
- **Kept for** points to [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md). A row marked ⚠ has no period in the product rules yet; the schedule proposes one.
- **Recipients** are named in [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md). Every row also passes through the host (Hostinger), the network edge (Cloudflare) and encrypted backups (Cloudflare R2); those three are not repeated in each row.
- No special category data (health, ethnicity, religion and so on) is requested anywhere. Free-text fields (feedback notes, listing descriptions, shop notes) could contain it if a person types it; they are length-limited and never used for segments.

## Customers

| # | Activity and purpose | People | Data | Basis | Controller | Other recipients | Kept for |
|---|---|---|---|---|---|---|---|
| 1 | Account and sign-in (Google or email link) | Customers | Email, name, Google account identifier, sign-in link tokens, sessions | Contract | P | Google (sign-in), Resend / Brevo (the link email) | Account life; tokens 24 h; sessions per schedule |
| 2 | Signed-in devices list and session security | Customers, staff, admins | Session records: browser name, hashed IP address, last seen | LI (security) | P | — | Session life + 30 days |
| 3 | Customer profile | Customers | Full name, UK mobile (encrypted, plus a keyed hash for lookup), member ID, sound and motion preferences | Contract | P; shared with each joined shop | — | Account life |
| 4 | Age declarations | Customers | "I am 13 or over" tick; optional birth year, used once to set an 18+ flag and its date | LI (child safety) | P | — | Account life; the birth year is used only for the flag |
| 5 | Loyalty membership | Customers | Which shops joined, join date, visit count, last visit, progress, tier, streak, leave date | Contract | S (P delivers) | — | Account life; frozen progress 30 days after leaving |
| 6 | Points requests, approvals and reversals | Customers, staff | Request time, status, amount spent, items, approving staff member, reject or reversal reason | Contract | S (P delivers) | — | Rejected or expired: 24 months. Approved ⚠ |
| 7 | Points ledger | Customers (by membership ID only) | Gold earned, bonus, reversal and expiry entries. No names, emails, phones or free text | Contract | S (P delivers) | — | Kept; pseudonymous after erasure |
| 8 | Digital receipts and receipt photos | Customers, staff | Shop, date, items, amount, gold, staff initials, receipt number; optional photo | Contract | S (P delivers) | — | Photos 12 months. Receipt records ⚠ |
| 9 | Rewards and redemption codes | Customers, staff | Reward unlocked and redeemed, one-time code, confirming staff member | Contract | S (P delivers) | — | Account life; codes 15 min |
| 10 | Marketing messages from shops (push and in-app inbox, never email) | Customers who opted in | Opt-in per shop with history (who, when, how, wording version), mute, categories, messages sent | Consent | S | Browser push services | Consent history: account life. Messages: 12 months |
| 11 | Service messages (approval, rejection, expiry, redeem, security, programme changes) | Customers | Inbox items; push text with no personal data beyond the message | Contract | P and S | Browser push services; Resend / Brevo for sign-in and security mail only | 12 months |
| 12 | Push subscriptions | Customers, staff | Push address and keys issued by the browser, browser name, last seen | Consent (browser permission) | P | Browser push services | Until removed ⚠ |
| 13 | Private feedback to a shop | Customers | Star rating, chosen phrases, note, shop's reply, whether the Google button was pressed | Contract | P; S for feedback it receives | — | 24 months |
| 14 | AI help writing a review | Customers who press the button | Stars, chosen phrases and the note with names, emails, phones, member IDs and postcodes removed; a flag that AI was used | Contract (optional feature) | P | Google (Gemini, paid service) | Not stored by us beyond the flag; provider retention per its terms |
| 15 | Offers: claims, saved offers, private offers | Customers | Offer claimed, claim code, saved list, accept or skip of a private offer | Contract; consent for private offers and reminders | P for the feed; S for its offers | — | ⚠ |
| 16 | "Near me" search | Customers and visitors | Location or postcode, used for one search | Consent on tap | P | postcodes.io (postcode only) | Never stored or logged |
| 17 | Birthday treats | Customers who gave a birthday and opted in | Birthday day and month; a draft offer shown to the shop 7 days before | Consent | S | — | Account life; drafts ⚠ |
| 18 | Win-back suggestions | Customers who opted in | Last visit date compared with the shop's threshold; a draft offer | Consent for the message; LI of the shop for the suggestion | S | — | Drafts ⚠ |
| 19 | Refer a friend | Referrer and friend | Who referred whom, when the bonus was paid; device hash for the self-referral check | Contract; LI (abuse) | S (P delivers) | — | Account life; device hash 90 days |
| 20 | Monthly recap and share cards | Customers | Visits, gold earned, ingots, favourite shop. Cards never carry phone, email or member ID | Contract; consent for the recap push | P | — | Regenerated on demand |
| 21 | Mini game and leaderboard | Customers | Scores, play duration, chosen shop; leaderboard name (first name and initial only if opted in and 18+ confirmed, otherwise an anonymous handle) | Contract; consent for showing a name | P | — | 12 months |
| 22 | Marketplace listings | Sellers | Photos (location data stripped), title, description, price, town or postcode district, contact number (encrypted), seller type; business name and address for business sellers | Contract | P | — | 30 days after the listing ends |
| 23 | Marketplace safety: number reveals, blocks, reports, moderation | Buyers, sellers, reporters | Who revealed which number and when; blocks; report reason and outcome; moderation decisions, strikes, appeals | Contract; LI (safety) for reveal logs; legal obligation (Online Safety Act records) | P | — | Reveal logs 12 months. Reports and decisions ⚠ |
| 24 | First-party analytics | Visitors and customers who agree | Page views and events with the IP address anonymised; no advertising identifiers | As built: consent. Product rule: LI with opt-out — README question 2 | P | None (self-hosted) | ⚠ |
| 25 | Account deletion, data export and other rights requests | Requesters | Request type, dates, status, export file | Legal obligation | P | Resend / Brevo (the notice email) | Export files 7 days ⚠; request records ⚠ |
| 26 | Inactive account review | Customers inactive 24 months | Last activity date | LI (data minimisation) | P | — | Notice, then erasure |

## Shops, staff and the platform team

| # | Activity and purpose | People | Data | Basis | Controller | Other recipients | Kept for |
|---|---|---|---|---|---|---|---|
| 27 | Shop applications | Applicants | Business and trading name, owner name, email, phone, address, optional Companies House number, plan choice | Contract (steps before a contract) | P | Cloudflare Turnstile (bot check), Resend / Brevo | Rejected applications ⚠; accepted: shop life |
| 28 | Plans, manual payment records and invoices | Shop owners | Amount, method, reference, dates, invoice | Contract; legal obligation (accounts) | P | — | 6 years |
| 29 | Staff and admin accounts | Shop staff, platform team | Email, password hash, second-factor secret and recovery codes (encrypted), passkeys, role, award limit | Contract; LI (security) | P; S for who its staff are | Resend / Brevo (invites, lockout notices); Have I Been Pwned (5 characters of a password hash, never the password) | While active; then per schedule |
| 30 | Shop customer list, segments, notes and export | Members of the shop | Name, member ID, phone (masked; each reveal logged), visits, spend, progress, opt-in status, shop's notes. Star rating is never a segment | Contract; S's LI for notes | S | — | Account life; notes removed on erasure |
| 31 | Shop reports and weekly owner email | Shop owners; members in totals only | Counts and totals; owner's email | Contract; LI (owner may opt out) | P and S | Resend / Brevo | Totals are not personal data |
| 32 | Platform support: customer lookup, view as shop, blocking | Customers, staff | Any account data needed to resolve a case; every cross-shop read is logged | Contract; LI | P | — | Audit log 2 years |
| 33 | Account recovery after lost access | Customers | Member ID, last shop visited, phone; two different admins; 72-hour hold with a notice to the old email | Contract; LI (security) | P | Resend / Brevo | Audit log 2 years |

## Security, fraud and operations

| # | Activity and purpose | People | Data | Basis | Controller | Other recipients | Kept for |
|---|---|---|---|---|---|---|---|
| 34 | Fraud and abuse prevention | Customers, staff | Device signals (fingerprint hash, browser name, hashed IP), rule results, flags and their evidence; rate-limit counters | LI — assessment in [DPIA.md](DPIA.md) §6 | P | Cloudflare (Turnstile, traffic filtering) | Signals 90 days; flags ⚠ |
| 35 | Review-rule guard | Customers, shops | A flag when a private offer goes to a customer within 14 days of their feedback | Legal obligation; LI | P | — | With moderation records ⚠ |
| 36 | Audit log | Staff, admins, customers by ID | Who did what to which record, when, hashed IP | LI; legal obligation where it applies | P | — | 2 years (whole months removed) |
| 37 | Application logs | All users | Request ID, hashed user ID, shop ID, action, timing. Tokens, phones, emails and codes are redacted | LI (security, fault finding) | P | — | 30 days |
| 38 | Error monitoring | All users | Error reports with personal data scrubbed before sending | LI | P | Sentry | 30 days at the provider |
| 39 | Backups | All | Encrypted copies of the databases | LI; legal obligation (security of processing) | P | Cloudflare R2 | 35 days |
| 40 | Complaints about data protection | Complainants | Complaint, correspondence, outcome | Legal obligation | P | Resend / Brevo | ⚠ |
| 41 | Incident and breach records | Affected people | What happened, who was affected, actions taken | Legal obligation | P | — | ⚠ |

## Storage on the person's device

Listed here so the Cookie Notice (Phase 5) can be written from one place. Everything is first-party.

| Item | Purpose | Needs consent? (draft view) |
|---|---|---|
| Session cookie | Keeps the person signed in | No: strictly necessary |
| `moz_consent` cookie | Remembers the analytics choice | No: strictly necessary |
| Preference storage (sound, reduced motion) | Remembers settings before sign-in | No: the person asked for it |
| Per-shop entry-animation marker (this browser session only) | Stops the welcome animation replaying | No: appearance only |
| Offline member card and last QR token | Lets the member card show without signal | No: the person asked for it |
| Push subscription | Notifications | Asked through the browser permission, after a pre-prompt |
| Analytics script | Visit statistics | Yes as built — README question 2 |
| Device signal reading | Fraud and security only | README question 4 |

## International transfers

Customer data is stored in the United Kingdom (host) and in Cloudflare R2 with a Europe location hint. Some providers are based in the United States or route through it. The basis for each is in [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md) and must be confirmed from the signed agreement.

## Security measures (summary; detail in SECURITY.md)

Encryption in transit; field-level encryption for phone numbers; encrypted backups with the private key held off the server; row-level security in the database so one shop cannot read another's data; mandatory second factor for staff and admins; per-role session limits; rate limits; redacted logs; append-only audit log; tested restore.
