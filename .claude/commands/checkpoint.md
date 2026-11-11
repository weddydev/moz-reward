---
description: Save progress so the session can be cleared safely
---

Create a checkpoint so a fresh session (after `/clear`) can continue without searching the repo:

1. Make sure the working tree is in a committable state. Run `pnpm check` (fast; no full suites). If something is mid-way and the build is green, commit it; if not, commit it to a pushed branch `wip/<task-id>` and note exactly what is unfinished.
2. Commit with a Conventional Commit message.
3. Update `progress/PROGRESS.md`: Status, Now, Next (top 3 concrete steps), CARRIED table, Blockers, Map of the codebase (new important paths), Last verified. Keep it ≤ 120 lines. Add any new human dependencies to `progress/HUMAN_TASKS.md`.
4. Tick finished tasks in `docs/PHASES.md`.
5. Append one entry to `progress/SESSION_LOG.md` (≤ 5 lines, include the exact next step).
6. Add any new decisions to `progress/DECISIONS.md`.
7. Commit these progress updates (`chore(progress): checkpoint`) and push to `origin main` (pull --rebase first if the push is rejected). Keep the baton held — use `/handoff` to release it.
8. Run `pnpm clear:check` (CLAUDE.md §1 "Prove it before saying clear"). If it fails, fix what it names (commit, push, update the handoff) and re-run until it passes.
9. Reply with one short paragraph: what was saved and the next step, then the `clear:check` verdict line, then the "Run `/clear`, then `/resume`." line.
