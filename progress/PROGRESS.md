# PROGRESS — read this first every session

_Current state only, ≤ 120 lines. History goes to SESSION_LOG.md. AUDIT.md is frozen history (open items live here)._

## Baton
Baton: held by talha.syed since 2026-11-22 17:32 UTC

## Handoff note
_Overwritten by `/handoff` or `/checkpoint`. The next session reads this first._
- **Checkpoint by talha.syed, 23 Nov 2026 (Mac); baton held. Human: autopilot ON (`/resume autopilot`); finish PD-06 properly, then close PD-B as fast as possible: fast means less overhead, never skipping a necessary check, review or criterion (human, 23 Nov).**
- **PD-06 in progress on `wip/PD-06`** (pushed HEAD `9bcd719`). Lettered steps **a–e all done**: a Tabs (`31347b1`); b TextField; c StarRating (`413acf8`); red CI fix (`379213e`, focus halo on `.m-field input:focus-visible`); d Slider (`ec033ae`); **e MemberCard** (`6606d25`: `role="button"` div like the reference (Enter/Space keydown, held key once, label per face, `aria-disabled` until hydrated); tilt ±11°/±13° .12 s linear, spring back + flip .7 s spring, sway 7 s touch-only; RM: nothing follows/sways, flip still turns; iOS: no tilt/sway, foil + glare still follow; one rAF write per frame, foil/glare = pseudo layers moved by translate/scale (composite only, promoted while live); pending frame cancelled on leave; labelled QR placeholder canvas (reference seed-42 pattern) + `back` slot for P1-14; card < 300 px tightens type; parts `member-card` + `member-card-tile` required, spec row `member-card` required; `ownHeight` gone from every part; token `--mcard-face`); **WebKit CI red fixed** (`49a55cd`, CI 45061015313: tab scroll-into-view in the scroller's coordinates (offsetLeft missed its 6 px padding); pill check ≤ 1.5 px (WebKit pixel-snapped layer); rating choices rest at opacity 1 when shown (Linux WebKit left "Send privately" at 0); slider drag lean sampled per frame; screens test slow; WebKit slider drag quarantined C-77); `4177678` Semgrep literal regex in the card test. **CI 45068046655 red fixed** (`9bcd719`: rating choices + card angles polled to their settled look (frame-starved Linux WebKit reports animations done while the computed style holds the last frame); card hides the face turned away by `visibility` swapping with the turn at 9.6% (design-review HIGH: Playwright WebKit painted the back over the front, mirrored), same rule in the parity copy (2nd `REFERENCE_FIXES`); C-77 slider drag un-quarantined (root causes found, below)).
- **Continue here:** 1) **PD-06 close part B:** check CI on `9bcd719` first (C-77 closes when its WebKit E2E is green with the drag test active, 0 flaky; any red → root cause first); fix the design-review findings (batched by the coordinator); DECISIONS batch (the PD-06 list in SESSION_LOG 23 Nov "step e" entry + this Handoff's earlier list: countUp no pre-frame write; field focus ring + halo fix + harness shadow pin; TextField error under the field; label ink-2 tolerance; harness ResizeObserver wait + runFor/until + `values`; star svg inline vs preflight; gallery `data-hydrating`; slider sparks at the notch, native thumb = coin size, tilt normalised per range, thumb by container units, ticks ink-2; tab pill ≤ 1.5 px; rating choices opacity 1; card: foil/glare translate/scale layers, glare scaled square, role=button div + `aria-disabled` until hydrated, iOS no tilt/sway, leave cancels a pending frame, < 300 px tightens type, name ellipsis; already recorded 23 Nov: member card back face (human confirmed) and Linux WebKit settled reads/C-77); FOLLOWUPS (TextArea/Select old look → PD-11; LiquidChoice/Checkbox value-change motion and `--chk-box` lines tagged PD-06); `gate:task PD-06`; tick PHASES; main. 2) PD-B close (`/subphase-complete`, C-76 first).
- **Not yet tested:** CI on `wip/PD-06` `9bcd719` (pushed 23 Nov; the evidence for the WebKit fixes on CI's Linux WebKit; local Linux-container WebKit + iphone14 already 34/0). Member card on real devices (H-13: iOS no tilt, Android sway, Safari 3D flip); slider touch drag on a real phone (H-13).
- **Windows laptop (WSL):** local WebKit only with `--workers 1`; never push or run suites while a gate runs; on a wip branch update main with `git fetch`, not `git pull --rebase origin main`.
- **Before work:** nothing new (no env vars, migrations or seeds). New tokens `--star-off`, `--star-hover`, `--slider-coin`, `--mcard-face`.
## Status
- **Phase:** **PD — Molten design** (runs first; human 20 Nov; `docs/phases/PD.md`). Then P1 resumes with the P1-B close. **P0 officially closed 17 Nov (human)**; its gate, DoD evidence, demo and leftovers are carried to P1-18 (C-35, C-40, C-17, C-48, C-49). Human tasks (H-45 etc.) are done by the human later; don't wait on them.
- **Current sub-phase:** **PD-B** Controls: ~~PD-04~~ → ~~PD-05~~ → PD-06 → close; then PD-C (structure + signature moments, needs H-49). **PD-A closed 22 Nov.** **P1-B** (P1-05..P1-09) is complete; its `/subphase-complete` runs after PD-C. (P1-A: everything done; staging step done 22 Nov with H-48.)
- **GITHUB_MODE:** `free` (H-25 answered 9 Nov 2026; ENGINEERING §16). Switch to `pro` later by upgrading the plan and changing this line.
- **Target:** none: no deadline (human, 20 Nov 2026; CLAUDE.md "Pace").
- **Last updated:** 2026-11-23, talha.syed (PD-06 CI 45068046655 red fixed + C-77 root-caused on wip/PD-06 `9bcd719`; next PD-06 close part B; autopilot on)
- **Staging and production:** one Hostinger VPS 72.61.17.208, hardened 15 Nov; **staging live 15 Nov** (release `8353e00` since 16 Nov; origin lock via Cloudflare proxy + firewall + AOP until launch, T-5). Production not deployed.

## Now
- **Staging live** (release `74fba5b` since 22 Nov ~06:50 UTC; real Sentry DSN verified 22 Nov; backups on: nightly dump, WAL, weekly base, drill): every release runs the demo sign-in check; weekly demo reset timer; auth-gated curls in deploy.yml. Demo guide `docs/DEMO_GUIDE.md`. Deploys succeed again (H-48 DSN real).
- **P1-B:** P1-05..P1-09 done (P1-09 landed 20 Nov, `2dd6039`); the sub-phase close runs after PD.
- **PD (Molten design):** PD-A closed 22 Nov; PD-04 on main 22 Nov; **PD-05 closed 22 Nov** (code `9ec3855`; carries the main CI fixes). Next PD-06, PD-B close (incl. C-76).

## Next (top 3)
1. PD-06 on `wip/PD-06`: close (gate:task, reviews, DECISIONS batch, tick); then PD-B close fast (human, 23 Nov).
2. Check the first nightly `perf` job (scheduled.yml, 02:29 UTC) and red CI first, as always.
3. PD-B close (C-76 container stall root cause first). Human any time: H-51 (b) optional dev keys, H-48b, H-38, H-45, H-46.

## CARRIED (a task can't be ticked while a row targets it)
| ID | From | To | Criterion | Proof |
|---|---|---|---|---|
| C-07 | B-SEC-2 | P2-04 (invites) | No staff TOTP enrolment with the password alone (invite token). P0-16 part done: demo staff/admins are pre-enrolled; the staging seed check must then exempt only accounts with an open invite | integration |
| C-16 | B-CR-12 | passkey UI task | Passkey re-sign-in over a stale session | E2E |
| C-25 | B-SEC-9 (P0-19) | P2-04 | Creating a password credential for an existing user (staff invite) revokes that user's existing sessions, like trigger 0006 does on role changes | integration |
| C-28 | P0-18 | P1-10 | SSE streams get a jittered `retry:` before close on shutdown | integration |
| C-35 | P0-13 | P1-18 (human 17 Nov) | Backup jobs write `backup:dump`/`backup:wal`/`backup:restore-drill` heartbeats + `BACKUPS_ENABLED=true` on staging; per-route request rate/p95/error on the System page from host logs **Backup half done 16 Nov (D4: heartbeats on staging, WAL from pg_stat_archiver, flag deployed with D4); left: health snapshot after deploy + request logs (E).** | staging health snapshot + screenshot |
| C-39 | P0-10 review | first P1 task that puts a menu, select or popover inside a Modal/SidePanel/BottomSheet | `Popover` portals to `<body>`, so inside a `showModal()` dialog it renders under the top layer and is inert: portal into the open dialog (or the top layer) and re-check placement | E2E: popover opened inside a modal is visible and clickable |
| C-40 | P0-C flaky (CI 43206412851) | P1-18 (human 17 Nov) | Pixel 7 "[P0-09] motion" quarantined (`test.fixme` on pixel7): closing a panel once recorded two `transform` transitionstarts; find the cause, fix, remove the fixme | 5-project run with the test active, 0 flaky |
| C-41 | H-08 (13 Nov) | P5 launch readiness | Backups leave Backblaze B2 for R2, or Backblaze is added to the processor register / ROPA and reviewed by the solicitor (H-23) before any real customer data is backed up; DPA with UK addendum; COMPLIANCE processor table still says R2; total retention ≤ 35 d (design check) | DECISIONS + processor register |
| C-43 | Repo public (human, 14 Nov) | P5 launch readiness | `weddydev/moz-reward` back to private before launch; Actions minutes planned for a private repo (GitHub Pro or trimmed CI) | `gh repo view --json visibility` = PRIVATE + DECISIONS |
| C-44 | T-5 (human, 14 Nov) | P5-12 | Origin lock back on Cloudflare Tunnel (Zero Trust Free, card on file) for staging + production, Umami dashboard behind Access — or the proxy design accepted in DECISIONS + SECURITY §11 with a zone-level origin-pull certificate | outside check: VPS IP 443/80 refused + DECISIONS |
| C-45 | P0-15 D3 review | P5 launch readiness | ROPA/DPIA list `pnpm backup:verify --env production` (developer laptop decrypts a copy of customer data into a tmpfs container; encrypted disk enforced on macOS/Linux, asserted on Windows; nothing kept); with C-41/H-23 | ROPA + DPIA lines |
| C-46 | P0-15 D4 | P5-12 | Production backups on: `moz-backup wal-on production`, first dump + `backup:verify --env production` (dump + `--wal`) PASS, then `BACKUPS_ENABLED=true` in `infra/deploy/production.env` | SESSION_LOG + production health snapshot |
| C-47 | P0-15 (human 16 Nov) | P5-12 | Production stack set up before go-live (DECISIONS 16 Nov): secrets, Tunnel/origin lock (C-44), `init-env production`, maintenance-only deploy, then backups (C-46) and UptimeRobot production monitors; P0-15 AC7 re-checked with both stacks running | deploy log + `docker stats` + SESSION_LOG |
| C-51 | P1-02 | P5-05 | Landing footer "Terms" / "Privacy" links (`/terms`, `/privacy`, plain `<a>`) resolve to the legal pages | E2E: links 200 |
| C-55 | P1-04 security review LOW 4 | P5-01 | Customers can withdraw (and give) per-shop marketing consent themselves through `recordConsentChange` (source `settings`) before any real customer joins; the join sheet's wording ("change this any time in the shop's settings") names where it really is | E2E: toggle off → consent row false + membership false |
| C-53 | P1-02 gate (gpg 2.5) | P1-18 | backup-pitr "WAL object without integrity protection" fixture is unprotected on every gpg (hand-built SED packet), so the case runs on developer laptops (gpg 2.5 writes AEAD even with `--rfc2440`) as well as CI | integration passes on Mac gpg 2.5 without the skip |
| C-57 | P1-A close CR-M2 | P2-13 | "Has a profile" = "profile complete" (DECISIONS 18 Nov): an erasure or edit that clears the phone or the 13+ declaration but keeps the profile row must make the next join ask again (`isProfileComplete`), or delete the row | integration |
| C-58 | P1-05 | P1-10 | Programme-change notice: a save whose rewards/milestones change writes a `loyalty-change-notice` outbox row in the save transaction; the handler sends each current member one in-app transactional notice with the effective date (keyset-paged, idempotent per version, none for left members, none on rollback) | integration |
| C-60 | P1-05 | P1-12 | Membership stores its current ingot's start; approval uses `ingotTerms(versions, ingotStartedAt)` and `versionActiveAt(versions, requestedAt)`; a programme save mid-progress leaves ledger and unlocked rewards untouched | integration |
| C-61 | P1-05 | P2-05 | Loyalty main reward optional image (PRODUCT §6) via the upload pipeline (`main_reward.imageKey`); changing it is a rewards change (14 days' notice) | E2E + integration |
| C-62 | P1-07 | P1-12 | Approvals write `progress_gold` / `ingots_completed`; the Wallet reads rewards-ready count, recent activity, and the last 10 awards for "N more visits"; Wallet statement count unchanged | integration |
| C-63 | P1-07 | P4-06 | Wallet daily game card (hidden until P4) | E2E |
| C-66 | P1-08 | P1-12 | Gold Vault streak chip shows the member's current streak from the ledger; tier never goes down when an owner raises a threshold (membership stores the highest tier reached) | integration + E2E |
| C-67 | P1-08 | P1-16 | Gold Vault "Rewards ready" lists that shop's unredeemed, unexpired rewards with Redeem | E2E 390 + 1440 |
| C-65 | P1-07 | P1-16 | Wallet right column: rewards list with Redeem | E2E |
| C-68 | P1-09 | P1-11 | Leaving cancels the member's open points requests in `leaveShop`'s transaction; a left member can't request; the shop page's Request points button and pending state | integration + E2E |
| C-69 | P1-09 | P1-12 | Approvals refuse a left membership (progress frozen); the shop page's Recent receipts card lists the last receipts (empty state today) | integration + E2E |
| C-70 | P1-09 | P1-16 | Leaving voids live redeem codes in `leaveShop`'s transaction (staff confirm then fails); unredeemed rewards stay with their own validity and reappear on rejoin | integration |
| C-71 | P1-09 | P3-06 | Leaving voids the member's live offer claim codes for that shop in `leaveShop`'s transaction | integration |
| C-72 | P1-09 | P3-11 | Referral bonuses are never re-earned after leaving and rejoining | integration |
| C-73 | P1-09 | P1-13 | A rejoin after the 30-day window gets no frozen progress back even if the forfeit job hasn't run yet (forfeit at rejoin, or the join refuses to restore) | integration |
| C-74 | P1-09 | P3-05 | Shop page offers carousel (screen 4 slot; hidden until offers exist) | E2E 390 + 1440 |
| C-76 | PD-05 gate (T-6) | PD-B close | Mac Linux-container E2E `page.goto` stall (30–60 s windows every 1.5–2.5 min; FOLLOWUPS [P0-14 infra]) found and fixed, T-6 closed; PD-06 and the PD-B close pass `gate:task` in one run | gate:task summary + SESSION_LOG |
| C-77 | PD-06 (CI 45061015313) | PD-06 close | WebKit slider mouse-drag E2E: root causes found 23 Nov (test artefacts, not a Safari bug: host macOS WebKit draws the lean 12/12 under 3 workers): Linux WebKit runs no frame during the drag + 90 ms settle (spring never starts; lean read 0) and scrolls the page back 39 px at the first mouse event after `scrollIntoViewIfNeeded` (press landed above the input, value stayed 240). Fixed in `9bcd719`: asked-for lean (`--tilt`) checked everywhere, drawn lean where frames ran ≥ 32 ms, press re-measured over the input; `test.fixme` removed; Linux container WebKit 6/6 + 34/0 | CI WebKit run on `9bcd719` with the test active, 0 flaky |
| C-17 | Stryker | P1-18 (human 17 Nov) | 14 surviving mutants (codes 7, return-to 3, policies 4) reviewed | mutation report |
| C-48 | P0-15 E (human 17 Nov) | P1-18 | P0-15 leftovers: health.backup shows no alert on staging with `BACKUPS_ENABLED=true` (health snapshot); UptimeRobot staging monitors (H-45) + alert on both phones when staging is stopped (AC8); ZAP baseline (weekly) + k6 smoke (twice weekly) wired against staging, zero failed requests during a deploy under k6 (AC2) and rollback under load (AC3); B2 overwrite leaves the locked version (D design HIGH 1); two workers run each scheduled job once (AC6) if not already proven | staging snapshots + workflow runs + SESSION_LOG |
| C-49 | P0 close (human 17 Nov) | P1-18 + P1 `/phase-complete` | P0's heavy gate and definition of done: `gate:phase` covers P0 + P1; code/security/design reviews of P0-E commits not yet reviewed (at the P1-A close); P0 DoD bullets checked; client demo covers P0 + P1 together (`docs/DEMO_GUIDE.md` + Demo 2). (P0 close lines in PHASES ticked 17 Nov by the human's decision.) | gate:phase summary + SESSION_LOG + DEMO_NOTES |

## Blockers
- Human: none blocking (H-48 human part done; staging deploys again). Now: H-45 (UptimeRobot staging monitors, after the `e9aa786` deploy), H-42 tail (delete the old `moz-backups` B2 key). Needed later: at the P0 close H-29 (`backup:verify`), H-13 (real devices), H-23 (drafts to the solicitor), H-14 (send demo notes).
- Technical: C-40 (quarantined test) blocks the P0 phase gate. Known risk: wal-g `wal-push` hangs without `ca-certificates` in the Postgres image (wal-g #2550).

## Map of the codebase
In **`progress/MAP.md`** (read when you need to locate code; add new important paths there).

## Last verified (23 Nov 2026)
_Latest evidence only (≤ 5 lines); older lines move to SESSION_LOG._
- PD-06 fix `9bcd719` (CI 45068046655 red: webkit + iphone14 rating choices, iphone14 card flip, + design-review HIGH card back over front in WebKit): Linux container `molten-fields` webkit/iphone14/chromium slider + rating + card 34/0 (slider drag + card tilt 6×: 24/0); host `molten-fields` chromium/webkit/iphone14 69/0; parity member card 12/0 (both engines); WebKit card screens 320/390 front + back inspected (front shows front; back = finished QR face); `pnpm check` 1947/0; pre-push check + sast PASS.
- CI 45068046655 (`4177678`): RED, WebKit E2E only (2 failed: rating choices webkit + iphone14; 1 flaky: iphone14 card flip); check, int, build, Chromium E2E green.
- PD-06 e `6606d25` + fixes `49a55cd`/`4177678`: parity full 156/0 (Chromium + host WebKit; member-card + member-card-tile static/frames/curves 12/0; text-field-tile without ownHeight); Linux Chromium + Pixel 7 `molten-fields` 45/0 (6 new member card specs); unit `molten-card` 20/0, related units 501/0; card tile screens 320/390/1440 front + back inspected; host WebKit `molten-fields` 23/0 (+1 quarantined); pre-push `pnpm check` + sast PASS.
- CI 45061015313 (`ec033ae`): RED, WebKit E2E only (4 failed, 2 flaky: tabs scroll, rating choices, slider drag, screens timeout); check, int, build, Chromium E2E green; fixed in `49a55cd` (tabs reproduced and verified on host WebKit; the rest Linux-WebKit-only, CI 45068046655 decides).
## Follow-ups (LOW)
In **`progress/FOLLOWUPS.md`** (read when the owner task starts and at every sub-phase close).

## Open questions / assumptions
- Launch-tier numbers await the client's written confirmation (H-21). Loyalty defaults pending H-22.
- Not yet tested: passkey sign-in (real device), real email provider (keys set; first send on staging, P0-15).
