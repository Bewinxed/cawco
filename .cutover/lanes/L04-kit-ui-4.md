# Lane L04-kit-ui-4 (kit: skeleton, sonner, spinner, table, tabs)

Merge base: f5c5024ab (cawco/cutover-merge). A kit lane: it adds opt-in variants for the inventory's no-restyle sites and clears its own relics. No part's default look changed.

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report, interface-craft and ui-observer.

## Files

| file | what changed | residual `<style>` | relics after |
| --- | --- | --- | --- |
| ui/skeleton/skeleton.svelte | height `x-height`, `picture`; width `age`; radius `line`; cell `glyph`; new axis `type: label` | none | 0 |
| ui/sonner/sonner.svelte | 12px literal → `--c-bar-phone-edge`; the two `!important` reduced-motion rules removed; toasts take taps through `toastOptions.class="pointer-events-auto"` (the foreign-DOM rule removed); under reduced motion toasts fade in and out through the Web Animations API (script); `<style>` carries its docs reason | kept, reason below | 0 |
| ui/spinner/spinner.svelte | nothing: every site's `size-4` is the default `size-icon-md` | none | 0 |
| ui/table/table-head.svelte | variant `band` | none | 0 |
| ui/table/table-row.svelte | nothing: every site maps to the existing `band` | none | 0 |
| ui/table/table.svelte | variant `layout: ledger`; `spacing: flush` no longer reads a caller's `--none` | none | 0 |
| ui/tabs/tabs-content.svelte | variant `layout: column` (now a `tv`) | none | 0 |
| ui/tabs/tabs-list.svelte | nothing: its one site is placement only | none | 0 |

`<style>` kept (sonner.svelte), first line: `/* tailwind: sonner's own sheet is unlayered, and every Tailwind layer (components, utilities) loses to an unlayered rule, so the overrides of sonner's declarations stay unlayered here — https://tailwindcss.com/docs/adding-custom-styles#adding-component-classes */`. Every rule left in it overrides a declaration svelte-sonner 1.2.1 sets unlayered (`Toaster.svelte`'s `<style>`: the styled toast's radius, shadow and font, its button, its transitions and `--y`, the swipe-out animation timing, and the narrow toaster's position). Tailwind places its components and utilities in cascade layers ("Use the `components` layer for any more complicated classes you want to add to your project that you'd still like to be able to override with utility classes"), and a layered declaration loses to any unlayered one, so a `theme: component` rule could not win here.

## Variants

variant: apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:170 Skeleton height="picture" — a card's picture well (16:10; the kit's default 8px radius is the old `radius-sm`); `w-full` stays the site's
variant: apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:171 Skeleton height="x-height" radius="line" — a card name's word bar at the text's x-height, hair corners; `w-3/5 my-space-2` (60%, `--space-2` block margin) stay the site's
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:627 Skeleton cell="glyph" radius="text" — a row's 16px kind glyph, 5px mark corners (`size-icon-md rounded-xs`)
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:630 Skeleton type="label" height="x-height" radius="line" — a row name's word bar in the label role; its share width stays the site's
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:633 Skeleton type="label" height="x-height" width="age" radius="line" — a row's relative age, two label characters wide; `ms-auto` stays the site's
variant: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead variant="band" — a ledger band's heading (the mark column; its width `calc(var(--c-row-lead) + var(--space-3))` stays the site's; its old `padding-inline-end: 0` drew nothing, the cell holds only sr-only text)
variant: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:108 TableHead variant="band" — a ledger band's heading (Action)
variant: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:112 TableHead variant="band" — a ledger band's heading (Status); `w-c-routine-time-w` stays the site's
variant: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:116 TableHead variant="band" — a ledger band's heading (When); its width stays the site's
variant: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:167 TableHead variant="band" — a ledger band's heading (When); its width stays the site's
variant: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:171 TableHead variant="band" — a ledger band's heading (Outcome); its width stays the site's
variant: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:175 TableHead variant="band" — a ledger band's heading (Took); its width and its narrow-container hide stay the site's
variant: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:179 TableHead variant="band" — a ledger band's heading (Result)
variant: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:102 TableRow variant="band" — the header's band; `band border-0` is exactly the existing `band` (`border-0 bg-surface-band`), both classes go
variant: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:165 TableRow variant="band" — the header's band; `band border-0` is exactly the existing `band`, both classes go
variant: apps/dashboard/src/lib/cawco/MachineInventory.svelte:166 Spinner (default) — an inline wait; `size-4` is the default `size-icon-md` (16px), drop it; `shrink-0` stays the site's
variant: apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:685 Spinner (default) — an inline wait; drop `size-4`, `shrink-0` stays the site's
variant: apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:881 Spinner (default) — an inline wait; drop `size-4`, `shrink-0` stays the site's
variant: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:911 Table layout="ledger" — the routines ledger: fixed columns, separate flush cells (main's `.ledger table.routines { border-collapse: separate; border-spacing: 0 }`); `routines` and `table-fixed` both go
variant: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:959 Table layout="ledger" — the sources ledger (main's `.ledger table.quiet`, same rule); `quiet` and `table-fixed` both go
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:461 TabsContent layout="column" — a pane whose scroller takes its height (`flex min-h-0 flex-col`); `files-pane` goes
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:468 TabsContent layout="column" — the same, for the attachments pane; `files-pane` goes
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:441 TabsList (none) — placement only: `files-segments` (`margin-block-start: var(--space-1)`) becomes `mt-space-1` on the site

note: integration may also move these non-inventory sites onto the new variants (same roles): ActionsTable.svelte:98, RoutineDetail.svelte:161, ProjectSpend.svelte:470 and TaskTable.svelte:230 (`table-fixed border-separate` + `spacing="flush"`/`"gap"` with `--none`/`--cell-gap` set to 0) → `layout="ledger"` (plus the site's own `max-phone:block`); ViewRoutines.svelte:917–976 (the heads of both ledgers) and ProjectSpend.svelte:478, :578 (`variant="caps" class="h-c-toolbar-ctl"`) → `variant="band"`.

K1/K2: none in this lane's list (no copy-button, input-group or collapsible-trigger part).
variant-order flags in this lane's files: none (eslint reports none).

## Tokens

token: --c-skeleton-x-height 1ex — a placeholder word's bar, as tall as the x-height of the text it stands in (the files list's and artifact cards' ghost names and ages); it follows the type role, so no ladder step fits. Used as `h-(--c-skeleton-x-height)` (Skeleton `height: x-height`).
token: --c-skeleton-age 2ch — a relative age's placeholder ("3d"): two characters of its type role; a typographic width, no ladder step. Used as `w-(--c-skeleton-age)` (Skeleton `width: age`).

Until integration adds both, the two variants compute `auto`; no site uses them yet.

## Removed

removed: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:124 `<!-- literal: 12px … -->` and :136 `style:--toast-edge="12px"` — a hand-kept length; the phone toast's side inset is now `var(--c-bar-phone-edge)` (12px, "the phone bar's two ends … stand this far in from the screen's edges"), so a toast lines up with the bar's ends
removed: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:253–261 the reduced-motion `transition: opacity … !important` pair — it existed only to beat svelte-sonner 1.2.1's own `@media (prefers-reduced-motion) { [data-sonner-toast] { transition: none !important; animation: none !important } }` (Toaster.svelte:1278–1285); no declaration beats an unlayered important one without `!important`. Under reduced motion the fade comes from the script instead (fixed below)
removed: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:166 `[data-slot="toast-layer"] :global([data-sonner-toast]) { pointer-events: auto }` — replaced by `pointer-events-auto` on each toast through sonner's own `toastOptions.class` (merged with any caller's toastOptions)
removed: apps/dashboard/src/lib/components/ui/table/table.svelte:15 `border-spacing-(--none)` — the `flush` spacing read a variable its callers had to define as 0 (`style:--none="0"`); it is `border-spacing-0` now, the same computed value with no caller contract

## Fixed

fixed: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte toast hit-testing — a hidden toast (`data-visible="false"`) now never takes a tap: sonner's own `pointer-events: none` there is unlayered and beats the utility; the old unlayered rule tied with it on specificity and won or lost by sheet order — DESIGN.md Toast ("A toast never paints over navigation")
fixed: apps/dashboard/src/lib/components/ui/sonner/sonner.svelte:70–171 reduced motion — a toast fades in over `--dur-panel` and out over `--dur-exit`, both on `--ease-out` (read through `dur()`/`ease()`), by a Web Animations API opacity animation per arriving or `data-removed` toast, asked through `motionOk`; svelte-sonner's important-flagged `animation: none` does not reach a WAAPI animation, so no `!` is needed. A toast sonner keeps hidden (`data-visible="false"`) stays hidden; with motion allowed nothing changes — DESIGN.md Reduced Motion Rule ("Reduced motion means stillness. It does not mean an instant swap.") and Toast
fixed: apps/dashboard/src/lib/components/ui/table/table.svelte `layout: ledger` restores main's separate, flush cells for the routines and sources ledgers (on the merge `class="routines table-fixed"` left them collapsed) — DESIGN.md Layout, Density (a 32px header band over 44px rows, ruled per row)
fixed: apps/dashboard/src/lib/components/ui/table/table-head.svelte `band` gives the ledgers' heading its 32px band height in the kit instead of each site's `h-c-toolbar-ctl` — DESIGN.md Layout, Density ("a 32px header band")

## Gaps

integration: apps/dashboard/src/lib/components/ui/table/table.svelte:15, :23 the two `eslint-disable-next-line shadcn/no-raw-colors` lines answer a misread in @shadcn/lint 0.2.1 (its COLOR_PREFIX takes `border-spacing-0` for a border colour); 0.2.3 maps border-spacing to spacing. The bump to 0.2.3 and the removal of both lines after it are integration's (orchestrator's decision), left as they are here
gap: apps/dashboard/src/lib/components/ui/table/table-head.svelte:6 the default look `h-12 px-3 text-left … [&:has([role=checkbox])]:pr-0` uses numeric spacing and physical sides (`text-left`, `pr-0`) — DESIGN.md Layout (the ladder) and logical properties; changing it changes the part's default look, so it is left for the audit
gap: apps/dashboard/src/lib/components/ui/skeleton/skeleton.svelte:13–22 the height/width axes are numeric Tailwind steps (`h-6` … `h-64`, `w-6` … `w-40`), not ladder or `--c-*` tokens — DESIGN.md Layout; existing values, kept by delta C
gap: apps/dashboard/src/lib/components/ui/table/table.svelte:13 `spacing: gap` still reads a caller's `--cell-gap`; its one Table caller (TaskTable.svelte:223) sets it to 0, so it is `layout="ledger"` in effect (note above)

## Theme additions

None.

## Kit swaps

None (this is the kit lane; its sites are the `## Variants` lines above).

## Contracts

None.

## Critique (interface-craft, Design Critique, from markup and classes against DESIGN.md)

Rendered layout: not verified with ui-observer; no stories file or `/motion` bench in this workspace renders these parts.
- Skeleton: the new variants size a ghost to exactly what it stands for (DESIGN.md: "at exactly the size of what it stands for"); word bars at x-height with hair corners, glyphs at 16px with mark corners. Default look unchanged.
- Spinner: the sites' `size-4` duplicates the default 16px ring; the swap drops it.
- Table: `band` and `ledger` name the ledger recipe once in the kit instead of per site.
- Tabs: `column` names the pane-with-scroller role; the list's margin stays placement.
- Toast: see the fixed line above. Proof leg: `toastFade` in scripts/probe-kit/specs/config-undo.ts (the one spec whose page raises a toast; no web spec or `/motion` bench renders one) holds the delete toast's entrance under emulated reduced motion, checks one opacity Web Animation at `--dur-panel` on `--ease-out`, scrubs it to 0, 0.5, 1, and checks Undo's leave is one Web Animation at `--dur-exit` on `--ease-out`. Not yet run to that leg: on this base every scratch-fleet agent exits at start (`SyntaxError: Export named 'MCP_TYPESCRIPT_PREAMBLE' not found in module …/pi-codemode/dist/declarations.js`: packages/agent pins pi-coding-agent 1.0.1, whose `^1.0.1` pi-codemode resolves in bun.lock to 1.3.0, which dropped that export).
