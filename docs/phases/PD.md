# PD — Molten design

**Goal:** the app looks, moves and feels **exactly** like the approved Molten demo (`design/reference/molten/`): same design, same animations, same quality. The demo is the specification. Everything it shows is matched 1:1 and proven by automated parity tests. Everything it doesn't show (desktop rail, shop dashboard, admin, error pages) is built in the same language, reviewed, and labelled "extended from the reference", never "matching".

**Why now:** the client found the first design too plain. The human approved Molten on 20 Nov 2026 and ordered it **first**: the whole PD phase runs before every other open task (P1-B close, P1-10 onward). Every screen after PD is built with the Molten components from day one. (DECISIONS 20 Nov.)

**Reference (the spec):** `design/reference/molten/` (`index.html`, `img/`, `screenshots/`; fingerprint in its README). Order of authority for anything the reference shows: **reference > DESIGN.md**. DESIGN.md v2 (§3, §5–8, §12) quotes the reference's values; the motion spec table lives in DESIGN §7.4. The reference is frozen: any change is a DECISIONS entry plus a new fingerprint.

**Effort:** about 10 working days in total (estimate; no target date, CLAUDE.md "Pace").

## How to work this phase
- Same protocol as every phase (CLAUDE.md §1): test first, `pnpm gate:task`, one commit per task, progress files, evidence.
- **Parity is part of the definition of done.** A task that touches anything the reference shows can't be ticked until its parity specs pass (PD-01 harness). "Looks close" is not done.
- **Port, don't reinvent:** copy keyframes, durations, easings, colours, gradients, shadow stacks and particle numbers verbatim into tokens and presets. A value that must change (browser bug, accessibility, React constraint) gets a DECISIONS line (what, why, visual effect) and a parity tolerance note for that element only.
- **Every parity, motion or visual spec** runs on Linux Chromium in the gate and on CI, WebKit on CI from the early checkpoint push (CLAUDE.md §4, 23 Nov); `pnpm e2e:linux` is for debugging a Linux-only difference.
- **Screenshots** of every touched customer screen at 320, 390 and 1440, inspected next to the matching file in `design/reference/molten/screenshots/`.
- **Reviews:** `design-reviewer` with the `review-animations` skill on every task that adds or changes motion, judged **against the reference**, not general taste. Load `emil-design-eng` / `mobile-native` for the new patterns (liquid choice, coin switch, dock, card stack).
- **None of these tasks is on the security-relevant list** (CLAUDE.md §4); diffs are reviewed at each sub-phase close (`/subphase-complete` step 4). PD-08 changes seed data and image loading, so its close also checks the CSP `img-src`.
- **Brief phase review:** done in PD-00 (every task below has measurable criteria, edge cases, tests and verify).
- Sub-phases A → C in order. After the PD-C close, work resumes with the P1-B close (`/subphase-complete`, which then reviews and QAs the restyled Wallet, Vault and shop page).

---

## Sub-phase PD-A · Foundation

### PD-00 · Reference, rules, docs
**Depends on:** human approval (20 Nov).
**Read:** `design-concept-molten/IMPLEMENTATION_PLAN.md` (outside the repo, the draft of this file).
**Build:** reference copied to `design/reference/molten/` with a README (fingerprint, frozen rule); CLAUDE.md standing rules (no deadline, design first, motion tiers, budget judgment for animation, reference in the source-of-truth order); DESIGN.md v2; DECISIONS; PHASES.md + this file; PROGRESS, HUMAN_TASKS (H-49 parity sign-off), MAP; `design-reviewer` agent uses the reference.
**Acceptance criteria:** reference README fingerprint equals `shasum -a 256 design/reference/molten/index.html`; every "10 Dec" target and "gold ≤ 10%" / "UI motion under 300 ms" rule in CLAUDE.md, DESIGN.md, PHASES.md, the phase files and the design-reviewer agent replaced; docs-only commit.
**Tests:** none (docs only).
**Verify:** `grep` for the old rules returns nothing outside history files.

### PD-01 · Parity harness
**Depends on:** PD-00.
**Read:** DESIGN §7.4 (motion spec); TESTING §4, §7; `tests/e2e/support/`; `src/features/dev/DevGate.tsx`; `playwright.config.ts`.
**Build:**
- `/dev/molten`: a dev-only page (same `DevGate` as `/dev/motion`: 404 in production, available under `APP_ENV=test`) that rebuilds the reference page section by section **from production components only**: same copy, sample data and images. Each later task fills its section; each section and moving part carries `data-parity="<name>"`, in the reference as well (added to the copy under `tests/parity/reference/`, never to the frozen original).
- Playwright project `parity` (Chromium + WebKit, DSF 2, 1440 and 390): the test server serves the reference copy; fonts are mapped to the app's self-hosted Fraunces/Manrope files so both pages render identical glyphs with no network.
- `tests/parity/static.spec.ts`: every `data-parity` section, rest state, animations paused, FX canvas hidden; `toHaveScreenshot` `maxDiffPixelRatio ≤ 0.01`.
- `tests/parity/frames.spec.ts`: each motion-spec row is triggered in both pages and paused via `document.getAnimations()` (plus the FX/gate clocks) at 0/25/50/75/100% and the named beats; tolerance ≤ 0.02.
- `tests/parity/curves.spec.ts`: `transform`/`opacity` of named elements sampled every 50 ms during each interaction; max deviation 2 px / 0.03.
- `src/lib/motion/molten-spec.ts` (the DESIGN §7.4 table as data) + `molten-spec.test.ts`: parses the reference CSS/JS and asserts every duration, easing, keyframe offset and particle number equals the production tokens/presets. Rows start as `pending` and each task flips its own rows to `required`; a `required` row can never go back.
- `pnpm test:parity` script (+ CLAUDE.md §7 command list); CI runs it on push (Chromium) and in the twice-weekly full run (WebKit too); `gate:task` runs the sections named by the task's `[PD-nn]` titles.
**Acceptance criteria:** reference vs itself = 0 diff in all three specs (harness self-test); a deliberately changed duration in a fixture makes the spec-table test fail; a 3 px offset in a fixture section fails static parity; runs offline; CI usage stays inside the free Actions budget (ARCHITECTURE §10 check).
**Edge cases:** font hinting differences between macOS and Linux (per-OS baselines like the other visual specs; parity compares page to page in the same browser and OS, so baselines aren't needed for the A/B diff); animations with negative random delays in the reference (harness seeds `Math.random` in the reference copy and passes the same seed to the app); WebKit `getAnimations()` on SVG elements (fallback to pausing with `animation-play-state` plus `currentTime` where needed).
**Tests:** the self-tests above.
**Verify:** `pnpm test:parity` output (pending sections listed, self-test green).

### PD-02 · Tokens, fonts, surfaces, living background, gilded edge
**Depends on:** PD-01.
**Read:** DESIGN §3, §4, §6.1–6.2; reference `:root`, fonts link, `.aurora`, `.grain`, `.tile`, placed-surfaces block, gilded edge CSS + JS.
**Build:**
- `tokens.css` + `tokens.ts`: every reference token (pearl, ivory, champagne, ink 1–3, line, gold deep/gold/bright/light, ember, obsidian, iridescent rose/mint/lilac, metal + metal-text gradients, surface/edge/inner/lift/lift-hover, radii 16/26, easings incl. the exact `linear()` spring with the `@supports` fallback, tier durations). Old token names stay as aliases until PD-11 removes them (no big-bang rename).
- Fonts: Fraunces axes `opsz`, `wght`, `SOFT`, `WONK` + italic; Manrope 400–800. Measure the added bytes, keep `display: swap` and the preload rule (DESIGN §12); DECISIONS line with the size.
- `LivingBackground` (fixed, `aria-hidden`; three drifting glows + grain; paused when `document.hidden`; static under reduced motion).
- `Card` variants: `surface` (placed: hairline edge, inner bevel, layered lift, hover lift 4 px) and `hero` (adds the gilded edge); dark variant (obsidian, gold outline).
- `GildedEdge`: SVG overlay from the reference geometry (gem on the corner-arc midpoint, 8.5 px half-diagonal, five facets + rim; 2 px line both ways with fades; bottom-right 1.6 px echo; glint + light glide on an 8 s cycle with a random phase; hover restarts it; IntersectionObserver pause; lite tier drops the glide). Pure geometry in `src/lib/motion/gilded-edge.ts`.
- Cards no longer clip (`overflow: visible`) so the gem sits on the corner; effects that need clipping get their own inner layer (as the reference's `v-bg` / `spec-bg`).
**Acceptance criteria:** static parity of the reference "Language" section and tile surfaces ≤ 1%; frame parity of the gem glint (3% of the cycle) and the glide (12%); tokens test lists every new property; contrast test passes for every new text/background pair; CLS 0 on `/dev/molten`; font bytes recorded.
**Edge cases:** very small cards (geometry clamps; the gem never overlaps content padding); card resized (ResizeObserver redraws, no drift); reduced motion (gem and line static); WebKit without `linear()` (fallback easing); RTL not supported (documented).
**Tests:** unit for geometry (radius, clamps, path strings); component tests; parity; tokens/contrast tests.
**Verify:** screenshots 320/390/1440 next to the reference; Linux container run.

### PD-03 · Motion core: FX engine, tiers, reduced motion, press kit
**Depends on:** PD-02.
**Read:** DESIGN §7; reference FX engine, `anim()`, `ripple`, `pressable`, `celebrate`, `countUp`, tier detection; `src/lib/motion/presets.ts`; `src/lib/sound.ts`, `src/lib/haptics.ts`.
**Build:**
- `src/lib/motion/fx.ts`: the reference engine (spark, coin, leaf; sprites drawn once; one fixed canvas mounted in the root layout outside `RouteTransition`; rAF only while particles live; cap 420 full / 160 lite; DPR ≤ 2; seeded RNG option). Pure `step()` for tests.
- `src/lib/motion/tier.ts`: `full | lite` from `hardwareConcurrency ≤ 4`, `deviceMemory ≤ 4` or Save-Data → `<html class="lite">`; override switch on `/dev/motion`.
- Reduced motion from one source: `prefers-reduced-motion` + the "Reduce animations" preference in Me (DESIGN §7.2; add it if it doesn't exist yet) → `<html class="rm">`, FX no-op, `anim()` capped at 150 ms, the reference `.rm` rules.
- Press kit: `usePress` (scale .93 spring), `useMagnetic` (fine pointer only), `ripple(el, event)`, `celebrate(el, event, coins)`, `useCountUp`; sound/haptics where DESIGN §9/§10 say (sounds stay off by default).
- `/dev/motion`: FX playground (tier switch, slow-mo, seed).
**Acceptance criteria:** FX parameter parity (counts per tier, speed ranges, gravity, drag, lifetimes, cap, DPR) via the spec table; 200-burst stress at 4× CPU throttle: 60 fps (≥ 58 measured), p95 ≤ 16.8 ms (up to 19.3 ms accepted by the human, 21 Nov, with the measured value in DECISIONS), no long task > 50 ms (trace in SESSION_LOG); clicks pass through the canvas (E2E); zero rAF callbacks once idle.
**Edge cases:** tab hidden mid-burst (stops, resumes cleanly); resize/orientation change (no blur); route change mid-burst (particles finish over the new page, never block it); reduced motion switched on mid-burst (canvas clears).
**Tests:** unit `step()`, tier, seeded RNG; E2E pointer-through, reduced motion, idle; perf trace spec.
**Verify:** trace numbers; `/dev/motion` screenshot.


## Sub-phase PD-B · Controls

### PD-04 · Buttons, icon button, toast
**Depends on:** PD-03.
**Read:** DESIGN §6.3, §7.4; reference `.btn*`, `.ico-btn`, `.toast`, button JS.
**Build:** `Button` variants `molten | orbit | ghost | destructive` (destructive in the same language), sizes 46/54, loading keeps width, label roll (`resultLabel`), magnetic + pointer highlight on fine pointers, ripple from the press point, `celebrate` on `onSuccess` (opt-in); `IconButton` toggle with the heart burst; `Toast` restyle (obsidian, coin spin, progress, spring in/out).
**Acceptance criteria:** static, frame and curve parity for the Buttons tile and the toast; targets ≥ 44 px; visible focus ring; disabled and loading states (not in the reference) pass `design-reviewer`; axe clean.
**Edge cases:** double click (one celebration, label roll restarts cleanly); keyboard activation (ripple from the centre); touch (no magnetic, no sticky hover); long labels (no overflow; width kept); reduced motion.
**Tests:** component tests (states, aria); parity; keyboard E2E.
**Verify:** screenshots; Linux container run.

### PD-05 · Coin switch, liquid choice, segmented control, seal checkbox
**Depends on:** PD-03.
**Read:** DESIGN §6.3, §7.4; reference `.tgl*`, `.liquid`, `#goo`, `liquid()`, `.chk`, `.box`.
**Build:** `Switch` (coin knob M → tick: roll, flip, liquid fill, spark + pulse); `LiquidChoice` (radio group: goo blob + droplets, arrow keys, roving tabindex; used by `Radio` card groups and `SegmentedControl`); `Checkbox` (seal press, centre flood, tick draw, ring, sparks). The goo filter is defined once in the root layout.
**Acceptance criteria:** parity (static; frames at 0/42/76/100%; curves) for the Coin switch, Liquid choice and Gold seal tiles; native semantics (`role=switch`, `role=radio`, checkbox input) with labels; form values unchanged; WebKit fallback (no filter, plain spring) reviewed and logged.
**Edge cases:** rapid toggling (animations retarget, never queue); 2–5 options (blob width follows); container resize mid-animation; disabled options skipped by arrow keys; lite tier (no filter, no droplets).
**Tests:** component tests; keyboard E2E; parity.
**Verify:** screenshots; `review-animations` on the diff.

### PD-06 · Tabs, text field, star rating, slider, member card
**Depends on:** PD-04, PD-05.
**Read:** DESIGN §6.3, §7.4; reference `.seg*`, `.panel`, `.field`, `.beam`, `.stars`, `.slider`, `.mcard*`; COMPLIANCE §1.
**Build:** `Tabs` (obsidian track, metal pill + trail, directional panel slide, count-up); `TextField` (float label, beam from the tap point, shake + message on error, tick on success; `aria-describedby` kept); `StarRating` (ignite stagger; the same two equal choices for every rating; used by Rate your visit in P3); `Slider` (coin thumb, tilting value bubble, notches with sparks; native range input underneath); `MemberCard` visual (holo, glare, tilt, flip to QR, idle sway on touch only; P1-14 wires the data and the offline card).
**Acceptance criteria:** parity for the Tabs, Input, Rate your visit, Molten slider and Member card tiles; unit test: `StarRating` offers identical choices for 1–5 stars (COMPLIANCE §1); tilt off under reduced motion and on iOS without permission (DESIGN §6); QR on the card back is a labelled placeholder on `/dev/molten` until P1-14.
**Edge cases:** 2 and 4 tabs; autofilled field (label floats); pasted invalid email; slider keyboard steps (each notch sparks once); card flipped then resized; mouse leaving the card fast (springs back).
**Tests:** component tests; compliance unit test; parity; keyboard E2E.
**Verify:** screenshots; axe.


## Sub-phase PD-C · Structure and signature moments

### PD-07 · Floating dock and Scan button
**Depends on:** PD-05.
**Read:** DESIGN §5, §7.4; reference `.dock`, `.dk`, `.scan`; `src/features/portal/shell/BottomNav.tsx`, `PortalShell.tsx`.
**Build:** customer `BottomNav` becomes the floating glass dock (safe-area aware; liquid indicator from `LiquidChoice` geometry; raised Scan with orbiting halo + radar; lite tier: no blur); shop and admin bottom navs use the same dock with their own items; the desktop rail keeps its layout with Molten tokens, hover and an active liquid indicator (extended from the reference).
**Acceptance criteria:** dock parity on `/dev/molten` (phone frame) and on the real Wallet at 390; `aria-current` on the active item; Scan opens the existing scan route or placeholder; content never hidden behind the dock (bottom padding = dock height + safe area); loops paused off-screen.
**Edge cases:** iOS Safari toolbar resize; Android keyboard open (dock hides); five items at 320 px (labels fit); route change while the indicator moves.
**Tests:** E2E nav per portal; parity; Linux visual run.
**Verify:** screenshots 320/390; real devices in H-13.

### PD-08 · Wallet stack, gold wipe into the shop, shop photos
**Depends on:** PD-02, PD-03, PD-07.
**Read:** DESIGN §6.4, §7.3, §7.4; reference `.stack`, `.wcard`, `.cover`, `.offer`, wipe JS; `src/features/wallet/`, `src/lib/motion/hero-handoff.ts`, `src/features/shop/ShopPageHeader.tsx`, `src/components/ui/ShopCard.tsx`, `src/server/db/demo-seed.ts`.
**Build:** `ShopCard` becomes the wallet card (cover photo under the gradient, round logo in a gold ring, gold count, progress with shine); Wallet list → stacked wallet on mobile (fan-out, staggered shine; groups of 3 with "Show all" for long lists); desktop keeps a grid of the same cards. Card → shop keeps the existing shared-element morph across `loading.tsx` **and** adds the gold circle wipe from the tap point (620 ms, shop view +110 ms), wallet scale/fade, content rise. `ShopPageHeader` uses the cover photo with the logo in the corner. Demo shops in `demo-seed.ts` get the reference photos (stored in `public/demo/shops/`, served through `next/image` as AVIF/WebP, cover ≤ 120 KB). Real shops use `coverUrl` / `logoUrl`, else a designed fallback (metal monogram coin; never bare initials) until uploads exist (P2-05).
**Acceptance criteria:** wallet and wipe parity (frames at 0/260/620/730 ms); the morph never blocks navigation and works across `loading.tsx` (existing wallet/shop E2E green); images have explicit sizes (CLS ≤ 0.05); decorative covers `alt=""`, logos named; Wallet route within the DESIGN §12 judgment band; CSP `img-src` unchanged (self-hosted).
**Edge cases:** one shop (single card, no stack); 30 shops (stack groups, performance); missing photo (fallback coin); slow network (wipe plays, content streams in behind); back during the wipe (reverses from the back button); reduced motion (instant swap with a 150 ms fade).
**Tests:** wallet view unit tests (grouping); E2E wipe + back; parity; Lighthouse wallet route.
**Verify:** screenshots 320/390/1440; wipe trace at 4× throttle (60 fps).

### PD-09 · Gilded Gate 2.0
**Depends on:** PD-03.
**Read:** DESIGN §8.1, §7.4; reference intro section (markup, CSS, timeline JS); `src/lib/motion/gilded-gate.ts`, `src/components/motion/GildedGate.tsx`, `gilded-gate.css`, `GildedGateLoader.tsx`, `gilded-gate-run.ts`; `tests/e2e/gilded-gate.spec.ts`.
**Build:** keep the existing architecture (pre-paint `gateScript`, once per shop per browser session, data fetch never waits, tap skips, sound only when unlocked, `gateMorph` hand-off to the landing cover) and replace the visuals with the reference timeline: night canvas, particles converging into the shop's logo coin (targets from the coin ring + disc; ≈950 full / 420 lite), single flash, shockwave, glow, logo overshoot, rays, coins + sparks through the FX engine, 3D orbit rings, letters forged with the weight axis, shine. The coin frames the shop's logo photo (fallback coin when none). The canvas runner is a lazy chunk (≤ 40 KB gzip); landing initial JS ≤ 140 KB.
**Acceptance criteria:** frame parity at 700 / 1150 / 1450 / 2300 ms and rest; curve parity for logo, letters, orbits; existing gate E2E (once per session, skip, reduced motion, slow network) green; trace at 4× throttle: p95 ≤ 16.8 ms on the lite tier and ≤ 20 ms on full during convergence (DECISIONS if above 16.8), no long task > 50 ms; exactly one flash (WCAG 2.3.1).
**Edge cases:** fonts not loaded yet (letters wait ≤ 1.2 s, then the fallback face, as in the reference); long shop names (wrap by word; scale down at 320 px); tap during convergence (end state at once); tab hidden (finishes at the end state); landscape phone; shop without a logo.
**Tests:** unit for the timeline and target sampling; E2E above; parity; perf trace spec.
**Verify:** beat screenshots next to `design/reference/molten/screenshots/intro-*.jpg`; `review-animations`.

### PD-10 · Vault pour, reward unlocked, redeem code
**Depends on:** PD-03, PD-04.
**Read:** DESIGN §8.3–8.6, §7.4; reference vault section + JS; `src/components/ui/Ingot.tsx`, `src/components/motion/IngotPour.tsx`, the Gold Vault page; `tests/e2e/vault.spec.ts`.
**Build:** `Ingot` gets the reference geometry, wave, stream with flowing dash, splash sparks, glint and top-face fill at 100%; `IngotPour` keeps today's rules (first view 0 → level, later views rise only) with the reference timing; vault header with the shop logo. New visual components for P1-15/P1-16: `RewardUnlocked` (rays, ring, ingot lift, gold leaf, card flip, toast) and `RedeemCode` (digit flip, 15-minute ring, live countdown); P1-15/16 wire them to real events, until then they live on `/dev/molten`.
**Acceptance criteria:** parity for the vault at rest, mid-pour (500 ms), full, unlocked and redeem; existing vault E2E and the 60 fps pour trace green; live-region text unchanged ("720 of 1,000 gold, 72%", "Your reward is ready"); the countdown takes the server expiry as a prop, never the client clock alone.
**Edge cases:** multi-ingot overflow (fill to 100%, unlock, the new ingot starts empty); pour interrupted by navigation; reduced motion (end states); countdown reaching zero (expired state).
**Tests:** component tests; parity; existing perf spec.
**Verify:** screenshots; trace.

### PD-11 · Restyle built screens, full parity sweep, close
**Depends on:** PD-02 … PD-10.
**Read:** this file; `.claude/commands/subphase-complete.md`.
**Build:** apply the components and surfaces to every screen built so far (shop landing, sign-in screens, join sheet, Wallet, shop page, Gold Vault, loyalty settings, portal shells, preferences, system page, error/empty states); remove the old token aliases; update visual baselines (darwin + Linux; Windows at the phase gate); `/dev/molten` complete.
**Acceptance criteria:** full parity suite green (static, frames, curves, spec table; Chromium + WebKit); full 5-project E2E green (every-page change); Lighthouse within the DESIGN §12 bands (each overage in DECISIONS); traces at 4× throttle for Gate, wipe, pour, reward and the stress burst; `design-reviewer` + `code-reviewer` on the PD commits; exploratory QA of every changed screen at 320/390/1440 (Chromium + WebKit); **H-49** human parity sign-off with the side-by-side set (reference vs app, every section and frozen beat, 390 + 1440); screens the reference doesn't show listed in DECISIONS as extended.
**Edge cases:** the shop dashboard and admin screens (checked for consistency, logged as extended).
**Tests:** as above.
**Verify:** evidence in SESSION_LOG; PROGRESS "Next" points to the P1-B close.


---

## Risks
- **Safari** (goo filter cost, `linear()`, `@property`, backdrop blur): per-component fallbacks; WebKit in every parity run; real iPhone (H-13).
- **Low-end Android frame rate:** device tiers, particle caps, off-screen pausing, traces at 4× throttle; the frame budget never moves.
- **Bundle growth:** FX engine and gate runner lazy where possible; judgment bands with DECISIONS lines; no new animation library.
- **Exactness in React:** values ported verbatim; the harness measures instead of trusting the eye; every deliberate deviation is logged.
- **Screens the reference doesn't show:** same language, reviewed, labelled extended.
- **Photos:** stored copies of Unsplash images (Unsplash licence) for demo shops only; real shops upload their own (P2-05).
