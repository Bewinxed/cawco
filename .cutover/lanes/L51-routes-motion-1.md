# Lane L51-routes-motion-1

skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

better-ui rules followed: transition only what changes (no transition is added or touched); gate motion behind reduced motion (the one animation these files touch, `breathe`, stays the global class under its own `no-preference` guard); contain overlays (the bench stands under the kit's z-50 popover layer instead of over it, so its popovers need no override). better-layout rules followed: `min-height` and `100dvh` instead of `100vh` (`min-h-dvh`, `h-dvh`), `min-width: 0` on flex items that hold components (chosen-hover's sections), fixed widths only for real bench frames (a 390px phone, a 360px side well), logical `start-0`.

## Per-file table

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| motion/artifact-head/+page.svelte | 1 rule (`.pane`) + 1 inline style | 0/0/0/0/0 | 0 | none | none |
| motion/breath-floor/+page.svelte | 5 rules + 1 inline style, `:global(svg)` child rule | 0/0/0/0/0 | 0 | none | none |
| motion/caw-notices/+page.svelte | 0 (3 literal sites to tokens) | 0/0/0/0/0 | 0 | none | none |
| motion/caw/+page.svelte | 0 (2 literal sites) | 0/0/0/0/0 | 0 | none | none |
| motion/chosen-hover/+page.svelte | 0 (merge's unconverted lines repaired; 4 literal sites) | 0/0/0/0/0 | 0 | none | none |
| motion/delegate-tray/+page.svelte | 0 (1 literal, 1 inline width) | 0/0/0/0/0 | 0 | none | none |
| motion/echo/+page.svelte | 0 (1 literal, 1 dead class) | 0/0/0/0/0 | 0 | none | none |
| motion/folder-proof/+page.svelte | 1 foreign-dom rule removed (`!important`), 5 literal sites | 0/0/0/0/0 | 0 | `max-desk:` kept as written | none |

No `<style>` block stays in any of the eight files.

## Kit swaps
kit-swap: apps/dashboard/src/routes/(app)/motion/caw-notices/+page.svelte:395 ToggleGroup.Root `flex-wrap` — a `wrap` variant on the toggle group (a segmented group that wraps onto a second line when its box is narrow)
kit-swap: apps/dashboard/src/routes/(app)/motion/caw-notices/+page.svelte:415 ToggleGroup.Root `flex-wrap` — the same `wrap` variant

shadcn/no-restyle: apps/dashboard/src/routes/(app)/motion/caw-notices/+page.svelte:395 ToggleGroup `flex-wrap`
shadcn/no-restyle: apps/dashboard/src/routes/(app)/motion/caw-notices/+page.svelte:415 ToggleGroup `flex-wrap`

No `shadcn variant:` lines (no rule landed on `data-open:`, `data-closed:`, `data-checked:`, `data-unchecked:`, `data-disabled:`, `data-active:`, `data-horizontal:` or `data-vertical:`).

## Contracts
(none)

## Theme additions
(none)

## Tokens
token: --c-bench-phone-w 390px — the phone frame the caw-notices bench draws its iframe in (a real phone viewport width, so the panel's phone rules apply); no ladder step or `--c-*` is a phone's width
token: --c-bench-phone-h 844px — the same frame's height (a 390×844 phone); no ladder step fits
token: --c-bench-controls-w 380px — the bench's controls column on caw-notices (wide enough for the longest toggle label before it wraps); the nearest existing key, `--c-panel-w`, is a product popover's width, not a bench's
token: --c-bench-stage 320px — the square Caw bench stage, twice the 160px Caw it holds (`size={160}` in the script); no ladder step fits
token: --c-bench-side-w 360px — the chosen-hover bench's side-panel well, the width the side panel is judged at
token: --c-bench-side-h 240px — the same well's height
token: --c-bench-field-w 480px — the chosen-hover bench's model list and editor width (a form field's width; `--container-kinds` is the same 480px but names another role)
token: --c-bench-readout-w 4ch — the folder-proof bench's slider readout ("32px", "100%") so the figure does not jump; a figure's width, so it is in ch and not a reading measure

## Removed
removed: apps/dashboard/src/routes/(app)/motion/folder-proof/+page.svelte (the old `<style>`, `:global(body:has([data-folder-proof]) [data-bits-floating-content-wrapper]) { z-index: 2147483001 !important }`) — an `!important` that beat the inline z-index bits-ui copies onto a portalled wrapper from its content, needed only because the bench stood at z 2147483000; the bench now stands at z-40, under the kit's z-50 popover layer and over the shell's z-20 chrome, so the portalled card and menus are above it with no override
removed: apps/dashboard/src/routes/(app)/motion/echo/+page.svelte:63 `mark-line` — a class no rule in the file or in any stylesheet defines (dead)
removed: apps/dashboard/src/routes/(app)/motion/breath-floor/+page.svelte `.ic` — the class's only rule was the local `:global(svg)` sizing, now `size-icon-md` passed to the icon through its `class`
removed: apps/dashboard/src/routes/(app)/motion/chosen-hover/+page.svelte:127 `*:min-w-0` — a `*:` child selector; `min-w-0` now stands on each `<section>`, the elements the old `section { min-inline-size: 0 }` rule named

## Fixed
fixed: apps/dashboard/src/routes/(app)/motion/chosen-hover/+page.svelte:127 `items-box-start` — the merge took main's unconverted lines in a hunk and left a class that names no utility; `main { align-items: start }` is `items-start` (Defensive CSS: a flex item that must keep its own height opts out of stretch)
fixed: apps/dashboard/src/routes/(app)/motion/folder-proof/+page.svelte:293 and delegate-tray/+page.svelte:246 bench `z-(--bench-z)` = 2147483000 → `z-40` — DESIGN.md names no stack for a bench; the kit's popover layer is z-50 and the shell's own chrome tops at z-20 (Shell.svelte `data-floating:z-20`), so z-40 is over the one and under the other
fixed: apps/dashboard/src/routes/(app)/motion/folder-proof/+page.svelte:389 the work strip's 260px → `w-c-sidebar-w` (228px) — DESIGN.md Layout: "a resizable rail (228px by default)"; the 260px was the old rail width, and the comment above the file names the rail's column
fixed: 100vh → `min-h-dvh` in motion/caw/+page.svelte:64 and motion/echo/+page.svelte (Layout: `100dvh`, so a phone's toolbar never covers the bench)
fixed: apps/dashboard/src/routes/(app)/motion/breath-floor/+page.svelte:72 each surface's inline `style:background="var(--surface-*)"` → a written-out `bg-surface-*` class per surface (colour from tokens, no inline style)
fixed: apps/dashboard/src/routes/(app)/motion/artifact-head/+page.svelte:116 and delegate-tray/+page.svelte:272 inline `style:inline-size` / `style:width` → a custom property (`--pane-w`, `--transcript-share`) read by `w-(--…)`, the value computed from the script unchanged

## Gaps
gap: design/tokens/cawco.tokens.json (no z scale) — the benches' `z-40` stands between the shell's z-20 chrome and the kit's z-50 popovers; a named z scale in the tokens would let it say so (DESIGN.md Elevation & Depth names shadows, not stacking)
## Rendered check
Method: `CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 vite dev`, playwright-core on the cached Chromium 1248, `waitUntil: "domcontentloaded"`, 1440×900 and 390×844, the pending `c-bench-*` classes injected at runtime as one `<style>` with the values from `## Tokens` (`c-sidebar-w` is already in the theme). Readings are computed styles and `getBoundingClientRect`. Dev server stopped, scratch files deleted.

- No horizontal overflow on any bench at either viewport (`scrollWidth` = `innerWidth`: 1440 and 390).
- No page error and no console error from the benches' own markup. The only errors are the unreachable hub (502 on `/api/*`, the `/ws/dashboard` socket), filtered out as expected with no hub.
- artifact-head: pane 523×811 at 1440 and 523×724 at 390 (width from `--pane-w` = 523px; the flex column of the shell squeezes `h-dvh` to the shell's main height, as the old `block-size: 100dvh` did), `padding-top` 7px (`pt-space-2`), background `oklch(0.967 0.008 84)` (`surface-recess`).
- breath-floor: five `[data-surface]` sections, backgrounds `surface-page` oklch(0.966 0.008 85), `surface-raised` oklch(0.993 0.004 85), `surface-recess` oklch(0.967 0.008 84), `surface-recess-deep` oklch(0.92 0.011 83), `surface-well` oklch(0.967 0.008 84), each `border-radius` 10px and 1184×185 at 1440 (362×185 at 390); 60 tool-glyph svgs, all 16×16 (`size-icon-md`); 80 `[data-breather]` nodes.
- caw-notices: controls column 326×209 (its content width, under `max-width` 380px); the phone iframe 390×844 at 1440 and 354×844 at 390 (it shrinks to the 354px the page leaves; the frame is not zero-size at either).
- caw: stage 320×320; the bench's `min-height` computes 900px at 1440×900 and 844px at 390×844 (`min-h-dvh`).
- chosen-hover: `align-items: flex-start` (`items-start`); 11 sections, each `min-width: 0`; side well 360×240 at 1440 (326×240 at 390, `min-w-0` lets it shrink to the page); model 480×196 and slash 480×264 at 1440 (326 wide at 390).
- delegate-tray: root `position: fixed`, `z-index` 40, 1440×900 and 390×844 (the whole viewport); the dock's `--transcript-share` computes 100% (the lent `transcriptShare` is 1) and the dock is the viewport's size.
- echo: bench `min-height` 900px / 844px; three rows, the no-beat line 84×20.
- folder-proof: root `fixed`, `z-index` 40, 1440×900 and 390×844; the work strip is 228×556 at 1440 (`w-c-sidebar-w`) and 390×533 at 390 (`max-desk:w-full`); three slider readouts `min-width` 33.436px (4ch) and 33×17 each.
- Stacking: the only elements at `z-index` 40 or over, outside a bench, are the shell's skip link (z100, at x = −9999, off screen) and a kit popover (z50). An open kit popover's wrapper (chosen-hover `?control=lifetime`) computes `z-index` 90, so a portalled card or menu stands over a z-40 bench with no override.
- Nothing needed fixing in the eight files from this check.

## Design critique (interface-craft, from markup and classes)
The eight files are dev benches, not product screens. The stack, spacing and radii now come from the ladder (`gap-space-*`, `p-space-*`, `rounded-md`/`rounded-lg`), controls stay in kit components, and no state is a class. Nothing here animates. Open points are the two `gap:` lines above and the two `kit-swap:` lines.

important kept: (none)
needs variant: (none besides the two kit-swap lines)
needs transition token: (none)
needs colour token: (none)
cross-file hook: (none)
R2 fixed: (none)
R3 fixed: (none)
shadow kept residual: (none)
