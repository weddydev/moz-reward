# S — Stabilisation and launch

**Goal:** client acceptance, polish and a calm launch. No new features without the human's written approval.

## How to work this phase
- **Before the first task of this phase**, run a brief review: fill any missing Edge cases and measurable Acceptance criteria in this file (one agent, cheap; commit with the first task).
- Every change follows ENGINEERING §1; bug fixes start with a failing test. Each fix passes `pnpm gate:task` (its own tests + affected E2E specs on the production build, Chromium + WebKit); CI runs the full suite on push. Fixes touching auth, authz, sessions, rate limits, payments, uploads, crypto or PII run `security-reviewer` on the diff before closing.
- No heavy local re-runs: the only heavy gate in this phase is the targeted re-run in S-03.
- Push after every fix group; HUMAN_TASKS tracks client feedback rounds and launch-day actions.

### S-01 · Client acceptance testing (UAT)
**Build:** `progress/UAT.md` with one row per feedback item: source, screen, description, type (bug / polish / change request), priority, status, fix commit. Triage within the same session the feedback is added.
**Acceptance criteria:** every bug and polish item resolved or explicitly deferred with the human's agreement; change requests listed for the human to approve and price separately.

### S-02 · Bug fixing and polish
**Build:** fix in priority order; for each: failing test → fix → verify on staging → close in UAT.md. Polish items reviewed with `design-reviewer` (which runs `review-animations` on motion diffs).
**Acceptance criteria:**
- Every fixed bug has a test that failed before the fix and passes after (named with the UAT row ID).
- Zero open blocker or major bugs in UAT.md (severity as in the qa-engineer report: blocker / major / minor); minors fixed or deferred with the human's agreement.
- CI green and the staging smoke green after the last fix group; no new Sentry error groups on staging for 24 h.
- No fix weakens a COMPLIANCE or SECURITY rule (reviewer check on the diff).

### S-03 · Launch
**Build:**
- Go/no-go checklist in `progress/LAUNCH.md`, signed off by the human: P5-14 gates green; re-run only what changed since P5-14 (`pnpm gate:task` for each changed area, mutation only if rules modules changed) plus the production smoke; pen-test findings fixed or accepted; on-call rota live; backups and restore drill current; alerts routed; Play closed testing track has run ≥ 14 days (or organisation developer account confirmed); DNS/Cloudflare and origin lock final checks.
- Rollback triggers (any one rolls back to the previous image tag, no debate): error rate > 1% for 5 min; actions p95 > 2× target (600 ms) for 5 min; any data-integrity alert (reconciliation, ledger, receipts).
- Production release via tag + approval (rolling deploy); Play Store production rollout (staged, human-driven); internal launch checklist complete.
**Acceptance criteria:** go/no-go checklist signed; production smoke and synthetic checks green; monitoring within SLOs for 24 h with no rollback trigger hit; rollback rehearsed in P5-13 and the procedure linked from LAUNCH.md.

### S-04 · Post-launch hypercare (first two weeks)
**Build:** on-call rota active for the period; daily SLO review recorded in PROGRESS.md: availability, approve → points credited p95, SSE delivery p95, sign-in email p95, errors, queue lag, outbox age, error-budget burn, fraud flags, moderation SLA, notable feedback; hotfixes through the normal flow; any rollback trigger handled per S-03.
**Acceptance criteria:** 14 daily reviews recorded; every alert acknowledged within the on-call target and linked to an outcome; error-budget policy applied if the budget is spent; hypercare summary at the end (incidents, fixes, follow-ups) in SESSION_LOG.

### S-05 · Handover
**Build:** final docs check (README for operators, environment list, RUNBOOK, ADMIN_GUIDE, SHOP_GUIDE), credentials handover checklist in HUMAN_TASKS, archive of RC and compliance reports.
**Acceptance criteria:**
- Every doc listed above matches production (spot-checked by `code-reviewer` against code and config).
- Every credential and account is owned by the client (handover checklist ticked by the human; no secret left only on a developer machine).
- RC, compliance, pen-test, load-test and restore-drill reports archived and linked from PROGRESS.
- The client's operator completes one deploy and one rollback from the RUNBOOK unaided (or the human records why not).
