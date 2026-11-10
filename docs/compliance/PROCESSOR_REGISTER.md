# Processor and third-party register

**Status: Draft — requires legal review (H-23). Not legal advice.** Source: COMPLIANCE §2.3, ARCHITECTURE §1 and §10. Last updated 10 Nov 2026.

**Rule:** no provider goes live without a row here. A task that adds a provider adds its row in the same commit.

**What is not yet confirmed.** The contracting entity, server locations and transfer basis in this table are what we expect from each provider's public terms. They have not been checked against a signed agreement. "Transfer basis" must be one of: UK adequacy (this includes the EU/EEA, and the UK–US data bridge for certified United States companies), the International Data Transfer Agreement, or the UK Addendum to the EU standard clauses. The client fills the last two columns when it signs.

## 1. Processors (they handle personal data for us)

| Provider | What it does for us | Personal data it handles | Where | Transfer basis (to confirm) | DPA signed | Sub-processor list |
|---|---|---|---|---|---|---|
| Hostinger | The server that runs the app, worker, databases, logs and analytics, for production and staging | Everything stored by the service | Server in the United Kingdom. Contracting entity and support-access locations to confirm | None needed if the data stays in the UK; confirm for support access | No | To add |
| Cloudflare (DNS, proxy, Tunnel, firewall rules, CDN) | Carries all traffic to the server; caches static files and processed images only (never pages) | IP addresses and request data in transit; images people uploaded | Global network; United States company | Data bridge or Addendum | No | To add |
| Cloudflare R2 | Stores uploaded images and the encrypted backups | Processed images (location data stripped); backups it cannot read (encrypted before upload, key held off the server) | Europe location hint | As above | No | To add |
| Cloudflare Turnstile | Bot check on sign-in, registration, reveal and report forms | IP address and browser signals of the person being checked | Global network | As above | No | To add |
| Resend (primary email) | Sends sign-in links, security notices, staff invites, shop-account mail, plan reminders, data-request notices, the weekly owner email | Recipient email address and the message content | United States company | Data bridge or Addendum | No | To add |
| Brevo (failover email) | The same mail when the primary is down or at its daily limit | As above | EU company | UK adequacy (EU) | No | To add |
| Sentry | Error monitoring for web and worker | Error reports after scrubbing: no user, cookies, request bodies or query strings; emails and phone numbers removed from text | United States company; choose the EU data region at sign-up where offered | Data bridge or Addendum | No | To add |
| Google (Gemini API, paid service) | Drafts review text when a customer asks for help | Stars, chosen phrases and the customer's note with names, emails, phones, member IDs and postcodes removed | To confirm | Data bridge or Addendum | No | To add |
| Google (Business Profile API) | Optional, off at launch: lets a shop reply to its Google reviews | The shop's Google account connection and its replies | To confirm | As above | Only if enabled | To add |

Gemini is used on the **paid** service only. For users in the United Kingdom only the paid services may be used, and under the paid terms prompts and responses are not used to improve Google's products. The feature stays off until a paid key exists.

## 2. Independent controllers we pass data to or receive it from

| Party | What happens | Data | Note |
|---|---|---|---|
| Google (sign-in with Google) | The customer signs in at Google; Google tells us who they are | Email, name, Google account identifier, whether the email is verified | Scopes limited to `openid email profile`. Staff and admins cannot use it |
| Browser push services (Google, Apple, Mozilla, Microsoft) | Deliver a notification to the person's device | The push address issued by the browser and an encrypted message. No personal data beyond the message text | Chosen by the person's browser, not by us |
| Each shop | Sees its own members' data | See [CONTROLLER_ROLES.md](CONTROLLER_ROLES.md) §2 | Terms in the Shop Terms |
| Google Play | Distributes the Android app | None from us. Google collects its own store data | Play data safety form in Phase 5 |

## 3. Third parties that receive something that is not, or is barely, personal data

| Party | What it receives | Why it is listed |
|---|---|---|
| postcodes.io | A postcode typed for "Near me" or a shop address lookup | A postcode alone, with no account attached; never stored by us against a person |
| Have I Been Pwned (password range API) | The first 5 characters of a hash of a staff or admin password being set | The password and its full hash never leave our server; fails open with a warning after 3 seconds |
| UptimeRobot | Our public addresses and the developers' contact details | No customer data |
| Google Maps (directions link) | Nothing from us: the customer's own browser opens a link with the shop's coordinates | Listed so the Privacy Policy can mention the link |
| Google (review link) | Nothing from us: the customer's browser opens Google's review page; the text is copied to their clipboard on their device | As above |

## 4. Development and delivery (no production personal data)

| Party | Role | Data |
|---|---|---|
| GitHub | Code hosting and automated checks | Code and synthetic test data only. Deploy credentials are held as GitHub secrets |
| Renovate (GitHub app) | Proposes dependency updates | Code only |

## 5. Not a processor

- **Umami analytics** runs on our own server with its own database, so no data leaves us.
- **Fonts** are served from our own domain.
- **Redis, Postgres, Mailpit, MinIO** are software we run ourselves.
- **Grafana Cloud** is mentioned in the architecture as a possible later addition. It is not in use and gets a row in section 1 before it ever is.

## 6. Before a provider goes live

1. Row added here with purpose, data and location.
2. Data processing agreement signed; date and the sub-processor page recorded.
3. Transfer basis confirmed from that agreement.
4. Privacy Policy lists the provider or its category.
5. For a metered provider: a spend or quota alert (ARCHITECTURE §10).
