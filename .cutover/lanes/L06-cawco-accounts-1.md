# L06-cawco-accounts-1

## Files
| file | rules moved | residuals 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| AccountEditor.svelte | 0 (literal -> token) | 0/0/0/0/0 | 0 | none | none |
| AccountListRow.svelte | 0 (3 literals -> tokens) | 0/0/0/0/0 | 0 | none | none |
| AccountMachines.svelte | 0 (marker removed) | 0/0/0/0/0 | 0 | none | none |
| AccountName.svelte | 0 (already converted, no `<style>`) | 0/0/0/0/0 | 0 | none | none |
| AccountSetup.svelte | 1 live (`.signed-as`), step dot `::after` -> `after:`; whole `<style>` deleted | 0/0/0/0/0 | 0 | `@container setup (width < 640px)` was already `@max-setup/setup:` | none |
| AccountSubmenu.svelte | 0 (literal -> token) | 0/0/0/0/0 | 0 | none | none |

Needs variant: none. Needs transition token: none. Kind-5 declarations: none.

## Removed
removed: AccountSetup.svelte:1010-1361 (old) dead `<style>` rules `.step.done .work .box .in .foot .problem .sec .sec h2 .lead .sec :global(.search) .ghead .choices .crow .choice .ptile .plabel .chev .fld .label .optional .fld :global(.nickname) .machines .mrow .mname .controls .st .row-problem .row-warn .none .preview` — selectors matched no element (the markup already carries utilities) — merge took main's unconverted lines
removed: AccountSetup.svelte `@container setup (width < 640px)` block — every rule already stood as `@max-setup/setup:` utilities; `.step:not(.cur) .name` visually-hidden recipe is `sr-only` now
removed: AccountSetup.svelte `.signed-as` rule set — class and `:global(svg)` / `> span` / `b` selectors moved onto the elements
removed: AccountSetup.svelte `style:--foot-pull`, `--name-clip`, `--st-icon`, `--ptile`, `--code-h`, `--step-h`, `--core`, `--nick-max` (x3, two never read), `--preview-max` — literals or single-use vars; `clip-path` hide recipe -> `sr-only`
removed: AccountListRow.svelte `min-h 56px` — a fixed height propping the row; the row's own padding and its list-row token (`c-row-h`, 44px) hold it
removed: AccountSetup.svelte `<!-- literal: -->` markers and AccountEditor/ListRow/Machines/Submenu markers (11)

## fixed
fixed: AccountListRow.svelte:34 dot 10px -> `size-space-3`, `rounded-pill`, column `var(--space-3)`; chevron column `var(--icon-md)` — DESIGN.md Layout ladder, Shapes (pill for dots)
fixed: AccountSubmenu.svelte:51 dot 8px -> `size-space-2`, `rounded-pill` — same
fixed: AccountSetup.svelte step rail row 34px -> `min-h-c-btn-h` (36), min- so text growth wraps — Layout
fixed: AccountSetup.svelte step dot 6px -> `after:size-space-2` (7px) — Layout ladder
fixed: AccountSetup.svelte status glyphs 14px -> `size-icon-sm` (12), equal to AccountMachines' status glyph (tie between 12 and 16; the sibling status line decides)
fixed: AccountSetup.svelte provider tiles 26px -> `size-c-mark` (exact), choice columns on `--c-mark`/`--icon-md`
fixed: AccountSetup.svelte code field 30px -> `h-c-btn-h-sm` (exact)
fixed: AccountSetup.svelte footer pull `calc(-1 * var(--space-7))` -> `-mx-space-7`
fixed: AccountSetup.svelte `.signed-as` icon 16px -> `size-icon-md`

## Tokens
token: --c-account-reserve-w 64px — AccountEditor reserve percentage field width, a real field dimension (3 digits plus pad); no ladder step or c-* fits
token: --c-setup-rail-w 184px — AccountSetup step rail column; no c-* is a rail of this role (c-sidebar-w is 228)
token: --c-setup-machine-name-w 150px — AccountSetup machine-name column, fixed so every machine row's controls start on one x
token: --c-setup-code-basis 140px — AccountSetup pasted-code field's flex basis (`--code-flex`), the width under which the field wraps below the link
token: --c-setup-nickname-w 280px — AccountSetup nickname field's max width
token: --c-setup-preview-w 360px — AccountSetup name preview card's max width

## Theme additions
none

## Kit swaps
none

## Contracts
none (cross-file hooks: none)

## Design critique (interface-craft, from markup and classes against DESIGN.md; ui-observer: Not verified, no bench or stories file renders these in the workspace)
fixed: step dot, list-row dot and menu dot now sit on the spacing ladder and the pill radius, so the three account dots no longer carry three one-off sizes
fixed: the visually-hidden step name is `sr-only`, one primitive instead of a hand-kept clip recipe
gap: AccountSetup.svelte:~459 the step rail and the 640px container query (`--container-setup`) are off DESIGN.md's 640/900/1024 breakpoint ladder as a container width; integration may fold `setup` into `phone`
gap: AccountListRow.svelte:36 the row link carries `grid-areas-(--link-areas)` through two style vars; a flex row with a second line under the name would drop both vars (DESIGN.md row recipe: one lead column, one text column)
gap: AccountSetup.svelte step rail current marker uses `data-cur` beside `aria-current="step"`; both state the same fact, and a `aria-current-step` variant would let the attribute carry it alone
removed: AccountSetup.svelte:482 data-step-dot attribute — nothing selected it once the dot's ::after rule became after: utilities
