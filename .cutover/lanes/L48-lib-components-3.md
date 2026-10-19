# L48-lib-components-3

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report: interface-craft, ui-observer. No file in the list has a transition directive, `@keyframes` or a skeleton animation of its own (WorkflowStatus's `transition:crossIn` and `dur-panel` were already converted and left as written), so emil-design-eng and transitions-dev were not loaded.

better-ui rules followed: hover only on hover-capable pointers (the one hover-like state, `fine:data-near:`, is fine-pointer only); transition only what changes (`transition-[outline-color]`, `transition-[background-color,color]` kept, never `all`); contain what scrolls (the log and problems regions keep `overflow-y-auto` with a cap); a pointer hit area stays 24px at any zoom (`--c-pointer-floor`).
better-layout rules followed: boxes holding content grow (the run log's fixed `height` became `max-height`, so a two-line log is two lines tall); hold structure until it breaks (breakpoints stay the theme's `max-wide` / `max-desk` / `phone`); plan for growth (the dialog takes the kit's `width="form"`, a skeleton title is `w-1/2` not 14rem); logical properties kept (`end-`, `ps/pe`, `mx`).

Base: 9ec5a3111. Files: 5 of 5 done.

| file | what changed | residual `<style>` | literals left | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| workflows/WorkflowLaunch.svelte | marker, inline `style`, `--hit-min` gone; width to the kit's `form`; `<style>` deleted | none | 0 | `phone:max-w-(--dialog-w)` (640) → kit `width="form"` (`phone:max-w-128`, same 640 edge) | none |
| workflows/WorkflowNodeCard.svelte | `--card-w`, `--glyph`, `--hit-gap-y`, hit calcs on tokens; focus ring and near-port colour to theme additions; `<style>` deleted | none | 0 | `(pointer: fine)` → `fine:`, as before | none |
| workflows/WorkflowProgram.svelte | `--code-min`, `--problems-max` to tokens | none | 0 | none | none |
| workflows/WorkflowRunView.svelte | all literals to tokens or ladder; `--rail-gap` set on the column; `<style>` deleted | none | 0 | none | none |
| workflows/WorkflowStatus.svelte | `--pad-y: 3px` → `py-space-1` | none | 0 | none | none |

No kind-5 declarations, no "needs variant", no "needs transition token", no `important kept`, no `shadow kept residual`, no `shadcn variant:` (none of the eight data variants used), no R2/R3 sites, no cross-file hook (no class here is selected from another file; `data-slot` and `data-*` hooks untouched).

## Theme additions

theme: variant node-focus-visible
```css
/* A workflow node whose xyflow wrapper holds keyboard focus (WorkflowNodeCard): the card inside draws the focus ring. */
@custom-variant node-focus-visible (:where(.svelte-flow__node:focus-visible) &);
```

theme: utility xy-handle-brand
```css
/* xyflow's handle reads --xy-handle-background-color; its sheet is unlayered, so the colour goes through the property, not a rule on the handle. */
@utility xy-handle-brand {
  --xy-handle-background-color: var(--brand-solid);
}
```

## Tokens

token: --c-wf-node-w 260px — a workflow graph node card's width (WorkflowNodeCard); a real component dimension, no ladder step (`--c-map-node-w` is the preview map's 264px card, another component)
token: --c-wf-code-min-h 320px — the workflow program well's floor so the editor never collapses (WorkflowProgram); a real component dimension
token: --c-wf-scroll-max-h 30dvh — the cap of an inline scroll region on a workflow page: the problems list and the run log (WorkflowProgram, WorkflowRunView); a viewport share, no ladder step
token: --c-dialog-max-h 90dvh — a dialog's height cap before its body scrolls (WorkflowLaunch); a viewport share, no ladder step
(the 72ch reading measure is the merged `c-measure`, written `max-w-c-measure` in WorkflowRunView:285 and :337; no `token:` line)
token: --c-pointer-floor 24px — already logged by L00-kit-sheets.md (the 24 Pointer Rule); WorkflowNodeCard reads it for the port column's hit width

## Kit swaps

kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:141 DialogContent width="form" — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:142 DialogContent `max-h-(--c-dialog-max-h) overflow-y-auto` — a dialog whose body scrolls past a viewport cap (`scroll="capped"`)
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:252 Skeleton `h-icon-md` — a title's word bar at its icon height (`height="x-height"` or a title height)
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:253 Skeleton `h-space-7` — a run row's bar (`height="row"`)
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:254 Skeleton `h-space-7` — the same
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:345 CardContent `flex flex-col` — the card's stacked body (`layout="stack"`)

## Removed

removed: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:283 `[data-slot="launch"] :global(button) { min-height: 44px }` (old line) — every button here already owns its touch size: `wf-btn` takes `--c-btn-h-lg` under `coarse` and `max-wide` (workflows.css:139-143) and the kit Button carries `touch-hit`; the rule made the directory picker's xs/sm buttons 44px on a desk pointer too
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowNodeCard.svelte:206 (old) `[data-slot="ports"] [data-slot="port"] :global(.svelte-flow__handle) { pointer-events: none }` — the port column's `data-slot="port-hit"` overlay is a later positioned sibling covering every handle (full height, 24px wide centred on them), so it is hit first and routes the event; the rule changed no hit
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:510 (old) `[data-run-view] > :global([data-run-block]) { --rail-gap: var(--rail-none) }` and `--rail-none: 0px` — `--rail-gap` is inherited; set once on the column it reaches RunBlock's rail rows with no rule into another file's root

## Fixed

fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:481 the log's fixed `height` (30dvh) → `max-height` — a box holding content grows; a two-line log no longer leaves a 30dvh empty well (defensive-css: `min-height`/`max-height`, not `height`)
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:252 the loading title bar `14rem` → `w-1/2` — a share of the column, never wider than it on a narrow screen
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowStatus.svelte:54 chip block padding 3px → `space-1` (4px) — the ladder step nearest the off-ladder value (DESIGN.md Layout)
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowNodeCard.svelte:113 glyph tile 28px → `c-row-lead` (28px, DESIGN.md: one 28px lead column)
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowNodeCard.svelte:179 port-column hit stops 17px → `space-5` (18px); the width and end offset read `--c-pointer-floor` instead of 24px / 12px

## Gaps

gap: apps/dashboard/src/lib/components/features/workflows/WorkflowCanvas.svelte:270 `[data-canvas] :global(.svelte-flow__handle) { background: … }` sets `background` directly, so the near-port highlight (`xy-handle-brand`, which sets xyflow's `--xy-handle-background-color`) is outranked until that rule reads the property too (another lane's file) — DESIGN.md: one source of truth per colour
gap: `@xyflow/svelte/dist/style.css` is imported unlayered and outranks `@layer` rules (as L14 noted); `node-focus-visible:outline-focus-ring` is a utility on the card, not on xyflow's rule, so it holds, but only if the custom variant sorts after `data-is-selected:` — integration's compare checks the focused-and-selected node

## Contracts

(none)

## Critique (interface-craft Design Critique, from markup and classes; ui-observer: Not verified)

No `/motion` bench or stories file renders these components in this workspace and the tokens added above are not in theme.css yet, so no rendered layout was measured; ui-observer's rule applies: the layouts are **Not verified**.
From the markup: the node card keeps one ring colour per state (selected, focused) and the 24px pointer hit holds at any zoom; the status chip's label and glyph stay on one cross axis (`mark-line`); the run page reads in one column on one measure (72ch). The findings are the `fixed:` and `gap:` lines above.
