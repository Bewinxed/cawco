---
name: cawco-design
description: Caw&Co's design system: its two-layer tokens (primitive scales and semantic roles), type, spacing, motion and component recipes. Use when building or changing any Caw&Co screen, component, page, marketing image or brand asset.
---

# Caw&Co design system

Build in Caw&Co's look:

1. Read `design/DESIGN.md` whole before you write any style.
2. Take every colour, size, space, radius, shadow, duration and curve from `apps/dashboard/src/lib/tokens/theme.css` through the Tailwind utilities it makes: prefer Layer 2 semantic roles, and reach into Layer 1 only for the 4px spacing ladder, categorical marks (`mark-1..8`), or brand art pigments.
3. Add a token to `theme.css` only for a genuinely shared scale step or semantic role under Tailwind's namespace for its kind — never for a feature name or component-private size (express one-off component geometry on `--spacing` inside the component or `apps/dashboard/src/design.css`).
4. Compose from the kit in `apps/dashboard/src/lib/components/ui` (and inspect scales, roles, and states on the board in `apps/dashboard/src/lib/design-board/`); a screen's own decisions are in its surface brief under `apps/dashboard/.impeccable/surfaces/`.
