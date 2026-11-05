---
version: 1
slug: "src-routes-app-project-id-page-svelte"
primary_target: "src/routes/(app)/project/[id]/+page.svelte"
related_targets: []
---

# Surface brief: the project page (`/project/<id>`), draft and board

- **Mode:** Operate.
- **Job and who arrives:** the person who owns the project, on a desk with Caw's panel open beside the view or on a phone with Caw as a sheet. Before setup they review and shape Caw's draft (what it is for, its stages, who does the work) and set it up; after, they glance at the board, act on what waits on them, and review a task in its sheet.
- **Regions:** view strip (views, Filter, Needs you, New task, Ask Caw); head (name, folder, Caw's seat, ⋯); the view (draft or board/table/decisions); the task sheet (Review | Details).
- **What waits on the person (JOURNEY.md, Act on what waits; Needs you is a mark):** Needs you counts tasks that wait on them (a `you` stage, a session's ask, an action, and a wait on a card not yet picked) and decision pages with picks open. Pressed, it narrows the view: the board and table to those tasks, Decisions to those pages; pressed on the board with no task waiting it goes to Decisions. The Decisions tab's trail wears the Needs-you mark. A task waiting on an unpicked card says so on its card ("waits on your pick") with the needs mark. Before setup the line over the draft names every setup-page card still open and links to the page.
- **The draft:** stages as the columns they become, in a wrapping grid. A stage moves by drag (drag/DragProvider on dnd kit): it lifts under the hand while the other columns make room, a finger after a rest, the keys by its grip; Move earlier/later stay in its ⋯ as the single-pointer way (WCAG 2.2 SC 2.5.7). Its glyph is a button: pressed, one menu of glyphs then colours (Height's icon popover). Its ⋯ holds Kind, Who does it, Move earlier/later, Remove. Under the stages, Who does the work: each delegate type Caw proposed as a tile on the same grid (its name, what it runs on, its brief, the stages it runs), its ⋯ with Remove; a removed type waits on one line with Add back.
- **The sheet:** while a card the task waits on is not picked, Review leads with the picks card (each question whole and its Pick, "It starts once you pick.") and Approve is held; "Waited on your pick" names each picked card by its chip after. On the sheet a card's chip and its Pick are links to the card in the project's Decisions, its tip the hub's word on the wait. The board marks the open task's card and brings it into view beside the sheet. The description is drawn as formatted markdown with the transcript's chips for what it names: a `cawco:` link, a task id, a quoted card question the task waits on, a folder path.
- **States:** draft — Caw drafting, asking (a question holding him, questions open), drafted; a stage dragged (pointer, touch), dropped, Escape; a stage's look menu; its kind and Who does it levels; a stage removed; a delegate type removed and added back. Set up — nothing waiting; one card waiting; several cards on one page; a task blocked on a card; Caw's question open; Needs you on. Sheet — a task waiting on a card; a task whose wait is settled; a long description with lists, paths and a link.
- **Widths:** 390 (touch), 680, 1440, 2529.
- **Verdict:** streamline (design-run.md). Backlog P0: Needs you misses pages and card-blocked tasks; delegate type not removable. P1: drag reorder; glyph as the look's control; Decisions trail mark; also-asks line counts every open card; review shows waits and a formatted description with chips.
- **Untouched:** the draft bar and Set up; Caw's questions on the board; the board's columns and card recipe beyond the wait line; the decision band.

## Direction contract

direction: inherits DESIGN.md
