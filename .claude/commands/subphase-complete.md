---
description: Close a sub-phase with full regression, exploratory QA, reviews, push and post-push verification
---

Close the current sub-phase ($ARGUMENTS, e.g. "P1-B"). Follow `docs/TESTING.md` §4 "Sub-phase done" and §8 exactly. Do not skip steps; if a step cannot run, stop and say why.

1. **Completeness:** every task in the sub-phase is ticked in `docs/PHASES.md` with an evidence line in SESSION_LOG.md. List any that aren't and finish them first.
2. **Full regression** (use the `qa-engineer` subagent to run and summarise):
   - `pnpm check`, integration tests, authz matrix + coverage script
   - every E2E journey built so far (not only this sub-phase) on all Playwright projects, with the console/network guard
   - fix every failure at its root cause; re-run until green
3. **Exploratory QA:** `qa-engineer` drives this sub-phase's screens and flows per TESTING §8 step 4 (double taps, back/refresh mid-flow, slow 3G, offline, long text, empty data, keyboard only, reduced motion, two tabs), captures screenshots at 320/390/1440 and reports issues. Inspect the screenshots yourself. Fix what it finds.
4. **Reviews:** `code-reviewer` on all task IDs in the sub-phase; plus `security-reviewer` and/or `design-reviewer` if the phase file says so, and `review-animations` for any motion. Resolve every BLOCK/high finding; log medium/low ones in PROGRESS.md.
5. **Progress:** update PROGRESS.md (incl. handoff note), HUMAN_TASKS.md (review all items, add new ones with priority and steps), SESSION_LOG.md (sub-phase summary with test counts), DECISIONS.md if needed. Commit.
6. **Push and verify:** `git push origin main`; `gh run watch` until CI finishes; confirm the staging deploy job succeeded; run the staging smoke for this area; check Sentry for new errors in this release. If anything fails, fix and repeat this step.
7. Reply with a short table: regression (passed/failed counts per suite), exploratory issues found/fixed, review verdicts, CI + staging status, and open 🔴/🟠 human tasks.

If `gh` is not installed or authenticated, add a 🔴 HUMAN_TASKS item ("Install GitHub CLI and run `gh auth login`") and report CI/staging status as "not verified" — never as passed.
