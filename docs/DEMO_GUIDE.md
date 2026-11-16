# Demo guide — step by step (Phase 0, staging)

Follow this from the top, one step at a time. Nothing is assumed: every link, every thing to type and where to
find it is written out. Do **Part 1** once, **Part 2** alone as a practice run, and **Part 3** with the client.

The test website is: **https://staging.mozrewards.com**

---

## Part 1 — One-time setup (about 15 minutes)

### 1.1 Get the list of demo accounts

You need the demo accounts' emails and passwords. They are printed by a command on the server.

1. On your Mac, press **Cmd + Space**, type **Terminal**, press **Enter**. A black/white window opens.
2. Type this and press **Enter**:
   ```
   ssh talha@72.61.17.208
   ```
   (The first time it may ask "Are you sure you want to continue connecting?": type `yes`, press Enter.)
   You are now on the server. The line now starts with something like `talha@srv…`.
3. Type this and press **Enter**:
   ```
   sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs
   ```
4. You see a list like this (your values are different):
   ```
   Customer (email link)
     email     yourinbox+moz-customer@gmail.com
     sign in   email link

   Shop staff, Brew & Bloom Café
     email     yourinbox+moz-staff@gmail.com
     password  xxxxxxxxxxxxxxxx
     TOTP key  ABCD EFGH IJKL ...
     TOTP URI  otpauth://...
     code now  123456
   ...
   ```
   There are 7 blocks: **Customer**, **Shop staff**, **Shop owner**, **Admin: owner**, **Admin: support**,
   **Admin: moderator**, **Admin: finance**.
5. Select all of that text, copy it (**Cmd + C**) and paste it into a new **secure note** in your password manager
   called **Moz Rewards staging demo accounts**. Don't paste it anywhere else (not in chat, email or Slack).
6. Leave Terminal open; you'll use it in 1.2.

### 1.2 Put the 6-digit codes on your phone

Shop staff and admins sign in with a password **and** a 6-digit code from a phone app. You set this up once for
the 6 accounts that have a "TOTP key".

1. On your phone, install **Google Authenticator** (free, App Store / Play Store).
2. Open it, tap **+** (bottom right), then **Enter a setup key**.
3. Fill in:
   - **Account name:** `Moz staff`
   - **Your key:** the **TOTP key** from the **Shop staff** block (type it exactly; spaces don't matter)
   - **Type of key:** Time based
   - Tap **Add**.
4. Repeat step 2–3 for the other five, naming them: `Moz owner`, `Moz admin owner`, `Moz admin support`,
   `Moz admin moderator`, `Moz admin finance`, each with its own TOTP key.
5. You now see six entries, each with a 6-digit code that changes every 30 seconds.

> **No phone handy?** You can get the current codes in Terminal instead (on the server, as in 1.1):
> `sudo docker exec moz-staging-worker-1 node cli/demo-credentials.mjs --codes`
> It prints e.g. `staff  123456`. Codes last 30 seconds, so type them straight away.

### 1.3 The two logins you'll use (read this once)

There are **two different logins**, and they are easy to mix up:

| Login | When it appears | What to enter |
|---|---|---|
| **The site gate** | A small browser pop-up the very first time you open the site | Username `moz` + the staging gate password from your password manager |
| **A demo account** | The app's own sign-in page | The email (+ password + code) of one demo account from 1.1 |

---

## Part 2 — Practice run on your own (about 20 minutes)

Do this once before the client demo, so nothing is a surprise. Part 3 is the same steps with talking points.

### Before every practice or demo: refresh the demo data
In Terminal on the server (1.1 steps 1–2), run:
```
sudo systemctl start moz-seed-reset
sudo journalctl -u moz-seed-reset -n 5 --no-pager
```
The first command takes about a minute and prints nothing. The last line of the second must say
`seed-reset staging: done`. Passwords and codes stay the same. (It also runs by itself every Monday at 04:30.)

### Account cheat sheet

| Account (block in your secure note) | Sign in at | You land on | Sign out at |
|---|---|---|---|
| Customer | https://staging.mozrewards.com/sign-in | Wallet | https://staging.mozrewards.com/me/security → **Sign out** |
| Shop staff | https://staging.mozrewards.com/staff/sign-in | Shop dashboard | https://staging.mozrewards.com/staff/security → **Sign out** |
| Shop owner | https://staging.mozrewards.com/staff/sign-in | Shop dashboard | https://staging.mozrewards.com/staff/security → **Sign out** |
| Admin: owner / support / moderator / finance | https://staging.mozrewards.com/staff/sign-in | Admin home | https://staging.mozrewards.com/staff/security → **Sign out** |

**Always sign out before signing in as the next account.**

---

## Part 3 — The client demo, step by step

Use **Google Chrome** on your laptop. Have your password manager and your phone (Google Authenticator) next to
you. Each step: **Go to** (the link), **Do** (what to click or type), **Check** (what you should see), **Say**
(what to tell the client).

### Step 1 — Open the private test site (1 min)

- **Go to:** https://staging.mozrewards.com
- **Do:** a pop-up asks for a username and password. Type `moz` and the **site gate** password. Click **Sign in**.
- **Check:** the Moz Rewards site opens.
- **Say:** "This is our private test site. Nobody can open it without this login, search engines can't list it,
  and the server only accepts visitors that come through Cloudflare. It runs on the same setup the real app will use."

### Step 2 — Sign in as a customer (no password) (3 min)

- **Go to:** https://staging.mozrewards.com/sign-in
- **Do:**
  1. In the email box, type the **Customer** email from your secure note (`…+moz-customer@…`).
  2. If a small "verify you are human" box appears, tick it.
  3. Click **Email me a sign-in link**.
- **Check:** the page says **Check your email**.
- **Do:**
  4. Open the **shared Gmail inbox** in a new tab (the inbox the demo emails go to).
  5. Open the newest email from Moz Rewards. Click the sign-in link in it.
  6. A page with a **Continue** button opens. Click **Continue**.
- **Check:** you are in the customer **Wallet**.
- **Say:** "Customers never need a password. They type their email and tap the link. Each link works once and
  expires, and the extra Continue tap stops email security scanners from using the link first."

### Step 3 — Look around the customer app (2 min)

- **Do:** click each item in the menu on the left: **Wallet**, **Offers**, **Scan**, **Market**, **Notifications**, **Me**.
  Move the mouse over the narrow menu on the left: it slides open and shows the names.
- **Check:** each page opens with its title and a short "what will appear here" message.
- **Say:** "This is the real app frame customers will use: menus, layout, loading and error screens. The content
  (your shop cards, points, offers) is added in the next phase."

### Step 4 — The customer's security page (2 min)

- **Go to:** https://staging.mozrewards.com/me/security
- **Check:** a list called **Signed-in devices**, with your laptop marked **This device**.
- **Say:** "Customers see every device signed in to their account and can sign the others out. Lost phone: one tap."
- **Do:** click **Sign out**.
- **Check:** you are signed out (you see the sign-in page).

### Step 5 — Sign in as shop staff (3 min)

- **Go to:** https://staging.mozrewards.com/staff/sign-in
- **Do:**
  1. **Email:** the **Shop staff** email (`…+moz-staff@…`).
  2. **Password:** the **Shop staff** password.
  3. If a "verify you are human" box appears, tick it. Click **Sign in**.
  4. A box asks for a 6-digit code. On your phone, open Google Authenticator, read the code under **Moz staff**,
     type it, click **Verify**.
- **Check:** you are in the shop dashboard for **Brew & Bloom Café**, with a menu: Scan, Customers, Offers,
  Loyalty, Analytics and more.
- **Say:** "Shop teams sign in with a password and a code from their phone, so a stolen password alone is useless."
- **Do:** at the bottom of the menu, click **Switch portal**.
- **Check:** a small window lists the shop dashboard and the customer app.
- **Say:** "Staff are customers too, so they can switch between the shop side and the customer side."
- **Do:** press **Esc** to close it.

### Step 6 — Show that staff can't open owner pages (1 min)

- **Go to:** https://staging.mozrewards.com/dashboard/settings (type it in the address bar while still signed in as staff)
- **Check:** a **"not allowed"** page appears instead of the settings.
- **Say:** "Permissions are checked by the server on every page, not just by hiding buttons. Staff can't reach the
  owner's settings even by typing the address."
- **Do:** sign out: go to https://staging.mozrewards.com/staff/security and click **Sign out**.

### Step 7 — Sign in as the shop owner (2 min)

- **Go to:** https://staging.mozrewards.com/staff/sign-in
- **Do:** sign in like Step 5, but with the **Shop owner** email + password, and the code under **Moz owner**.
- **Check:** the same dashboard, plus two extra menu items: **Staff** and **Settings**.
- **Do:** click **Settings**. It opens this time.
- **Say:** "The owner sees everything staff see, plus managing the team and the shop's settings."
- **Do:** sign out at https://staging.mozrewards.com/staff/security → **Sign out**.

### Step 8 — Sign in as the admin owner (Moz Rewards' own team) (3 min)

- **Go to:** https://staging.mozrewards.com/staff/sign-in
- **Do:** sign in with the **Admin: owner** email + password, and the code under **Moz admin owner**.
- **Check:** the admin area, with the full menu: Applications, Shops, Plans & payments, QR & NFC, Customers,
  Moderation, Fraud monitor, Featured slots, Content settings, Broadcasts, Audit log, Team, System.
- **Say:** "This is your team's control room for the whole platform."

### Step 9 — The live System health page (2 min)

- **Do:** still as Admin: owner, click **System** in the menu (or go to https://staging.mozrewards.com/admin/system).
- **Check:** a list of live status rows: database, queues, email, the server firewall, certificate expiry and more.
  Some rows (backups, uptime monitoring) say they aren't set up yet. That's expected.
- **Say:** "This shows the live health of the platform. If something breaks, the team gets an email and this page
  shows what and when. Backups and uptime checks are being switched on as the last foundation steps."
- **Do:** sign out at https://staging.mozrewards.com/staff/security → **Sign out**.

### Step 10 — Different admin jobs see different menus (3 min)

Do this for **Admin: support**, then (if there's time) **Admin: moderator** and **Admin: finance**:
- **Go to:** https://staging.mozrewards.com/staff/sign-in → sign in with that admin's email + password + its code.
- **Check** the menu:
  - **Support:** Applications, Shops, QR & NFC, Customers, Fraud monitor.
  - **Moderator:** Moderation, Fraud monitor, Content settings.
  - **Finance:** Plans & payments, Featured slots.
- **Say:** "Each person on your team only gets what their job needs. Support can't touch billing, finance can't
  moderate, and only the owner sees the audit log and system health."
- **Do:** sign out at https://staging.mozrewards.com/staff/security → **Sign out** before the next one.

### Step 11 — The design and animations (2 min)

- **Go to:** https://staging.mozrewards.com/dev/ui
- **Check:** a gallery of every building block (buttons, forms, pop-ups, messages). Scroll through it.
- **Go to:** https://staging.mozrewards.com/dev/motion
- **Check:** page transitions and animations; click around.
- **Say:** "Every screen is built from this one design system, so the whole app looks and feels the same. These
  gallery pages exist only on the test site."

### Step 12 — On a phone (2 min, optional)

- **Do:** on your phone, open https://staging.mozrewards.com (Safari on iPhone, Chrome on Android), enter the site
  gate login, then sign in as the **Customer** (Step 2) using the same Gmail inbox.
- **Check:** the menu is now a **tab bar at the bottom** of the screen, clear of the notch.
- **Say:** "Same app on a phone, laid out for thumbs."
- **Optional:** turn on **Reduce Motion** (iPhone: Settings → Accessibility → Motion) and reload: the animations
  become calmer. "We respect people who switch off motion."

### Step 13 — Wrap up (1 min)

- **Say:** "That's the foundation: secure sign-in for every role, the customer, shop and admin apps, permissions,
  health monitoring and the live server. Next we build the shop pages, joining a shop and collecting points."
- **Do:** sign out of any account still signed in.

---

## If the client asks…

| Question | Answer |
|---|---|
| "Can I try it myself?" | Yes. Share the gate login and one demo account **through your password manager's share feature**, never by email or chat. |
| "Why are most pages empty?" | This phase built the foundation every feature stands on. The features fill these pages from the next phase. |
| "Is this real data?" | No. The shops and people are invented, and we reset them before every demo. |
| "Does it work on iPhone?" | Yes, in Safari. Installing it on the home screen and the Android Play Store app come in a later phase. |
| "What's next?" | Shop pages (scan a shop's code), the welcome animation, joining a shop and your member card. |
| "Is it secure?" | Two-step sign-in for staff, permissions checked on every request, encrypted backups, and a private server reachable only through Cloudflare. |

**Don't promise yet:** points, rewards, offers, notifications, payments, the Android app or a launch date.

---

## When something goes wrong

| What happens | What to do |
|---|---|
| The gate pop-up keeps coming back | Close Chrome completely and open it again, or use a new Incognito window (Cmd + Shift + N). Check the gate password in your password manager. |
| "Email or password is incorrect" | Copy the email and password again from your secure note (no spaces at the start or end). Make sure you're using the right block. |
| No email arrives (Step 2) | Wait 30 seconds, then look in Spam and "All mail" in Gmail. Check you used the `…+moz-customer@…` address. |
| "Link expired" | Each link works once and only for a short time. Go back to Step 2 and send a new one. |
| The 6-digit code is refused | Wait for the next code (they change every 30 s) and type it quickly. Make sure you're reading the right account in the app. |
| "Too many attempts" | Wait one minute, then try again (sign-in is slowed down on purpose after mistakes). |
| You land in the wrong area | You're still signed in as the previous account. Sign out (cheat sheet) and sign in again. |
| A Cloudflare error page (520–526) or the site doesn't load | Tell Claude: the server needs a look. |
| Terminal says `Permission denied` on `ssh` | Your Mac's SSH key isn't loaded: tell Claude. |
