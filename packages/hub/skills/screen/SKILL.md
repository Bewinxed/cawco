---
name: screen
description: Design one screen or flow for a project, the person's journey first and then every state, built on the project's DESIGN.md and tokens and shown as an artifact. Use when asked to design, mock up or lay out a screen, page, flow, onboarding or form, or when a design task moves to explore.
---

# Screen

A **screen** is designed from the journey in, never from the pixels out. The project's **DESIGN.md** is law: its tokens, named rules and component recipes decide every colour, size, radius, shadow, curve and duration. Find them in the project folder's `design/` (Caw: `folder_read`) or the repository's own DESIGN.md and token file. A value the design needs that no token holds is a token to propose, never a literal in the screen.

## Steps

1. **Write the journey**: who arrives, from where, what they came to do, the one action that finishes it, and where they go next. Read the product's own journey and words files when it has them (JOURNEY.md, WORDS.md). Done when the journey fits in five lines and names the screen's one primary action.
2. **List every state** the screen can be in: first use and empty, loading, filled, long and overflowing content, error, offline or refused, success, light and dark, phone and wide, reduced motion. Done when each state has one line on what the person sees and can do there. In a task, each state becomes a to-do (`todo_write` with `add`).
3. **Choose the parts**: the components the design system already has, by their recipe names. A part it lacks is described as a new recipe on the system's tokens. Done when every element of every state maps to a recipe or a proposed one.
4. **Build it where it can be seen.** In a repository with a dev server, build the screen on the real components behind a mock-data route and show it with `artifact_create({ kind: "preview", port })`. Without one, write it as a page on the project's tokens (`artifact_create({ kind: "page", html })`). Show the states with a switch, never as separate pages. Choices the person must make go on a decision page (the `decision-page` skill). Done when the artifact answers `opened: true` and every state from step 2 is reachable in it.
5. **Check it against DESIGN.md**: every value a token, contrast at the system's floor, nothing outside its rules. The `drift` skill's search finds literals. Done when the check finds nothing, or each finding is fixed.
6. **Wait for the person's word**, then read their picks and comments with `artifact_read` and revise in place. The design is done when they pick; building it for real is its own task.
