---
name: restyle
description: Apply a project's DESIGN.md and tokens to existing UI without redesigning it, keeping its layout and flow and bringing only its values onto the system. Use when asked to restyle, re-theme, re-skin or bring a page onto the design system, or after DESIGN.md or tokens.json changed.
---

# Restyle

A **restyle** changes values, not design. Layout, structure, copy, flow and behaviour stay exactly as they are; each colour, type size, spacing, radius, shadow, curve and duration moves onto the token or recipe DESIGN.md names for that role. When a change needs a new layout to work, stop and propose it to the person as its own task.

## Steps

1. **Read the system**: `design/DESIGN.md` (its tokens, named rules, component recipes) and its tokens: `design/tokens.json` and the themes `design/tokens.resolver.json` names, DTCG 2025.10 (each token's custom property is its last name segment, its CSS in `design/tokens.css`), or the repository's own token file. Done when you can name the token for each role the UI uses: surface, text, action, border, status, every spacing step, every radius.
2. **Map each value.** Go through the styles in scope and pair each literal or off-system value with its token, by role rather than by nearest number: a muted label takes the muted-text token even when another token is closer in hex. A component that matches a recipe takes the recipe whole. Done when every value in scope is paired, or listed as having no token yet.
3. **Change only the values.** Swap each one in place; leave the markup, the order and the classes that carry layout alone. A value with no token gets one: add it to the token file first (`design_write` for `design/`), then use it. Done when the build, the lint and the type-check pass.
4. **Show the change.** The diff is the proof: every changed line swaps a value for its token, and no markup, order or layout class changed. Show before and after on the component canvas (the `component-canvas` skill): a `Before` story on the old values beside the `After` story, `artifact_create({ kind: "component", does: "judge", ask, file })`, each state's delta naming what changed. Done when the diff holds only value swaps and the person has the canvas.
