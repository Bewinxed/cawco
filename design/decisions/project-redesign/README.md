# The project redesign's decision page

`page.oui` is the decision program (the decision library, packages/hub/skills/decision-page/LIBRARY.md). Each `Preview("@name")` stands for a component canvas made from one states file. To publish: make each canvas with `artifact_create({ kind: "component", name, file, about })` (no `to`), put its id in place of `@name`, then `artifact_create({ kind: "page", name: "project-redesign", program, to: "parent" })`.

| In the program | States file (repo-relative) |
| --- | --- |
| `@pane-one-unit` | apps/dashboard/src/lib/cawco/tasks/TaskPaneOneUnit.stories.ts |
| `@pane-today` | apps/dashboard/src/lib/cawco/tasks/TaskPane.stories.ts |
| `@card-state-line` | apps/dashboard/src/lib/cawco/tasks/TaskCardStateLine.stories.ts |
| `@card-today` | apps/dashboard/src/lib/cawco/tasks/TaskCard.stories.ts |
| `@pipeline-run-order` | apps/dashboard/src/lib/cawco/views/ViewPipelineRunOrder.stories.ts |
| `@pipeline-removed` | apps/dashboard/src/lib/cawco/views/preview/PipelineRemovedFixture.stories.ts |
| `@empty-work-column` | apps/dashboard/src/lib/cawco/project/WorkColumnEmpty.stories.ts |
| `@empty-today` | apps/dashboard/src/lib/cawco/project/preview/EmptyTodayFixture.stories.ts |
| `@project-head` | apps/dashboard/src/lib/cawco/project/ProjectHeadNewSession.stories.ts |

When the owner picks, the picked card collapses to one line and its other options leave: an `artifact_update` with `statements` re-declaring that Decision with the picked Option alone (its id kept, so the pick stays).
