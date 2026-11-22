---
name: cawco-design
description: Caw&Co's design system: its colour roles, type, spacing, motion and component recipes. Use when building or changing any Caw&Co screen, component, page, marketing image or brand asset.
---

# Caw&Co design system

Build in Caw&Co's look:

1. Read `design/DESIGN.md` whole before you write any style.
2. Take every colour, size, space, radius, shadow, duration and curve from a token in the Tailwind theme, `apps/dashboard/src/lib/tokens/theme.css`, through the utilities it makes, and build components to `DESIGN.md`'s recipes.
3. A value the theme lacks is a token you add there first, named for its role under Tailwind's namespace for its kind, in the commit of the work that uses it.
4. Compose from the kit in `apps/dashboard/src/lib/components/ui`; a screen's own decisions are in its surface brief under `apps/dashboard/.impeccable/surfaces/`.
