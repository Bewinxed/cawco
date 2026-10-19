# Lane L44-cawco-views-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft (critique below).
better-ui rules followed: hover/state only via attributes and variants; nothing transitioned; no `all`. better-layout rules followed: `min-w-0`/`shrink`/`basis` on the stat flex item so it wraps and never overflows; the board's columns keep a token floor and ceiling; the table's lead cell keeps a token minimum.

4 files, all done.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| canvas/TaskNode.svelte | node width literal → token; handle rule kept | 0/1(7 decls)/0/0/0 | none | none |
| openui/ViewBoard.svelte | column bounds literal → tokens | none | none | none |
| openui/ViewStat.svelte | min/basis literal → token | none | none | none |
| openui/ViewTable.svelte | first-cell min literal → token; `::after` stretched link → `after:absolute after:inset-0`; `<style>` deleted | none | none | none |

## Theme additions
(none)

## Kept `<style>`
- canvas/TaskNode.svelte: `/* tailwind: Svelte Flow's stylesheet is unlayered, and unlayered rules outrank every layer, utilities included — https://tailwindcss.com/docs/adding-custom-styles#using-css-and-layers */` over `[data-slot="task-node"] :global(.svelte-flow__handle)` (residual: foreign-dom).

## Tokens
token: --c-board-col-min 15rem — the task board's column floor, shared by TaskNode, ViewBoard and TaskBoard; no ladder step fits (needs `--spacing-c-board-col-min`)
token: --c-board-col-max 22rem — the board column's ceiling (ViewBoard `minmax(var(--c-board-col-min), var(--c-board-col-max))`)
token: --c-stat-min 10rem — the generated view's stat tile floor (needs `--spacing-c-stat-min`)
token: --c-view-lead-min 9rem — the generated table's lead column floor (needs `--spacing-c-view-lead-min`)
Until integration adds them, eslint reports `shadcn/no-unknown-classes` for `w-c-board-col-min` (TaskNode:45), `min-w-c-stat-min` and `basis-c-stat-min` (ViewStat:18), `min-w-c-view-lead-min` (ViewTable:80); expected.

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:66 TableHead `h-c-toolbar-ctl` — a band heading at the toolbar control height (variant="caps" with a height role)
kit-swap: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte:79 TableCell `h-c-btn-h-lg whitespace-normal` — a view cell at the large button height; `view-lead` wrapping its text

## Removed
removed: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte `<style>` — the pseudo rule is a utility now
removed: apps/dashboard/src/lib/cawco/views/openui/ViewTable.svelte `style="--first-min: 9rem"` and its literal marker — token
removed: apps/dashboard/src/lib/cawco/views/openui/ViewStat.svelte `style:--stat-min` and marker — token
removed: apps/dashboard/src/lib/cawco/views/canvas/TaskNode.svelte `style:--node-w` — token

## Contracts
(none)

## Design critique (interface-craft, from markup)
- Stat wrapper: fixed floor + grow/shrink lets tiles wrap on a narrow container; passes.
- Board: narrow phones show the next column peeking (`calc(100% - space-8)`); passes.
- Ledger: whole-row link via `after:inset-0` under `relative` row; passes.
gap: ViewTable.svelte:66,79 kit-swap sites carry heights and `whitespace-normal` outside the Table contract — the kit needs the roles above.
