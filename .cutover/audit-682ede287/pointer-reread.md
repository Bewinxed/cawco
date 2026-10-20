# Pointer re-read of the 682ede287 audit's 390 findings

The audit's captures ran before e1344bf51, on a phone page whose pointer was the
host's (`pointer: none`), so no `.touch-hit` area applied and its "under 44 on
390" calls were drawn sizes. These are the same entries re-read by the engine on
the 682ede287 tree with e1344bf51 cherry-picked (871f6e728), in the kit's phone
context: 390×844, `pointer: coarse`, `hover: none` (every read below matched
both), dark.

Read with `bun scripts/probe-kit/surfaces/capture.ts --label=reread --reach
--outline <61 entries>` (surfaces/reach.ts): for every visible control, its
drawn box and how far past each edge a press at its centre line still lands on
it (`document.elementFromPoint`, which a `::after` answers for its element),
against where its area must reach: 0.5px inside the 44×44 box centred on it, or
the midpoint to a nearer neighbour's drawn edge. "hit +a" is the farthest press
past the edge that lands, "need b" where it must. Menu items and nav rows are
also held to 44px drawn height.

The rule is DESIGN.md's 44 Touch Rule, L931 in this tree (the audit cites it as
L929). Input height 36 is L252 (`components.input.height`); buttons are L726
(default 36, `sm` 30, `xs` 24, `lg` 44).

Kinds: `pointer-only` (drop: the area reaches under a finger), `stands` (the
read shows the defect), `recipe` (drawn height against its recipe, pointer
independent), `disabled` (the control is disabled in that state: the kit Button
sets `disabled:pointer-events-none`, button.svelte:12, so its `::after` takes no
press and its area cannot be read until it is enabled).

## Control heights and trailing controls on 390

- disabled: config-accounts-key-sent Continue drawn 87x36, `::after` 84.9x44 pointer-events none
- pointer-only: config-accounts-key-sent Back drawn 60.5x36, hit at +4.5 up / +3.5 down, need 4 / 4
- pointer-only: config-accounts-key-sent Cancel drawn 73x36, hit at +4.5 up / +3.5 down, need 4 / 4
- recipe: config-accounts-key-sent Back, Continue, Cancel drawn 36 vs default 36 (L726): meets it
- stands: config-accounts-rest Routing link drawn 60x17, no `::after`, hit at +1 up / +0 down, need 12.5 / 6
- pointer-only: config-accounts-rest account rows (the chevron is the row) drawn 304x43, hit at +0.5 up / +0 down, need 0.5 / 0.5
- pointer-only: config-accounts-routing strategy segments drawn 91x32 and 71x32, hit at +6.5 up / +5.5 down, need 6 / 6
- pointer-only: config-accounts-second ⋯ (More) drawn 36x36, `::after` 44x44, hit at +4.5 / +3.5 / +4.5 / +3.5, need 3.5 / 4 / 4 / 2.5
- stands: config-accounts-second Looks swatches drawn 25x25, `::after` 44x44, each area meets its right neighbour's 0.5px past its edge, not at the 5.5px midpoint (Violet, last, reaches +9 of 9.5): the areas overlap, `--hit-gap-x` not applied
- stands: config-accounts-second "Stop placing new work past" input drawn 64x30, no `::after`, hit at +0.5 up / +0 down, need 7 / 7
- recipe: config-accounts-second "Stop placing new work past" input drawn 30 vs 36 (L252)
- disabled: config-accounts-sign-in Done drawn 54.5x30, `::after` pointer-events none
- stands: config-accounts-sign-in Code field drawn 274.5x30, no `::after`, hit at +0 up / +0 down, need 5.5 / 7
- recipe: config-accounts-sign-in Code field drawn 30 vs 36 (L252)
- pointer-only: config-cli-tools-rest Reinstall ghost drawn 66x24, hit at +10.5 up / +9.5 down, need 10 / 10
- recipe: config-cli-tools-rest Reinstall ghost drawn 24 vs `xs` 24 (L726): meets it
- pointer-only: config-connections-rest ⋯ (More for feed) drawn 30x30, hit at +7.5 / +6.5 each axis, need 7
- stands: config-connections-rest trailing cluster drawn at x145–175 under the row's text, not at the trailing edge (x347)
- pointer-only: config-delegate-types-editor effort segments drawn 41–67x30, hit at +7.5 up / +6.5 down, need 5 / 7
- stands: config-delegate-types-editor effort segments wrap: "max" drawn on a second row at y674.5 under "Unset" at y642.5
- pointer-only: config-delegate-types-rest ⋯ (More for <type>) drawn 30x30, hit at +7.5 / +6.5, need 7
- stands: config-delegate-types-rest ⋯ drawn at x80–110 under each description, not at the trailing edge
- pointer-only: config-hooks-editor Create on 3 machines drawn 164x36, hit at +4.5 up / +3.5 down, need 4 / 4
- stands: config-hooks-editor footer wraps: Cancel drawn at y754, Create at y797 under it; Cancel's area hit at +2 down, need 3.5
- pointer-only: config-hooks-editor Event select drawn 162x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: config-hooks-editor Event select drawn 30 vs `sm` 30 (L726): meets it
- stands: config-hooks-editor matcher chips (Bash, Edit, Write, Edit|Write) drawn 50–98x23, no `::after`, hit at +0.5 up / +0 down, need 10.5 / 10.5
- stands: config-hooks-editor handler segments (Command, HTTP, MCP tool, Prompt, Agent) drawn 52–81x30, `::after` clipped by its scroller (overflow auto), hit at +0 up / +0 down, need 7 / 7
- stands: config-hooks-editor text inputs drawn 304x36 and 280x36, no `::after`, hit at +0.5 up / +0 down, need 4 / 4
- pointer-only: config-hooks-hook ⋯ (More) drawn 36x36, hit at +4.5 / +3.5, need 4
- pointer-only: config-hooks-rest machines chip drawn 89x24, hit at +10.5 up / +9.5 down, need 10; switch drawn 32x18.5, hit at +6.5 / +5.5 sideways, +13.5 / +12.5 vertically, need 6 / 13; ⋯ drawn 30x30, hit at +7.5 / +6.5, need 7
- stands: config-hooks-rest chip, switch and ⋯ drawn at x80–259 under the text, not at the trailing edge
- pointer-only: config-mcp-oauth-return "Back to MCP servers" drawn 157.5x36, hit at +4.5 up / +3.5 down, need 4 / 4
- stands: config-mcp-rest ⋯ (More for tray-docs) drawn x363–393, 3px past the 390 viewport; the cluster wraps under the text
- pointer-only: config-mcp-rest Sync all drawn 101x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: config-mcp-rest Sync all drawn 30 vs `sm` 30 (L726): meets it
- pointer-only: config-memory-editor Compare drawn 78x30, hit at +7.5 up / +6.5 down, need 7 / 7
- stands: config-memory-filtered filter field drawn 256x36, no `::after`, hit at +0.5 up / +0 down, need 4 / 4
- recipe: config-memory-filtered filter field drawn 36 vs 36 (L252): meets it; its 256px width (not full) stands as layout
- pointer-only: config-memory-new ⋯ (More for models/claude-opus-5-5.md) drawn 30x30, hit at +7.5 / +6.5, need 7
- pointer-only: config-memory-rest machines chip drawn 89x24, hit at +10.5 / +9.5, need 10; ⋯ drawn 30x30, hit at +7.5 / +6.5, need 7
- stands: config-memory-new, config-memory-rest chip and ⋯ drawn at x80–229 under the text, not at the trailing edge
- pointer-only: config-models-rest switch drawn 32x18.5, hit at +6.5 / +5.5 sideways, +13.5 / +12.5 vertically, need 6 / 13
- pointer-only: config-phone-rest Send test push drawn 109x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: config-phone-rest Send test push drawn 30 vs `sm` 30 (L726): meets it
- pointer-only: config-rules-rest switch drawn 32x18.5, hit at +13.5 / +12.5 vertically, need 13; ⋯ drawn 30x30, hit at +7.5 / +6.5, need 7
- stands: config-rules-rest switch and ⋯ drawn at x80–156 under the text, not at the trailing edge
- disabled: config-skills-fetch "Fetch skill" (the popover's) drawn 91.5x36, `::after` pointer-events none
- pointer-only: config-skills-rest machines chip drawn 89x24, hit at +10.5 / +9.5, need 10; switch hit at +13.5 / +12.5, need 13; ⋯ drawn 30x30, hit at +7.5 / +6.5, need 7
- stands: config-skills-rest chip, switch and ⋯ drawn at x80–259 under the text, not at the trailing edge
- disabled: config-subagents-rest Push to machines drawn 139x36, `::after` pointer-events none
- pointer-only: config-updates-rest Check for updates drawn 131x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: config-updates-rest Check for updates drawn 30 vs `sm` 30 (L726): meets it
- stands: decisions-graph Zoom out and Zoom in drawn 44x44 at y821.5–865.5 under the view bar (y780–830): a press 0.5px above each lands on the view bar, the bar covering the controls' top 8.5px
- pointer-only: jump-open session rows (the chevron is the row) drawn 354x44, nav rows at 44
- pointer-only: new-session-account footer Cancel drawn 73x36 and Start session 110x36, hit at +4.5 up / +3.5 down, need 4 / 4
- pointer-only: new-session-browse Use this folder drawn 326x44 at y791–835, inside the viewport, a press on it lands on it
- pointer-only: new-session-location Browse drawn 91x44
- stands: project-new suggestion chips drawn 173x30 and 176x30, hit at +7.5 up / +6 down, need 7 / 7: the chip row below's area starts 6.5px down, 0.5px short of the midpoint
- pointer-only: project-rest and board-new-task task pick boxes drawn 16x16, `::after` 44x44, hit at +14.5 / +13.5, need 14
- stands: session-attached attachment ✕ (Remove chip-notes.txt) drawn 20x20, `::after` 27x27, clipped by its scroller (overflow auto), hit at +4 / +3, need 12
- pointer-only: session-delegate Not now drawn 74x30, hit at +7.5 up / +6.5 down, need 7 / 7
- stands: session-move-ask Details drawn 56x25, no `::after`, hit at +0.5 up / +0 down, need 9.5 / 5.5
- stands: session-question "Other" option drawn 346x30, `::after` 344x44, hit at +3 down, need 5.5 (Answer's row below takes the press)
- disabled: session-question Answer drawn 121.5x30, `::after` pointer-events none
- recipe: session-question Answer drawn 30 vs `sm` 30 (L726): meets it
- pointer-only: session-run-block Not now drawn 74x30, hit at +7.5 up / +6.5 down, need 7 / 7
- stands: task-failed "‹ cawco" back drawn 85.5x30, its area clipped by the project page (overflow hidden/auto), hit at +0.5 up, need 7
- stands: task-open "Add a to-do" field drawn 317x30, no `::after`, hit at +0.5 up / +0 down, need 4 / 7
- recipe: task-open "Add a to-do" field drawn 30 vs 36 (L252)
- disabled: task-open Add to-do button drawn 30x30, `::after` pointer-events none
- pointer-only: task-review Approve → Done drawn 124x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: task-review Approve → Done drawn 30 vs `sm` 30 (L726): meets it
- pointer-only: usage-project Set budget and Set the attempt limit drawn 43.5x30, hit at +7.5 up / +6.5 down, need 7 / 7
- recipe: usage-project Set buttons drawn 30 vs `sm` 30 (L726): meets it
- not read: views-canvas coral "+" (x337–371, y744–778): no control stands in that region at 390 on this tree

## Blocking

- stands: config-cli-tools-rest table drawn 606px wide in its 304px container (`table-container` 43–347, `table` 43–649): the last columns sit off the card, scrolled
- stands: new-session-machines-pair first-prompt field drawn x17–417 (400 wide) in the 390 sheet, 27px past its right edge
- stands: pairing-start-failed dialog drawn x16–496 (480 wide) in the 390 viewport, 106px past it, not a bottom sheet
- stands: region-failed-tabs the tabs' failure region drawn 0,0 390x473, over the top bar (0,0 390x44) and its burger (-1,4 44x44)
- stands: views-decision-page the note field drawn at y844 and "I'm done picking" at y854, at and past the 844 viewport's bottom, under the view bar (y780–830)
- stands: views-routines block head drawn 354 wide, but the table's head cells end at x197 (State 39, Routine 88, Actions 52 of 354) and the Routine cell's 88px cuts its 95px sub-line
- stands: workflows-graph-step (1440 light) chosen harness chip "claude" drawn 63x36, text contrast 1.27:1 on its fill
