# Molten reference (the spec)

Approved by the human on 20 Nov 2026. This demo is the **exact visual and motion specification** for everything it shows (CLAUDE.md §2: it wins over DESIGN.md). Phase PD (`docs/phases/PD.md`) brings the app to it, and the parity harness (`tests/parity/`, PD-01) proves the match.

- `index.html`: the interactive demo. Open it in a browser (it loads Google Fonts; everything else is local). Sections: Gilded Gate 2.0 intro (with slow-mo), the design language, the controls lab, the phone (wallet stack, gold wipe, shop page, dock) and the Gold Vault, and the original plan.
- `img/`: the 12 demo shop photos (Unsplash licence; DECISIONS 20 Nov).
- `screenshots/`: Chromium captures at 1440 and 390 (intro beats, controls mid-interaction, gold wipe, vault unlocked, gilded edge at rest and mid-glint).

**Frozen.** sha256 of `index.html`: `81a2994fe23bacb77d08c9c05ec41677724c9ebedace59347dd7f69bc395ef76`. Don't edit these files. A deliberate change to the spec needs a DECISIONS entry, a new fingerprint here, and updated parity baselines. The parity harness works on its own copy under `tests/parity/reference/` (where it adds `data-parity` hooks), never on this folder.

Values from this demo are quoted in DESIGN.md v2: tokens (§3), surfaces and gilded edge (§6.1–6.2), motion tiers and the motion spec table (§7.1, §7.4), Gilded Gate 2.0 (§8.1), vault and reward (§8.3–8.6).
