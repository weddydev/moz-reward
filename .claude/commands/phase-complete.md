---
description: Close a phase with the one heavy gate, the definition of done and the client demo
---

Close the current phase ($ARGUMENTS, e.g. "P1"). This is the **one heavy gate** of the phase (TESTING §4); the phase's hardening task is this same run — never run the heavy suites twice. Never mark a gate passed that you did not run.

1. **Completeness:** every task and sub-phase in the phase is ticked; the last sub-phase went through `/subphase-complete`; no CARRIED row targets this phase. Finish anything missing first.
2. **Heavy gate** via the `qa-engineer` subagent in the background (reports to `.artifacts/<phase>/`, compact summary back): `pnpm gate:phase` = E2E on all 5 projects (production build) + axe on all routes + visual snapshots + Lighthouse CI + mutation on rules modules changed in this phase + k6 smoke on staging + `pnpm test:live --require-all` + reconciliation clean + rollback rehearsal (deploy N, roll back to N-1, smoke passes). Scheduled CI results (twice-weekly 5-project runs, weekly ZAP) since the last phase close are reviewed, not re-run.
3. **Whole-phase review** only for commits not already reviewed: `code-reviewer`; `security-reviewer`; `design-reviewer` (+ `review-animations` standards) if the phase has UI or motion. Resolve every BLOCK/HIGH.
4. Fix failures at the root cause. Anything deferred needs a DECISIONS entry, a CARRIED row to its owner task and, if the client must know, a HUMAN_TASKS item.
5. **Definition of done:** walk the phase file's DoD line by line with evidence.
6. **Staging:** latest green `main` deployed, demo seed fresh, Sentry clean, RUNBOOK extended for this phase's features.
7. **Demo:** run `/demo`.
8. **Progress (one commit):** HUMAN_TASKS for the next phase (with steps and needed-by), PROGRESS (phase done, next phase's first task — which starts with the brief review), SESSION_LOG (gate summary table). Push; confirm CI.
9. **Reply** with: gate results table (pass / fail / deferred with reason), staging URL, demo summary, open human tasks grouped 🔴 / 🟠 / 🟢, and the open lines of `progress/TEMPORARY.md` (what is still temporary and when it must be fixed).
