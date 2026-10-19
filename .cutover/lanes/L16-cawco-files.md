# Lane L16-cawco-files

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: transition only the named property (`transition-[opacity]`, never `all`); hover reveals only under `(hover: hover)` (`hover:`/`group-hover:`), with touch always shown via `coarse:`; `overscroll-contain` on every nested scroller; outline images in the tokenised image outline; radii concentric (card 12 = well 8 + inset 4).
better-layout rules followed: logical properties only (`ps-`/`pe-`/`end-`/`-me-`, `min-h`, `size-`); `min-h`/`min-w-0` never a fixed height on text; tracks as `minmax(0, 1fr)`; wrapping rows (`flex-wrap`) for the empty line and its action; scroll hint kept (the "N more" sign) and edge fade.

## Files
| file | result |
| --- | --- |
| files/ArtifactCards.svelte | `<style>` gone (all rules → utilities); inline grid-column / grid-row-end / aspect-ratio → custom properties; masonry gutter moved here from FilesList's `> [data-files-cards]` rule |
| files/FilesFace.svelte | `<style>` gone |
| files/FilesFloat.svelte | `<style>` gone; inline inset/size → custom properties + utilities; `:global([data-slot="side-card"])` → `inner-side-card:` variant |
| files/FilesItem.svelte | no `<style>`; two class hooks Shell selects (contract) |
| files/FilesList.svelte | `<style>` gone (all rules → utilities) |
| files/FilesSheet.svelte | `<style>` gone; `:global(.files-drawer)` height → `h-(--files-drawer-h)` on the Drawer.Content |
| files/files.svelte.ts | dead selector `.kit-pop.files-pop` → `.kit-pop[data-glass-card-frame="files-pop"]` |

Residual `<style>` kept: none. Kind-5 declarations: none. Literals preserved: none. Breakpoint edges: none (the height query 560px is `short-window:` / `tall-window:`).

## Theme additions
theme: utility auto-rows-line
```css
@utility auto-rows-line {
  grid-auto-rows: 1px;
}
```
theme: variant inner-side-card
```css
@custom-variant inner-side-card (& [data-slot="side-card"]);
```
theme: variant short-window
```css
@custom-variant short-window {
  @media (height < 560px) {
    @slot;
  }
}
```
theme: variant tall-window
```css
@custom-variant tall-window {
  @media (height >= 560px) {
    @slot;
  }
}
```
theme: utility artifacts-min-*
```css
@utility artifacts-min-* {
  --artifacts-min: --value([*]);
}
```
theme: utility attachments-min-*
```css
@utility attachments-min-* {
  --attachments-min: --value([*]);
}
```
theme: utility fade-len-*
```css
@utility fade-len-* {
  --fade-len: --value(--spacing-*, [*]);
}
```

## Tokens
token: --c-artifact-card-min 148px — the masonry's least card width (a thumbnail that still reads beside a name of a dozen characters); a real dimension, no ladder step fits; ArtifactCards reads it as `--card-min`
token: --c-edge-fade-len 40px — the house edge fade's full length (the kit's `.kit-edge-fade-block` default), held by Files' scrollers at every width as Caw's panel holds it (kit narrows it to 16px under 640px)

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:449 Tabs `min-h-0 flex-1` — a shrinkable fill height variant (`height="shrink"` as DrawerContent has)
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:472 TabsContent `flex min-h-0 flex-col` — a column pane that may shrink (`height="shrink"`)
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:479 TabsContent `flex min-h-0 flex-col` — same
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:788 Button `absolute end-space-1 top-1/2 -translate-y-1/2 text-ink-muted opacity-0 transition-[opacity] dur-control ease-out group-hover/row:opacity-100 group-focus-within/row:opacity-100 coarse:opacity-100` — `reveal="row-end"`: an icon button pinned at its row's end, shown on the row's hover and focus and always under a finger

## Removed
removed: FilesList.svelte (old `.files-search` coarse `input { font-size: 16px }`) — duplicate of DESIGN.md's 16px Field Rule, which the base layer already applies to every field under a coarse pointer
removed: FilesList.svelte (old `.files-section + .files-section`) — adjacency selector standing for a state; the second region's own rule is on it (`data-files-rule`)
removed: FilesList.svelte (old `.files-wait` scroll props: scrollbar-width/colour, overscroll, fade-length on the skeleton) — the skeleton's wrapper is `overflow-hidden` and shows no scrollbar or fade; only the real scroller carries them
removed: ArtifactCards.svelte (old `.ghost-name` `block-size: 1ex`, FilesList `.ghost-age` `inline-size: 2ch`) — off-ladder units; now `h-space-2` (7px) and `w-space-4` (14px), the nearest ladder steps
removed: ArtifactCards.svelte / FilesList.svelte `padding-inline: calc(var(--space-1) / 2)` (2px) — now `px-space-row` (the 2px row token)
removed: ArtifactCards.svelte (old `.ghost-well` / `.ghost-name` radii 8 / 2) — the Skeleton's own `radius="chip"` / `radius="text"` variants
removed: files.svelte.ts:374 `.kit-pop.files-pop` — matched nothing (no element carries a `files-pop` class), so `floatPlace()` always returned null

## Gaps
gap: apps/dashboard/src/lib/cawco/files/FilesItem.svelte:40 `bar-item` / `bar-symbol` classes are Shell's recipe (`.tools :global(.bar-item[data-counted])`, `.bar-item .num`, `.tools :global(.bar-symbol)`) — an item's look should be one kit recipe, not a class a sibling file styles by selector — DESIGN.md Top bar's trailing edge

## Contracts
resolved at integration: FilesItem's `bar-item`, `files` and `bar-symbol` classes are gone; the button is `[data-bar-item]`, its count `data-slot="num"`, its folder `data-slot="bar-symbol"`, all drawn by app.css's bar-group component (L33).

## Lists
needs variant: (none beyond Theme additions)
needs transition token: (none)
cross-file hook: (none)
shadcn variant: (none)
important kept: (none)
shadow kept residual: (none)
needs colour token: (none)

## fixed (Design Critique, from markup and classes, against DESIGN.md)
fixed: FilesFloat.svelte:162 the float's height was a calc in a rule; now one custom property read by `h-(--float-h)` — Layout: no magic offsets
fixed: files.svelte.ts:374 float placement selector matched nothing — Files' float now finds its card
gap: FilesList.svelte (rows) the Show-in-conversation reveal now follows `hover:`'s `(hover: hover) and (pointer: fine)` guard instead of bare `:hover`; touch keeps it always shown via `coarse:` — verify at integration on a hybrid device
gap: ArtifactCards.svelte / FilesList.svelte no `/motion` bench or stories file renders Files; ui-observer measurements were not possible in this workspace (Not verified)
gap: ArtifactCards.svelte `--card-min` reads `--c-artifact-card-min`, which is undefined until integration adds the token: until then `cardMin` falls to 1 and the masonry packs a column per few pixels — expected
