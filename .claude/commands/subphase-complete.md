---
description: Close a sub-phase (light): CI green, staging smoke, scoped reviews and QA, progress
---

Close the current sub-phase ($ARGUMENTS, e.g. "P1-B"). This gate is **light by design** (TESTING §4): CI already ran the full suite on every push, so do **not** re-run the suites locally. Never mark a check passed that you did not see.

1. **Completeness:** every task in the sub-phase is ticked in `docs/PHASES.md` with evidence lines in SESSION_LOG.md, and no CARRIED row targets this sub-phase. Finish anything missing first.
2. **CI:** `gh run list --branch main --limit 3` → the run for the last commit is green (if red: fix at the root cause, push, repeat). If CI does not exist yet, stop: the infrastructure task moves earlier — never close with a "pending" gate. Then `pnpm ci:usage`: print the Actions credit used this month; at ≥ 80% pause the scheduled workflows and tell the human (push CI continues).
3. **Staging:** the deploy for that commit succeeded; run the staging smoke for this sub-phase's area; Sentry shows no new errors for the release.
4. **Reviews** (background subagents, only commits since the last "code-review done" line in SESSION_LOG.md that were not already reviewed at task level): `code-reviewer`; plus `security-reviewer` if server, auth, data access, uploads, notifications or marketplace code changed; plus `design-reviewer` if key screens or motion changed. Fix every BLOCK/HIGH; log medium/low in PROGRESS "follow-ups" with an owner task.
5. **Exploratory QA only if the sub-phase added or changed screens:** `qa-engineer` on those screens (320/390/1440, Chromium + WebKit; double submit, back/refresh mid-flow, slow 3G, offline, long text, keyboard, reduced motion, two tabs). Inspect the key screenshots yourself. Fix majors; log minors.
6. **Progress (one commit):** PROGRESS (Now/Next/CARRIED/handoff note), `progress/FOLLOWUPS.md` (new LOW lines; drop fixed ones), HUMAN_TASKS (review every open item, add new ones with priority and steps), SESSION_LOG (≤ 8 lines: CI run, staging smoke, review verdicts, QA issues found/fixed, "code-review done <sha>"), DECISIONS if needed, tick the sub-phase line in PHASES.md. Push; confirm CI picks it up.
7. **Reply** with a short table: CI (run link), staging smoke, Sentry, review verdicts, QA issues found/fixed, open 🔴/🟠 human tasks.

If `gh` is not authenticated, add a 🔴 HUMAN_TASKS item ("Install GitHub CLI and run `gh auth login`") and report CI as NOT VERIFIED — never as passed.
