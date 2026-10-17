# Lane S20-features

Files: 11 of 11 done (workflows/*). Rules moved to utilities in 8 files with a `<style>`; JsonField had none.

## Per-file table
file · rules moved · residual 1/2/3/4/5 · literals preserved · breakpoint edges
- JsonField · 0 (no style) · 0/0/0/0/0 · none · none
- WorkflowCanvas · 1 (.canvas) · 0/5/0/0/0 · 280px, 10px · none
- WorkflowCanvasTools · 2 · 0/0/0/0/0 · 40px · none
- WorkflowEdge · 3 · 0/1/0/0/1 · 28px · none
- WorkflowEditor · ~30 · 0/1/0/0/1 · 46,30,1.4,300,220,24,44,300,24ch,5rem,300px,85dvh · max-width 1023px → max-wide: (exact)
- WorkflowInspector · 4 · 0/0/0/0/0 · 36px, 44px · none
- WorkflowLaunch · 1 · 0/1/0/0/0 · 90dvh, 36rem (was max-w-144), 44px · none
- WorkflowNodeCard · ~15 · 0/3/0/0/0 · 260,28,17,12,24px · none
- WorkflowProgram · 6 · 0/0/0/0/0 · 320px, 30dvh · 1023px → max-wide:
- WorkflowRunView · ~25 · 0/1/0/0/0 · 26px, 14rem, 72ch, 30dvh · 900px → max-desk: (901 theme edge; 1px)
- WorkflowStatus · 3 · 0/0/0/0/0 · 3px · none

## Kind-5 declarations (verbatim)
- WorkflowEdge.svelte: `[data-slot="edge-label"] { pointer-events: all; }`
- WorkflowEditor.svelte: `[data-slot="filters"] button { filter: none; }`

## needs variant / needs transition token
none.

## shadcn/no-restyle hits
- WorkflowEditor.svelte:755 ResizablePaneGroup `min-h-0` (pre-existing)
- WorkflowEditor.svelte:885 DrawerContent `min-h-0` (was :global(.inspector-sheet))
- WorkflowRunView.svelte:352 CardContent `flex flex-col gap-space-4` (was :global(.answer-body))

## shadcn variant:
none.

## BLOCKER: the wf-* global sheet (workflows.css, not in this lane)
- 113+ `shadcn/no-unknown-classes` errors are `wf`, `wf-btn`, `wf-stack`, `wf-row`, `wf-spread`, `wf-primary`, `wf-muted`, `wf-well`, `wf-fields`, `wf-check`, `wf-mono`, `wf-error` and `nodrag`/`nopan` (xyflow's own hooks). `wf-*` are defined only in `features/workflows/workflows.css` (200 lines, imported by two routes and DecisionGraph, used by SchemaBuilder and `+page.svelte`). Converting them needs that file and its other users: out of lane, left as written.
- **Cascade risk for integration:** workflows.css is unlayered; Tailwind utilities are in `@layer utilities`, so an unlayered `.wf .wf-btn` (etc.) now beats every utility on an element carrying a wf class. Before, local scoped rules beat them by specificity. Wrap workflows.css in `@layer components { … }` (or convert it) before the compare. Elements where a utility overrides a property workflows.css also sets: WorkflowEditor narrow-only buttons (`display`), filter buttons (`background`), breadcrumb input (`border-color`, font), run-list/run-entry (`gap`, `padding`), WorkflowProgram `.problems` (`gap` vs wf-stack), WorkflowLaunch buttons (`min-height`, residual).
- WorkflowEdge.svelte:39 `shadcn/no-inline-styles`: BaseEdge's `style` string (stroke, stroke-width) stays inline; it must beat xyflow's `.svelte-flow__edge.selected .svelte-flow__edge-path`, which a class cannot.

## Judgment calls
- Residual foreign-dom kept for xyflow handle rules in NodeCard (specificity over a utility) and the focus ring on `.svelte-flow__node:focus-visible`.
- `data-is-selected`, `data-is-code` added next to existing hook flags (delta M). `data-canvas` added on WorkflowCanvas's section (its data-slot comes from the trigger props). `data-map` replaces the style-less `map` class.
- `scale-100` stands for `scale: 1`; `col-start-1 row-start-1` for `grid-area: 1 / 1`; `shrink-0`, `grow`, `shrink`, `basis-full`, `list-none`, `touch-pan-y`, `cursor-crosshair` are Tailwind structural utilities outside the map's list.
- `text-right` kept (not `text-end`) where the source said `right`.
- cross-file hooks (delta O2): none. colour tokens (delta O1): none.

## Delta P
- svelte-check: 0 errors, 1 warning (Shot.svelte:212, the foundation's own). No `Unused CSS selector` in this lane; every residual subject is an element of its own file, or `:global(…)` under one.
- important kept: apps/dashboard/src/lib/components/features/workflows/WorkflowEdge.svelte:67 `stroke: var(--focus-ring) !important` stays as the foreign-dom residual (xyflow's path).
- wf-* and nodrag/nopan left as written (delta P2).
