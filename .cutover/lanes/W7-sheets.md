# W7-sheets: the last two sheets outside the kit

Start sha 682ede2877621d672bb0b38815e7d56370494dec. The lane dissolves `workflows.css` into its users and moves ViewCalendar's `<style>` into app.css's components layer. Then it verifies the foreign-DOM sheet classes it owns.

## Skills loaded
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable (context loader run), svelte-foundations:coding, interface-craft (Design Critique, below), ui-observer (observer.browser.js run in the lane's Playwright session, below). emil-design-eng and transitions-dev were not loaded: the lane adds no transition, animation, `@keyframes` or `in:`/`out:` directive. It keeps the existing `in:unfold`/`crossIn` directives unchanged.

## Rules followed
- better-ui, "Transition only what changes": no `transition-all` was introduced. The calendar button keeps `transition: background-color`.
- better-ui, "Contain scroll inside overlays": the overlays keep their kit scroll containment. No new scroller was added.
- better-layout, "Group with space, not lines": wells part by space (`gap-space-3` inside, `gap-space-4` between groups), and no separators were added.
- better-layout, "Align to shared edges": every field stacks on one column edge. Each field label is `flex flex-col gap-space-2`.
- better-layout, "Plan for growth and clipping": fields are `w-full min-w-0`, and two-up field rows are `grid-cols-2` (`repeat(2, minmax(0, 1fr))` in v4) collapsing to one column at `max-wide`/`coarse`. Every `flex` row of controls is `flex-wrap`.
- better-layout, "Logical properties": the calendar block keeps its logical properties (`margin-inline`, `inline-size`, `border-start-end-radius`…).
- defensive-css: `min-w-0` on every flex/grid child that holds text or a field; `wrap-anywhere` kept on the error and problem text.
- Tailwind v4.3.3: utilities and theme keys only, `@layer components` for foreign DOM (tailwindcss.com/docs/adding-custom-styles#adding-component-classes), no `@apply`, no arbitrary values introduced.

deleted-file: apps/dashboard/src/lib/components/features/workflows/workflows.css

## Files found by tracing the `.wf` descendant rules
- `WhenFields.svelte`: `.wf label`, `.wf input:not([type="checkbox"])` and `.wf select` styled its three fields; it renders inside WorkflowInspector.svelte (the branch cases and the edge inspector). Added to the list with the parent's approval and swapped onto kit Input/NativeSelect.
- Traced and not added, because they draw no element those rules reach, or the rule matched what the kit already draws:
  - `DirectoryPicker.svelte` and `WorkflowEdge.svelte`: kit `Button`s, reached only by `.wf button:disabled` (opacity 0.5), the same value the kit draws (`disabled:opacity-50`).
  - Kit Tabs triggers in the editor: same `.wf button:disabled` case.
  - `EmptyState`, `Skeleton`, `MorphText`, `Resizable`, `WorkflowStatus`, `Tip`, `FlowAutoFit`, `FlowZoomTracker`, `CodeView`, `WorkflowNodeCard`, `WorkflowCanvas`: no `h1`–`h3`, `label`, field or `pre` element.
  - Dialog, Drawer, ContextMenu and DropdownMenu content renders in a portal outside every `.wf` host.
- `vite.config.ts`: added with the parent's approval for the Event Calendar layering (see Theme additions and Fixed).

## Variant table
| Kit part · variant | Role (DESIGN.md) | DESIGN.md line | Sites |
| --- | --- | --- | --- |
| Button `outline` (default size) | Outline, the default kit look | Buttons: "Outline (default kit look): raised surface, 1px `border-button-outline` edge (3:1)"; "Default 36px tall with 14px padding" | every `wf-btn` (61 sites; list under Kit swaps) |
| Button `default` | Primary, the coral action | Buttons: "Primary: the coral `action-surface` gradient over `action-solid`" | every `wf-btn wf-primary`: New workflow, Run workflow, Start run |
| Button `ghost` | Ghost, transparent until hovered | Buttons: "Ghost: transparent until hovered or expanded" | the run filters (`wf-btn[data-variant="quiet"]`) |
| Button `outline` `size="icon"` | icon sizes match (36) | Buttons: "Icon sizes match (36, 30, 24, 44)" | palette toggle, zoom out/in, fit, undo, redo |
| Toggle `outline` | a compact pressed control | Segmented controls and tabs / The Press Rule | Select/Pan |
| ToggleGroup `type="single"` | Segmented | Segmented controls and tabs: "Segmented (`kit-segmented`, used by Tabs and single toggle groups)" | Harness (claude / opencode / pi) |
| Input, Textarea, NativeSelect (no variant) | Inputs and fields | Inputs and fields: "36px tall, 10px radius, raised surface, 1px control edge, the extra-small shadow, body text" | every `.wf input/select/textarea` |
| Input/Textarea `face="mono" text="label"` | what is typed exactly | input.svelte variants: "the mono face for what is typed exactly (a path, a command, a key)" | every `wf-mono` field |
| Checkbox | Checkbox | Ticks and dots | every `.wf input[type=checkbox]` |
| Alert `destructive` | Alert, destructive | Alert: "Variants: default (recess), destructive, … (each its status pair)" | every `wf-error` |
| `type-label` on `h2`/`h3` | Label | Typography: "Label (500, 13px, 1.3): names, group headings" | every bare `h2`/`h3` under a `.wf` host |
| `type-title` on `h1` | Title | Typography: "Title (500, 18→20px, 1.25, −0.01em): page titles" | the Workflows page title |
| `type-meta text-ink-muted` | Meta | Typography: "Meta (400, 12px, 1.35): … hints" | every `wf-muted` |
| `flex flex-col gap-space-2 type-label text-ink-muted` on `label` | a field's label | Typography: "Label … names" | every `.wf label` |
| `rounded-well bg-surface-recess p-space-2` | a recessed well | Shapes: "The stat well uses 7px"; lane-delta-S S2 "well 7" | every `wf-well` |
| layout utilities | layout at the site | brief step 4 | `wf`, `wf-row`, `wf-spread`, `wf-stack`, `wf-fields`, `wf-check` |

## Kit swaps
112 sites in 9 files. File:line is the swapped element's opening tag after the change.
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:75 Button default — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:136 Alert destructive — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:262 Button outline — done
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:283 Button outline — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:466 Button outline icon — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:552 Button outline — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:600 Input — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:608 Button outline (label/pending) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:618 Button default — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:653,661 Button outline (figures tabular on :661) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:681 Alert destructive — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:683 Button outline (label/pending) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowEditor.svelte:781 Button ghost — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowCanvasTools.svelte:80 Toggle outline — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowCanvasTools.svelte:91,106,120,135,149 Button outline icon — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowProgram.svelte:33,60,68,72 type roles and layout utilities (no kit control) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:221,414,428,452,570,587,602,634,704,717,877,892,925,939,955,968,982,1032,1049,1085,1128,1167 Button outline — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:257 ToggleGroup single — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:226,232,277,306,313,334,343,360,366,390,400,478,496,511,547,627,689,747,776,814,826,844,860,911,1001,1012,1156,1187 Input (mono on :232, :776) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:242,292,374,524,643,737,787,1070,1196,1210,1224 NativeSelect — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:803,1124,1183 Textarea — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowInspector.svelte:409,503,732,1108 Checkbox — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:167,200,218,255 NativeSelect — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:179 Input, :236 Input mono — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:185 Textarea — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:263 Alert destructive — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowLaunch.svelte:266 Button outline, :275 Button default (label/pending) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/SchemaBuilder.svelte:56,128,146 Button outline — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/SchemaBuilder.svelte:92 Input, :103 NativeSelect, :123 Checkbox — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/JsonField.svelte:37 Textarea mono, :48 Alert destructive — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/TemplateInput.svelte:119 Textarea mono, :133 Input mono — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WhenFields.svelte:19,49 NativeSelect, :43 Input — done

The Validate, Retry save and Start run buttons take the kit Button's own `label`/`pending`/`pendingLabel`/`failed`. The kit runs `whileIdle` and sets `aria-busy`/`aria-disabled` itself, which is the same behaviour the hand-wired `PendingContent` and `whileIdle(...)` gave. The harness picker's handler moved to `onValueChange` with the same patch, guarded on a value. Its items are now `role=radio aria-checked` inside the fieldset's legend "Harness", which is the segmented control's own semantics. The checkboxes' handlers moved to `onCheckedChange(checked)` with the same patches. No copy changed.

## Removed
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css (282 lines) — a second, unowned recipe for buttons, fields, headings and wells, weighted by hand (`.wf .wf-btn` at (0,2,0), and the W1/W4 `:where()` exceptions). Every rule moved to the kit part or the utility its role names, above.
removed: apps/dashboard/src/app.css:4868 (start sha) `@import "./lib/components/features/workflows/workflows.css";` and its comment's mention of the sheet.
removed: WorkflowInspector.svelte harness buttons' `class:wf-primary={…}` — a state written as a class. At the start sha its cascade also lost to `.wf .wf-btn[aria-pressed="true"]` (0,3,0): the chosen harness drew `color: oklch(1 0 0)` (white) on `background: oklch(0.92 0.011 83)` (the light pressed fill), measured. Now the segmented control draws the choice (DESIGN.md Segmented).
removed: `.wf input, .wf select, .wf textarea { font: inherit }` — it set every field in the label's 13px/500 (measured `font-size: 13px; font-weight: 500`). DESIGN.md Inputs and fields says "body text"; the kit draws 14px/400.
removed: `.wf textarea { min-height: var(--c-wf-textarea-min); resize: vertical }` — DESIGN.md Inputs and fields says "Textarea: grows a line at a time … It scrolls past its ceiling". The kit Textarea's autosize does that.
removed: the 44px field and button heights under `max-wide` (a narrow fine-pointer screen) — DESIGN.md The 44 Touch Rule applies "On a coarse pointer", through `.touch-hit` "while its drawn size and the layout stay the same". The kit parts carry `touch-hit`.
removed: WorkflowEditor.svelte:600 name field's `border-transparent text-size-body font-medium` — DESIGN.md Inputs and fields gives a field its 1px control edge and body text, and names no borderless field.
removed: `.wf button:disabled { opacity: .5; cursor: not-allowed }` — the kit draws `disabled:opacity-50` (DESIGN.md Buttons "Disabled: 50% opacity") and `disabled:pointer-events-none`.
removed: `.wf pre { … }` — dead: no `<pre>` renders under any `.wf` host (traced above).
removed: WorkflowEditor.svelte palette dialog's `<div class="wf">` wrapper — its only role was the sheet's descendant hook; the palette now carries its own type and layout.
removed: apps/dashboard/src/app.css:21-23 `@import "@event-calendar/core/index.css" layer(vendor);` and its comment — a second copy of the library's sheet. The library's Calendar.svelte imports its own (`import './styles/index.css'`), which now takes the vendor layer where it enters the build (Theme additions). The built CSS carries the palette once: `--ec-today-bg-color:oklch(98.7%` occurs 1 time.
removed: apps/dashboard/src/lib/cawco/views/ViewCalendar.svelte `<style>` (122 lines) — moved whole to app.css `@layer components` (below).

## Tokens
No new token. `--c-wf-textarea-min` (90px) has 0 users in src after this lane (`grep` count 0); the token JSON is additions-only here, so its deletion is for integration (see finding).

## Theme additions
theme: component view-calendar
Event Calendar's DOM, on `[data-slot="view-calendar"]`: app.css, block headed `/* wave 2: W7-sheets */`, the old `<style>`'s 21 rules unchanged in value, plus `color-scheme: inherit` on `.ec` (Fixed).
theme: component svelte-flow-attribution
Svelte Flow's attribution, keyed on its four hosts `:is([data-slot="workflow-canvas"], [data-slot="view-canvas"], [data-slot="decision-graph"], [data-slot="canvas-map"]) .svelte-flow__attribution`. It was workflows.css's unkeyed rule; its size and weight are now the meta role (`font: var(--type-meta)`).
vite.config.ts `vendorComponentSheets` (the house's one transform for library-injected sheets) also wraps `node_modules/@event-calendar/core/src/styles/*.css` in `@layer vendor { … }`, every declaration as the library wrote it. No second plugin was added.

## Sheet classes
sheet: milkdown → foreign DOM — Milkdown Crepe 7.22.2 renders `.milkdown`; app.css keys it under `[data-slot="crepe-host"]` (MarkdownEditor.svelte:118). Stays.
sheet: milkdown-block-handle → foreign DOM — Crepe's block-edit feature renders it (`lib/cjs/feature/block-edit`), along with `.operation-item`. Stays, under crepe-host.
sheet: milkdown-code-block → foreign DOM — Crepe's code-mirror theme (`lib/theme/common/code-mirror.css`). Stays, under crepe-host.
sheet: milkdown-slash-menu → foreign DOM — Crepe's block-edit feature, along with `.tab-group li.selected`. Stays, under crepe-host.
sheet: cm-editor → foreign DOM — CodeMirror inside Crepe's code block (with `.cm-gutters`). Stays, under crepe-host.
sheet: prose → foreign DOM — @tailwindcss/typography's class on rendered markdown, which cannot carry classes. Host-keyed under `[data-slot="msg"]`, `release-notes` and `transcript-brief`; the palette restatement stays in `@layer utilities`, where the plugin writes `.prose`. Users: ui/markdown, TextSection, ErrorDialog, ToolProse. Stays.
sheet: svelte-flow → foreign DOM — @xyflow/svelte renders `.svelte-flow__node`, `__handle` and `__attribution`. Each rule is keyed on its canvas host (decision-graph, decision-node, workflow-canvas, view-canvas, and now all four for the attribution). Stays.
sheet: cawco-pswp → foreign DOM — PhotoSwipe appends its root to `<body>`, so no host `data-slot` can reach it; it is keyed on the `mainClass: "cawco-pswp"` Lightbox.svelte:112 passes. `.lines` and `.path` are the description Lightbox.svelte:62-66 builds. Stays.
No rule in these blocks matches nothing at the start sha: every class above is in the library's source or in our code that feeds it.

## Compiled check
`vite build` (Tailwind 4.3.3 through @tailwindcss/vite), the built CSS, read by `$TMPDIR/gate/ec-layers.mjs`: `css files 9; rules selecting .ec… by layer: {"components":17,"vendor":109}` and `unlayered .ec rules: 0`. The library's theme.css (an `@import` inside its index.css) sits inside `@layer vendor{`, inlined before the transform wraps the sheet. Emitted attribution selector: `:is([data-slot=workflow-canvas],[data-slot=view-canvas],[data-slot=decision-graph],[data-slot=canvas-map]) .svelte-flow__attribution`, in `@layer components`. It wins over @xyflow's sheet in `vendor` by layer order (`@layer theme, base, vendor, components, utilities, overrides`).

## Rendered check
One Playwright session (playwright-core 1.64.1, cached Chromium) against `vite dev` with a dead hub. The workflow API was fulfilled from a fixture by request interception. ViewCalendar was mounted through the dev server's own modules. 22 states were read at the start tree and after, at 1440×900 and 390×844. The calendar was read in light and dark.
- Calendar, light, 1440 and 390: 18 elements and the 23 `--ec-*` values, **0 differing values** against the start tree.
- Calendar, dark: every difference is a colour moving from its day value to its night token (e.g. `.ec-main background-color: oklch(0.993 0.004 85) -> oklch(0.248 0.006 70)`). No geometry changed. This is the dark fix below.
- Rules matching `.ec` after the change: `vendor` and `components` entries only, with no UNLAYERED one. In light and dark, every sampled `--ec-*` resolves inside `.ec` to its token's value on the page (`--ec-bg-color = --surface-raised = oklch(0.248 0.006 70)` at night).
- Workflow surfaces: the measured changes each land on DESIGN.md's numbers. Buttons are 36px tall, `font-size: 14px`, `border-radius: 10px`, `padding-left: 14px`, `gap: 8px`, with the `border-button-outline` edge. Icon buttons are 36×36. Fields are 36px, 10px radius, 14px/400. Headings are the label role (line-height 16.9px = 13 × 1.3); the title is 1.25 and meta 1.35. The segmented harness has a 10px groove radius, 3px padding and a 30px thumb under the chosen item.
- Behaviour: Add rule and Connect return to their placeholder after each pick (`after pick 1 … select shows: ""`, `after connect: 1 | shows: ""`). Picking `pi` disables Effort. The Problems count keeps `font-variant-numeric: tabular-nums`. Every field keeps its label (`labels=1`); the two unlabeled textareas are the kit Textarea's hidden autosize twin. 0 non-hub console errors.

## Design critique (interface-craft) and ui-observer
fixed: WorkflowInspector.svelte:257 the chosen harness was white text on the light pressed fill at the start sha — now the segmented control (DESIGN.md Segmented).
fixed: apps/dashboard/src/app.css (W7 block, `.ec`) the calendar drew its day palette at night: the library pins `.ec { color-scheme: light }`, which resolved every `light-dark()` token to its day half (measured `--ec-bg-color oklch(0.993 …)` vs `--surface-raised oklch(0.248 …)` in dark). `color-scheme: inherit` takes the page's scheme (DESIGN.md Elevation & Depth: "Every shadow token adapts through `light-dark()`").
fixed: apps/dashboard/vite.config.ts vendorComponentSheets: Event Calendar's own sheet entered the build unlayered (Calendar.svelte:2 `import './styles/index.css'`), outranking every layered house rule. At the start sha it was hidden only because the scoped `<style>` was unlayered too.
fixed: WorkflowInspector.svelte:524 and :1070 the Add rule and Connect selects stayed on the chosen option after acting on it: the kit select binds its value, so the old element-only reset was undone. The caller now owns the value (`ruleChoice`, `connectChoice[port]`) and resets it. Svelte delegates `change`, so the reset is the last write.
gap: WorkflowInspector.svelte:409,503,732,1108 and SchemaBuilder.svelte:123 kit Checkbox draws 16×16 with no fine-pointer hit area (ui-observer `small-tap-target … size 16x16 below WCAG 2.5.8 24px minimum`) — DESIGN.md The 24 Pointer Rule → W4-controls (kit Checkbox pointer-hit)
ui-observer kinds judged and left: `text-clipped`/`horizontal-overflow` in the Validate and Start run buttons is the pending label's cell (DESIGN.md Buttons: "Its pending wording is never drawn, only its accessible name"). `near-miss-alignment` entries sit inside the kit NativeSelect's chevron and the icons' own paths. `#bits-s13` is the shell's "Waiting for the hub" glass, outside the lane.
Critique: the primary action leads each header (Run workflow, New workflow), and every secondary action is the outline button at the same height. The forms read as one column of label-over-field groups in recessed wells, parted by space. The selection hue is gone from the harness picker (a hue now marks only the primary action). Nothing reads as a stray box.
