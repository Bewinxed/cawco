---
name: design-explore
description: Explore a component's design directions or states on CawCo's component canvas — the real component's variants or states as stories in CSF 3 states files beside it, drawn live on the workspace's stage in every interaction state, then asked of the person on a decision page. Use when a design has two or more directions to pick between, when a component's states need judging, when asked for options, or when a design brief moves to explore.
---

# Design explore

A design preview is a **component canvas**: a CSF 3 states file beside the real component (`<Component>.stories.ts`, in the project's own language), its default export naming the component, one named export per variant or state with that instance's `args` and a one-line doc comment. The workspace's stage (the project's own toolchain, kept running by CawCo) draws every story live in the project's real CSS, in every hover, focus and pressed state its CSS reaches, so the person judges the real component, not a copy. The `component-canvas` skill is the loop for building on it: load it with this one. The `show` skill's step 1 comes first. The canvas is your **working drawing**. Whenever the person must choose, the choice reaches them on a decision page (the `decision-page` skill): one question per card, each direction an option drawn live from its own canvas. Load it with this one too. On a canvas the person pins elements (each pin carries its `file:line:column` and the frame's state), tunes dials and motion, and edits props in the inspector, which CawCo writes back into the story's `args`.

The method for both modes is Jakub Krehel's `variant` and `state-machine` skills (github.com/jakubkrehel/skills), MIT, Copyright (c) 2026 Jakub Krehel, with one departure: the person gets one recommendation with its reason, never a bare table.

## Where the canvas runs

Look at the repository before step 1:

- **No code yet** (no `package.json`, no app): the project starts as code now, and the sheet's component is its first real file. Take the stack the person or the brief named; when none is named, ask once with a one-card decision page (the `decision-page` skill: SvelteKit, Vite with React or Vue, Astro, Nuxt), then scaffold it with that framework's own creator in the repository root: `npx sv create`, `npm create vite@latest`, `npm create astro@latest`, `npx nuxi@latest init`, `npx create-next-app@latest`. Install and commit the scaffold on its own. Done when the project's dev command starts and the scaffold is committed.
- **A Vite, Astro or Nuxt project:** a component canvas, as below. In Astro the canvas mounts the project's framework components (Svelte, Vue, React, Solid, Preact), never an `.astro` file.
- **Any other stack** (Next.js, Angular CLI, plain webpack, a custom server, Flutter, SwiftUI, Compose), **or an Astro component (`.astro`)**: these have no stage, and the stage refuses their canvas by name. Show the variants or states as a `page` artifact, the way a design tool shows components: one HTML page, one section per story, drawn in HTML on the project's CSS. A web project's CSS is what its build emits: run the build and link it. Flutter, SwiftUI and Compose have no CSS: write it from the project's design tokens. Pins on the page carry no `file:line`.

## The gate

A sheet exists for one of two things:

- **Variants:** two or more real directions for one piece, and the person picks.
- **States:** a stateful component whose states the person must judge.

A change with one right answer gets no sheet. Build it, prove it with its check, and say what changed. A decision that isn't visual, such as a name, a policy or a scope, goes on a decision page (decision-page skill).

A sheet mounts the piece, never the surface around it: the row, the card, the dialog, not the panel or page that holds it. A piece whose props cannot show the state gets a fixture component beside it (`preview/<Component>Fixture.svelte`, in the project's framework) that feeds it the state, never the live shell.

## Variants

Each variant is a different answer to the same brief. Pick **one primary axis**, and give each variant a different position on it:

| Axis | What varies |
| --- | --- |
| Structure | Grouping, order, column count, what collapses |
| Density | Spacing scale, how much fits |
| Emphasis | Where filled colour goes, what recedes |
| Type | Scale steps, weight contrast, measure |
| Voice | Labels, tone, how much copy |

Secondary choices follow from the axis: a dense variant may take a smaller type step, which is coherence, not a second axis. Three named directions by default, five only when asked; **Today**, the piece as it ships now, is one of them only when keeping it is a real answer. Each direction is its own states file beside the component (`RowQuiet.stories.ts`, `RowToday.stories.ts`: the name before `.stories` is one PascalCase or kebab-case word, never dotted), holding that one story, named for its direction (`Quiet`, `Editorial`, `Dense`), never `OptionA`: its canvas is the option the decision card shows. A variant that differs from another only in tint or copy takes a different position on the axis, or it is cut. A direction the component's props cannot express is a variant component of its own (`HomeQuiet.svelte` beside `Home.svelte`), named in its story's `render` in the framework's own idiom.

Every variant clears the same floor, and the floor never trades against the axis:

- Every control has an accessible name and a visible focus indicator, and the keyboard reaches everything a pointer does.
- Motion respects `prefers-reduced-motion`; no state rides on colour alone or on motion alone.
- Nothing clips, overlaps or becomes unreachable at 320px width or 200% zoom.
- Body and control text pass their contrast ratio; no semantic colour is used against its meaning.
- A destructive action has a confirmation, an undo or a distinct treatment; every error names a way to recover.
- Truncated content can reach its full value; nothing hides past a scroll edge with no cue.

A direction that only works by breaking the floor is dropped, with the reason given.

## States

The states are the branches the component already has: data (loading, empty, error, one item, a typical set, a set long enough to scroll, partly resolved, stale and refetching), account (plan, role, permission), feature (flags, limits, locked). **A state the code cannot reach is not a state.** List a state the design shows but the code lacks as missing, and leave it out. Name each story the way the product talks about the state (`Empty`, `MemberNoAccess`). Combine kinds only where the code branches on the combination, never as a cross product.

Feed each state through the component's props, as its story's `args`, with fixture data shaped like the product: real-looking names, times, amounts, and as many items as users really have. A component that needs a provider (a theme, a query cache) names it in the sheet's `decorators`. When the only way in is editing the component, ask before adding a seam. A sheet may carry both axes: variant stories and state stories, grouped by their names.

## Steps

1. **Read the ground.** Read the brief (`task_read` when it is a task), the design system (`design/DESIGN.md` and `design/tokens.css`, or the repository's own) and the component itself: its props, its branches, its data. Done when you can say in one sentence what the piece is, where it renders, its production width, and what it must do.
2. **Name the set before any code.** Write the axis and each variant's position, or the state list and the kinds you dropped and why. Done when no two variants share a position and every state maps to a branch you can point at.
3. **Write the states files** beside the component: `export default { component, args }` with the props every story shares, then the story with only the args it changes, one file per direction (states share one file); a story's width is `parameters.viewport` when the piece has one. Import the real component untouched. Done when every story from step 2 is an export and the build and type-check pass.
4. **Draw it.** Follow the `component-canvas` skill's steps 4 to 6: one canvas per direction, `artifact_create({ kind: "component", does: "judge", ask, file: "<repo-relative path>" })` with an ask of your own working round ("Judge the three card directions"), then read what was drawn and fix every frame that is not `drawn`. When a page is slow to load, its `weight` names the import that makes it slow and its `cut` where the weight enters. A compile error reaches you by itself with its `file:line:column`: fix it and read again. Done when every frame is `drawn`, `unnamed` is empty, and its readability check passes. A folder preview of built components (`artifact_create({ kind: "preview", does: "judge", ask, dir })`) answers its `weight` at once, as information.
5. **Ask.** Publish the choice with the `decision-page` skill: one card, the axis as its question in plain words, each direction an option whose media is a `Preview` of its canvas, its `line` what it gets and its `cost` what it costs, and one recommended, its reason from how often the piece is seen and the product's personality. A state that raises a choice (what an empty list says) is a card of its own, its options drawn as that state; the other states stay on the canvas, never on the page. Then end your turn.
6. **Read what comes back.** The person's pick and note come from the decision page's `artifact_read`; args they edited from the canvas's; their pins, each with its `source`, from `comment_read`, and each is a change you make in the component or the story at that line, shown back as the page's "Fixed from your pins" card. Asked for another round, add the new directions as a new card around the one they leaned toward. Done when every pin is answered in its thread.
7. **Build the pick.** In a task flow (brief → explore → review → picked → build), file the build with `task_create` once the task is picked: `waits_on` this task, `acceptance` listing every state of the picked variant. Otherwise build it where it belongs, following the project's conventions, with the args the person tuned. Then delete the losing directions' states files, variant components and canvases (`artifact_delete`), so only the shipped component's own states stay.

## Before you finish

| Mistake | Fix |
| --- | --- |
| A static page, a copied component, or the whole app on a dev server | A sheet beside the real component |
| Live data, a request, a story that dies with a server | Fixtures as `args`, providers as `decorators` |
| Mounting the panel to show one row in it | Mount the row; feed the state as args or through a fixture |
| Variants that look the same, or differ only in tint | A different position on the one axis, or cut it |
| Every axis varies at once | Vary one; the rest follows from it |
| A Today story beside directions it doesn't compete with | Today is a direction only when keeping it is a real answer |
| A state the code cannot reach | List it as missing; leave it out |
| Lorem ipsum, three rows, "Test user" | Product-shaped data in real quantities |
| The canvas shown to the person as the choice | A decision card, each direction an option on its own canvas |
| No recommendation, or one with no reason | One recommended, its reason in the card's `why` |
| A sheet for a change with one answer | Build it and prove it with its check |
| Losing directions left behind after the pick | Delete their files, components and canvases |
