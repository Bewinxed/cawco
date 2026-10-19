# Lane L44-cawco-views-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer (no bench or stories file renders any of the four, so no rendered-layout read: Not verified).
better-ui rules followed: hover/state only via attributes and variants; nothing transitioned; no `all`. better-layout rules followed: `min-w-0`/`shrink`/`basis` on the stat flex item so it wraps and never overflows; the board's columns keep a token floor and ceiling; the table's lead cell keeps a token minimum.

4 files, all done.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| canvas/TaskNode.svelte | node width literal → token; handle rule → utilities on the four `<Handle class>`; `<style>` deleted | none | none | none |
| openui/ViewBoard.svelte | column bounds literal → tokens | none | none | none |
| openui/ViewStat.svelte | min/basis literal → token | none | none | none |
| openui/ViewTable.svelte | first-cell min literal → token; `::after` stretched link → `after:absolute after:inset-0`; `<style>` deleted | none | none | none |

## Theme additions
(none)

## Kept `<style>`
(none)

## Tokens
token: --c-stat-min 10rem — the generated view's stat tile floor
token: --c-view-lead-min 9rem — the generated table's lead column floor
## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:66 TableHead `h-c-toolbar-ctl` — a band heading at the toolbar control height (variant="caps" with a height role)
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:79 TableCell `h-c-btn-h-lg` (79) and `whitespace-normal` (80) — a view cell at the large button height; `view-lead` wrapping its text

## Removed
removed: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte `<style>` — the pseudo rule is a utility now
removed: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte `style="--first-min: 9rem"` and its literal marker — token
removed: apps/dashboard/src/lib/cawco/views/openui/ViewStat.svelte `style:--stat-min` and marker — token
removed: apps/dashboard/src/lib/cawco/views/canvas/TaskNode.svelte `style:--node-w` — token
removed: apps/dashboard/src/lib/cawco/views/canvas/TaskNode.svelte `<style>` handle rule — the four Handles carry the utilities (Handle accepts `class`; integration layers @xyflow's CSS below components)

## Contracts
(none)

## Design critique (interface-craft Design Critique, from markup against DESIGN.md; no bench renders these files, so ui-observer not run)
- TaskNode: the 15rem card width is the board column's floor token, so a card reads the same on canvas and board; the wash margin (`p-space-1`, `rounded-md`) is on ladder and concentric with the card. Handles are 1px, inert, transparent: hit areas belong to the edges. Passes.
- ViewBoard: column floor and ceiling are tokens; on a phone the next column peeks (`calc(100% - space-8)`) with scroll-snap and `overscroll-x-contain`. Passes.
- ViewStat: floor token plus grow/shrink lets tiles wrap on a narrow container. Passes.
- ViewTable: whole-row link via `after:absolute after:inset-0` under the `relative` row, one hit area per row. Passes.
gap: apps/dashboard/src/lib/components/ui/table/table-head.svelte (variant list) needs a heading-height role; ViewTable.svelte:66 carries `h-c-toolbar-ctl` outside the Table contract — DESIGN.md Components/Table
gap: apps/dashboard/src/lib/components/ui/table/table-cell.svelte:28-32 (`view`, `view-lead`) needs the large-button height and, for the lead, wrapping text; ViewTable.svelte:79-80 carries `h-c-btn-h-lg whitespace-normal` outside the contract — DESIGN.md Components/Table
