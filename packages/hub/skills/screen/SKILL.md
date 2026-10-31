---
name: screen
description: Design one screen or flow for a project, the person's journey first and then every state, built on the project's DESIGN.md and tokens and shown for their judgement. Use when asked to design a new screen or flow.
---

# Screen

A **screen** is designed from the journey in, never from the pixels out. The project's **DESIGN.md** is law: its tokens, named rules and component recipes decide every colour, size, radius, shadow, curve and duration. Find them in the project folder's `design/` (Caw: `folder_read`) or the repository's own DESIGN.md and token file. A value the design needs that no token holds is a token to propose, never a literal in the screen. The `show` skill's step 1 comes first: the screen reaches the person with `does: "judge"` and an ask, or its open choices on a decision page.

## Where the screen runs

Every screen is real code from the first one. Where it is drawn (a component canvas on a Vite, Astro or Nuxt stage, a `page` artifact on any other stack, or a scaffold first when there is no code yet) is the `design-explore` skill's "Where the canvas runs": follow it before step 1.

## Steps

1. **Write the journey**: who arrives, from where, what they came to do, the one action that finishes it, and where they go next. Read the product's own journey and voice rules when it has them (JOURNEY.md, DESIGN.md's Voice section). Done when the journey fits in five lines and names the screen's one primary action.
2. **List every state** the screen can be in: first use and empty, loading, filled, long and overflowing content, error, offline or refused, success, light and dark, phone and wide, reduced motion. Done when each state has one line on what the person sees and can do there. In a task, each state becomes a to-do (`todo_write` with `add`).
3. **Choose the parts**: the components the design system already has, by their recipe names. A part it lacks is described as a new recipe on the system's tokens. Done when every element of every state maps to a recipe or a proposed one.
4. **Build it where it can be seen.** The screen is a real component in the repository (`<Screen>.svelte`, `.tsx`, `.vue`) composed of the system's components; its states are a states file beside it, `<Screen>.stories.ts` in CSF 3, one story per state from step 2 with fixture data as `args` and a doc comment each. Read `design_map` first and mount the parts it lists, never redraw them. Show it with the `component-canvas` skill: `artifact_create({ kind: "component", does: "judge", ask, file })` draws every story in the project's real CSS, its parts' hover and focus included. `preview` (a port or a folder) is for a flow the person tries in the whole running app (`does: "try"`, opened at its `path`), never for showing a component; a port preview names what serves it (`artifact_create({ kind: "preview", does: "try", ask, port, path, serve: { command, cwd } })`), and CawCo runs that server in your workspace and keeps it up while the preview lasts, so don't start it in your own shell, where it ends with that shell. A toolchain the stage cannot run takes the `page` artifact ("Where the screen runs"). The canvas is your working drawing of every state; choices the person must make reach them on a decision page (the `decision-page` skill), one question per card, never as the canvas itself. Done when every state from step 2 is a story whose frame the canvas reports `drawn`.
5. **Check it against DESIGN.md**: every value a token, contrast at the system's floor, nothing outside its rules. The `drift` skill's search finds literals. Done when the check finds nothing, or each finding is fixed.
6. **End your turn**, then read their picks and pins with `artifact_read` and `comment_read` and revise in place. The design is done when they pick; building it for real is its own task.
