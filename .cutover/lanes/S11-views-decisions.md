# Lane S11-views-decisions

13 of 13 files done.

## Per-file table (rules moved · residual kinds 1/2/3/4/5 · literals preserved · breakpoint edges · STOPs)
| file | residual 1/2/3/4/5 | literals | breakpoint edges | STOP |
|---|---|---|---|---|
| views/ViewCanvas.svelte | 0/2/0/0/0 | 280px, `inset 0 0 0 1px var(--border-hairline)` | none | none |
| views/ViewMade.svelte | none (style deleted) | `repeat(auto-fill, minmax(18rem, 1fr))`, `auto minmax(0, 1fr) auto`, two inset hairline shadows | none | none |
| views/ViewOpenUi.svelte | none (style deleted) | none | none | none |
| views/ViewPipeline.svelte | 0/0/0/0/4 | row columns (two), 8px, 2px, 260ms | `max-width: 639px` -> `max-phone:` (1px edge); the grid-area rules stay in the residual media query at 639px | none |
| views/ViewRoutines.svelte | 0/19/3/0/1 | 6rem, 72ch, calc of tokens for col-state / col-menu | container `(width < 34rem)` -> `@max-routines-ledger-34rem/routines-ledger:` | none |
| views/canvas/TaskEdgeLine.svelte | 0/0/0/3/0 | none | none | none |
| views/canvas/TaskNode.svelte | 0/7/0/0/0 | 15rem | none | none |
| views/openui/Layout.svelte | none (style deleted) | none | none | none |
| views/openui/ViewBoard.svelte | none (style deleted) | `minmax(15rem, 22rem)` | `max-width: 639px` -> `max-phone:` | none |
| views/openui/ViewStat.svelte | none (style deleted) | 10rem | none | none |
| views/openui/ViewTable.svelte | 0/0/3/0/0 | 9rem | none | none |
| views/openui/ViewTaskCard.svelte | none (style deleted) | none | none | none |
| views/openui/ViewText.svelte | none (style deleted) | none | none | none |

Residual sums: kind 1: 0 · kind 2: 28 declarations · kind 3: 6 · kind 4: 3 · kind 5: 5.

## Kind-5 declarations, verbatim
- ViewPipeline.svelte, inside `@media (max-width: 639px)`: `grid-template-areas: "name count" "track track";`
- ViewPipeline.svelte: `grid-area: name;` (`[data-slot="name"]`)
- ViewPipeline.svelte: `grid-area: track;` (`[data-slot="track"]`, hook added)
- ViewPipeline.svelte: `grid-area: count;` (`[data-slot="count"]`)
- ViewRoutines.svelte: `font: inherit;` (on `[data-opener]`)

## needs variant / needs transition token
- needs variant: none. (`data-is-you:`, `data-enabled`, `data-paused` use Tailwind's own bare `data-*` variant; `kind-*`, `role-*`, `lead-*`, `state-open` exist in variants.css.)
- needs transition token: ViewPipeline.svelte the bar's `transition: inline-size 260ms var(--ease-out)` carried as `motion-safe:transition-[inline-size] motion-safe:duration-(--bar-dur) motion-safe:ease-out` with `style:--bar-dur="260ms"`; no `--dur-*` token holds 260ms.

## Literals preserved (custom property + utility, `<!-- literal: -->` above the element)
280px, 18rem/1fr grid, 8px, 2px, 260ms, 15rem, 10rem, 9rem, 6rem, 72ch, 15rem/22rem, inset-hairline shadows.

## shadcn variant lines (delta N)
- shadcn variant: apps/dashboard/src/lib/cawco/views/ViewMade.svelte:46 data-open box-shadow

## Needs colour token (delta O1)
none.

## Cross-file hook (delta O2)
none. Searched `src` for `querySelector`/`closest`/`:global(.x)` naming any class I deleted; PaneTabs.svelte:1310 `.closest(".head")` and DecisionsView.svelte:382 `.cell > :global(.tile)` are those files' own markup (neither renders ViewMade).

## Decisions worth a look at integration
- Handle (Svelte Flow) rules in TaskNode stay residual foreign-dom, not a `class` on `<Handle>`: Svelte Flow's `style.css` is unlayered and beats `@layer utilities`; a utility class would lose to its 6px dot.
- TaskEdgeLine: edge stroke and width are now `--xy-edge-stroke` / `--xy-edge-stroke-width` (what `.svelte-flow__edge-path` reads) so the inline style holds custom properties only; dasharray and linecap are two global `svg-paint` rules (`.edge-related`, `.edge-found-in`).
- ViewRoutines keeps the ledger's rules that reach foreign tables (RoutineDetail's runs, ActionsTable: `table > thead th`, `tr.band`, `tr.band th`, `th.col-status`, `th.col-when`) as residual foreign-dom under `[data-slot="ledger"]`; `th.col-when`'s `6rem` is `var(--col-when)` set on the ledger div. `ghostRows="tr.row"` became `tr[data-view-routines-row]` (the `row` class is gone). `data-opener` added to the row's trigger as the hook for its `::after`.
- ViewRoutines: `td.col-state { padding-inline-end: 0 }` was dead (`tr.row > td` sets `padding-inline` with higher specificity), so it is not carried.
- ViewPipeline: `border-radius: inherit` on the bar became `rounded-pill` (the track's own radius; same computed value). `data-slot="track"` added.
- ViewMade: the stage's state class `.you` became `data-is-you` (delta M: `data-you` is the sweep's hook); `data-is-you:` is Tailwind's bare data variant. ViewOpenUi: `OpenUiRenderer`'s `data-open-ui-renderer-class` now reads `min-w-0` (it echoes the class passed).
- ViewRoutines: `border-spacing: 0` dropped with `border-collapse: separate` -> `border-separate` (0 is the initial value).
- `tabular-nums` (Tailwind's own) used where the map says `num`: no `num` utility exists in theme.css.

## shadcn/no-restyle hits (file:line:col component class)
- views/ViewOpenUi.svelte:89:18 <Skeleton> "h-40"
- views/ViewOpenUi.svelte:89:18 <Skeleton> "rounded-lg"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-t"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-t"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-t"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-t"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-t"
- views/ViewRoutines.svelte:698:54 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:724:50 <TableRow> "border-b-0"
- views/ViewRoutines.svelte:726:20 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:726:20 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:726:20 <TableCell> "type-meta"
- views/ViewRoutines.svelte:726:20 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:726:20 <TableCell> "group-state-open:bg-surface-well"
- views/ViewRoutines.svelte:737:20 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:737:20 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:737:20 <TableCell> "type-meta"
- views/ViewRoutines.svelte:737:20 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:737:20 <TableCell> "group-state-open:bg-surface-well"
- views/ViewRoutines.svelte:741:22 <CollapsibleTrigger> "border-0"
- views/ViewRoutines.svelte:741:22 <CollapsibleTrigger> "bg-transparent"
- views/ViewRoutines.svelte:741:22 <CollapsibleTrigger> "p-0"
- views/ViewRoutines.svelte:741:22 <CollapsibleTrigger> "text-inherit"
- views/ViewRoutines.svelte:780:20 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:780:20 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:780:20 <TableCell> "type-meta"
- views/ViewRoutines.svelte:780:20 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:780:20 <TableCell> "group-state-open:bg-surface-well"
- views/ViewRoutines.svelte:791:20 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:791:20 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:791:20 <TableCell> "type-meta"
- views/ViewRoutines.svelte:791:20 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:791:20 <TableCell> "group-state-open:bg-surface-well"
- views/ViewRoutines.svelte:803:20 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:803:20 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:803:20 <TableCell> "type-meta"
- views/ViewRoutines.svelte:803:20 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:803:20 <TableCell> "group-state-open:bg-surface-well"
- views/ViewRoutines.svelte:925:29 <TableRow> "band"
- views/ViewRoutines.svelte:925:29 <TableRow> "border-0"
- views/ViewRoutines.svelte:979:29 <TableRow> "band"
- views/ViewRoutines.svelte:979:29 <TableRow> "border-0"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-t"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-t"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-t"
- views/ViewRoutines.svelte:994:40 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:995:54 <TableRow> "border-b-0"
- views/ViewRoutines.svelte:997:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:997:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:997:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:997:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1005:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:1005:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:1005:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:1005:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1022:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:1022:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:1022:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:1022:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-t"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-t"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-t"
- views/ViewRoutines.svelte:1041:19 <TableCell> "border-border-hairline"
- views/ViewRoutines.svelte:1043:54 <TableRow> "border-b-0"
- views/ViewRoutines.svelte:1045:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:1045:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:1045:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:1045:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1053:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:1053:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:1053:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:1053:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1070:24 <TableCell> "px-space-3"
- views/ViewRoutines.svelte:1070:24 <TableCell> "py-space-2"
- views/ViewRoutines.svelte:1070:24 <TableCell> "type-meta"
- views/ViewRoutines.svelte:1070:24 <TableCell> "text-ink-muted"
- views/ViewRoutines.svelte:1137:22 <Skeleton> "h-64"
- views/ViewRoutines.svelte:1137:22 <Skeleton> "rounded-lg"
- views/openui/ViewTable.svelte:60:49 <Table> "kit-edge-fade"
- views/openui/ViewTable.svelte:63:27 <TableRow> "border-0"
- views/openui/ViewTable.svelte:63:27 <TableRow> "bg-surface-band"
- views/openui/ViewTable.svelte:67:22 <TableHead> "px-space-3"
- views/openui/ViewTable.svelte:67:22 <TableHead> "tracking-caps"
- views/openui/ViewTable.svelte:67:22 <TableHead> "text-ink-muted"
- views/openui/ViewTable.svelte:67:22 <TableHead> "uppercase"
- views/openui/ViewTable.svelte:80:22 <TableCell> "border-b"
- views/openui/ViewTable.svelte:80:22 <TableCell> "border-border-hairline"
- views/openui/ViewTable.svelte:80:22 <TableCell> "px-space-3"
- views/openui/ViewTable.svelte:80:22 <TableCell> "type-label"
- views/openui/ViewTable.svelte:80:22 <TableCell> "text-ink-muted"
- views/openui/ViewTable.svelte:82:19 <TableCell> "py-space-2"

## Contracts
none. (`shadcn/no-restyle` is off in the lane ESLint check; its hits are listed above for integration.)

## Important kept
none (no `!important` in the sources).
