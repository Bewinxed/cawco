---
version: 1
slug: "src-lib-cawco-decisions-host-setup-svelte"
primary_target: "src/lib/cawco/decisions/host/Setup.svelte"
related_targets: ["src/lib/cawco/project/DraftStages.svelte", "src/lib/cawco/project/DraftColumn.svelte"]
---

# Surface brief: the setup page (decision library `Setup`)

- **Mode:** Operate.
- **Job:** the person reads back Caw's draft of how a new project runs (its name, what it is for, its stages and who does their work), changes what is wrong where it stands, and sends it with one Send that names the project. They reach it from the board's "Open the setup page" (where the page also asks the place, a routine or what moves) or its own tab; it never opens in a session's panel (hub artifacts/service.ts `boardOf`).
- **One editor:** the draft is drawn by the board's own parts (DraftStages: the aim, then each stage as the column it becomes, DraftColumn), over the same picks the board keeps. The page adds only its head (SetupTitle, the name) and its Send. The Reminders rows that stood here (a minus, then Remove) were rejected on a design page and are gone; nothing draws them.
- **States:** the draft as Caw wrote it; the hub's kept edits after a reload; a stage being renamed; a stage's menu at each level (Kind, Who does it, Glyph and colour); one stage; twelve stages with long names; day and night.
- **Widths:** 390 (touch), 680, 1440, 2529. The columns wrap at the board's column width (`c-board-col-min`); on a phone each is as tall as its words.
- **Untouched:** the page head (Caw and the name, SetupTitle), the Send and its foot, the hub's keys (`aim`, `stages`, `delegates`, `shape`, `name`).

## Direction contract

direction: inherits DESIGN.md
