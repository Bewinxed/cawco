---
name: design-explore
description: Explore a design brief as two to four distinct variants on the project's design system, shown side by side for the person to pick, then turn the pick into a build task. Use when a brief moves to explore, when asked for options, directions or variants of a screen or flow, or when a design needs a pick before it is built.
---

# Design explore

A design task moves brief → explore (the `explorer` type) → review (the person) → picked → build (the `builder` type) → shipped. Exploring makes **variants**: different answers to the brief, each a real direction rather than a colour swap, all on the project's DESIGN.md and tokens.

## Steps

1. **Read the brief** (`task_read({ id })`), DESIGN.md and the tokens (the project folder's `design/`), and the references in `design/references/`. Done when you can state the brief's one job and the constraint the variants must all respect.
2. **Name the directions**: two to four, each a sentence on the trade-off it makes (denser or calmer, guided or open). Done when no two directions answer the brief the same way.
3. **Build each variant** with the `screen` skill: journey, states, parts, on the system's tokens. Save each one's capture and source under `design/explorations/<task>/<variant>/` with a line on where it came from. Done when every variant shows its main states.
4. **Show them for a pick** on one decision page (the `decision-page` skill): one card for the direction, its options the variants, your recommended one first, plus a card for each open detail. Done when the page answers `opened: true` and the task is in review.
5. **Turn the pick into work**: read the picks with `artifact_read`; once the person has moved the task to picked, file the build with `task_create` (`after` this task, `type: "builder"`, `acceptance` listing every state of the picked variant, `checks` such as a contrast check and a screenshot compare). Done when the build task is filed and linked.
