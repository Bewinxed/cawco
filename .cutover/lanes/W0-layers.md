# W0-layers

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report: interface-craft (Design Critique, below), ui-observer (its `observer.browser.js` measured in the probe session, below).

better-ui rules followed: one way per detail (every floating surface on one role, so no surface draws two stacking rules); shadows and borders untouched (z only); no motion changed. better-layout rules followed: content bleeds, controls float (the bar, dock, toolbar and skip link each a named layer over the content they float on); order by importance (the role order is the reading of what must stand over what, not DOM order); a fix in the project's own system (`layer` tokens in the one token source, used through Tailwind 4.3's `z-(<custom-property>)`).

Base: 682ede287 (cutover-integration). Change only z at each site.

Sources:
- https://tailwindcss.com/docs/z-index: `z-(<custom-property>)` is "shorthand for z-[var(<custom-property>)]".
- https://bits-ui.com/docs/utilities/portal: Portal's only props are `to` ("Where to render the content when it is open. Defaults to the body.") and `disabled`. No top-layer option. bits-ui 2.19.5 dist: `use-floating-layer.svelte.js:111` copies the content's computed `zIndex` onto the floating wrapper; `menu.svelte.js:145` writes `2147483647` on its own fixed submenu-safe-area root (a pointer-events-none overlay, its own).
- https://github.com/huntabyte/bits-ui/discussions/1976: "you now have to explicitly apply z-index to the popover containers in order for it to layer the component correctly."
- vaul-svelte 1.0.0-next.7 `drawer-portal.svelte`: `<Dialog.Portal {to} …/>` (bits-ui's portal). svelte-sonner 1.2.1 `Toaster.svelte:582` `z-index: 999999999`, contained by the toast layer's own stacking context.

## Tokens

The `layer` group in `design/tokens/cawco.tokens.json` (`bun run tokens`; `apps/dashboard/scripts/build-tokens-apple.ts` maps the group to Swift's `Layer`). Bottom to top, 10 apart:

token: --layer-sticky 10 — a pinned head or column in a scroller (ToolMatrix): over the rows scrolling under it.
token: --layer-band 20 — the hub band's slot: over the page column it opens above.
token: --layer-pull 30 — the phone's edge-pull strip: over the page at the screen edge.
token: --layer-stage 40 — a canvas stage portalled over its slot: over the page and the pull.
token: --layer-dock 50 — a docked composer or its stand-in: over the transcript and its fades.
token: --layer-bar 60 — the top bar floating over a phone's tab row.
token: --layer-toolbar 70 — the task board's bulk bar: over the bar and dock, under the preview sheet.
token: --layer-sheet 80 — the phone's preview sheet host.
token: --layer-sheet-stage 90 — a canvas stage standing in that sheet.
token: --layer-bench 100 — a motion bench over the shell.
token: --layer-toast-held 110 — toasts while the navigation sheet is open: under its scrim.
token: --layer-float 120 — every floating surface (kit popover, menu, submenu, select, tooltip, dialog, sheet, drawer and their scrims, details and lead cards, hover panel, Files' float, lightbox).
token: --layer-flight 130 — a copy in flight across the page.
token: --layer-bench-controls 140 — a bench's own switches, over what the bench opens.
token: --layer-skip 150 — the skip link on focus.
token: --layer-toast 160 — toasts, over every surface.
token: --layer-screen-edge 170 — Safari's edge strips, over toasts.

Removed from the token source: `effect.z-bench` (49), folded into `--layer-bench`. DESIGN.md: `### Stacking` under Elevation & Depth (DESIGN.md:665–666).

## Inventory

Every z in apps/dashboard/src at the start sha, its class, and where it stands now. Local order (siblings in one component, 1–6 or -1, or a rank written by script within one list) stays numeric and is listed by count below.

| file:line (now) | was | element | stands over / under | now |
| --- | --- | --- | --- | --- |
| apps/dashboard/src/lib/cawco/ToolMatrix.svelte:305 | z-10 | sticky column head (Machine) | over the matrix cells scrolling under it / under all chrome | z-(--layer-sticky) |
| apps/dashboard/src/lib/cawco/ToolMatrix.svelte:366 | z-10 | sticky row head | same | z-(--layer-sticky) |
| apps/dashboard/src/lib/cawco/HubBand.svelte:281 | z-10 | hub band slot | over the page column / under the bar | z-(--layer-band) |
| apps/dashboard/src/lib/cawco/EdgePull.svelte:49 | z-15 | edge-pull strip | over the page edge / under a canvas stage | z-(--layer-pull) |
| apps/dashboard/src/lib/cawco/canvas/CanvasStages.svelte:132 | z-15 | canvas stage (portalled) | over the page and pull / under dock, bar | z-(--layer-stage) |
| apps/dashboard/src/lib/cawco/canvas/CanvasStages.svelte:132 | data-over-sheet:z-41 | canvas stage in the phone sheet | over the sheet host / under floats | data-over-sheet:z-(--layer-sheet-stage) |
| apps/dashboard/src/lib/cawco/transcript/Composer.svelte:2973 | z-20 | composer dock | over transcript and fades / under bar | z-(--layer-dock) |
| apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:314 | z-20 | decision page dock | same | z-(--layer-dock) |
| apps/dashboard/src/lib/cawco/project/ViewBar.svelte:126 | z-20 | view bar dock | same | z-(--layer-dock) |
| apps/dashboard/src/lib/cawco/ThreadPane.svelte:1117 | z-20 | no-composer note in the dock's place | same | z-(--layer-dock) |
| apps/dashboard/src/lib/cawco/Shell.svelte:1075 | max-desk:data-floating:z-20 | top bar floating on a phone | over the tab row and dock / under toolbar, sheets, floats | max-desk:data-floating:z-(--layer-bar) |
| apps/dashboard/src/lib/cawco/tasks/BulkBar.svelte:128 | z-40 | bulk toolbar (fixed) | over page, dock, bar / under preview sheet | z-(--layer-toolbar) |
| apps/dashboard/src/lib/cawco/side/SideSheet.svelte:319 | z-40 | preview sheet host (portalled) | over every page layer / under floats | z-(--layer-sheet) |
| apps/dashboard/src/routes/(app)/motion/delegate-tray/+page.svelte:246 | z-40 | bench over the shell | over the shell / under floats | z-(--layer-bench) |
| apps/dashboard/src/routes/(app)/motion/folder-proof/+page.svelte:293 | z-40 | bench over the shell | same | z-(--layer-bench) |
| apps/dashboard/src/routes/(app)/motion/head-tint/+page.svelte:252 | z-(--z-bench) 49 | bench over the shell | same | z-(--layer-bench) |
| apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:193 | data-under-nav:z-49 | toast layer while nav sheet open | over page layers / under the nav sheet's scrim | data-under-nav:z-(--layer-toast-held) |
| apps/dashboard/src/lib/components/ui/popover/popover-content.svelte:96 | z-50 | kit popover | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/tooltip/tooltip-content.svelte:26 | z-50 | kit tooltip | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/select/select-content.svelte:44 | z-50 | kit select | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-content.svelte:66 | z-50 | kit dropdown | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-sub-content.svelte:70 | z-50 | kit submenu | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/context-menu/context-menu-content.svelte:43 | z-50 | kit context menu | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/context-menu/context-menu-sub-content.svelte:73 | z-50 | kit context submenu | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/dialog/dialog-content.svelte:87 | z-50 | kit dialog | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/dialog/dialog-overlay.svelte:17 | z-50 | dialog scrim | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/alert-dialog/alert-dialog-content.svelte:41 | z-50 | kit alert dialog | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/alert-dialog/alert-dialog-overlay.svelte:17 | z-50 | alert scrim | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte:102 | z-50 | kit sheet (rail sheet) | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/sheet/sheet-overlay.svelte:17 | z-50 | sheet scrim | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:166 | z-50 | kit drawer (vaul) | float | z-(--layer-float) |
| apps/dashboard/src/lib/components/ui/drawer/drawer-overlay.svelte:21 | z-50 | drawer scrim | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/files/FilesFloat.svelte:162 | z-50 | Files' floating panel (kit-pop) | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/lightbox/Lightbox.svelte:233 | z-50 | lightbox (bits dialog) | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/HoverPanel.svelte:198 | side-right:z-40 | hover panel beside a list | float | side-right:z-(--layer-float) |
| apps/dashboard/src/lib/components/features/workflows/TemplateInput.svelte:140 | z-30 | inline completer listbox (kit-pop) | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1901 | z-60 | session details card (HangCard on bits' bare Popover.Content) | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/project/CawThread.svelte:372 | z-60 | Caw's lead card (kit Popover.Content) | float, from the kit | removed (the kit's) |
| apps/dashboard/src/lib/cawco/find/MentionField.svelte:783 | z-60 | mention tooltip (inline, fixed) | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1817 | z-81 | new-session drawer content (kit DrawerContent) | float, from the kit | removed (the kit's) |
| apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1851 | z-80 | new-session scrim | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1860 | z-81 | new-session card | float | z-(--layer-float) |
| apps/dashboard/src/lib/cawco/spawn/ns-theme.css:350 | z-index: 90 | new-session popovers (ns-pop) | float | var(--layer-float) |
| apps/dashboard/src/routes/dev/finder/+page.svelte:170 | z-20 | dev finder sheet | float | z-(--layer-float) |
| apps/dashboard/src/routes/dev/finder/+page.svelte:192 | z-20 | dev finder card | float | z-(--layer-float) |
| apps/dashboard/src/app.css:2715 | z-index: 50 | `.lift-copy` words in flight | over floats | var(--layer-flight) |
| apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:1816 | zIndex "50" (script) | preview close flight | over floats | "var(--layer-flight)" |
| apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:363 | z-index:50 (script) | chip copy in flight | over floats | var(--layer-flight) |
| apps/dashboard/src/routes/(app)/motion/mac-readiness/+page.svelte:108 | z-60 | bench switches | over floats the bench opens | z-(--layer-bench-controls) |
| apps/dashboard/src/routes/(app)/motion/usage-relay/+page.svelte:125 | z-60 | bench switches | same | z-(--layer-bench-controls) |
| apps/dashboard/src/lib/cawco/Shell.svelte:956 | z-100 | skip link | over the shell / under toasts | z-(--layer-skip) |
| apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:193 | z-1000 | toast layer | over every surface | z-(--layer-toast) |
| apps/dashboard/src/lib/cawco/ScreenEdges.svelte:103 | z-1001 | top edge strip | over toasts | z-(--layer-screen-edge) |
| apps/dashboard/src/lib/cawco/ScreenEdges.svelte:112 | z-1001 | bottom edge strip | over toasts | z-(--layer-screen-edge) |
| apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1957 | z-30 | prompt section in the card | over its sibling sections (local) | z-1 |
| apps/dashboard/src/lib/components/ui/select/select-scroll-up-button.svelte:15 | z-10 | scroll button in the select | over its items (local) | z-1 |
| apps/dashboard/src/lib/components/ui/select/select-scroll-down-button.svelte:15 | z-10 | scroll button in the select | same | z-1 |
| apps/dashboard/src/lib/components/ui/resizable/resizable-handle.svelte:63 | z-10 | the handle's grip, a flex child | over the handle's own line (local) | z-1 |
| apps/dashboard/src/lib/components/ui/tooltip/tooltip-content.svelte:40 | z-50 | tooltip arrow, inside the tooltip's context | local | z-1 |
| apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:166 | before:-z-10 | the drawer's drawn surface | under its own content (local) | before:-z-1 |
| apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:169 | z-40 (hosted) | hosted drawer inside the sheet host's context | under its scrim, inside the host (local) | z-1 |

Not page layers, unchanged: 104 numeric local-order sites (`z-0` to `z-6`, `-z-1`, `z-index: 1/2/-1` in app.css, `zIndex: -1` DecisionGraph.svelte:81, `"z-index": "1"` route.svelte.ts:166) and 9 script-ranked local orders inside one list: TreeMark.svelte:134 `z-(--mark-z)` (`--mark-level`, default 2), PaneTabs.svelte:1033 `var(--z, 1)`, PaneTabs.svelte:1448 `z-(--drop-z)` ×2 (`--stack-top + 1`), TabsList.svelte:1122 `z-[var(--z,var(--z-rest,1))]` (tab ranks), TabsList.svelte:1173 `z-(--ring-z)` (`--stack-top + 2`), hang-outline.ts:65 (copies its card's own z, now `--layer-float`), lift/+page.svelte:100 and :204 (the bench's ranks).

## Removed

DESIGN.md:767 below is the line at the start sha; with the Stacking paragraph above it, it is DESIGN.md:772 now, and reads "portalled to the body on the floating layer as every floating surface is (Stacking)", since no kit surface stands in the top layer (gaps).

removed: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1901 z-60 → the float role — the details card stood 10 over every kit popover, so a menu or select opened from inside the card drew under it; one float role and portal order (the one opened last is later in the body) puts it over. DESIGN.md:767 "in the top layer as every floating surface is".
removed: apps/dashboard/src/lib/cawco/project/CawThread.svelte:372 z-60 — the lead card is the kit popover, which carries the float role; the 60 put it over popovers opened from it. DESIGN.md:767.
removed: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1817 z-81 — the kit DrawerContent carries the float role; the caller's own z was a duplicate. DESIGN.md:767.
removed: NewSessionDialog.svelte:1851 z-80, :1860 z-81, ns-theme.css:350 z-index 90 — a private three-step ladder over the kit's 50; now the float role, ordered by opening as every floating surface is. DESIGN.md:767.
removed: MentionField.svelte:783 z-60 — a tooltip at its own number over the kit's tooltips; the float role. DESIGN.md:767.
removed: design/tokens/cawco.tokens.json `effect.z-bench` (49) — folded into `--layer-bench`.

## Gaps

gap: apps/dashboard/src/lib/components/ui/popover/popover-content.svelte:92 (PopoverPortal) — bits-ui Portal renders into the body, not the top layer; Portal's props are `to` and `disabled` only (bits-ui.com/docs/utilities/portal), so no top-layer option exists. DESIGN.md:767 "in the top layer as every floating surface is".
gap: tooltip-content.svelte:23, select-content (Select.Portal), dropdown-menu-content / -sub-content, context-menu-content / -sub-content — the same bits-ui Portal, the same lack of an option. DESIGN.md:767.
gap: dialog-content.svelte, alert-dialog-content.svelte, sheet-content.svelte:92 (SheetPortal) and their overlays — bits-ui Dialog renders a portalled `div role=dialog`, never a `<dialog>` with `showModal()` (no `showModal` in bits-ui 2.19.5 dist). DESIGN.md:767.
gap: drawer-content.svelte:154 (DrawerPortal) — vaul-svelte's portal is bits-ui `Dialog.Portal` (drawer-portal.svelte). DESIGN.md:767.
gap: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:20–68 — the toast layer's move into an open `<dialog>` serves a top-layer modal the app no longer renders (no `<dialog>` or `showModal` in apps/dashboard/src); its z now orders it over every float. Kept: not z, and not this lane's to remove.

## Rendered reads

`bun scripts/probe-kit/run.ts web layer-stack` (scripts/probe-kit/specs/web/layer-stack.ts, one Chromium, the kit's dev server on `CAWCO_DEV_HUB_URL`'s bench hub). Each chain is `document.elementsFromPoint` at the overlap, top first, `name@z` (the hit's nearest data-slot and its stack's computed z-index):

- head-tint, the bar's centre: `swap@100 > slot@auto > top@auto > shell-main@auto > shell@auto > body@auto > html@auto`: PASS, the bench (100) over the shell's top bar.
- head-tint, the details card's centre: `session-details@120 > details-measure@120 > details-morph@120 > div@120 > row@100 > … > swap@100 > sidebar-group@auto > … > html@auto`: PASS, the card (120) over the bench (100) and the bar under it.
- popover over a sticky head (overlays bench; a `sticky z-(--layer-sticky)` head set across the popover's place): `button@120 > popover-content@120 > div@120 > probe-sticky-head@10 > probe-scroller@auto > …`: PASS.
- skip link on focus: `skip@150 > swap@0 > sidebar-menu-button@auto > … > html@auto`: PASS.
- rail sheet at 680 (lift bench), over the bar: `sidebar-menu-button@120 > … > sheet-content@120 > sheet-overlay@120 > slot@auto > top@auto > …`; beside it: `sheet-overlay@120 > slot@auto > top@auto > …`: PASS ×2.
- `ALL PASS (1 specs, 26s, 8 note(s))`.

ui-observer (`PROBE_UI_OBSERVER=<skill>/observer.browser.js`, same session): the details card open: 23 observations `{"sibling-padding-differs":3,"small-tap-target":1,"near-miss-alignment":19}`; the rail sheet open at 680: 639 `{"sibling-padding-differs":11,"sibling-gaps-differ":11,"horizontal-overflow":14,"text-clipped":2,"near-miss-alignment":601}`. A z-index moves no box, so these are the surfaces' own layout, not this lane's; listed for the audit.

## Design critique (interface-craft)

- Hierarchy: the order now reads as the person's attention does: content, then the chrome that floats on it (dock, bar, toolbar, sheet), then anything they opened (float), then what the system says (toast), then the device's own edge. Before, the new-session card sat at 81 with its popovers at 90 while the kit's sat at 50, and a details card at 60 hid the menus it opened.
- Consistency: one role per kind of surface. The floating surfaces had five numbers (30, 40, 50, 60, 80/81/90); now they have one, ordered by which was opened last.
- Remaining weakness: "float" leans on portal order, which is what the top layer gives natively. The top-layer move (gaps above) is the real fix, and it would retire `--layer-float`, `--layer-toast-held` and the sonner dialog shuffle.

## Files

apps/dashboard/src/app.css, apps/dashboard/src/lib/cawco/canvas/CanvasStages.svelte, apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte, apps/dashboard/src/lib/cawco/EdgePull.svelte, apps/dashboard/src/lib/cawco/files/FilesFloat.svelte, apps/dashboard/src/lib/cawco/find/MentionField.svelte, apps/dashboard/src/lib/cawco/HoverPanel.svelte, apps/dashboard/src/lib/cawco/HubBand.svelte, apps/dashboard/src/lib/cawco/lightbox/Lightbox.svelte, apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte, apps/dashboard/src/lib/cawco/project/CawThread.svelte, apps/dashboard/src/lib/cawco/project/ViewBar.svelte, apps/dashboard/src/lib/cawco/ScreenEdges.svelte, apps/dashboard/src/lib/cawco/Shell.svelte, apps/dashboard/src/lib/cawco/side/SideSheet.svelte, apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte, apps/dashboard/src/lib/cawco/spawn/ns-theme.css, apps/dashboard/src/lib/cawco/tasks/BulkBar.svelte, apps/dashboard/src/lib/cawco/ThreadPane.svelte, apps/dashboard/src/lib/cawco/ToolMatrix.svelte, apps/dashboard/src/lib/cawco/transcript/Composer.svelte, apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte, apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte, apps/dashboard/src/lib/components/features/workflows/TemplateInput.svelte, apps/dashboard/src/lib/components/ui/{alert-dialog/alert-dialog-content, alert-dialog/alert-dialog-overlay, context-menu/context-menu-content, context-menu/context-menu-sub-content, dialog/dialog-content, dialog/dialog-overlay, drawer/drawer-content, drawer/drawer-overlay, dropdown-menu/dropdown-menu-content, dropdown-menu/dropdown-menu-sub-content, popover/popover-content, resizable/resizable-handle, select/select-content, select/select-scroll-down-button, select/select-scroll-up-button, sheet/sheet-content, sheet/sheet-overlay, sonner/sonner, tooltip/tooltip-content}.svelte, apps/dashboard/src/routes/(app)/motion/{delegate-tray, folder-proof, head-tint, mac-readiness, usage-relay}/+page.svelte, apps/dashboard/src/routes/dev/finder/+page.svelte, design/tokens/cawco.tokens.json, apps/dashboard/scripts/build-tokens-apple.ts, DESIGN.md, scripts/probe-kit/specs/web/layer-stack.ts; generated by `bun run tokens`: apps/dashboard/src/lib/tokens/tokens.css, packages/hub/skills/decision-page/kit/tokens.css, apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Generated/Tokens.swift.
