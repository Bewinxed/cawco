# Lane L19-cawco-home-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding (then emil-design-eng, transitions-dev, interface-craft, ui-observer for the motion and critique steps).

## Files

| file | rules moved | residual (1/2/3/4/5) | literals preserved | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| home/NoticeRow.svelte | 1 (pointer: coarse `::after` insets → `coarse:after:`); 5 literals (28/44/24/12px) → c-row-lead / c-row-h / c-btn-h-xs / icon-sm / c-btn-h-lg | 0/0/0/0/0 | 0 (the 5.25/24 side-bearing ratio is unitless) | none | none |
| home/PeekSheet.svelte | 1 (`--sheet-h` literal → token) | 0/0/0/0/0 | 0 | none | none |
| home/StatusLine.svelte | 1 (28px → c-row-lead) | 0/0/0/0/0 | 0 | none | none |
| home/UpdateCard.svelte | `<style>` (2 pseudo rules, 1 svg-paint rule) → `before:` utilities + `non-scaling-stroke`; 6 literals → ladder / tokens | 0/0/0/0/0 | 0 | none | none |
| home/WorkTabs.svelte | `<style>` (5 rules) → utilities + `theme: component work-tabs`; 8 literals → ladder / tokens | 0/0/0/0/0 | 0 | none | none |

## Contracts

(none)

## Theme additions

theme: utility non-scaling-stroke

```css
@utility non-scaling-stroke {
  & path {
    vector-effect: non-scaling-stroke;
  }
}
```

theme: component work-tabs

```css
@layer components {
  /* The session tabs' sizes (PaneTabs), hosted: the kit's fluid tabs
     (ui/fluid-tabs) read these off their own list and tabs, which this
     sets at the selector's weight (WorkTabs' `data-work-tabs` host). */
  [data-work-tabs][data-slot="tabs"] .ff-tabs-list {
    --px: calc(var(--space-2) - var(--tight) * 0.09);
    --text: var(--text-label);
    --item: var(--space-8);
    --sheet: light-dark(var(--surface-raised), var(--surface-hover));
    --tab-hover: light-dark(
      var(--surface-hover),
      color-mix(in oklch, var(--surface-fill) 50%, transparent)
    );
    --tab-fill: var(--surface-recess);
  }
  /* A tab is as wide as its label and its count, the label to its count
     closer on a narrow rail. */
  [data-work-tabs][data-slot="tabs"] .ff-tabs-list [data-slot="ff-tab"] {
    --gap: max(0px, var(--space-row) - var(--tight) * 0.06);
    min-inline-size: max-content;
  }
  /* A tab after the first starts its label past the overlap, on either choice. */
  [data-work-tabs][data-slot="tabs"]
    .ff-tabs-list
    [data-slot="ff-tab"]
    ~ [data-slot="ff-tab"] {
    --px-start: calc(var(--overlap) + var(--px));
  }
  /* A label never gives way: the header's spacing does. */
  [data-work-tabs][data-slot="tabs"] .ff-tabs-list [data-slot="hit"] {
    flex-shrink: 0;
  }
}
```

## Tokens

token: --c-peek-sheet-h 80dvh — the peek sheet's fixed height on a touch screen (a real dimension: "holds its size from the first frame"; DESIGN.md's drawer is 85vh at most, so no ladder step fits)
token: --c-work-tabs-roomy-w 260px — the rail width at and above which the Working/Finished header needs no squeeze (a real dimension: the default-rail room the tabs were drawn for)
token: --c-work-tabs-squeeze 33px — the most the header's spacing gives back, reached at the narrowest rail (227px); a real dimension, no ladder step

## Removed

removed: UpdateCard.svelte:312 the fold's constant `-2px` pull and the inner box's `2px` extra air — a paired nudge cancelling the column's own `space-row` gap; the pull now applies only while the fold is shut (`-mt-space-row`, `data-open:mt-0`, transitioned with the rows) and the open air is plain `pt-space-1`
removed: UpdateCard.svelte:312 `[&[data-open]]:dur-panel` — a specificity hack for the open beat; `motion-safe:data-open:dur-panel` states it, exclusive of reduced motion
removed: NoticeRow.svelte `style:--hit-edge="0px"` — app.css `.touch-hit` already defaults it to 0px
removed: WorkTabs.svelte `[data-slot="head"] :global([data-slot="count"])` comment's claim that the badge "takes no class from here" — it does (`class="num"`), so its margins are utilities now

## Kit swaps

(none)

## Fixed

fixed: UpdateCard.svelte:312 the fold's open/shut offset is one token margin, not a literal pair — DESIGN.md Layout (the ladder; no hand-kept magic numbers)
fixed: NoticeRow.svelte the ✕'s 24px box, its 44px touch area, the glyph and the lead column are `c-btn-h-xs`, `c-btn-h-lg`, `icon-sm`, `c-row-lead`, `c-row-h` — DESIGN.md Layout (one 28px lead column, 44px rows)
fixed: WorkTabs.svelte machine header 22px → `space-6` (21px), tab padding 6px → `space-2` (7px), the "N more" gap 0.3em → `space-1` — DESIGN.md Layout (nearest ladder step)

## Gaps

gap: WorkTabs.svelte:647 "Archive all", the Delegates switch (:831) and the "N more" button (:945) are hand-rolled ghost controls (focus-inset, touch-hit, press-tint, own radius and hover) — the kit has no row-inline ghost variant for them (DESIGN.md Components, Buttons; the Press Rule)
gap: UpdateCard.svelte:406 `--toggle-start` adds `space-2` (7px) for the sm button's inline-end pad; the kit still writes it `pr-2` (8px), so the "Show changes" box is 1px narrower at its start until the kit lane moves that pad onto the ladder — DESIGN.md Layout
gap: UpdateCard.svelte:235 the Spinner is `size-space-4` (14px), not an icon step (12/16/20) — DESIGN.md Icons
