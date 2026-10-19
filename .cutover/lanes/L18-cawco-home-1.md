# Lane L18-cawco-home-1

## Skills loaded
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: motion only under `motion-safe:` (the fold), transition only the named properties (`transition-[scale]`, `transition-[grid-template-rows]`), press scale kept on the peek button, `hover:` only on hover-capable pointers (the variant carries the guard), one icon stroke/size per surface.
better-layout rules followed: logical properties (`ps-`/`pe-`/`ms-`/`me-`, `start-`/`end-`), `min-h-` never `h-` on text boxes, `min-w-0` on every flex/grid text child, tokens for spacing and breakpoints, no fixed widths on text.

## Files
| file | moved to utilities | residual `<style>` | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| cawco/home/CawMark.svelte | 2 rules (face block, face hidden while playing) | deleted | none | none | none |
| cawco/home/CawPanel.svelte | list cap, section rule, glyph columns, Clear all, damaged row | none (no `<style>`) | `1fr auto` (damaged grid), `0.07em` (side bearing) | `max-phone:` kept as it was | none |
| cawco/home/Home.svelte | usage strip pull | none | none | none | none |
| cawco/home/HomeRecent.svelte | disclosure min height, live gap, count width, search hit edge | none | none | none | none |
| cawco/home/MovedLogins.svelte | text column, hang, chevron flip, fold, stroke rule | deleted | `0fr`/`1fr`/`0` (fold), `4.25 / 24` (glyph side bearing) | none | none |
| cawco/home/NeedsCard.svelte | whole `<style>` (row grid, cover, lead, name, wait, peek, want, command, origin, meta, steps, call, args, peers) | deleted | `auto minmax(0, 1fr) auto`, `auto minmax(0, 1fr)`, `var(--icon-md) minmax(0, 1fr)` (grid track lists), `1.25 / 24`, `max-h-48` (12rem) | `@media (pointer: coarse)` → `coarse:` | none |

NeedsCard note: the merged file kept main's script and markup but dropped the converted rules for `.row`, `.cover`, `.lead`, `.name`, `.wait`, `.end`, `.peek` and the peers (the markup still named the classes). The markup is now the converted pre-merge form with main's additions folded in: the relay branch, the browser ask's origin line and Take over, `askKind`, `answered`, the held post's asker.

## Contracts
(none)

## Theme additions
theme: utility caw-mark-face
```css
@utility caw-mark-face {
  & > [data-caw-face] {
    display: block;
  }
  &[data-playing] > [data-caw-face] {
    visibility: hidden;
  }
}
```
theme: utility hit-edge-hair
```css
@utility hit-edge-hair {
  --hit-edge: 1px;
}
```
theme: utility non-scaling-stroke
```css
@utility non-scaling-stroke {
  & path {
    vector-effect: non-scaling-stroke;
  }
}
```
theme: utility content-data-n
```css
@utility content-data-n {
  &::before {
    content: attr(data-n);
  }
}
```

## Kit swaps
(none)

## Tokens
token: --c-caw-list-h 560px — the Caw panel's list cap (CawPanel); no ladder step or `--c-*` holds it (`--c-caw-panel-h` is the popover's 640)
token: --c-caw-list-clear 120px — the viewport room kept clear above the panel's list on a wide screen (CawPanel)
token: --c-caw-list-clear-phone 96px — the room kept clear under the phone's list: the composer's row and the home indicator's gap (CawPanel)
token: --c-caw-list-fade 40px — the panel's edge fade at full length on every width; the kit's `.kit-edge-fade-block` shortens it to 16px on a phone, which shows nothing in the panel (CawPanel)

## Removed
removed: CawPanel.svelte:~255 `.refusal` class on three ErrorText sites (NeedsCard) — the rule `.peers > .refusal` targeted the button inside ErrorText's own span, never a direct child of `.peers`, so it matched nothing
removed: Home.svelte:~156 `--usage-pull: -8px` literal — an off-ladder pull is the ladder step `-mx-space-2` (7px)
removed: HomeRecent.svelte `--live-gap: 0.3em` — the ladder step `ms-space-1`
removed: MovedLogins.svelte `[&[data-open]]:dur-panel` — a duplicate of `data-open:dur-panel`
removed: NeedsCard.svelte `.cover:hover` `:has()` row fill — the cover is the row's own full-size layer, so the fill is on the cover (`hover:bg-surface-hover`), with no `has-[…]`
removed: NeedsCard.svelte `[overflow-wrap:break-word]!` and `whitespace-normal!` on the origin line — the origin line takes `wrap-break-word whitespace-normal` itself, without the command line's `whitespace-pre`/`text-ellipsis` it was overriding
removed: CawPanel.svelte `[&>[data-slot=section]+[data-slot=section]]` and `[&>li+li]` selectors — the second section carries its own rule class when a first stands (`needs.length > 0`); the notices list is `divide-y divide-border-hairline`
removed: CawMark.svelte `class:playing` state class — `data-playing`

## Fixed
fixed: CawPanel.svelte `me-space-1` — the glyph's trailing margin (head gap `space-2` + 4px) is the ladder step the old `calc(var(--space-3) - var(--space-2))` was — DESIGN.md Layout ladder
fixed: CawPanel.svelte and MovedLogins.svelte trailing-edge hangs now read the theme's own `--spacing` and `--icon-sm` instead of hand-kept 8px / 6px / 12px — DESIGN.md "never a hand-kept magic number"
fixed: NeedsCard.svelte peek box and its 44px touch area read `--c-btn-h-xs` / `--c-btn-h-lg`, the row reads `--c-row-h`, the lead `--c-row-lead` and `--c-row-mark` — DESIGN.md Components
fixed: NeedsCard.svelte the pointer-coarse `::after` inset rule is `coarse:after:start-(…)`/`end-(…)` on the peek button; no pseudo-element `<style>` remains — delta T2
fixed: NeedsCard.svelte the origin and command lines share one `lined` flag, so the meta line and the peers move down together for either

## Gaps
gap: Home.svelte `-mx-space-2` — the usage strip's card is pulled out of the top block's padding to line up with the status line's text; the strip's own padding (UsageMeter, another file) is what it compensates — the row-inset rule in DESIGN.md Layout
gap: CawPanel.svelte `me-(--clear-hang)`, MovedLogins.svelte `me-(--hang)` — a ghost xs button hung past the trailing edge by its border, padding and a glyph's side bearing; the kit's Button has no end-aligned variant that does this (the kit lane owns it) — DESIGN.md "last control at one trailing edge"

## Contracts (cross-file hooks)
(none)

## shadcn variants
shadcn variant: cawco/home/MovedLogins.svelte (fold) data-open: grid-template-rows
shadcn variant: cawco/home/MovedLogins.svelte (fold) data-open: transition-duration

## Design critique (interface-craft, from markup and classes; no stories bench for these files, so ui-observer: Not verified)
fixed: NeedsCard.svelte peers keep The Peer Rule: one size (`sm`), one `answer` tint pair, one gap, widening under `coarse:` — DESIGN.md Peer Rule, 44 Touch Rule
fixed: MovedLogins.svelte fold transitions only under `motion-safe:`; reduced motion has no fold travel — better-ui reduced-motion gate
gap: HomeRecent.svelte disclosure row is `min-h-c-btn-h` (36) against the kit's `--c-section-head-h` (32) for list section heads — DESIGN.md Layout, section head height
