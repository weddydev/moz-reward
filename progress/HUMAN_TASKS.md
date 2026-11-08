# HUMAN TASKS — things only the developers can do

Claude keeps this list current. It is reviewed and updated at the end of every phase and sub-phase, at every `/handoff`, and whenever a new dependency appears. Claude does everything it can itself first (CLI tools, generated configs, scripts); only what truly needs a human is listed here, with exact steps.

**Priority legend**
- 🔴 **Blocking now**: work is waiting on it; Claude has moved on to other tasks meanwhile
- 🟠 **Needed soon**: needed within the current or next phase
- 🟢 **Later**: needed before launch or a later phase; do it whenever convenient

## Open

| ID | Priority | Task | Needed by | Why | Est. time |
|---|---|---|---|---|---|
| H-01 | 🟠 | Create private GitHub repo and push the kit | P0 start | Code hosting, CI, handovers | 10 min |
| H-02 | 🟠 | Share `.env.local` values between both devs via a password manager | P0 | Same setup on both machines | 10 min |
| H-03 | 🟠 | Google Cloud OAuth client (web) for sign-in | P0 auth | Google sign-in | 15 min |
| H-04 | 🟠 | Email provider account (Resend or Brevo) + API key | P0 auth | Magic-link emails | 15 min (+ domain verification later) |
| H-05 | 🟠 | Postgres database (Neon or Supabase, EU/UK region) for staging | P0 staging | Staging data | 10 min |
| H-06 | 🟠 | Staging VPS (London) + SSH access for deploys | P0 staging | Weekly client demos | 30 min |
| H-07 | 🟠 | Buy domain; Cloudflare account; point DNS to Cloudflare | P0 staging | Staging URL, CDN | 30 min |
| H-08 | 🟢 | Cloudflare R2 bucket + API token; Turnstile site + secret keys | P2 uploads / registration | Images, bot protection | 15 min |
| H-09 | 🟢 | AI provider API key (e.g. Gemini) | P3 reviews | AI review help | 5 min |
| H-10 | 🟢 | Sentry project (DSN) | P0–P1 | Error tracking | 5 min |
| H-11 | 🟢 | Production VPS + production database | P5 | Launch | 30 min |
| H-12 | 🟢 | Google Play Console account ($25 one-time) | P5 | Android app | 20 min + Google verification |
| H-13 | 🟢 | Test each demo on a real Android phone and real iPhone | Every phase end | Real-device check | 15 min / phase |
| H-14 | 🟢 | Send the client the demo notes and collect feedback | Every phase end | Client sign-off | — |
| H-15 | 🟢 | Client's solicitor reviews the legal page drafts | P5 | Launch | Client side |

_Claude: add detailed numbered steps under "Steps" for each task when it becomes 🟠 or 🔴._

## Steps

### H-01 — GitHub repo
1. github.com → New repository → name `moz-rewards`, Private, no template.
2. In the project folder: `git init`, `git add .`, `git commit -m "chore: kit"`, `git branch -M main`, `git remote add origin <url>`, `git push -u origin main`.
3. Add your partner as a collaborator (Settings → Collaborators).
4. Tell Claude "H-01 done".

_(Claude fills in further steps as tasks become due.)_

## Done

| ID | Task | Done by | Date |
|---|---|---|---|
| — | — | — | — |
