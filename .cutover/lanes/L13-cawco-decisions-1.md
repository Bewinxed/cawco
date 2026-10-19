# Lane L13-cawco-decisions-1 (7 files)

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: transitions, not keyframes, for interactive state (fold, pill); transition only named properties (`transition-[scale]`, `transition-[grid-template-rows]`, never `all`); reduced-motion gates kept (`motion-reduce:transition-off`, `motion-safe:`); exits shorter than enters (`dur-exit` shut, `dur-panel` open); skeleton on the kit's one placeholder.
better-layout rules followed: logical/flow-relative utilities (`ms-`, `ps-`, `inset-x-0`); grouping by the spacing ladder (no off-ladder spacing, tokens `space-N`); plan for growth (`min-w-0`, `max-w-full`, `truncate`, `wrap-anywhere`, wrapping rows); no fixed heights on text boxes (`min-h-`); container queries for the tile grid.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| DecisionPage.svelte | `.problem` ×2, `.note`, `.ctl`, head ring, `what` basis, skeleton, dock query | 0/0/0/0/0 | none | `max-[900px]:` → `max-desk:`; `wide:` (1025px) for the record grid, main had `min-width: 1024px` | none |
| DecisionTile.svelte | `.head` min height, tile `flex-auto` (replaces the `[data-slot="cell"] > :global(tile)` rule) | 0/0/0/0/0 | none | none | none |
| DecisionsView.svelte | `<style>` (2 rules) removed, `--seg-h`, 72ch wrappers, caw-empty, tile skeleton | 0/0/0/0/0 | none | none | none |
| PageFrame.svelte | skeleton block | 0/0/0/0/0 | none | none | none |
| RecordCard.svelte | `<style>` removed, `.open-card`, `.tag`, still ratio, fold wrapper, chevron flip, fold track | 0/0/0/0/0 | none | none | none |
| StatePill.svelte | height, gap, padding | 0/0/0/0/0 | none | none | none |
| graph/DecisionEdge.svelte | inline stroke → xyflow custom properties | 0/0/0/0/0 | none | none | none |

Sums: no residual in any kind; no `<style>` left in the lane.

## Kind-5 declarations (verbatim)
- none

## needs colour token / needs variant / needs transition token
- none

## Theme additions

theme: utility grid-rows-fold-shut
```css
@utility grid-rows-fold-shut {
  grid-template-rows: 0fr;
}
```

theme: utility grid-rows-fold-open
```css
@utility grid-rows-fold-open {
  grid-template-rows: 1fr;
}
```

theme: component record-card-chev
```css
@layer components {
  [data-slot="fold-row"] [data-chev] path {
    vector-effect: non-scaling-stroke;
  }
}
```

theme: component caw-empty-action
```css
@layer components {
  [data-slot="caw-empty"] .kit-empty-action {
    align-self: stretch;
  }
}
```

## Tokens
- token: --c-decision-head-what 14rem — the page head's title group flex-basis (DecisionPage.svelte `what`); a real dimension (how narrow the group goes beside ‹ Decisions before it wraps), no ladder step fits
- token: --c-decision-note-max-h 200px — the docked note field's tallest (DecisionPage.svelte Textarea); a real component dimension, no ladder step fits

## Removed
- removed: DecisionsView.svelte:249,291 `max-w-(--measure)` 72ch wrapper — EmptyState's own title and line already cap at 60ch (app.css `.kit-empty-title`/`.kit-empty-line`), so the 72ch wrapper never bound
- removed: DecisionPage.svelte note `--note-fs: max(16px, var(--text-body))` — app.css already floors every field at 16px on coarse/phone; `--note-fs` is now `var(--text-body)` for the kit's `look="note"`
- removed: RecordCard.svelte fold `-mt-` (calc(-1 * space-3)) that cancelled the body's gap — the fold now shares one wrapper with its toggle (see fixed:)
- removed: RecordCard.svelte `--chev-flip: scaleY(-1)` inline style — `scale` utility instead
- removed: DecisionPage.svelte `ctl` and `note`, RecordCard.svelte `open-card`/`tag`, DecisionsView.svelte `state`/`caw-empty`, DecisionPage.svelte/PageFrame `problem` class names — classes no rule selected (the merge took main's unconverted lines); their declarations are now utilities
- removed: RecordCard.svelte toggle hang `-ms-(1px + space-2)` 1px nudge → `-ms-space-2` ladder step
- removed: dead `.toggle[aria-expanded]` and `.chev`-transition rules of main's RecordCard `<style>` (the kit Button's `expanded="unfilled"` and the group-aria utility already draw them)

## fixed
- fixed: RecordCard.svelte:~170 toggle and fold in one `data-slot="fold-wrap"` item of the body — a shut fold takes no body gap, so no negative margin cancels it — DESIGN.md Layout (spacing ladder, no magic offsets)
- fixed: DecisionPage.svelte page-head hairline ring `inset 0 0 0 1px` → `border border-border-hairline` — DESIGN.md Shapes (graded borders)
- fixed: DecisionPage.svelte/PageFrame.svelte hand-rolled skeleton span → kit `Skeleton` (`radius="text"`, `h-space-3 w-2/5`, `data-slot="block"` kept) — S2 kit swap
- fixed: DecisionsView.svelte tile skeleton 90px → kit `height="plot"` (96px, the nearest kit step)
- fixed: DecisionsView.svelte `--seg-h: 36px` → `--c-btn-h` (the ToggleGroup's own height)
- fixed: DecisionsView.svelte caw-empty cap 36rem → `max-w-c-starters-w` (Caw's starters' own width, as the project page's caw-empty)
- fixed: DecisionPage.svelte note `--note-leading: 1.25` → `var(--leading-ui)` (same value, the token)
- fixed: DecisionPage.svelte `class="note"` → the kit's `look="note"`; Send's `ctl` → `size-c-composer-field flex-none`, `--btn-icon` → `var(--icon-md)`
- fixed: StatePill.svelte 24px/10px/0.3em → `h-c-pill-h`, `px-space-3`, `gap-c-pill-gap` (6px)
- fixed: DecisionTile.svelte head min 24px → `min-h-c-pill-h`
- fixed: RecordCard.svelte chevron flip via `transition-[scale]` + `-scale-y-100` (was a custom-property `transform`)

## Contracts
- none

## Kit swaps
- none (no `no-restyle` flag remains)

## Gaps
- gap: DecisionPage.svelte:286 the record grid breaks at the viewport's `wide:` (1025px), but the pane it fills is a container; the tile grid beside it queries the pane (`@decisions-520px`/`@decisions-900px`) — DESIGN.md Layout (container-led components)
- gap: DecisionPage.svelte back Button `-ms-space-2` cancels the kit Button's inline padding so its words line up with the head; the other side is the kit — a kit `shape`/`margin` variant would own it

## shadcn variant lines
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:200 data-open grid-template-rows / transition-duration

## cross-file hook
- none

## Delta R / P
- R1: no box-shadow state in this lane's files. R2: `border-none border-current` kept (PageFrame.svelte iframe). R3: `font-(family-name:--font-mono)` kept (RecordCard.svelte `id`, a span).
- important kept: none

## Design Critique (interface-craft, from markup and classes; not rendered)
- fixed: the fold's opacity/blur/grid-row motion keeps `motion-safe`/`motion-reduce:` guards and the panel (open) / exit (shut) durations, so the exit is the shorter beat.
- gap: not rendered; the Decisions tab needs a hub with a published decision page, and no `/motion` bench or stories file draws these seven. ui-observer measurements: Not verified.
