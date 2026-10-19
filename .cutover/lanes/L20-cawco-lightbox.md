# Lane L20-cawco-lightbox

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: transitions named by property (`transition-[rotate]`), motion behind `motion-safe:`, hover only via Tailwind 4 `hover:`, shadows/rings from tokens (`inset-ring`), no `will-change`, exit shorter than enter kept (`--dur-exit`). better-layout rules followed: tokens on the spacing ladder, `min-h`/`max-w` instead of fixed sizes, logical properties, `w-full max-w-*` columns (no fixed width at 320px).
Design Critique (from markup and classes, against DESIGN.md; no /motion bench renders these in the workspace, so ui-observer: Not verified): see fixed: lines; gap: none.

Started from `cawco/cutover-merge` at f5c5024ab. Deltas A–T applied (S and T win). 7 files, all done; none keeps a `<style>`.

## Per-file table
file · rules moved · residual (1/2/3/4/5) · literals preserved · breakpoint edges

- lightbox/Lightbox.svelte · sheet size (2 literals → tokens), scrim leave → utility, PhotoSwipe's 14 rules + reduced-motion fade → `theme: component` · 0/0/0/0/0 · none · none
- motion/Rail.svelte · tip offset, tip-text gap/pad (6/10 → space-2/space-3), `rail-label-in` → `animate-rail-label-in` · 0/0/0/0/0 · none · none
- move/MoveAsk.svelte · details min-height 26 → space-7, chevron turn → `rotate-90` on the `rotate` property · 0 · none · none
- move/MoveWait.svelte · column width, Caw min heights, file-bar track (4 literals → tokens), glyph inks and label wrap → `theme: component` · 0 · none · none
- plan/PlanPane.svelte · 72ch measure → token · 0 · none · none
- plan/PlanRing.svelte · pressed chip fill on `::before` → `aria-pressed:before:bg-surface-pressed`; the dead `.plan-ring` / `.num` rules deleted · 0 · none · none
- plan/PlanTree.svelte · tick draw and live-dot breath → `theme: animate` / `theme: utility`; dot ring/radius → `inset-ring` / `rounded-pill` · 0 · none · none

## Removed
removed: PlanRing.svelte:45-50 `.plan-ring` colour rules — svelte pruned them (no element carries the class); the utilities on the button already say the same ink
removed: PlanRing.svelte:56 `.num` tabular-nums — the `num` utility is on the span
removed: PlanTree.svelte:161-170 `.dot` / `.dot.live` rules — no element carries those classes (the dot is `data-slot="dot"` with utilities); dead
removed: Lightbox.svelte:361-365 `.pswp__button--arrow` inline/block size — duplicated `.pswp__button`'s own
removed: Lightbox.svelte:385 counter `line-height: calc(var(--c-top-bar-h) - 2px)` — a magic offset cancelling the 1px border; the counter centres its figure as a grid instead

## Fixed
fixed: PlanTree.svelte:95 the in-progress dot breathes again (`animate-breath` under `motion-safe:`) — its `.dot.live` rule was pruned by svelte and the dot sat still; DESIGN.md "Live work breathes"
fixed: PlanRing.svelte:30 the open plan chip's pressed fill reaches the chip's `::before` again (the rule aimed at a class the button no longer has) — the kit Toggle's on state
fixed: MoveAsk.svelte:35 the chevron turns through `rotate` with `transition-[rotate]` (Tailwind's `rotate-90` sets the `rotate` property, not `transform`)
fixed: Lightbox.svelte counter, `.pswp__counter` centres by `display: grid; place-items: center` (the DESIGN.md chip recipe: 44px chip, centred label)

## Tokens
token: --c-lightbox-sheet-w min(100%, 60rem) — the document sheet's width: a real dimension (a 60rem reading sheet, never wider than the viewport); no ladder step
token: --c-lightbox-sheet-max-h min(86dvh, 100%) — the document sheet's height cap, a share of the viewport; no ladder step
token: --c-move-wait-col-w 560px — the staged wait's column (design §2); no ladder step
token: --c-move-wait-caw-h 128px — Caw's slot over the wait, the size the file passes `Caw` on a desk
token: --c-move-wait-caw-h-phone 96px — the same slot on a phone
token: --c-move-wait-file-bar-w 96px — the in-flight large file's progress bar track
token: --c-plan-measure 72ch — the expanded plan's reading measure
token: --tick-length 20 — the house tick's path length (Tick.svelte), the dash a drawn tick runs along

## Gaps
none

## Theme additions
theme: animate kit-fade-out
```css
/* @theme: the keyframes stay where app.css has them (@keyframes kit-fade-out). */
--animate-kit-fade-out: kit-fade-out var(--dur-exit) var(--ease-out) both;
```

theme: variant lightbox-leaving
```css
@custom-variant lightbox-leaving (&[data-lightbox-leaving]);
```

theme: animate rail-label-in
```css
/* @theme: the keyframes stay where app.css has them (@keyframes rail-label-in). */
--animate-rail-label-in: rail-label-in var(--dur-exit) var(--ease-out) both;
```

theme: animate plan-tick
```css
--animate-plan-tick: plan-tick var(--dur-toggle) var(--ease-out) both;
@keyframes plan-tick {
  from {
    stroke-dashoffset: var(--tick-length);
  }
  to {
    stroke-dashoffset: 0;
  }
}
```

theme: animate breath
```css
/* @theme: the keyframes stay where app.css has them (@keyframes breath). */
--animate-breath: breath var(--breath) var(--ease-in-out) infinite;
```

theme: utility tick-draw
```css
@utility tick-draw {
  & path {
    stroke-dasharray: var(--tick-length);
  }
}
```

theme: component move-wait-glyph
```css
/* The glyph says where each step stands, in its status ink. The glyph is named by its own attribute: as `data-phase` moves, Chrome keys an attribute selector to the attribute's name alone, and `[data-slot="thinking-step-icon"]` restyled every `data-slot` in the row. Anchored under MoveWait's `data-slot="wait"`; the icon is ThinkingStep's own DOM. */
@layer components {
  [data-slot="wait"] [data-slot="row"][data-phase="done"] [data-thinking-step-icon] {
    color: var(--status-done-glyph);
  }
  [data-slot="wait"] [data-slot="row"][data-phase="active"] [data-thinking-step-icon] {
    color: var(--ink-strong);
  }
  [data-slot="wait"] [data-slot="row"][data-phase="failed"] [data-thinking-step-icon] {
    color: var(--status-fail-glyph);
  }
  [data-slot="wait"] [data-slot="row"][data-phase="asking"] [data-thinking-step-icon] {
    color: var(--status-attn-glyph);
  }
  [data-slot="wait"] [data-slot="row"][data-phase="stopped"] [data-thinking-step-icon] {
    color: var(--ink-muted);
  }
  /* The step's label wraps, never truncates. */
  [data-slot="wait"] [data-slot="row"] [data-slot="thinking-step-label"] {
    overflow-wrap: anywhere;
  }
}
```

theme: component pswp
```css
/* PhotoSwipe's DOM (its root is appended to <body>), under the `cawco-pswp` mainClass Lightbox passes it. ScreenEdges / GlassCard read `.cawco-pswp` (cross-file hook below). */
@layer components {
  .cawco-pswp {
    --pswp-bg: var(--scrim);
    --pswp-placeholder-bg: var(--surface-recess);
    --pswp-icon-color: var(--ink-strong);
    --pswp-error-text-color: var(--ink-muted);
    color: var(--ink-strong);

    & .pswp__bg {
      backdrop-filter: blur(var(--scrim-blur));
    }
    & .pswp__top-bar {
      gap: var(--space-2);
      padding: var(--space-2);
      block-size: auto;
    }
    & .pswp__button {
      display: grid;
      place-items: center;
      inline-size: var(--c-top-bar-h);
      block-size: var(--c-top-bar-h);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      color: var(--ink-strong);
      opacity: 1;
      overflow: visible;

      & svg {
        inline-size: var(--icon-lg);
        block-size: var(--icon-lg);
      }
      &:hover {
        background: var(--surface-hover);
      }
    }
    & .pswp__button--arrow {
      margin-block-start: calc(var(--c-top-bar-h) / -2);
    }
    & .pswp__button--arrow--prev {
      inset-inline-start: var(--space-3);
    }
    & .pswp__button--arrow--next {
      inset-inline-end: var(--space-3);
    }
    /* The counter is chrome like the buttons: their 44px chip on the raised surface inside a hairline, so the page under the scrim never reads through it. */
    & .pswp__counter {
      display: grid;
      place-items: center;
      block-size: var(--c-top-bar-h);
      margin: 0;
      padding-inline: var(--space-3);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-raised);
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
      font-variant-numeric: tabular-nums;
      color: var(--ink-strong);
      text-shadow: none;
      opacity: 1;
    }
    /* PhotoSwipe fades its own chrome with the zoom (`pswp--ui-visible`); the description goes with it. */
    & .pswp__description {
      position: absolute;
      inset-inline: var(--space-3);
      inset-block-end: var(--space-3);
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-hairline);
      border-radius: var(--radius-sm);
      background: var(--surface-recess);
      color: var(--ink-muted);
      font-size: var(--text-meta);
      font-weight: var(--weight-body);
      opacity: 0;

      & .lines {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-inline-size: 0;
        overflow-wrap: anywhere;
      }
      & .path {
        font-family: var(--font-mono);
      }
      & a {
        white-space: nowrap;
        text-decoration: underline;
        color: inherit;
      }
      @media (prefers-reduced-motion: no-preference) {
        transition: opacity var(--dur-control) var(--ease-out);
      }
    }
    &.pswp--ui-visible .pswp__description {
      opacity: 1;
    }
  }
}
```

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/lightbox/Lightbox.svelte:227 DialogOverlay `lightbox-leaving:animate-kit-fade-out` — a `leaving` state on the scrim whose exit animation is the kit's own `kit-fade-out`, so the sheet's close can fade it under the shrinking sheet (a `data-leaving` variant on dialog-overlay)

## Contracts
none

## cross-file hook
cross-file hook: Lightbox.svelte `mainClass: "cawco-pswp"` stays the class PhotoSwipe puts on its root (a library option, not a style class); selected by cawco/GlassCard.svelte:535 (`.cawco-pswp`) and read by ScreenEdges via page-marks. Integration retargets both if the hook becomes a data attribute.

## needs variant
none

## needs transition token
none

## needs colour token
none

## important kept
none

## shadcn/no-restyle
- Lightbox.svelte:227 DialogOverlay `lightbox-leaving:animate-kit-fade-out` (also logged as the kit-swap above)

## shadcn variant
none
