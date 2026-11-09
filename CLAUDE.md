# Moz Rewards — Instructions for Claude Code

@AGENTS.md

You are building **Moz Rewards**, a UK loyalty and engagement web app (PWA + Android app on Google Play), built to agency standard on a minimal budget: one VPS and free tiers (DECISIONS "Plan v5"), with a documented path to scale. You work on autopilot, task by task, and must leave the project resumable at any moment.

This file is loaded every session, so it stays short and points to the single sources. Detailed specs live in `docs/` — read only the section the task needs.

## 1. Session protocol (always)

**Two developers, one at a time.** They take turns from different machines (never simultaneously). The Git repo is the only shared memory. The **Baton** line in PROGRESS.md shows who is working.

**Start of every session (including after `/clear`):** use `/resume`. If not used: `git pull --rebase origin main`, read `progress/PROGRESS.md` (stop and ask if the other developer holds the baton), find the next unticked task in `docs/PHASES.md`, open **that task's section** in `docs/phases/<phase>.md` plus the phase header, and read exactly the doc sections its **Read** list names. Don't scan the repo to "get oriented".

**Phase start:** before the first task of a phase, run one brief review of that phase file: every task gets measurable Acceptance criteria, Edge cases, Tests and Verify. Commit the improved brief.

**Each task:**
1. Test first for logic (TESTING §7). Build.
2. `pnpm gate:task` (TESTING §4 is the single source for every gate). Security-relevant tasks also run `security-reviewer` on the task diff.
3. Walk the Acceptance criteria and incoming CARRIED rows one by one with evidence. Unmet → keep working, or move it to a CARRIED row **and** the target task's criteria.
4. **One commit per task:** code + tests + progress files (PROGRESS Now/Next, PHASES tick, ≤ 5 evidence lines in SESSION_LOG). Conventional Commit message. Merge per the **GitHub mode** in PROGRESS (`GITHUB_MODE`): `pro` → branch `t/<task-id>`, PR, `gh pr merge --auto --squash` (branch protection requires CI); `free` → push to `main` through the committed pre-push hook (it runs `pnpm gate:task` and refuses force-pushes); CI runs on every push either way.
5. Sound: `node .claude/hooks/notify.mjs task "<task ID> done: <name>" < /dev/null`
6. Start the next task. Check the previous push's CI result before the next push; red CI is fixed first.

**Standing rules from the human apply on both laptops.** When the human gives a rule meant to last ("from now on", "always", "never", "every time"), write it into this file (or the doc it belongs to) in the same session, commit and push it — never only into Claude's local memory or local settings, which exist on one laptop only. On `/resume`, rules in this file are the full set; if the human mentions a rule that isn't here, add it.

**Cadence (human's standing rule):** stop at sub-phase/task-group granularity, not after every single task: after 3–5 tasks (fewer if large), and always at phase end, stop for review: everything pushed, then `node .claude/hooks/notify.mjs review "<what was done>" < /dev/null` and a short summary (done, verified, next, open 🔴/🟠 human tasks). Stop early if blocked on a 🔴 human task with nothing else to do, or when context is heavy (`/checkpoint` first).

**Sub-phase close:** `/subphase-complete` (light: CI green, staging smoke, Sentry, reviews of unreviewed commits, scoped QA if screens changed). **Phase close:** `/phase-complete` (the one heavy gate + demo). **Handover:** `/handoff`. **Context heavy:** `/checkpoint`.

**Decisions:** any choice a future session might question goes in `progress/DECISIONS.md` (2–4 lines; plays a sound).

## 2. Source-of-truth order

1. Explicit instruction from the human in the current session
2. `docs/COMPLIANCE.md` and `docs/SECURITY.md` (never traded away)
3. `docs/PRODUCT.md` (what to build)
4. `docs/DESIGN.md` (how it looks and moves)
5. `design/reference/` images (visual guide only; DESIGN.md wins)
6. `docs/ARCHITECTURE.md` (how it is built)

## 3. Working principles

- **Agency-grade quality, built to run at scale.** ENGINEERING.md §1 is the definition of done; §17 lists forbidden shortcuts. Speed comes from structure, never from skipping criteria, edge cases or tests.
- **Production parity.** Evidence comes from a production build (`pnpm e2e`), never from `next dev` alone. Every value SECURITY.md specifies is set explicitly in config — never left to a library default (ENGINEERING §14).
- **Every CI check has a local twin** (`pnpm check`, `pnpm gate:task`). No gate is ever "pending": if infrastructure is missing, the infrastructure task moves earlier.
- **Free-tier discipline.** Every free quota (Actions credit, R2, Resend/Brevo, Sentry, UptimeRobot) has a 70% alert and a documented degradation (ARCHITECTURE §10). Never add a paid service without a DECISIONS entry and the human's approval.
- **Secrets:** laptops hold dev-only keys. Staging and production secrets live only in GitHub secrets, root-only files the deploy job writes on the host, and the developers' password manager. Never ask the human to paste a secret into chat; never read one.
- **Right-sized verification.** Heavy suites run once per level (TESTING §4): fast checks per task, CI on every push, a light sub-phase close, one heavy phase gate. Never re-run a green suite "to be sure"; `--repeat-each` only to diagnose a flake.
- **Judgment over rigid budgets.** Bundle/Lighthouse/coverage targets: ≤ 15% over for clear user value is accepted with a one-line DECISIONS entry; more → optimise first. Don't spend > ~30 min shaving a few KB.
- **Minimise human work; track the rest in `progress/HUMAN_TASKS.md`** (ID, 🔴/🟠/🟢, needed by, why, time, exact steps). Add tasks as early as you can foresee them. Review the list at every sub-phase and phase close.
- **Don't invent scope.** If PRODUCT.md is silent, choose the simplest sensible behaviour, record it in DECISIONS.md, move on.
- **Carried work is tracked, not remembered:** CARRIED table in PROGRESS.md; a task can't be ticked with an open incoming carry.

### Debugging: root cause before fixes
Reproduce, read the actual error and code path, form one hypothesis, confirm it with a quick check or a failing test, then fix. No speculative edits. After two failed attempts, stop, write down what you know, re-examine assumptions.

### Verification before "done"
Never report done without evidence from this session (command + result, screenshot inspected, curl). Anything unverified is said plainly and written in PROGRESS.md as NOT VERIFIED.

## 4. Token economy (without lowering quality)

- Read by section, not whole files; grep/glob before opening. Don't re-read a file you just wrote.
- Long suites (sub-phase QA, phase gate) run in a background subagent that returns a compact summary; pipe command output through `tail`/`grep`.
- Gate scripts print per-suite counts only. Don't paste logs.
- PROGRESS.md ≤ 120 lines of current state; SESSION_LOG ≤ 5 evidence lines per task; AUDIT.md is frozen history.
- Reviews at sub-phase close cover only commits not already reviewed at task level.
- Skills are loaded only when they add something (§6).

## 5. Non-negotiables

- **Never** build review gating: every star rating gets identical "Post on Google" and "Send privately" options. No rewards for reviews, no offers triggered by feedback. (COMPLIANCE §1.)
- **Never** commit secrets. `.env*` is git-ignored; only `.env.example` is committed.
- **Every** data access is authorised and scoped (customer → own data; staff → own shop; admin → by role), with Row-Level Security as the second wall. Cross-shop tests are mandatory.
- **Every** animation respects `prefers-reduced-motion` and never blocks interaction or navigation.
- **No iOS App Store work.** iOS = Safari + installable PWA. Android ships to Google Play as a Trusted Web Activity.
- Customer-facing copy is UK English, GBP (£), dates `7 Nov 2026`, times 24h or `5pm`.

## 6. Skills (Emil Kowalski design engineering, in `.claude/skills/`)

Load a skill only when it applies; DESIGN.md wins on any conflict:
- `emil-design-eng`: a **new** interactive pattern or a signature moment (DESIGN §8). Not for routine screens built from existing primitives.
- `mobile-native`: a **new** customer mobile screen or gesture.
- `animation-performance`: only when an animation misses its frame budget.
- `review-animations`: run by `design-reviewer` on diffs that add or change motion; fix what it blocks.
Signature moments in DESIGN §8 keep their specified durations (exceptions to "UI motion under 300 ms") but follow the skills on easing, interruptibility, skip-on-tap, reduced motion and performance. Everyday UI motion stays under 300 ms.

## 7. Commands

```
pnpm dev               # local app (next dev)
pnpm worker            # background jobs (validates env at start)
pnpm build / start     # production build / serve
pnpm check             # typecheck + lint (incl. authz coverage, migrations, css-hex) + format:check + unit — no Docker
pnpm gate:task         # task gate: check + test:int + build + task E2E on the production build (TESTING §4)  [built in P0-14]
pnpm gate:phase        # the one heavy gate (TESTING §4)  [built in P0-14]
pnpm test:unit         # vitest unit project
pnpm test:int          # integration + authz (per-worker DBs; needs services:up)
pnpm e2e               # Playwright against a PRODUCTION build (APP_ENV=test) — the evidence run
pnpm e2e:dev           # Playwright against next dev — fast inner loop only, never evidence
pnpm test:titles       # warn on tests without [Pn-nn]/[Jn]; --strict exits 1
pnpm test:mutation     # stryker on rules modules (phase gate, changed modules)
pnpm test:load:smoke   # k6 smoke (BASE_URL/VUS/DURATION)
pnpm test:live         # real-provider smoke; --require-all at phase gate (missing keys = NOT VERIFIED)
pnpm db:migrate | db:generate | db:seed | db:reset   # drizzle migrations / generate / idempotent seed / LOCAL reset
pnpm format | format:check
pnpm services:up | services:down   # Docker: Postgres+PostGIS, Redis, Mailpit, MinIO
pnpm setup:env         # create .env.local with generated local secrets (never overwrites)
pnpm check:bundle      # after build: fail if server-only env names appear in .next/static
```
Until P0-14 lands `gate:task`/`gate:phase` and the production-build `pnpm e2e`, run their steps by hand (TESTING §4). Update this list when scripts change.

## 8. Slash commands

`/resume` (pull, baton, verify, continue) · `/checkpoint` (save + push) · `/handoff` (verify, handoff note, free baton, push) · `/subphase-complete` (light close) · `/phase-complete` (heavy gate, demo, client notes) · `/security-review` · `/demo`

## 9. Doc index

| File | Read when |
|---|---|
| `progress/PROGRESS.md` | Start of every session (state, CARRIED table, open follow-ups) |
| `progress/HUMAN_TASKS.md` | Start of session (🔴 items), every close, whenever a new human dependency appears |
| `docs/PHASES.md` | Finding the next task; ticking finished ones |
| `docs/phases/<phase>.md` | The current task's section + phase header |
| `docs/ENGINEERING.md` | §1 every session; other sections per the task's Read list |
| `docs/TESTING.md` | §4 (gates) and §7–8 (rules, self-verification) for every task |
| `docs/PRODUCT.md`, `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `COMPLIANCE.md` | The sections the task's Read list names |
| `progress/DECISIONS.md` | Before changing an established pattern |
