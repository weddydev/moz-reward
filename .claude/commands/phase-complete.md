---
description: Run phase gates, deploy staging, prepare the client demo
---

Close the current phase (see `docs/PHASES.md` and `docs/TESTING.md` §4):

1. Confirm every task in the phase is ticked in `docs/PHASES.md`, and check the phase's "definition of done" in `docs/phases/<phase>.md`. Run the `code-reviewer` subagent over the whole phase (all task IDs) and resolve every BLOCK/high finding; list anything not done and why.
2. Run the phase gates: `pnpm check`, full E2E on staging (all configured browsers/devices), axe checks, visual snapshots for screens built so far, Lighthouse CI on customer routes, Semgrep/OSV/gitleaks, ZAP baseline (from P3 onwards). Use a subagent (`qa-engineer`) to run and summarise long outputs.
3. Run `/security-review` on the phase's changes (via the `security-reviewer` subagent). If the phase added or changed UI or motion, run the `design-reviewer` subagent and the `review-animations` skill on those changes; fix anything it blocks.
4. Fix failures. Anything deferred must have a DECISIONS.md entry and appear in PROGRESS.md.
5. Confirm staging is deployed from the latest green `main` and seeded with demo data relevant to this phase.
6. Run `/demo` to write the client demo notes.
7. Update `progress/HUMAN_TASKS.md` for the next phase: add everything the human must prepare (with exact steps), set priorities and needed-by. Update PROGRESS.md (phase done, next phase first task) and SESSION_LOG.md; commit and push.
8. Reply with: gate results table (pass/fail/deferred), staging URL, demo summary, and the open HUMAN_TASKS list grouped 🔴 / 🟠 / 🟢.
