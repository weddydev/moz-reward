---
description: Save progress so the session can be cleared safely
---

Create a checkpoint so a fresh session (after `/clear`) can continue without searching the repo:

1. Make sure the working tree is in a committable state. Run `pnpm check` (or the subset that applies if the project is not scaffolded yet). Fix quick failures; if something is mid-way, commit it as WIP on `main` only if the app still builds — otherwise note exactly what is unfinished.
2. Commit with a Conventional Commit message.
3. Update `progress/PROGRESS.md`: Status, Now, Next (top 3 concrete steps), Blockers, Map of the codebase (add any new important paths), Last verified. Keep it under ~150 lines. Add any new human dependencies to `progress/HUMAN_TASKS.md`.
4. Tick finished tasks in `docs/PHASES.md`.
5. Append one entry to `progress/SESSION_LOG.md` using its template (5–8 lines, include the exact next step).
6. Add any new decisions to `progress/DECISIONS.md`.
7. Commit these progress updates (`chore(progress): checkpoint`) and push to `origin main` (pull --rebase first if the push is rejected). Keep the baton held — use `/handoff` to release it.
8. Reply with one short paragraph: what was saved and the next step.
