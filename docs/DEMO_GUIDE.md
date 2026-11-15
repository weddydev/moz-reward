# Demo guide — Phase 0 (foundation) on staging

A step-by-step script for the person presenting. Follow it top to bottom. Each step has:
**Do** (what you click), **You should see** (so you know it worked), **Say** (what to tell the client).

- **Length:** about 15–20 minutes of demo, plus 10 minutes of preparation the first time.
- **Site:** `https://staging.mozrewards.com`
- **What this demo is:** the foundation is finished and live: sign-in, security, the three apps (customer,
  shop, admin), the design system and the server setup. The loyalty features themselves (shop pages, joining,
  points, offers) are built in the next phase, so most menu pages are designed "coming soon" screens.

---

## Part A — Prepare (do this before the client joins)

### A1. Find your two logins (2 min)
You need two separate things:
1. **The staging gate** (the browser pop-up before the site loads): username `moz` + the password in your
   password manager ("Moz staging basic auth").
2. **The demo accounts** (inside the app): see A2.

### A2. Get the demo accounts (5 min, first time only)
In your own terminal (never paste the output into a chat, email or ticket):
```
ssh talha@72.61.17.208
sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs
```
It prints 7 accounts: **Customer**, **Shop staff** and **Shop owner** (Brew & Bloom Café), and four admins
(**owner, support, moderator, finance**). Copy everything into your password manager entry
"Moz Rewards staging demo accounts".

### A3. Set up the 6-digit codes (3 min, first time only)
Staff and admins sign in with a password **and** a 6-digit code. Pick one:
- **Authenticator app (best for a live demo):** add each account's "TOTP key" (or scan its TOTP URI as a QR code)
  in Google Authenticator / 1Password / Authy. Done once; the keys never change.
- **Or, just before each sign-in:** run
  `sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs --codes`
  (codes change every 30 seconds, so sign in straight after).

### A4. Fresh demo data (1 min, before every demo)
```
sudo docker exec moz-staging-worker-1 node cli/seed.mjs --reset
```
Passwords and codes stay the same.

### A5. Open these tabs
1. `https://staging.mozrewards.com` (log in to the gate with `moz` + password).
2. The **shared Gmail inbox** (the customer's sign-in email arrives there).
3. Your password manager with the demo accounts.
4. Optional: a **private/incognito window** for the second account, so you can show two roles side by side.
5. Optional: your **phone** with the site open, to show the mobile app (Step 9).

### A6. Quick self-check (1 min)
- The site loads after the gate → good.
- If you get a Cloudflare error page or nothing loads, stop and check the troubleshooting table at the end.

---

## Part B — The demo, step by step

### Step 1 — A private, locked site (1 min)
**Do:** Open `https://staging.mozrewards.com` in a fresh private window.
**You should see:** the browser asks for a username and password before anything loads.
**Say:** "This is our private test site. Nobody can reach it without this login, search engines are told not to
list it, and the server itself only accepts traffic that comes through Cloudflare's network. It runs on the same
setup the live app will use."
**Do:** Enter `moz` and the gate password.

### Step 2 — Customer signs in without a password (3 min)
**Do:**
1. Go to `https://staging.mozrewards.com/sign-in`.
2. Type the **Customer** email from your password manager (it looks like `yourinbox+moz-…@gmail.com`).
3. If a small security check box appears, tick it.
4. Click **Email me a sign-in link**.

**You should see:** "Check your email".
**Do:** Switch to the shared Gmail tab, open the new Moz Rewards email, click the sign-in link.
**You should see:** a page with a **Continue** button. Click it. You land in the customer's **Wallet**.
**Say:** "Customers never need a password. They type their email and tap the link. The link works once and
expires, and the extra Continue tap stops email scanners from using the link before the customer does."
**Optional extra:** click the same email link again. It no longer signs anyone in.

### Step 3 — Tour the customer app (2 min)
**Do:** Click through the menu: **Wallet, Offers, Scan, Market, Notifications, Me**.
**You should see:**
- On a laptop: a slim rail on the left. Hover over it and it opens with labels.
- Each page has its title and a short message saying what will appear there.

**Say:** "This is the real app frame the customer will use: navigation, layout, loading and error states. The
content of these pages (cards, points, offers) arrives in the next phase."

### Step 4 — The customer's security page (2 min, fully working)
**Do:** Go to **Me**, then the security page (or open `/me/security`).
**You should see:** **Signed-in devices**, with this device marked **This device**, and buttons to sign out.
**Say:** "Customers can see every device signed in to their account and sign out the others: if a phone is lost,
one tap and it's out."
**Do (optional):** click **Sign out** at the end of this step to show a clean sign-out.

### Step 5 — Shop staff sign in (3 min)
**Do:**
1. Open `https://staging.mozrewards.com/staff/sign-in` (use the private window if the customer is still signed in).
2. Enter the **Shop staff** email and password, click **Sign in**.
3. Enter the 6-digit code from your authenticator (or from `--codes`), click **Verify**.

**You should see:** the shop dashboard for **Brew & Bloom Café** with its menu: Scan, Customers, Offers,
Loyalty, Analytics and more.
**Say:** "Shop teams sign in with a password and a code from an authenticator app, so a stolen password alone
gets nobody in."
**Do:** find **Switch portal** at the bottom of the menu.
**Say:** "Staff are customers too, so they can switch between the shop dashboard and the customer app."

### Step 6 — Owner versus staff (2 min)
**Do:** Sign out, then sign in the same way as the **Shop owner**.
**You should see:** the same dashboard plus **Staff** and **Settings**.
**Do:** Sign back in as **Shop staff** (or use the other window) and paste
`https://staging.mozrewards.com/dashboard/settings` into the address bar.
**You should see:** a "not allowed" page, not the settings.
**Say:** "Permissions are checked by the server on every page, not just by hiding buttons. A member of staff can't
reach the owner's settings even by typing the address."

### Step 7 — Admin roles (3 min)
**Do:** At `/staff/sign-in`, sign in as **Admin: owner** (password + code).
**You should see:** the full admin menu: Applications, Shops, Plans & payments, QR & NFC, Customers, Moderation,
Fraud monitor, Featured slots, Content settings, Broadcasts, Audit log, Team, System.
**Do:** Sign out and sign in as **Admin: support** (then moderator, finance if there's time).
**You should see:** a shorter menu each time:
- **Support:** Applications, Shops, QR & NFC, Customers, Fraud monitor.
- **Moderator:** Moderation, Fraud monitor, Content settings.
- **Finance:** Plans & payments, Featured slots.

**Say:** "Your team gets exactly the access their job needs. Support can't change billing, finance can't
moderate content, and only the owner sees the audit log and system health."

### Step 8 — System health (2 min, fully working)
**Do:** Signed in as **Admin: owner**, open **System** (`/admin/system`).
**You should see:** live status rows for the real servers: database, queues, email, the server firewall,
certificate expiry and more. Some rows (backups, uptime monitoring) show as not set up yet.
**Say:** "This is the live health of the platform. If anything goes wrong, the team gets an email alert, and this
page shows what and when. Backups and uptime monitoring are being switched on as the last foundation steps."

### Step 9 — Look and feel, on a phone and a laptop (3 min)
**Do:**
1. Open `https://staging.mozrewards.com/dev/ui`: the gallery of every building block (buttons, forms, sheets,
   pop-ups, messages).
2. Open `https://staging.mozrewards.com/dev/motion`: page transitions and animations.
3. On your phone (Safari on iPhone, Chrome on Android), sign in as the customer and show the **bottom tab bar**.
4. Optional: turn on **Reduce motion** in the phone's accessibility settings and reload: the animations calm down.

**Say:** "Everything is built from one design system, so every screen feels the same. It works on any phone, keeps
clear of the notch, and respects people who switch off motion. These gallery pages exist only on the test site."

### Step 10 — Wrap up (1 min)
**Say:** "That's the foundation: secure sign-in for every role, the three apps, permissions, health monitoring and
the live server. Next we build the shop pages, joining a shop, and collecting points."
**Do:** Sign out of every account.

---

## Part C — If the client asks…

| Question | Answer |
|---|---|
| "Can I try it myself?" | Yes: give them the gate login and one demo account **through a password manager share**, never by email or chat. |
| "Why are most pages empty?" | This phase built the foundation every feature stands on. Features fill these pages from the next phase. |
| "Is this real data?" | No. Shops and people are invented demo data, reset before each demo. |
| "Will it work on iPhone?" | Yes, in Safari. Installing it on the home screen and the Android Play Store app come in a later phase. |
| "What's coming next?" | Shop landing pages (scan a shop's code), the welcome animation, joining a shop and your member card. |
| "Is it secure?" | Two-step sign-in for staff, permissions checked on every request, encrypted backups, and a private server reachable only through Cloudflare. |

**Don't promise yet:** points, rewards, offers, notifications, payments, the Android app or a launch date. They
are later phases.

---

## Part D — After the demo

1. Sign out of every account and close the private windows.
2. Write down the client's feedback and questions, and tell Claude (it goes into the project notes).
3. Nothing to clean up: the next demo starts with step A4 (fresh demo data).

---

## Troubleshooting

| Problem | Fix |
|---|---|
| The browser keeps rejecting the gate login | Use a new private window (browsers remember old logins). Still failing: the password was changed; check the password manager. |
| No sign-in email | Wait 30 seconds and check the shared inbox's spam and "All mail". Make sure you typed the full `…+moz-…@` address. |
| "Link expired" | Links are single-use and short-lived. Request a new one (Step 2). |
| The 6-digit code is refused | Codes last 30 seconds: wait for a fresh one. Check the phone's clock is set automatically. |
| "Too many attempts" | Wait a minute; sign-in is rate-limited on purpose. |
| Cloudflare error page (52x) | Tell Claude: the server or firewall needs a look (RUNBOOK §13). |
| A page shows "not allowed" unexpectedly | You're signed in as a role that can't open it: check which account you're in. |
