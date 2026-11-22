---
name: <project>-design
description: <Project>'s design system — its colour roles, type, spacing and component recipes. Use when building or changing any of <project>'s screens, components, pages, marketing images or brand assets.
---

# <Project> design system

Build in <project>'s look:

1. Read `design/DESIGN.md` whole before you write any style.
2. Take every colour, size, space, radius, shadow, duration and curve from a token in the Tailwind theme, `<theme path>`, through the utilities it makes, and build components to `DESIGN.md`'s recipes.
3. A value the theme lacks is a token you add there first, named for its role under Tailwind's namespace for its kind, in the commit of the work that uses it.
4. See the foundations drawn in `<Foundations states file>`; the components are in `<component folder>`.
