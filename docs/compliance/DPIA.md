# Data protection impact assessment (DPIA)

**Status: Draft — requires legal review (H-23). Not legal advice.** UK GDPR Art. 35; ICO Children's code. Source: COMPLIANCE §2.4, §2.8, §7. Last updated 10 Nov 2026.

**This assessment must be completed and signed before Phase 1 goes live to real customers.** It is updated when a feature changes the risk and reviewed in the Phase 5 compliance audit (P5-06).

## 1. Why an assessment is needed

| Trigger | Applies because |
|---|---|
| Children's data | Customers may be 13–17; the service is "likely to be accessed by children", so the Children's code applies and requires a DPIA |
| Systematic monitoring | Visits, spend and progress are recorded per customer per shop; fraud rules watch awards, devices and game scores |
| Invisible processing | Device signals are read without the person doing anything |
| New technology | An AI model drafts review text |
| Scale | Launch tier: 200 shops and 50,000 members |
| Combining data | One account spans many shops; the platform sees across them even though a shop does not |

## 2. What the processing is

- **Who:** customers (13+), shop owners and staff, platform administrators, marketplace sellers and buyers, shop applicants.
- **What:** listed row by row in [ROPA.md](ROPA.md). The most sensitive items are the mobile number, purchase history per shop, private feedback, device signals, the 18+ flag and marketplace contact numbers. No special category data is requested.
- **How:** one web app on one server in the United Kingdom, with the providers in [PROCESSOR_REGISTER.md](PROCESSOR_REGISTER.md).
- **Who sees what:** a customer sees their own data; a shop sees its own members; platform administrators see by role, and every cross-shop read is logged.
- **How long:** [RETENTION_SCHEDULE.md](RETENTION_SCHEDULE.md).

## 3. Who was consulted

| Party | Status |
|---|---|
| Development team | Wrote this draft |
| Client (controller) | Accepted the loyalty rule defaults on 10 Nov 2026; has not yet reviewed this document |
| Solicitor | Pending (H-23) |
| Customers or shops | Not consulted. Suggested: ask the pilot shops and a few customers during acceptance testing (S-01) whether the join screen and the marketing question are clear |
| ICO | Prior consultation is needed only if a high risk remains after mitigation; none is expected |

## 4. Necessity and proportionality

| Area | Could the purpose be met with less? | Position |
|---|---|---|
| Mobile number | Staff need a way to identify a customer at the counter when the QR fails, and shops expect a contact detail | Kept, but encrypted, masked to staff by default, each reveal logged, never in exports beyond the shop's own list |
| Birthday | Only day and month, optional | Minimised |
| Age | A tick for 13+; birth year used once to set an 18+ flag | No date of birth is stored |
| Location | Used for one search, never stored | Minimised |
| Device signals | Rules could run on account data alone, but multi-account farming and staff collusion are not detectable without a device link | Kept for fraud and security only, hashed, 90 days |
| AI help | Optional; the customer can always type their own text | Minimal input, redacted |
| Marketing | Push and in-app only, opt-in per shop, limits and quiet hours | No email marketing at all |
| Analytics | Self-hosted, no advertising identifiers, IP anonymised | No third party |

## 5. Risks, safeguards and the task that builds each one

Likelihood (L) and severity (S) are Low, Medium or High **before** safeguards. "Residual" is our view after them.

### A. Fraud monitoring and device signals

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| F1 | A person is wrongly flagged and loses points or their account | M | M | Rules only raise a flag; a person reviews it before any action; the customer is told of a reversal; an unlocked reward is never revoked | P1-12, P4-08 | Low |
| F2 | Device signals are reused for marketing or analytics | L | H | Used only by fraud and security code; never joined to segments or analytics; disclosed in the Cookie Notice | P4-08, P5-05 | Low |
| F3 | A device hash links accounts of people who share a phone (family, shop tablet) | M | L | A shared device raises a flag for review, never an automatic block; the same-device staff award is allowed and flagged | P1-12, P4-08 | Low |
| F4 | Signals kept too long | L | M | 90-day removal with a boundary test | P2-13 | Low |
| F5 | People do not know the monitoring happens | M | M | Privacy Policy and Cookie Notice describe it in plain words | P5-05 | Low |

### B. Children and age checks

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| C1 | A child under 13 creates an account | M | M | Required "I am 13 or over" tick; without it no profile is stored. This is a declaration, not verification | P1-04 | Medium — accepted as proportionate for a loyalty app; solicitor to confirm |
| C2 | A person under 18 sees alcohol or other age-restricted offers | M | M | Age-restricted offers are hidden in the feed, the shop page and notifications unless the 18+ flag is set, including for visitors | P3-04, P3-05, P3-07 | Low |
| C3 | A 13–17-year-old receives shop marketing and is placed in shop segments | M | M | Marketing is opt-in per shop, unticked by default; no advertising profiling; star rating is never a segment. README question 5 asks whether accounts without the 18+ flag should be excluded from marketing and from spend-based segments | P1-04, P2-03, P3-07 | Medium until decided |
| C4 | A child deals with an adult stranger through the marketplace | L | H | Listing and number reveal both need the 18+ flag; without it only browsing is possible | P4-01, P4-03 | Low |
| C5 | A child's name appears on a public leaderboard | M | M | Leaderboard is opt-in; anyone without the 18+ flag always shows as an anonymous handle | P4-07 | Low |
| C6 | Streaks and the game push a child to keep coming back or to hand over more data | M | L | The game is free, has no purchases or stakes, and is never required; streaks need a real purchase approved by staff; no feature asks for extra data as a condition | P1-06, P4-06 | Low |
| C7 | The birth year is used for something else | L | M | It sets the 18+ flag and its date and nothing else; never shown to shops, never a segment | P1-04, P4-03 | Low |

### C. AI review help

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| A1 | Personal data in the customer's note is sent to the AI provider | M | M | Names, emails, phones, member IDs and postcodes are replaced before sending; only stars, phrases and the redacted note leave the server; a test inspects the request | P3-02 | Low |
| A2 | The provider uses the text to train its models | L | M | Paid service only, whose terms exclude product-improvement use; the feature cannot be switched on without a paid key | P3-02 | Low |
| A3 | The draft invents an experience or pushes a higher rating | M | M | The prompt allows only the customer's own stars, phrases and note; the draft never selects stars; the customer edits before posting; every rating shows identical actions | P3-01, P3-02 | Low |
| A4 | The customer does not know AI was involved | L | L | The button is labelled; an `ai_used` flag is stored | P3-02 | Low |

### D. Marketing notifications

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| M1 | Marketing reaches someone who did not agree or who withdrew | M | M | One consent rule checked at send time in one place; a later opt-out or mute always wins; a test per message category | P3-07 | Low |
| M2 | Too many messages, or messages at night | M | L | 2 announcements per shop per 7 days; 5 marketing pushes per customer per 7 days across all shops; no marketing push 21:00–08:00 | P3-07, P3-08 | Low |
| M3 | Consent cannot be proved later | L | M | Every change records who, when, how and the wording version, and is in the data export | P1-04, P2-13 | Low |
| M4 | Birthday and win-back messages feel intrusive | M | L | Only for opted-in members; the owner sends each one by hand; nothing sends automatically; one win-back per 60 days | P3-10 | Low |

### E. Marketplace and number reveals

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| R1 | Seller phone numbers are harvested | M | M | Number is never in the page until revealed; sign-in and 18+ required; 20 reveals a day; bot check after 5; every reveal logged | P4-03 | Low |
| R2 | A photo gives away where the seller lives | M | H | Every upload is re-encoded and location data stripped; area is a town or postcode district, never a full address for private sellers | P2-05, P4-01 | Low |
| R3 | Harassment after a reveal | L | H | Block stops either side revealing the other's number; report on every listing and profile; three upheld violations suspend the seller | P4-01, P4-04 | Low |
| R4 | Reveal logs are a record of who was interested in what | L | M | Used for safety only; 12 months; in the data export | P2-13, P4-03 | Low |

### F. Shops and the platform team

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| S1 | Staff of one shop read another shop's customers | M | H | Every action checks the role and scopes the query; row-level security in the database blocks it even if the code forgets; a test per table | P0-07, P0-20, every later task | Low |
| S2 | A shop exports its customer list and uses it elsewhere | M | M | Owner only, fresh second-factor check, logged; Shop Terms forbid onward use | P2-03, P5-05 | Medium — depends on the shop |
| S3 | A staff member looks up customers out of curiosity | M | M | Phone masked by default; each reveal logged; staff accounts are personal with a second factor | P0-06, P2-03 | Low |
| S4 | A platform administrator misuses cross-shop access | L | H | Access by role; every cross-shop read writes an audit row; "view as shop" is read-only, time-limited and logged; 2-hour admin sessions | P0-20, P2-12 | Low |
| S5 | A shop notes something sensitive about a customer | L | M | Notes are length-limited, never a segment, included in the data export and removed on erasure | P2-03, P2-13 | Low |
| S6 | Someone takes over an account through the recovery process | L | H | Three proofs; two different admins; 72-hour hold; notice and cancel link to the old email | P2-13 | Low |

### G. General

| ID | Risk to people | L | S | Safeguard | Built in | Residual |
|---|---|---|---|---|---|---|
| G1 | A breach exposes phone numbers | L | H | Field-level encryption with a key held outside the database; backups encrypted with a key that is never on the server | P1-04, P0-15 | Low |
| G2 | Personal data leaks into logs, error reports or share images | M | M | Redaction list in the logger; scrubbing before error reports; share cards never take phone, email or member ID; tests for each | P0-05, P0-13, P3-12 | Low |
| G3 | A deleted person's data survives | M | M | One erasure routine with a test that scans every table; backups age out in 35 days | P2-13 | Low |
| G4 | Single server: an outage or loss | M | M | Encrypted off-site backups, write-ahead log archiving, monthly restore drill; the client accepted about 2 hours' outage and up to 5 minutes' data loss | P0-15, P5-12 | Low to people; an availability risk for the business |

## 6. Legitimate interests assessment: fraud prevention and device signals

1. **Purpose.** Points and rewards have real value to shops and customers. The interest is to stop fake requests, staff collusion, multi-account farming, referral abuse and game cheating. This protects shops and honest customers as well as the platform.
2. **Necessity.** Account-level rules catch some abuse, but one person with several accounts, or staff awarding their own second account, can only be seen through a device link. The signals are hashed, limited to three items (fingerprint hash, browser name, hashed IP) and kept 90 days.
3. **Balance.** People would expect a rewards scheme to check for cheating. The impact is low: a flag leads to human review, not automatic action; nothing is shared with shops or advertisers; the data is not used for any other purpose. Children are in scope, so the safeguards in section 5A apply to everyone equally.
4. **Outcome (draft).** Legitimate interests can be relied on. Alternative for the solicitor: the "recognised legitimate interest" for preventing crime added by the Data (Use and Access) Act 2025, which needs no balancing test.
5. **Right to object.** A person can object; the request is handled under [COMPLAINTS_PROCESS.md](COMPLAINTS_PROCESS.md). If fraud checks cannot be switched off for one account without breaking the scheme, the practical result is closing the account, and the notice must say so.

## 7. PECR: reading information from the device

Device signals involve reading information from the person's device, which PECR allows without consent only when strictly necessary for a service the person asked for, or under one of the exemptions added in 2025. Draft view: fraud prevention and security are within "strictly necessary" **only if** the signals are used for nothing else. That is why the single-purpose rule in risk F2 matters. If the solicitor disagrees, the options are (a) ask for consent, which weakens fraud detection, or (b) drop the fingerprint and keep only server-side signals (browser name, hashed IP), which need no device access.

## 8. Children's code: where each standard is met

| Standard | Position |
|---|---|
| Best interests | No advertising profiling; no paid or staked play; marketplace closed to under-18s |
| DPIA | This document |
| Age-appropriate application | 13+ declaration; protections applied to everyone who has not confirmed 18+ |
| Transparency | Plain-language notices and join screen (P5-05) |
| Detrimental use | No review incentives; no pressure messaging; urgency text must be true |
| Policies and community standards | Marketplace rules, reporting and moderation (P4-04, P4-05) |
| Default settings | Marketing off; leaderboard off; location not stored |
| Data minimisation | Section 4 |
| Data sharing | Only with shops the person joined; no advertisers |
| Geolocation | Asked only on tap, used once, never stored |
| Parental controls | None offered; not needed for the features open to under-18s |
| Profiling | Shop segments by visits and spend only; README question 5 asks whether to exclude under-18s |
| Nudge techniques | Risk C6 |
| Connected toys and devices | Not applicable |
| Online tools | Export, deletion and complaints in the app (P5-01) |

## 9. Actions before sign-off

| # | Action | Owner | Status |
|---|---|---|---|
| 1 | Solicitor answers the ten questions in the [README](README.md) | Client's solicitor (H-23) | Open |
| 2 | Sign processing agreements and confirm transfer bases | Client | Open |
| 3 | Decide README question 5 (under-18s, marketing and segments) before P3-07 | Client and solicitor | Open |

## 10. Sign-off

| Role | Name | Date | Outcome |
|---|---|---|---|
| Controller (client) | | | |
| Solicitor | | | |
| Developer lead | | | |

Residual risk after safeguards: **Low**, with three Medium items awaiting a decision (C1, C3, S2). No prior consultation with the ICO is expected to be needed.
