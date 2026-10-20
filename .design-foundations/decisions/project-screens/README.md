# The project screens' decision page

`page.oui` is the decision program (the decision library, `packages/hub/skills/decision-page/LIBRARY.md`). A section, "Fixed from your pins", shows the four surfaces fixed
from the owner's pins, each with his pin in one line, one line of what changed, and its fixed state live: no pick, since
he pins whatever still looks wrong. The one card asks what the Pipeline tab is for (`pipeline`), its drawing above its
two options. Its opening lines are `ask.txt` and `does.txt`, passed at publish.

Each `Preview("@name")` stands for the component canvas of one states file. To publish: make each canvas with
`artifact_create({ kind: "component", name, file, about })`, put the id it answers in place of `@name`, then
`artifact_create({ kind: "page", name: "project-screens", program, ask, does })`.

| In the program | States file (repo-relative) | `about` |
| --- | --- | --- |
| `@pane` | apps/dashboard/src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts | The task pane as one unit, every state, desk and phone. |
| `@card` | apps/dashboard/src/lib/cawco/tasks/TaskCardStateLine.stories.ts | The board card with one state line, every state. |
| `@empty` | apps/dashboard/src/lib/cawco/project/WorkColumnEmpty.stories.ts | Empty views on the work column: board, Decisions, Routines, Caw. |
| `@head` | apps/dashboard/src/lib/cawco/project/ProjectHeadNewSession.stories.ts | The project head without Spin off, New session in its place. |
| `@run-order` | apps/dashboard/src/lib/cawco/views/ViewPipelineRunOrder.stories.ts | Pipeline as the run order. |

Its proof is `bun scripts/probe-kit/run.ts web decision-pages-ready`: the program through the hub's own check, every
states file drawn on the dashboard's stage, and the page drawn by the hub's decision host with each canvas embedded live.
Captures and their manifest are in `.probe/decision-pages/`.
