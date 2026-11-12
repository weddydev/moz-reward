# Design system — Moz Rewards

Sections: [1 Principles](#1-principles) · [2 Reference images](#2-reference-images) · [3 Tokens](#3-tokens) · [4 Typography](#4-typography) · [5 Layout and navigation](#5-layout-and-navigation) · [6 Components](#6-components) · [7 Motion system](#7-motion-system) · [8 Signature moments](#8-signature-moments) · [9 Sound](#9-sound) · [10 Haptics](#10-haptics) · [11 iOS and cross-device](#11-ios-safari-and-cross-device) · [12 Performance budgets](#12-performance-budgets) · [13 Accessibility](#13-accessibility) · [14 Copy tone](#14-copy-and-tone) · [15 Screen list](#15-screen-list)

---

## 1. Principles

1. **Premium calm.** Warm ivory space, confident serif headings, gold used sparingly so it always means something (progress, reward, primary action).
2. **Not a template.** Avoid generic card grids with blue buttons. Use editorial type scale, generous whitespace, subtle foil textures, asymmetric hero layouts on desktop.
3. **Motion with meaning.** Every animation explains a change (gold arrives, a page opens from the card you tapped). Short, smooth, interruptible. Two or three "wow" moments, everything else quiet.
4. **Mobile and desktop are different experiences**, not one layout stretched.
5. **Performance is part of the design.** If an effect costs smoothness on a mid-range Android, simplify it.

## 2. Reference images

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

Rules: gold (any shade) covers ≤ 10% of a screen's area. Text on gold uses `--ink`. Never put gold text on gold. Check contrast (WCAG AA 4.5:1 body, 3:1 large text/UI).

### Space, radius, elevation

- Spacing scale (px): 4, 8, 12, 16, 20, 24, 32, 40, 56, 72, 96.
- Radius: `--r-sm 8`, `--r-md 14` (cards, inputs), `--r-lg 22` (sheets, hero cards), `--r-pill 999`.
- Shadows (warm): `--shadow-1: 0 1px 2px rgba(60,45,20,.06), 0 2px 8px rgba(60,45,20,.05)`; `--shadow-2: 0 8px 24px rgba(60,45,20,.10)`; `--shadow-gold: 0 6px 20px rgba(201,162,74,.28)` (primary button and reward cards only).
- Foil texture: an optional, very subtle noise/brushed SVG overlay (≤ 2 KB, opacity ≤ 0.06) on hero cards and the member card.

## 4. Typography

- **Display / headings:** Fraunces (variable, optical size axis), weights 500–650. Self-host via `next/font`, subset Latin.
- **UI / body:** Manrope, weights 400, 500, 600, 700. Self-host via `next/font`.
- Numbers: tabular figures (`font-variant-numeric: tabular-nums`) for points, prices, counters.
- Scale (mobile / desktop): Display 34/48, H1 28/36, H2 22/28, H3 18/20, Body 16/16, Small 14/14, Caption 12/12. Line-height 1.2 headings, 1.5 body.
- Minimum input font-size 16px (prevents iOS zoom).

## 5. Layout and navigation

### Customer — mobile (< 768px)
- Bottom navigation (fixed, safe-area aware): Wallet, Offers, **Scan** (raised 56px circular gold button, centre), Market, Me.
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

## 7. Motion system

Library: **Motion** (`motion` package) for component animation; CSS for simple transitions; SVG/Canvas for signature moments. Heavy animation code is dynamically imported only on the routes that use it.

The installed Emil Kowalski skills (`emil-design-eng`, `animation-performance`, `mobile-native`, `review-animations`) supply the craft standards for all motion. This section and §8 set the product-specific choices; where they differ from a skill default, this document wins. In particular, the signature moments in §8 are deliberately longer than the skills' "under 300ms" guidance for everyday UI; everything else (presses, tabs, sheets, toasts, menus) stays under 300ms. Hover effects go inside `@media (hover: hover) and (pointer: fine)`; never animate from `scale(0)` (start from ~0.95 with opacity); no `ease-in` for entrances; popovers scale from their trigger, modals stay centred; staggers 30–80ms and never block interaction.

### Tokens
| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 120ms | Press, hover, toggles |
| `--dur-base` | 220ms | Sheets, tabs, small transitions |
| `--dur-slow` | 380ms | Page transitions, card → page |
| `--dur-hero` | 900–1600ms | Signature moments only |
| Ease out | `cubic-bezier(.22,1,.36,1)` | Entrances |
| Ease in-out | `cubic-bezier(.65,0,.35,1)` | Moves |
| Spring | stiffness 380, damping 32 | Press release, sheets |

### Rules
- Animate only `transform` and `opacity` (and SVG attributes inside signature moments). No layout-affecting animation.
- Every animation is interruptible; navigation never waits for an animation to finish.
- `prefers-reduced-motion: reduce` → replace movement with ≤ 150ms fades; signature moments show the end state with a short fade; no parallax/tilt.
- Pause rAF/canvas loops when `document.hidden`.
- Respect a user-level "Reduce animations" toggle in Me (defaults to system setting).
- `will-change` only during an animation, removed after.

### Page transitions
- Use the **View Transitions API** where supported (feature-detect) for the shared-element morph; page slides animate the live content (fade + 8px, `--dur-slow`, in every browser), because a view-transition snapshot can't be tapped while it animates (DECISIONS 11 Nov 2026 "Pages slide as live content"). No old-page cross-fade: the old page leaves at once.
- **Card → page**: tapping a shop card morphs the card image and title into the shop page header (shared element via `view-transition-name`).
- **Tab switches (bottom nav)**: cross-fade with 6px directional slide based on tab order.
- **Back**: reverse direction.
- Desktop: panel content cross-fades in place; rail stays fixed.

### Micro-interactions
- Press: scale .97 + slight shadow reduction, spring back.
- Primary button hover (desktop): gold gradient position shifts 20% over 600ms (a soft sheen).
- Toggle and checkbox: 120ms with a gold fill sweep.
- Pull-to-refresh on Wallet (mobile): a tiny ingot outline fills as you pull.
- Toasts slide up 12px + fade, auto-dismiss 4s.

## 8. Signature moments

Build each as an isolated, lazy-loaded component in `src/components/motion/`, with a `skip()` on tap, reduced-motion variant, and a dev preview at `/dev/motion`.

### 8.1 Gilded Gate — first scan entry (≈ 1.4s)
Trigger: landing on `/s/[code]` with `src=qr|nfc` (once per shop per browser session).
1. 0–200ms: screen is ivory; a thin gold line draws a rounded-rectangle "gate" outline from the centre outwards (SVG stroke-dashoffset).
2. 200–700ms: the shop logo fades and scales from .92 to 1 inside the gate; a soft radial gold glow breathes once behind it.
3. 700–1000ms: a diagonal shimmer sweeps across the gate (gradient mask), "Welcome to {Shop name}" fades in below in Fraunces.
4. 1000–1400ms: the gate expands to full screen and becomes the landing page's cover header (shared-element morph); content below rises 12px + fades in with 40ms stagger.
- Tap anywhere skips to the end state. Plays a soft "arrival" sound only if sounds are enabled and audio is unlocked (it usually isn't on first load — never force).
- Must not delay content fetch: start data fetch immediately; animation is purely visual.

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

### 8.4 Reward unlocked (≈ 1.8s)
- Full ingot lifts slightly, a gold ring pulse expands once, the ingot slides into a "Vault shelf" slot, reward card flips in (rotateY with perspective, 400ms) showing reward text and "Redeem" button. Sound: reward chime.

### 8.5 Receipt generated (≈ 0.8s)
- A receipt card "prints" upward (translateY from 24px with a clip reveal from top to bottom), a small gold stamp "+80 gold" presses in (scale 1.15 → 1, 160ms). Used after approval in the customer app and after approval in the dashboard (dashboard version: 400ms, no stamp bounce).

### 8.6 Redeem code
- Code digits flip in one by one (60ms stagger); a 15-minute countdown ring in gold depletes smoothly (CSS conic-gradient).

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
| Initial JS per customer route (gzip) | ≤ 170 KB |
| Shop landing `/s/[code]` initial JS (gzip) | ≤ 130 KB |
| Signature-moment chunks (each, gzip) | ≤ 35 KB, loaded on demand |
| Game chunk (gzip) | ≤ 40 KB |
| Images | AVIF/WebP via `next/image`, explicit sizes, cover ≤ 120 KB |
| Fonts | 2 families, subset, `font-display: swap`, preload only the heading weight used above the fold |
| Animation frame time | 60 fps on mid-range Android; no long tasks > 50ms during animations |

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
