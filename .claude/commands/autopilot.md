---
description: Switch to autopilot — work through tasks with a thin orchestrator and one fresh subagent per step
---

Autopilot is **off by default** (CLAUDE.md §1 "Autopilot mode"). It is on from this command (or the human saying "switch to autopilot", or `/resume autopilot`) until the human says "autopilot off" or the session ends. Everything in CLAUDE.md still applies — the same gates, reviews, findings policy, progress files, commits, sounds and evidence rules. Only *who holds the context* changes.

**Why:** each step re-reads the whole conversation, so one long session costs ~10× the tokens of the same work in fresh contexts and hits the 5-hour limit (audit 14 Nov: sessions averaged up to 340k context per step and stalled 3.8 h and 5.3 h on the limit). A fresh subagent per step starts small and returns only a summary.

## The orchestrator (this session)

1. If not just resumed, do `/resume`'s light checks (baton is yours, tree clean, main and the wip branch named in the handoff up to date).
2. Read only PROGRESS "Handoff note" + "Next", and the PHASES line of the next task. Don't open phase files, diffs, logs or source yourself.
3. For a **security-relevant task** (CLAUDE.md §4 list): before building, spawn `security-reviewer` for the design check of the plan, passing the task ID and the plan file/section.
4. Spawn **one** `general-purpose` subagent for the next step (a lettered step, or the whole task if it has ≤ 3 steps) with the prompt below. One writing subagent at a time: they share the working tree.
5. When it returns: check cheaply that it did what it says — `git status --short` (clean), `git log -1 --format='%h %s'`, and `git rev-parse HEAD @{u}` (pushed). Don't re-run suites (CLAUDE.md "never re-run a green suite").
6. After a security-relevant task's last step: spawn `security-reviewer` on the task diff (give it the commit range). BLOCK/HIGH → spawn a fix subagent (test first), then a re-review of the fix diff only. Reviewers may run in the background while the next step builds, because they read the pushed commit range, not the working tree.
7. After each finished task: play the `task` sound (CLAUDE.md §1 step 5), then go on. At the Cadence review stop (every 3–5 tasks) and at a sub-phase close, run `/subphase-complete`, delegating its heavy steps (QA, reviews) to their agents; play the `review` sound, then continue. A phase close (`/phase-complete`) is a stop: the human looks at the demo.
8. Keep your own replies to one or two lines per step. The human reads PROGRESS and the sounds, not a running commentary.

## Prompt for each step's subagent

> You are doing one step of Moz Rewards in `<repo path>`. Step: **<task ID> step <X>: <name>**, on branch `<wip/… or main>`.
> Read `CLAUDE.md` §1, §3 and §5, `progress/PROGRESS.md` "Handoff note" and the CARRIED rows that target this task, the task's section in `docs/phases/<phase>.md` (plus the phase header) or its plan file, and exactly the doc sections its **Read** list names. Don't scan the repo.
> Do the step as CLAUDE.md §1 "Each task" says: test first for logic, build, `pnpm fix`, then the gate it names (a `wip/*` push runs `pnpm check` in the hook; a task-closing push runs `gate:task`). Walk the step's acceptance criteria with evidence. Never wait idle for CI.
> Finish exactly as `/checkpoint` steps 1–7 do: commit (Conventional Commit), update PROGRESS (Handoff note naming the exact next step and the wip HEAD, Now/Next, CARRIED, Last verified), tick PHASES if the task is done, ≤ 5 SESSION_LOG lines, DECISIONS/HUMAN_TASKS if needed, push. Don't run `clear:check` and don't stop for the human.
> If you hit something only the human can decide or do, or a failure you can't root-cause in two attempts (CLAUDE.md "Debugging"), save what you have to the wip branch and return early saying so.
> Return at most 15 lines: done or not; evidence (command → result); commit SHA(s) and pushed yes/no; findings with severity; anything NOT VERIFIED; the exact next step; blockers.

## Stop (and tell the human why) when

- a 🔴 human task blocks the next step and nothing else can be done;
- a decision only the human can make (scope, money, legal, a DESIGN/PRODUCT conflict);
- a BLOCK/HIGH finding or a red CI that two fix attempts didn't clear;
- a phase close is reached;
- **this session's context reaches ~150k tokens**: `/checkpoint`, then reply "Checkpoint saved. Run `/clear`, then `/resume autopilot`." (with the `clear:check` verdict line, CLAUDE.md §1).

Every stop ends with the CLAUDE.md §1 "what to do with the context" line.

$ARGUMENTS
