---
name: screen
description: Design one screen or flow for a project, the person's journey first and then every state, built on the project's DESIGN.md and tokens and shown as an artifact. Use when asked to design, mock up or lay out a screen, page, flow, onboarding or form, or when a design task moves to explore.
---

# Screen

A **screen** is designed from the journey in, never from the pixels out. The project's **DESIGN.md** is law: its tokens, named rules and component recipes decide every colour, size, radius, shadow, curve and duration. Find them in the project folder's `design/` (Caw: `folder_read`) or the repository's own DESIGN.md and token file. A value the design needs that no token holds is a token to propose, never a literal in the screen.

## Where the screen runs

Every screen is real code from the first one. Look at the repository before step 1:

- **No code yet** (no `package.json`, no app): the project starts as code now. Take the stack the person or the brief named; when none is named, ask once with `AskUserQuestion` (SvelteKit, Vite with React or Vue, Astro, Nuxt), then scaffold it with that framework's own creator in the repository root: `npx sv create`, `npm create vite@latest`, `npm create astro@latest`, `npx nuxi@latest init`, `npx create-next-app@latest`. Install, commit the scaffold on its own, then build the screen as step 4 says. Done when the project's dev command starts and the scaffold is committed.
- **A Vite, Astro or Nuxt project:** the screen and its states are a sheet (step 4), mounted live by the stage.
- **Any other stack** (Next.js, Angular CLI, plain webpack, a custom server, Flutter, SwiftUI, Compose), **or an Astro component (`.astro`)**: these have no stage, and the stage refuses their sheet by name. Show the states as a `page` artifact, the way a design tool shows components: one HTML page, one section per state, drawn in HTML on the project's CSS. A web project's CSS is what its build emits: run the build and link it. Flutter, SwiftUI and Compose have no CSS: write it from the project's design tokens. Pins on the page carry no `file:line`.

## Steps

1. **Write the journey**: who arrives, from where, what they came to do, the one action that finishes it, and where they go next. Read the product's own journey and words files when it has them (JOURNEY.md, WORDS.md). Done when the journey fits in five lines and names the screen's one primary action.
2. **List every state** the screen can be in: first use and empty, loading, filled, long and overflowing content, error, offline or refused, success, light and dark, phone and wide, reduced motion. Done when each state has one line on what the person sees and can do there. In a task, each state becomes a to-do (`todo_write` with `add`).
3. **Choose the parts**: the components the design system already has, by their recipe names. A part it lacks is described as a new recipe on the system's tokens. Done when every element of every state maps to a recipe or a proposed one.
4. **Build it where it can be seen.** The screen is a real component in the repository (`<Screen>.svelte`, `.tsx`, `.vue`) composed of the system's components; its states are a sheet beside it, `<Screen>.stories.ts` in CSF 3, one story per state from step 2 with fixture data as `args`. Show it with `artifact_create({ kind: "sheet", file })`: the stage mounts every story in the project's real CSS. `preview` (a port or a folder) is for a whole running app or a static folder, never for showing a component; a port preview names what serves it (`artifact_create({ kind: "preview", port, serve: { command, cwd } })`), and CawCo runs that server in your workspace and keeps it up while the preview lasts, so don't start it in your own shell, where it ends with that shell. A toolchain the stage cannot run takes the `page` artifact from "Where the screen runs". Choices the person must make go on a decision page (the `decision-page` skill). Done when the artifact answers `opened: true` and every state from step 2 is a story that renders.
5. **Check it against DESIGN.md**: every value a token, contrast at the system's floor, nothing outside its rules. The `drift` skill's search finds literals. Done when the check finds nothing, or each finding is fixed.
6. **Wait for the person's word**, then read their picks and comments with `artifact_read` and revise in place. The design is done when they pick; building it for real is its own task.
