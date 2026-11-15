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
4. **One commit per task:** code + tests + progress files (PROGRESS Now/Next, PHASES tick, ≤ 5 evidence lines in SESSION_LOG). Conventional Commit message. Merge per the **GitHub mode** in PROGRESS (`GITHUB_MODE`): `pro` → branch `t/<task-id>`, PR, `gh pr merge --auto --squash` (branch protection requires CI); `free` → push to `main` through the committed pre-push hook (it runs `pnpm gate:task` and refuses force-pushes); CI runs on every push either way. Pushes only to `wip/*` checkpoint branches run the fast `pnpm check` in the hook instead; CI still runs the full set on them, and the task-closing push keeps the full gate (DECISIONS 14 Nov).
5. Sound: `node .claude/hooks/notify.mjs task "<task ID> done: <name>" < /dev/null`
6. Start the next task. Check the previous push's CI result before the next push; red CI is fixed first. **Never wait idle for CI** (human, 14 Nov): no `sleep`/`until`/`gh run watch` loops; push, carry on, and look at the result before the next push (or let a background command notify you).

**Autopilot mode (human's standing rule, 14 Nov 2026) — off by default.** The default protocol above is the normal way of working. Autopilot switches on only when the human says "switch to autopilot" or runs `/autopilot` (or `/resume autopilot`), and off when they say "autopilot off" or the session ends. Rules: `.claude/commands/autopilot.md`. In short: the main session only orchestrates and every task step runs in a fresh subagent that returns a short summary, so the main context stays small and the 5-hour limit isn't burned on re-reading; same gates, reviews, progress files and commits as the default protocol; it keeps going through the Cadence review stops but stops for a 🔴 blocker with nothing else to do, a decision only the human can make, an open HIGH/BLOCK finding it can't fix, or main context ≥ ~150k (then `/checkpoint` and "Run `/clear`, then `/resume autopilot`").

**Standing rules from the human apply on both laptops.** When the human gives a rule meant to last ("from now on", "always", "never", "every time"), write it into this file (or the doc it belongs to) in the same session, commit and push it — never only into Claude's local memory or local settings, which exist on one laptop only. On `/resume`, rules in this file are the full set; if the human mentions a rule that isn't here, add it.

**Cadence (human's standing rule):** stop at sub-phase/task-group granularity, not after every single task: after 3–5 tasks (fewer if large), and always at phase end, stop for review: everything pushed, then `node .claude/hooks/notify.mjs review "<what was done>" < /dev/null` and a short summary (done, verified, next, open 🔴/🟠 human tasks). Stop early if blocked on a 🔴 human task with nothing else to do, or when context is heavy (`/checkpoint` first).

**Every stop says what to do with the context (human's standing rule, 10 Nov 2026):** whenever Claude stops working for any reason (task or step checkpoint, review stop, blocked on a human task, handoff, a question), the last line of the reply tells the human plainly what to do next with the session: "Now run `/clear` (or open a new chat), then `/resume`." when the work is saved and pushed, or "Don't clear yet: <what is still unsaved or needed>" when it is not. Never leave the human guessing whether clearing is safe.

**Prove it before saying "clear" (human's standing rule, 11 Nov 2026):** the "Run `/clear`" line may only follow a passing `pnpm clear:check` run in the same reply, after the last commit and push (quote its verdict line). It fails on: uncommitted or stashed work; the current branch or main not pushed; PROGRESS "Last updated" or a SESSION_LOG entry on origin/main not dated today; work on a wip branch whose pushed HEAD and name aren't in PROGRESS. Before running it, also make sure by reading that the handoff names the exact next step, what is half-done, what is untested (incl. CI still running), and that finished tasks are ticked. A failing check → fix and re-run, or say "Don't clear yet: <reason>".

**Pace (human's standing rule, 10 Nov 2026):** the one target is **everything done by 10 Dec 2026**. Don't track or report per-phase dates, projections or slips. Work fast and efficiently, but never by cutting scope: every acceptance criterion, edge case, security measure and test stays. Speed comes from less overhead (fewer re-reads, no repeated green suites, batched progress updates), never from lower quality.

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
- **Do it yourself (human's standing rule, 12 Nov 2026):** every command, script, CLI, SSH or config step Claude can run, Claude runs itself (key generation, `ssh` to the VPS, `gh secret set` piped from a local file without displaying it, installs via `winget`/`brew`). Ask the human only for what needs them: account sign-ups, payments, identity verification, browser dashboards Claude can't reach, typing a passphrase into a prompt, copying a secret that exists only in a provider dashboard into the password manager, approval prompts and decisions. Write HUMAN_TASKS steps that way: the human's part only, with Claude's part named as Claude's.
- **Don't invent scope.** If PRODUCT.md is silent, choose the simplest sensible behaviour, record it in DECISIONS.md, move on.
- **Temporary choices are tracked (human's standing rule, 14 Nov 2026):** whenever we do something "for now" that production must not keep (a provider swapped, a security control replaced by a weaker equivalent, a setting relaxed), add a line to `progress/TEMPORARY.md` in the same commit (what we did, why, the real fix, by when), plus a DECISIONS entry and a CARRIED row to the resolving task. P5-14 can't be ticked while a line is open; every `/phase-complete` reply lists the open lines.
- **Carried work is tracked, not remembered:** CARRIED table in PROGRESS.md; a task can't be ticked with an open incoming carry.

### Debugging: root cause before fixes
Reproduce, read the actual error and code path, form one hypothesis, confirm it with a quick check or a failing test, then fix. No speculative edits. After two failed attempts, stop, write down what you know, re-examine assumptions.

### Verification before "done"
Never report done without evidence from this session (command + result, screenshot inspected, curl). Anything unverified is said plainly and written in PROGRESS.md as NOT VERIFIED.

## 4. Token economy (without lowering quality)

- Read by section, not whole files; grep/glob before opening. Don't re-read a file you just wrote.
- Long suites (sub-phase QA, phase gate) run in a background subagent that returns a compact summary; pipe command output through `tail`/`grep`.
- Gate scripts print per-suite counts only. Don't paste logs.
- PROGRESS.md ≤ 120 lines (~12 KB) of current state — the map lives in `progress/MAP.md`, LOW follow-ups in `progress/FOLLOWUPS.md`, old evidence in SESSION_LOG; SESSION_LOG ≤ 5 evidence lines per task; AUDIT.md is frozen history.
- Reviews at sub-phase close cover only commits not already reviewed at task level.
- Skills are loaded only when they add something (§6).

**Speed and token rules (human's standing rule, 10 Nov 2026). None of these removes a check, criterion, review or test.**
- Tasks stay as defined in the phase files (not split); a session works through them as before.
- **No duplicate gate:** `gate:task` stamps the exact tree it passed (`scripts/lib/gate-stamp.ts`); the pre-push hook skips re-running it only for byte-identical code with the same task IDs (≤ 12 h old). Any change re-runs it; CI runs on every push.
- **Quiet hooks:** lefthook prints failures only.
- **`pnpm fix` before checks:** run it (ESLint autofix + Prettier) before `typecheck`/`gate:task`, so import-order and format nits don't cost a round trip.
- **Security design check first:** for a security-relevant task, `security-reviewer` checks the plan (data flows, limits, defaults, failure modes) before building; the full review of the final diff stays, and so does a re-review after any HIGH.
- **Linux check for motion and visual specs (14 Nov):** a change to a motion, overlay or `@visual` spec (or the CSS/components they cover) runs those specs in `mcr.microsoft.com/playwright:v<installed version>-noble` against the production build before pushing; Linux-only flakes otherwise surface only in CI.
- **Full 5-project E2E** at sub-phase close and in nightly CI, as TESTING §4 says — **plus immediately** for any change that affects every page (root layout, global CSS, `tests/e2e/support` fixtures, proxy/headers). Per task otherwise: `gate:task` only.
- **Screenshots:** customer screens at 320, 390 (iPhone) and 1440, all inspected; admin and developer pages at 320 and 1440.
- **QA agent stays on Opus, high effort** (`.claude/agents/qa-engineer.md`), never a cheaper model.

**Token rules, round 2 (human's standing rule, 10 Nov 2026, after the plan audit). No acceptance criterion, edge case or test is removed.**
- **Fresh context per task.** Most of a session's usage is the conversation being re-read on every step, so keep it short. After every task, and at each lettered step (A, B, C…) of a task with more than three steps: `/checkpoint`, play the `task` sound, and stop with one line: "Checkpoint saved. Run `/clear`, then `/resume`." The review stop every 3–5 tasks (Cadence, §1) is unchanged. After a `/clear`, `/resume` takes its light path (baton already yours, nothing new pulled).
- **Security-relevant task = a task on this list** (this replaces the "touches auth, authz, sessions, rate limits, payments, uploads, crypto or PII" wording wherever it appears): P0-12, P0-15 · P1-04, P1-10, P1-12, P1-14, P1-16 · P2-03, P2-04, P2-05, P2-09, P2-12, P2-13, P2-15 · P3-02, P3-06, P3-07 · P4-03, P4-07, P4-08 · P5-01, P5-02, P5-07. Only these get the `security-reviewer` design check and the task-level review. Every other task's diff is reviewed once, at the sub-phase close, with the other unreviewed commits (`/subphase-complete` step 4). A re-review after a HIGH checks the fix's diff only; it is not a fresh full review.
- **No full E2E at task level** beyond the every-page exception above: not after review fixes and not "before the tick". CI's full run on the push is the evidence. **Flake limit:** a failure that passes when its spec is re-run alone gets 20 minutes of root-cause work; if the cause isn't found, quarantine it (TESTING §7: PROGRESS note + CARRIED row; it blocks the phase gate) and carry on.
- **Findings policy:** BLOCK/HIGH → fixed before the tick, test first. MEDIUM / should-fix → collected and fixed together in one batch before the sub-phase closes (one commit, one gate run), not one by one. LOW / nits → one line each in `progress/FOLLOWUPS.md`, not fixed, unless the line is already being changed.

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
pnpm relay --replay-since <ISO time with zone>   # after a restore: re-dispatch outbox rows (RUNBOOK)
pnpm build / start     # production build / serve
pnpm check             # typecheck + lint (incl. authz coverage, migrations, css-hex) + format:check + test:titles:strict + unit — no Docker
pnpm gate:task         # task gate: check + test:int + build + task E2E on the production build (TESTING §4)  [built in P0-14]
pnpm gate:phase        # the one heavy gate (TESTING §4)  [built in P0-14]
pnpm test:unit         # vitest unit project
pnpm test:int          # integration + authz (per-worker DBs; needs services:up)
pnpm e2e               # Playwright against a PRODUCTION build (APP_ENV=test) — the evidence run
pnpm e2e:dev           # Playwright against next dev — fast inner loop only, never evidence
pnpm e2e:visual        # only the @visual snapshot tests (per-OS baselines; --update-snapshots accepts a new look); also part of gate:phase
pnpm test:titles       # warn on tests without [Pn-nn]/[Jn]; --strict exits 1
pnpm clear:check       # safe to /clear? clean tree, branch + main pushed, handoff on origin/main current (§1)
pnpm test:mutation     # stryker on rules modules (phase gate, changed modules)
pnpm test:load:smoke   # k6 smoke (BASE_URL/VUS/DURATION)
pnpm test:live         # real-provider smoke; --require-all at phase gate (missing keys = NOT VERIFIED)
pnpm db:migrate | db:generate | db:seed | db:reset   # drizzle migrations / generate / idempotent seed (baseline + demo data) / LOCAL reset
pnpm db:seed --reset   # delete and re-create the demo shops and accounts (staging: weekly and before a demo)
pnpm demo:credentials  # print this environment's demo sign-in details (derived, never stored); --codes = current TOTP codes
pnpm format | format:check
pnpm fix               # eslint --fix + prettier --write (run before typecheck / gate:task)
pnpm services:up | services:down   # Docker: Postgres+PostGIS, Redis, Mailpit, MinIO
pnpm setup:env         # create .env.local with generated local secrets (never overwrites)
pnpm check:bundle      # after build: fail if server-only env names appear in .next/static
pnpm sast              # Semgrep SAST in Docker (same command as CI; part of gate:task)
```
Until P0-14 lands `gate:task`/`gate:phase` and the production-build `pnpm e2e`, run their steps by hand (TESTING §4). Update this list when scripts change.

## 8. Slash commands

`/resume` (pull, baton, verify, continue) · `/checkpoint` (save + push) · `/handoff` (verify, handoff note, free baton, push) · `/subphase-complete` (light close) · `/phase-complete` (heavy gate, demo, client notes) · `/security-review` · `/demo`

## 9. Doc index

| File | Read when |
|---|---|
| `progress/PROGRESS.md` | Start of every session (state, handoff, CARRIED table) |
| `progress/MAP.md` | Locating code (instead of scanning the repo) |
| `progress/TEMPORARY.md` | Before any stopgap/workaround; every phase close; P5 |
| `progress/FOLLOWUPS.md` | When a follow-up's owner task starts; every sub-phase close |
| `progress/HUMAN_TASKS.md` | Start of session (🔴 items), every close, whenever a new human dependency appears |
| `docs/PHASES.md` | Finding the next task; ticking finished ones |
| `docs/phases/<phase>.md` | The current task's section + phase header |
| `docs/ENGINEERING.md` | §1 every session; other sections per the task's Read list |
| `docs/TESTING.md` | §4 (gates) and §7–8 (rules, self-verification) for every task |
| `docs/PRODUCT.md`, `DESIGN.md`, `ARCHITECTURE.md`, `SECURITY.md`, `COMPLIANCE.md` | The sections the task's Read list names |
| `progress/DECISIONS.md` | Before changing an established pattern |
