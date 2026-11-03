---
target: the setup page stage list (Setup.svelte)
total_score: 30
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/home/bewinxed/.worktrees/cockpit-e84ad99c/apps/dashboard/src/lib/cawco/decisions/host/Setup.svelte"
target_fingerprint: "sha256:6ac7f1b9c7e36dedd6655cf7ca9721ae2a44defb397708ec706022d659ee33bb"
target_path: /home/bewinxed/.worktrees/cockpit-e84ad99c/apps/dashboard/src/lib/cawco/decisions/host/Setup.svelte
timestamp: 2026-11-03T17-28-28Z
slug: src-lib-cawco-decisions-host-setup-svelte
---
⚠️ DEGRADED: single-context (no sub-agent tool is exposed in this session; the one delegate it may start is `browser`, which drives the live dashboard at :3455 and cannot reach this workspace's dev server on :5181, so Assessment A was written and saved before the detector ran, in this context)

Target: `apps/dashboard/src/lib/cawco/decisions/host/Setup.svelte` and its stage list (`setup/SetupStages.svelte`), drawn by the bench `/dev/setup-page` in both drawings (`?stages=reminders`, the default, and `?stages=notion`) and both groupings (`?groups=document`, the default, and `?groups=cards`). Read at 390 (touch), 680 and 1440, day and night, with the PR team's eight stages, twelve stages with long names, and one.

## Design Health Score (the Reminders drawing on the document page, the recommended pair)

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Every change is kept as it is made, but nothing on the page says a change was kept or failed to keep (the bridge's `set` result is not drawn). |
| 2 | Match System / Real World | 3 | The kinds are the board's own words; "What the board does with it" heads the kind menu. A stage named for its kind reads its name twice ("Done … Done"). |
| 3 | User Control and Freedom | 3 | Remove takes two presses, Escape backs out, a removed stage waits under the list with Add back. No undo of a rename beyond retyping. |
| 4 | Consistency and Standards | 4 | One grid, one mark size and treatment, one 30px control per column, 44px rows; Apple's edit-mode list (minus, icon, name, value, reorder) on the house's own controls. |
| 5 | Error Prevention | 3 | An empty name shows the placeholder "New stage"; nothing stops two stages sharing a name. |
| 6 | Recognition Rather Than Recall | 4 | Kind, look and order are all visible on the row at rest, with the pop-up's sort glyph saying what opens a choice. |
| 7 | Flexibility and Efficiency | 3 | Drag or arrow keys move a stage; Tab walks remove, look, name, kind, handle. No shortcut adds a stage. |
| 8 | Aesthetic and Minimalist Design | 3 | Five parts a row is the most the row can hold at 390: names past about 14 characters give way to an ellipsis on a phone. |
| 9 | Error Recovery | 2 | A refused keep (the hub down) says nothing; the page's Send carries the failure, the rows don't. |
| 10 | Help and Documentation | 2 | What each kind does on the board is only its word; the menu names it but doesn't explain it. |
| **Total** | | **30/40** | **Good** |

## Design Specificity Verdict

**LLM assessment.** The rows are recognisably two products' own patterns rather than an invented editor: Reminders' edit mode (minus, coloured mark, name, trailing value, reorder lines) and Notion's status options (kind heads with their own add, a handle, the option, an open chevron). What makes them CawCo's is that both are drawn from the board's own column head (the stage's Solar glyph in its section hue in the raised 26px tile, the same as `TaskColumn`) and the house's controls (ghost 30px symbol buttons, the kit's menus, the field that only takes an edge with the caret). The earlier mockups' fault, form fields at rest and a different height per tile, is gone in both. The desk view now reads as a page: the stages and the types they run stand side by side under the aim, their tops on one line.

## Overall Impression

The person asked for rows that read as content and edit where they stand, on one grid. Both drawings do. The Reminders one keeps the board's order and shows everything at rest; its cost is width on a phone. The Notion one is calmer per row and gives every kind its own add, but it re-sorts the stages by kind, which moves "Your call" after "Waiting on reply" on the PR team's board.

## What's Working

- One grid measured, not asserted: every stage row 44px, every mark 26×26 at one x, every glyph 16×16, every control 30×30 in its own column, at 390, 680 and 1440 (figures in the run record).
- The name is text at rest and a field with the caret, with no edge until then, so the list reads as a list and not as a form.
- The delegate types take the stage list's grid, wear the mark of the stage that runs them, and every row has its brief, so every row is two lines.

## Priority Issues

- **[P1] Long names give way on a phone in the Reminders drawing.** Five parts a row leave the name 138px at 390 (124px inside a card); "Waiting on the hiring manager's reply" reads "Waiting on the h…". Fix: keep the grid and the ellipsis, and let the field show the whole name when it has the caret (it does: it is the field); in cards, step the card's inner pad down to `space-3` under the field-group width (done), which buys 14px. Suggested command: `/impeccable adapt`.
- **[P1] The kind trigger's hover fill touched its word** once its pad was cut to fit the phone. Fix: the kit button's `more` pad at `space-2` (done): the fill clears the word by 7px, the trigger is 101.7px in every row. Suggested command: `/impeccable polish`.
- **[P2] The Notion drawing re-sorts the board.** Grouping by kind puts the stages in the kinds' fixed order, so Caw's draft order (Your call before Sent) is not what the board will show. This is the option's cost, stated on its card. Suggested command: none (a choice for the person).
- **[P2] A stage named for its kind reads twice** ("Done" with "Done", "Dropped" with "Dropped") in the Reminders drawing. The value is the pop-up's, and hiding it for two rows would break the column. Kept; said on the card. Suggested command: `/impeccable clarify`.
- **[P2] A refused keep is silent on the row.** Suggested command: `/impeccable harden` (outside this brief: the page's bridge, not the rows).

## Persona Red Flags

**The operator on a phone, between meetings (project persona):** at 390 every control is a 30px drawn box with the house's 44px touch area; a drag needs the handle, not the row, so a scroll never moves a stage. Long names cut to an ellipsis in the Reminders drawing.

**Alex (power user):** the arrow keys move a stage on its handle; Escape backs out of Remove. Adding a stage puts it at the end as Active, then it must be moved; the Notion drawing's per-kind add lands it where it belongs.

**Sam (screen reader, keyboard only):** every control has its name ("Remove Inbox…", "Look of Inbox", "Stage 1 name", "Kind of Inbox", "Move Inbox, 1 of 8" with role description "draggable"); Notion's rows say the kind head they stand under (`aria-describedby`). No visible labels.

## Minor Observations

- The handle is the house order list's drag dots, not Apple's three lines; the house wins (accounts/OrderList.svelte).
- The kind menu carries the stage's hook line ("Runs the researcher") under the kinds, the only place it is shown on the stage itself; the types list says it by the mark.

## Questions to Consider

- Should the board's order be free (Reminders) or follow the kinds (Notion)? That is the real difference between the two drawings.
- Do the frames of the cards grouping earn the 36px they take from every row on a phone?

## Assessment B (detector and browser evidence, run after A was saved)

- `impeccable detect --json` over `Setup.svelte`, `setup/`, `routes/dev/setup-page`, `SetupPagePreview.svelte`: `[]`, exit 0.
- Overlay (`impeccable live-server --background`, `detect.js` injected by a headless Chromium into `/dev/setup-page` at 390 touch and 1440, both drawings and both groupings): one finding on every view, `cream-palette`: "cream/beige page background rgb(247, 244, 238)". A false positive for this run: it is DESIGN.md's own page surface (`surface-page`, "Warm low-chroma paper and roost neutrals", the owner's locked palette), untouched by this change. The live server was stopped with `live-server stop --keep-inject`.
- Synthesis: the detector agrees with A that nothing mechanical is wrong on the rows; the grid figures came from the probe in the run record, not from the detector.
