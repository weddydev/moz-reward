# KNOWN ISSUES — check here first when a test, gate, CI or tool fails, or anything misbehaves during development

_Human's standing rule (23 Nov 2026): before debugging a failure, search this file for the symptom (`grep -i "<error text or spec>" progress/KNOWN_ISSUES.md`). When a tooling, test, gate, CI or environment problem is root-caused (or quarantined), add or update its entry **in the same commit** as the fix. One entry = symptom (what you see), cause, fix / what to do, where the detail lives. Keep each entry ≤ 6 lines; detail stays in DECISIONS / FOLLOWUPS / SESSION_LOG. **Widened (human, 25 Nov 2026):** any problem met during development that a later session could hit again (browser/platform quirks, library traps, environment snags) gets an entry, at Claude's judgment; one-off bugs fixed for good don't. Lean: update an entry rather than add a near-duplicate._

## Local gate and containers

**KI-48 · `[PD-09] adds no long task while it plays` red on CI: a script on `/s/<code>?src=qr` 65–81 ms (`Expected: <= 65`)** — root-caused 25 Nov (main CI 45633357321, red twice on the perf runner; spec-repeat 10/10 green on another runner).
- Cause: an inline script calling `getAnimations()` (or any layout/style read) during parse forces the whole document's first style + layout inside the parser's task. LoAF showed it: `forcedStyleAndLayoutDuration` 71.5 of a 73 ms `classic-script` entry. `startGate` already waited for the first frame (C-82); `runGateMorph` still read synchronously.
- Fix: inline gate scripts read animations, styles or layout only from `requestAnimationFrame` (first paint has done the work by then); unit test "reads the gate's animations in the first frame" guards the morph. To diagnose a long inline script, log LoAF `scripts[].forcedStyleAndLayoutDuration`, `invokerType` and `invoker`. A spec on a paused `page.clock` must `runFor` a frame before expecting `data-morph`.

**KI-01 · `page.goto` hangs 30–60 s in the Linux container (Mac), in bursts every 1.5–2.5 min; passes alone and on CI** — C-76, fixed 23 Nov.
- Cause: Docker Desktop hangs every new connect to `host.docker.internal` for ~68 s after ~3,100 connects in ~30 s (browsers open fresh connections per test context).
- Fix: `scripts/lib/e2e-forwarder.mjs` (pooled keep-alive HTTP forwarder used by `pnpm e2e:linux` / `gate:task`). If stalls come back: check the forwarder is in use and its pool size, not the app. DECISIONS 23 Nov "C-76".

**KI-46 · Commit refused "[gitleaks] neither `gitleaks` nor Docker is available", or a wip push fails on "sast: could not run Docker (spawnSync docker EPIPE)" (WSL laptop)** — 24 Nov.
- Cause: Docker Desktop (Windows, per-user install) isn't running after a Windows restart; WSL has no Docker of its own (`/usr/bin/docker` is Desktop's CLI shim), so `sudo systemctl start docker` does nothing.
- 24 Nov, still open: after a Docker Desktop start, its `settings-store.json` had WSL integration **off** (`IntegratedWslDistros: []`, `EnableIntegrationWithDefaultWslDistro: false`; H-51 had turned it on 22 Nov). Claude switched both back on in the file (old file saved as `settings-store.json.bak-2026-11-24` beside it; the human stopped that step midway) and Docker Desktop reports running, but `docker info` from WSL still had no answer at the handoff. Check Docker Desktop → Settings → Resources → WSL integration → Ubuntu-24.04 in the UI first.
- Fix: start it from WSL: `cd /mnt/c/Users/DELL/AppData/Local/Programs/DockerDesktop && cmd.exe /c start "" "Docker Desktop.exe"`, wait until `docker info` answers (~1 min). Commits alone also work with the pinned gitleaks 8.30.1 binary in `~/.local/bin` (checksum-verified 24 Nov; not on PATH by default: `export PATH="$HOME/.local/bin:$PATH"`). Never `--no-verify`.

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

**KI-44 · `pnpm fix:changed` "refusing an unusual path: src/app/(public)/…/[code]/page.tsx"** — fixed 24 Nov (PD-09).
- Cause: the plain-path guard (for the cmd.exe fallback on native Windows) also ran when no shell is used, and App Router paths carry `( ) [ ]`.
- Fix: `scripts/fix-changed.ts` checks paths only when the invocation goes through a shell.

## WebKit (Linux CI + container)

**KI-10 · WebKit-only E2E failure: an animated value reads wrong / "still animating" / opacity 0 or 0.98 after the animation reports done** — C-77, 23 Nov.
- Cause: Linux WebKit (CI and the container) runs ~1 frame a second, for 1–2 s after a load; the computed style holds the last frame drawn, and a 90 ms window can pass with no frame.
- Fix: poll settled values to their end state (`expect.poll`, default timeout), never read once after `running == 0`; judge drawn motion by frames; never wall-clock bounds alone. A product bug only if host (macOS) WebKit also fails. DECISIONS 12 Nov, 21 Nov, 23 Nov "Linux WebKit E2E".

- More of KI-10 (CI 45537212442, 25 Nov): "the bar started empty" (first drawn frame already 0.2–0.6 into the 900 ms fill), the pour not `done` within 5 s, reduced motion mid-pour not `done` within 500 ms. Fixes in tests: prove a start state from the animation (`getKeyframes()[0]`, fill `backwards`), not from a frame that may never be drawn; wait for a signature moment's end state well past its length; "at once" in frames (count rAF from the trigger), never ms.
- Worse than 1 fps (P1-19, 25 Nov, measured in the Linux container): after a load WebKit can draw one frame and then **none for 1.7–6.2 s**. Everything that needs a rendering update waits that long: a transition stays pending at `currentTime 0`, an IntersectionObserver's first callback (`data-paused`, usePauseOffscreen), and Playwright's click "stable" check (two drawn frames). So: end states that need a frame poll for 15 s (`SETTLE` in molten-dock, vault, wipe), and a journey test with several loads gets `test.setTimeout(60_000)` (vault "DESIGN sample data", CI 45660314012).
- Since P1-19 (25 Nov) every motion spec proves a start with the shared recorder `tests/e2e/support/animations.ts` (`recordAnimations` in an init script, `started()`, `holdAnimations()`; it sees `animate()`, CSS animations/transitions, cancel and finish): use it, never a hand-rolled hook. Drawn frames, mid-animation samples and wall clock are Chromium-only or `@perf`/`@fps`/parity (TESTING §7).

**KI-53 · wipe.spec "the wallet sank" flaky (0 frames), worse on a fast machine** — 25 Nov, CI 45537212442 + host iphone14 1 in 3.
- Cause: a real product gap, not the runner. A fast server commits the shop's loading cover 16–70 ms after the tap (one worker, host), so the Wallet's 600 ms sink was cancelled after 0–2 frames and the ground showed outside the metal circle; slow parallel workers (200–2,600 ms) hid it.
- Fix (PD-11): `startWipe` takes a stage copy of the Wallet; `openWipe` sinks it on under the metal when the shop commits before the metal is full (`walletCopyAt`). The spec asserts a per-frame invariant (`gone` = 0: in the first 600 ms every frame shows the Wallet or its copy), which fails 31–33 frames without the copy.

**KI-54 · CI "E2E WebKit" job cancelled at 45 min ("The operation was canceled", no summary)** — 25 Nov, CI 45548579038 (`dae3b95`). Cause: an every-page push runs every spec (≈ 700) on webkit + iphone14 with 2 workers, and Linux WebKit draws ~1 frame/s after loads (KI-10), so one job no longer fits 45 min (≈ 615 done). Fix: the job is a 2-shard matrix (`WEBKIT_SHARD`, DECISIONS 25 Nov); a cancelled WebKit job = time limit, read its log with `gh api --allow-escape-sequences repos/{owner}/{repo}/actions/jobs/<id>/logs` (`gh run view --log` returns nothing for a cancelled job).
**KI-11 · WebKit: first mouse event after `scrollIntoViewIfNeeded` scrolls the page back (~39 px); the press lands on the wrong element**
- Fix: re-measure the target's box until the pointer is really over it, then press (slider drag, PD-06).

**KI-12 · WebKit (headless) shows the back face of a 3D-flipped element / renders no 3D**
- Cause: headless WebKit flattens 3D; `backface-visibility` alone isn't enough.
- Fix: hide the face turned away with `visibility` driven by state at the 90° point (member card, PD-06). Real Safari evidence = H-13.

**KI-13 · WebKit-only flake that survives two fix attempts** — quarantine per TESTING §7 (`test.fixme("C-xx")` + CARRIED row targeting the phase gate / owner task), carry on. Open: **C-78** WebKit slider track press (CI only, → PD-11).

**KI-43 · "Cannot take screenshot larger than 32767 pixels on any dimension" (WebKit, `shoot`)** — 23 Nov, CI 45155151040.
- Cause: `/dev/ui` at 320 px grew past 32,767 **CSS** px (OfferCard added in PD-08), so the CSS-scale fallback for phones no longer fits.
- Fix: `shoot` captures pages taller than the limit in 16,000 px clipped segments (`name--project.png`, `-part2.png`, …); inspect every part.

**KI-14 · Pushing again cancels the previous CI run (concurrency), so no CI ever finishes**
- Seen 22–23 Nov: 4 runs cancelled in a row. Fix: before the next push, let the previous run conclude (do other work meanwhile); push fixes in one batch.

## Tests in general

**KI-63 · Several `spec-repeat` dispatches at once: all but the first and the last end "cancelled"** — P1-19, 25 Nov.
- Cause: GitHub keeps one *pending* run per concurrency group (`cancel-in-progress: false` only spares the running one), and the group was per ref. Fix: the group is per ref + spec + project + grep, so different specs run side by side; the same spec dispatched twice still queues. The job's limit is 50 min (a whole motion spec × 10 on Linux WebKit: 25.8 min).

**KI-62 · Every E2E job fails at once: "Vitest cannot be imported in a CommonJS module using require()"** — P1-19, 25 Nov (CI 45652286230).
- Cause: Playwright's default `testMatch` collects `*.test.ts` as well as `*.spec.ts` under `testDir` (`tests/e2e`), so a Vitest unit file there (`tests/e2e/support/animations.test.ts`) is loaded by Playwright and crashes collection. A run naming spec files locally never loads it. Fix: unit tests of E2E helpers live outside `tests/e2e` (`tests/support/*.test.ts`, in the unit project); check with `pnpm exec playwright test --list`.

**KI-61 · Test API 500 "the web process has no \"system\" database pool"** — P1-11, 25 Nov.
- Cause: by design (P0-20) the Next.js process has no moz_worker pool, so `/api/test/*` can't run a system-scope job (e.g. `expirePointRequests`); the E2E server runs no worker either. Fix: the test API does the job's DB change with the test factories (`testOwnerDb`) and calls `deliverRealtime` for the hint; the job itself is tested in integration.

**KI-64 · WebKit guard failure "pageerror: …/api/sse/me due to access control checks." (or `…?_rsc=…`)** — P1-19, 25 Nov (spec-repeat 45660308963).
- Cause: WebKit reports a fetch cut off by a page load as an uncaught error even when the code catches it (`connect()` in src/lib/realtime/client.ts does). Not a product bug.
- Fix: the guard's WebKit-only `WEBKIT_CANCELLED_PREFETCH` allows exactly these two URL shapes (tests/e2e/support/test.ts). Any other "access control checks" error is real: look at CORS / CSP first.

**KI-60 · Shared E2E fixtures: never `page.route` for every page, never a cookie as a test switch** — P1-10, 25 Nov.
- Symptom 1: after a fixture added `page.route("**/api/sse/**")` to every page, Linux WebKit specs far from the change failed (slider drag: pointer never over the input, 3/3; CI 45596050268). Cause: any Playwright route makes WebKit intercept **every** request and turns the HTTP cache off, so every spec's load timing changes.
- Symptom 2: the replacement cookie (`moz_e2e_realtime=off`) broke `portal-access` on WebKit ("navigation to /portal is interrupted by another navigation to /wallet", CI 45619492506). Cause: specs call `clearCookies()` between roles, the switch vanished, a real stream opened and its refresh raced the next `goto`.
- Fix: test-only switches travel as a request header from the `extraHTTPHeaders` fixture (`x-moz-e2e-realtime: off`), honoured by the server only when APP_ENV=test. A spec that must fake a response routes inside that spec only.

**KI-20 · E2E presses keys / types before React owns the control** — wait for hydration: every page (incl. `/dev/molten`) marks `data-hydrating` until hydrated; interactive controls are disabled until then (DECISIONS 10 Nov, 23 Nov).
- Same cause, other side (CI 45128513936, Linux WebKit iphone14: "keyboard hides the dock" never saw `data-keyboard`): a hook that only listens (focus, resize) misses what happened before its effect ran, and the root's `data-hydrated` can come before the shell's effects. Fix in the product: such hooks also read the current state once on mount (`useKeyboardOpen`, 23 Nov).
- Third face (CI 45136257889, still flaky after that fix): `locator.focus()` doesn't wait for the control to be enabled, and `focus()` on a disabled field is a silent no-op, so the test "typed" into nothing. Before `focus()` on a hydration-gated field: `await expect(field).toBeEnabled()`, then assert `toBeFocused()`.

**KI-21 · Gesture spec (flick, drag) fails under load** — timed in wall-clock. Bound by pointer steps / the speed the page measured, with bounded retries (overlays flick, C-76 batch).

**KI-22 · "Settled" check never passes on touch projects** — touch-only idle motion (card sway) never settles; assert the target state, not "no animation" (PD-06).

**KI-45 · `jobs.test.ts` "close() waits for in-flight jobs": expected 'active' to be 'completed'** — seen once, 24 Nov (gate:task PD-09 run 5; the 4 runs before passed 1456/0).
- Known: the processor had finished (`finished` true) but the job's state still read `active` after `worker.close()` + `connection.quit()`; 13/13 three times alone. Not root-caused (BullMQ completion write vs close under a loaded parallel run?). If it shows again: quarantine it (TESTING §7) and look at BullMQ's `whenCurrentJobsFinished` / `moveToCompleted` order.

**KI-47 · Parity spec: "never happened: …lands", or a frame far later than the spec says** — two harness traps (PD-10, CI 45404530673).
- The page clock belongs to the **context**: both parity pages share one, so `page.clock.runFor` on each page runs it twice. Run once per context (`vault.spec` `run`).
- An animation paused at its end with `fill: none` (`freezeTimed(p, true)`) is neither current nor in effect, so `document.getAnimations()` drops it and nothing can resume it: keep the list (`window.__frozen`) and resume from it (`vault.spec` `release`).
- Also: `pnpm test:parity <spec>` needs `--project=x` (the `=` form); `--project x <spec>` reads the spec as a project name (fixed in `scripts/e2e.ts`).

## CSS / build surprises

**KI-30 · An inline `svg` is taller than expected (e.g. 46 vs 52 px)** — Tailwind preflight makes every `svg` `display:block`; set `display:inline; vertical-align:baseline` explicitly (stars, PD-06).

**KI-31 · Focus ring missing on a component** — a component selector (`.m-field input`, specificity 0,1,1) outranks the unlayered global `:focus-visible` (0,1,0); restate the ring on `<component>:focus-visible` (CI 45057026965).

**KI-32 · Hard-coded colour passes lint** — the css-hex check catches hex only, not `rgba()`; reviewers must catch it; use tokens (ENGINEERING §9).

**KI-42 · Frame rate drops on a page the change never touches (pixel7 `@fps` FX stress 46–57 fps vs main 59–60, no long tasks)** — Tailwind reads every word of every file it scans as a possible class: a note saying "backdrop-filter" (parity-parts.ts, DECISIONS.md) created that utility and registered nine `--tw-backdrop-*` `@property`s, which every element then carries on each style recalc (PD-07, CI 45148024961; bisect: CSS-only branch 57–60, code-only 46–56). Fix: Tailwind scans `src/` only (`source("..")` in globals.css); `pnpm check:bundle` fails on a registered property not on `REGISTERED_PROPERTIES`. Diagnose by diffing the built CSS rule sets of the two commits. Still under 58 on CI after the fix, and main itself now swings 52–58.8 fps on one commit: quarantined on pixel7 (C-79, T-7).
**KI-56 · A spec that slows a route with `page.route` + a fixed delay fails only in a busy parallel run (the page "arrived early")** — the delay starts when the request is made, and a Next prefetch is made at page load, so the time from load to the test's action eats the margin (wipe.spec "slow way back" on pixel7: Wallet committed before the check in a 164-test run, 3/3 alone; P1-B close, 25 Nov). Fix: time the hold from the action (a promise the test resolves just before the click; the handler awaits it, then the delay).
**KI-57 · Linux WebKit: `document.fonts.check()` says a blocked web font is ready (gate `data-face` never "fallback")** — a face whose load failed (`status: "error"`) counts as available to `check()`, and Linux WebKit returns true for a blocked Fraunces where Chromium returns false (CI 45562871999, gilded-gate "blocked display font"). Fix: decide from the faces themselves (`[...document.fonts]` of that family, ready only if one is `loaded`; `lockFace` in gilded-gate.ts). The local Linux container also shows the gate letters with no animations at 2.5 s (CI doesn't), so verify gate timing on CI, not the container (C-83).
**KI-58 · wipe.spec "reduced motion switched on mid-wipe" fails on WebKit with axe color-contrast on the shop page (status badge, sometimes the whole page)** — a test that ends while the page is still arriving: (a) the test's own freezer can pause a content rise at 0 ms, and a paused animation keeps its "from" frame even at reduced motion's 0.001 ms (the guard ignores paused animations); (b) a part that streams in after the switch still takes its ≤ 150 ms reduced-motion fade, after the guard's wait, under the axe scan (CI 45576974690, iphone14, 2/5 in confirm-flakes; host WebKit ~1/12). Fix: the test resumes what it froze once the stage is gone, then waits until the status row and everything above it are at opacity 1 (40/40 on webkit + iphone14). Any spec that freezes animations should release them before it ends.
**KI-59 · wipe.spec "a card tap pours the metal…": "the wallet came back from the sunk state" sees 0 frames on CI WebKit (confirmed flake, passes 5/5 alone)** — the frame recorder looked only at the last `[data-route-content]` (during the swap the old page and the new one can both be in) and needed a rendered frame inside the 520 ms rise, which a busy Linux WebKit may not give (CI 45582899120). Fix: it checks every route content, and also counts a sink/rise started on route content (an `animate` hook: first keyframe `scale(0.…)`), so the check no longer depends on frame delivery; removing the rise still fails it (mutation run). **Same cause, two more probes (CI 45588327123, main `79b19bc`, iphone14):** "the shop opened in a circle" saw 0 circle frames (failed again alone) and the mini vault bar's fill timing was never read (confirmed flake), both from frame-only probes. Fix: the `animate` hook also counts a circle clip started on route content, and the bar test reads the fill's timing when its animation is made. Rule: on Linux WebKit, prove an animation *started* from the `animate` call; read drawn frames only on Chromium. The hook is now the shared recorder (KI-10, P1-19).

## Infra / backups

**KI-40 · wal-g `wal-push` hangs** — the Postgres image lacks `ca-certificates` (wal-g #2550).

**KI-41 · backup-pitr "unprotected WAL" fixture can't be built on gpg ≥ 2.5 (Mac)** — gpg 2.5 writes AEAD even with `--rfc2440`; the case skips there (C-53, DECISIONS 17 Nov).

**KI-49 · Offline sign-in tests fail on WebKit: "requestfailed … chunks/<x>.js WebKit encountered an internal error"** — the chunk is the Sentry browser SDK, loaded after an idle callback; WebKit has no `requestIdleCallback`, so it waits on a 1.5 s timer, and `networkidle` can settle before that timer fires: the SDK's fetch starts after the test cut the network (CI 45476822891, staff + customer offline specs). Fix: `<html data-monitoring>` (`loading` → `on`/`failed`, `off` when disabled; `src/instrumentation-client.ts`) and the offline specs' `quiet()` waits until it isn't `loading` before going offline. Any new test that cuts the network uses the same wait.
**KI-50 · A glass, goo or glide assertion passes locally but fails on CI ("backdrop-filter" `none`, no goo filter)** — CI's 4-core runners get the lite device tier (`TIER_PREPAINT_SCRIPT`: ≤ 4 cores or ≤ 4 GB), which drops blur, goo and glides (`.lite …` in molten.css); a Mac is full tier (CI 45484442092, sidebar glass). Fix: a spec that checks a full-tier effect pins the tier first: `page.addInitScript` setting sessionStorage `TIER_OVERRIDE_KEY` to `"full"` (molten-dock.spec sidebar) or `pinDevice(page, 8)` (fx.spec); a lite check pins `"lite"`.
**KI-51 · A click on a control that only shows while focused passes on Chromium and CI WebKit but fails on the Mac's WebKit (it "doesn't react")** — WebKit on macOS never focuses a button on a mouse press and blurs the focused one, so a control styled only by `:focus` (the toast's Dismiss, `.m-toast-x`) collapses under the pointer mid-click and the click is lost; Linux WebKit (CI) focuses on press. Real for Safari users who Tab to it and then click. Fix: style it by `:focus, :active` too (PD-11, `overlays.spec` "toast open: axe clean" 3/3 on host WebKit before).
**KI-52 · WebKit: the guard fails a passing test with "console: TypeError: Load failed" + "pageerror: Load failed" (no URL)** — a full `page.goto` (or reload) while a fetch is still in flight cancels it, and WebKit raises the cancellation as an uncaught error when nobody catches it: Next's RSC fetch of a client navigation that just committed (seen after `router.replace("/wallet")` then `goto`, `shop-page.spec` "leave on day 1", iphone14 + webkit, 1 in ~40 runs) or a lazy chunk preload (`JoinCta` preload, fixed: `preloadQuietly`). Our own dynamic imports catch. Fix in tests: `await page.waitForLoadState("networkidle")` after a client navigation before a `goto`. Cancelled nav-link prefetches have their own message (`WEBKIT_CANCELLED_PREFETCH`).

**KI-55 · `pnpm e2e:linux --visual --update-snapshots` rewrites the `-darwin` baselines (no `-linux` files appear)** — under `e2e:linux` the runner stays on the Mac and only the browsers run in the container, so Playwright's `{platform}` suffix named Linux pixels as darwin. Fixed (P1-B close, 25 Nov): `snapshotPathTemplate` in `playwright.config.ts` uses `linux` whenever `PW_WS_ENDPOINT` is set. After such a run, check `git status` shows only the files of the OS you meant to update.
