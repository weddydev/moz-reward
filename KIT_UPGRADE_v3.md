# Kit upgrade v3 — testing and self-verification

For Claude Code. The human has copied in the replaced files listed below. Apply the **merge** changes to the files the project has already modified, without losing any project-specific content. Then delete nothing else.

## Files the human replaced (already done — just read them)
- `docs/TESTING.md` (rewritten: test-first, self-verification loop §8, console/network guard, mutation testing, regression and post-push gates, fakes, synthetic monitoring, reconciliation, journeys 15–16)
- `docs/ENGINEERING.md` (§1 definition of done tightened)
- `docs/phases/P0.md` … `P5.md` (each "How to work" header; P0-02 adds MinIO; P0-14 CI additions; **new P0-17** test infrastructure; P1-17 is now **Data-integrity reconciliation** and P1-18 is **Phase hardening**; P2–P5 hardening and gate additions)
- `.claude/commands/subphase-complete.md` (new), `phase-complete.md`, `demo.md`
- `.claude/agents/qa-engineer.md`

## Merge changes (apply yourself)

1. **`docs/PHASES.md`** — keep existing ticks. Compare with the task headings in `docs/phases/*.md` and:
   - add `- [ ] P0-17 · Test infrastructure and self-verification tooling` at the end of P0-E
   - in P1-D, rename P1-17 to `P1-17 · Data-integrity reconciliation` and add `- [ ] P1-18 · Phase hardening` (P1-17 was not started yet; if it was ticked, untick it)
   - after each sub-phase's task list add `- [ ] <sub-phase id> closed with \`/subphase-complete\`` and at each phase end `- [ ] <phase> closed with \`/phase-complete\``
   - update the "Rules" lines at the top to mention TESTING §8 and `/subphase-complete`
2. **`CLAUDE.md`** —
   - §1 "After every completed sub-phase…": replace the sentence with: run `/subphase-complete` (full regression of everything built so far, exploratory QA, `code-reviewer` + reviewers the phase file names, progress updates, push, then verify CI, staging deploy, staging smoke and Sentry); after every phase `/phase-complete`.
   - §8 commands: add `/subphase-complete` and update `/phase-complete` to "all phase gates, demo dry run on staging with video, client demo notes".
   - §9 doc index: TESTING.md row → "§7–8 for every task (test first, self-verification loop); §4 at sub-phase and phase close".
3. **`docs/ARCHITECTURE.md`** — add data model line `integrity_issues: id, check, entity, details, detected_at, resolved_at`; local environment row mentions Mailpit and MinIO.
4. **`.claude/settings.json`** — add to `permissions.allow`: `Bash(gh run:*)`, `Bash(gh workflow:*)`, `Bash(gh auth status:*)`, `Bash(npx stryker:*)`, `Bash(k6:*)`. Keep everything else.
5. **`progress/HUMAN_TASKS.md`** — add 🟠 H-xx "Install GitHub CLI and run `gh auth login` on both developers' machines" (needed by P0 CI; lets Claude watch CI and staging after every push) with steps for macOS/Windows.
6. **`progress/DECISIONS.md`** — add: "Kit v3: test-first for logic, self-verification loop with console/network guard and screenshot inspection, `/subphase-complete` regression + post-push CI/staging verification, mutation testing for rules modules, reconciliation job, synthetic monitoring. Why: agency-grade reliability for a large-scale SaaS."
7. **`README.md`** — mention `/subphase-complete` in the daily routine and the GitHub CLI in setup.

## Then audit and continue
- Implement **P0-17** next (before any other unfinished task), then migrate existing tests onto it: per-worker DB isolation, console/network guard, role fixtures, task-ID test titles.
- Re-check every ticked task against the tightened ENGINEERING §1 (items 3, 6, 7, 8): test-first evidence where applicable, the self-verification loop for UI tasks (screenshots inspected), unhappy paths, side effects. Untick and fix anything that falls short. Update `progress/AUDIT.md`.
- Close the current sub-phase only with `/subphase-complete`.
