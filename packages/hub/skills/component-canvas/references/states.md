# Interaction states

A frame in the hover, focus or pressed column is the same story mounted again with the state forced on everything inside it. The canvas rewrites the project's stylesheets as they load, the way Storybook's pseudo-states addon does: every rule targeting `:hover`, `:focus`, `:focus-visible`, `:focus-within` or `:active` also matches `:is(.cawco-hover-all *)` (and its kin), written where the pseudo-class stood, so nesting (`&:hover`), `@layer`, `@scope` and Tailwind's `hover:` (under `@media (hover: hover)`) all take it at their own specificity.

- **A column exists only where the CSS reaches.** A story gets a hover column when some element in its rest frame matches a rule's selector with the state taken out; focus only on focusable elements; pressed on `:active` rules (pressed also forces hover).
- **Forced means every element at once.** A card's hover column shows its button hovered too. To show one element's hover alone, write a story whose `play` calls `userEvent.hover(el)`, which puts `.cawco-hover` on that element.
- **What it cannot show.** The browser's own default styles for a state (its default focus ring) are not drawn; DESIGN.md's own ring is. A state set by script (a `pointerenter` handler) shows only through a flow move.
- **`notForced`** in a section of the report lists selectors the engine refused to rewrite; their column is missing.
- **Scheme, width, motion** are the canvas's, not the story's: the panel's toggles draw light and dark side by side, the presets' widths, and reduced motion (every `prefers-reduced-motion` rule answers as reduce, `matchMedia` too). A frame's body takes `color-scheme`, `data-theme` and `.dark` for its scheme, so tokens on `light-dark()` follow.

## The delta

`artifact_read({ id, state: { story, interaction } })` answers `frame.delta`: each element whose computed style changed between rest and the forced state, as `selector`, `source` (`file:line:column`) and `changed: { "background-color": [before, after] }`, with `animations`: each transition the state fired (`property`, `duration`, `delay`, `easing`). Read it as the definition of the state: what the person will see change.
