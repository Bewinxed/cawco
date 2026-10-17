# Lane S10-views-decisions

14 files, all done. Residual counts by kind (1 keyframes / 2 foreign-dom / 3 pseudo / 4 svg-paint / 5 unmapped).

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| blocks/Block.svelte | block, head, glyph, title, meta, tools, aside, body (+card/capped/fill), dragging, drop edges, preview | 0/1/1(10 decls)/0/1 | none | capped body `(min-width: 640px)` → `phone:` (640 exact); `(pointer: coarse)` → `coarse:` |
| blocks/BlockPage.svelte | block-page, blocks, page-end, refused, newer | none (no `<style>`) | 1 1 18rem, 72ch | none |
| canvas/CanvasStages.svelte | stage, docked/standing (via existing data flags), unreached, grabber, corner grips, grabs | 0/0/0/0/2 | 100px, 6px, 160px, 50%, -50% | none |
| decisions/DecisionPage.svelte | whole `<style>` | none | 1 1 14rem, 200px, 1.25, max(16px, var(--text-body)), inset ring | `(min-width: 1024px)` → `wide:` (1025); `(max-width: 899px)` → `max-desk:`; `(max-width: 639px)` → `max-phone:`; `(pointer: coarse)` → `coarse:` |
| decisions/DecisionTile.svelte | whole `<style>` | none | 24px; calc(0.25em - var(--space-2)) | none |
| decisions/DecisionsView.svelte | decisions, dswap, dview, seg-row, grid, cell, state, caw-80, problem | 0/4/0/0/0 | 36px, 72ch, 36rem, 90px | `@container decisions (width >= 520px/900px)` → `@decisions-520px/decisions:` / `@decisions-900px/decisions:` |
| decisions/PageFrame.svelte | whole `<style>` | none | 11px, 42% | none |
| decisions/RecordCard.svelte | whole `<style>` except two rules | 0/1/0/0/1 | 16 / 10, 1px + space-2 hang, 0fr/1fr | none |
| decisions/StatePill.svelte | whole `<style>` | none | 24px, 10px (inline), 0.3em | none |
| decisions/graph/DecisionEdge.svelte | inline `style` → xyflow's own custom properties | none | 1.5px | none |
| decisions/graph/DecisionGraph.svelte | graph frame, defs, arrow | 0/2/0/0/0 | 24rem, inset ring | none |
| decisions/graph/DecisionGroup.svelte | frame, label | none | inset ring | none |
| decisions/graph/DecisionNode.svelte | node, name, ring | 0/1(7 decls)/0/0/0 | 148px, 56px, 12px, 1.5px, 50% | none |
| views/ViewCalendar.svelte | none: every rule is library DOM | 0/72 decls/0/0/0 | n/a | none |

Totals: foreign-dom 88 decls, pseudo 10, unmapped 4, keyframes 0, svg-paint 0.

## Kind 5 declarations, verbatim
- Block.svelte: `[data-slot="block-head"] { -webkit-touch-callout: none; }`
- CanvasStages.svelte: `[data-slot="canvas-stage"]:global(.over-sheet) { z-index: 41; }`; the class is toggled by `canvas/stage.svelte.ts:452` (`el.classList.toggle("over-sheet", …)`), not on my list. Needs: that file to set `data-over-sheet` and this to become `data-over-sheet:z-41`.
- CanvasStages.svelte: `iframe { color-scheme: inherit; }` (no `inherit` value in the `scheme-*` utilities)
- RecordCard.svelte: `[data-slot="fold-row"] :global([data-toggle][aria-expanded="true"]:not(:hover)) { background-color: transparent; }` (`:not(:hover)` has no variant; `not-hover:` would invert the media guard)

## needs variant / needs transition token
- none.

## Kind-5 / non-utility choices worth the compare
- DecisionEdge: xyflow's unlayered `.svelte-flow__edge-path` outranks utilities, so the stroke goes through its `--xy-edge-stroke` and `--xy-edge-stroke-width` custom properties on the existing inline style (same computed stroke).
- DecisionNode: the `.svelte-flow__handle` rule stays foreign-dom for the same reason.
- Reduced-motion: RecordCard's `.fold` / `.chev` `transition: none` became `motion-reduce:transition-none` (drops `transition-property` only; the shorthand's `0s` duration is not reproduced). The reduce-motion open duration is carried by `motion-reduce:group-data-open/fold:dur-panel`.
- RecordCard / Block rely on Tailwind's variant order for `overflow` (card `data-card:overflow-hidden` vs capped `…phone:overflow-y-auto`); the compare should check a capped card block on a desk.
- Block: `class:narrow` / `class:wide` had no rule in any file and are dropped (the `data-narrow` / `data-wide` flags stay).
- `kit-page`, `.label`, `.dial`, `.task`, `.toggle`, `.chev`, `.back`, `.ctl`, `.primary`, `.note` classes deleted: none was selected outside its file.

## literals preserved (`<!-- literal: … -->` in the file)
See the table; each sits directly above its element.

## shadcn variant: lines (delta N)
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:203 data-open grid-template-rows
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:203 data-open transition-duration
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:213 group-data-open (fold-inner) opacity
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:213 group-data-open (fold-inner) filter
- shadcn variant: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:213 group-data-open (fold-inner) transition-duration

## cross-file hooks (delta O2)
- none. `.tile` and `.page-head`, selected from DecisionsView, both live in this lane: DecisionsView now selects `[data-slot="tile"]` and `[data-slot="page-head"]` (both elements already had the slot).

## needs colour token (delta O1)
- none.

## shadcn/no-restyle hits (and other lint errors left)
- decisions/DecisionPage.svelte:352 `<Textarea>`: min-w-0, border-transparent, bg-transparent, px-0, py-space-2, leading-(--note-leading), shadow-none, coarse:text-(length:--note-fs), max-phone:text-(length:--note-fs), placeholder-shown:truncate
- decisions/DecisionPage.svelte:369 `<Button>` (Send): rounded-xs
- decisions/DecisionPage.svelte:382 `<Button>` (primary): rounded-xs
- decisions/DecisionsView.svelte:245 `<Skeleton>`: h-64 (kept as written), rounded-lg
- decisions/DecisionsView.svelte:343 `<Skeleton>`: rounded-lg
- blocks/Block.svelte:170 and blocks/BlockPage.svelte:337 `<DropdownMenu.Content>`: min-w-48 (kept as written)
- shadcn/require-static-classes (not no-restyle, present before): blocks/Block.svelte:163 and blocks/BlockPage.svelte:326 `<DropdownMenu.Trigger class="{buttonVariants(...)} touch-hit">`; fixing it means restructuring, so left for integration.

## Contracts
contract: apps/dashboard/src/lib/cawco/blocks/Block.svelte:161 shadcn/require-static-classes | apps/dashboard/src/lib/components/ui/dropdown-menu (trigger as a Button) | the trigger takes buttonVariants() through a dynamic class string; a static form needs the kit's trigger to carry the ghost icon-sm variant
contract: apps/dashboard/src/lib/cawco/blocks/BlockPage.svelte:326 shadcn/require-static-classes | apps/dashboard/src/lib/components/ui/dropdown-menu (trigger as a Button) | same as Block.svelte:161

important kept: none.
