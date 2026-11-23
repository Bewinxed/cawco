---
name: cawco-design
description: Caw&Co's design system: 24 semantic colour roles, 4 type sizes on 3 4px-grid line-heights, 4px spacing ladder, subgrid alignment primitives, motion, and component recipes. Use when building or changing any Caw&Co screen, component, page, marketing image or brand asset.
---

# Caw&Co design system

Build in Caw&Co's look:

1. Read `design/DESIGN.md` whole before you write any style.
2. Take every colour, type role, space, size, radius, shadow, duration and curve from `apps/dashboard/src/lib/tokens/theme.css` through Tailwind's utilities (Flexoki's 8 base roles, its 8 inks and Caw coral, 6 `type-*` roles on 4 sizes and 3 4px-grid line-heights, 6 `space-*` rhythm steps on the 4px base).
3. Never add feature-named tokens to `theme.css` or smuggle component-local globals onto `:root` in `design.css`: derive one-off component dimensions on `--spacing` (Tailwind's numeric scale `w-*`, `h-*`, `size-*`) inside the component itself, and never write `±1px` / `±2px` spacing arithmetic.
4. Build lists of rows with `ui/row` (`rows-grid` / `row-cells` subgrid) and equal-option tile grids with `OptionTiles` (`grid-rows-subgrid`) so alignment holds by construction; compose from `apps/dashboard/src/lib/components/ui` and inspect on `apps/dashboard/src/lib/design-board/`.
