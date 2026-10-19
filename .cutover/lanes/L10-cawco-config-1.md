# Lane L10-cawco-config-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before reporting: interface-craft, ui-observer.

## Files
| file | rules moved / converted | residual | literals preserved | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| config/ConfigRail.svelte | 8 literals to ladder/tokens, 7 lost `.count`/`.fault` rules restored as utilities, `<style>` to theme component | 0 | 0 | none | none |
| config/EditorFooter.svelte | 5 literals to ladder/tokens, 1 calc var | 0 | 0 | max-phone, max-desk kept | none |
| config/EditorFrame.svelte | 3 literals to ladder/tokens, `<style>` to theme component | 0 | 0 | max-phone kept | none |
| config/EditorSection.svelte | 1 literal to ladder | 0 | 0 | none | none |
| config/FetchSkillPopover.svelte | lost `.choices`/`.note`/`.choice` rules restored, inline `style` and literal removed | 0 | 0 | none | none |
| config/Field.svelte | 2 literals to ladder/token | 0 | 0 | none | none |
| config/LinkMarketplacePopover.svelte | lost `.form` rule restored, inline `style` removed | 0 | 0 | none | none |
| config/McpSignIn.svelte | lost `.state` rule restored | 0 | 0 | none | none |

No kind-5 declarations, no "needs variant", no "needs transition token", no `no-restyle` hits, no `shadcn variant:` lines, no `important kept`, no `shadow kept residual`.

## Contracts
(none: the two popover `style` strings are cleared in this lane through `w-c-panel-w` and `max-w-(--bits-popover-content-available-width)`)

## Removed
removed: apps/dashboard/src/lib/cawco/config/ConfigRail.svelte:78 `m-0 p-0 list-none` on the `ul` — Preflight already zeroes a list's margin, padding and markers; duplicate declarations
removed: apps/dashboard/src/lib/cawco/config/ConfigRail.svelte:118 `leading-(--fault-h)` and `text-center` on the fault badge — the badge now centres its figure with flex, so no line-height is propping up the 18px box
removed: apps/dashboard/src/lib/cawco/config/ConfigRail.svelte:110 `rounded-(--dot-r)` (`50%`) — the dot is a state dot, so `rounded-pill`

## Tokens
token: --c-config-rail-w 232px — the Configure rail's width, a real component dimension (ConfigRail.svelte); the sidebar's 228px is another component
token: --c-rail-count-min 3ch — the rail's count column, three digits wide so the dash and the figure hold one box (ConfigRail.svelte); a text-relative measure, no ladder step
token: --c-editor-max-w 980px — the editor body and its commit row's inner max width (EditorFrame.svelte, EditorFooter.svelte); one dimension used on both
token: --c-btn-min-w 96px — the Save button's minimum width (EditorFooter.svelte); no button width token exists
token: --c-field-hint-measure 72ch — the line length of a field's hint, caution and problem (Field.svelte); a text measure, no ladder step
token: --c-choice-list-max-h 13rem — the fetched skill's choice list height before it scrolls (FetchSkillPopover.svelte)

## Gaps
gap: apps/dashboard/src/lib/cawco/config/EditorFrame.svelte:166 `mt-space-row` on the header tile nudges it to the title input's first line; the input is in the editors' `header` snippets (other files) — DESIGN.md Layout: the row nudge belongs to the header recipe, not to the tile
gap: apps/dashboard/src/lib/cawco/config/FetchSkillPopover.svelte:130 `gap="form"`/`pad="form"` on Popover.Content carry `gap-3`/`p-3` (11px each by the Tailwind scale on 0.25rem is 12px, not a ladder step) — DESIGN.md Layout spacing ladder; the popover kit's variants are the kit lane's

## Fixed
fixed: ConfigRail.svelte `.count`, `.fault` rules main added had been dropped by the merge (the elements carried bare `class="count"`); they are utilities again — DESIGN.md, The Earned Count Rule (the count column's width and selected ink)
fixed: FetchSkillPopover.svelte `.choices` (flex column, capped height, scrolls), `.note`, `.choice` (padding, left text) restored as utilities; the choice's `--choice-pad` had no declaration, so the padding was lost
fixed: LinkMarketplacePopover.svelte `form` restored as a flex column with `gap-space-3` — the popover form recipe
fixed: McpSignIn.svelte `state` restored as `type-meta text-ink-muted`
fixed: FetchSkillPopover.svelte, LinkMarketplacePopover.svelte popover width is `w-c-panel-w` (380px token) and `max-w` follows the popover's own available width, in place of the inline `100vw - 2rem` style string

## Theme additions
theme: component config-rail-tile-icon
```css
@layer components {
  [data-slot="rail"] [data-slot="tile"] > svg {
    width: var(--space-4);
    height: var(--space-4);
  }
}
```
theme: component config-editor-tile-icon
```css
@layer components {
  [data-slot="editor"] [data-slot="tile"] > svg {
    width: var(--icon-md);
    height: var(--icon-md);
  }
}
```

## Kit swaps
(none)

## Critique (interface-craft Design Critique, from markup and classes, against DESIGN.md)
fixed: rail row, tile, dot, fault badge and count sit on the 4/7/11/14/18/21 ladder; radii by role (tile xs, row sm, rail panel lg, dot pill)
fixed: list variant row is 44px, the touch floor, in place of 48
gap: no `/motion` bench or stories file renders these files in this workspace, so ui-observer's rendered-layout read was not run
