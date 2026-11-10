# Data requests and account deletion

**Status: Draft — requires legal review (H-23). Not legal advice.** UK GDPR Art. 12, 15, 17, 20. Source: PRODUCT §17, COMPLIANCE §2.7. Last updated 10 Nov 2026.

## 1. How a person asks

| Route | What happens |
|---|---|
| In the app: Me → Privacy and data → Export my data / Delete my account | Starts the request at once (built in P5-01) |
| Public web page `/delete-account` | Explains what is deleted, asks the person to sign in, then starts the same deletion. Works without the Android app (required by Google Play) |
| Email or message to support, or a request made to a shop | An administrator opens the request in the admin panel (P2-13). A shop passes it to the platform within 2 working days |

Every request gets a row in the admin queue with a due date of **one month** from receipt. The period can be extended by up to two further months for a complex request, and the person is told within the first month.

## 2. Checking who is asking

A signed-in request needs no further proof. A request by email is answered only to the account's own email address. If the person has lost access to that address, the account-recovery process applies first (two administrators, 72-hour hold).

## 3. What the export contains

Delivered as JSON and CSV, built by a background job, with a download link by email and in the app. The link expires; the file is deleted after 7 days (proposed).

| Category | Included |
|---|---|
| Profile | Name, email, phone, member ID, birthday day and month, 18+ flag and date, preferences |
| Memberships | Shops joined, dates, progress, tier, streak |
| Consents | Every marketing opt-in change: when, how, wording version |
| Ledger | Every gold entry for the person's memberships |
| Requests and receipts | Points requests with status, amounts, items; receipts |
| Rewards and redemptions | Unlocked, redeemed, when |
| Offers | Claims, saved offers, private-offer responses |
| Feedback | Ratings, phrases, notes, shop replies |
| Marketplace | Listings, reports made, moderation decisions about the person |
| Reveal logs | Numbers the person revealed, and reveals of the person's own number (without naming the other party) |
| Notifications | Inbox items |
| Devices | Sessions and push subscriptions (browser name, dates) |
| Fraud flags | Where lawful to disclose — see below |
| Shop notes | Notes a shop wrote about the person |

The list is driven by the database schema: a test fails if a table holding personal data is not in the export (P2-13, P5-01).

**Left out, with the reason:**

- **Other people's data.** Staff names appear as initials; a buyer or seller is not named.
- **Fraud flags under review.** A flag may be withheld while disclosure would prejudice the prevention or detection of crime. Draft rule: closed flags are included; open ones are decided case by case by an administrator. README question 8.
- **Security internals.** Password hashes, second-factor secrets and keyed hashes are not useful to the person and are not included.

## 4. Other rights

| Right | How it is met |
|---|---|
| Correction | The person edits their own profile; anything else through support |
| Withdraw marketing consent | Per shop, in the shop's settings, effective at once |
| Object to fraud processing | Handled as a complaint; see [DPIA.md](DPIA.md) §6 |
| Restriction | An administrator can block an account while a dispute is open |
| Portability | The JSON and CSV export |
| Automated decisions | None with legal or similar effect: fraud rules only raise a flag for a person to review |

## 5. What deletion does

Completed within **30 days** of the request. The person is signed out at once.

| Data | What happens |
|---|---|
| User account and customer profile | Anonymised: name, email, phone (ciphertext and lookup hash), birthday, birth year removed |
| Sessions and push subscriptions | Revoked at once |
| Open points requests | Cancelled |
| Live redemption and claim codes | Voided |
| Unredeemed rewards | Lost; the confirmation screen says so before the person agrees |
| Marketplace listings and contact number | Removed |
| Private feedback | Text redacted; rating and date kept for the shop's averages |
| Shop notes about the person | Removed |
| Ledger entries | Kept unchanged. They hold membership IDs only, so they are no longer linked to a person |
| Audit log | Kept unchanged, for the same reason, until its 2-year period ends |
| Shop invoices and payment records | Not customer data; kept 6 years |
| Backups | Age out within 35 days; the confirmation says so |

**Blocked case.** A person who is the only owner of a shop must transfer ownership or close the shop first. Deletion stops with that message.

**One routine.** The admin action, the in-app deletion and the public `/delete-account` page all run the same erasure code (P2-13). A test scans every table for the person's email, phone, name and birthday afterwards and confirms the ledger and audit rows are unchanged.

## 6. Records

Each request keeps: who asked, when, what was done, when it was completed. These records are kept 3 years after closure (proposed) to show deadlines were met.
