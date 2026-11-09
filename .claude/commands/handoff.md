---
description: End your session cleanly so the other developer can pull and continue
---

Two developers work on Moz Rewards one after the other (never at the same time). Hand the project over:

1. Run `pnpm gate:task` (or `pnpm check` + `pnpm build` until P0-14 lands it). Never hand over a broken `main`: if something is mid-way and breaks the build, finish it, or commit the unfinished part to a branch `wip/<task-id>` and **push that branch** (a local stash is invisible to the other developer), and say so in the handoff note.
2. Commit all work with Conventional Commit messages. Nothing may stay uncommitted or unpushed. Check the last CI run (`gh run list --limit 1`) and record its result in the handoff note.
3. Update `progress/PROGRESS.md`:
   - Status, Now, Next (top 3 concrete steps), CARRIED table, Blockers, Map of the codebase, Last verified (keep PROGRESS ≤ 120 lines)
   - **Handoff note** section (overwrite): handed over by (git user.name), date/time, what was finished, what is half-done and exactly how to continue, **Tested** (what, how, result), **Not yet tested**, anything the next person must do first (new env vars, migrations, seeds)
   - **Baton** line → `Baton: free — last held by <name>, <date time>`
4. Review `progress/HUMAN_TASKS.md`: add any new human dependencies (with priority, needed-by, steps), re-prioritise existing ones, move confirmed ones to Done. Tick finished tasks in `docs/PHASES.md`; append a SESSION_LOG.md entry; add any DECISIONS.md entries.
5. Commit (`chore(progress): handoff by <name>`) and **push** to `origin main`. Confirm the push succeeded; if it was rejected, `git pull --rebase`, resolve, re-run checks, push again.
6. Reply with the handoff note text, followed by the open HUMAN_TASKS list (🔴 first, then 🟠) with IDs and one line each.
