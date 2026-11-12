---
version: 1
slug: "src-lib-cawco-glasscard-svelte"
primary_target: "src/lib/cawco/GlassCard.svelte"
related_targets: ["src/lib/cawco/bar-glass.svelte.ts","src/lib/components/ui/bar-glass/bar-glass.svelte","src/lib/cawco/NeedsCaw.svelte"]
---

# The top bar's glass, Caw's head and its cards

The owner's picks for the top bar's trailing glass group (`GlassCard.svelte`, `bar-glass.svelte.ts`, the kit's `BarGlass`) and the cards that hang from it. DESIGN.md's Alignment section (a page's name is its bar's title; a bar's trailing group) and the `HangCard` component are the system.

- Jump is a bare search glyph inside the glass group, named "Jump to session" with ⌘K in its tip, never an expanded field with the word "Jump".
- Caw carries no digit. What needs the person is arcs on his circle's rim in `status-attn-glyph`: one 30° arc per item with 8° gaps from 12 o'clock clockwise, up to nine; past that the ring closes, in `status-fail-glyph`. The number lives in his label and tooltip.
- Caw's panel hangs from his glass as one shape with it, rounding out of the glass's foot into the panel's edge, on the session card's mechanism.
- The machines and Jump cards hang from the glass the same way, in one reusable card (`HangCard`, the glass's `GlassCard`): opening another while one hangs changes the card in place.

## The phone's glass

Under the desk line the glass holds Caw alone. Its shape is the owner's pick of 2026-11-04 (decisions/caw-phone-shape, "Caw's button on a phone, inset from the edge": "Round on the left, flat on the right, always"), built in b2d5f5209.

- It stands `--c-bar-phone-edge` in from the screen's trailing edge (plus the notch's inset), as the sidebar toggle's glyph stands from the leading one, its centre on the tabs' centre line.
- It is round on its leading side and square on its trailing side, at rest and while his panel hangs: the panel's trailing edge runs straight down from it.
- It draws its hairline and tile ring all round, the square side included: it stands clear of the edge.
- His 44px touch area runs from the glass across the margin to the screen's edge.
- The card that hangs from it stands the same margin in on both sides.
