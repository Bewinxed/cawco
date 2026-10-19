# The project screens' decision page

`page.oui` is the decision program (the decision library, `packages/hub/skills/decision-page/LIBRARY.md`). It replaces the
older `design/decisions/project-redesign/` page: the "keep today" options the owner's pins on `project-surfaces-today`
had already turned down are gone, and New session's look isn't asked, because DESIGN.md has coral mark "the one place you
act". What's left is one pins card ("Fixed from your pins: does it look right now?") and one open question (Pipeline).

Each `Preview("@name")` stands for the component canvas of one states file. To publish: make each canvas with
`artifact_create({ kind: "component", name, file, about })`, put the id it answers in place of `@name`, then
`artifact_create({ kind: "page", name: "project-screens", program })`.

| In the program | States file (repo-relative) | `about` |
| --- | --- | --- |
| `@pane` | apps/dashboard/src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts | The task pane as one unit, every state, desk and phone. |
| `@card` | apps/dashboard/src/lib/cawco/tasks/TaskCardStateLine.stories.ts | The board card with one state line, every state. |
| `@empty` | apps/dashboard/src/lib/cawco/project/WorkColumnEmpty.stories.ts | Empty views on the work column: board, Decisions, Routines, Caw. |
| `@head` | apps/dashboard/src/lib/cawco/project/ProjectHeadNewSession.stories.ts | The project head with New session, without Spin off. |
| `@run-order` | apps/dashboard/src/lib/cawco/views/ViewPipelineRunOrder.stories.ts | Pipeline as the run order. |
| `@removed` | apps/dashboard/src/lib/cawco/views/preview/PipelineRemovedFixture.stories.ts | The project's views with Pipeline removed. |

Its proof is `bun scripts/probe-kit/run.ts web decision-pages-ready`: the program through the hub's own check, every
states file drawn on the dashboard's stage, and the page drawn by the hub's decision host with each canvas embedded live.
Captures and their manifest are in `.probe/decision-pages/`.
