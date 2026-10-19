# Lane L33-cawco-top-4

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

better-ui rules followed: shadows for elevation (the glass keeps `shadow-tile`); transitions name their properties (`transition-[background]`, never `all`); press scales through the house's `--press-scale`, under `motion-safe:`; hover effects only through `hover:` / `can-hover:` (the hover-capable guard); no animation added to a high-frequency control.
better-layout rules followed: logical properties for everything that mirrors (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`/`rounded-s`/`border-e`); one breakpoint per query through the named variants (`desk:`, `max-desk:`); controls keep a 44px floor (`c-btn-h-lg`) under a finger; growth through `min-h-` / `min-w-0`, never a fixed height; the safe-area insets kept as `env()` through custom properties.

## Per-file table

| file | rules moved | residual (1/2/3/4/5) | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| RunSteps.svelte | 4 literal markers, 7 style vars → ladder / `c-*` tokens | 0 | none | none | none |
| ScreenEdges.svelte | whole `<style>` (root vars, mask, dead strip rules) → theme additions | 0 | none | `width < 900px` kept in the theme rule | none |
| SessionHover.svelte | 3 literals, 4 style vars, `<style>` (glyph rules) → theme addition | 0 | none | none | none |
| SessionPane.svelte | `<style>`: 2 live rules (`.readonly`, `.continued`) moved, 9 dead rules deleted | 0 | none | none | none |
| SessionRow.svelte | 2 literals, 4 style vars, `<style>` (dead but 2 `:global` rules) | 0 | none | `max-[900px]` → `max-desk:` | none |
| Shell.svelte | 6 literals, 7 style vars, `<style>` → utilities + theme additions | 0 | none | `min-[900px]`/`max-[900px]` → `desk:`/`max-desk:` (899/900 edge identical to the old query) | none |
| Sidebar.svelte | 2 literals, 3 style vars, `<style>` (3 rules) | 0 | none | none | none |
| StatTile.svelte | 1 literal → `min-h-lh` | 0 | none | none | none |

No `<style>` remains in the eight files.

## Theme additions

theme: utility edge-mask-top
```css
@utility edge-mask-top {
  mask-image: linear-gradient(
    to bottom,
    var(--mask-opaque) calc(var(--space-2) + env(safe-area-inset-top)),
    transparent 0
  );
}
```

theme: component screen-edges
```css
@layer components {
  :root {
    --edge-top-under: var(--surface-raised);
    --edge-bottom-under: var(--surface-recess);
    --edge-top-background: var(--edge-top-under);
    --edge-bottom-background: var(--edge-bottom-under);
    --edge-top-fade: 1ms;
    --edge-bottom-fade: 1ms;
    --edge-shown: 1;
    --edge-show-fade: var(--dur-exit);
    background: var(--edge-top-background);
  }
  body {
    background: var(--edge-bottom-background);
  }
  :root[data-bar~="floating"],
  :root[data-bar~="hosting"] {
    --edge-top-under: var(--surface-shelf);
  }
  @media (width < 900px), (pointer: coarse) and (orientation: portrait) {
    :root[data-bar~="hosting"] {
      --edge-top-under: var(--surface-raised);
    }
  }
  :root[data-scrim~="open"],
  :root[data-scrim~="lightbox"] {
    --edge-top-background: color-mix(in srgb, var(--background) var(--scrim-mix), var(--edge-top-under));
    --edge-bottom-background: color-mix(in srgb, var(--background) var(--scrim-mix), var(--edge-bottom-under));
    --edge-top-fade: var(--dur-panel);
    --edge-bottom-fade: var(--dur-panel);
  }
  :root[data-scrim~="closed"] {
    --edge-top-fade: var(--dur-exit);
    --edge-bottom-fade: var(--dur-exit);
  }
  :root[data-kit-sheet~="bottom"] {
    --edge-bottom-background: var(--surface-raised);
    --edge-bottom-fade: 1ms;
  }
  :root[data-kit-sheet~="side"] {
    --edge-top-background: var(--surface-raised);
    --edge-bottom-background: var(--surface-raised);
    --edge-shown: 0;
    --edge-show-fade: 0s;
  }
  :root[data-kit-sheet~="rail"] {
    --edge-top-background: var(--sidebar);
    --edge-bottom-background: var(--sidebar);
  }
}
```

theme: utility shelf-hairline
```css
@utility shelf-hairline {
  background:
    linear-gradient(var(--border-hairline), var(--border-hairline)) bottom / 100% 1px no-repeat,
    var(--surface-shelf);
}
```

theme: utility glass-backdrop
```css
@utility glass-backdrop {
  backdrop-filter: blur(calc(var(--material-blur) * 1.4)) saturate(var(--material-saturate));
}
```

theme: utility clip-join
```css
@utility clip-join {
  clip-path: shape(
    from 0 100%,
    arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of calc(var(--f) + 1px) ccw,
    line to calc(var(--f) + 1px) var(--r),
    arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
    line to calc(100% - var(--r)) 1px,
    arc to calc(100% - 1px) var(--r) of calc(var(--r) - 1px) cw,
    line to calc(100% - 1px) 100%,
    close
  );
}
```

theme: utility clip-join-phone
```css
@utility clip-join-phone {
  clip-path: shape(
    from 0 100%,
    arc to calc(var(--f) + 1px) calc(var(--h) - var(--f)) of calc(var(--f) + 1px) ccw,
    line to calc(var(--f) + 1px) var(--r),
    arc to calc(var(--f) + var(--r)) 1px of calc(var(--r) - 1px) cw,
    line to 100% 1px,
    line to 100% 100%,
    close
  );
}
```

theme: component bar-group
```css
@layer components {
  [data-slot="tools"] [data-bar-item] {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: var(--c-bar-item);
    block-size: var(--c-bar-item);
    border: 0;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--ink-strong);
    cursor: pointer;
    transition: var(--transition-control);
    @media (hover: hover) and (pointer: fine) {
      &:hover {
        background: var(--surface-hover);
      }
    }
    &[data-counted] {
      --mark-inset: calc((var(--c-bar-item) - var(--c-bar-symbol)) / 2);
      gap: var(--space-2);
      padding-inline: var(--mark-inset) calc(var(--mark-inset) + var(--c-bar-symbol) / 12);
    }
    [data-slot="num"] {
      font: var(--type-label);
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    @media (width < 900px) {
      inline-size: var(--c-bar-caw-glass-phone);
      min-inline-size: var(--c-bar-caw-glass-phone);
      block-size: var(--c-bar-caw-glass-phone);
    }
  }
  [data-slot="tools"] [data-slot="bar-symbol"] {
    inline-size: var(--c-bar-symbol);
    block-size: var(--c-bar-symbol);
    color: var(--ink-muted);
  }
  @media (width < 900px) {
    [data-slot="tools"] [data-machines] {
      display: none;
    }
  }
}
```

theme: component session-hover-glyphs
```css
@layer components {
  [data-nest-host] [data-slot="head"] > [data-slot="mark"] svg {
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
    color: var(--mark-glyph);
  }
  [data-nest-host] [data-session-hover-tone] svg {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
}
```

## Tokens

token: --c-run-result-max 240px — the height a step's opened result scrolls inside (RunSteps.svelte:269); a real component dimension, no ladder step (the nearest, 32, is a row).
token: --c-trail-col 3ch — the width of a tree row's age column, as wide as "59m" (SessionRow.svelte:396); a character measure, not a length on any ladder.
token: --c-session-hover-head 240px — the least width of the session hover card's head, so a short title never narrows the card (SessionHover.svelte:346).
token: --c-session-hover-room 360px — the room the session hover card reads as its cell room (SessionHover.svelte:334); a real card dimension, `--c-panel-w` (380) is the caw panel's.
token: --c-rail-sheet-w 284px — the width of the phone's navigation sheet (Shell.svelte:1022); a real dimension, the desk rail (`--c-sidebar-w` 228) is another surface.

## Removed

removed: SessionRow.svelte:328,356,367 `items-center` (removed) on a `display:block` title/line — a flex alignment on a block box that draws nothing (the old `.title, .line` rule was block + align-content).
removed: SessionRow.svelte (style) `.item`, `.row`, `.row-action`, `.swipe-reveal`, `.words`, `.end`, `.cell`, `.title`, `.line`, `.trail`, `.field`, `.doing`, `@media` rules — dead selectors: no element of the file carries those classes; their declarations are on the elements as utilities.
removed: SessionPane.svelte (style) `.body`, `.pane`, `.transcript-slide`, `.state`, `.move-layer`, `.veil`, the duplicated `.body` — dead or duplicate selectors.
removed: Shell.svelte (style) `.top`, `.burger`, `.content`, `.swap`, `.page`, `.tools` (non-hook), `.right` phone rule — dead selectors; the live ones moved.
removed: Shell.svelte `--rail-sheet-close-room: 46px` — a custom property no file reads.
removed: Shell.svelte `class="slot-strip"` / `lifted` / `away` classes — merge residue; the file's script already sets `data-shell-lifted` / `data-shell-away`, which the markup's data variants read.
removed: ScreenEdges.svelte (style) `.edge-top`, `.edge-bottom` — dead; the strips carry their utilities.
removed: Sidebar.svelte (the four row="nav" MenuButtons) `class="h-c-nav-h"` on four `row="nav"` MenuButtons — the kit's default size already is `h-[var(--c-nav-h)]` (sidebar-menu-button.svelte:14), so the class restated it.
removed: Sidebar.svelte `data-rail-configure` styling rule — replaced by the kit Button's `current="selected"` (the hook attribute stays).

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/SessionRow.svelte:404 Spinner (default) — an inline wait; `size-space-4` dropped, the default is `size-icon-md` — done
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1227 Button current="selected" — the selected tint and its colour transition while `aria-current="page"` — done
kit-swap: apps/dashboard/src/lib/cawco/SessionRow.svelte:375 Spinner size="sm" — a 12px inline wait (`size-icon-sm`)
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:650 Skeleton height="icon-sm" — a group label's word bar at 12px
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:654 Skeleton height="rail-row" — a placeholder rail row at the list row's 30px (`c-btn-h-sm`)
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:881 SidebarMenuBadge align="row-centre" — centred on its nav row (`peer-data-[size=default]/menu-button:top-1/2 -translate-y-1/2`)
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:921 SidebarMenuBadge align="row-centre" — the same
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1048 SidebarMenuButton row="list" height="list" — a project row at 30px (`h-c-btn-h-sm`)
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1138 SidebarMenuSubButton row="compact" — the compact row's height (`h-(--row-compact-h)`)
kit-swap: apps/dashboard/src/lib/cawco/Sidebar.svelte:1199 SidebarMenuButton row="avatar" — the footer avatar button: 30px square, centred, overflow visible (`size-c-btn-h-sm justify-center overflow-visible`)
kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1022 SheetContent hide="desk" — the phone navigation sheet gone from 900px up (`desk:hidden`)
kit-swap: apps/dashboard/src/lib/cawco/Shell.svelte:1031 SheetHeader hidden="visually" — a heading read by assistive tech only (`sr-only`)

## Fixed

fixed: Shell.svelte (bar group) the `.tools :global(...)` rules for the items' count, symbol and Jump glyph were dead (no `.tools` class on the element) so the counted items, the symbol size and the muted ink were lost; they are back as the `bar-group` theme component, on the hooks `[data-bar-item]`, `data-slot="num"` and `data-slot="bar-symbol"` — DESIGN.md Components, the bar's glass group.
fixed: Shell.svelte:1213 the trailing cluster `.right` had no rule after the merge (`ms-auto flex min-w-0 items-center`, hosting `flex-none ps-space-3`, narrow `flex-initial ps-0`); it is on the element — DESIGN.md Layout, the top bar.
fixed: Shell.svelte:1163 the page's strip (`slot-strip`) had no layout (`relative flex grow basis-0 items-center self-stretch`), no leave state and no narrow hide; it has them on the same data variants the tabs strip uses.
fixed: Shell.svelte:955 the skip link is visually hidden by `sr-only` and shown on focus with `focus:not-sr-only` — it no longer parks at `left: -9999px`.
fixed: ScreenEdges.svelte:103 the top strip's mask (paint only above the safe area) was lost in the conversion; it is `edge-mask-top` again — the strip rule in the file's own header comment.
fixed: SessionRow.svelte:599 the fault / ask indent was set by two `:global` class rules on child roots; it is set once on a `display: contents` wrapper the children inherit from — one source for the row's note, fault and question.
fixed: SessionRow.svelte:3 Peek and Archive carried the same 700-character class list twice, with `ml-0` / `mr-0` / `mr-space-2` margins cancelling each other and physical `right-`; they share one `ROW_ACTION` recipe with `me-space-2 can-hover:me-0` and `end-` — DESIGN.md Layout (logical properties).
fixed: Shell.svelte:1075 the shelf's hairline is one background layer (`shelf-hairline`) instead of a custom property holding a gradient string.

## Gaps

gap: apps/dashboard/src/lib/components/ui/ has no bar-item part; Shell.svelte:1245 (Jump) and the `bar-group` theme rule restate the item recipe that FilesItem.svelte:35, MachinesButton.svelte:89 and NeedsCaw.svelte:667 also use — DESIGN.md Components, the bar's glass group (one kit part).
gap: apps/dashboard/src/lib/components/ui/sheet/sheet-content.svelte has no left-rail variant; Shell.svelte:1022 (`w-c-rail-sheet-w desk:hidden`) and :1031 (`sr-only` header) are the sheet's own look — DESIGN.md Components, Sheet.
gap: apps/dashboard/src/lib/components/ui/sidebar/sidebar-menu-button.svelte:14 has one row height (`--c-nav-h`); Sidebar.svelte:1048 (30px project rows) and :1199 (30px avatar) need `row="list"` / `row="avatar"` heights there — DESIGN.md Components, the rail.

## Contracts

contract: apps/dashboard/src/lib/cawco/files/FilesItem.svelte:45 carries data-slot="bar-symbol" (Shell.svelte:1217 `data-slot="tools"`, whose `bar-group` theme rule `[data-slot="tools"] [data-slot="bar-symbol"]` reads it)
contract: apps/dashboard/src/lib/cawco/MachinesButton.svelte:100 carries data-slot="bar-symbol" (Shell.svelte:1217 `data-slot="tools"`, whose `bar-group` theme rule `[data-slot="tools"] [data-slot="bar-symbol"]` reads it)

Notes on the two contracts: the items already carry `data-bar-item` (FilesItem.svelte:35, MachinesButton.svelte:89, NeedsCaw.svelte:667) and `data-slot="num"` (FilesItem.svelte:47, MachinesButton.svelte:102); the machines item hides under 900px through its existing `data-machines` attribute. The symbol ink is in `@layer components`, so MachinesButton's own tone tint (`attn`, `fail`) wins over it, as the brief asks.

## cross-file hooks and other lines

cross-file hook: Shell.svelte `[data-slot="tools"] [data-machines]` — selects MachinesButton.svelte:88 `data-machines`; nothing to retarget.
shadow kept residual: none.
important kept: none.
