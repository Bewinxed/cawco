---
version: 1
slug: "src-lib-cawco-decisions-host-setup-svelte"
primary_target: "src/lib/cawco/decisions/host/Setup.svelte"
related_targets: []
---

# Surface brief: the setup page (decision library `Setup`)

- **Mode:** Operate.
- **Job:** the person reads back Caw's draft of how a new project runs (its name, what it is for, its stages, the delegate types they run), changes what is wrong where it stands, and sends it with one Send that names the project. They arrive two minutes after describing the project, in Caw's Preview tab (380 to 720 wide), the page's own tab, or a phone.
- **States:** the draft as Caw wrote it; the hub's kept edits after a reload; a stage or type removed (waiting under its list with Add back); a stage being renamed; a stage asking to be removed; a stage carried by its handle; one stage; twelve stages with long names; day and night.
- **Widths:** 390 (touch), 680, 1440, 2529. From the desk container width (900px) the stages and the delegate types stand side by side. Under `setup-stages-line` (344px) the Reminders drawing puts each row's kind under its name.
- **Untouched:** the page head (Caw and the name, SetupTitle), the aim's prose field, the Send and its foot, the hub's keys (`aim`, `stages`, `delegates`, `shape`, `name`).
- **Verdict:** scrap the stage tile (fields at rest, rows of different heights); the page's grouping stands.
- **The person's notes (pins 4, 5, 6 on onboarding-design):** the icon and title must not read as form fields or take a whole row (against Apple's HIG); one grid: one icon size and column, one height, one action size in one column, a second line on every row or none; same drawing with or without a delegate type; one icon family, size and treatment; editable at rest without hover, on touch too; options must be real components and established patterns.
- **Options on onboarding-design:** `stage-rest`: reminders (recommended), notion. `setup-groups`: document (recommended), cards.
- **P0/P1 backlog:** P1 long names give way on a phone (kept: the ellipsis, the full name while typing); P1 the kind trigger's fill touching its word (fixed: the kit's `more` pad at space-2). Open: a refused keep is silent on the rows (the page's bridge).

## Direction contract

direction: inherits DESIGN.md
