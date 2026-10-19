# Lane L42-cawco-usage-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer.
better-ui rules followed: transition only what changes (`transition-[stroke-dashoffset]`, `transition-[background-color]`, never `all`); hover only on hover-capable pointers (Tailwind 4's `hover:`); motion gated (`motion-reduce:transition-off`, `motion-safe:`); icons and marks recoloured through `currentColor`/tokens, never a fixed paint.
better-layout rules followed: logical properties (`me-space-1`, `gap-x-`, `start`/`end`); grid tracks that hold text use `minmax(0, 1fr)`; heights come from tokens that grow under a coarse pointer (`h-c-nav-h`), not a fixed pixel row; the phone collapses the usage row to one column.

Files: 6 of 6 done.

## Per-file table
file · rules moved · residual counts (1/2/3/4/5) · literals preserved · breakpoint edges · STOPs

- Rings.svelte · 5 rules (`.arc`, `.week`, `.arc[data-full]`, `.notch`, the origin/turn custom properties) · 0/0/0/0/0 · none · none · none
- RingsKey.svelte · 2 · 0/0/0/0/0 · none · none · none
- SessionsChip.svelte · 1 (item height) · 0/0/0/0/0 · none · `no-hover:` + `max-phone:` pair replaced by `--c-nav-h`, which the token sheet switches at `(pointer: coarse), (width < 640px)` · none
- WeekMark.svelte · 2 · 0/0/0/0/0 · none · none · none
- WhereItGoes.svelte · 3 · 0/0/0/0/0 · none · none · none
- Words.svelte · 3 · 0/0/0/0/0 · none · none · none

No `<style>` remains in the lane.

## Theme additions
theme: utility arc-week
```css
@utility arc-week {
  stroke: color-mix(
    in oklch,
    var(--c),
    var(--account-week-toward) calc(var(--account-week-mix) * 100%)
  );
}
```
theme: utility arc-ground
```css
@utility arc-ground {
  stroke: var(--ring-ground, var(--sidebar));
}
```

## Tokens
token: --c-rings-key-label-w 52px — the usage key's label column; fixed so values line up down a tile and across the tiles in a row; no ladder step is near.
token: --c-rings-key-value-w 84px — the usage key's value column, same rule.
token: --c-mark-dot 6px — the dot that leads an account's name in running words (Words); DESIGN's other 6px dots are the status dot and the presence dot, which are other roles (identity is ink, never a status dot, DESIGN.md Project identity); `status-dot-size` is the status role, so it is not reused here.
token: --c-usage-figure-w 5.5rem — the room a Where-it-goes row reserves beside its meter for the figure and the gap before it; the meter is the share of the rest. No ladder step is 88px.
token: --c-meter-bar-h 8px — the height of a row meter on the Usage page ("8px on a page", DESIGN.md Limit bar); no ladder step is 8.

## Removed
removed: apps/dashboard/src/lib/cawco/usage/Rings.svelte:108 `<!-- literal: -->` marker and the `--ring-origin` / `--ring-turn` pixel properties — an SVG circle's `origin-center` is the 12,12 of its viewBox and `-rotate-90` is the turn, so no length is written.
removed: apps/dashboard/src/lib/cawco/usage/WeekMark.svelte:32 `<!-- literal: -->` marker and the `--share-origin` / `--share-turn` properties — same, `origin-center -rotate-90`.
removed: apps/dashboard/src/lib/cawco/usage/Rings.svelte `.arc`, `.week`, `.notch` hook classes and the `<style>` — dash geometry is now the circle's own `stroke-dasharray` attribute (beside `pathLength` and `stroke-width`), the paints are the two theme utilities above.
removed: apps/dashboard/src/lib/cawco/usage/Rings.svelte `stroke-linecap: butt` — the SVG default.
removed: apps/dashboard/src/lib/cawco/usage/WeekMark.svelte `.share` class and `<style>`.
removed: apps/dashboard/src/lib/cawco/usage/WeekMark.svelte `stroke-5` Tailwind numeric — now the `stroke-width="5"` attribute.
removed: apps/dashboard/src/lib/cawco/usage/RingsKey.svelte `--key-row-gap="3px"` — an off-ladder gap; the row gap is `gap-y-space-1`.
removed: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte `--item-h` / `--item-h-touch` with their `no-hover:` and `max-phone:` variants — the row is `h-c-nav-h`.
removed: apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte `--row-min="28px"` — `min-h-(--row-compact-h)`, the token that holds 28px.
removed: apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte `--fill-h="8px"` on both fills — `--c-meter-bar-h`.
removed: apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte `[&:hover]:underline` — `hover:underline`.
removed: apps/dashboard/src/lib/cawco/usage/Words.svelte `--dot="6px"` / `--dot-r="50%"` — `size-(--c-mark-dot) rounded-pill`.

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:177 PopoverTrigger `pressable h-icon-md min-w-icon-md cursor-pointer overflow-visible px-space-1 text-ink-row type-meta leading-none num` — a count-chip variant on the trigger (it already takes `badge`); the row's own look is the chip.
kit-swap: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:193 PopoverContent `overflow-hidden` — a clipped-list variant (the flyover's rows clip to its radius).

## shadcn/no-restyle hits
shadcn/no-restyle: usage/SessionsChip.svelte:177 PopoverTrigger pressable, h-icon-md, cursor-pointer, overflow-visible, px-space-1, text-ink-row, type-meta, leading-none, num
shadcn/no-restyle: usage/SessionsChip.svelte:193 PopoverContent overflow-hidden

## Contracts
none.

## Gaps
none.

## Fixed
fixed: apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte:685 and :704 the meter's `calc(var(--share) * (100% - 5.5rem))` hand-kept the room the figure and its gap take as 5.5rem — it reads `--c-usage-figure-w` — DESIGN.md Layout (no hand-kept magic numbers). The 2fr / 3fr split stays as the row's grid-template.

## Notes
- needs variant: none. needs transition token: none. needs colour token: none. cross-file hook: none. important kept: none. shadcn variant: none. shadow kept residual: none.
- R2 fixed: none (no `border: 0`). R3 fixed: none (no mono family).

## Critique (interface-craft, against DESIGN.md, from markup and classes)
fixed: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:221 flyover rows were 40px, 44px under `no-hover` or `max-phone` — the token `--c-nav-h` is the design's 40/44 row and switches on `(pointer: coarse), (width < 640px)` — DESIGN.md The 44 Touch Rule.
fixed: apps/dashboard/src/lib/cawco/usage/RingsKey.svelte:29 the glyph column was a hand-kept 10px — `auto`, sized by the 10px glyphs themselves — DESIGN.md Layout.
fixed: apps/dashboard/src/lib/cawco/usage/Words.svelte:36 the dot's radius was a hand-kept 50% — `rounded-pill` — DESIGN.md Shapes (pill for dots).
