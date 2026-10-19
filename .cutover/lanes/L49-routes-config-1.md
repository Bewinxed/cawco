# Lane L49-routes-config-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer (emil-design-eng and transitions-dev not loaded: the only animations are the two tick/breath utilities, taken from lane theme additions as written).
better-ui rules followed: motion gated behind `motion-safe:` (the tick draw and the dot's breath), icons keep `currentColor`/token strokes, rounded-pill dots (outer radius = token), no `transition-all`, press feedback through the kit's `press="pressable"` variant.
better-layout rules followed: ladder spacing (space-1/2/3/5), `min-w-0` on flex children holding text, reading measure `c-measure` (72ch) on running text, `flex-1` + `min-w-0` for the fluid column beside fixed actions, grid track `minmax(0,1fr)` through `grid-cols-1`, container query (`@container` + `@details:`) for the cards grid.

## Files
| file | what moved |
|---|---|
| config/+layout.svelte | pane's one-cell grid: `minmax(0, 1fr)` literal + custom property → `grid-cols-1 grid-rows-1` |
| config/browsers/+page.svelte | already converted; nothing left to change |
| config/connections/+page.svelte | the merge had put main's scoped class names back on the markup and dropped the `<style>`; 14 classes (`add`, `add-head`, `way`, `way-label`, `callback`, `callback-url`, `empty`, `empty-line`, `cards`, `row-app`, `row-ask`, `projects`, `pick-head`, `checklist`) → utilities; the `row-ask` foreign-dom residual → classes on the Input; `class="pressable"` → `press="pressable"` ×7; 72ch literals → `c-measure` |
| config/delegate-types/+page.svelte | `<style>`-less `.group` class + `GROUP` string with `[&+&]` and two literal custom properties → utilities on the two group elements (8px → space-2, 18px → space-5) |
| config/devices/+page.svelte | 8 literals / 11 style vars gone: groups, rows (grid tracks → flex with a `flex-1` column), 72ch → `c-measure` |
| config/memory/+page.svelte | dead `note` class → `type-meta max-w-c-measure text-ink-muted`; Input `max-w-64` → `measure="cap-sm"` |
| config/models/+page.svelte | `<style>` (tick draw, dead `.pulse`) removed → theme animate/utility; 10 literals / 10 style vars gone; dots → `rounded-pill` |

Residual `<style>`: none in any file. Literals preserved: none. Breakpoint edges: none mapped. Kind-5 declarations: none. needs variant: none. needs transition token: none.

## Contracts
(none)

## Kit swaps
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:685 ToggleGroup `flex-wrap` — the segmented control wraps its items when the row is narrow; the kit needs a `wrap` variant (the contract allows `max-w`/`self-start`, which stay at the site)
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:783 Button press="pressable" — done (was `class="pressable"`)
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:912 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:923 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:955 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:963 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:998 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1009 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1019 Button press="pressable" — done
kit-swap: apps/dashboard/src/routes/(app)/config/memory/+page.svelte:102 Input measure="cap-sm" — done (was `class="max-w-64"`)

## Removed
removed: apps/dashboard/src/routes/(app)/config/models/+page.svelte:364 `.pulse` rule — it matched nothing (the dot carries `data-pulse`, never a `pulse` class), so the dot never breathed; the dot now takes `motion-safe:animate-breath`
removed: apps/dashboard/src/routes/(app)/config/models/+page.svelte:384 `[data-slot="check"] path` stroke-dasharray 12 / `draw` keyframes with a `--dur-ghost` delay — replaced by the house tick (`animate-check-draw` + `dash-unit` on a `pathLength="1"` path), the same tick Check.svelte draws
removed: apps/dashboard/src/routes/(app)/config/models/+page.svelte:585 `m-0 list-none p-0` on the limits list — Preflight already sets them
removed: apps/dashboard/src/routes/(app)/config/devices/+page.svelte:151 `m-0` on the notes list — Preflight already sets it
removed: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:898 `m-0`/`border-none border-current`/`p-0` on forms and the `m-0 list-none p-0` on the checklist — form and list resets Preflight already applies
removed: apps/dashboard/src/routes/(app)/config/delegate-types/+page.svelte:87 `class="group"` — a dead class (its rule lived in a `<style>` the merge dropped); the element is plain

## Fixed
fixed: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:636 the callback, add form, way picker, empty state, cards, row app/ask forms, project chips and project checklist had no rules at all after the merge (14 dead classes); each is restyled from main's rules as utilities — DESIGN.md Layout (ladder spacing), Typography (running text measure 60–72ch)
fixed: apps/dashboard/src/routes/(app)/config/devices/+page.svelte:241 the three row grids (`minmax(0, 1fr) auto auto` with 12px/10px literals) are flex rows with a `min-w-0 flex-1` column and space-3 gap/padding — DESIGN.md Layout (ladder 11)
fixed: apps/dashboard/src/routes/(app)/config/models/+page.svelte:364 the "finishing the connection" dot breathes again (see removed) — DESIGN.md Motion
fixed: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:947 the key field's flex basis and cap are tokens read as `basis-c-key-field-basis` / `max-w-c-key-field-max`, not a foreign-DOM residual aimed at the Input's `data-slot`
fixed: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:675 ProviderLogo's `size-icon-md` dropped: the mark is 16px (`size` default) by itself, and the kit's contract refuses a size class

## Tokens
token: --c-key-field-basis 14rem — the Set-key field's flex basis in a row beside its buttons (connections/+page.svelte:947); a real field dimension, no ladder step or `--c-*` holds it
token: --c-key-field-max 24rem — the same field's cap (connections/+page.svelte:947); a real field dimension

## Gaps
(none)

## Theme additions
The same additions other lanes log (integration deduplicates); this lane needs them as written there.

theme: animate breath
```css
/* @theme: the keyframes stay where app.css has them (@keyframes breath). */
--animate-breath: breath var(--breath) var(--ease-in-out) infinite;
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

## Reports
cross-file hook: none. needs colour token: none. important kept: none. shadcn variant: none. shadow kept residual: none. R2 fixed: none. R3 fixed: none (no mono family on non-code elements; the callback URL is a `<code>`).

## Design critique (interface-craft, from markup and classes against DESIGN.md)
- Add form / row forms / devices confirm blocks: recess surface, `rounded-md`, `p-space-4`, ladder gaps: consistent with the Concentric Rule for a panel holding 10px controls. No finding.
- Devices rows: the old grid was a fixed three-track layout; the flex row keeps the buttons at content width and lets the text column take the rest, and wraps long codes with `wrap-anywhere`. No finding.
- Status lines (models): dot + label with `gap-space-2`, the dot `rounded-pill` square: reads as one mark with its word. No finding.
- Tick draw gated by `motion-safe:`; under reduced motion the full tick shows at once. No finding.
- ui-observer: no /motion bench or stories file renders these routes in this workspace, and no dev server was started (the brief forbids probe specs), so rendered layout was **Not verified**.
