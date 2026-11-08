---
description: Close a phase with full gates, staging verification, demo dry run and client demo notes
---

Close the current phase ($ARGUMENTS, e.g. "P1"). Follow `docs/TESTING.md` §4 "Phase done" and the phase's "definition of done" in `docs/phases/<phase>.md`. Never mark a gate passed that you did not run.

1. **Completeness:** every task and sub-phase in the phase is ticked in `docs/PHASES.md`, and the last sub-phase went through `/subphase-complete`. List anything not done and why; finish it first.
2. **Whole-phase review:** `code-reviewer` over all task IDs in the phase; `security-reviewer` via `/security-review`; `design-reviewer` + `review-animations` if the phase has UI or motion. Resolve every BLOCK/high finding.
3. **Gates** (run via the `qa-engineer` subagent; save reports in `.artifacts/<phase>/`):
   - full regression: unit, integration, authz + coverage, every E2E journey built so far on all Playwright projects, on staging as well as locally
   - axe on all routes built so far; visual snapshots for key screens built so far
   - Lighthouse CI on customer routes (judgment rule)
   - mutation testing (Stryker) on rules modules touched in this phase (TESTING §2)
   - k6 smoke (P1, P3) or full load test (P5) per TESTING §5
   - ZAP baseline (from P3; authenticated scan in P5)
   - data-integrity reconciliation run on staging: zero mismatches
   - `pnpm test:live` against real providers on staging (from P2)
4. Fix failures at the root cause. Anything deferred needs a DECISIONS.md entry, a PROGRESS.md note and, if the client must know, a HUMAN_TASKS item.
5. **Staging:** confirm the latest green `main` is deployed, the demo seed is fresh, and Sentry shows no new errors for this release.
6. **Demo dry run:** run `/demo` (it rehearses the demo script on staging with video before writing notes).
7. **Progress:** update HUMAN_TASKS.md for the next phase (everything the human must prepare, with steps and needed-by), PROGRESS.md (phase done, next phase's first task), SESSION_LOG.md (gate summary). Commit, push, and verify CI + staging again.
8. **Reply** with: gate results table (pass / fail / deferred with reason), staging URL, demo summary, and open human tasks grouped 🔴 / 🟠 / 🟢.
