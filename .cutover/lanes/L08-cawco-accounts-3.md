# L08-cawco-accounts-3

| file | rules moved | literals → ladder | residual |
|---|---|---|---|
| accounts/RoutingEditor.svelte | 0 `<style>`; trail gap | 0.25em → ms-space-1 | none |
| accounts/SigninPanel.svelte | none | 14px icon → size-icon-md | none |
| accounts/StrategyFigure.svelte | 23 foreign-DOM rules → theme component | see Tokens | none |
| accounts/StrategyPicker.svelte | `.radio::after` → real child span | 1.5px→border-2, 50%→rounded-pill, 8px→size-space-2, 1px→gap-space-row, 14px→size-icon-md | none |
| accounts/Swatches.svelte | transform press → scale | 26px→size-space-7, 5px→outline-offset space-1, 2px→--focus-ring-width, 4px→--space-1 | none |

## Theme additions
theme: component figure-stage
```css
@layer components {
  [data-slot="stage"] .dg { position: absolute; inset: 0; }
  [data-slot="stage"] .e { position: absolute; left: 0; top: 0; }
  [data-slot="stage"] .ln-lbl {
    display: flex; align-items: center; gap: var(--space-2);
    height: var(--space-4);
    font: var(--type-meta); font-weight: var(--weight-strong);
    line-height: var(--space-4);
    color: var(--ink-row); white-space: nowrap;
  }
  [data-slot="stage"] .ln-lbl .nm { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  [data-slot="stage"] .ln-lbl .dot {
    flex: none; width: var(--space-2); height: var(--space-2);
    border-radius: var(--radius-pill); background: var(--c);
  }
  [data-slot="stage"] .ln-lbl svg { width: var(--icon-sm); height: var(--icon-sm); color: var(--ink-muted); }
  [data-slot="stage"] .clk {
    padding: 0 var(--space-1); border-radius: var(--radius-xs);
    font: var(--type-meta); line-height: var(--space-4);
    font-variant-numeric: tabular-nums; text-align: right;
    color: var(--ink-muted); white-space: nowrap;
  }
  [data-slot="stage"] .clkw {
    border-radius: var(--radius-xs);
    background: color-mix(in oklab, var(--c) 26%, transparent);
    opacity: 0;
  }
  [data-slot="stage"] .blk {
    font: var(--type-meta); font-weight: var(--weight-strong);
    line-height: var(--space-4); text-align: right;
    color: var(--data-bad); white-space: nowrap; opacity: 0;
  }
  [data-slot="stage"] :is(.bar, .hr, .fl, .gh, .pu) {
    height: var(--fig-chip); border-radius: var(--radius-hair);
  }
  [data-slot="stage"] .bar { background: var(--surface-fill); }
  [data-slot="stage"] .hr {
    background: color-mix(in oklab, var(--c) 42%, transparent); opacity: 0;
  }
  [data-slot="stage"] .fl { background: var(--c); transform-origin: 0 50%; }
  [data-slot="stage"] .gh {
    border: 1px dashed var(--c);
    background: color-mix(in oklab, var(--c) 22%, transparent); opacity: 0;
  }
  [data-slot="stage"] .chip {
    width: var(--fig-chip); height: var(--fig-chip);
    border-radius: var(--radius-hair); background: var(--c);
    box-shadow: 0 0 0 2px var(--surface-recess);
    offset-rotate: 0deg; offset-anchor: 50% 50%;
  }
  /* A fork is its parent's chip drawn hollow: the same lane, no extra mark. */
  [data-slot="stage"] .chip.child {
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 2px var(--c), 0 0 0 2px var(--surface-recess);
  }
  [data-slot="stage"] .tag {
    padding: 0 var(--space-1); border-radius: var(--radius-xs);
    background: var(--surface-fill); font: var(--type-caps);
    line-height: var(--space-4); font-variant-numeric: tabular-nums;
    color: var(--ink-row); white-space: nowrap;
  }
  /* A caption wraps where the stage is narrow; the stage grows to hold it. */
  [data-slot="stage"] .cap {
    left: var(--fig-pad); right: var(--fig-pad);
    bottom: var(--fig-cap-foot); top: auto;
    font: var(--type-meta); line-height: var(--fig-cap-line);
    color: var(--ink-row); text-wrap: pretty;
  }
}
```

## Tokens
token: --fig-pad 12px — figure.ts PAD: the stage's inner inset, the build positions lanes and captions from it; no ladder step is 12
token: --fig-chip 10px — figure.ts CHIP: chip side and bar height, the build centres bars on lane lines by CHIP/2
token: --fig-cap-line 16px — figure.ts CAP_LINE: the caption's line height the build measures the stage's growth with
token: --fig-cap-foot 8px — figure.ts CAP_FOOT: the caption's distance from the stage's foot

## Removed
removed: StrategyPicker.svelte:241 `.radio::after` pseudo rule — replaced by a real child span (T1: a real element where the pseudo only draws a box)
removed: StrategyFigure.svelte `--fig-tag-fs` 11px override — type-caps already sets the tag's size
removed: StrategyFigure.svelte `--fig-lbl-gap`, `--fig-dot`, `--fig-clk-pad`, `--fig-chip-r`, `--fig-ring`, `--fig-cap-inset`, `--fig-cap-bottom`, `--fig-cap-lh` — style-only values now on the ladder or the figure.ts tokens above

## Gaps
fixed: StrategyPicker.svelte:141 card press was scale(0.995), now the design system's --press-scale — DESIGN.md names one press scale (delta S2: no hand-kept number)
fixed: StrategyPicker.svelte radio dot grew from scale(0); now scale-50 + opacity, so nothing appears from nothing (emil-design-eng)
gap: Swatches.svelte `--swatch-on` is still a style string of tokens, since a two-ring shadow has no utility; `--swatch-ground` is set by AccountSetup.svelte:504

## Contracts
(none)

## Kit swaps
(none)

fixed: StrategyFigure.svelte:127 stage height now `h-(--stage-h)` from a custom property — delta E
