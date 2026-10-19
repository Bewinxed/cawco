# Lane L30-cawco-top-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding. (No transition/keyframes in the list, so emil-design-eng and transitions-dev were not needed. interface-craft and ui-observer: see Critique.)

better-ui rules followed: transition only the named property (`motion-safe:transition-[rotate]`, never `all`); motion gated behind `motion-safe:`; hover only through the project's `hover:` variant (the `[&:hover]` forms went); a state is an attribute (`data-rehearsing`, `data-hub`), never a class.
better-layout rules followed: gaps and padding on the project's spacing ladder (no one-off px); `min-w-0` / `minmax(0, 1fr)` columns kept so long text cannot overflow; min-height (never height) on the 24px target; logical inset (`start-`/`end-`) on the edge strip so it mirrors.

## Per file

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| cawco/AddMachineDialog.svelte | 13 literals, 15 style vars, 1 `<style>` | 0 | 0 | none | none |
| cawco/AskHere.svelte | 1 | 0 | 0 | none | none |
| cawco/AskItems.svelte | 2 | 0 | 0 | none | none |
| cawco/Coded.svelte | 1 (R3) | 0 | 0 | none | none |
| cawco/EdgePull.svelte | 1 rule + side state, `<style>` deleted | 0 | 0 | none | none |
| cawco/ErrorDialog.svelte | 1 style var, 1 inline style | 0 | 0 | none | none |
| cawco/FleetFault.svelte | 7 literals, 8 style vars | 0 | 0 | none | none |
| cawco/GlassCard.svelte | 1 state class | 0 | 0 | none | none |

Needs variant: none. Needs transition token: none. Kind-5 declarations: none. `needs colour token`: none. `cross-file hook`: none. `important kept`: none. `shadow kept residual`: none.

R3 fixed: apps/dashboard/src/lib/cawco/Coded.svelte:14

## shadcn/no-restyle hits (cleared by kit-swap lines below)

- apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:646 DrawerFooter `flex-col-reverse`
- apps/dashboard/src/lib/cawco/ErrorDialog.svelte:39 DialogTitle `mark-line flex items-center`
- apps/dashboard/src/lib/cawco/FleetFault.svelte:456 Button `num`
- apps/dashboard/src/lib/cawco/GlassCard.svelte:476 HangCard `data-rehearsing:invisible`

shadcn variant: none

## Contracts

None.

## Theme additions

theme: variant details-marker
```css
@custom-variant details-marker (&::-webkit-details-marker);
```

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:380 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:400 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:594 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:646 DrawerFooter `flex-col-reverse` — `stack="reverse"`: the sheet's actions stacked with the primary on top, the kit footer's column reversed
kit-swap: apps/dashboard/src/lib/cawco/ErrorDialog.svelte:39 DialogTitle `mark-line flex items-center` — a glyph-led title row: `gap="glyph"` should carry `flex items-center mark-line` itself
kit-swap: apps/dashboard/src/lib/cawco/FleetFault.svelte:456 Button `num` — `figures="tabular"`: a label with tabular figures (the count in "Fetch all N again")
kit-swap: apps/dashboard/src/lib/cawco/GlassCard.svelte:476 HangCard `data-rehearsing:invisible` — `hidden="rehearsal"`: the card drawn unseen for the rehearsal, set by the `data-rehearsing` attribute this file now writes

## Tokens

token: --c-output-max 12rem — the longest a pre of command or fault output grows before it scrolls (AddMachineDialog run output 14rem and failure tail 12rem, FleetFault detail 10rem; one dimension, no ladder step fits a height)
token: --c-measure-prose 68ch — the reading measure of a fault's explanation and fix (FleetFault ×2)
token: --c-port-field-w 6rem — the Port field's column beside the SSH target in the connect form (AddMachineDialog)
token: --c-report-text-max 60vh — the tallest an error's whole text grows in its dialog before it scrolls (ErrorDialog)

## Removed

removed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:712 `<style>` `summary::-webkit-details-marker` — a pseudo rule; now the `details-marker:hidden` variant (theme addition above)
removed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:669 `--sheet-gap: calc(var(--spacing) * 6)` — a hand-rolled numeric gap; the ladder's `gap-space-7`
removed: apps/dashboard/src/lib/cawco/FleetFault.svelte:252 `--tone-bg` / `--tone-ink` custom properties and every `text-(color:--tone-ink)` below the root — the colour inherits from the root, which a `data-hub` variant now sets
removed: apps/dashboard/src/lib/cawco/FleetFault.svelte:310 `[&:hover]:opacity-100` ×2 — a hand-written arbitrary variant; `hover:` carries it
removed: apps/dashboard/src/lib/cawco/AskHere.svelte:111 `--tile-cols: minmax(0, 1fr)` — `grid-cols-1` is exactly it
removed: apps/dashboard/src/lib/cawco/EdgePull.svelte:51 class `edge` and its `[data-side="right"]` rule — styles and state on the element
removed: apps/dashboard/src/lib/cawco/ErrorDialog.svelte:52 inline `style="--icon-swap-dur: …"` — `style:` directive

## Fixed

fixed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:482 the Password field's gap read `--field-gap`, which only its two siblings set, so its label, input and hint stood with no gap — it takes `gap-space-2` like them — DESIGN.md Layout (spacing ladder)
fixed: apps/dashboard/src/lib/cawco/GlassCard.svelte:476 the rehearsal's `invisible` was a class toggled by state — it is the `data-rehearsing` attribute with a `data-rehearsing:` utility — "a state is an attribute"
fixed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:424 the output disclosure's chevron turn animated `transform` with no motion gate — `motion-safe:transition-[rotate]` as FleetFault's — better-ui: gate motion

## Gaps

gap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:288 the connect form's labelled fields (4) are hand-rolled columns, the kit's Field (12px gap, row-first) is not a straight swap — DESIGN.md Inputs and fields
gap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:414 two native `<details>` disclosures with a hand-turned chevron stand where the kit's Collapsible is — DESIGN.md Components, Collapsible
gap: apps/dashboard/src/lib/cawco/FleetFault.svelte:288 two hand-rolled disclosure buttons (the title line's Details, "What it said") fold through a script `disclose` attachment, not the kit's Collapsible — DESIGN.md Components, Collapsible
gap: apps/dashboard/src/lib/cawco/EdgePull.svelte:49 `z-15` is a stacking value Shell owns (the strip sits between the bar and the sheets) with no token — DESIGN.md Elevation & Depth

## Critique (interface-craft, from the markup and classes against DESIGN.md)

fixed: the fault row's tone now follows one attribute; its disclosures keep 25px (WCAG 2.5.8) targets on the ladder.
gap: none beyond the Gaps above; no `/motion` bench or stories file renders these eight in this workspace, so ui-observer found nothing to measure.
