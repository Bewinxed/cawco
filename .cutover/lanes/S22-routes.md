# Lane S22-routes

13 of 13 files done. Residual kind totals: 1 (keyframes) 4 · 2 (foreign-dom) 3 · 3 (pseudo) 0 · 4 (svg-paint) 5 · 5 (unmapped) see table.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| (app)/+error.svelte | 1 | 0/0/0/0/0 | none | none |
| config/+layout.svelte | 4 (+1 media) | 0/0/0/0/2 | none | max-width:900 → max-desk: (901 breakpoint) |
| config/+page.svelte | 1 | 0/0/0/0/0 | none | none |
| config/accounts | 6 | 0/0/0/0/0 | 2px→gap-space-row | none |
| config/connections | 21 | 0/3/0/0/3 | 72ch, 14rem, 24rem | `(hover: hover)` card:hover → hover: (adds pointer: fine) |
| config/devices | 14 | 0/0/0/0/2 | 8px, 72ch, 12px, 10px | none |
| config/memory | 2 | 0/0/0/0/0 | 72ch, 8px | none |
| config/models | 20 | 4/0/0/5/2 | 8px, 72ch | none |
| config/phone | 12 | 0/2/0/0/3 | 8px, 72ch, 12px, 10px | `max-width: 639px` kept in residual (grid) |
| config/previews | 5 | 0/0/0/0/0 | 8px, 72ch | none |
| config/rules | 1 | 0/0/0/0/0 | 1px 6px | none |
| config/skills | 11 | 0/0/0/0/1 | 8px, 72ch, 8px 10px, 240px | none |
| config/spend | 2 | 0/0/0/0/0 | 8px, 72ch | none |

## Kind-5 declarations (verbatim)
- config/+layout.svelte: `[data-slot="pane"] { grid-template: minmax(0, 1fr) / minmax(0, 1fr) }`, `[data-slot="pane"] > div { grid-area: 1 / 1 }`
- connections: `[data-slot="cards"] { grid-template-columns: minmax(0, 1fr); grid-auto-rows: 1fr }`; under `@container (min-width: 30rem)`: `grid-template-columns: repeat(auto-fill, minmax(min(100%, var(--c-starter-w)), 1fr))`
- devices: `[data-slot="row"] { grid-template-columns: minmax(0, 1fr) auto auto }`, `[data-slot="row"][data-devices] { grid-template-columns: minmax(0, 1fr) auto }`
- models: `[data-slot="dot"] { border-radius: 50% }`, `[data-slot="stack"] > * { grid-area: 1 / 1 }`
- phone: `[data-slot="device"] { grid-template-columns: minmax(0, 1fr) auto auto }`, `[data-slot="dot"] { border-radius: 50% }`, under max-width 639px: `[data-slot="device"] { grid-template-columns: minmax(0, 1fr) auto }`
- skills: `[data-slot="text"] { flex: 1 1 var(--text-basis) }` (240px in `style:--text-basis`)

Kind 2: connections `[data-slot="row-ask"] :global([data-slot="input"]) { flex; min-inline-size; max-inline-size }` (Input's own root; no-restyle forbids a class); phone `[data-slot="device"] > :global(:nth-child(2)) { grid-column: 1 / -1; grid-row: 2 }` (SwitchField root, under max-width 639px).
Kind 1: models `draw` and `breathe` keyframes with their animations. Kind 4: models check-mark `stroke-linecap/linejoin`, `stroke-width/dasharray/dashoffset`.

## Needs variant / transition token / colour token / cross-file hook
none.

## Notes for integration
- models: `.morph` `style:block-size` became `style:--morph-size` + `h-(--morph-size)`, and its transition property is `height` (was block-size); same computed value in horizontal writing mode.
- skills: `font-mono` on the plugin-version `.note` spans was dropped; the unlayered `.note` `font` shorthand beat the layered utility, so it never rendered mono. `class="install-fault"` on RowFault dropped (no CSS anywhere).
- Added hooks: `data-slot` on devices/phone rows, `data-slot="check"` on models' tick svgs, `data-pulse` on models' breathing dot, `data-devices` on the paired-devices rows.
- A `.group + .group` / `.row + .row` sibling rule became `mt-space-6`/`first:border-t-0` (group order is fixed in the markup).

## shadcn/no-restyle hits (15)
- config/connections/+page.svelte:414 DropdownMenuContent `min-w-44`
- :483, :609, :617, :641, :650, :683, :693 Button `pressable`
- :720 PopoverContent `w-64`
- config/memory/+page.svelte:136 Input `max-w-64`
- config/previews/+page.svelte:116 NativeSelect `max-w-96`; :140 Input `max-w-96`
- config/skills/+page.svelte:530, :623 Skeleton `h-10`
- config/spend/+page.svelte:96 NativeSelect `max-w-96`

## shadcn variant lines
none.
