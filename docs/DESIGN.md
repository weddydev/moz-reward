# Design system — Moz Rewards

**v2 · Molten (approved by the human 20 Nov 2026).** The approved demo in `design/reference/molten/` is the exact visual and motion specification for everything it shows and wins over this file where they differ (CLAUDE.md §2). This file quotes its values; §7.4 is the motion spec the parity tests assert. Phase PD (`docs/phases/PD.md`) brings the app to it. Until PD-11 removes them, the v1 tokens below stay as aliases.

Sections: [1 Principles](#1-principles) · [2 Reference images](#2-reference-images) · [3 Tokens](#3-tokens) · [4 Typography](#4-typography) · [5 Layout and navigation](#5-layout-and-navigation) · [6 Components](#6-components) · [7 Motion system](#7-motion-system) · [8 Signature moments](#8-signature-moments) · [9 Sound](#9-sound) · [10 Haptics](#10-haptics) · [11 iOS and cross-device](#11-ios-safari-and-cross-device) · [12 Performance budgets](#12-performance-budgets) · [13 Accessibility](#13-accessibility) · [14 Copy tone](#14-copy-and-tone) · [15 Screen list](#15-screen-list)

---

## 1. Principles

1. **Premium spectacle.** Pearl white and living gold. Gold is a material, not an accent: it flows, pours, rolls, stamps and catches the light. The client wants every module to make people say "wow" (human, 20 Nov 2026).
2. **Not a template.** Placed surfaces with a gilded edge, a wallet that behaves like a real wallet, a floating dock, editorial Fraunces type that moves on its axes. No generic card grids, no flat buttons.
3. **Every touch answers back.** Each control has its own physical reaction (press, ripple, pour, roll, seal, ignite), and the signature moments are big. Motion still explains a change, never blocks interaction or navigation, is interruptible, and has a reduced-motion version.
4. **Mobile and desktop are different experiences**, not one layout stretched.
5. **Performance is part of the design.** If an effect costs smoothness on a mid-range Android, simplify it.

## 2. Reference images

- **`design/reference/molten/` is the specification** (v2): an interactive HTML demo plus photos and screenshots, frozen with a fingerprint in its README. Match it exactly; the parity harness (PD-01) proves it. Anything it doesn't show is designed in the same language and labelled "extended from the reference".
- The AI-generated images below are now a guide for **layout and content of screens Molten doesn't show** only.
- Location: `design/reference/` (named like `m03-wallet.png`, `d15-shop-dashboard.png` — `m` = mobile, `d` = desktop, number = screen number in §15).
- Use them for overall composition, hierarchy and mood. They are AI-generated and imperfect.
- **This document overrides the images** on colours, type, spacing, radii, component behaviour, content, copy and motion. If an image shows something not in PRODUCT.md (extra features, wrong labels), ignore that part.
- When an image is missing for a screen, design from this document and the closest existing screen.

## 3. Tokens

Implement as CSS variables in `src/styles/tokens.css` and expose via Tailwind theme. Never hard-code colours in components.

### Colour

| Token | Value | Use |
|---|---|---|
| `--bg` | `#FBF8F1` | App background (warm ivory) |
| `--surface` | `#FFFFFF` | Cards, sheets |
| `--surface-2` | `#F4EEE2` | Subtle panels, inputs, skeletons |
| `--ink` | `#1C1A17` | Primary text |
| `--ink-2` | `#5C564C` | Secondary text |
| `--ink-3` | `#8E877B` | Tertiary text, placeholders (not for body copy) |
| `--line` | `#E8DFCE` | Borders, dividers |
| `--gold-700` | `#8A6A1F` | Gold text on ivory (AA for large text), icons |
| `--gold-500` | `#C9A24A` | Gold accents, progress |
| `--gold-300` | `#E9D08A` | Highlights, shimmer |
| `--gold-100` | `#F7EDD0` | Gold tint backgrounds |
| `--gold-gradient` | `linear-gradient(135deg,#8C6A1F 0%,#C9A24A 35%,#F3DE8A 55%,#C49A3A 75%,#8C6A1F 100%)` | Primary buttons, ingot fill, member card edge |
| `--success` | `#2F7D5B` | Success states |
| `--warning` | `#B7791F` | Warnings |
| `--danger` | `#B3432F` | Errors, destructive |
| `--focus` | `#1C1A17` with 2px `--gold-500` outer ring | Focus ring |

Rules (v2): no area cap on gold (it is a material; the v1 "≤ 10%" rule is retired, human 20 Nov 2026). Text on gold uses ink. Gold text uses `--gold-deep` (or the metal-text gradient on display sizes) on light surfaces. Never gold text on gold. Ember is for alerts and urgency only. Check contrast (WCAG AA 4.5:1 body, 3:1 large text/UI).

#### Molten colour tokens (v2; values from the reference `:root`)

| Token | Value | Use |
|---|---|---|
| `--pearl` | `#FFFCF5` | App background |
| `--ivory` | `#F8F1E1` | Tracks, inputs, mould |
| `--champagne` | `#EFDDB0` | Warm panels, stage edges |
| `--ink` / `--ink-2` / `--ink-3` | `#1A140A` / `#5B4F3C` / `#8C806B` | Text (ink-3 not for body copy) |
| `--line` | `#E9DCBE` | Dividers |
| `--gold-deep` | `#7C5510` | Gold text on light, icons |
| `--gold` | `#D2A033` | Accents, outlines |
| `--gold-bright` | `#FFCE4A` | Highlights, rings, glow |
| `--gold-light` | `#FBE7A6` | Tints, gold text on obsidian |
| `--ember` | `#FF7B1C` | Alerts, badges, urgency only |
| `--obsidian` / `--obsidian-2` | `#15100A` / `#2A2014` | Dark panels (total, tabs track, toasts, reward card) |
| `--iri-rose` / `--iri-mint` / `--iri-lilac` | `#FBE1E4` / `#DDF1EA` / `#E9E3FB` | Pearl sheen: background glows and foil only |
| `--metal` | 7-stop gradient (reference) | Primary buttons, fills, coin, ingot |
| `--metal-text` | 6-stop gradient (reference) | Display text shine |


### Space, radius, elevation

- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96.
- Radius: `--r-sm 8`, `--r-md 14` (cards, inputs), `--r-lg 22` (sheets, hero cards), `--r-pill 999`.
- Shadows (warm): `--shadow-1: 0 1px 2px rgba(60,45,20,.06), 0 2px 8px rgba(60,45,20,.05)`; `--shadow-2: 0 8px 24px rgba(60,45,20,.10)`; `--shadow-gold: 0 6px 20px rgba(201,162,74,.28)` (primary button and reward cards only).
- Foil texture: an optional, very subtle noise/brushed SVG overlay (≤ 2 KB, opacity ≤ 0.06) on hero cards and the member card.
- **v2 surfaces (reference):** `--surface` (pearl-to-ivory gradient), `--edge` (gold hairline gradient border), `--inner` (white inner bevel), `--lift` and `--lift-hover` (four-layer warm shadows); radii `--r-md 16`, `--r-lg 26`. A grain overlay at 5% sits over the whole page (§6.1).

## 4. Typography

- **Display / headings:** Fraunces (variable) with the `opsz`, `wght`, `SOFT` and `WONK` axes plus italic (v2: the reference animates weight and softness and uses italic for brand marks and emphasis). Self-host via `next/font`, subset Latin.
- **Italic:** its own font module, loaded and preloaded only on routes that show italic, `font-display: optional` (no late swap, CLS 0; DECISIONS 20 Nov). Upright Fraunces keeps `swap` (preloaded); Manrope is preloaded with `display: optional` (human, 21 Nov 2026). Metric-matched fallbacks also cover Linux and Android, which have no Arial / Times New Roman (`src/styles/font-fallbacks.css`).
- **UI / body:** Manrope variable 400–800 (v2: buttons use 750, badges 800). Self-host via `next/font`.
- Numbers: tabular figures (`font-variant-numeric: tabular-nums`) for points, prices, counters.
- Scale (mobile / desktop): Display 34/48, H1 28/36, H2 22/28, H3 18/20, Body 16/16, Small 14/14, Caption 12/12. Line-height 1.2 headings, 1.5 body.
- Minimum input font-size 16px (prevents iOS zoom).

## 5. Layout and navigation

### Customer — mobile (< 768px)
- Bottom navigation (v2): a **floating glass dock** (12 px from the edges, radius 26, safe-area aware): Wallet, Offers, **Scan** (raised 62 px metal coin button with an orbiting light and a radar pulse), Market, Me. The active item sits on a liquid gold indicator that pours between items (§7.4).
- Header: page title in Fraunces, right-side icons (notifications, install chip).
- Content max width 560px, side padding 16–20px.

### Customer — desktop (≥ 1024px)
- Slim left rail (72px, icons + labels on hover/expand to 220px): logo, Wallet, Offers, Market, Notifications, Me; Install at bottom.
- Multi-column, editorial layouts (see screen list §15). Max content width 1280px.
- Tablet (768–1023): rail collapsed + two-column where it fits.

### Shop dashboard and super admin
- Desktop: left sidebar 248px with section icons, top bar with search and primary action; content in 12-column grid.
- Mobile: bottom nav (Home, Requests, Scan, Customers, More) for shop; (Overview, Applications, Shops, Moderation, More) for admin.

## 6. Components

Build in `src/components/ui/` with Storybook-free docs: a `/dev/ui` route (dev only) showing every component state.

- **Button**: Primary (gold gradient, ink text, `--shadow-gold`), Secondary (surface + line border), Ghost, Destructive. Sizes 40/48/56. Press: scale .97, 120ms. Loading: inline spinner, keeps width.
- **Card** (surface, radius md, shadow-1), **Hero card** (radius lg, foil overlay).
- **Shop card**: photo 64px rounded, name, 1-line address (ellipsis), progress bar 4px with gold gradient, label, badges.
- **Progress bar**, **Ingot** (SVG component, see §8.3), **Milestone track** (horizontal mobile, vertical desktop).
- **Bottom sheet** (mobile), **Modal** (desktop), **Side panel** (dashboard).
- **Inputs**: label above, 48px height, surface-2 fill, focus ring; errors below in danger.
- **Chips** (selectable), **Segmented control**, **Tabs**, **Badge** (Open now, Happy hour, Featured, Private/Business seller).
- **Table** (dashboard): sticky header, row hover, density toggle.
- **KPI card** with sparkline (tiny SVG, no chart lib for sparklines).
- **Charts** (dashboard analytics only): lightweight library loaded on those routes only.
- **Toast**, **Empty state** (illustration line-art in gold-700, one-line message, CTA), **Skeletons** (shimmer ≤ 1.2s loop, reduced-motion: static).
- **Member card**: gold-edged card, member ID, QR, subtle foil, tilt-on-device-orientation (disabled on reduced motion and on iOS unless permission granted — default off on iOS).
- Icons: one outline icon set (e.g. Lucide), 1.5px stroke, imported per icon.

### 6.1 Surfaces (v2)
- **Placed card:** `--surface` fill, `--edge` 1 px gold hairline border, `--inner` bevel, `--lift` shadow; hover (fine pointer) lifts 4 px with `--lift-hover`. Dark variant: obsidian with a gold outline.
- **Living background:** three slow drifting glows (gold light, pearl rose, pearl mint; 26/32/38 s alternate) plus the grain overlay; fixed, `aria-hidden`, static under reduced motion.

### 6.2 Gilded edge (v2)
Hero-level cards (tiles, principle cards, plan cards, vault, dark panels) carry the **gilded edge**: a faceted gold gem (8.5 px half-diagonal, five facets + rim) set on the top-left corner arc, a 2 px gold line running out from it along the top and down the side and fading out, and a quieter 1.6 px echo on the bottom-right corner. Every 8 s (random phase per card) the gem glints and light glides outward along the line; hovering a card plays it at once. Cards don't clip, so the gem sits on the corner; effects that need clipping use an inner layer. Hover replays from the start of the cycle (the reference's replay leaves the edge dark for up to 8 s; DECISIONS 20 Nov). Left-to-right only: the gem sits top-left, RTL is not supported (the app is UK English only).

### 6.3 Controls (v2)
Each control's reaction is in §7.4: molten / orbit / ghost buttons, heart toggle, coin switch, liquid choice (radio and segmented), seal checkbox, spring tabs with a light trail, beam text field, star rating (same two choices for every rating), molten slider, holographic member card (tilt, glare, flip to QR), obsidian toast.

### 6.4 Wallet and shop (v2)
- **Wallet card stack (mobile):** shop cards stack like cards in a wallet (each overlaps the previous one, leaving its header strip visible) and fan out on hover; long lists stack in groups of three with "Show all". Desktop keeps a grid of the same cards.
- **Shop card:** the shop's cover photo under a dark gradient, round logo in a gold ring, gold count, progress bar with a moving glint. No bare initials anywhere: a shop without photos gets a metal monogram coin.
- **Shop page header:** full cover photo, logo in a gold ring in the corner, offers as photo cards.

## 7. Motion system

Library: **Motion** (`motion` package) for component animation; CSS for simple transitions; SVG/Canvas for signature moments; **one shared particle canvas** (`src/lib/motion/fx.ts`: sparks, coins, gold leaf) for the whole app. Heavy animation code is dynamically imported only on the routes that use it. No other animation library.

The installed Emil Kowalski skills (`emil-design-eng`, `animation-performance`, `mobile-native`, `review-animations`) supply the craft standards for all motion. This section and §8 set the product-specific choices; where they differ from a skill default, this document wins. In particular, the signature moments in §8 are deliberately longer than the skills' "under 300ms" guidance for everyday UI; everything else (presses, tabs, sheets, toasts, menus) stays under 300ms. Hover effects go inside `@media (hover: hover) and (pointer: fine)`; never animate from `scale(0)` (start from ~0.95 with opacity); no `ease-in` for entrances; popovers scale from their trigger, modals stay centred; staggers 30–80ms and never block interaction.

### 7.1 Motion tiers and tokens (v2)
| Tier | Duration | Use |
|---|---|---|
| Quiet | < 300 ms | hover, colour, small fades, focus |
| Expressive | 300–760 ms | press, switch, radio, checkbox, tabs, card flip, toast, page wipe |
| Signature | 0.9–2.6 s | Gilded Gate, pour, points credited, reward unlocked |

| Easing | Value |
|---|---|
| Ease out (entrances) | `cubic-bezier(.22,1,.36,1)` |
| Ease in-out (moves) | `cubic-bezier(.65,0,.35,1)` |
| Spring | the reference's exact `linear(…)` curve; fallback `cubic-bezier(.34,1.56,.64,1)` where `linear()` is unsupported |
| Liquid | `cubic-bezier(.45,0,.2,1)` (liquid choice, droplets) |

The v1 tokens (`--dur-fast` 120, `--dur-base` 220, `--dur-slow` 380, `--dur-hero`) stay as aliases until PD-11.

### 7.2 Rules
- Animate `transform` and `opacity` by default. No layout-affecting animation. **Named paint exceptions (v2), each confined to a small element:** the goo filter (liquid choice, dock indicator), the `@property` orbiting border (secondary button), text shine (`background-position` on headings and totals), the Fraunces weight forge (Gilded Gate title only), SVG stroke-dash light (gilded edge, vault stream), `clip-path` reveals (seal checkbox, page wipe).
- **Device tiers:** `lite` when `hardwareConcurrency ≤ 4`, `deviceMemory ≤ 4` or Save-Data: half the particles, no goo filter, no glass blur, no light glides. Everyone else gets `full`.
- Particle caps: 420 (full) / 160 (lite); canvas DPR ≤ 2; the particle loop runs only while particles are alive.
- Exactly one flash per moment (WCAG 2.3.1: never more than three flashes a second).
- Every animation is interruptible; navigation never waits for an animation to finish.
- `prefers-reduced-motion: reduce` → replace movement with ≤ 150ms fades; signature moments show the end state with a short fade; no parallax/tilt.
- Pause rAF/canvas loops when `document.hidden`.
- Respect a user-level "Reduce animations" toggle in Me (defaults to system setting).
- `will-change` only during an animation, removed after.

### 7.3 Page transitions
- Use the **View Transitions API** where supported (feature-detect) for the shared-element morph; page slides animate the live content (fade + 8px, `--dur-slow`, in every browser), because a view-transition snapshot can't be tapped while it animates (DECISIONS 11 Nov 2026 "Pages slide as live content"). No old-page cross-fade: the old page leaves at once.
- **Card → page**: tapping a shop card morphs the card image and title into the shop page header (shared element via `view-transition-name`), and (v2) a **gold circle wipe** spreads from the tap point (620 ms ease-in-out; the shop view follows 110 ms later; the wallet scales to .92 at 40% opacity; content rises with a 60 ms stagger; sparks at the tap). Back reverses the wipe from the back button (520 ms).
- **Tab switches (bottom nav)**: cross-fade with 6px directional slide based on tab order.
- **Back**: reverse direction.
- Desktop: panel content cross-fades in place; rail stays fixed.

### 7.4 Motion spec (from the reference; asserted by `src/lib/motion/molten-spec.test.ts`)

| Element | Trigger | Duration / easing | What happens |
|---|---|---|---|
| Molten button | press | transform `.45s` spring; ripple `720ms` ease-out; label roll `.5s` spring, back after `1700ms` | magnetic lean ±8 px x / ±6 px y (fine pointer), pointer highlight, fill flowing `4.5s` linear loop, press scale `.93`, ripple, 28 sparks + 6 coins, toast |
| Orbit button | idle / hover | `3.4s` linear loop; `1.1s` on hover | conic light orbiting the border (`@property --a`) |
| Ghost button | hover | `.5s` spring | gold underline 18% → 100%, arrow +5 px |
| Heart toggle | toggle | pop `620ms`; ring `600ms`; 10 dots `650ms` | fills with the metal gradient; dots alternate gold and ember |
| Coin switch | toggle | coin `.7s` spring (translate 30 px + 360°); face flip `.5s` ease-out after `.18s`; fill `.6s` ease-out; spark + pulse at `420ms` | knob is a coin (M → tick); liquid fill with a bulging edge |
| Liquid choice | select | blob `660ms` liquid easing (stretch 1.3 × .76 at 42%, overshoot at 76%); 2 droplets `760ms`, delays 90 / 170 ms; sparks at `520ms` | goo filter `stdDeviation 7`, matrix `22 -10`; arrow keys |
| Seal checkbox | check | box `480ms` (.72 → 1.2 → 1); flood `.38s` clip-path; tick `.3s` after `.14s`; ring `.6s`; 10 sparks at `120ms` | |
| Tabs | select | pill `.6s` spring, trail `.95s` spring; panel `380ms` slide 32 px by direction; count-up `650ms` cubic-out | obsidian track, metal pill |
| Stars | rate | each star `480ms` pop, `70ms` stagger, 7 sparks each; label `300ms`; the two equal choices `.5s` spring, second `+.06s` | same two choices for every rating (COMPLIANCE §1) |
| Slider | drag | value bubble tilts with velocity (±28° max), springs back `.5s` after 90 ms idle; sparks at reward notches | fill `scaleX`; glint `2.4s` loop |
| Text field | focus / error / success | beam `.55s` ease-out from the tap point; label `.35s` spring; shake `420ms`; tick `.4s` | |
| Member card | pointer / tap | tilt ±11° x / ±13° y, `.12s` linear while tracking, `.7s` spring back; flip `.7s` spring; idle sway `7s` alternate (touch only) | holo and glare follow the pointer |
| Toast | show | in `520ms` spring; coin `800ms` 720° spin; progress `3600ms` linear; out `260ms` | obsidian |
| Placed card | hover / scroll | lift `.5s` spring, shadow `.4s`; scroll-in rise over `entry 0–30%` (scroll-driven, enhancement only) | |
| Gilded edge | idle / hover | `8s` cycle, random phase; glint 0–10%, glide 0–36%; hover restarts | §6.2 |
| Living background | idle | glows `26s` / `32s` / `38s` alternate | |
| Dock | select / scan | liquid indicator (as liquid choice); icon lift `.45s` spring; Scan halo `2.6s` loop, radar `2.4s` loop, press `500ms` | |
| Wallet stack | hover | fan-out `24px × index` `.6s` spring; shine `5s` loop, `.5s` stagger | |
| Card → shop | tap | §7.3 | |
| Gilded Gate 2.0 | first scan | §8.1 | |
| Vault pour / reward / redeem | events | §8.3, §8.4, §8.6 | |
| FX engine | bursts | sparks gravity 520, coins 1100, leaves 60; drag .975 (leaves .985); life sparks .45–.9 s, coins 1.1–1.7 s, leaves 2.2–3.4 s; cap 420 / 160; DPR ≤ 2 | |

### 7.5 Micro-interactions (v1 lines superseded by §7.4 where they differ)
- Press: scale .93 (v2) with a spring back; molten buttons ripple from the press point.
- Primary button: molten gold flows inside it continuously (4.5 s loop); on fine pointers it leans toward the cursor and a highlight follows the pointer.
- Toggle and checkbox: the coin switch and seal checkbox of §7.4.
- Pull-to-refresh on Wallet (mobile): a tiny ingot outline fills as you pull.
- Toasts slide up 12px + fade, auto-dismiss 4s.

## 8. Signature moments

Build each as an isolated, lazy-loaded component in `src/components/motion/`, with a `skip()` on tap, reduced-motion variant, and a dev preview at `/dev/motion`.

### 8.1 Gilded Gate 2.0 — first scan entry (≈ 2.4 s; v2, reference intro)
Trigger and guarantees unchanged: landing on `/s/[code]` with `src=qr|nfc`, once per shop per browser session; the data fetch never waits; tap anywhere skips to the end state; the soft "arrival" sound only if sounds are on and audio is unlocked; the end state hands off to the landing cover (shared-element morph).
1. 0–520 ms **Spark:** the stage is night (obsidian); a single gold spark breathes at the centre.
2. 300–1250 ms **Converge:** ≈950 gold particles (420 on lite) spiral in (2.2–3.8π, 620–960 ms each, up to 300 ms stagger) and settle into the shop's logo coin (ring + disc).
3. 1250 ms **Ignite:** one flash (650 ms, peak .95 at 18%), shockwave to 4.4× (850 ms), the night fades to pearl (560 ms), a glow breathes (1300 ms), the coin (the shop's logo photo in a metal rim) lands with an overshoot (760 ms), light rays fade in (1000 ms, then rotate 70 s), 22 coins + 46 sparks burst.
4. 1420 ms **Orbit:** two tilted 3D orbit rings with coins fade in (900 ms spring; 8 s / 13 s loops).
5. 1480 ms **Forge letters:** "Welcome to" settles its letter-spacing; each letter of the shop name rises from rotateX −85° while its weight goes 150 → 640 (760 ms, 40 ms stagger); the subtitle follows.
6. 2350 ms **Shine:** light sweeps across the letters (1200 ms, 45 ms stagger); settled by 3800 ms.
- Reduced motion: end state with a ≤ 150 ms fade. Lite tier: fewer particles, same beats.

### 8.2 Points credited (≈ 1.6s)
Trigger: a request is approved while the customer has the app open (SSE), or on opening the app with an unseen approval.
1. Sheet/modal rises with a backdrop blur (blur only where cheap; fallback dim).
2. The ingot appears; molten gold pours from the top as a narrow stream (SVG path with animated gradient) and the fill rises from the previous level to the new level with a gentle wave on the surface (SVG path morph, 2 cycles).
3. "+80 gold" counts up (tabular numbers, 700ms) in Fraunces, then a short shimmer passes over the text.
4. 8–12 tiny gold particles drift up and fade (canvas or absolutely positioned spans; capped count).
5. Line: "{Shop} · £8.40 purchase" and progress ("80% full · 1 more visit").
6. Buttons: Share (gold), Done. Sound: credit chime. Haptic: short pulse (Android).
- If the ingot fills: transition into **Reward unlocked** (8.4).

### 8.3 Ingot pour on every shop view (≈ 0.9s)
Trigger: every time the Gold Vault card or Vault page becomes visible (IntersectionObserver).
- Fill animates from 0 to the current level with the liquid surface wave settling; a brief highlight glints along the ingot's top edge at the end.
- Second and later views in the same session: 0.5s and no pour stream (just the rise) to stay fresh, not tiresome.
- Ingot is an SVG: trapezoid mould (bevelled), inner fill clipped by `clipPath`, wave path for the surface, gradient `--gold-gradient`, specular highlight. Total SVG ≤ 6 KB.

- **v2 (reference vault):** the first view pours 0 → current in 900 ms; adding gold tweens the level over 1000 ms (1500 ms to fill) with a pour stream (flowing dash), splash sparks every 140 ms, a "+80" stamp (1400 ms) and a glint along the surface (700 ms) after the pour. The top face fills with gold at 100%.

### 8.4 Reward unlocked (≈ 1.8s)
- Full ingot lifts slightly, a gold ring pulse expands once, the ingot slides into a "Vault shelf" slot, reward card flips in (rotateY with perspective, 400ms) showing reward text and "Redeem" button. Sound: reward chime.

- **v2 (reference vault):** light rays fade in behind the vault (.8 s), a ring pulse to 3.2× (900 ms), the ingot lifts (.7 s spring), 70 gold leaves fall, 14 coins + 30 sparks burst from the ingot, the obsidian reward card flips in from rotateX 80° (700 ms), toast "Reward unlocked".

### 8.5 Receipt generated (≈ 0.8s)
- A receipt card "prints" upward (translateY from 24px with a clip reveal from top to bottom), a small gold stamp "+80 gold" presses in (scale 1.15 → 1, 160ms). Used after approval in the customer app and after approval in the dashboard (dashboard version: 400ms, no stamp bounce).

### 8.6 Redeem code
- Code digits flip in one by one (60ms stagger); a 15-minute countdown ring in gold depletes smoothly (CSS conic-gradient).

- **v2 (reference):** digits flip in from rotateX −90° (380 ms spring, 60 ms stagger); the countdown ring is a gold conic that depletes with the server expiry and shows the remaining `m:ss`.

### 8.7 Dashboard live request arrival
- New request row slides in from the top with a 1.2s soft gold highlight fade; a subtle tick sound if the dashboard tab is focused and sounds are on.

## 9. Sound

- Sounds are **synthesized with the Web Audio API** (no audio files to download): soft sine/triangle tones with short attack (5ms) and exponential decay, low volume (gain ≤ 0.18), stereo-centred. Tune them to feel like refined system sounds — warm, short, never "gamey".
  - `credit`: two notes rising a fifth (e.g. E5 → B5), 180ms total.
  - `reward`: three-note major arpeggio (C6, E6, G6) with a gentle shimmer (detuned partial), 420ms.
  - `tick`: single soft 1.2 kHz blip, 40ms (dashboard new request, button confirmations sparingly).
  - `arrival`: very soft low-high swell, 300ms (Gilded Gate, only if already unlocked). The one exception to the 5ms attack: a swell rises slowly (about 120ms).
- Audio context is created/resumed on the first user gesture (required on iOS Safari). Never attempt to autoplay before that. A touch counts as a gesture only when it ends (`pointerup`, `touchend`, `click`; also `keydown`), never on touch-down, and nothing is ever scheduled on a suspended context.
- Sound toggle in Me (default on) and in dashboard settings. Respect the toggle everywhere.
- Push notifications use the device's system sound (web push cannot set custom sounds).
- Structure: `src/lib/sound.ts` with `play(name)`; ≤ 2 KB.

## 10. Haptics

- Android/Chromium: `navigator.vibrate` — 12ms for press confirmations of primary actions, `[18, 40, 18]` for points credited, `[30, 50, 30, 50, 60]` for reward unlocked. Off when sounds/haptics toggle off.
- iOS Safari has no vibration API: rely on motion and sound. Do not use hacks.

## 11. iOS Safari and cross-device

- Use `100dvh`/`svh` instead of `100vh`; respect `env(safe-area-inset-*)` on fixed headers/bottom nav.
- Inputs ≥ 16px; `-webkit-tap-highlight-color: transparent`; `touch-action: manipulation` on buttons.
- `overscroll-behavior: contain` on sheets and scroll areas; no scroll-jacking.
- No hover-only affordances; every hover effect has a tap equivalent.
- Backdrop blur only on small surfaces (Safari is slow with large blurs); provide a solid fallback.
- Test every signature moment on WebKit (Playwright) and on a real iPhone before marking a phase done.
- PWA on iOS: `apple-touch-icon`, `apple-mobile-web-app-status-bar-style: default`, splash via manifest icons; standalone display; push only after Home Screen install with a clear explanation.
- Clipboard: use `navigator.clipboard.writeText` inside the click handler (Safari requirement).
- Web Share with files: feature-detect `navigator.canShare({files})`; fallback to download.
- Camera scanning: `BarcodeDetector` where available; otherwise load a small decoder on demand. On iOS, the native camera app also opens QR links — the Scan button explains this.
- Supported: last 2 versions of Chrome, Edge, Firefox, Safari (macOS + iOS 16.4+), Samsung Internet; Android 9+.

## 12. Performance budgets

Targets for customer routes on a mid-range Android over 4G (Lighthouse mobile, throttled). These are **targets with judgment**, per CLAUDE.md §3.

| Metric | Target |
|---|---|
| LCP | ≤ 2.5s |
| INP | ≤ 200ms |
| CLS | ≤ 0.05 |
| Initial JS per customer route (gzip) | ≤ 170 KB target; **≤ 180 KB judgment band for Molten motion** (v2) |
| Shop landing `/s/[code]` initial JS (gzip) | ≤ 130 KB target; **≤ 140 KB judgment band** (v2) |
| Signature-moment chunks (each, gzip) | ≤ 40 KB (v2), loaded on demand |
| Game chunk (gzip) | ≤ 40 KB |
| Images | AVIF/WebP via `next/image`, explicit sizes, cover ≤ 120 KB |
| Fonts | 2 families, subset; preload the upright Fraunces (above-the-fold headings, `swap`) and Manrope (body, `optional`; human, 21 Nov 2026); the Fraunces italic only on routes that show it (`optional`) |
| Animation frame time | 60 fps on mid-range Android; no long tasks > 50ms during animations |

v2 (human, 20 Nov 2026): budgets may grow slightly when it clearly buys the approved Molten look; each overage inside the band gets a one-line DECISIONS entry. The frame budget never moves: 60 fps on mid-range Android, no long task > 50 ms during an animation, INP ≤ 200 ms, CLS ≤ 0.05.

Techniques: React Server Components by default, client components only where interactive; route-level code splitting; `next/dynamic` for motion moments, game, charts, scanner; prefetch the shop page on card hover/visible; cache public pages at the CDN.

## 13. Accessibility

- WCAG 2.2 AA. Keyboard reachable everything; visible focus ring; skip-to-content.
- Touch targets ≥ 44×44px.
- Animations never convey information alone: points and rewards also appear as text and are announced via an `aria-live="polite"` region.
- Colour contrast checked for every text/background pair (gold text only `--gold-700` on ivory for large text/icons).
- Forms: labels, error messages linked with `aria-describedby`.
- Game: has a "Skip / practise later" path; not required for anything.

## 14. Copy and tone

Warm, short, confident. Examples: "Collect gold with every visit." · "1 more visit to your reward." · "Your reward is ready." · "Something went wrong — please try again." Avoid exclamation overload, jargon and pressure tactics. Urgency text must be true (real expiry times).

## 15. Screen list

20 key screens, each with mobile (m) and desktop (d) versions. Reference images use these numbers. Build all other screens in the same language.

| # | Screen | Portal | Mobile layout notes | Desktop layout notes |
|---|---|---|---|---|
| 1 | Shop landing (after scan) | Customer | Cover photo, overlapping logo, CTAs stacked, reward preview, today's offer | Split hero: cover left, details + CTAs right; cards row below |
| 2 | Sign in | Customer | Shop context, Google button, email link | Split: ivory panel with ingot illustration left, sign-in card right |
| 3 | Wallet | Customer | Greeting, summary strip, game card, shop cards list, bottom nav | Rail, header with chips, 3-col shop grid, right column rewards/game/activity |
| 4 | Shop page | Customer | Cover, Vault card, Request points, offers carousel, rate, receipts, details | Wide cover; 2 columns: Vault + receipts / offers + rate + details |
| 5 | Gold Vault | Customer | Big ingot, horizontal milestones, streak, tiers, vault shelf, rewards | Ingot left; vertical milestone timeline right; shelf + rewards band |
| 6 | Rate your visit | Customer | Bottom sheet: stars, chips, note, AI help, two equal buttons | Centred modal: stars + chips left, note + AI right, two equal buttons |
| 7 | Offers feed | Customer | Search, All/Near me, chips, Today's Drops carousel, offer cards | Filter column, Drops strip, magazine grid with one featured card |
| 8 | Offer detail | Customer | Banner, title, shop row, validity, Claim, claim code card, terms | Banner left, details + claim right, more offers row |
| 9 | Marketplace | Customer | Search, + Sell, category icons, 2-col grid, safety banner | Category/filter column, 4-col grid |
| 10 | Listing detail | Customer | Gallery, price, details, seller card, Reveal number, safety, report | Gallery left, info right, similar items row |
| 11 | Create listing | Customer | Photo slots, form, seller type, rules, Publish | Form left, live preview right |
| 12 | Me | Customer | Profile, member card, stats, recap, menu, sign out | Profile + member card left, tabbed content right |
| 13 | Notifications | Customer | Filter chips, grouped list with unread dots | List middle, detail panel right |
| 14 | Shop registration | Public | Hero, benefits, form, plan cards, submit | Benefits + phone mock left, form card right |
| 15 | Shop dashboard home | Shop | Scan button, 2×2 KPIs, pending requests, suggestions, happy hour | Sidebar, KPIs, live queue, suggestions + happy hour column, chart + feedback |
| 16 | Customer profile (CRM) | Shop | Header, stats, vault progress, send offer, history, notes | Header, stat cards, vault, history table, send-offer column |
| 17 | Create offer | Shop | Type cards, banner, fields, notify, publish | Form + banner builder, live phone preview |
| 18 | Points requests and member scan | Shop | Scan button, request cards, approve sheet with number pad | Tabs, requests table, approve side panel |
| 19 | Super admin overview | Admin | KPI row, alerts, applications cards | Sidebar, KPIs, applications table, alerts, activity chart, regions |
| 20 | Application review and activation | Admin | Details, activation form, checklist, sticky actions | Details card, notes, activation panel, actions, checklist |

Sample data for all screens and seeds: shop "Brew & Bloom Café, Camden", customer "Aisha Khan", member ID `K7Q-42M`, ingot 720/1,000, reward "Free coffee & cake".
