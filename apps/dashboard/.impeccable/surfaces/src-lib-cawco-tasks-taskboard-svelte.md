---
version: 1
slug: "src-lib-cawco-tasks-taskboard-svelte"
primary_target: "src/lib/cawco/tasks/TaskBoard.svelte"
related_targets: ["src/lib/cawco/tasks/TaskColumn.svelte","src/lib/cawco/tasks/NewTaskForm.svelte","src/lib/cawco/tasks/TaskCard.svelte"]
---

# A project's board: its stages as columns, its tasks as cards

Mode: Operate. The person comes here to see where every task of a project stands, to move a task between stages by dragging its card, and to add a task to the project's first to-do stage from the Add task at that column's foot.

## Regions

- **Columns**, one per stage in stages.md's order, each headed by its name, count and kind word; a last column for tasks whose stage stages.md does not name. At a desk each column scrolls its own cards under the edge fade; on a phone the page scrolls and the columns snap sideways.
- **Add task**, at the foot of the first to-do stage's column: a ghost button that opens the inline form (title, Cancel, Add task). The form stays open after an add, for a run of tasks.
- **The Archived rail** beside the columns, opening into a column of its own.

## A task added from the board

- **Where it lands: the foot of its stage.** The board draws a stage's cards in the hub's order: ranked tasks by rank, then the rest by number (hub `byRank`). A task just added has no rank and the newest number, so its place is last. Drawing it at the top would put it where the hub's next read moves it from, so it lands at the foot, right above the form it was typed in.
- **It is brought into view** in its column and its column on the board's strip (core `bringIntoView`, nearest, and `bringIntoStrip`), before the frame its arrival is read in, so the house's row arrival (`motion/rows`) uncovers it where the person is looking; when the hub's echo redraws the board it is brought into view again.
- **It is marked new for a moment**: `data-new` on its row for `row-flash`'s length (3 × `--dur-fade`), the card fading up from `row-flash`'s opacity as a saved settings row does. `row-flash` is a fade (opacity alone, nothing travels), so it runs with reduced motion too (a fade still runs under reduced motion); the card comes into view either way.

## States

Empty board (one column and its Add task), a few cards, a column longer than its height (scrolls), adding (the form open, Adding…), added (the card in view and marked new), refused (the hub's words under the field), a card moving (Moving…), a move refused (its reason under the card), a card in the air (closed columns step back), the rail folded and open.

## Widths

390 (the page scrolls, columns snap), 1440 (each column scrolls its own cards).

## Direction contract

direction: inherits DESIGN.md
