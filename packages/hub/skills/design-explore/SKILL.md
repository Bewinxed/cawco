---
name: design-explore
description: Build a design sheet the person judges in CawCo's panel — the real component's variants or states as stories in a CSF 3 file beside it, mounted live on the workspace's stage and opened with artifact_create kind "sheet". Use when a design has two or more directions to pick between, when a component's states need judging, when asked for options, variants, directions or a preview of a UI change, or when a design brief moves to explore.
---

# Design explore

A design preview is a **sheet**: a CSF 3 story file beside the real component (`<Component>.stories.ts`, in the project's own language), its default export naming the component, one named export per variant or state with that instance's `args`. The workspace's stage (the project's own toolchain, kept running by CawCo) mounts every story side by side in the project's real CSS, so the person judges the real component, not a copy. You open it with `artifact_create({ kind: "sheet", file })`; the person picks a story, pins elements (each pin carries its `file:line:column`), and edits props in the inspector, which CawCo writes back into the story's `args`.

The method for both modes is Jakub Krehel's `variant` and `state-machine` skills (github.com/jakubkrehel/skills), MIT, Copyright (c) 2026 Jakub Krehel.

## Where the sheet runs

Look at the repository before step 1:

- **No code yet** (no `package.json`, no app): the project starts as code now, and the sheet's component is its first real file. Take the stack the person or the brief named; when none is named, ask once with `AskUserQuestion` (SvelteKit, Vite with React or Vue, Astro, Nuxt), then scaffold it with that framework's own creator in the repository root: `npx sv create`, `npm create vite@latest`, `npm create astro@latest`, `npx nuxi@latest init`, `npx create-next-app@latest`. Install and commit the scaffold on its own. Done when the project's dev command starts and the scaffold is committed.
- **A Vite, Astro or Nuxt project:** a sheet, as below. In Astro the sheet mounts the project's framework components (Svelte, Vue, React, Solid, Preact), never an `.astro` file.
- **Any other toolchain** (Next.js for now, Angular CLI, plain webpack, a custom server), **or an Astro component (`.astro`)**: the stage refuses the sheet by name. Show the variants or states as a `page` artifact instead: run the project's build, then write one HTML page that links the built CSS it emits and lays out one section per story, with the markup the component renders; pins on it carry no `file:line`.

## The gate

A sheet exists for one of two things:

- **Variants:** two or more real directions for one piece, and the person picks.
- **States:** a stateful component whose states the person must judge.

A change with one right answer gets no sheet. Build it, prove it with its check, and say what changed. A decision that isn't visual, such as a name, a policy or a scope, goes on a decision page (decision-page skill).

## Variants

Each variant is a different answer to the same brief. Pick **one primary axis**, and give each variant a different position on it:

| Axis | What varies |
| --- | --- |
| Structure | Grouping, order, column count, what collapses |
| Density | Spacing scale, how much fits |
| Emphasis | Where filled colour goes, what recedes |
| Type | Scale steps, weight contrast, measure |
| Voice | Labels, tone, how much copy |

Secondary choices follow from the axis: a dense variant may take a smaller type step, which is coherence, not a second axis. **Today**, the piece as it ships now, is always the first story (`export const Today`). Then come three named directions by default, five only when asked. Each story is named for its direction (`Quiet`, `Editorial`, `Dense`), never `OptionA`. A variant that differs from another only in tint or copy takes a different position on the axis, or it is cut. A direction the component's props cannot express is a variant component of its own (`HomeQuiet.svelte` beside `Home.svelte`), named in its story's `render` in the framework's own idiom.

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
3. **Write the sheet** beside the component: `export default { component, args }` with the props every story shares, then one export per variant or state with only the args it changes; a story's width is `parameters.viewport` when the piece has one. Import the real component untouched. Done when every story from step 2 is an export and the build and type-check pass.
4. **Open it.** Call `artifact_create({ kind: "sheet", file: "<repo-relative path>" })`. It answers the stories it found and their props; the stage starts on first open. Read it back with `artifact_read`: every story renders and the stage reports no `errors`. A compile error reaches you by itself with its `file:line:column`: fix it and read again. Done when it answers `opened: true` and every story renders.
5. **Hand over the decision.** Give a table with each variant's axis position, when it is right, and what it costs, with no favourite marked; asked directly, answer from how often the piece is seen and the product's personality. Then end your turn.
6. **Read what comes back.** The person's pick (the story they chose) and the args they edited come from `artifact_read`; their pins, each with its `source`, come from `comment_read`, and each is a change you make in the component or the story at that line. Asked for another round, keep the sheet and add stories around the direction they leaned toward. Done when every pin is answered in its thread.
7. **Build the pick.** In a task flow (brief → explore → review → picked → build), file the build with `task_create` once the task is picked: `after` this task, `acceptance` listing every state of the picked variant. Otherwise build it where it belongs, following the project's conventions, with the args the person tuned. Then delete the variant stories and variant components that lost, so only the shipped component's own states stay in its sheet.

## Before you finish

| Mistake | Fix |
| --- | --- |
| A static page, a copied component, or the whole app on a dev server | A sheet beside the real component |
| Live data, a request, a story that dies with a server | Fixtures as `args`, providers as `decorators` |
| Variants that look the same, or differ only in tint | A different position on the one axis, or cut it |
| Every axis varies at once | Vary one; the rest follows from it |
| Today missing, or not first | `Today` is the first export |
| A state the code cannot reach | List it as missing; leave it out |
| Lorem ipsum, three rows, "Test user" | Product-shaped data in real quantities |
| A favourite marked in the table | Each one's cost; the person chooses |
| A sheet for a change with one answer | Build it and prove it with its check |
| Losing stories left behind after the pick | Delete them with their variant components |
