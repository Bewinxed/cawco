# W6-layout

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before the report: interface-craft (Design Critique), ui-observer.

better-ui rules followed: transition only what changes (the Pane's slide names `flex-grow`; the highlight layers name `--hl-x, --hl-y, width, height, --hl-show`, never `all`); hover only on hover-capable pointers (the ghost shows under `hover-hover:`, or `data-follow` when keys drive it); gate motion behind the reduced-motion preference (Pane slide and keyboard step under `motion-safe:`, the pill's glide under `motion-safe:`, the pending thumb's breath under `motion-safe:`; with less motion the pill cross-fades, `data-swap`).
better-layout rules followed: logical properties for anything that mirrors (the badge's `end-space-1`, the thumb's `start-0`, the strip's `ps`/`pe`); a flex child holding a scroller can shrink (`min-h-0 min-w-0` on every Pane, `layout="column"` on Tabs and TabsContent); hold structure until it breaks (the strip's narrow-leaf pad is a container query, `@max-leaf/leaf`, scoped `desk:` so the phone bar's own pad wins under 900px).

Base: 682ede287. Files: 68 listed (60 staged + 8 added: the new kit Pane, the two icon-card hosts and WorkTabs whose host rules named my classes, the three files `bun run tokens` writes beside tokens.css, and mark-line-check.ts, which named `kit-segment`). variants.css took one generated line (`bun run variants`: `slot-highlight-ghost`, from TabsList's `[data-slot=highlight-ghost]` selector) and matches the generator byte for byte.

Gates (final): relic `relic-free`; residual `0 violations`; eslint `eslint-clean`; svelte `lane-svelte-clean` (0 errors, 0 warnings); typecheck 0 errors; vite build done; spacing-ratchet 370 (baseline 518); tokens and variants checks byte for byte; mark-line check clean; ultracite clean on the 41 changed files; fmt clean. `bun run lint` as a whole stops at `fmt --check` on OpenCodeLogo.svelte, DelegateTail.svelte and DelegateTray.svelte, unchanged since 682ede287 and not on this list.

## Variants

| variant | role | DESIGN.md | sites |
| --- | --- | --- | --- |
| Pane `look="split"` (new kit part `ui/resizable/resizable-pane.svelte`) | a page and its side surface: a column that may shrink, whose share slides on `--dur-panel`/`--ease-in-out` while the split opens or closes in front of the reader (`data-sliding`), on the drawer curve while opening (`data-opening`) | Motion grammar ("a container ... tweens"); the Open Page Rule (Split.svelte's own doc) | Split.svelte:348, Split.svelte:384 |
| Pane `look="grid"` | a group in the pane grid: clipped to its box, its share tweening at the control tier to a keyboard step on its divider (`pane-keyed:`) | "never animate keyboard-initiated actions" is about the choice; a resize from the keyboard is a jump the panes follow (PaneGrid's own doc) | PaneGrid.svelte:214 |
| ResizableHandle `look="split"` + `data-hidden`, `data-expanded` | a split's handle: gone while the surface is shut; on the page area's edge while the surface has the whole split, its hit area a grip's width inside the surface | Layout (the resizable rail and split) | Split.svelte:367 |
| Tabs `layout="column"` | tabs whose chosen pane scrolls on its own: a column that can shrink | Files › Phone ("the chosen list fills what is left of the drawer with its own scroll") | FilesList.svelte:449 |
| TabsContent `layout="column"` (existing) | the same pane | same | FilesList.svelte:471, FilesList.svelte:478 |
| SidebarMenuButton `row="list"` (now carries `h-c-btn-h-sm`) | a project in the rail's list: a 30px row | Layout › Density; Session row (rail) | Sidebar.svelte:1039 |
| SidebarMenuButton `row="avatar"` (now `touch-hit size-c-btn-h-sm justify-center overflow-visible p-0`) | the footer avatar: a 30px square, its touch area 44px | The 44 Touch Rule | Sidebar.svelte:1183 |
| SidebarMenuSubButton `row="compact"` (now `h-(--row-compact-h)`) | a row under a project on a compact session row's axes and height | Session row: "`compact` ... `row-compact-h` 28px" | Sidebar.svelte:1125 |
| SidebarMenuSubButton `row="compact-tall"` + `data-tall` (now `h-(--row-compact-h)`, tall `h-(--row-tall-h)`) | the "N older" row: compact in the rail, among the home's two-line rows at their height | Session row: "two lines in the home lists" | OlderRows.svelte:204 |
| SidebarMenuBadge (default) | a count centred on its nav row whatever the row's height (40px, 44px under a finger) | Selected (`selected-ink` count); The 44 Touch Rule (nav rows 44px on touch) | Sidebar.svelte:880, Sidebar.svelte:913 |
| CardContent `gap="section"` (now `flex flex-col gap-space-4`) | a body of sections, a column | Cards and the stat tile ("18px vertical rhythm") | WorkflowRunView.svelte:341 |
| EmptyState `actionWidth="fill"` (existing) | an action as wide as the block: a column of starters | Empty ("at most one action") | ViewRoutines.svelte:853 |
| fluid Tabs `strip="session"` / TabsList strip `session` | a pane's session tabs on their own shelf (the host rules that were `[data-session-tabs]` in app.css); on a phone, the app's only bar | Folder tabs; Layout › Breakpoints | PaneTabs.svelte:1412 |
| fluid Tabs `strip="hosted"` / TabsList strip `hosted` | the same tabs in a host's row (was `[data-session-tabs][data-hosted]`): the same ladder, no shelf, no phone bar | Folder tabs | PaneTabs.svelte:1412 |
| fluid Tabs `strip="work"` / TabsList strip `work` | the home's Working / Finished tabs (the host rules that were `[data-work-tabs] .ff-tabs-list`) | Work tab count | WorkTabs.svelte:786 |
| highlight `look: "card"` | a grid of icon cards: the pill is the channel card's selection frame | Channel cards (1px `brand-solid` over the recess) | MachinesEmpty.svelte:94, TemplateCards.svelte:156 |

The brief named the session strip `variant="strip"`; fluid Tabs already has `variant: "segmented" | "folder"` (TabsVariant, read by every tab and by `in-variant-folder:`), and PaneTabs is `variant="folder"`, so the strip is its own prop by role, `strip="session" | "hosted" | "work"`, carried to TabsList through the tabs context (`TabsState.strip`). Hosted is a role rather than the `data-hosted` attribute it was: the track's phone rules would otherwise reach up to the root through a group variant across components, which the house `group-not-needs-ancestor` rule refuses; PaneTabs' `data-hosted` had no other reader (grep) and is gone.

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/side/Split.svelte:348 Pane split — done
kit-swap: apps/dashboard/src/lib/cawco/side/Split.svelte:384 Pane split — done
kit-swap: apps/dashboard/src/lib/cawco/workspace/PaneGrid.svelte:214 Pane grid — done
kit-swap: apps/dashboard/src/lib/cawco/side/Split.svelte:367 ResizableHandle split (data-hidden, data-expanded) — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:449 Tabs column — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:471 TabsContent column — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:478 TabsContent column — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1039 SidebarMenuButton list — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1183 SidebarMenuButton avatar — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1125 SidebarMenuSubButton compact — done
kit-swap: apps/dashboard/src/lib/cawco/OlderRows.svelte:204 SidebarMenuSubButton compact-tall — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:880 SidebarMenuBadge default — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:913 SidebarMenuBadge default (tone live) — done
kit-swap: apps/dashboard/src/lib/components/features/workflows/WorkflowRunView.svelte:341 CardContent section — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:853 EmptyState fill — done
kit-swap: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1412 fluid Tabs strip session / hosted — done
kit-swap: apps/dashboard/src/lib/cawco/home/WorkTabs.svelte:786 fluid Tabs strip work — done

Sites swapped: 13 of 13 phase-2 sites, plus the two strip hosts. `shadcn/no-restyle` on my parts (Pane, ResizableHandle, Tabs, TabsContent, fluid Tabs/TabsList, SidebarMenuButton, SidebarMenuSubButton, SidebarMenuBadge, CardContent, EmptyState): 0.

## Removed

removed: apps/dashboard/src/lib/cawco/Sidebar.svelte:880 `-translate-y-1/2` + `peer-data-[size=default]/menu-button:top-1/2` — a translate re-centring a badge the kit mis-laid at a fixed 6px top (DESIGN.md Layout: nav rows 40px, 44px on touch); the kit now centres it (`inset-y-0 my-auto`), same 10px offset on a 40px row.
removed: apps/dashboard/src/lib/cawco/Sidebar.svelte:913 the same pair — same reason.
removed: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:853 `items-stretch` — stretched every child of the empty state to set one action's width; the action's own `fill` does it (DESIGN.md Empty: "at most one action").
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-button.svelte:6 `group-data-[collapsible=icon]:size-space-8! group-data-[collapsible=icon]:p-2!` and the `lg` size's `group-data-[collapsible=icon]:p-0!` — dead: nothing in the app sets `data-collapsible` (grep), and trailing `!`.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-badge.svelte:44 `group-data-[collapsible=icon]:hidden` and the three `peer-data-[size=*]` tops — dead / the mis-laid fixed top.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-sub-button.svelte:50 `group-data-[collapsible=icon]:hidden` — dead.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-sub.svelte:15 `group-data-[collapsible=icon]:hidden` — dead.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-content.svelte:30 `group-data-[collapsible=icon]:overflow-hidden` — dead.
removed: apps/dashboard/src/lib/components/ui/sidebar/sidebar-group-label.svelte:40 `group-data-[collapsible=icon]:-mt-space-8 group-data-[collapsible=icon]:opacity-0` and the `transition-[margin,opacity]` that only served them — dead.
removed: apps/dashboard/src/lib/cawco/side/Split.svelte:367 `group-data-split-expanded/split:direction-vertical:after:*` duplicates — the split is horizontal only (`direction="horizontal"`), so the vertical copies matched nothing.
removed: app.css `[data-work-tabs][data-slot="tabs"] .ff-tabs-list [data-slot="ff-tab"] { min-inline-size: max-content }` and `... [data-slot="hit"] { flex-shrink: 0 }` — dead at the start sha: in `@layer components` they lose to TabItem's own `min-w-0` / `flex-auto` utilities (start capture: ff-tab `min-inline-size: 0px`, hit `flex-shrink: 1`). Made live they push the Delegates switch 9px past the head (see the gap below), so they are not carried.
removed: app.css's phone strip rule's `--item: var(--strip-item)` — a duplicate: the session strip sets the same value at every width and pointer (and the house `variant-order` rule flagged it against the coarse step).
removed: apps/dashboard/scripts/mark-line-check.ts:58 `kit-segment` from the recipe classes — the class no longer exists anywhere (grep).
removed: app.css `.kit-segment` from the mark-line trim list (`:where(.mark-line, ... ) > ...`) — the segment now carries `mark-line` itself, which that list already names.

## Fixed

fixed: apps/dashboard/src/lib/components/ui/resizable/resizable-handle.svelte:18 the expanded split's grip: the old site wrote `after:transform-none` to cancel the kit's `after:-translate-x-1/2`, but in v4 that utility sets `translate`, not `transform`, so the hit area stood half a grip outside the surface; the `split` look now resets `after:translate-x-0` — the grip stands a step inside the surface as Split's own comment describes (DESIGN.md Layout: the page area's edge belongs to the sidebar's grip).
fixed: apps/dashboard/src/lib/components/ui/card/card-content.svelte:8 `gap="section"` set a gap on a block box (no effect without flex); the role is a column of sections, so the variant carries `flex flex-col` (DESIGN.md Cards: "18px vertical rhythm").
fixed: apps/dashboard/src/lib/components/ui/tabs/tabs.svelte:6 `gap-2` (8px, off the ladder) → `gap-space-2` (7px) (DESIGN.md Layout: spacing ladder 4, 7, 11, ...).
fixed: apps/dashboard/src/lib/components/ui/fluid-tabs/Tabs.svelte:24 the narrow-leaf pad is `desk:@max-leaf/leaf:not-data-hosted:ps-space-4`: Tailwind orders container variants after `max-desk:`, the reverse of the old source order, which made the phone bar's 30px leading pad read 14px in the first build (touch capture `sessionTabs padding-inline-start: 30px -> 14px`); scoping the container rule to the desk restores the old cascade (touch re-capture: 30px =).

## Tokens

token: --row-tall-h calc(2 * var(--space-5) + 2 * var(--space-1)) (44px) — a two-line session row's height in the home's lists (SessionRow's two 18px lines and 4px pads); the "N older" row among them stands at it (sidebar sub-button `compact-tall` + `data-tall`), where the site set it through its own `--older-h`.
token: --c-segmented-pad 3px — the segmented groove's pad (DESIGN.md Segmented: "a recess-deep groove with a 10px radius and 3px padding").
token: --c-segment-gap 6px — a segment's glyph/label/count gap (was a literal in `.kit-segment`).
token: --c-segment-pad-x 10px — a segment's inline pad (DESIGN.md Segmented: "Segments are 30px tall with 10px padding"); a compact fluid tab's too.
token: --c-tab-item 28px — a fluid tab's height (DESIGN.md Fluid tabs: "28px items (36px control)"); a compact track's under a finger.
token: --c-tab-px 12px — a fluid tab's inline pad at the default size (was a literal in `.ff-tabs-list`).
token: --c-tab-slope-start 1px, --c-tab-slope-end 0px — the folder outline's slopes (DESIGN.md Folder tabs, Slopes: "--slope-start 1px ... --slope-end 0px (the owner's pick)"). The end slope is written `0px` (a `css` extension), since PaneTabs adds it to lengths in `calc()`.

All are in design/tokens/cawco.tokens.json (size group, together after `row-compact-pad-end`), built with `bun run tokens`, which also rewrote tokens.ts, the Swift Tokens.swift and the decision-page kit's tokens.css; those are committed as it wrote them.

## Theme additions

The variant goes in app.css's `/* wave 2: W6-layout */` block, not variants.css: variants.css is written whole by `bun run variants` and `bun scripts/build-variants.ts --check` fails on any hand edit.

theme: variant pane-keyed
```css
@custom-variant pane-keyed (:where([data-pane-group]:has(> [data-pane-resizer][data-active="keyboard"])) > &);
```
theme: utility strip-edge-mask
```css
@utility strip-edge-mask {
  --fade-run-start: min(var(--fade-start), calc(var(--fade-cap-start, var(--strip-uncapped)) / 1.5));
  --fade-run-end: min(var(--fade-end), var(--fade-cap-end, var(--strip-uncapped)));
  mask-image: linear-gradient(to right, transparent, transparent calc(var(--fade-run-start) * 0.375), var(--mask-opaque-a15) calc(var(--fade-run-start) * 0.75), var(--mask-opaque-a60) calc(var(--fade-run-start) * 1.125), var(--mask-opaque) calc(var(--fade-run-start) * 1.5), var(--mask-opaque) calc(100% - var(--fade-run-end)), var(--mask-opaque-a90) calc(100% - var(--fade-run-end) * 0.75), var(--mask-opaque-a50) calc(100% - var(--fade-run-end) * 0.5), var(--mask-opaque-a10) calc(100% - var(--fade-run-end) * 0.25), transparent);
}
```

## Compiled check

`@tailwindcss/node` 4.3.3 (node_modules/.bun/@tailwindcss+node@4.3.3), `compile()` over apps/dashboard/src/app.css (with the block), `build([...])`:
- `motion-safe:pane-keyed:transition-[flex-grow]` → `:where([data-pane-group]:has( > [data-pane-resizer][data-active="keyboard"])) > .motion-safe\:pane-keyed\:transition-\[flex-grow\] {` inside `@media (prefers-reduced-motion: no-preference)`. Wins: the pane's own class plus a zero-specificity `:where()`, so it only adds; nothing else sets the pane's transition.
- `max-desk:group-not-data-hosted/strip:strip-edge-mask` → `.max-desk\:group-not-data-hosted\/strip\:strip-edge-mask:is(:where(.group\/strip):not([data-hosted]) *) {` inside the `max-desk` media, with `--fade-run-start`, `--fade-run-end` and the ten-stop `mask-image`. Wins over `.kit-edge-fade`'s `mask-image` (same element) because it is in the utilities layer and `.kit-edge-fade` in components. Touch capture at 390×844: the track's `mask-image` equal to the start sha's.
The scratch folder is deleted.

## Sheet classes

sheet: kit-empty → kit recipe — `emptyStateVariants` base (`flex flex-col items-start gap-space-2 py-space-6 text-start`); its `> [data-slot="empty-mark"]` reached only the kit's own Mark (grep: no caller sets that slot), so the mark carries `mb-space-1 size-icon-lg text-ink-muted`.
sheet: kit-empty-inline → kit recipe — `inline: true` (`mark-line flex-row flex-wrap items-center gap-x-space-2 gap-y-space-1 py-0`); its descendant rules moved onto the inline markup's own elements.
sheet: kit-empty-title → kit recipe — `max-w-c-measure-short type-title tracking-title text-ink-strong text-balance` (inline: `type-meta font-medium`).
sheet: kit-empty-line → kit recipe — `max-w-c-measure-short type-body text-ink-muted text-pretty`; its `& code` descendant (any caller's code in the line) is `[&_code]:text-label` on the line itself.
sheet: kit-empty-action → kit recipe — `emptyActionVariants` base `mt-space-2` (inline `mt-0 flex-none`).
sheet: kit-segmented → kit recipe — `segmentedVariants.group` in ui/tabs/thumb.ts, used by TabsList and ToggleGroup.
sheet: kit-thumb → kit recipe — `segmentedVariants.thumb`; app.css's `[data-project-details] [data-slot="toggle-group"][data-pending] .kit-thumb` breath (it named my class) is the thumb's own `motion-safe:group-data-pending/segmented:animate-breath` (ProjectDetails is the only caller that sets `data-pending` on a toggle group).
sheet: kit-segment → kit recipe — `segmentedVariants.segment` (with `mark-line`, replacing its entry in the mark-line trim list).
sheet: kit-highlight → kit recipe — highlight.svelte.ts sets `data-highlight` and `isolate` on the list (removing `isolate` on teardown only if it added it).
sheet: kit-ghost, kit-pill, kit-pill-trail → kit recipe — `highlightVariants` slots on layers that carry `data-slot="highlight-ghost|pill|trail"`; app.css's `.icon-cards :is(.kit-pill, .kit-pill-trail)` override (it named my classes) is `look: "card"`, passed by its two hosts (MachinesEmpty, TemplateCards); TabsList's `.kit-ghost`/`.kit-pill` selectors read `[data-slot^=highlight-]`.
sheet: kit-glide, kit-fade (and kit-swap beside them) → a state written as a class → `data-glide`, `data-fade`, `data-swap` and their variants; the pill's glide is `data-glide:not-data-swap` so the two never compete (swap won before by source order; `swap()` turns the glide off first anyway).
sheet: ff-tabs-list → kit recipe — `tabsListVariants` (size, variant, scrollable, strip) in TabsList; app.css's `[data-size="compact"]`, `[data-variant="folder"]`, WorkTabs' and PaneTabs' host rules on it are its variants; tab-drag.svelte.ts finds the track by `[data-slot="ff-tabs-list"]`.

Proof (playwright-core, cached Chromium, `CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev`, `domcontentloaded` + 4s, 7 routes plus a scratch bench rendering EmptyState, kit Tabs, ToggleGroup, CardContent and the sidebar rows, at 1440×900, 390×844 and 390×844 touch; start captured twice on the start tree, 0 differ run to run):
- with the scratch bench: fine `same 30229 · differ 420 · elements-missing 0`; touch `same 7850 · differ 88 · elements-missing 3 · unstable-skipped 111`. Final tree (bench deleted, after the `hosted` role and the class sort): fine `same 26401 · differ 318 · elements-missing 69` (the bench's elements), touch `same 7856 · differ 82 · elements-missing 0 · unstable-skipped 111`; final against the previous end capture: `same 26711 · differ 8` (whitespace in `--fade-run-end`). Every remaining difference is one of: a custom property's serialization whitespace (`--sheet`, `--tab-hover`, `--fade-run-*`: commas without spaces, same tokens); the thumb's `box-shadow` gaining Tailwind's four transparent ring/inset layers before the same `shadow-raised`; the intended swaps (badge centred by `my-auto` instead of `translate`, same 10px offset; Empty `fill`; Tabs gap 8→7px); and the dead WorkTabs rules removed above.
- Equal readings, start → end (`=`):
  - kit-empty: `display "flex" =; flex-direction "column" =; align-items "flex-start" =; gap "7px" =; padding "21px 0px" =`; mark `inline-size "20px" =; margin-block-end "4px" =; color "oklch(0.495 0.014 74)" =`; title `font "500 20px / 25px \"Figtree Variable\"..." =; letter-spacing "-0.2px" =; text-wrap "balance" =`; line `font "14px / 20.3px ..." =; text-wrap "pretty" =`; inline `flex-wrap "wrap" =; row-gap "4px" =; column-gap "7px" =; padding "0px" =`.
  - kit-segmented (/motion/caw-notices): `position "relative" =; gap "2px" =; padding "3px" =; border-radius "10px" =; background-color "oklch(0.92 0.011 83)" =`; kit-thumb `position "absolute" =; transform-origin "0px 0px" =; border-radius "8px" =; background-color "oklch(0.993 0.004 85)" =`; kit-segment `gap "6px" =; block-size "30px" =; padding "0px 10px" =; font "500 13px / 13px ..." =; color "oklch(0.295 0.01 70)" =; transition-duration "0.12s, 0.12s, 0.12s" =`.
  - kit-highlight (/motion/head-tint): host `isolation "isolate" =`; ghost `position "absolute" =; z-index "-1" =; display "block" =; background-color "oklch(0.92 0.011 83)" =; transition-property "--hl-show" =; transition-duration "0.12s" =`; pill `z-index "-1" =; background-color "oklch(0.905 0.062 48)" =`.
  - ff-tabs-list (/motion/head-tint, folder, work strip): `display "inline-flex" =; padding "4px 8px 0px 16px" =; --item "32px" =; --pad "4px" =; --radius "8px" =; --shape "8px 8px 0 0" =; --flare "8px" =; --slope-start "1px" =; --slope-end "0px" =; --choose-dur "400ms" =; isolation "isolate" =`; session strip root `align-items "flex-end" =; padding "4px 14px 0px 25px" =; background-color "oklch(0.89 0.013 82)" =; --strip-px "11px" =`; phone, touch (/motion/folder-proof) track `--item "36px" =; --pad "0px" =; --radius "12px" =; --overlap "8px" =; padding-block-start "8px" =`, root `padding "0px 40px 0px 30px" =; min-block-size "44px" =; position "relative" =; z-index "1" =`.
- grep: `grep -rn -E '\.ff-tabs-list|kit-(empty|segmented|segment|thumb|highlight|ghost|pill|glide|swap)\b' apps/dashboard/src` returns nothing; the rules are gone from app.css (ns-theme.css never had them).

## Rendered check

ui-observer's observer.browser.js, run in the same playwright-core session over /motion/w6-scratch (deleted after), /motion/folder-proof, /motion/head-tint and /session at 1440×900 and 390×844:
- `horizontal-overflow` on /motion/folder-proof and /motion/head-tint: every one is a folder tab `scrollWidth` = `clientWidth + 8` (`hiddenPx 8`), the flare: DESIGN.md Folder tabs, Shape ("each tab is one SVG path ... on a box one flare wider than the tab each side"). The same rects at the start sha.
- Badge: 20×20 at `end 4px`, `margin-block 10px` on a 40px nav row: centred (DESIGN.md Layout: 40px nav rows).
- Sub-buttons: compact 28px (`row-compact-h`), compact-tall 28px, tall 44px (`row-tall-h`); project row 30px; avatar 30×30.
- Segmented: track 36px (3 + 30 + 3), segments 30px, thumb on the chosen segment.
- Empty: 21px block padding, 7px gap, 20px mark, title 20px/25px, line 14px/20.3px, measure 60ch.
- `escapes-viewport` at 390×844 on the scratch bench only: the bench's own 380px boxes; not a product surface.

Design Critique (interface-craft), against DESIGN.md, per variant: the badge now centres on its row at every row height rather than at 32px only (Visual: spacing & alignment); the "N older" row keeps its siblings' heights from a token both lists share rather than a host's own variable (Consistency); the segmented control's three-part recipe is one module that Tabs and ToggleGroup read, so the groove, thumb and segment can no longer drift between them (Consistency); the Empty state's `fill` stretches only the action, so its title and line keep their balance at their own widths (Visual weight); the session strip's phone bar keeps its 30px lead to the toggle (Layout). Not verified: a real phone's hover-capable check (the touch context is Chromium's emulation), and the Pane's slide and keyboard step, whose rules compile (above) but which no bench drives; the route that shows them is a session with its side surface opened and a pane grid divider focused from the keyboard.

## Gaps

gap: apps/dashboard/src/lib/cawco/home/WorkTabs.svelte:772 at the default 228px rail with two-digit counts (/motion/folder-proof: "12", "15"), "Working" and "Finished" are cut by 8px each (label `scrollWidth 50` in a `42px` box) in the start sha and here, against WorkTabs' own promise ("both labels stand whole beside their counts at any width"). Main kept them whole with unlayered `min-inline-size: max-content` and `flex-shrink: 0`; restored, the head overflows by 9px (scrollWidth 223 > 214, the Delegates switch 9px past the head), and 5px even at main's 6px tab pad. Which spacing gives (the tab pad, the count's 4px lead, the head's trailing 7px, or the switch) is a design choice; proposal: let the count's leading 4px and the head's trailing pad close with `--tight` as the tab pad already does.
