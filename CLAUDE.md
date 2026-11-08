# Moz Rewards — Instructions for Claude Code

You are building **Moz Rewards**, a UK loyalty and engagement web app (PWA + Android app on Google Play), from an empty folder to production. You work on autopilot, phase by phase, and must leave the project resumable at any moment.

This file is loaded every session, so it is kept short. Detailed specs live in `docs/` — read only the section you need for the task in hand.

## 1. Session protocol (always)

**Two developers, one at a time.** Two developers take turns on this project from different machines (never simultaneously). The Git repo is the only shared memory: never rely on your own chat history or local memory for project state. The **Baton** line in PROGRESS.md shows who is working.

**Start of every session (including after `/clear`):** use `/resume`. It pulls from `origin main`, checks and takes the baton, verifies the build and tests, then continues. If it was not used:
1. `git pull --rebase origin main`, then read `progress/PROGRESS.md` — it is the single source of truth for where we are. If the baton is held by the other developer, stop and ask the human.
2. Read only the current phase section of `docs/PHASES.md`.
3. Read only the doc sections the next task needs (use the section index at the top of each doc).
4. Do not scan the whole repo to "get oriented". PROGRESS.md tells you what exists and where.

**After every completed task:**
1. Run the relevant checks (typecheck, lint, the tests you touched).
2. Confirm with evidence (see §3 "Verification before done"), then commit with a Conventional Commit message (`feat(loyalty): ledger idempotency`).
3. Update `progress/PROGRESS.md` (Now / Next / Blockers / Last verified) and tick the task in `docs/PHASES.md`.
4. Commit the progress update and **push to `origin main`** (every task, so the human can stop or hand off at any moment).
5. Play the soft task sound: `node .claude/hooks/notify.mjs task "<phase> task <n> done: <name>" < /dev/null`
6. **Do not stop — start the next task immediately.** Mention in one line what finished.

**Autopilot cadence (human's standing rule):**
- Keep going task after task. After **3–5 completed tasks** (fewer when the tasks were large), **stop** for review.
- **Always stop when a whole phase is complete** (after `/phase-complete`), even if fewer than 3 tasks ran.
- When stopping: make sure everything is committed and pushed, then play the louder review sound `node .claude/hooks/notify.mjs review "<what was done>" < /dev/null` and reply with a short summary (done, verified, next, open 🔴/🟠 human tasks). The human then says "continue" or runs `/handoff`.
- Also stop early (with the review sound) if blocked on a 🔴 human task with no other work available, or when context is getting heavy (`/checkpoint` first).

**After every completed sub-phase (task group) and every phase:** update PROGRESS.md (including the Handoff note), review and update `progress/HUMAN_TASKS.md` (priorities and "needed by" dates), tick PHASES.md, append to SESSION_LOG.md, commit, and **push to `origin main`** so the other developer gets it on their next pull. Never leave finished work only on your machine.

**Before context gets heavy:** `/checkpoint` (saves and pushes). **When the human is stopping for the day or handing over:** `/handoff` (verifies, writes the handoff note, frees the baton, pushes). A fresh session on either machine must be able to continue with zero re-discovery.

**Decisions:** whenever you make a decision a future session or the other developer might question, write it in `progress/DECISIONS.md` (this also triggers a sound for the human).

## 2. Source-of-truth order

When documents disagree, follow this order:
1. Explicit instruction from the human in the current session
2. `docs/COMPLIANCE.md` and `docs/SECURITY.md` (legal and security rules are never traded away)
3. `docs/PRODUCT.md` (what to build)
4. `docs/DESIGN.md` (how it looks and moves)
5. Reference images in `design/reference/` (visual guide only — DESIGN.md wins on any conflict: colours, spacing, type, motion, component behaviour)
6. `docs/ARCHITECTURE.md` (how it is built)

## 3. Working principles

- **Quality first, then speed, then token economy.** Never ship a shortcut that weakens security, accessibility or correctness.
- **Judgment over rigid rules.** Budgets and targets (bundle size, Lighthouse, coverage) are targets, not tripwires. If something exceeds a budget by ≤15% for clear user value, accept it and log a one-line entry in `progress/DECISIONS.md`. Do not spend more than ~30 minutes of rework to shave a few KB. If it exceeds by more than 15%, optimise first; if still over, log it and flag it in PROGRESS.md.
- **Minimise human work; track what remains in `progress/HUMAN_TASKS.md`.** Do everything you can yourself (CLI tools such as `gh` when authenticated, generated configs, scripts, docs). Only things that truly need a human (creating accounts, payments, secrets, DNS, store consoles, real-device testing, client contact) go into HUMAN_TASKS.md, each with ID, priority (🔴 blocking now / 🟠 needed soon / 🟢 later), what needs it and by when, why, time estimate, and exact numbered steps. Add tasks as early as you can foresee them, so the human can do them before they become blocking. When blocked, mark it 🔴, continue with any work that does not depend on it, and mention it in your reply. Move tasks to Done when the human confirms. Review the whole list at the end of every sub-phase and phase.
- **Small, verified steps.** One task → working code → tests → commit. Keep the app runnable on `main` at all times.
- **Don't invent scope.** If PRODUCT.md is silent, choose the simplest sensible behaviour, note it in DECISIONS.md, move on.
- **Record decisions.** Any choice a future session might question (library, pattern, trade-off) gets a 2–4 line entry in DECISIONS.md.

### Debugging: root cause before fixes
When something fails: reproduce it, read the actual error and the code path, form one hypothesis, confirm it with a quick check or a failing test, then fix. No speculative edits, no changing several things at once. If two attempts fail, stop, write down what you know, and re-examine assumptions before trying again.

### Verification before "done"
Never report a task, fix or phase as done without evidence from this session: the command you ran and its result (tests passing, build output, a screenshot for UI, a curl response for an endpoint). If something could not be verified, say so plainly and add it to PROGRESS.md.

## 4. Token economy (without lowering quality)

- Read files by section, not whole; search with grep/glob before opening files.
- Use a subagent for broad exploration or reviews so raw output stays out of the main context.
- Run targeted tests while developing; run the full suite at the end of a task group and at phase end.
- Pipe long command output through `tail`/`grep`; never paste huge logs back.
- Keep PROGRESS.md under ~150 lines; move old detail to SESSION_LOG.md.
- Do not re-read a file you just wrote unless a tool reported an error.

## 5. Non-negotiables

- **Never** build review gating: every star rating gets identical "Post on Google" and "Send privately" options. No rewards for reviews. (See COMPLIANCE.md.)
- **Never** commit secrets. `.env*` files are git-ignored; only `.env.example` is committed.
- **Every** data access is authorised and scoped (customer → own data; staff → own shop; admin → by role). Cross-shop access tests are mandatory.
- **Every** animation respects `prefers-reduced-motion` and never blocks interaction or navigation.
- **No iOS App Store work.** iOS is supported as Safari + installable PWA (Add to Home Screen). Android ships to Google Play as a Trusted Web Activity.
- Customer-facing copy is UK English, currency GBP (£), dates `7 Nov 2026`, times 24h or `5pm`.

## 6. Installed skills (Emil Kowalski design engineering)

Installed in `.claude/skills/`: `emil-design-eng`, `animation-performance`, `mobile-native`, `review-animations`.
- Use `emil-design-eng` when building any interactive component, transition or micro-interaction.
- Use `mobile-native` when building customer mobile screens (touch, gestures, safe areas, native feel).
- Use `animation-performance` when an animation drops frames or before closing a phase with new motion.
- Run `review-animations` (manual) on every diff that adds or changes motion, and fix what it blocks.
- **Precedence:** `docs/DESIGN.md` wins over skill defaults. The signature moments in DESIGN.md §8 (Gilded Gate, points credited, ingot pour, reward unlocked, receipt, redeem code) are **intentional exceptions** to the "UI animations under 300ms" rule: keep their specified durations, but apply the skills' standards for easing, interruptibility, skip-on-tap, reduced motion and performance. Everyday UI motion (presses, tabs, sheets, toasts) must follow the skills' sub-300ms guidance.

## 7. Commands (once scaffolded)

```
pnpm dev            # local app
pnpm worker         # background jobs
pnpm typecheck      # tsc --noEmit
pnpm lint           # eslint
pnpm test           # vitest unit + integration
pnpm e2e            # playwright (chromium + webkit + mobile)
pnpm db:migrate     # drizzle migrations
pnpm db:seed        # demo data (Brew & Bloom Café etc.)
pnpm check          # typecheck + lint + test (run before every commit)
pnpm format         # prettier --write (format:check in CI)
pnpm test:coverage  # vitest with coverage thresholds
```
Update this list if scripts change.

## 8. Custom slash commands

- `/resume` — pull, take the baton, verify, continue
- `/checkpoint` — save and push progress so the session can be cleared safely
- `/handoff` — end the session cleanly for the other developer (verify, handoff note, free baton, push)
- `/phase-complete` — run phase gates, deploy staging, write demo notes
- `/security-review` — run the security checklist on recent changes
- `/demo` — prepare the client demo script for what's on staging

## 9. Doc index

| File | Read when |
|---|---|
| `progress/PROGRESS.md` | Start of every session |
| `progress/HUMAN_TASKS.md` | Start of every session (check for 🔴), end of every sub-phase/phase, whenever a new human dependency appears |
| `docs/PHASES.md` | Planning or finishing a task |
| `docs/PRODUCT.md` | Building any feature (read that feature's section) |
| `docs/DESIGN.md` | Building any UI, animation or sound |
| `docs/ARCHITECTURE.md` | Structure, data model, flows, deployment |
| `docs/SECURITY.md` | Auth, data access, uploads, headers, any server code |
| `docs/TESTING.md` | Writing tests, phase gates |
| `docs/COMPLIANCE.md` | Reviews, notifications, marketplace, game, data rights |
| `progress/DECISIONS.md` | Before changing an established pattern |
