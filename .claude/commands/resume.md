---
description: Pull latest work, take the baton, verify, and continue the next task
---

Resume Moz Rewards. Two developers take turns; the repo files are the only shared memory.

**Light path (same developer continuing after `/clear`, CLAUDE.md §4):** if the Baton line already names you and step 1 pulled no new commits, skip steps 4, 5, 7 and 8 but still do step 1's fetch and step 6's wip-branch check (no baton commit, no install/migrate, no `pnpm check`): read the Handoff note and the next task's section (step 6), state the next step in 2 lines, and continue. If the pull brought commits, do every step.

1. `git fetch origin --prune` (every branch, not only main), then `git pull --rebase origin main`. If either fails, stop and explain. If a `CLAUDE.md` exists in the folder **above** the repo (outside git, e.g. `../CLAUDE.md`), rename it to `CLAUDE.md.stale` and say so: Claude Code loads it every session and it is an old, contradicting copy of the rules (audit 14 Nov).
2. Identify yourself with `git config user.name`.
3. Read `progress/PROGRESS.md` fully. Check the **Baton** line:
   - `free` or held by you → continue.
   - Held by the other developer → stop and tell the human: "<name> still holds the baton since <time>. Continue anyway?" Only continue if they confirm.
4. Set `Baton: held by <you> since <date time>`, commit (`chore(progress): baton <you>`) and push immediately so the other developer sees it. If the push is rejected: pull, re-read the baton, and stop if the other developer took it.
5. Read `progress/HUMAN_TASKS.md` (open items only). Ask the human whether any open tasks were completed since the last session; move confirmed ones to Done.
6. **If the handoff note names a wip branch and HEAD** (e.g. "`wip/P0-15`, HEAD `25e05cf`"): `git switch <branch>` and `git merge --ff-only origin/<branch>` (a local copy may be older than the pushed one), then check `git rev-parse --short HEAD` equals the HEAD in the note. If it doesn't match, or the branch has local commits the remote lacks, **stop and tell the human** — never build on a stale copy. (Do this on the light path too.)
   Read the **Handoff note**, the last SESSION_LOG.md entry, `docs/PHASES.md` to find the next unticked task, and that task's section in `docs/phases/<phase>.md` (plus the phase's "How to work this phase" header).
7. Bring the local environment in line: `pnpm install --frozen-lockfile`, start Docker services, `pnpm db:migrate`, `pnpm db:seed` if the note says so. If `.env.example` gained variables, list them for the human.
8. Run `pnpm check` (fast; no full suites) and any tests named under "Not yet tested" in the handoff note. Check the last CI run (`gh run list --limit 1`, once CI exists): red CI is fixed first. If anything fails, fix it at the root cause and record it. If the next task is the first of a phase, do the phase's brief review first (CLAUDE.md §1).
9. State in 3–5 lines: phase, what the other developer finished, what you will do next, and any 🔴 human tasks.
10. Continue with the next task following CLAUDE.md §1. If the arguments say `autopilot`, continue under `.claude/commands/autopilot.md` instead (CLAUDE.md §1 "Autopilot mode"); otherwise autopilot is off.

$ARGUMENTS
