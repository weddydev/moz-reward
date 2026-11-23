# KNOWN ISSUES — check here first when a test, gate, CI or tool fails

_Human's standing rule (23 Nov 2026): before debugging a failure, search this file for the symptom (`grep -i "<error text or spec>" progress/KNOWN_ISSUES.md`). When a tooling, test, gate, CI or environment problem is root-caused (or quarantined), add or update its entry **in the same commit** as the fix. One entry = symptom (what you see), cause, fix / what to do, where the detail lives. Keep each entry ≤ 6 lines; detail stays in DECISIONS / FOLLOWUPS / SESSION_LOG._

## Local gate and containers

**KI-01 · `page.goto` hangs 30–60 s in the Linux container (Mac), in bursts every 1.5–2.5 min; passes alone and on CI** — C-76, fixed 23 Nov.
- Cause: Docker Desktop hangs every new connect to `host.docker.internal` for ~68 s after ~3,100 connects in ~30 s (browsers open fresh connections per test context).
- Fix: `scripts/lib/e2e-forwarder.mjs` (pooled keep-alive HTTP forwarder used by `pnpm e2e:linux` / `gate:task`). If stalls come back: check the forwarder is in use and its pool size, not the app. DECISIONS 23 Nov "C-76".

**KI-02 · A gate step "TIMED OUT"** — a hung process, never a slow machine.
- Read that step's log in `.artifacts/gate/` (Vitest steps carry the hanging-process report); fix the cause; never raise `STEP_LIMITS`. `GATE_TIMEOUT_SCALE=2` only for a one-off on a loaded machine. CLAUDE.md "Gate speed rules".

**KI-03 · Timing / perf specs fail locally but pass on CI (or the reverse)**
- Cause: running CPU-heavy work (typecheck, builds, other suites) beside a gate's E2E/parity/perf steps; the laptop's Docker VM is a slower device than CI's 4× throttle.
- Fix: run nothing heavy beside a gate; confirm a perf failure with `pnpm e2e:linux <spec> --project chromium` alone before believing it. `@perf` alone on one worker; `@fps` only on CI nightly / gate:phase. DECISIONS 21 Nov "CI_CPU_SCORE".

**KI-04 · The main-push hook runs `gate:task` again although the gate just passed**
- Cause: the gate stamp only counts for byte-identical code **and the same task IDs**; on 23 Nov the hook picked the next task (PD-07) as the ID, so the PD-06 stamp didn't match. Any change after the gate also re-runs it.
- Fix: push the exact tree the gate passed; check the task ID the hook derives (FOLLOWUPS). Docs/progress-only pushes skip the gate by design.

**KI-05 · Semgrep (`pnpm sast`) takes 20+ min** — it must use the tar stream, never a `-v` bind mount. DECISIONS 21 Nov.

**KI-06 · Semgrep blocks `detect-non-literal-regexp` in a test** — use literal regexes (`/…/`), not `new RegExp(variable)` (PD-06 `4177678`).

**KI-07 · Native Windows: bind mounts, `pnpm.cmd` spawns, unkillable process trees, Windows WebKit failures** — not fixed in code: work inside WSL2 (CLAUDE.md, H-51). Windows WebKit is never evidence.

## WebKit (Linux CI + container)

**KI-10 · WebKit-only E2E failure: an animated value reads wrong / "still animating" / opacity 0 or 0.98 after the animation reports done** — C-77, 23 Nov.
- Cause: Linux WebKit (CI and the container) runs ~1 frame a second, for 1–2 s after a load; the computed style holds the last frame drawn, and a 90 ms window can pass with no frame.
- Fix: poll settled values to their end state (`expect.poll`, default timeout), never read once after `running == 0`; judge drawn motion by frames; never wall-clock bounds alone. A product bug only if host (macOS) WebKit also fails. DECISIONS 12 Nov, 21 Nov, 23 Nov "Linux WebKit E2E".

**KI-11 · WebKit: first mouse event after `scrollIntoViewIfNeeded` scrolls the page back (~39 px); the press lands on the wrong element**
- Fix: re-measure the target's box until the pointer is really over it, then press (slider drag, PD-06).

**KI-12 · WebKit (headless) shows the back face of a 3D-flipped element / renders no 3D**
- Cause: headless WebKit flattens 3D; `backface-visibility` alone isn't enough.
- Fix: hide the face turned away with `visibility` driven by state at the 90° point (member card, PD-06). Real Safari evidence = H-13.

**KI-13 · WebKit-only flake that survives two fix attempts** — quarantine per TESTING §7 (`test.fixme("C-xx")` + CARRIED row targeting the phase gate / owner task), carry on. Open: **C-78** WebKit slider track press (CI only, → PD-11).

**KI-14 · Pushing again cancels the previous CI run (concurrency), so no CI ever finishes**
- Seen 22–23 Nov: 4 runs cancelled in a row. Fix: before the next push, let the previous run conclude (do other work meanwhile); push fixes in one batch.

## Tests in general

**KI-20 · E2E presses keys / types before React owns the control** — wait for hydration: every page (incl. `/dev/molten`) marks `data-hydrating` until hydrated; interactive controls are disabled until then (DECISIONS 10 Nov, 23 Nov).
- Same cause, other side (CI 45128513936, Linux WebKit iphone14: "keyboard hides the dock" never saw `data-keyboard`): a hook that only listens (focus, resize) misses what happened before its effect ran, and the root's `data-hydrated` can come before the shell's effects. Fix in the product: such hooks also read the current state once on mount (`useKeyboardOpen`, 23 Nov).
- Third face (CI 45136257889, still flaky after that fix): `locator.focus()` doesn't wait for the control to be enabled, and `focus()` on a disabled field is a silent no-op, so the test "typed" into nothing. Before `focus()` on a hydration-gated field: `await expect(field).toBeEnabled()`, then assert `toBeFocused()`.

**KI-21 · Gesture spec (flick, drag) fails under load** — timed in wall-clock. Bound by pointer steps / the speed the page measured, with bounded retries (overlays flick, C-76 batch).

**KI-22 · "Settled" check never passes on touch projects** — touch-only idle motion (card sway) never settles; assert the target state, not "no animation" (PD-06).

## CSS / build surprises

**KI-30 · An inline `svg` is taller than expected (e.g. 46 vs 52 px)** — Tailwind preflight makes every `svg` `display:block`; set `display:inline; vertical-align:baseline` explicitly (stars, PD-06).

**KI-31 · Focus ring missing on a component** — a component selector (`.m-field input`, specificity 0,1,1) outranks the unlayered global `:focus-visible` (0,1,0); restate the ring on `<component>:focus-visible` (CI 45057026965).

**KI-32 · Hard-coded colour passes lint** — the css-hex check catches hex only, not `rgba()`; reviewers must catch it; use tokens (ENGINEERING §9).

**KI-42 · Frame rate drops on a page the change never touches (pixel7 `@fps` FX stress 46–57 fps vs main 59–60, no long tasks)** — Tailwind reads every word of every file it scans as a possible class: a note saying "backdrop-filter" (parity-parts.ts, DECISIONS.md) created that utility and registered nine `--tw-backdrop-*` `@property`s, which every element then carries on each style recalc (PD-07, CI 45148024961; bisect: CSS-only branch 57–60, code-only 46–56). Fix: Tailwind scans `src/` only (`source("..")` in globals.css); `pnpm check:bundle` fails on a registered property not on `REGISTERED_PROPERTIES`. Diagnose by diffing the built CSS rule sets of the two commits. Still under 58 on CI after the fix, and main itself now swings 52–58.8 fps on one commit: quarantined on pixel7 (C-79, T-7).

## Infra / backups

**KI-40 · wal-g `wal-push` hangs** — the Postgres image lacks `ca-certificates` (wal-g #2550).

**KI-41 · backup-pitr "unprotected WAL" fixture can't be built on gpg ≥ 2.5 (Mac)** — gpg 2.5 writes AEAD even with `--rfc2440`; the case skips there (C-53, DECISIONS 17 Nov).
