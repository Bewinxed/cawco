# L45-cawco-workspace

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding; before reporting, interface-craft (Design Critique) and ui-observer.

better-ui rules followed: outer radius = inner radius + padding (the lift's `::before` takes `rounded-lg`, the lift's own corner); shadows for elevation (`shadow-overlay` on the lift, `inset-ring` for the draft bar and skeleton card, a hairline); transitions name their properties, never `all` (`transition-[opacity]`, `transition-[rotate]`, `transition-[height]`); hover only where a pointer can hover (the `hover:` variant carries the guard, so the cwd button's `[@media(hover:hover)]:[&:hover]` is `hover:`); motion gated by `motion-safe:` / `motion-reduce:` and opacity-only under reduced motion; one press scale (`pressable` owns it, the duplicate `active:` scale on the tab controls is gone); `overscroll-contain` on the details body.

better-layout rules followed: logical properties for anything that mirrors (`start-0`, `ps-`/`pe-`, `ms-`/`me-`, `text-start`); breakpoints are the design system's (`max-phone:`, `max-desk:`, `coarse:`), content-sized containers use `min-w-0` / `max-w-*` tokens, never a fixed height; a gap between groups from the ladder; a container query where a component answers to its own width (`@min-project-dock:`).

## Files

| file | rules moved | residual | literals removed | breakpoint edges |
| --- | --- | --- | --- | --- |
| workspace/PaneDeck.svelte | `::before` shadow + 3 rules → `before:` utilities; dots/park offsets | none (`<style>` deleted) | 12px, 50%/-50%, 6px, 18px | none |
| workspace/PaneLeaf.svelte | no `<style>`; `left-0` → `start-0` ×2 | none | none | none |
| workspace/PaneTabs.svelte | whole `<style>` (9 rules) → 3 `theme: component`, 2 `theme: variant`, pseudo/svg rules → utilities | none | 12px, 32px, 10px, 16px, 100vw, 20px ×3, 24px, 416px, 760px, 85dvh, 12rem | `max-width: 900px` (`max-[900px]:hidden` ×4) is `max-desk:` (< 900px, 1px); `(max-width: 640px)` card query is `max-phone:` (< 640px, 1px) |
| workspace/SessionDetails.svelte | whole `<style>` (12 rules) → 2 `theme: utility`, icon classes through `class` | none | 28px ×4, 44px, 6px, 232px, 48px, 96px, 8px | `(max-width: 640px)` is `max-phone:` (1px) |
| workspace/SessionStatus.svelte | dead `<style>` deleted; working glyph's breath restored | none | none | none |
| project/[id]/+page.svelte | whole `<style>` (3 rules) → `theme: component`; draft bar and line (dead classes) → utilities | none | 36rem, 72ch ×2, 938px, 54px, 15rem/22rem | `(max-width: 639px)` is `max-phone:` (exact) |
| project/new/+page.svelte | no `<style>`; literals → tokens | none | 72rem, 80px | none |

Kind-5 declarations: none. "needs variant": none beyond the `theme: variant` lines below. "needs transition token": none. Literals preserved: none.

## Theme additions

theme: utility will-change-opacity
```css
@utility will-change-opacity {
  will-change: opacity;
}
```

theme: animate breath
```css
@theme {
  --animate-breath: breath var(--breath) var(--ease-in-out) infinite;
  @keyframes breath {
    50% {
      opacity: var(--breath-floor);
    }
  }
}
```
(`@keyframes breath` already lives in app.css:2972 with the `.breathe` class; this moves it onto the theme so `motion-safe:animate-breath` is the one form and `.breathe` can follow.)

theme: variant reordering
```css
/* A tab in a strip while one of its tabs is dragged to a new place (tab-drag.svelte.ts sets `data-reordering` on the track). */
@custom-variant reordering (:where([data-slot="ff-tabs-list"][data-reordering]) > &);
```

theme: variant details-gliding
```css
/* Inside the session details card while it glides to another tab (PaneTabs sets `data-morph` on the card). */
@custom-variant details-gliding (&:where([data-session-details-popover][data-morph] *));
```

theme: variant project-dock
```css
/* The project page's own container, once it is wide enough to hold Caw's docked panel beside the page (`--container-project-dock`). */
@custom-variant project-dock {
  @container (width >= theme(--container-project-dock)) {
    @slot;
  }
}
```

theme: utility session-details-chips
```css
/* The session details card's settings row: the chips NsPopover's trigger, ToolChips and AccountSwitch render sit in it. The card's width holds the longest names whole, with the chips' insides drawn in a little; a phone's row is ~350px, so its three chips fit whole with the chips' sides drawn in, and a bordered chip's chevron (the room the model's name needs) goes, the account chip's staying since it is the only hint that it opens anything. */
@utility session-details-chips {
  & [data-model-chip] {
    flex: 0 1 auto;
    min-width: 0;
  }
  & .ns-chip-btn {
    gap: var(--space-1);
    height: var(--row-compact-h);
  }
  @variant max-phone {
    & .ns-chip-btn {
      height: var(--c-btn-h-lg);
      padding-inline: var(--space-2);
    }
    & .ns-chip-btn:not([data-account-chip]) > svg[data-slot="chevron"] {
      display: none;
    }
  }
}
```

theme: utility session-details-model-pop
```css
/* ModelSection's picker inside the details card's model popover: no surface of its own, the search as wide as what is typed in it (motion/autosize.svelte.ts autowidth, tweening a character at a time), and a list scrolled in whole rows (five 44px rows, four gaps and the list's padding: c-model-list-max). */
@utility session-details-model-pop {
  & [data-slot="picker"] {
    border: 0;
    box-shadow: none;
    background: transparent;
  }
  & [data-slot="search"] input {
    --autowidth: 1;
    @variant motion-safe {
      transition: width var(--dur-control) var(--ease-out);
    }
  }
  & [data-slot="list"] {
    height: auto;
    max-height: var(--c-model-list-max);
    overflow: hidden auto;
    scroll-snap-type: y mandatory;
    /* The row gap, so a snapped row's neighbour shows none of itself. */
    scroll-padding: var(--space-row);
  }
  & [data-slot="row"] {
    scroll-snap-align: start;
  }
}
```

theme: component pane-tabs-strip
```css
/* PaneTabs: the strip's host rules on the kit's Tabs root (`data-session-tabs`, `data-hosted`) and on TabsList's track (`.ff-tabs-list`). They override the track's size ladder and outrank its folder padding by selector: the root's data-slot is in the selector so that holds at any stylesheet order. `data-scrollable` is TabsList's own attribute for a scrolling track. */
@layer components {
  [data-session-tabs] {
    /* A tab's height, its inner pad and its flared foot's room at the track's end, shared by the track and the "+" after it. */
    --strip-px: var(--space-3);
    --strip-item-rest: var(--space-8);
    --strip-reach: var(--space-3);
    --strip-fade: var(--c-tab-strip-fade);
    --strip-uncapped: var(--c-tab-strip-uncapped);
    --strip-item: var(--strip-item-rest);
    --strip-flare: var(--radius-sm);
    display: flex;
    align-items: flex-end;
    flex: 0 0 auto;
    min-inline-size: 0;
    padding-block: var(--space-1) 0;
    padding-inline: var(--space-7) var(--space-4);
    /* The shelf: two steps below the transcript, one below an unchosen tab, so the chosen tab (in the transcript's own surface) reads as the page it opens. */
    background: var(--surface-shelf);

    /* The tab controls' touch areas reach past the row's bottom edge: on a coarse pointer the row stacks above the transcript beneath it. */
    @variant coarse {
      position: relative;
      z-index: 1;
    }
  }
  [data-session-tabs][data-hosted] {
    flex: 1 1 0;
    align-self: stretch;
    padding: 0;
    background: none;
  }
  /* The leaf's container query takes no var(): 620px is --container-leaf. */
  @container leaf (width <= 620px) {
    [data-session-tabs]:not([data-hosted]) {
      padding-inline-start: var(--space-4);
    }
  }
  /* On a phone this row is the app's only bar (Shell, `.top.floating`): the bar's height, and its two ends left to the sidebar toggle and to Caw's glass. */
  [data-session-tabs]:not([data-hosted]) {
    @variant max-desk {
      --strip-item: var(--c-tab-row-h);
      --strip-flare: var(--radius-lg);
      min-block-size: var(--c-top-bar-h);
      padding-block-start: 0;
      padding-inline: calc(var(--c-bar-phone-edge) + var(--c-bar-toggle-glyph))
        calc(var(--c-bar-phone-gap) + var(--c-bar-caw-glass-phone));
    }
  }
  /* The session track scrolls sideways, and a scroll container clips on both axes; its transparent padding grows into an equal negative margin on a coarse pointer, so the controls' touch areas above and below the tabs sit inside its clip and nothing moves. */
  [data-session-tabs][data-slot="tabs"] .ff-tabs-list[data-scrollable] {
    @variant coarse {
      padding-block: calc(var(--pad) + var(--strip-reach)) var(--strip-reach);
      margin-block: calc(-1 * var(--strip-reach));
    }
  }
  /* The strip takes one step taller than the component's default in a bar with room, with the component's own text size and a tighter horizontal pad. The hover ghost lifts an unchosen tab's card toward the chosen sheet's surface; by night it is the hover step. */
  [data-session-tabs][data-slot="tabs"] .ff-tabs-list {
    --px: var(--strip-px);
    --text: var(--text-label);
    --item: var(--strip-item);
    /* The chosen tab's sheet: the transcript's head dissolves into the same token (HeadFade). */
    --sheet: var(--tab-sheet);
    --tab-hover: light-dark(var(--surface-recess), var(--surface-hover));
    /* The status rim's stroke, a plain number, drawn on each tab's own path (TabItem). */
    --rim-w: var(--tab-rim-width);

    @variant contrast-more {
      --rim-w: 1;
    }
    @variant reduced-transparency {
      --rim-w: 1;
    }
  }
  /* The phone's row: tabs a row's height tall, standing on the bar's floor, the strip's ends fading over a short run so a tab slides under the toggle and Caw rather than being cut. Each end's fade is cut short at a tab drawn chosen (TabsList `--fade-cap-start`/`--fade-cap-end`). */
  [data-session-tabs]:not([data-hosted])[data-slot="tabs"] .ff-tabs-list[data-scrollable] {
    @variant max-desk {
      --item: var(--strip-item);
      --pad: 0px;
      --fade-len: var(--strip-fade);
      --edge-room-start: calc(var(--fade-len) * 1.5);
      --radius: var(--radius-lg);
      --overlap: var(--radius-sm);
      padding-block-start: calc(var(--c-top-bar-h) - var(--c-tab-row-h));
      margin-block-start: 0;
      --fade-run-start: min(
        var(--fade-start),
        calc(var(--fade-cap-start, var(--strip-uncapped)) / 1.5)
      );
      --fade-run-end: min(
        var(--fade-end),
        var(--fade-cap-end, var(--strip-uncapped))
      );
      mask-image: linear-gradient(
        to right,
        transparent,
        transparent calc(var(--fade-run-start) * 0.375),
        var(--mask-opaque-a15) calc(var(--fade-run-start) * 0.75),
        var(--mask-opaque-a60) calc(var(--fade-run-start) * 1.125),
        var(--mask-opaque) calc(var(--fade-run-start) * 1.5),
        var(--mask-opaque) calc(100% - var(--fade-run-end)),
        var(--mask-opaque-a90) calc(100% - var(--fade-run-end) * 0.75),
        var(--mask-opaque-a50) calc(100% - var(--fade-run-end) * 0.5),
        var(--mask-opaque-a10) calc(100% - var(--fade-run-end) * 0.25),
        transparent
      );
    }
  }
}
```

theme: component pane-tabs-hang
```css
/* PaneTabs: the surfaces that hang from a tab (HangCard's portalled content), the tab's box (TabItem) and bits-ui's floating wrapper, which other files render. Both hang from the tab's whole box as one silhouette with it (HangCard `tab`): the card's outline, cast and open and close are the component's, its content runs edge to edge and its head is its tab's surface. The card is `c-details-card-w` wide (the script's cardWidth keeps the same 416), the screen less its margins at most, and its width is where it is placed (`--hang-width`, set from placeOf); a phone's card stands a margin in from each side, under its tab, and holds clear of the screen's foot. */
@layer components {
  .kit-pop[data-session-details-popover] {
    display: flex;
    max-height: min(
      var(--c-details-card-max-h),
      var(--bits-popover-content-available-height, var(--c-sheet-max-h))
    );
    overflow: hidden;
    overscroll-behavior: contain;
    padding: 0;

    @variant max-phone {
      max-height: min(
        calc(100dvh - var(--c-top-bar-h) - 2 * var(--c-screen-margin) - var(--safe-bottom)),
        var(--bits-popover-content-available-height, var(--c-sheet-max-h))
      );
    }
  }
  /* The tab's menu hangs on the tab's own surface, as the card's head is, so the two read as one sheet. Its width floor (`--menu-min`, from menuMin/placeOf) and the card's width and stack are classes PaneTabs gives HangCard (`min-w-(--menu-min)`, `w-(--hang-width)`, `z-60`): the kit's `min-w-48`, `w-72` and `z-50` are utilities, which a components-layer rule cannot outrank. */
  .kit-pop.kit-hang[data-tab-menu] {
    --hang-surface: var(--surface-recess);
  }
  /* The floating layer rewrites where the card may stand (bits-ui's `--bits-floating-*` on its wrapper, copied onto the card as `--bits-popover-*`) as the card opens and as it follows its tab, a few times in a frame. As inherited custom properties each rewrite restyled everything the card holds: only the card reads them (its max-height), so they stop at its children. */
  .kit-pop[data-session-details-popover] > * {
    --bits-floating-transform-origin: initial;
    --bits-floating-available-width: initial;
    --bits-floating-available-height: initial;
    --bits-floating-anchor-width: initial;
    --bits-floating-anchor-height: initial;
    --bits-popover-content-transform-origin: initial;
    --bits-popover-content-available-width: initial;
    --bits-popover-content-available-height: initial;
    --bits-popover-anchor-width: initial;
    --bits-popover-anchor-height: initial;
  }
  /* A tab's rim's ink at the strength it wears it now: the one outline's ink across the tab while a hang stands drawn out of it (HangCard). Read off the tab alone, so it stays there: inherited, its value moving with `--pick` restyled every element under the tab each frame of a choice. */
  @property --hang-rim {
    syntax: "*";
    inherits: false;
  }
  [data-session-tabs] [data-slot="tab"] [data-slot="ff-tab"] {
    --hang-rim: color-mix(
      in oklab,
      var(--rim-ink)
        calc(
          (var(--rim-rest) + (var(--rim-full) - var(--rim-rest)) * var(--pick)) *
            100%
        ),
      var(--border-control)
    );
  }
  /* A pinned card follows its tab as the strip scrolls, frame by frame: its wrapper moves on its own layer. The glide to another tab: the wrapper's move and the card's height together (`data-details-morph`, set by PaneTabs). */
  [data-bits-floating-content-wrapper][data-session-details] {
    will-change: transform;
  }
  [data-bits-floating-content-wrapper][data-details-morph] {
    @variant motion-safe {
      transition: transform var(--dur-pop) var(--ease-drawer);
    }
  }
}
```

theme: utility pane-tab-needs
```css
/* Parked on you (`data-needs` on the tab): the label carries the strong ink whether or not it is chosen, so the ask is legible from across the strip. It comes up at the panel's pace, the way the tab's glyph turns. The label is named by its own attribute (`data-ff-tab`): under a state, Chrome keys an attribute selector to the attribute's name alone, and `[data-slot="ff-tab"]` restyled every `data-slot` in the tab when `data-needs` came or went. A utility, so it outranks TabItem's own `text-ink-muted` (utilities layer) by specificity. */
@utility pane-tab-needs {
  &[data-needs] [data-ff-tab] {
    color: var(--ink-strong);

    @variant motion-safe {
      transition: color var(--dur-panel) var(--ease-out);
    }
  }
}
```

theme: component project-page-foreign
```css
/* The project page: the kit Tabs root in the view strip takes no class, EmptyState's action slot (`.kit-empty-action`) belongs to the kit, and a phone's page children are other components' roots. */
@layer components {
  [data-slot="strip"] > [data-slot="tabs"] {
    display: flex;
    flex: 0 1 auto;
    min-inline-size: 0;
  }
  [data-slot="caw-empty"] .kit-empty-action {
    align-self: stretch;
  }
  [data-slot="project-page"] {
    @variant max-phone {
      & > * {
        flex-shrink: 0;
      }
    }
  }
}
```

## Tokens

token: --c-deck-gap 12px — the gap between two cards of the phone's deck, equal to `GAP` in workspace/deck.svelte.ts (a script constant that sizes the drag travel); no ladder step fits, the two must stay equal.
token: --c-new-project-w 72rem — the new-project page's column; a page measure wider than the reading measure, no ladder step.
token: --c-caw-hero 80px — the slot that holds Caw at his hero size over the new-project page, equal to `CAW_SIZE` in project/new/+page.svelte; a component dimension.
token: --c-details-head-icon 28px — the session details head's copy button and harness mark, level with the title's first line; a component dimension.
token: --c-context-bar-min 48px — the least a context meter's bar draws in the details strip; component dimension.
token: --c-context-bar-max 96px — the most a context meter's bar draws in the details strip; component dimension.
token: --c-model-list-max 232px — the model popover's list height cap in the details card: five 44px rows, four gaps and the list's padding, so rows scroll whole; component dimension.
token: --c-tab-strip-fade 16px — the phone strip's end fade run (PaneTabs); no ladder step is nearest (14 and 18 are equally near).
token: --c-tab-strip-uncapped 100vw — the strip's fade cap when no tab is drawn chosen: wider than any fade, so the `min()` never caps it; a sentinel, not a length drawn.
token: --c-details-card-w 416px — the session details card's width (DESIGN.md: "the card is 416px wide"), equal to `cardWidth()`'s 416 in PaneTabs; a component dimension.
token: --c-details-card-max-h 760px — the details card's height cap on a desk; a component dimension.
token: --c-tab-menu-min 12rem — the least width a tab's hanging menu takes (the kit menu's `compact` 192px floor); component dimension.
token: --c-new-task-w 36rem — the table view's new-task form width; a component dimension.
token: --c-draft-line 14rem — the width a draft view's sentence takes before its Keep and Discard wrap beneath it (flex-basis); a text measure, not a spacing step.
token: --c-skeleton-card-h 54px — a card's placeholder height in the next project's board skeleton; component dimension.
token: --container-project-dock 938px — the width at which the project page holds Caw's docked panel beside the page: the panel (`c-panel-w` 380px and its `space-6` end margin), the pane's inline padding (`space-7`, `space-6`), two board columns at 240px and the `space-3` between; a container query takes no var(), so the sum is its own named width.

## Removed

removed: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1748 `active:transform-(--tpress)` and `--tpress` — `pressable` already scales every pressed tab control to `--press-scale` (app.css `.pressable`), so the second scale was the same declaration twice.
removed: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1823 `active:transform-(--tpress)` and `--tpress` — the same, for the "+".
removed: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:693 `[data-slot="settings"] :global(.tool-chips) { gap }` — ToolChips renders `data-slot="tool-chips"` with `gap-inherit` (no `.tool-chips` class exists), so the rule matched nothing, and the row's own `gap-space-1` is the gap.
removed: apps/dashboard/src/lib/cawco/workspace/SessionStatus.svelte:1 the whole `<style>` — every selector (`.session-status`, `.glyph`, `.mark`, `.compact`, `.working .glyph` …) named a class the markup no longer carries; the markup already holds each rule as utilities.
removed: apps/dashboard/src/lib/cawco/workspace/PaneDeck.svelte:107 the `[data-lifted] [data-pane-lift]::before` and reduced-motion `<style>` rules (three) — the lift's shadow is `before:` utilities under `group-data-lifted/deck:` and `motion-reduce:before:transition-off`; the rest-state `border-radius: var(--radius-lg)` is `before:rounded-lg`.

## Fixed

fixed: apps/dashboard/src/lib/cawco/workspace/SessionStatus.svelte:57 the working glyph lost its breath in the 10-17 conversion (the `.working .glyph` rule that ran `breath` matched nothing once the classes went) — `motion-safe:animate-breath` restores DESIGN.md's "Live work breathes".
fixed: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1678 the draft bar and its line were classes (`draft-bar`, `draft-line`) with no rule behind them after the merge — they drew as plain text; the main rule is back as utilities (flex-wrap row, band surface, hairline ring, the line a 14rem measure that wraps the actions beneath it).
fixed: apps/dashboard/src/lib/cawco/workspace/PaneLeaf.svelte:387 the focus rail and the composer dock sat on `left-0`; they stand on the leading edge (`start-0`) so they mirror — DESIGN.md Layout.
fixed: apps/dashboard/src/lib/cawco/workspace/PaneLeaf.svelte:517 the same, for the dock.
fixed: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1734 the details chevron turned with `transform: rotate(180deg)` under a `transition: transform`; it is the `rotate` property now (`rotate-180` with `transition-[rotate]`), so it composes with the scale the tab's idle state sets.
fixed: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1447 the drop caret's pseudo-elements were a `<style>` rule; they are `before:` / `after:` utilities on the tab, `2px` as `space-row`.
fixed: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1904 the missing-project notice used `p-6` (24px), a Tailwind default off the ladder; it is `p-space-7`.
fixed: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1471 the strip, the pane and the page notices padded and spaced with `pl`/`pr`/`ml`/`mr`; they are `ps`/`pe`/`ms`/`me`, so they mirror.
fixed: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:653 the cwd button went to `hover:text-ink-strong` from `[@media(hover:hover)]:[&:hover]` (the `hover:` variant carries the guard), and `text-left` to `text-start`.
fixed: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:874 the footer's phone stretch was `[@media(max-width:640px)]:flex-1`; it is `max-phone:flex-1`.

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionStatus.svelte:75 Spinner `size-icon-md` — done (the default is `size-icon-md`; the class is gone)
kit-swap: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1622 ContextMenu.Trigger `contents` — a trigger that draws no box, its tab child being the press target (`asChild`'s look); the variant is the trigger's `box="none"`
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1540 Button `max-phone:hidden` — an action the strip leaves below 640px (the head's ⋯ carries it): a Button `reach="desk"` variant
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:1558 Button `max-phone:hidden` — the same, for Ask Caw
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2174 Skeleton `h-space-4` — a stage name's bar (14px): Skeleton height="stage-name"
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2175 Skeleton `h-c-skeleton-card-h` — a board card's placeholder (54px): Skeleton height="board-card"
kit-swap: apps/dashboard/src/routes/(app)/project/[id]/+page.svelte:2176 Skeleton `h-c-skeleton-card-h` — the same

shadcn variant: apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte:1734 data-open rotate

## Contracts

contract: apps/dashboard/src/lib/components/ui/fluid-tabs/TabsList.svelte:1108 data-scrollable | PaneTabs.svelte (the `pane-tabs-strip` rules select `.ff-tabs-list[data-scrollable]`) | TabsList sets `data-scrollable` on the track (integration moves `scrollable` from a class to the attribute, and app.css:793)

contract: workspace/SessionDetails.svelte:829 passes size="compact" (L41 LimitBar role); the `--row-paint` it set (:817) is dropped, LimitBar falls back to that paint

cross-file hook: apps/dashboard/src/lib/cawco/workspace/PaneDeck.svelte:107 `[data-pane-lift]` stays a data attribute the lift is named by; no other file selects it.

## Gaps

gap: apps/dashboard/src/lib/components/ui/button/button.svelte (no line: the variants) the details head's copy-link button (`data-slot="icon-action"`, SessionDetails.svelte:608) and the tab strip's chevron, close and "+" (PaneTabs.svelte:1715, 1748, 1823) are hand-rolled icon buttons — 28px/20px/24px squares with the house hover fill; the kit's Button has no 20px or 28px icon size and its `ghost` corner is 10px, so a swap is not straight — DESIGN.md Buttons: "one button, its looks are variants".
gap: apps/dashboard/src/lib/components/ui/popover/popover-content.svelte:96 the details card's `z-index: 60` outranks the kit popover's `z-50` so it stands over the shell's top bar; the shell's stack has no scale — DESIGN.md Elevation & Depth: stacking by role, not by number.
gap: apps/dashboard/src/lib/components/ui/fluid-tabs/Tabs.svelte (the `tabsVariants`) the session strip's host rules (`pane-tabs-strip`: flex row, padding, shelf surface) restyle the kit's Tabs root and TabsList from outside; they belong to a `Tabs variant="strip"` — DESIGN.md Folder tabs.

## Compiled check

Compiled with the repo's `@tailwindcss/node` 4.3.3 (`compile()` over `@import "src/app.css"` plus the blocks above and the lane's `token:` keys, `build([...])` over the lane's new classes). Emitted selectors:

- `.session-details-chips [data-model-chip]`, `.session-details-chips .ns-chip-btn` (+ `@media (width < 640px)` pair), `.session-details-model-pop [data-slot="picker"|"search" input|"list"|"row"]`: utilities layer. They compete with `ns-theme.css`'s `.ns-chip-btn` (`@utility`, `:where(.ns-theme &)`, zero specificity): ours is (0,2,0) in the same layer and wins by specificity.
- `.pane-tab-needs[data-needs] [data-ff-tab]` (0,3,0): competes with TabItem's `text-ink-muted` (0,1,0) and `in-variant-folder:data-tab-item-selected:text-ink-muted`; wins by specificity, same layer. (A first draft as an `@layer components` rule lost to those utilities; it is a utility now.)
- `.z-60`, `.w-(--hang-width)`, `.min-w-(--menu-min)`: utilities on HangCard; they compete with the kit's `z-50`, `w-72`, `min-w-48` (same layer, same specificity): `cn()`/tailwind-merge drops the kit's, so only ours is emitted. The card's `.kit-pop[data-session-details-popover]` rule (components layer) keeps only what no utility sets (max-height, flex, padding, overflow).
- `.project-dock:data-caw-open:grid-cols-(--docked-cols-side)[data-caw-open]` in `@container (width >= 938px)`: after the base `grid-cols-(--docked-cols)` and the `phone:` variants in source order, same specificity; wins at 938px+ as before.
- `.motion-safe:reordering:not-data-following:dur-panel` → `:where([data-slot="ff-tabs-list"][data-reordering]) > .x:not([data-following])`, `.motion-safe:details-gliding:*:where([data-session-details-popover][data-morph] *)`, `.motion-safe:animate-breath` → `animation: var(--animate-breath)`, `.before:will-change-opacity::before`, `.group-data-open/tdetails:rotate-180`, `.-start-space-row`, `.inset-ring-border-hairline`: no app.css rule competes.
- `@layer components` blocks (`pane-tabs-strip`, `pane-tabs-hang`, `project-page-foreign`): they compete with `app.css` `.ff-tabs-list` (components layer, (0,1,0)); ours carry `[data-session-tabs][data-slot="tabs"] .ff-tabs-list` (0,4,0) and win by specificity, whatever the order. `@keyframes breath` is emitted by both the theme and app.css:2972 (identical).
