# L02-kit-ui-2 (kit lane)

Files: 8 of 8. Started from f5c5024ab (cawco/cutover-merge).

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report, interface-craft and ui-observer.

## Per file

| file | done | residual `<style>` | literals left |
| --- | --- | --- | --- |
| apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-sub-content.svelte | `width: regular` variant | none | 0 |
| apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-trigger.svelte | `face: title` variant (new tv module) | none | 0 |
| apps/dashboard/src/lib/components/ui/empty/empty-state.svelte | its one site is placement: no variant, nothing to change | none | 0 |
| apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte | `<style>` deleted: main's dead pre-cutover rules removed, the rest onto its elements | none | 0 |
| apps/dashboard/src/lib/components/ui/fluid-tabs/TabsList.svelte | `<style>` deleted: the children's rules onto the track as child variants | none | 0 |
| apps/dashboard/src/lib/components/ui/hang-card/hang-card.svelte | frame sizes on tokens, `max-[900px]:` → `max-desk:` | none | 0 |
| apps/dashboard/src/lib/components/ui/input-group/input-group-button.svelte | raw values onto tokens; no K1 variant (removed, DESIGN.md Buttons) | none | 0 |
| apps/dashboard/src/lib/components/ui/input-group/input-group-input.svelte | unchanged from f5c5024ab: no K2 variant (removed, DESIGN.md Inputs and fields) | none | 0 |

needs variant: none. needs transition token: none. Literals preserved: none (delta T). shadcn variant (delta N): none.

Breakpoint edges: hang-card.svelte:76, :78 `max-[900px]:` → `max-desk:`; both compile to `@media (width < 900px)` (theme `--breakpoint-desk: 900px`), so no 1px edge moved.

## Variants

variant: apps/dashboard/src/lib/cawco/preview/CanvasView.svelte:94 DropdownMenuSubContent width="regular" — the Canvas view submenu, as wide as the same entries' own menu (CanvasView.svelte:107 is DropdownMenuContent `w-52`, the content's `width="regular"`); swap `class="w-52"` for the prop
variant: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:223 DropdownMenuTrigger face="title" — a pane head's title control, the name of what is on show (label role, strong ink: ArtifactMenu.svelte:336 `:global(.artifact-trigger)`'s colour and font); `min-w-0 max-w-full` stay the consumer's (width constraints), `mark-line` is a house class
variant: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:406 DropdownMenuTrigger none — `more` selects nothing (no rule in SideSurface or app.css; the element's hook is its `data-slot="more"`, which SideSurface.svelte:178 reads): drop the class, keep `mark-line`
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:396 EmptyState none — `files-empty` is placement only (FilesList.svelte `.files :global(.files-empty) { flex: 1 }`): it becomes `flex-1` at the site

Variant-order flags in this lane's files: none (eslint reports none).

## Removed

removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:423 (f5c5024ab) `@property --pick` — a duplicate: app.css:177 declares it
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:428 (f5c5024ab) `.fold, .sheet, .rim, .hit, .label, .strong { --pick: inherit }` — dead: no element has these classes; `pick-inherit` (app.css:2345) does it on each reader
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:443 (f5c5024ab) `.ff-tab { … }` with its `:has(.hit…)`, `.selected`, `[data-ghosted]`, press and transition rules — dead: the merge took main's pre-cutover rules back, and no element has `ff-tab`/`hit`/`selected`; the box's utilities already carry every one. Main's one change in them (the press tint `light-dark(--surface-fill-strong, --surface-fill)` → `--surface-pressed`, e4e00cdef) is ported: `hit-pressed:bg-surface-pressed` (TabItem.svelte:291 block)
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:479 (f5c5024ab) `.ff-tab > :global(*) { position: relative; z-index: 3 }` — dead (no `.ff-tab`); the cutover's own rule it displaced (every child but the fold and the hit at z-index 3) is restored as the box's child variant `[&>:where(:not([data-slot=fold],[data-slot=hit]))]:relative …:z-3`
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:321 (f5c5024ab) `style:--rim-blur="6px"` — the rim's glow reads its token (`--tab-rim-glow`) in `rim-glow`
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:484 (f5c5024ab) the `ff-tab-icon` class and its foreign-dom rule — the icon takes `class`, so `size-(--icon) flex-none` go on it (TabItem.svelte:414); nothing else selects `ff-tab-icon`
removed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte (f5c5024ab) `<style>` deleted whole; TabsList.svelte (f5c5024ab:1167) `<style>` deleted whole
removed: apps/dashboard/src/lib/components/ui/hang-card/hang-card.svelte:441 (f5c5024ab) the `<!-- literal: … -->` marker — its values are tokens now
removed: apps/dashboard/src/lib/components/ui/input-group/input-group-button.svelte:6 `rounded-[var(--radius-sm)]` — the arbitrary form of the theme's own `rounded-sm` (same value)
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:101 K1 (InputGroupButton `face="surface"`, font and ink inherited from the surface) — no variant: the kit Button's own recipe is the target (DESIGN.md, Buttons: `sm` at the label size, outline in strong ink, primary in `on-action`); K1 put a primary Button in the surface's ink on coral and every `sm` Button in the body role. L00-kit-sheets (fdc5ff811) removed the carve-out, so no consumer wants the look and the variant is deleted with it
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:113 K2 (InputGroupInput `ink="subtle"`, the placeholder in the subtle ink) — no variant: DESIGN.md, Inputs and fields: "muted placeholder", which the kit Input draws (`placeholder:text-ink-muted`). L00-kit-sheets (fdc5ff811) removed the carve-out and moved ns-theme.css's raw-input placeholder to `--ink-muted`; input-group-input.svelte stays in its plain form (no tv module)

## Fixed

fixed: apps/dashboard/src/lib/components/ui/fluid-tabs/TabItem.svelte:308 the end pad's 6px (`calc(var(--px) - 6px)`) → `var(--space-2)` — DESIGN.md Layout, spacing ladder: 6 is off it, 7 the nearest step
fixed: apps/dashboard/src/lib/components/ui/hang-card/hang-card.svelte:93 the machines face's room `100vw - 16px` → `100vw - 2 * var(--c-pop-edge)`, as every other face — DESIGN.md Layout, Breakpoints: popovers widen to the viewport less 24px
fixed: apps/dashboard/src/lib/components/ui/hang-card/hang-card.svelte:97 Jump's foot clearance 24px → `var(--space-7)` — spacing ladder (no DESIGN.md dimension names it)
fixed: apps/dashboard/src/lib/components/ui/hang-card/hang-card.svelte:84 the phone faces' 12px leading margin → `var(--c-bar-phone-edge)` — the bar's own 12px edge the glass stands on (DESIGN.md, The glass's cards: "on a phone the screen's edge as the card's trailing side")
fixed: apps/dashboard/src/lib/components/ui/input-group/input-group-button.svelte:6 base `gap-2` (8px) → `gap-space-2` (7px) — spacing ladder; the kit Button's `sm` gap is 7px (`--btn-gap:7px`)
fixed: apps/dashboard/src/lib/components/ui/input-group/input-group-button.svelte:9 xs `px-1.5` (6px) → `px-space-2` (7px) — spacing ladder
fixed: apps/dashboard/src/lib/components/ui/input-group/input-group-button.svelte:9 xs `h-6`, :11 icon-xs `size-6` → `h-c-btn-h-xs` / `size-c-btn-h-xs` (24px, the same) — DESIGN.md Buttons: `xs` is 24px, and the token holds it
fixed: interface-craft critique, see below

## Tokens

token: --c-pop-edge 12px — a floating card's least margin from the screen's edge on each side (DESIGN.md Layout, Breakpoints: "popovers widen to the viewport less 24px"); the hanging glass cards' room (hang-card.svelte:82). No ladder step is 12, and c-bar-phone-edge is the phone bar's ends, a different role on the desk
token: --c-machines-w 20rem — the machines face of the glass's card (hang-card.svelte:93), a real component width beside c-panel-w and c-find-w
token: --tab-rim-glow 6px — the blur of a session tab's rim glow (TabItem's `rim-glow`; DESIGN.md Session tab status rim), the drop-shadow's radius
token: --tab-rim-glow-room 24px — how far past a folder tab's top and sides its rim's glow may draw before the fold's clip cuts it (TabItem.svelte:323); four glow radii, so the glow's tail is never cut

## Theme additions

theme: utility paint-tab-sheet
```css
@utility paint-tab-sheet {
  fill: color-mix(in oklab, var(--sheet) calc(var(--pick) * 100%), var(--tab-fill, var(--surface-recess-deep)));
}
```
theme: utility paint-tab-hover
```css
@utility paint-tab-hover {
  fill: var(--tab-hover, var(--surface-hover));
}
```
theme: utility rim-strength
```css
@utility rim-strength {
  opacity: calc(var(--rim-rest, 0) + (var(--rim-full, 0) - var(--rim-rest, 0)) * var(--pick));
}
```
theme: utility rim-glow
```css
@utility rim-glow {
  filter: drop-shadow(0 0 var(--tab-rim-glow) color-mix(in oklab, var(--rim-ink, transparent) 50%, transparent));
}
```
theme: utility rim-stroke-w
```css
@utility rim-stroke-w {
  stroke-width: calc(var(--rim-w, 1) * 2px);
}
```
theme: utility vector-non-scaling
```css
@utility vector-non-scaling {
  vector-effect: non-scaling-stroke;
}
```
theme: utility stop-rim-ink
```css
@utility stop-rim-ink {
  stop-color: var(--rim-ink, transparent);
}
```
theme: utility clip-tab-foot
```css
/* A chosen folder tab's hit area in the sheet's outline, square-shouldered,
   its flared foot reaching past the box each side (TabItem). */
@utility clip-tab-foot {
  clip-path: shape(
    from 0 100%,
    arc to var(--flare) calc(100% - var(--flare)) of var(--flare) ccw,
    line to var(--flare) 0,
    line to calc(100% - var(--flare)) 0,
    line to calc(100% - var(--flare)) calc(100% - var(--flare)),
    arc to 100% 100% of var(--flare) ccw,
    close
  );
}
```

Each was the svg-paint or pseudo residual it replaces, value for value (TabItem f5c5024ab:497–575). The variants they sit under were compiled with the dashboard's Tailwind 4.3.3 (`@tailwindcss/node` `compile(app.css).build([...])`) and give the selectors the old rules had: `hover-hover:group-data-ghosted/ff-tab:not-group-data-tab-item-selected/ff-tab:` → `:is(:where(.group\/ff-tab)[data-ghosted] *):not(:is(:where(.group\/ff-tab)[data-tab-item-selected] *))` under `(hover: hover)`, (0,3,0); `group-hit-pressed/ff-tab:` → `:is(:where(.group\/ff-tab):has([data-slot="hit"]:active:not(:disabled, [aria-disabled="true"])) *)`, (0,4,0), so the press still outranks the ghost as it did; `in-variant-folder:aria-selected:before:-inset-x-(--flare)` → `[aria-selected="true"]::before { inset-inline: calc(var(--flare) * -1) }`. The group is named `ff-tab`, not `tab`: PaneTabs.svelte:1451 puts `group/tab` on its box round each TabItem, and Tailwind's `group-*/tab` matches any ancestor of that name.

TabsList: its folder stack rule as a child variant, `in-variant-folder:[&>:not([data-slot=segment],[data-slot=ring],.kit-ghost,.kit-pill,.kit-pill-trail)]:…` (0,2,0), compiles after PaneTabs' `data-drop-after:z-(--drop-z)` (0,2,0) in the sheet, so the rank's z-index still wins over it on PaneTabs' box, as the old (0,4,0) rule did.

## Kit swaps

None in this lane's files (kit parts; `shadcn/no-restyle` is off under `ui/**`).

## Contracts

None declared: every ESLint problem left in these files is a `theme:` name above.

## Gaps

gap: apps/dashboard/src/lib/components/ui/fluid-tabs/TabsList.svelte:1124 `scrollable` is a state class standing in for an attribute (`data-scrollable`), and app.css:793 (`.ff-tabs-list { &.scrollable }`) and PaneTabs.svelte:1998, :2106 (`.ff-tabs-list.scrollable`) select it — both other sides are outside this lane (L00-kit-sheets for app.css, PaneTabs' lane); the three move together to `[data-scrollable]` at integration
gap: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:579 the head recipe (`.side-head :global(:is(button, a):not([role="tab"]))`, unlayered, (0,3,1)) sets every head control's colour, size and weight, so ArtifactMenu's `face="title"` (like today's `:global(.artifact-trigger)` at (0,1,0)) loses its strong ink and label role to it: the artifact name draws in the muted ink at the head controls' size — DESIGN.md SideSurface title rule (the name in the label role, strong ink). It lands when SideSurface's lane makes the head recipe a layered variant (a kit Button/Trigger `head` look) that `face="title"` sorts after
gap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-sub-content.svelte:10 the menus' widths (DropdownMenuContent `w-44`/`w-52`/`w-64`, `min-w-40`/`min-w-44`; SubContent `min-w-36`, `w-52`, `w-72`, `min-w-40`) are Tailwind's numeric step waiting for a menu-width token family; `regular` reuses the content's `w-52` so the two stay one family until it lands (ratchet: −1 at CanvasView:94 and +1 here, net 0 after the swap)

## Design critique (interface-craft, against DESIGN.md)

Read from markup and classes; no `/motion` bench or stories file in this workspace renders these parts, so ui-observer had no rendered layout to read.

fixed: TabItem — the trailing control (a host's close) sat at z-index auto after the merge (main's `.ff-tab > *` rule selects a class no element has), so it could fall under the hit's area and lose its own presses; the child variant puts it back at z-index 3 over the overlays (DESIGN.md Folder tabs: the close is part of the tab, pressable)
fixed: TabItem — the press tint: the merge left the cutover's `bg-press-fill` while main had moved the segment's press to `--surface-pressed` (DESIGN.md The Press Rule: tabs in a strip tint); now `bg-surface-pressed`
fixed: hang-card — the machines face kept 8px each side from the screen at narrow widths where every other face keeps 12px; one room for all four faces now (DESIGN.md Breakpoints)
fixed: input-group-button — xs pads (6px) and the base gap (8px) were off the spacing ladder; 7px both, the kit Button's own `sm` gap
gap: see `## Gaps` (SideSurface head recipe outranks the title face; the menu width family; `scrollable` state class)
