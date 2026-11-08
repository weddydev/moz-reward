---
description: Pull latest work, take the baton, verify, and continue the next task
---

Resume Moz Rewards. Two developers take turns; the repo files are the only shared memory.

1. `git pull --rebase origin main`. If it fails, stop and explain.
2. Identify yourself with `git config user.name`.
3. Read `progress/PROGRESS.md` fully. Check the **Baton** line:
   - `free` or held by you → continue.
   - Held by the other developer → stop and tell the human: "<name> still holds the baton since <time>. Continue anyway?" Only continue if they confirm.
4. Set `Baton: held by <you> since <date time>`, commit (`chore(progress): baton <you>`) and push immediately so the other developer sees it.
5. Read `progress/HUMAN_TASKS.md` (open items only). Ask the human whether any open tasks were completed since the last session; move confirmed ones to Done.
6. Read the **Handoff note**, the last SESSION_LOG.md entry, and only the current phase section of `docs/PHASES.md`.
7. Bring the local environment in line: `pnpm install --frozen-lockfile`, start Docker services, `pnpm db:migrate`, `pnpm db:seed` if the note says so. If `.env.example` gained variables, list them for the human.
8. Run `pnpm check` (and any tests named under "Not yet tested" in the handoff note). If anything fails, fix it first (root cause first) and record it.
9. State in 3–5 lines: phase, what the other developer finished, what you will do next, and any 🔴 human tasks.
10. Continue with the next task following CLAUDE.md §1.

$ARGUMENTS
