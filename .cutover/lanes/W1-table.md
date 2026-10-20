# W1-table: the kit Table (Table, TableHeader, TableBody, TableRow, TableHead, TableCell)

Wave 2, one kit part. Base 682ede287. Site lines below are the sites' lines at 682ede287 (W1-table-sites.md).

## Skills
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report ui-observer (observer.browser.js in the playwright-core session) and interface-craft (Design Critique). No transition, keyframes or skeleton in the part or its sites, so emil-design-eng and transitions-dev were not loaded.

## Rules followed
- better-layout, Logical properties: the kit's `text-left`, `pr-0` and `left-0` are `text-start`, `pe`/none and `start-0`.
- better-layout, Plan for growth and clipping: heights on cells act as a floor (a table cell's `height`); the phone card's first track is `minmax(0, 1fr)`, not `1fr`.
- better-layout, Hold structure until it breaks / container queries: column folds read their own table's width (`@container/table`), not the viewport.
- better-layout, Content bleeds, controls float: the sticky band holds over rows scrolling under it.
- better-ui, Shadows for elevation, borders for structure: rows and cells keep hairlines, no new shadows.
- better-ui, the same detail done two ways is a finding: the presence dot in ToolMatrix now draws as UpdateTable's (DESIGN.md Machine row).
- defensive-css: a dead `border-current` beside `border-none` removed; `min-width: 0` card track.
- DESIGN.md, Density ("a 44px row pitch, a 32px header band"), ledger-header / ledger-row component tokens, The Tabular Figure Rule ("Tables get tabular numerals by default"), The Role, Not Size Rule, Fleet board ("Under 640px each row becomes a two-line card").

## Variant table
| Variant (part prop) | Role | DESIGN.md line | Sites |
| --- | --- | --- | --- |
| Table `stacks` (`phone`, `narrow`) | rows become cards by the table's own width (`@container/table`), one recipe (table.svelte `tableCards`) at each tier: table, body blocks, header hidden, card rows a grid on `--card-cols`, card cells blocks. `phone`: under a 640px ledger; `narrow`: under 424px, where the runs ledger's Result floor beside narrow When and Outcome no longer fits | Layout, Fleet board: "Under 640px each row becomes a two-line card" | TaskTable:227, UpdateTable:43, ProjectSpend:461 (`phone`); RoutineDetail runs ledger (`narrow`) |
| Table `stickyBand` | the band holds while the block around it scrolls (container clips, not scrolls) | Elevation & Depth: the header band is frame; Density "a 32px header band" | ViewRoutines routines and sources ledgers, ActionsTable |
| Table container `@container/table` | a column folds by its own table's width | Layout, Breakpoints | every table |
| TableHeader `section` | a band that heads its own body: on a phone its first head titles the section | Fleet board card (the band stays as the group's title) | ProjectSpend:466, :566 |
| TableHeader (stacks, no section) | column heads hidden where rows are cards | Fleet board card | TaskTable:231, UpdateTable:44 |
| TableBody (stacks) | the cards' block | Fleet board card | TaskTable:298, UpdateTable:62, ProjectSpend:491, :591, :640 |
| TableRow `stacks` / `stacks-ruled` / `picks-stacks` | a card on a phone: grid on the caller's `--card-cols`, centred | Fleet board card | TaskTable:304, UpdateTable:46, :67, ProjectSpend:467-675 |
| TableHead `band` | ledger header band: column head role (label, caps, tracking-caps), muted, 32px, surface-band, sticky top 0 | frontmatter ledger-header; Typography, Column head; Density | ActionsTable:94-107, RoutineDetail:173-184, ProjectSpend:469-584, ViewRoutines:922-989, ViewTable:66 |
| TableHead `matrix-*` | matrix heads: content height, top edge, label role | The Role, Not Size Rule | ToolMatrix:305, :314, :366, UpdateTable:50-74 |
| TableHead/TableCell `edge="end"` | a column on its end edge: a figure's, a row's trailing action | Tabular Figure Rule (figures in columns) | TaskTable:243, :244, :312, :321, ProjectSpend Spent/Last heads and cells, ViewRoutines:803 |
| TableHead/TableCell `fold` (`tasks-labels`, `tasks-created`, `tasks-todos`, `tasks-id`, `runs-took`, `measure`) | where a column folds away, by its own table's width, so a ledger fits its place and never scrolls sideways; each ledger's thresholds are its main column's floor (`c-ledger-title-min`) plus the columns standing beside it. A fold that holds in the card names the card tier too, and a cell applies its fold after the card's classes | Fleet board ("fixed table layout … the name column takes what the fixed columns leave"); tokens c-ledger-title-min (14rem), c-task-col-*-w, c-ledger-when-w, c-ledger-outcome-w, c-ledger-took-w and their `-narrow`, c-block-routines (34rem); container keys `table-670px`, `table-766px`, `table-878px`, `table-1102px`, `table-424px`, `table-496px`, `table-576px`, `table-34rem`, `table-400px` (RoutineDetail's lead padding) | TaskTable heads and cells via FOLD (Labels, Created, To-dos, Id); RoutineDetail:181, :221 (runs-took); ViewRoutines:777, :790, :934, :939 (measure) |
| TableCell `list`, `list-opens`, `ledger`, `ledger-stacks`, `ledger-picks-stacks`, `view`, `view-lead` | a ledger row's cell at the 44px pitch, tabular | frontmatter ledger-row; Density; Tabular Figure Rule | every `h-c-btn-h-lg` / `num` site |
| TableCell `matrix`, `matrix-stacks-under` | a matrix cell whose words wrap | (matrix of tools and updates) | ToolMatrix:394, UpdateTable:114 |

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:300 Table (default; `border-collapse text-left` removed) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:227 Table stacks — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:43 Table stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:461 Table stacks — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:231 TableHeader (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:44 TableHeader (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:466 TableHeader section — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:566 TableHeader section — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:298 TableBody (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableBody (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:491 TableBody (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:591 TableBody (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:640 TableBody (stacks) — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:302 TableRow (default; `align-top` moved to the matrix heads) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:304 TableRow picks-stacks (card grid on `--card-cols`) — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:46 TableRow (default; the hidden header row's phone grid was dead) — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:67 TableRow stacks-ruled — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:467 TableRow band (in TableHeader section) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:495 TableRow stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:534 TableRow stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:567 TableRow band (in TableHeader section) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:595 TableRow stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:644 TableRow stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:675 TableRow stacks — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:305 TableHead matrix-corner-pinned — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:314 TableHead matrix-column-wide-plain — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:366 TableHead matrix-row-pinned — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:94 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:97 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:102 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:107 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:173 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:177 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:181 TableHead band fold="runs-took" — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:184 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:243 TableHead band edge="end" fold="desk" — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:244 TableHead band edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:50 TableHead matrix-corner — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:53 TableHead matrix-column — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:56 TableHead matrix-column-wide — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:74 TableHead matrix-row — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:469 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:473 TableHead band (section hides it on a phone) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:478 TableHead band edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:484 TableHead band edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:569 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:573 TableHead band (section hides it on a phone) — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:578 TableHead band edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:584 TableHead band edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:922 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:928 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:934 TableHead band fold="measure" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:939 TableHead band fold="measure" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:944 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:977 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:983 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:989 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:66 TableHead band — done
kit-swap: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:394 TableCell matrix — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:122 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:133 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:151 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:159 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:200 TableCell ledger — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:213 TableCell ledger — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:221 TableCell ledger fold="runs-took" — done
kit-swap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:229 TableCell ledger — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:312 TableCell ledger-picks-stacks edge="end" fold="desk" — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:315 TableCell ledger-picks-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:317 TableCell ledger-picks-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:319 TableCell ledger-picks-stacks fold="tasks-labels" (its head too) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:321 TableCell ledger-picks-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:323 TableCell ledger-picks-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:114 TableCell matrix-stacks-under — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:500 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:512 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:526 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:539 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:559 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:600 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:618 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:627 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:633 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:649 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:658 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:663 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:669 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:680 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:689 TableCell ledger-stacks — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:694 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:700 TableCell ledger-stacks edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:722 TableCell list-opens — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:734 TableCell list-opens — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:777 TableCell list-opens fold="measure" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:790 TableCell list-opens fold="measure" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:803 TableCell list-opens edge="end" — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1005 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1014 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1030 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1056 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1065 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1082 TableCell list — done
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:79 TableCell view / view-lead — done
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:80 TableCell view-lead (its words wrap) — done

## Removed
removed: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:300 `border-collapse text-left` on Table — Preflight's `table { border-collapse: collapse }` (tailwindcss 4.3.3 preflight.css:171) already holds, th sets `text-start`, td inherits start
removed: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:43 `border-collapse text-start` on Table — the same Preflight rule and kit default
removed: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:302 `align-top` on the header TableRow — dead: TableHead's base `align-middle` on every th outranks a tr's vertical-align (td/th `vertical-align: inherit` only without their own); top-alignment now lives on the matrix head variants
removed: apps/dashboard/src/lib/components/ui/table/table-head.svelte:6 base `h-12` (48px, off the ladder) and every site's `h-auto` that cancelled it (ToolMatrix:305, :314, :366; UpdateTable:50, :53, :56, :74) — a fixed height propped up then knocked down; the band variant owns the band's 32px (DESIGN.md Density)
removed: apps/dashboard/src/lib/components/ui/table/table-head.svelte:6 and table-cell.svelte:6 `[&:has([role=checkbox])]:pr-0`, and the `pr-space-3` restores in `caps`, `band` and `ledger-picks-stacks` — the base took the end padding off a tick's cell and the only variants that held a tick put it back
removed: apps/dashboard/src/lib/components/ui/table/table-cell.svelte:18 and :27 `max-phone:border-current` beside `max-phone:border-none` — a colour on a border with no style draws nothing (the "border-current that has no effect" item)
removed: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:815 `border-current` beside `border-none` on the row-ask fieldset — the same
removed: apps/dashboard/src/lib/components/ui/table/table-head.svelte `caps` and `caps-strong` variants — every caps site was the band (caps + the band's height); `caps-strong` had no caller
removed: apps/dashboard/src/lib/components/ui/table/table.svelte `spacing: gap` and `scrollClass` — no caller (L04's gap: its one caller became `layout="ledger"`)
removed: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:312 `max-phone:@max-decisions-900px:hidden` — a duplicate of the column's own fold; and `SPECIAL_CELLS` (TaskTable.svelte:83), which only fed the per-column class branches
removed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:519, :526, :553, :559, :627, :633, :663, :669, :694, :700 `max-phone:text-start` — dead: in the card every cell sits in an `auto` track its own content sizes, so its alignment has no room to act
removed: every site `num` on TableCell (ActionsTable, RoutineDetail, ProjectSpend) — the ledger, list and view cells carry `num` themselves (DESIGN.md, Tabular Figure Rule: "Tables get tabular numerals by default"; the role's `font` shorthand resets the table's)
removed: every site `align-middle` on TableCell (ActionsTable:122-159) — the cell's base
removed: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:908 `@container/routines-ledger` — every query that read it reads the table's own container (`/table`) now: the fold span (ViewRoutines.svelte:753) and RoutineDetail.svelte:116

## Tokens
token: --c-ledger-band-h 32px — a ledger's header band (DESIGN.md Density "a 32px header band", ledger-header height); the band used `c-toolbar-ctl`, whose role is a toolbar's controls
token: --c-ledger-row-h 44px — a ledger's row pitch (DESIGN.md Density "a 44px row pitch", ledger-row height); the rows used `c-btn-h-lg`, a button's height
token: --c-ledger-count-w 8rem — a count and its noun ("12 attempts"), Usage's project spend; was a literal `--col-count: 8rem` in ProjectSpend's style attribute
token: --c-ledger-usd-w 6rem — a month's spend column, Usage's project spend; was a literal `--col-usd: 6rem` (its Last column, `--col-last: 6rem`, is an age and takes `c-ledger-when-w`)
token: --c-matrix-col-w 14rem — a matrix's wide column floor (Command-line tools, Updates); was `min-w-56` in the kit
token: --c-ledger-title-min 14rem — a ledger title's least width, the column the ledger exists for (about 30 characters of the label role); the task and runs ledgers' fold widths are this plus their columns (build-tokens.ts CONTAINERS). No token held the role (`c-view-lead-min` is a generated table's lead, 9rem). The value is the parent's call: the 224px the 766px read gave the title
token: --c-ledger-when-w-narrow and --c-ledger-outcome-w-narrow — values unchanged (4.5rem, 8rem); descriptions reworded from "in a ledger under 400px" to "in a runs ledger under 496px, where Result's floor … no longer fits (table-496px); under 424px the runs are cards"
All five are in design/tokens/cawco.tokens.json beside c-ledger-took-w; `bun run tokens` regenerated theme.css and tokens.css (committed as written). Its other outputs (apps/apple/.../Tokens.swift, apps/dashboard/src/lib/tokens/tokens.ts, packages/hub/skills/decision-page/kit/tokens.css) are outside this lane's list and were restored; integration reruns `bun run tokens`.

## Theme additions
None: no `@utility`, `@custom-variant` or component rule. The new spacing keys (`--spacing-c-ledger-*`, `--spacing-c-matrix-col-w`) are generated by `bun run tokens`.

## Compiled check
`@tailwindcss/node` 4.3.3 `compile()` over apps/dashboard/src/app.css, `build()` of the new classes:
```
.h-c-ledger-band-h { height: var(--c-ledger-band-h); }
.h-c-ledger-row-h { height: var(--c-ledger-row-h); }
.w-c-ledger-count-w { width: var(--c-ledger-count-w); }
.w-c-ledger-usd-w { width: var(--c-ledger-usd-w); }
.min-w-c-matrix-col-w { min-width: var(--c-matrix-col-w); }
.\@container\/table { container-type: inline-size; container-name: table; }
.\@max-table-1102px\/table\:hidden { display: none; }    (@container table (width < 1102px))
.\@max-table-878px\/table\:hidden { display: none; }     (@container table (width < 878px))
.phone\:\@max-table-766px\/table\:hidden { display: none; }   (@media (width >= 640px) { @container table (width < 766px) })
.phone\:\@max-table-670px\/table\:hidden { display: none; }   (@media (width >= 640px) { @container table (width < 670px) })
.\@max-table-34rem\/table\:hidden { display: none; }      (@container table (width < 34rem))
.\@max-table-400px\/table\:hidden { display: none; }      (@container table (width < 400px))
.\@table-400px\/table\:ps-\(--detail-lead\) { padding-inline-start: var(--detail-lead); }   (@container table (width >= 400px))
@container table (width < 640px) { .\@max-phone\/table\:block { display: block; } }
@container table (width < 424px) { .\@max-table-424px\/table\:block { display: block; } … .\@max-table-424px\/table\:grid { display: grid; } … .\@max-table-424px\/table\:hidden { display: none; } }
@container table (width < 576px) { .\@max-table-576px\/table\:hidden { display: none; } }
@container table (width < 496px) { .\@max-table-496px\/table\:w-c-ledger-when-w-narrow { width: var(--c-ledger-when-w-narrow); } }
@container table (width >= 640px) { @container table (width < 670px) { .\@phone\/table\:\@max-table-670px\/table\:hidden { display: none; } } }
(the card recipe's `grid-cols-(--card-cols)`, `*:flex` and `[&_th:not(:first-child)]:hidden` are the same rules under each tier's `@container table (width < …)`)
```
Which wins: in a section header in the card the `th:not(:first-child)` rule (0,2,1) hides the column heads; nothing else sets a th's display there. A card cell's `w-auto` and `block` follow the site's `w-*` and the table display in the sheet at equal specificity, so the card wins under its tier. Within the same tier a fold and the card's `block` are one tailwind-merge group, and the cell applies its fold last, so the fold wins (measured: Labels, Created and Took `none` in the cards). Scratch folder deleted.

## Rendered check
Dev server (`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev`), one playwright-core session, cached chromium_headless_shell-1248, `domcontentloaded`, 1440×900 and 390×844. `/motion/updates` renders UpdateTable; the other consumers need the hub, so a scratch route (deleted, never committed) rendered TaskTable with ticks, RoutineDetail at 40rem and 22rem, and ActionsTable in a 160px scroller.
- Band (TaskTable th, 1440): `position: sticky; top: 0px; height: 32px; background-color: oklch(0.957 0.009 84)` (surface-band), `text-transform: uppercase; letter-spacing: 0.78px` (0.06em of 13px), `font-size: 13px; font-weight: 500`, `padding-inline-start: 11px` — DESIGN.md ledger-header 32px, 0 11px, column head 500/13px/0.06em.
- Sticky holds: ActionsTable (stickyBand) in the 160px scroller, scrollTop 120: band top 1417 = scroller top 1417 (1440); 1428 = 1428 (390); container `overflow-x: clip; overflow-y: visible`. Before the fix it read th top 1297 against scroller top 1417, the container `overflow: auto` on both axes.
- Rows: every TaskTable cell 44px at 1440; ActionsTable list cell `height: 44px; padding-inline-start: 11px; font-size: 12px; font-variant-numeric: tabular-nums; vertical-align: middle` — ledger-row 44px, 0 11px, meta.
- edge: TaskTable Created and Updated head and cells `text-align: end`, the rest `start`.
- task ledger folds: see `## Task ledger fit (rendered)`. fold narrow: RoutineDetail runs in a 328px table: Took `none`, When 72px, Outcome 128px; in a 616px table: 96 / 176 / 80 / Result 264; at 399px and 400px see `## Runs ledger at 399 and 400`.
- stacks (390): table `block`, thead `none`, tbody `block`, row `grid` `16px 21px 30px 223px 14px` centred, cells `block`. UpdateTable (390): table `block`, thead `none`, row `grid` `308px 36px` `center`, Update cell `1 / -1`, `white-space: normal`; Running `nowrap`.
- matrix heads (UpdateTable 1440): `vertical-align: top` on all three, content height 38.7px; wide head `min-width: 224px`.
- ui-observer (observer.browser.js) on the scratch probes: horizontal-overflow / text-clipped only on the task title's `truncate` span and the run Result's `truncate` link (intended ellipsis, The Truncate Inside Rule) and the sr-only head; escapes-viewport only from the scratch's fixed 40rem section at 390.
- Not rendered: ViewRoutines, ProjectSpend, ToolMatrix, ViewTable need the hub's data — routes `/project/<id>` (Routines, Tasks and Usage blocks), `/usage`, `/config/cli-tools`, a project view with a Table block.

## Design critique (interface-craft) against DESIGN.md
- fixed: apps/dashboard/src/lib/components/ui/table/table-head.svelte:24-33 matrix column heads were `text-meta` (12px/400) — The Role, Not Size Rule: "column heads … are label"; they take the base's label role
- fixed: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:372 the presence dot was 8px `bg-success-9` / `bg-ink-muted/40`, drawn unlike UpdateTable's — DESIGN.md Machine row "a 6px presence dot (green online, orange away, neutral-8 off)"; now `size-(--status-dot-size) rounded-pill bg-presence-online|off`
- fixed: apps/dashboard/src/lib/cawco/ToolMatrix.svelte:314 `gap-1.5` (6px, off the ladder) → `gap-space-2` (7px) — Layout, spacing ladder
- fixed: apps/dashboard/src/lib/components/ui/table/table.svelte stickyBand — the routines ledgers' and ActionsTable's band did not hold (measured above); Density's header band
- fixed: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:181, :221 Took folds by the runs ledger's own width (under 400px, the width its `-narrow` tokens name) rather than the outer routines ledger's, so Result no longer shrinks to ~26px between a 399px and a ~420px outer ledger
- fixed: apps/dashboard/src/lib/components/ui/table/table-cell.svelte base `p-3` (12px, off the ladder) → `px-space-3 py-space-2`; table-head base `px-3` → `px-space-3`, `text-left` → `text-start`
- fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte card columns `1fr auto auto` → `minmax(0, 1fr) auto auto` (defensive-css, grid min-content)
- fixed: apps/dashboard/scripts/build-tokens.ts:273-275 CONTAINERS `routines-ledger-34rem`, `routines-ledger-399px`, `routines-ledger-400px` → `table-34rem`, `table-400px`, by CONTAINERS' own rule ("named by its container; a container with two widths names each by its width"): the container is `/table` now. One key per width: `@max-table-400px` is Tailwind's `width < 400px`, so the 399px twin went (the narrow fold and the `-narrow` widths now switch under 400px, as their tokens say: "in a ledger under 400px"). Readers: table.svelte (fold measure, narrow), ViewRoutines.svelte:753, RoutineDetail.svelte:116, :173, :177, :199, :212. `bun run tokens` rewrote theme.css's `--container-*`; its outputs outside this list were restored
- fixed: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte the task ledger keeps its title at a floor (`c-ledger-title-min`, 224px) at every width from 640px and never scrolls sideways (its fixed columns were 766px in a 640–900px ledger, and a first fold left the title 98px at 640px and 147px at 1025px). Fold order: DESIGN.md ranks no task-ledger columns (its Fleet board line ranks the sessions ledger), so the parent's rule decides — the columns the phone card leaves out go first, Labels then Created; then To-dos, then Id, both of which the card keeps (my call: Id is how a task is referred to, To-dos is its progress, so To-dos goes first). Thresholds, summed from the tokens (build-tokens.ts CONTAINERS): the tick (icon-md + 2 × space-3, 38px), Stage (c-task-col-stage-w, 192px) and Updated (c-task-col-time-w, 112px) always stand, 342px + the floor = 566px, under 640px; Id (104px) shows from 670px, To-dos (96px) from 766px, Created (112px) from 878px, Labels (224px) from 1102px. Id's and To-dos' folds apply only from 640px (`phone:`), so the phone card keeps them. The kit's `desk` and `wide` folds had only this caller and went. Its band computes `position: sticky` (the band variant) but its container still scrolls sideways (`overflow-x: auto`, no `stickyBand`), so it does not hold, as at 682ede287
- fixed: apps/dashboard/scripts/build-tokens.ts CONTAINERS `table-670px`, `table-766px`, `table-878px`, `table-1102px`, each with its sum in a comment, by CONTAINERS' rule (the `table` container, named by width)
- fixed: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte the runs ledger keeps Result, the column it exists for, at `c-ledger-title-min` at every width (at 400px it was left 48px). By the task ledger's derivation (build-tokens.ts CONTAINERS): Took (80px) shows from 96 + 176 + 80 + 224 = 576px (`fold="runs-took"`); When and Outcome take their narrow widths (72px, 128px) under 96 + 176 + 224 = 496px; under 72 + 128 + 224 = 424px each run is a card (`stacks="narrow"`, `--card-cols: auto minmax(0, 1fr)`), its Result across the first line, then When and Outcome
- fixed: apps/dashboard/src/lib/components/ui/table the card is keyed on the table's own width, not the viewport: `stacks` is a tier (`phone`, under a 640px ledger; `narrow`, under 424px) over one recipe (`tableCards`), and every card class in the kit and its sites (TaskTable, UpdateTable, ProjectSpend placement) moved from `max-phone:` to `@max-phone/table:`, so a ledger in a narrow panel on a wide window is a card too. TaskTable and UpdateTable read identically at a 390px phone before and after (below). The task ledger's Id and To-dos folds are guarded `@phone/table:` (the card keeps them) instead of the viewport's `phone:`
- gap: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:162 the runs ledger stays in an `overflow-hidden` rounded frame inside its opened routine, so its band does not hold; holding it would stack a second band under the routines band at the same top — left as is, my call
- gap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:733 CollapsibleTrigger `border-none border-current` (dead `border-current`) is the CollapsibleTrigger lane's site
- (The app.css `!important` gap is closed: the relic gate now runs scripts/relics-check.ts, whose SANCTIONED list carries the five Streamdown/virtua overrides with their reasons.)

## Task ledger fit (rendered)
One playwright-core session, cached chromium_headless_shell-1248, 1600×900 and 390×844 viewports, `domcontentloaded`; a scratch route (deleted) drew TaskTable with ticks, labels and to-dos (every column present) in sections of each width. The floor is 224px. After the card moved to the table's own width, the same session read (1600×900):
```
tasks 639px: fits=true (639/639) | row grid | pick:block id:block title:block stage:block labels:none todos:block created:none updated:block | title 594px floor-ok=true
tasks 640px … 1102px: as below, unchanged
```
The read from before that change:
```
=== 1600x900
640px: container 640 scrollWidth=640 clientWidth=640 fits=true | pick:table-cell id:none title:table-cell stage:table-cell labels:none todos:none created:none updated:table-cell | title 298px floor-ok=true
669px: container 669 scrollWidth=669 clientWidth=669 fits=true | pick:table-cell id:none title:table-cell stage:table-cell labels:none todos:none created:none updated:table-cell | title 327px floor-ok=true
670px: container 670 scrollWidth=670 clientWidth=670 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:none created:none updated:table-cell | title 224px floor-ok=true
765px: container 765 scrollWidth=765 clientWidth=765 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:none created:none updated:table-cell | title 319px floor-ok=true
766px: container 766 scrollWidth=766 clientWidth=766 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:table-cell created:none updated:table-cell | title 224px floor-ok=true
877px: container 877 scrollWidth=877 clientWidth=877 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:table-cell created:none updated:table-cell | title 335px floor-ok=true
878px: container 878 scrollWidth=878 clientWidth=878 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:table-cell created:table-cell updated:table-cell | title 224px floor-ok=true
900px: container 900 scrollWidth=900 clientWidth=900 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:table-cell created:table-cell updated:table-cell | title 246px floor-ok=true
1101px: container 1101 scrollWidth=1101 clientWidth=1101 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:none todos:table-cell created:table-cell updated:table-cell | title 447px floor-ok=true
1102px: container 1102 scrollWidth=1102 clientWidth=1102 fits=true | pick:table-cell id:table-cell title:table-cell stage:table-cell labels:table-cell todos:table-cell created:table-cell updated:table-cell | title 224px floor-ok=true
=== 390x844 (the phone card)
640px: container 640 scrollWidth=640 clientWidth=640 fits=true | pick:block id:block title:block stage:block labels:none todos:block created:none updated:block | title 595px floor-ok=true | row grid
```

## Runs ledger fit (rendered)
Before the fix, the same kind of session read the runs table at 399px and 400px (RoutineDetail in sections 24px wider, its padding and frame borders):
```
table container 399px | When table-cell 72px | Outcome table-cell 128px | Took none 0px | Result table-cell 199px
table container 400px | When table-cell 96px | Outcome table-cell 176px | Took table-cell 80px | Result table-cell 48px
```
After it, one playwright-core session, cached chromium_headless_shell-1248, 1600×900 (a desk window, so the cards below are keyed on the table's own width), RoutineDetail with three runs in sections 24px wider than each table width. The floor is 224px; thresholds 424 (card), 496 (full When and Outcome), 576 (Took):
```
runs 328px: scrollWidth=328 clientWidth=328 fits=true | when:block 37px | outcome:block 258px | took:none 0px | result:block 306px | Result 306px floor-ok=true | card: thead none, row grid "37px 258px", result row 1 / col 1--1, row 51px
runs 423px: scrollWidth=423 clientWidth=423 fits=true | when:block 37px | outcome:block 353px | took:none 0px | result:block 401px | Result 401px floor-ok=true | card: thead none, row grid "37px 353px", result row 1 / col 1--1, row 51px
runs 424px: scrollWidth=424 clientWidth=424 fits=true | when:table-cell 72px | outcome:table-cell 128px | took:none 0px | result:table-cell 224px | Result 224px floor-ok=true
runs 495px: scrollWidth=495 clientWidth=495 fits=true | when:table-cell 72px | outcome:table-cell 128px | took:none 0px | result:table-cell 295px | Result 295px floor-ok=true
runs 496px: scrollWidth=496 clientWidth=496 fits=true | when:table-cell 96px | outcome:table-cell 176px | took:none 0px | result:table-cell 224px | Result 224px floor-ok=true
runs 575px: scrollWidth=575 clientWidth=575 fits=true | when:table-cell 96px | outcome:table-cell 176px | took:none 0px | result:table-cell 303px | Result 303px floor-ok=true
runs 576px: scrollWidth=576 clientWidth=576 fits=true | when:table-cell 96px | outcome:table-cell 176px | took:table-cell 80px | result:table-cell 224px | Result 224px floor-ok=true
runs 616px: scrollWidth=616 clientWidth=616 fits=true | when:table-cell 96px | outcome:table-cell 176px | took:table-cell 80px | result:table-cell 264px | Result 264px floor-ok=true
```

## The card at a 390px phone, before and after the container key
The same probe, at 390×844, on TaskTable (scratch) and UpdateTable (`/motion/updates`), read at f5c4941b7's tree (before) and after; `diff` of the two reads is empty:
```
TaskTable  table block | thead none | row grid cols "16px 21px 30px 223px 14px" 354x55 pad 7px 11px | pick:block@29,19 16x16 id:block@52,28 21x19 title:block@52,7 309x17 stage:block@80,29 30x17 labels:none@0,-62 0x0 todos:block@117,28 223x18 created:none@0,-62 0x0 updated:block@347,29 14x16
UpdateTable table block | thead none | row grid cols "308px 36px" 344x56 pad 0px | th:block@39,0 308x48 td:block@347,7 36x34 td:block@39,48 344x7
```
