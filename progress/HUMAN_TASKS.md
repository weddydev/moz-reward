# HUMAN TASKS — things only the developers can do

Claude keeps this list current. It is reviewed and updated at every sub-phase and phase close, at every `/handoff`, and whenever a new dependency appears. Claude does everything it can itself first (CLI tools, generated configs, scripts); only what truly needs a human is listed here, with exact steps.

**Priority legend**
- 🔴 **Blocking now**: work is waiting on it; Claude has moved on to other tasks meanwhile
- 🟠 **Needed soon**: needed within the current or next phase
- 🟢 **Later**: needed before launch or a later phase; do it whenever convenient

**Secrets rule (SECURITY, plan v5).** Laptops hold **dev-only** keys (`.env.local`, shared through the password-manager note). **Staging and production secrets go only into GitHub secrets (you run `gh secret set NAME` and paste the value into your own terminal) and the password manager.** Never paste a staging or production secret into chat, and never give one to Claude — Claude never needs to see it.


**Order now (no deadlines, CLAUDE.md "Pace"):** H-45 first (quick, staging is live); H-48b at P2 start, after the first demo (human, 25 Nov), H-12 early (Google verification takes days), then the rest as each "Needed by" comes up. Finished tasks live in **`progress/HUMAN_TASKS_DONE.md`** (index + full log + the steps as followed).

## Open

_Cross-checked by Claude on 23 Nov 2026 (Mac): staging health answers without a password, the Mac's `gh` scopes, the remote branch list and Renovate activity were checked directly; tasks only the human can see (Sentry, UptimeRobot, Play Console, the Windows laptop) are marked "ask"._

| ID | Priority | Task | Needed by | Why | Est. time |
|---|---|---|---|---|---|
| H-45 | 🟠 | **UptimeRobot staging monitors.** Ready since 23 Nov: Claude checked `/api/health/ready` 200, `/api/health/worker` 200 and `/api/health/live` `{"status":"ok"}` with no password. In the UptimeRobot dashboard add HTTP(s) monitors `https://staging.mozrewards.com/api/health/ready` and `…/api/health/worker`, and a Keyword monitor on `…/api/health/live` for `"status":"ok"`; 5-min interval; alert contacts both developers' emails + the app on both phones (RUNBOOK §3). Then tell Claude, who stops the staging web container briefly for the phone-alert test. **Ask:** already done? | P1-18 (C-48; was "P0-15 E", carried when P0 closed 17 Nov) | Outside uptime alerts are a P0-15 acceptance criterion, carried to P1-18 | 10 min + alert test with Claude |
| H-48b | 🟢 | **Confirm the staging Sentry probe and review staging releases**: in Sentry (project `4512396703694928`, environment staging) find the issue "H-48 probe error from staging (2026-11-22T06:55:59.241Z): ignore", event `bdc54839dbbb40f3924fc1b968cc5ce8`; tell Claude "H-48b done", then resolve the issue. Also look through every staging release since 22 Nov (from `d59a2eb`, including the P1-B close `bb82b00` and the demo rehearsals) for new errors and list any to Claude. | **P2 start, after the first client demo** (human, 25 Nov: held until then; C-88) | Claude checked the DSN in web-1, web-2 and worker and Sentry accepted the probe (HTTP 200); only you can see the Sentry dashboard | 10 min |
| H-12 | 🟠 | Google Play Console — **organisation** developer account (avoids the 14-day closed test for new personal accounts); verification takes days | **Start now**; verified before P5-04 (verification takes days) | Android app; launch date | 20 min + Google verification |
| H-23 | 🟠 | Solicitor: review compliance drafts (ROPA, DPIA, processor register, retention schedule) after P0-21 | Before any real customer data (launch); DPIA well before launch | UK GDPR / PECR / DUAA obligations | Client side |
| H-37 | 🟠 | Listen and feel check of the four sounds and three haptic patterns on desktop Chrome, an **iPhone (Safari)** and an Android phone (Chrome) | Before P1-15 builds the points-credited moment (it is the first sound not started by a tap; P1-06 was the pure engine, no sound) | Claude can prove what is synthesised and when, not how it sounds; tuning "warm, short, never gamey" needs ears (DESIGN §9) | 10 min |
| H-31b | 🟢 | **Renovate isn't running.** Installed 13 Nov (H-31), but Claude found no Renovate PR and no "Dependency Dashboard" issue on 23 Nov, although `renovate.json` (`config:recommended`) schedules it every Monday before 7am London (16 Nov passed with nothing). Check the installation; steps below | Before P1 closes | Dependency and security updates (ENGINEERING §14) | 5 min |
| H-29 | 🟢 | Phase-end backup check: run `pnpm backup:verify` on your laptop (needs the backup private key from the password manager) | Next: the P1 phase close (covers P0 and P1, C-49) | Proves the encrypted backups can really be restored (the server never holds the private key) | 10 min / phase |
| H-13 | 🟢 | Test each demo on a real Android phone and a real iPhone. **PD-B (23 Nov):** on `/dev/molten`, the member card's tilt and idle sway (iOS + Android), its 3D flip in Safari, and the slider's touch drag. PD-C adds the floating dock (PD-07) | Every phase end; PD items by the PD phase close | Real-device check | 15 min / phase |
| H-14 | 🟢 | Send the client the demo notes and collect feedback | Every phase end | Client sign-off | — |
| H-30 | 🟢 | **Mac** `gh` billing scope: `gh auth refresh -h github.com -s user` (browser sign-in). Claude checked 23 Nov: the Mac token still has only `gist, read:org, repo, workflow` (Windows done 21 Nov) | Next time on the Mac | `pnpm ci:usage` then reads the exact Actions minutes instead of an estimate | 2 min |
| H-38 | 🟢 | **Delete merged remote branches** (Claude's branch deletion is refused by the permission settings). List re-checked 23 Nov: the first group was squash-merged and verified on main (14 Nov audit, P1 branches 17–19 Nov); the second group is fully contained in main (`git merge-base --is-ancestor`, 23 Nov). One command: `git push origin --delete wip/P0-08 wip/P0-09 wip/P0-10 wip/P0-12 wip/P0-12-b wip/P0-13 wip/P0-18 wip/P0-C-close wip/h40-check wip/P1-02 wip/P1-03 wip/P1-04 wip/P1-07 wip/P1-09 wip/P1-A-close wip/e2e-timing wip/PD-01 wip/P0-15 wip/PD-03 wip/PD-04 wip/PD-05 wip/PD-06 wip/p0-17-test-infra wip/process-gate` (`wip/P0-15` was kept earlier while unmerged; it is now in main). Then tell Claude, who prunes and re-lists **Added 23 Nov evening (all merged into main or superseded):** remote `wip/PD-07`, `wip/PD-07-b`, `wip/PD-07-bisect-css`, `wip/PD-07-bisect-code`, `wip/PD-08`, `wip/PD-08-b`, `wip/process-fixes` (e.g. `git push origin --delete wip/PD-07 wip/PD-07-b wip/PD-07-bisect-css wip/PD-07-bisect-code wip/PD-08 wip/PD-08-b wip/process-fixes`), or tell Claude to and approve the prompt. **Added 24 Nov:** `wip/PD-09` (in main, `git merge-base --is-ancestor` checked). | Any time | Tidy branch list; nobody switches to a stale branch | 2 min |
| H-26b | 🟢 | **Delete the backup private key from the Windows laptop's GnuPG keyring.** The password-manager copy is proven (both staging `backup:verify` runs passed from it, 16 Nov), so the keyring copy is no longer needed; steps below | Any time (H-26 leftover) | The private key should live only in the password manager (H-26) | 2 min |
| H-51 | 🟢 | **Windows laptop in WSL2: leftovers** (your steps 1–4 done 22 Nov; Claude did the rest: `gh` installed and signed in, node 24 + pnpm, repo in `~/moz-reward`, `.wslconfig` 11 GB / 8 CPUs, Docker integration on, Ubuntu the default distro, Playwright browsers, `setup:env`, services, migrations; DECISIONS 22 Nov; (a) VPS from WSL done 22 Nov). Left, your part only: (b) **optional dev keys**: if the Windows `D:\moz-reward-git\moz-reward\.env.local` holds dev-only provider keys beyond what `pnpm setup:env` generates, copy those lines into `~/moz-reward/.env.local` (Claude never reads env files); (c) **optional tidy (H-34 leftover)**: delete the dead `.env.sentry-build-plugin` and the local branch `local/sentry-wizard` in the old Windows checkout. From now on open this laptop's work in the VS Code **WSL** window. **Ask:** (b) done? | Before the next VPS step (deploys go through CI, so not urgent) | Same results as the Mac and CI | 5 min |
| H-46 | 🟢 | **Cloudflare rate-limit backstop on `/s/*`** (free plan, one rule; our own 60/min/IP limit is the real control) | Before launch (P5-12); any time | Stops floods of shop-code lookups before they reach the VPS (C-15, SECURITY §6) | 3 min (steps below) |
| H-08b | 🟠 | **Storage buckets on R2 (or B2 like the backups; decide then)**, two kinds per environment: (1) **private** `moz-rewards-private-staging` / `moz-rewards-private` for receipt PDFs (P1-12): **never** connect a custom domain or public access to these; (2) uploads `moz-rewards-staging` / `moz-rewards` for P2 (its `public/` files are served by `cdn.`). One bucket-scoped read/write key per bucket; store each in the password manager. Claude's part: set them as GitHub secrets from a local file (never shown), add them to the deploy env, and smoke-test a receipt download on staging. **Ask:** buckets made? | P1-C close (receipt download on staging); uploads before P2 | Receipt PDFs need private storage (DECISIONS 26 Nov "receipt PDFs"): until then staging receipts answer "still being prepared" | 15 min |
| H-52 | 🟠 | **Live-update stream check on staging (C-95)**: in a desktop browser signed in to staging as the demo customer, paste a 6-line snippet into the console and paste its output back (steps below; ~2 min of waiting). Proves updates aren't held back by Cloudflare/Caddy buffering. Claude can't do it: it needs a signed-in browser through the site gate. **Ask:** output? | P1-18 | C-95 (P1-10 edge case: proxy buffering) | 5 min |
| H-28b | 🟢 | Google OAuth **branding**: Branding → app name, logo, support email, privacy policy and terms URLs → **Publish app** → brand verification Both clients are done (H-28 in HUMAN_TASKS_DONE.md); steps below | Before P5-04 | App name and logo on the Google sign-in screen; until then only the consent screen's test users can sign in with Google if it is still in Testing | 15 min (+ Google brand review: minutes to 3 working days) |
| H-09 | 🟢 | Gemini **paid** (pay-as-you-go) API key with a project spend cap | P3 start | AI review help; UK apps may use only Gemini's paid services | 15 min |
| H-24 | 🟢 | Client: pen test (optional, client-funded); support after launch | P5 start | Launch readiness; see steps | 20 min with the client |
| H-15 | 🟢 | Client's solicitor reviews the legal page drafts | P5 | Launch | Client side |

## Steps (open tasks only)

### H-52 — Live-update stream check on staging (C-95)
1. Chrome on a laptop: open the staging site, pass the site password, sign in as the demo customer (Claude prints the sign-in details with `pnpm demo:credentials` when you ask; the code arrives in the demo inbox).
2. Open the Wallet, then DevTools (⌥⌘J) → Console, paste this and press Enter:
   ```js
   const r = await fetch('/api/sse/me'), rd = r.body.getReader(), dec = new TextDecoder(), t0 = performance.now();
   setTimeout(() => rd.cancel(), 60000);
   for (;;) { const { value, done } = await rd.read(); if (done) break;
     console.log(Math.round(performance.now() - t0), JSON.stringify(dec.decode(value))); }
   ```
3. Wait 60 s, then copy the printed lines into the chat. Expected: `event: ready` within ~1,000 ms, then a `:` heartbeat line about every 25,000 ms. The output holds no personal data (the ready event is empty).

### H-46 — Cloudflare rate-limit backstop on `/s/*`
Cloudflare dashboard → mozrewards.com → Security → WAF → Rate limiting rules → Create: name `moz-shop-lookup`; expression `starts_with(http.request.uri.path, "/s/")`; characteristics **IP**; **50 requests per 10 seconds**; action **Block**, duration 10 s → Deploy. Tell Claude when done (Claude checks it from outside). Details: RUNBOOK §17.

### H-28b — Google OAuth branding (the leftover of H-28)
Both OAuth clients exist (H-28 in HUMAN_TASKS_DONE.md). Sign-in-only apps (scopes `openid email profile`) are exempt from Google's "Testing" limits; publishing is needed only to show the app name and logo.
1. Google Cloud → project `Moz Rewards` → Google Auth Platform → **Branding**: app name, logo, support email, privacy policy and terms URLs.
2. **Publish app** → complete brand verification (automated in minutes, or 2–3 working days).
3. Tell Claude "H-28b done".

### H-31b — Renovate isn't running
1. github.com → your avatar → Settings → Applications → **Installed GitHub Apps** → Renovate → **Configure**: check `weddydev/moz-reward` is listed under "Only select repositories" (add it if not) → Save.
2. Open https://developer.mend.io, sign in with GitHub, pick `weddydev/moz-reward`: the job log says whether Renovate ran and why it made nothing (e.g. onboarding waiting, config error).
3. Tell Claude what you saw. **Claude's part:** fix `renovate.json` if the log shows a config error, then check for the Dependency Dashboard issue after the next Monday run.

### H-26b — Delete the backup private key from the Windows keyring
1. On the Windows laptop, in PowerShell (Gpg4win): `gpg --delete-secret-keys 1D1D1BF1F6FDA0F2EDA8FAA0D356B5CAA21C0F58` and confirm the prompts. The public key stays.
2. `gpg -K` must no longer list that fingerprint. Tell Claude "H-26b done".
3. Later restores and the phase-end check (H-29) import the private key from the password manager ("Moz Rewards backup key") when needed.

### H-12 — Google Play Console
1. play.google.com/console → sign up as an **organisation** (needs the client's D-U-N-S number) → pay $25. An organisation account avoids the closed-testing requirement (12 testers for 14 days) that new personal accounts must complete before production.
2. Complete identity verification (can take several days — start now).
3. Tell Claude when verified; the TWA listing assets are prepared in P5.

### H-23 — Solicitor review of compliance drafts
1. Send the solicitor the whole `docs/compliance/` folder (start with its README: ten questions that need a decision) and COMPLIANCE §2–§4, §7.
1a. Client side, before launch: pay the ICO data protection fee, name the data protection contact, and sign a processing agreement with each provider in `PROCESSOR_REGISTER.md`.
2. Return the changes to Claude before real customer data (launch).

### H-09 — Gemini (paid tier)
1. aistudio.google.com → project `Moz Rewards` → set up billing (pay-as-you-go) → set a **project spend cap** (Billing → spend cap) → create an API key.
2. Dev key → `.env.local` as `AI_API_KEY`; staging/production key → GitHub secrets yourself. The feature stays off (flag) until the key exists; the app also enforces its own daily cap.

### H-24 — Launch support decisions (client)
1. **Pen test:** optional and paid by the client. Without it, P5 relies on authenticated ZAP, the SECURITY checklist and our reviewers — we don't promise a pen test.
2. **Support after launch:** best-effort business hours by the two developers, uptime alerts to both phones, no 24/7 rota. Ongoing support is outside the build scope and needs a separate agreement.
3. Admin SSO is dropped (super admins use passkeys).

### H-37 — Sound and haptics listen check (P0-11)
1. Run `pnpm dev` and open `http://localhost:3000/dev/motion` on desktop Chrome (staging URL `/dev/motion` once P0-15 is live, for the phones).
2. Scroll to "Sound and haptics". Press each "Play …" button: `credit` (two rising notes), `reward` (three-note arpeggio), `tick` (one short blip), `arrival` (a soft swell). They should be quiet, warm and short; nothing harsh or game-like.
3. On the iPhone (the important one: audio unlock on iOS can only be proven on a real device): reload the page, tap once anywhere that is not a button, then press "Play credit": the very first press must produce sound (ring switch on, volume up). Then lock the phone for a minute, unlock, press "Play tick": it must sound on the first or second press, and never as a burst of several sounds at once; the "Vibrate" buttons say "No vibration" (expected: iPhone has none for web pages).
4. On the Android phone: the "Vibrate" buttons buzz (short press, double pulse for credit, longer pattern for reward).
5. Switch "Sounds and haptics" off: every button stays silent and still. Switch it on again: they work.
6. Tell Claude anything that sounds wrong (which sound, which device, too loud / too sharp / too long).

