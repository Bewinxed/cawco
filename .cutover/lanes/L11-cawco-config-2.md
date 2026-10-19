# Lane L11-cawco-config-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

## Files

| file | rules moved / literals converted | `<style>` left |
| --- | --- | --- |
| config/NewMemoryPopover.svelte | inline popover size style + form gap literal → `width="widest"`, `max-w-(--bits-popover-content-available-width)`, `gap-space-3` | none |
| config/PickerChip.svelte | chip gap/height/pad, option gap/pad, group pad literals; `--tpress` → `motion-safe:active:scale-(--press-scale)`; `[&:hover]` → `hover:`; clip/ellipsis/nowrap → `truncate`; `text-left` → `text-start` | none |
| config/PreviousVersions.svelte | 72ch measure ×3, gaps, pads literals; mono span off `font-mono` (R3) | none |
| config/ReadingWell.svelte | 72ch measure, 12px pad | none |
| config/RolloutChip.svelte | chip/popover/machine row/sync button/notes literals; sync button's dead `:global(svg)` rule deleted | none (was foreign-dom, dead) |
| config/RowList.svelte | `-8px` bleed → `-mx-space-2` | none |
| config/SectionFrame.svelte | 980px body max, head/line gaps, runtime `min-height` → `--card-h` + `min-h-(--card-h)` | none |
| config/SectionRow.svelte | row/tile/text/controls/below literals; pseudo, keyframes, foreign-dom rules → utilities and theme additions | none |

## Removed
removed: RolloutChip.svelte:116-127 `[data-slot="sync"] :global(svg) { width/height icon-sm; flex none }` — dead: PendingContent already sizes its icons with `size-(--btn-icon)`, and the button now sets `--btn-icon: var(--icon-sm)` (it set 12px before, so the rule was fighting it).
removed: RolloutChip.svelte:116 `style="--pop-w: 360px; --pop-max: calc(100vw - 2rem)"` (and the same in NewMemoryPopover.svelte:106) — hand-kept popover size; the kit's `width="widest"` carries it and bits-ui's available width caps it on a phone.
removed: SectionRow.svelte `--hit-gap-coarse` fallback indirection — two plain `hit-gap-x-(--space-*)` utilities under `coarse:` set the same property.
removed: SectionRow.svelte `max-phone:ml-(--controls-ml)` 36px / `calc(100% - 36px)` / `pl 44px` hand-kept offsets — now the same row dimensions as calc of tokens (tile + row gap + row pad), so they follow the tile and gap.

## Fixed
fixed: SectionRow.svelte:~110 row padding 8/6px → `px-space-2 py-space-2`, gap 10px → `gap-space-3`, tile 26px → `size-c-mark` — DESIGN.md Layout ladder and the icon tile (raised 26px square at 8px radius).
fixed: SectionRow.svelte note/`below` indent 44px = row pad + `--c-mark` + row gap, so a note lines up with the row's text — DESIGN.md Layout (shared edges).
fixed: RowList.svelte bleed `-8px` → `-mx-space-2`, equal to the row's inline pad so the ghost bleeds exactly the row's inset.
fixed: SectionFrame.svelte `style:min-height` → custom property + utility (delta E).

## Tokens
token: --c-reading-measure 72ch — the reading measure of a rule or hook's sentence (ReadingWell, PreviousVersions notes); a text measure, no ladder step.
token: --c-section-body-max 980px — the config section body's maximum width (DESIGN.md: the dialog's 980px); no `--c-*` holds it.
token: --c-row-h-two 56px — a section row with a meta line (two-line row), next to `--c-row-h` 44px; no ladder step or token holds it.

## Theme additions
theme: animate row-flash
```css
@theme {
  --animate-row-flash: row-flash calc(var(--dur-fade) * 3) var(--ease-out) both;
  @keyframes row-flash {
    from {
      opacity: 0.35;
    }
  }
}
```
theme: component section-row-tile-glyph
```css
@layer components {
  [data-slot="row"] > [data-slot="tile"] svg {
    width: var(--icon-md);
    height: var(--icon-md);
    flex: none;
  }
}
```
theme: component section-row-controls-ghost
```css
@layer components {
  @media (hover: hover) {
    :root:not(.dark) [data-slot="row"] [data-slot="controls"] [data-ghost]:hover:not(:disabled) {
      background: var(--surface-fill-strong);
    }
  }
}
```
(The original was a scoped rule that beat the kit button's own hover; in `@layer components` the kit's `hover:bg-[var(--surface-hover)]` utility wins, so integration should apply it as the ghost variant below, not as this rule. By night the kit's own hover already is `--surface-hover`.)

## Kit swaps
kit-swap: SectionRow.svelte:~170 (RowMenu's ghost trigger inside `[data-slot="controls"]`) Button variant ghost — `row-resting` variant: day hover `surface-fill-strong`, the row's hover step past the ghost.
kit-swap: RolloutChip.svelte:~212 `<button data-slot="sync">` → kit Button `size="xs" variant="ghost"` — not a straight swap (PendingContent, `whileIdle`, aria-busy/aria-disabled handled by hand); left as is.

## Contracts
(none)

## Gaps
gap: RolloutChip.svelte:~212 hand-rolled sync button (24px, label type, hover tint, press scale) — DESIGN.md Components: controls are the kit's button; needs a kit variant that takes `PendingContent` without `size-` override.
gap: SectionRow.svelte [data-slot="controls"] `hit-gap-x` — the touch-hit gap should come from the kit's controls row, not be set per row; `hit-gap-coarse-*` in app.css is now unused by this file.
gap: NewMemoryPopover.svelte / RolloutChip.svelte popovers use `width="widest"` (384px, was 360px): the kit has no 360px width step; DESIGN.md names none.
gap: PickerChip.svelte chip radius is `rounded-md` (10px, a control) where DESIGN.md Components says setting chips are 8px (`rounded-sm`) and 30px high; height now `h-c-btn-h-sm` (30px, was 32px); the radius is not a literal and is left for the audit.

## Needs
needs variant: none · needs transition token: none · kind-5 declarations: none · literals preserved: none · breakpoint edges: `max-phone:` (was `max-width: 639px`) unchanged.
shadcn/no-restyle hits: none reported by eslint.
shadcn variant: none.
important kept: none.
R2 fixed: none (no `border: 0`). R3 fixed: PreviousVersions.svelte:~98 (span, not code/pre).
shadow kept residual: none.
needs colour token: none.
cross-file hook: none.

## Design critique (interface-craft, from markup and classes; no bench renders these files in this workspace, so ui-observer: Not verified)
fixed: every gap/pad now sits on the 4/7/11/14/18/21/25/32 ladder.
fixed: press feedback is `motion-safe:active:scale-(--press-scale)` (0.97), gated on reduced motion; hover is `hover:` (guarded by hover-capability).
fixed: flash is an opacity-only keyframe on `data-flash`, under 600ms (3 × `--dur-fade`), so it needs no reduced-motion gate.
gap: ui-observer not run — no stage or `/motion` bench renders config rows here; Not verified at 320px / 200% zoom.
