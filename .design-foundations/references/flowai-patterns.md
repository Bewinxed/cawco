# Component grammar distilled from the FlowAI reference comps

The FlowAI comps are a source to DISTILL REUSABLE COMPONENTS from — NOT features to
reimplement. Ignore FlowAI's product surfaces (API-keys manager, team roster, seat billing,
transfer-ownership flow). Take only the component primitives below, re-skinned to CawCo's
locked DESIGN.md tokens (Flexoki v2 accents, Geist, graphite neutral base, Solar duotone).
Where and whether each component gets used in CawCo is decided by JOURNEY.md, never by FlowAI.

## Primitives to add to the design system

- **Modal / dialog** — centered card on a dimmed scrim; header (brand mark + close ✕), title +
  subtitle, labeled form controls (select w/ chevron; input w/ trailing action e.g. show-password
  eye), optional warning callout, separated footer with right-aligned ghost + primary buttons
  (destructive variant reads red). Sizes: default ~460px.
- **Segmented tabs** — horizontal tab group, optional count suffix per tab, active = filled/bordered.
- **Status chip** — solid light-tint pill + darker ink (Flexoki step ~100/200 bg, ~600/700 ink).
- **Secondary/age chip** — amber warning tint + triangle icon (e.g. "112d old").
- **Button variants** — primary (dark filled), secondary (ghost/outline), destructive (red
  outline; red filled only for a final confirm), icon-only, icon+label.
- **List-row anatomy** — leading icon tile (Solar duotone) + title + meta line + trailing chips +
  trailing action cluster; a disabled/retired row state (greyed, actions off).
- **Stat / KPI card** — icon + label + large value; rows of 4–5.
- **Distribution panel** — labeled rows = status dot/icon + count + label + right-aligned %.
- **Meter / progress** — SEGMENTED bar (not a smooth fill), with fraction + % + caption.
- **Avatar** — circular photo; leaderboard rank badge (medal for top 3, number after); optional
  streak/count suffix.
- **Callout banner** — leading icon + message + trailing CTA; semantic tint.
- **Refresh affordance** — small dashed-circle/spinner glyph top-right of a panel (distinct from a
  decorative placeholder; use a real glyph).

## Not to copy
- FlowAI's palette, wordmark, iconography, spacing, or any specific screen layout.
- Its feature set. We are not building API-key rotation, seat billing, or ownership transfer
  because FlowAI has them.
