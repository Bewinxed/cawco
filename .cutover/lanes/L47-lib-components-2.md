# L47-lib-components-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

better-ui rules followed: transitions name their properties and never `all` (the pane glide is `flex-grow` only); hover styling stays under the `hover:` variant, which carries `@media (hover: hover)` (`group-[:hover]` became `group-hover:`); motion gated behind `prefers-reduced-motion: no-preference`; a nested scroller keeps its scroll (`overflow-y-auto` on the palette body); the press scale stays 0.96 through `--press-scale`.
better-layout rules followed: logical properties for anything that mirrors (`text-left` → `text-start`, `left-space-2` → `start-space-2`, `border-r` → `border-e`); a one-cell grid is `grid-cols-1 grid-rows-1` (`minmax(0, 1fr)`); min-height rather than height on boxes holding text; the palette scrolls inside the dialog body, so its title and description stay in view; 44px hit floor on coarse pointers and narrow screens (`c-btn-h-lg`).

## Files

| file | before | after |
| --- | --- | --- |
| CodeView.svelte | `<style>` ×1 (foreign-dom) | no `<style>`; the rule duplicated the CodeMirror theme's own `"&": { height: "100%" }` |
| TemplateInput.svelte | literal ×1, numeric props ×3 | tokens |
| WorkflowCanvas.svelte | literal ×1, numeric props ×2, `<style>` ×1 | tokens; xyflow's own handle variables; `<style>` kept with a docs reason |
| WorkflowCanvasTools.svelte | literal ×1, numeric prop ×1 | ladder step |
| WorkflowEdge.svelte | literal ×1, numeric prop ×1, `!important`, `<style>` | token; xyflow's own edge variables; no `<style>` |
| WorkflowEditor.svelte | literal ×8, numeric props ×11, `<style>` | tokens and kit variants; the pane glide is a theme component |
| WorkflowInspector.svelte | literal ×2, numeric props ×2 | tokens |

7 of 7 files done.

## Removed
removed: apps/dashboard/src/lib/components/features/workflows/CodeView.svelte:256 `[data-slot="code-view"] :global(.cm-editor) { height: 100% }` — duplicate: the EditorView theme's `"&": { height: "100%" }` (line 84) already sizes `.cm-editor`
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowEdge.svelte:42 `stroke: var(--focus-ring) !important` and the inline `stroke` it fought — xyflow's sheet reads `--xy-edge-stroke-selected` for a selected edge and for keyboard focus, so the cascade is fixed at the variable
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:858 `max-h-(--palette-max) overflow-y-auto` with inline `style="--palette-max: 85dvh"` on `Dialog.Content` — a kit `no-restyle` site; the scroll moved to the body div inside it
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:712 `style:--track="minmax(0, 1fr)"` with `grid-cols-(--track) grid-rows-(--track)` — `grid-cols-1 grid-rows-1` is that track
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:776 `max-wide:border-r-none` — not a Tailwind utility; the border is removed with `max-wide:border-e-0`
removed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:482 `style:--small-leading="1.4"` — the type role `text-meta` carries the meta line height

## Fixed
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowEdge.svelte:42 a selected edge now draws in the focus-ring colour as well as at double width (xyflow ties selected and keyboard focus to one variable) — DESIGN.md "Focus and hit areas": the ring colour marks the focused/selected element
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowEdge.svelte:57 `group-[:hover]:` → `group-hover:` — hover is guarded by the variant (`@media (hover: hover)`)
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:705 skeleton rows use the kit's `height="block"` (5rem, exactly the old literal), clearing two `no-restyle` flags
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:858 the palette dialog's scroll is on its body, not on the dialog, so the title and description stay in view
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:552 `left-space-2` → `start-space-2`; :819 `text-left` → `text-start`; :776 `border-r` → `border-e` (mirror correctly in RTL)
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowCanvas.svelte:181 the handle's colour comes through xyflow's `--xy-handle-background-color` (set on the section at :181–:182, and by `:active` in the theme component), never painted as `background`, so WorkflowNodeCard's `fine:data-near:xy-handle-brand` shows — the near port's brand colour
fixed: apps/dashboard/src/lib/components/features/workflows/WorkflowCanvas.svelte:177 `data-canvas` → `data-slot="workflow-canvas"` (a hook is `data-slot`)

## Tokens
token: --c-graph-canvas-min 300px — the least height of the workflow graph canvas (the editor's wrapper at WorkflowEditor.svelte:549 and the canvas section at WorkflowCanvas.svelte:176 were 300 and 280); real dimension, no ladder step reaches it
token: --c-graph-handle 10px — a connection handle's diameter on the workflow canvas (WorkflowCanvas.svelte:270); a component dimension, off the icon scale
token: --c-workflow-crumb 220px — flex basis of the workflow editor's breadcrumb (WorkflowEditor.svelte:592)
token: --c-workflow-name-max 300px — the workflow name field's longest width in the header (WorkflowEditor.svelte:599)
token: --c-workflow-save-w 24ch — the save-state readout's fixed width, so the MorphText swap moves nothing (WorkflowEditor.svelte:676); a typographic width
token: --c-workflow-runs-w 300px — the runs list column of the editor's Runs tab (WorkflowEditor.svelte:776)
token: --c-dialog-scroll-max 70dvh — the tallest scrolling body inside a dialog, leaving room for its title and description (WorkflowEditor.svelte:858); was 85dvh on the whole dialog
token: --c-completer-max-h 240px — the template-path completer's tallest list (TemplateInput.svelte:140)

## Theme additions
theme: component workflow-pane-glide
```css
@layer components {
  @media (prefers-reduced-motion: no-preference) {
    [data-slot="pane"]
      [data-pane-group]:has(
        > [data-pane-state="collapsing"],
        > [data-pane-state="expanding"]
      )
      > [data-pane] {
      transition: flex-grow var(--dur-panel) var(--ease-in-out);
    }
  }
}
```
Anchor: `data-slot="pane"` in WorkflowEditor.svelte:717. While paneforge marks a pane collapsing or expanding, every pane of the group glides to its width together; a drag stays 1:1. paneforge's sheet sets no `transition`, so a layered rule wins. The old `<style>` block at WorkflowEditor.svelte:902 is deleted.

theme: component workflow-canvas-handle
```css
@layer components {
  [data-slot="workflow-canvas"] .svelte-flow__handle {
    width: var(--c-graph-handle);
    height: var(--c-graph-handle);
  }
  /* A handle is placed by its transform, so its press is colour, not scale. */
  [data-slot="workflow-canvas"] .svelte-flow__handle:active {
    --xy-handle-background-color: var(--brand-solid);
  }
}
```
Anchor: `data-slot="workflow-canvas"` in WorkflowCanvas.svelte:177. xyflow's sheet is layered below `components` at integration, so the layered rule wins. The old `<style>` at WorkflowCanvas.svelte (the end of the file) is deleted.

## Kit swaps
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:868 Drawer.Title `sr-only` — a visually hidden title (`hidden="visually"`), the kit's own part
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:869 Drawer.Description `sr-only` — the same, a visually hidden description

## Contracts
(none)

## Residual `<style>` kept
none.

## Other lists
needs variant: none
needs transition token: none
literals preserved: none
breakpoint edges: `max-wide:` (≤1023px) kept as written on the palette items, the completer options and the runs column.
kind-5 declarations: none
shadcn/no-restyle hits: WorkflowEditor.svelte:868 DrawerTitle `sr-only`; :869 DrawerDescription `sr-only` (both logged as `kit-swap:` above). The Skeleton (2) and DialogContent (2) hits are cleared.
shadcn variant: none
R2 fixed: none · R3 fixed: none (TemplateInput.svelte:149 already reads `font-(family-name:--font-mono)`)
important kept: none
cross-file hook: none (the old `data-canvas` was selected only inside WorkflowCanvas.svelte)

## Critique (interface-craft, from markup and classes, against DESIGN.md)
fixed: the palette's two item rows and the crumb link now sit on the 44px coarse floor through `c-btn-h-lg`, the completer options on `c-btn-h` (36px) and `c-btn-h-lg` under `max-wide:`.
fixed: the zoom readout reads at the meta role (`text-meta`: size, line height and weight from one class), centred in a `space-8` minimum so it does not jitter from 9% to 100%.
gap: apps/dashboard/src/lib/components/features/workflows/workflows.css (`wf`, `wf-stack`, `wf-row`, `wf-btn`, `wf-muted`, and the bare `h2`/`h3` the palette relies on) — a shared sheet owned by the shared-sheets item, used at WorkflowEditor.svelte:476 — DESIGN.md "Typography": one role per element.
gap: apps/dashboard/src/app.css `.pressable` (and apps/dashboard/src/lib/components/ui/button/button.svelte:23 `press="pressable"`) — WorkflowEdge.svelte:55's delete-edge control is a hand-built icon button whose press goes through `--tpress` on `transform`, because the lint refuses `scale` utilities at two states together; the kit's pressable press, applied on a kit Button there, replaces it — DESIGN.md "Motion": one press for every pressable.
gap: apps/dashboard/src/lib/components/features/workflows/WorkflowNodeCard.svelte:184 `calc(-12px / var(--hit-scale, 1))` literals in the node card (another lane's file) — DESIGN.md "Focus and hit areas".
ui-observer: no `/motion` bench or stories file renders these components in this workspace, so no rendered layout was read; geometry is checked from the classes only (Not verified in a browser).
