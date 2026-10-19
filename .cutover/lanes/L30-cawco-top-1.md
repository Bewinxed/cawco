# Lane L30-cawco-top-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding. (No keyframes, `in:`/`out:`/`transition:` directive or skeleton in the list, so emil-design-eng and transitions-dev were not needed. interface-craft and ui-observer, both loaded for the Critique.)

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

kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:397 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:415 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:595 Spinner `size-icon-md` — the default size (L05); dropped — done
kit-swap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:646 DrawerFooter `flex-col-reverse` — `stack="reverse"`: the sheet's actions stacked with the primary on top, the kit footer's column reversed
kit-swap: apps/dashboard/src/lib/cawco/ErrorDialog.svelte:39 DialogTitle `mark-line flex items-center` — a glyph-led title row: `gap="glyph"` should carry `flex items-center mark-line` itself
kit-swap: apps/dashboard/src/lib/cawco/FleetFault.svelte:456 Button `num` — `figures="tabular"`: a label with tabular figures (the count in "Fetch all N again")
kit-swap: apps/dashboard/src/lib/cawco/GlassCard.svelte:476 HangCard `data-rehearsing:invisible` — `hidden="rehearsal"`: the card drawn unseen for the rehearsal, set by the `data-rehearsing` attribute this file writes at :478

## Tokens

token: --c-output-max 12rem — the longest a pre of command or fault output grows before it scrolls (AddMachineDialog run output 14rem and failure tail 12rem, FleetFault detail 10rem; one dimension, no ladder step fits a height)
token: --c-measure-prose 68ch — the reading measure of a fault's explanation and fix (FleetFault ×2)
token: --c-port-field-w 6rem — the Port field's column beside the SSH target in the connect form (AddMachineDialog)
token: --c-report-text-max 60vh — the tallest an error's whole text grows in its dialog before it scrolls (ErrorDialog)

## Removed

removed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte (was :712 at 9ec5a3111, the file's last block) `<style>` `summary::-webkit-details-marker` — a pseudo rule; now `details-marker:hidden` at :424 and :543 (theme addition above)
removed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:636 `--sheet-gap: calc(var(--spacing) * 6)` — a hand-rolled numeric gap; the ladder's `gap-space-7`
removed: apps/dashboard/src/lib/cawco/FleetFault.svelte:251 `--tone-bg` / `--tone-ink` custom properties and every `text-(color:--tone-ink)` below the root — the colour inherits from the root, which `data-hub:` utilities now set
removed: apps/dashboard/src/lib/cawco/FleetFault.svelte:300 and :402 `[&:hover]:opacity-100` — a hand-written arbitrary variant; `hover:` carries it
removed: apps/dashboard/src/lib/cawco/AskHere.svelte:113 `--tile-cols: minmax(0, 1fr)` — `grid-cols-1` is exactly it
removed: apps/dashboard/src/lib/cawco/EdgePull.svelte:49 class `edge` and its `[data-side="right"]` rule — styles and state on the element
removed: apps/dashboard/src/lib/cawco/ErrorDialog.svelte:51 inline `style="--icon-swap-dur: …"` — `style:` directive

## Fixed

fixed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:479 the Password field's gap read `--field-gap`, which only its two siblings (:452, :466) set, so its label, input and hint stood with no gap — it takes `gap-space-2` like them — DESIGN.md Layout (spacing ladder)
fixed: apps/dashboard/src/lib/cawco/GlassCard.svelte:476 the rehearsal's `invisible` was a class toggled by state — it is the `data-rehearsing` attribute (:478) with a `data-rehearsing:` utility — "a state is an attribute"
fixed: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:429 and :548 the output disclosure's chevron turn animated `transform` with no motion gate — `motion-safe:transition-[rotate]` as FleetFault's — better-ui: gate motion

## Gaps

gap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:286 the connect form's labelled fields (:286, :452, :466, :479) are hand-rolled columns; the kit's Field (12px gap, row-first) is not a straight swap — DESIGN.md Inputs and fields
gap: apps/dashboard/src/lib/cawco/AddMachineDialog.svelte:422 two native `<details>` disclosures (:422, :541) with a hand-turned chevron stand where the kit's Collapsible is — DESIGN.md Components, Collapsible
gap: apps/dashboard/src/lib/cawco/FleetFault.svelte:298 two hand-rolled disclosure buttons (:298 Details, :400 "What it said") fold through a script `disclose` attachment (:92), not the kit's Collapsible — DESIGN.md Components, Collapsible
gap: apps/dashboard/src/lib/cawco/EdgePull.svelte:49 `z-15` is a stacking value Shell owns (the strip sits between the bar and the sheets) with no token — DESIGN.md Elevation & Depth

## Critique (interface-craft Design Critique per component, from markup and classes against DESIGN.md; ui-observer: no `/motion` bench, stories file or route renders any of the eight in this workspace, so nothing was measured)

AddMachineDialog.svelte — no bench renders it.
- fixed: :479 the Password field stood with no gap between label, input and hint while its two siblings had 7px — one gap now (DESIGN.md Layout).
- fixed: :429 :548 the chevron turn moved without the reduced-motion gate; it takes `motion-safe:` now (DESIGN.md Motion).
- gap: :446 the form is five controls and two disclosures on one screen, the hub key behind a disclosure and the password hint in meta ink; the order (target, port, password) matches the task, no change. The Cancel/Add machine pair at :624 keeps one primary (DESIGN.md Buttons).
- gap: :286 labelled fields are not the kit Field (listed above).

AskHere.svelte — no bench renders it.
- fixed: :113 the single-column tile track is `grid-cols-1`, `minmax(0, 1fr)`, so a long title wraps (`wrap-anywhere`) instead of widening the tile (defensive-css).
- gap: none; the confirm/cancel pair is `sm` kit buttons with the destructive variant carried by `variant` (DESIGN.md Buttons, The Open Page Rule).

AskItems.svelte — no bench renders it.
- fixed: :48 :56 the lead box falls back to `--space-5`, the same 18px step TreeMark uses, instead of a typed 18px.
- gap: none; the status word is meta ink at the row's end and the list scrolls inside the question (`max-h` of eight compact rows, `overscroll-contain`).

Coded.svelte — no bench renders it.
- fixed: :14 the code face is `font-(family-name:--font-mono)`, so the run takes the mono face without the `<code>` ligature reset (delta R3).
- gap: none.

EdgePull.svelte — no bench renders it.
- fixed: :49 the strip's insets are logical (`start-`/`end-`) and its side is the `data-side` attribute with `side-right:`; no `<style>` is left.
- gap: :49 `z-15` has no token (listed above).

ErrorDialog.svelte — no bench renders it.
- fixed: :46 :48 the report text scrolls at a named token (`--c-report-text-max`) with `select-text`, so the whole error is readable and copyable (the component's purpose).
- gap: :39 the title row's classes are a kit swap (listed above).

FleetFault.svelte — no bench renders it.
- fixed: :251 one attribute (`data-hub`) sets the row's tint and ink; a hub fault wears the fail tint, a machine's the attention tint (DESIGN.md Alert), and nothing below re-declares the colour.
- fixed: :300 :402 the two disclosure buttons hold a 25px minimum height (WCAG 2.5.8) on the ladder.
- gap: :298 :400 disclosures are not the kit Collapsible (listed above). :456 Button `num` is a kit swap (listed above).

GlassCard.svelte — no bench renders it.
- fixed: :476 the rehearsal's hidden state is an attribute, not a class (listed above).
- gap: :476 the HangCard variant is a kit swap (listed above).
