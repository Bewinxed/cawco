# Lane L07-cawco-accounts-2

## Files
| file | what moved |
|---|---|
| accounts/AccountSwitch.svelte | dot 8px/50% → `size-space-2 rounded-pill`; option grid columns on `--icon-md`; option min-height → `c-btn-h` / coarse `c-btn-h-lg`; literal markers and style literals gone |
| accounts/AtLimitBlock.svelte | dead `<style>` (all rules already utilities) deleted; field width 64px → `w-(--c-limit-field-w)`; redundant `px-0` dropped |
| accounts/Check.svelte | `<style>` → `animate-check-in`, `animate-check-draw`, `dash-unit` (theme additions) |
| accounts/DevicePanel.svelte | code letter-spacing 0.08em → `tracking-caps` |
| accounts/OrderList.svelte | list gap 3px → `gap-space-row`; handle and dot literals → `drag-dots`, `size-space-2 rounded-pill`; preflight-duplicate `m-0 p-0 list-none`, `py-0` dropped |
| accounts/ProviderMark.svelte | `<style>` svg rule → theme component `mark-svg` |

## Contracts
(none)

## Theme additions
theme: animate check-in
```css
--animate-check-in: check-in var(--dur-toggle) var(--ease-out) both;
@keyframes check-in {
  from {
    opacity: 0;
  }
}
```

theme: animate check-draw
```css
--animate-check-draw: check-draw var(--dur-toggle) var(--ease-out) both;
@keyframes check-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
```

theme: utility dash-unit
```css
@utility dash-unit {
  stroke-dasharray: 1;
}
```

theme: utility drag-dots
```css
@utility drag-dots {
  background-image: radial-gradient(circle, var(--ink-subtle) 1px, transparent var(--c-drag-dots-edge));
  background-size: var(--c-drag-dots-tile) var(--c-drag-dots-tile);
}
```

theme: component mark-svg
```css
@layer components {
  [data-slot="mark"] > svg {
    width: 100%;
    height: 100%;
  }
}
```

## Tokens
token: --c-limit-field-w 64px — AtLimitBlock's numeric field width (four digits); no ladder step or --c-* fits (AtLimitBlock.svelte)
token: --c-drag-dots-w 10px — OrderList's drag handle width, two dot tiles (OrderList.svelte)
token: --c-drag-dots-tile 5px — OrderList's drag handle dot pitch (theme utility drag-dots)
token: --c-drag-dots-edge 1.5px — OrderList's drag handle dot edge softness (theme utility drag-dots)

## Removed
removed: AtLimitBlock.svelte:125 `<style>` block (.lim, .head, .switch-line, .rows, .pr, .aside, .figure, .terms) — every rule matched nothing: the markup already carries the utilities
removed: AtLimitBlock.svelte `px-0` on the two field rows — p has no padding under Preflight
removed: OrderList.svelte `m-0 p-0 list-none` on the ol and `py-0` on the row button — Preflight already computes them
removed: AccountSwitch.svelte `mx-space-1` on the option dot — it compensated the 16px column; the dot is now `justify-self-center`

## Fixed
fixed: AccountSwitch.svelte option dot — centred in its icon-md column with `justify-self-center` instead of a margin sized to the old 8px dot — DESIGN.md Layout (ladder spacing)

## Gaps
gap: OrderList.svelte drag handle is a radial-gradient pseudo-glyph — DESIGN.md names an icon set; a drag-handle icon would replace `drag-dots`
gap: AccountSwitch.svelte option row and OrderList.svelte row are hand-rolled buttons with their own look — DESIGN.md kit has no list-option/sortable-row variant

## Kit swaps
(none)

## Other
literals changed to tokens: AccountSwitch dot 8→space-2 (7), option min-height 40→c-btn-h (36); DevicePanel code track 0.08em→tracking-caps (0.06em); OrderList gap 3px→space-row (2px)
