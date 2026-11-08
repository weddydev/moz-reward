---
description: Review recent changes against SECURITY.md and COMPLIANCE.md
---

Use the `security-reviewer` subagent to review changes since $ARGUMENTS (default: since the last `/security-review` tag in SESSION_LOG.md, or the last 20 commits).

The subagent must:
1. List changed server code, actions, route handlers, schemas, uploads, auth and middleware.
2. Check each against `docs/SECURITY.md` (authz scoping, validation, rate limits, secrets, logging of PII, headers, uploads) and `docs/COMPLIANCE.md` (review gating, incentives, consent, caps, marketplace rules).
3. Confirm the authz matrix covers every new action/route.
4. Run Semgrep, OSV-Scanner and gitleaks if available and summarise findings.
5. Return a short table: finding, severity (critical/high/medium/low), file:line, fix.

Then fix critical/high findings immediately, add tests for them, and record medium/low ones in PROGRESS.md. Append "security-review done" with the commit hash to SESSION_LOG.md.
