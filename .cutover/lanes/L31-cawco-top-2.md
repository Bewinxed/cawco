# L31-cawco-top-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. (Files have an animation: `emil-design-eng` / `transitions-dev` were not loaded; the only motion is MachineAuthStatus's existing `mark-in` keyframes, moved to a theme animation unchanged.)

better-ui rules followed: transitions not keyframes for state (the existing HubBand/HoverPanel transitions stay on their data attributes); hover only through Tailwind 4's `hover:` (hover-capable pointers); motion gated by `motion-safe:` (mark-in); exact values from tokens only.
better-layout rules followed: logical properties (`text-start`, `ps/pe`, `-mx`, `end-full`, `inset-x/y`); spacing from the ladder; `min-h` not `h` on text rows; the 44px touch floor read from `--c-row-h` under `coarse:`; wrap/truncate kept (`line-clamp-2`, `wrap-anywhere`, `min-w-0`).

## Per-file table

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| HarnessLogo.svelte | 1 (foreign svg) -> theme component | 0/0/0/0/0 | 0 | none | none |
| HoverPanel.svelte | 3 (::after bridge) -> `after:` utilities; 3 literals -> tokens | 0/0/0/0/0 | 0 | none | none |
| HubBand.svelte | 3 style props + 3 grid literals -> tokens and theme utilities; `has-[]` -> `data-open`; `data-[tone=]` -> `tone-*:` | 0/0/0/0/0 | 0 | `@max-phone/hub-band` unchanged | none |
| MachineAuthStatus.svelte | keyframes -> theme animate; state class -> `data-tone` | 0/0/0/0/0 | 0 | none | none |
| MachineInventory.svelte | scoped classes the merge dropped -> utilities; 6 literals -> ladder/tokens | 0/0/0/0/0 | 0 | none | none |
| MachinesButton.svelte | 2 pseudo-less tone rules -> `group-tone-*:`; dead `--machines-pe` removed | 0/0/0/0/0 | 0 | none | none |
| MachinesEmpty.svelte | 3 literals -> tokens | 0/0/0/0/0 | 0 | none | none |
| MachinesList.svelte | `--row-touch` 44px x4 -> `c-row-h`; dead border/bg resets removed | 0/0/0/0/0 | 0 | none | none |

needs variant: none. needs transition token: none. kind-5 declarations: none.

## Theme additions

theme: component harness-logo
```css
@layer components {
  [data-slot="harness-logo"] > svg {
    inline-size: 100%;
    block-size: 100%;
  }
}
```

theme: animate mark-in
```css
@theme {
  --animate-mark-in: mark-in var(--dur-pop) var(--ease-out) both;
  @keyframes mark-in {
    from {
      opacity: 0;
      scale: 0.25;
      filter: blur(var(--space-1));
    }
  }
}
```

theme: utility grid-rows-shut
```css
@utility grid-rows-shut {
  grid-template-rows: 0fr;
}
```

theme: utility grid-rows-open
```css
@utility grid-rows-open {
  grid-template-rows: 1fr;
}
```

theme: utility grid-cols-fill-auto
```css
@utility grid-cols-fill-auto {
  grid-template-columns: minmax(0, 1fr) auto;
}
```

theme: utility auto-rows-band
```css
@utility auto-rows-band {
  grid-auto-rows: minmax(var(--c-btn-h-sm), auto);
}
```

theme: utility auto-rows-band-phone
```css
@utility auto-rows-band-phone {
  grid-auto-rows: minmax(max(var(--c-btn-h-sm), 2lh), auto);
}
```

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/MachineInventory.svelte:171 Spinner (default) — done (L04: `size-4` dropped, `shrink-0` stays the site's)

## Removed

removed: apps/dashboard/src/lib/cawco/MachinesButton.svelte:94 `style:--machines-pe` — nothing reads `--machines-pe` (grep over src finds only the writer)
removed: apps/dashboard/src/lib/cawco/MachinesList.svelte:155 `border-none border-current bg-transparent cursor-default text-start` on the `li` — Preflight already draws no border or fill there, and a list item has the default cursor and start alignment
removed: apps/dashboard/src/lib/cawco/MachinesList.svelte:205 `border-none border-current bg-transparent` on the row button — Preflight resets button border and background
removed: apps/dashboard/src/lib/cawco/MachinesList.svelte:245 `border-none border-current bg-transparent text-start` on the row `div` — Preflight; a div's text aligns start
removed: apps/dashboard/src/lib/cawco/MachinesList.svelte:271 `border-r-none border-b-none border-l-none bg-transparent` — Preflight
removed: apps/dashboard/src/lib/cawco/MachineInventory.svelte:124 and :186 `m-0 p-0 list-none` on the lists — Preflight resets them

## Tokens

token: --c-hover-panel-w 440px — the hover panel content's widest measure (HoverPanel.svelte:215); a component dimension, no ladder step fits
token: --c-hover-panel-room 320px — the hover panel content's default height room when the caller gives no `--room` (HoverPanel.svelte:216)
token: --c-band-slot-clip inset(0 -100vw -100vw) — the connection band slot's clip: open to the sides and foot so its shadow shows, closed at the bar's foot (read as `clip-path-(--c-band-slot-clip)`, HubBand.svelte:281)
token: --c-status-mark 2.25rem — the unlock outcome's mark box and its icon (MachineAuthStatus.svelte:62, :89, :93, :95); no `--c-mark*` is this size
token: --c-inventory-measure 72ch — the machine inventory's text measure (MachineInventory.svelte:106)
token: --c-inventory-text-basis 240px — the inventory entry's words column, the width under which its Adopt button wraps below (MachineInventory.svelte:196)
token: --c-empty-fleet-w 34rem — the empty fleet's column (MachinesEmpty.svelte:47)
token: --c-empty-fleet-line 26rem — the empty fleet's sentence measure (MachinesEmpty.svelte:83, :124)
token: --c-empty-fleet-caw 80px — the slot Caw stands in on the empty fleet; equals `CAW_SIZE` in the same file (MachinesEmpty.svelte:52)

## Contracts

resolved at integration: MachinesButton's `bar-item`, `machines` and `bar-symbol` classes are gone; the button is `[data-bar-item]` and `[data-machines]`, its glyph `data-slot="bar-symbol"`, drawn by app.css's bar-group component (L33) in `@layer components`, so the glyph's `group-tone-*` tint (a utility) wins by layer.

## Gaps

gap: apps/dashboard/src/lib/cawco/MachinesList.svelte:155 and :245 hand-rolled machine row (same look as `MachineRow`'s host row, three copies) — DESIGN.md Components: one row primitive
gap: apps/dashboard/src/lib/cawco/HoverPanel.svelte:198 `z-2` / `side-right:z-40` stack is set against the rail and tray in other files — cross-file stacking has no DESIGN.md layer scale

## Design Critique (interface-craft, from markup and classes; ui-observer not run: no bench renders these files here, so layout is Not verified in a browser)

fixed: apps/dashboard/src/lib/cawco/MachineAuthStatus.svelte:89 mark colour was a ternary class string; now `data-tone` with `tone-ok:` / `tone-caution:` — a state is an attribute
fixed: apps/dashboard/src/lib/cawco/MachineInventory.svelte:134 head row used `text-left` and a hover guard `[&:hover]:enabled:`; now `text-start` and `hover:enabled:` (hover only where the pointer hovers)
fixed: apps/dashboard/src/lib/cawco/MachinesList.svelte:155 touch floor read the literal 44px through a per-row property; now `coarse:min-h-c-row-h` — DESIGN.md Focus and hit areas

## Cross-file hooks, important kept, shadcn

cross-file hook: none. important kept: none. R2 fixed: none. R3 fixed: none (MachineInventory.svelte:203 keeps `font-(family-name:--font-mono)` on a span). shadcn variant: none. shadow kept residual: none. shadcn/no-restyle hits: none left (the one, `Spinner size-4` at MachineInventory.svelte:171, is the kit-swap above).
