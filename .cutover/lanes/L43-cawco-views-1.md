Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer.

better-ui rules followed: outer radius stays the role's token (tile `rounded-lg`, canvas `rounded-lg`, rows `rounded-md`); depth by ring tokens, not borders (`inset-ring inset-ring-border-hairline`, `data-open:inset-ring-border-control`); a hover is the `hover:` variant (built on `@media (hover: hover)`); the bar fill transitions only `inline-size` under `motion-safe:`, and the canvas card ease sits under `prefers-reduced-motion: no-preference`; no `transition-all`.
better-layout rules followed: grouping by `gap-space-*` (tile inner gap 7px under the grid's 11px); text-bearing grid tracks are `minmax(0, …)`/`min-w-0`; the made grid is `repeat(auto-fill, minmax(min(100%, X), 1fr))` so one tile never overruns a narrow column; the routines fold hides Last/Next by container query, not viewport; logical properties everywhere (`top-0` is the only physical offset, on a sticky head: it has no logical form in the kit contract).

# L43-cawco-views-1

| file | rules moved | literals → ladder / token | residual |
|---|---|---|---|
| views/ViewCalendar.svelte | 17 foreign-DOM rules kept in `<style>` (library sheet is unlayered); duplicate `.ec-list .ec-event.chip` radius removed; per-rule residual comments folded to one | none | `<style>` kept, docs reason on its first line |
| views/ViewCanvas.svelte | foreign-DOM `<style>` → `theme: component view-canvas-ease`; section gets `data-slot="view-canvas"` | 280px → `--c-canvas-min-h` token; ring shadow → `inset-ring inset-ring-border-hairline` | none |
| views/ViewMade.svelte | `.made` → grid utilities; ring shadows → `inset-ring` + `data-open:` | 18rem → `--c-made-tile-min` token | none |
| views/ViewPipeline.svelte | none left in `<style>` | 8px → `h-space-2`, 2px → `min-w-space-row`, row columns → `--c-pipeline-*` tokens | none |
| views/ViewRoutines.svelte | `<style>` (5 foreign-DOM/pseudo rules) removed: lead glyph size, opener `::after`, folded, row-ask, starters, purpose, ledger classes → utilities; 2 ledger tables → `layout="ledger"`; heads → `variant="band"` | 72ch → `max-w-c-measure`; `--col-when`, `--none` deleted | none |

## Theme additions
theme: component view-canvas-ease
```css
@layer components {
  /* Once placed, a card that the layout moves eases to its new place
     (movement on screen); a card new to the canvas fades in where it lands.
     Svelte Flow's sheet sets no transition or opacity on its nodes, so the
     layer does not lose to it. */
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="view-canvas"][data-settled] .svelte-flow__node {
      transition:
        transform var(--dur-panel) var(--ease-in-out),
        opacity var(--dur-fade) var(--ease-out);

      @starting-style {
        opacity: 0;
      }
    }
  }
}
```

## Tokens
token: --c-made-tile-min 18rem — ViewMade.svelte:40, the least width of a made tile in its auto-fill grid; no ladder step is a 288px column
token: --c-canvas-min-h 280px — ViewCanvas.svelte:205, the Canvas view's least height (the graph needs a floor to be readable); no ladder step is a canvas height
token: --c-pipeline-name-min 6rem — ViewPipeline.svelte:49, the stage-name column's floor in a pipeline row
token: --c-pipeline-name-max 10rem — ViewPipeline.svelte:49, the stage-name column's ceiling
token: --c-pipeline-kind-min 4rem — ViewPipeline.svelte:49, the stage-kind column's floor
token: --c-pipeline-kind-max 6rem — ViewPipeline.svelte:49, the stage-kind column's ceiling
token: --c-pipeline-count-w 3rem — ViewPipeline.svelte:49, the count column; no ladder step is a column width

## Removed
removed: ViewCalendar.svelte:245 `.ec-list .ec-event.chip` `border-radius: var(--radius-xs)` — the same declaration the base `.ec-event.chip` rule already writes (a duplicate)
removed: ViewRoutines.svelte (style) `th[data-slot="actions-table-col-status"]` and `th:is([data-slot="actions-table-col-when"], [data-slot="routine-detail-col-when"])` widths and the `--col-when` property they read — ActionsTable.svelte:113-120 and RoutineDetail.svelte:175 set those widths on their own heads, so the rule drew nothing
removed: ViewRoutines.svelte `style:--none="0"` — nothing in the file reads `--none`
removed: ViewRoutines.svelte `.routine-starters :global(.starter-glyph)` (style) — the glyph carries `size-icon-md flex-none text-ink-muted` itself
removed: ViewRoutines.svelte `ledger` class on the sources and actions wrappers (`container: routines-ledger`) — no query reads that container there; RoutineDetail's `@max-routines-ledger-399px/routines-ledger` sits under the routines wrapper, which keeps `@container/routines-ledger`
removed: ViewRoutines.svelte `align-self: stretch` on `.kit-empty-action` — the wrapper inside the action snippet fills the slot

## Gaps
fixed: ViewRoutines.svelte:914 `ghostRows="tr.row"` matched nothing since the rows lost their `row` class; now `[data-view-routines-row]`, so the hover ghost glides over the rows again — DESIGN.md Components, the ledger's hover highlight
fixed: ViewRoutines.svelte:969 the sources ledger's heads and cells read `--col-state`, which only the routines wrapper set; the sources wrapper sets it now, so the state column holds its width — DESIGN.md Layout (a ledger's fixed columns)
fixed: ViewMade.svelte:40 the grid's column min is `min(100%, …)` so a tile never overruns a narrow column — defensive-css auto-fill rule
gap: ViewRoutines.svelte:921 the old `.ledger table > thead th` rule made the heads of the tables in ActionsTable.svelte and RoutineDetail.svelte sticky too; a rule aimed at another file's table cannot be written here, so those two tables' heads (ActionsTable.svelte:101-122, RoutineDetail.svelte:165-182) must carry `sticky top-0 z-2` themselves — DESIGN.md Density ("a 32px header band")
gap: ViewRoutines.svelte:861 the empty page's action slot is `.kit-empty-action` (EmptyState); the old rule stretched that div, and the stretch is now a wrapper inside the snippet; if EmptyState centres its action, it needs a `stretch` look — DESIGN.md Empty, loading and skeleton states
gap: ViewCalendar.svelte:137 the Event Calendar sheet is unlayered, so its overrides cannot move to a layer without importing the sheet into one (`@import … layer(vendor)` in app.css, which is not a lane's file) — a post-cutover item

## Contracts
(none)

## Kit swaps
kit-swap: ViewRoutines.svelte:914 Table layout="ledger" — done (`routines table-fixed` and the dead `routines`/`ghostRows` selector go)
kit-swap: ViewRoutines.svelte:970 Table layout="ledger" — done (`quiet table-fixed`)
kit-swap: ViewRoutines.svelte:921 TableHead variant="band" — done (the five routines heads at :921, :927, :933, :938, :943 and three sources heads at :976, :982, :988; `caps` + `h-c-toolbar-ctl` replaced)
kit-swap: ViewRoutines.svelte:921 TableHead sticky top-0 z-2 bg-surface-band — a sticky ledger band heading needs the variant to own `bg-surface-band` (variant `band-sticky`); the eight heads (:921, :927, :933, :938, :943, :976, :982, :988) keep the classes until it exists
kit-swap: ViewRoutines.svelte:933 TableHead @max-routines-ledger-34rem/routines-ledger:hidden — a column that folds under its ledger's container (the variant needs a `folds` look); also :938
kit-swap: ViewRoutines.svelte:777 TableCell @max-routines-ledger-34rem/routines-ledger:hidden — the same fold on the Last and Next cells; also :790
kit-swap: ViewRoutines.svelte:722 TableCell h-c-btn-h-lg — a ledger row's 44px pitch on its cell (variant `list-row`); also :734, :777, :790, :803, :1004, :1013, :1029, :1055, :1064, :1081

shadcn/no-restyle: ViewRoutines.svelte:921, :927, :933, :938, :943, :976, :982, :988 TableHead `bg-surface-band`, `top-0` or the fold variant; ViewRoutines.svelte:722, :734, :777, :790, :803, :1004, :1013, :1029, :1055, :1064, :1081 TableCell `h-c-btn-h-lg` or the fold variant (all logged as kit-swap above)
shadcn variant: none.
