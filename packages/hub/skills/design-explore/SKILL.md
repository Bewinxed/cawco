---
name: design-explore
description: Build a design preview the person judges in CawCo's panel — one static page of only the changed components, real components on fixture data, a switcher through variants or states, dials for values and a timeline for motion — opened with artifact_create kind "preview" and dir. Use when a design has two or more directions to pick between, when a component's states need judging, when asked for options, variants, directions or a preview of a UI change, or when a design brief moves to explore.
---

# Design explore

A design preview is a **folder**: one static page holding only the components that change, built from the project's real components on fixture data, with no backend behind it. A switcher outside the design system steps through the variants or states one at a time, at full size, and the URL holds the place. Values the person tunes get dials; motion gets a scrubbable timeline. Nothing covers the component being judged, and it works on a phone. You open it with `artifact_create({ kind: "preview", name, dir })`.

The kit beside this file builds that page: `kit/switcher.js` and `kit/switcher.css` (the switcher, the rail and the stage), and `scripts/check.mjs`. DialKit and its bridge to the hub come from the decision-page skill beside this one. [KIT.md](KIT.md) holds the kit's API.

The method for both modes is Jakub Krehel's `variant` and `state-machine` skills (github.com/jakubkrehel/skills), MIT, Copyright (c) 2026 Jakub Krehel; `kit/LICENSE` carries the licence.

## The gate

A preview exists for one of two things:

- **Variants:** two or more real directions for one piece, and the person picks.
- **States:** a stateful component whose states the person must judge.

A change with one right answer gets no preview. Build it, prove it with its check, and say what changed. A decision that isn't visual, such as a name, a policy or a scope, goes on a decision page (decision-page skill).

## Variants

Each variant is a different answer to the same brief. Pick **one primary axis**, and give each variant a different position on it:

| Axis | What varies |
| --- | --- |
| Structure | Grouping, order, column count, what collapses |
| Density | Spacing scale, how much fits |
| Emphasis | Where filled colour goes, what recedes |
| Type | Scale steps, weight contrast, measure |
| Voice | Labels, tone, how much copy |

The axis is the switcher's group heading. Secondary choices follow from it: a dense variant may take a smaller type step, which is coherence, not a second axis. **Today**, the piece as it ships now, is always the first entry (`id: "today"`). Then come three named directions by default, five only when asked. Each is named for its direction (`Quiet`, `Editorial`, `Dense`), never `Option A`. A variant that differs from another only in tint or copy takes a different position on the axis, or it is cut.

Every variant clears the same floor, and the floor never trades against the axis:

- Every control has an accessible name and a visible focus indicator, and the keyboard reaches everything a pointer does.
- Motion respects `prefers-reduced-motion`; no state rides on colour alone or on motion alone.
- Nothing clips, overlaps or becomes unreachable at 320px width or 200% zoom.
- Body and control text pass their contrast ratio; no semantic colour is used against its meaning.
- A destructive action has a confirmation, an undo or a distinct treatment; every error names a way to recover.
- Truncated content can reach its full value; nothing hides past a scroll edge with no cue.

A direction that only works by breaking the floor is dropped, with the reason given.

## States

The states are the branches the component already has: data (loading, empty, error, one item, a typical set, a set long enough to scroll, partly resolved, stale and refetching), account (plan, role, permission), feature (flags, limits, locked). **A state the code cannot reach is not a state.** List a state the design shows but the code lacks as missing, and leave it out. Name each state the way the product talks about it (`empty`, `member-no-access`). Group the states under headings in the product's words, by what changes. Combine kinds only where the code branches on the combination, never as a cross product.

Feed each state where the component receives its data: its props, or the app's own data seam (a seeded query cache, a mock provider, the project's request mocks). When the only way in is editing the component, ask before adding a seam. Loading and pending states hold still until the switcher moves. A page may carry both axes, variants and states: each keeps its own URL param.

## Steps

1. **Read the ground.** Read the brief (`task_read` when it is a task), the design system (DESIGN.md, tokens, the component library) and the component itself: its props, its branches, its data. Done when you can say in one sentence what the piece is, where it renders, its production width, and what it must do.
2. **Name the set before any code.** Write the axis and each variant's position, or the state list with its groups and the kinds you dropped and why. Done when no two variants share a position and every state maps to a branch you can point at.
3. **Build the page.** If the project has its own preview harness (a `harness` script, a harness folder), build the entry there. Otherwise build a static folder from the project's real components with the kit ([KIT.md](KIT.md)), bundled by the project's own build tool with a relative base. In both cases, import the real components untouched, with the project's own tokens, fonts and global CSS. Use fixture data shaped like the product: real-looking names, times, amounts, and as many items as users really have. Requests to a backend are refused. Values the person tunes become dial panels, and motion becomes timeline clips read through `clip.current`. Done when the folder holds `index.html` and every entry renders from fixtures.
4. **Check it.** Run `node <this skill>/scripts/check.mjs <folder>` from a folder where `playwright-core` resolves. It loads every entry at 1440×900 and 390×844 and fails on an empty stage, a console error, a failed request, a request off the folder, a control over the stage, sideways scroll, or a declared dial panel or timeline that did not mount. Done when it prints `ALL PASS`.
5. **Open it.** Call `artifact_create({ kind: "preview", name, dir: "<absolute folder>" })`. After any change to the folder, rebuild, check, and call `artifact_create` again with the same kind and name. Done when it answers `opened: true`.
6. **Hand over the decision.** Give a table with each variant's axis position, when it is right, and what it costs, with no favourite marked; asked directly, answer from how often the piece is seen and the product's personality. Name the keys (arrow keys step, `H` hides the controls) and the widths you judged at. Then end your turn.
7. **Read what comes back.** Picks, dial values (under `dials`, by panel and timeline name) and fields come from `artifact_read`; the person's pins and their file and line come from `comment_read`. Asked for another round, keep the page and name new positions around the direction they leaned toward. Done when every pin is answered in its thread.
8. **Build the pick.** In a task flow (brief → explore → review → picked → build), file the build with `task_create` once the task is picked: `after` this task, `acceptance` listing every state of the picked variant, and checks such as a contrast check and a screenshot compare. Otherwise build it where it belongs, following the project's conventions, with the tuned dial and timeline values. Then delete the preview folder and the harness entry, and search for the variant names and `__variant` and `__state` so nothing of them is left behind.

## Before you finish

| Mistake | Fix |
| --- | --- |
| The whole app, a route in it or a dev server as the preview | A static folder of only the changed components |
| Live data, a request, a page that dies with a server | Fixtures at props or the data seam; the check fails any request |
| Variants that look the same, or differ only in tint | A different position on the one axis, or cut it |
| Every axis varies at once | Vary one; the rest follows from it |
| Today missing, or not first | `today` opens the variants |
| A state the code cannot reach | List it as missing; leave it out |
| Lorem ipsum, three rows, "Test user" | Product-shaped data in real quantities |
| Thumbnails, or every variant stacked on one page | One entry at a time, full size, behind the switcher |
| Controls over the component, or a floating panel | The rail beside it on wide screens; the bar above it on a phone |
| A tuned value typed into code, motion timed by hand | A dial for the value, a timeline clip for the motion |
| A favourite marked in the table | Each one's cost; the person chooses |
| A preview for a change with one answer | Build it and prove it with its check |
| The folder changed and the panel still shows the old one | Call `artifact_create` again with the same kind and name |
