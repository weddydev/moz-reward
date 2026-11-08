# S — Stabilisation and launch

**Goal:** client acceptance, polish and a calm launch. No new features without the human's written approval.

## How to work this phase
- Every change follows ENGINEERING §1; bug fixes start with a failing test.
- Push after every fix group; HUMAN_TASKS tracks client feedback rounds and launch-day actions.

### S-01 · Client acceptance testing (UAT)
**Build:** `progress/UAT.md` with one row per feedback item: source, screen, description, type (bug / polish / change request), priority, status, fix commit. Triage within the same session the feedback is added.
**Acceptance criteria:** every bug and polish item resolved or explicitly deferred with the human's agreement; change requests listed for the human to approve and price separately.

### S-02 · Bug fixing and polish
**Build:** fix in priority order; for each: failing test → fix → verify on staging → close in UAT.md. Polish items reviewed with `design-reviewer` and `review-animations`.

### S-03 · Launch
**Build:** final RC gate re-run; production release via tag + approval; Play Store production rollout (staged, human-driven); DNS/Cloudflare final checks; announce internal launch checklist complete.
**Acceptance criteria:** production smoke tests green; monitoring quiet for 24h; rollback plan ready.

### S-04 · Post-launch monitoring (first two weeks)
**Build:** daily summary in PROGRESS.md: errors, p95 latency, queue health, fraud flags, notable feedback; hotfixes through the normal flow.

### S-05 · Handover
**Build:** final docs check (README for operators, environment list, RUNBOOK, ADMIN_GUIDE, SHOP_GUIDE), credentials handover checklist in HUMAN_TASKS, archive of RC and compliance reports.
