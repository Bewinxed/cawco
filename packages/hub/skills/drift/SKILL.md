---
name: drift
description: Find where a project's UI has drifted from its DESIGN.md and tokens (literal colours, off-scale spacing and radii, one-off shadows, curves and durations), report it, then file a task per drift. Use for a design audit, a token or lint sweep, a weekly drift routine, or before a release.
---

# Drift

A **drift** is a value in the UI that the design system does not hold: a literal where a token belongs, a step off the scale, a component built outside its recipe. DESIGN.md and the token file are the truth; the code is what drifts.

## Steps

1. **Read the system**: the token file (the project folder's `design/tokens.json`, or the repository's own) and DESIGN.md's named rules and recipes. Write down the allowed set for each kind: colours, spacing steps, radii, shadows, font sizes and weights, curves, durations. Done when every kind has its list.
2. **Search the styles** in the UI's source (CSS, component files, inline styles, class lists), skipping the generated token output itself:
   - colours: `#[0-9a-fA-F]{3,8}\b`, `rgba?\(`, `hsla?\(`, `oklch\(`, named colours in style values, colour utilities with arbitrary values (`bg-[#…]`)
   - lengths: `px`, `rem` and `em` values on margin, padding, gap, inset, width and radius that are not on the scale; arbitrary-value utilities (`p-[13px]`)
   - finish and motion: `box-shadow`, `cubic-bezier(`, `ms` and `s` durations, `transition` and `animation` values not taken from tokens
   - components: markup that rebuilds a recipe (a hand-made button, chip or dialog) instead of using it

   Done when every match is listed with `file:line`, the literal and the token or recipe it should be. A literal with no fitting token is listed as "needs a token".
3. **Report**: group the drifts by component or screen, worst first (a wrong colour role before an off-by-one spacing), with counts per kind. In a project, write the report as a file in the project's folder or repository and name its path. Done when the person has the report.
4. **File a task per drift** with `task_create` (one per component or screen when its drifts share one fix), each with `acceptance` listing the `file:line` values to bring onto the system, `checks` that would catch them coming back (the search from step 2 as a command that must print nothing), and `owns` set to the files. "Needs a token" drifts get one task to add the tokens, and the tasks that use them come `after` it. Done when every drift in the report is covered by a task.
   - **Without `task_create`** (a delegate's toolset): send the drafted tasks to your parent with `handoff`.
