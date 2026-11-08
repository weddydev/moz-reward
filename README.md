# Moz Rewards — Claude Code starter kit

This folder contains everything Claude Code needs to build Moz Rewards from scratch to production: the rules it follows, the full product spec, the design system and animation spec, the architecture, the security and testing standards, the UK compliance rules, a phase plan with weekly demos, and progress files so work can resume after `/clear` or a new session.

## What's inside

| Path | Purpose |
|---|---|
| `CLAUDE.md` | Rules Claude Code loads automatically every session |
| `docs/PRODUCT.md` | Every feature and business rule |
| `docs/DESIGN.md` | Design tokens, layouts, components, motion, signature animations, sound, iOS rules, performance budgets, the 20 key screens |
| `docs/ARCHITECTURE.md` | Stack, folder structure, data model, flows, jobs, deployment |
| `docs/SECURITY.md` | Security checklist (OWASP ASVS L2–guided) |
| `docs/TESTING.md` | Test strategy, critical journeys, gates |
| `docs/COMPLIANCE.md` | UK rules the code must enforce (reviews, data, marketing, marketplace, game) |
| `docs/PHASES.md` | Six weekly phases + stabilisation, with tasks and demo scripts |
| `progress/` | PROGRESS (where we are), HUMAN_TASKS (your to-do list), DECISIONS, SESSION_LOG, DEMO_NOTES |
| `design/reference/` | Drop your AI-generated UI images here (naming inside) |
| `.claude/commands/` | `/resume`, `/checkpoint`, `/phase-complete`, `/security-review`, `/demo` |
| `.claude/agents/` | `security-reviewer`, `qa-engineer`, `design-reviewer` subagents |
| `.claude/settings.json` | Safe command permissions (blocks reading `.env`, force-push, hard reset) |
| `.claude/skills/` (you install) | Emil Kowalski's design-engineering skills for animation quality — see Setup step 5 |
| `.env.example` | Every environment variable the app will need |

## Setup (once)

1. Create an empty folder (e.g. `moz-rewards`) and copy **all** files from this kit into it, including the hidden `.claude/` folder, `.gitignore` and `.env.example`.
2. Put your reference images in `design/reference/` using the names described there.
3. Install Node.js LTS, pnpm (`npm i -g pnpm`), Docker Desktop and Git.
4. `git init` and create a private GitHub repository; push the initial commit.
5. Install the four Emil Kowalski design skills into this project (run inside the project folder; when asked, choose **Claude Code** and **project** scope so they land in `.claude/skills/` and get committed):
   ```
   npx skills add https://github.com/emilkowalski/skills --skill emil-design-eng
   npx skills add https://github.com/emilkowalski/skills --skill animation-performance
   npx skills add https://github.com/emilkowalski/skills --skill mobile-native
   npx skills add https://github.com/emilkowalski/skills --skill review-animations
   ```
   If a command's options differ when you run it, follow the installer's prompts; the goal is just those four folders inside `.claude/skills/`. Alternative: clone `github.com/emilkowalski/skills` and copy those four folders from its `skills/` directory into `.claude/skills/`. Commit them.
6. Install Claude Code and open it in the folder: `claude`. Run `/skills` (or ask "which skills are available?") to confirm the four skills show up.
7. Paste the kickoff prompt below.

## Kickoff prompt (paste into Claude Code)

```
Read CLAUDE.md, progress/PROGRESS.md and the P0 section of docs/PHASES.md.
Then start Phase 0 and work through its tasks in order, following the session protocol in CLAUDE.md.
Commit after each task and keep progress/PROGRESS.md current.
When you need something only I can provide (accounts, keys, DNS), add it to progress/HUMAN_TASKS.md with priority and exact steps, and continue with other tasks.
Run /checkpoint before your context gets heavy.
```

## Daily routine (two developers taking turns)

You both work on the same GitHub repo, one at a time. The **Baton** line at the top of `progress/PROGRESS.md` shows who is working.

- **Start:** `/resume` → pulls the latest code, checks the baton (warns if your partner is still working), takes the baton and pushes that, updates your local setup, runs the tests, reads the handoff note, continues.
- **During:** after every finished sub-phase or phase, Claude updates progress and **pushes**, so your partner's next pull is always current.
- **Long conversation:** `/checkpoint`, then `/clear` — saves and pushes, you keep the baton.
- **Stopping / handing over:** `/handoff` → runs checks, writes the handoff note (finished, half-done, tested, not yet tested), frees the baton, pushes. Always do this before you stop.

Both machines need: the same Node LTS, pnpm and Docker; the same `.env.local` values (share through a password manager, never Git or chat); the four skills committed in `.claude/skills/`; a Git identity (`git config user.name "Syed"`), because the baton uses it.

## Notification sounds

`.claude/settings.json` plays a short system sound (plus a desktop banner on macOS) when:
- **Claude needs you** — asking for a permission or waiting for your input (macOS "Glass", Windows "Exclamation")
- **Claude finished** a response or task (macOS "Hero", Windows "Asterisk")
- **Claude logged a decision** in `progress/DECISIONS.md` (macOS "Pop", Windows "Beep")

Works on macOS, Windows (Git Bash/PowerShell) and Linux (PulseAudio); Node must be on your PATH. To mute temporarily, start Claude Code with `CLAUDE_SOUNDS=off claude`. To customise, edit `.claude/hooks/notify.mjs`. On macOS, allow notifications for your terminal app in System Settings → Notifications if no banner appears.
- Check `progress/HUMAN_TASKS.md`: your to-do list from Claude, marked 🔴 blocking now / 🟠 needed soon / 🟢 later, each with exact steps and when it's needed. When you finish one, tell Claude ("H-03 done").
- End of each phase (about weekly): `/phase-complete` → it runs all checks, deploys staging and writes `progress/DEMO_NOTES.md` you can send to the client.

## Things only you can do (Claude Code will ask, with steps)

- GitHub repo and Actions secrets
- Google Cloud OAuth client (and optional Places API key)
- Email provider account + domain verification (Resend or Brevo)
- Postgres database (Neon or Supabase, EU/UK region)
- Cloudflare account, domain DNS, R2 bucket, Turnstile keys
- VPS for staging and production (London region) and SSH access for deploys
- Google Play Console account, app signing, store listing approval
- Testing on a real Android phone and a real iPhone before each demo

## Realistic expectations

Claude Code can do almost all of the building, testing and deployment scripting, but it is not fully hands-off. Expect to approve some commands, provide accounts and keys, answer occasional questions, and review each weekly demo on real devices before showing the client. Keep an eye on `progress/HUMAN_TASKS.md` — that is where it lists what it needs from you, ahead of time.
