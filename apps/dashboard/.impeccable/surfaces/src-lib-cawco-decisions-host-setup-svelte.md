---
version: 1
slug: "src-lib-cawco-decisions-host-setup-svelte"
primary_target: "src/lib/cawco/decisions/host/Setup.svelte"
related_targets: ["src/lib/cawco/project/DraftStages.svelte", "src/lib/cawco/project/DraftColumn.svelte"]
---

# Surface brief: the setup page (decision library `Setup`)

- **Mode:** Operate.
- **Job:** the person reads back Caw's draft of how a new project runs (its name, what it is for, its stages and who does their work), changes what is wrong where it stands, and sends it with one Send that names the project. They reach it from the board's "Open the setup page" (where the page also asks the place, a routine or what moves) or its own tab; it never opens in a session's panel (hub artifacts/service.ts `boardOf`).
- **One editor:** the draft is drawn by the board's own parts (DraftStages: the aim, then each stage as the column it becomes, DraftColumn; then Who does the work, each delegate type a tile on the same grid, DraftDelegate), over the same picks the board keeps. The page adds only its head (SetupTitle, the name) and its Send. The Reminders rows that stood here (a minus, then Remove) were rejected on a design page and are gone; nothing draws them.
- **Shaping a stage where it stands:** the column is dragged to another place (stage-dnd, Pragmatic drag and drop; a finger by the platform's long press), the drop line on the edge it would take; its glyph is a button opening one menu of glyphs then colours; its ⋯ holds Kind, Who does it, Move earlier and later (the way with no drag, WCAG 2.2 SC 2.5.7) and Remove. A delegate type's ⋯ holds Remove; a removed type waits under the tiles with Add back, and the stages it worked in are left with no one.
- **States:** the draft as Caw wrote it; the hub's kept edits after a reload; the draft being read (its skeleton); a stage being renamed; a stage in the air and dropped; its look menu; its ⋯ at each level (Kind, Who does it); a delegate type removed and added back; one stage; twelve stages with long names; day and night.
- **Widths:** 390 (touch), 680, 1440, 2529. The columns wrap at the board's column width (`c-board-col-min`); on a phone each is as tall as its words.
- **Untouched:** the page head (Caw and the name, SetupTitle), the Send and its foot, the hub's keys (`aim`, `stages`, `delegates`, `shape`, `name`).

## Direction contract

direction: inherits DESIGN.md
