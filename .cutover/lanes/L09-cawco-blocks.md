# Lane L09-cawco-blocks: blocks, canvas stages, join

Start: `cawco/cutover-merge` at f5c5024ab. Deltas A–T applied.

## Per file

| file | rules moved | residual | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| blocks/Block.svelte | drop dot (4 pseudo rules → `before:` + `edge-*:before:`), glyph svg size (→ theme component), `.aside` (merge dropped its rule; now utilities) | 0 | none | none | none |
| blocks/BlockPage.svelte | refused line's 1 1 18rem / 72ch (→ tokens), `.newer` (merge dropped its rule; now utilities) | 0 | none | none | none |
| canvas/CanvasStages.svelte | grab strip 160px/50%/-50%, grabber 100×6 | 0 | none | none | none |
| join/AddMachineLink.svelte | underline offset 3px → `--space-1` | 0 | none | none | none |
| join/CheckInStatus.svelte | 8px gaps → space-2, 6px dot → space-2 | 0 | none | none | none |
| join/CopyBox.svelte | 8/5/10px, 1.4 leading, 20ch basis, 26px hand-rolled button → kit Button | 0 | none | none | none |
| join/JoinedRow.svelte | 10px gap → space-3, glyph height → `h-lh` + `text-body`, duotone rule → theme component | 0 | none | none | none |

## Contracts

None.

## Theme additions

theme: component block-glyph
```css
@layer components {
  [data-slot="block-head"] [data-slot="glyph"] svg {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
}
```

theme: component joined-row-duo
```css
@layer components {
  [data-slot="glyph"] svg[data-duo] [opacity] {
    opacity: var(--glyph-duo-status-opacity);
  }
}
```

## Tokens

token: --c-block-refused-max 72ch — the refused-write line's measure (BlockPage); no ladder step or container token is a character measure
token: --c-block-refused-basis 18rem — the refused line's wrap basis beside the Hidden menu
token: --c-canvas-grab-w 160px — the composer canvas's top grab strip (DESIGN.md, canvas entrance)
token: --c-grabber-w 100px — the drawer grabber recipe's width (DESIGN.md Drawer: 100×6), also the canvas grab's
token: --c-grabber-h 6px — the drawer grabber's height
token: --c-copy-box-line 20ch — a wrapping command's room before Copy drops under it

## Kit swaps

(none; CopyBox's Copy button was a straight swap: kit `Button variant="outline" size="xs" press="pressable"`, same text, handlers, aria-live span.)

## Removed

removed: apps/dashboard/src/lib/cawco/blocks/Block.svelte:236 `<style>` foreign-dom and pseudo rules — moved to utilities and a theme component
removed: apps/dashboard/src/lib/cawco/join/JoinedRow.svelte:150 `<style>` — moved to a theme component; the `duo` class (no rule) is now `data-duo`
removed: CanvasStages.svelte `--grab-shift`/`--grab-x`/`--grab-w` custom properties — `start-1/2 -translate-x-1/2` and a token
removed: all `<!-- literal: … -->` markers and numeric `style:--x` literals in the seven files

## Gaps

gap: blocks/Block.svelte:174 `.aside` and BlockPage.svelte `.newer` rules were lost in the merge (main's rules, unconverted); restored as utilities from origin/main's values — DESIGN.md Typography meta role

## fixed

fixed: join/CopyBox.svelte the Copy button takes the kit's outline edge (`border-button-outline`), 24px height and 12px glyph instead of a hand-kept 26px/13px/`border-control` — DESIGN.md Components (Button) and the 12/16/20 icon scale
fixed: join/CopyBox.svelte `pr`/`pl` → `pe`/`ps` — logical properties (better-layout)
fixed: join/JoinedRow.svelte the glyph box is one body line (`h-lh` on the body role) rather than a calc of text size × 1.45 — Typography

## Design critique (interface-craft, from markup and classes)

fixed: dead `aside`/`newer` classes (unknown to Tailwind) carry their styles again.
gap: no `/motion` bench or stories render these seven files in this workspace; ui-observer was not run (Not verified). Visual checks left to the integration compare: the drop dot's offsets per edge, the kit Button's 24px height in CopyBox, and the token-backed widths in CanvasStages, which are undefined until integration adds the six tokens.
