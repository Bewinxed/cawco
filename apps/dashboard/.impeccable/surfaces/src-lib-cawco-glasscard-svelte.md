---
version: 1
slug: "apps-dashboard-src-lib-cawco-glasscard-svelte"
primary_target: "apps/dashboard/src/lib/cawco/GlassCard.svelte"
related_targets: ["apps/dashboard/src/lib/cawco/bar-glass.svelte.ts"]
---

# The top bar's glass, Caw's head and its cards

The owner's picks for the top bar's trailing glass group (`GlassCard.svelte`, `bar-glass.svelte.ts`) and the cards that hang from it. DESIGN.md's Title Bars rule and `HangCard` recipe are the system.

- Jump is a bare search glyph inside the glass group, named "Jump to session" with ⌘K in its tip, never an expanded field with the word "Jump".
- Caw carries no digit. What needs the person is arcs on his circle's rim in `status-attn-glyph`: one 30° arc per item with 8° gaps from 12 o'clock clockwise, up to nine; past that the ring closes, in `status-fail-glyph`. The number lives in his label and tooltip.
- Caw's panel hangs from his glass as one shape with it, rounding out of the glass's foot into the panel's edge, on the session card's mechanism.
- The machines and Jump cards hang from the glass the same way, in one reusable card (`HangCard`, the glass's `GlassCard`): opening another while one hangs changes the card in place.
