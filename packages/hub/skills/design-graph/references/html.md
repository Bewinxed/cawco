# An HTML page on the design graph

An HTML design is a page the hub keeps and opens on the design graph itself: no workspace, stage or app runs behind it. It is your choice for two cases: a stack with no stage (`design-explore`, "Where the graph runs"), and an idea you judge throwaway. Every other design, a new part included, is a live story in the project's own language and framework (the steps in `SKILL.md`).

## Open it

`artifact_create({ kind: "component", name, title, does: "judge", ask, html })`, or `dir` with a folder on your machine holding `page.html`, as a page artifact takes one: the hub builds it the same way, its pictures and `mockups/` taken in. Directions are one page each: `directions: [{ html, name, line }, { dir, name, line }]`, `html` and `dir` left out of the call. The same `name` again replaces the pages in place, picks and pins kept: that is how a new round lands.

## Write the page for the graph

- **One page is one state.** The graph draws it at its widths (390, 768, 1440, 1920) as the frame's own viewport, so the page's media queries and `vw` answer each one; a width wider than the panel is scaled to fit. The page scrolls inside the frame as on a device. Write it responsive, never at one fixed width.
- **Dark is the page's CSS.** The graph's scheme reaches the page as its preferred colour scheme: style dark with `@media (prefers-color-scheme: dark)` or `light-dark()` under `:root { color-scheme: light dark }`. A script's `matchMedia` hears the browser's own scheme in Chromium, so keep the scheme in CSS. A page that names no dark draws light in both.
- **A dial is a CSS variable.** Each dial's target is `{ cssVar: "--radius" }`, set on the page's root; the page reads it (`border-radius: var(--radius)`) and declares its default on `:root`, which the dial shows as written. An `arg` dial is refused: a page has no props.
- **Real words, product-shaped data**, as on any design: real names, counts and the longest text a user has.

## What comes back

`artifact_read` answers their pins, their dial values (`dials`) and, with directions, their `picked`. A pin anchors on the element they pointed at and carries no `file:line`: find the element by what the pin names. The hub draws no frame of the page and keeps no render report, so read it yourself at each width and in both schemes before you open it. Save into code, the Animation face, Compare and the states' Map stay with live stories: a page has no states file to write and no move to play.
