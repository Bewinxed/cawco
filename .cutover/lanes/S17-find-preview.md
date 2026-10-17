# Lane S17-find-preview

11 of 12 files done. FinderCard.svelte is deferred to integration (parent's decision): left exactly as the foundation has it.

## Per-file table
file · rules moved (style rules → utilities) · residual 1/2/3/4/5 · literals preserved · breakpoint edges · STOPs

| file | moved | 1 | 2 | 3 | 4 | 5 | literals preserved | edges |
|---|---|---|---|---|---|---|---|---|
| find/FindPeek.svelte | 17 rules, style deleted | 0 | 0 | 0 | 0 | 0 | 20px, 28px, 44px, 0.35em, max-content minmax(0, 1fr) | none |
| find/FindRow.svelte | 20 rules | 2 | 0 | 0 | 0 | 0 | 20px, 16px, 18px, 8px, 10px, 56px, 44px, 0.35em, 0.25em, minmax(0, 1fr) | none |
| find/Finder.svelte | 60 rules, style deleted | 0 | 0 | 0 | 0 | 0 | 44px, 52px, 16px, 36px, 28px, 11px, 24px, 32px, 9px, 12px, 2px, 15px, 20px, 0.25em, 0.35em, 40px, 54px, 8px | none |
| find/FinderCard.svelte | deferred | - | - | - | - | - | see below | max-width: 899px |
| find/MentionMenu.svelte | 8 rules, style deleted | 0 | 0 | 0 | 0 | 0 | 6px, 36px, 8px, 16px, 24px | none |
| preview/ArtifactMenu.svelte | 12 rules, style deleted | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/PinCard.svelte | 24 rules | 5 | 0 | 0 | 0 | 1 | 16px, 70%, 8px, 16px | none |
| preview/PinDisc.svelte | 3 rules, style deleted | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/PinList.svelte | 20 rules | 2 | 0 | 0 | 0 | 0 | 8px | none |
| preview/PlacePick.svelte | 2 rules, style deleted | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/PreviewPane.svelte | 38 rules | 0 | 12 | 1 | 0 | 1 | 11px, 42%, 60%, 1ch, 100dvh | @container (max-width: 639px) → @max-phone: (container width < 640px) |
| preview/SheetInspector.svelte | 35 rules, style deleted | 0 | 0 | 0 | 0 | 0 | auto 1fr auto, 60%, 40% | none |

Residual sums over the lane: keyframes 9, foreign-dom 12, pseudo 1, svg-paint 0, unmapped 2.

## Kind-5 declarations (verbatim)
- preview/PinCard.svelte: `[data-slot="source"] { direction: rtl; }`
- preview/PreviewPane.svelte: `[data-slot="cover"][data-ready] :global(*) { animation-play-state: paused; }`

Needs variant: none. Needs transition token: none. Needs colour token: none.

## Contracts
deferred-file: apps/dashboard/src/lib/cawco/find/FinderCard.svelte

### Body of the deferred file (FinderCard.svelte)
Its whole `<style>` is two global rules into DOM other files render. Neither can be a residual (the checker refuses `100vw`, `100dvh`, `24px`, `12px` in one) and neither can be moved without editing a file outside the lane. Values verbatim:

1. `:global(.kit-pop.jump-pop)` (GlassCard's Jump face; GlassCard.svelte:95 `jump: "jump-pop gap-0"`) → goes to GlassCard's `FRAME.jump`:
   - `width: min(var(--c-find-w), calc(100vw - 24px));`
   - `max-height: calc(100dvh - var(--c-top-bar-h) - 24px);`
   - `padding: 0;`
   - at `@media (max-width: 899px)` (max-desk): `width: calc(100vw - 12px - env(safe-area-inset-right, 0px));` and `height: calc(100dvh - var(--c-top-bar-h) - 24px);`
2. `:global(.jump-pop .finder)` at `@media (max-width: 899px)`: `flex: 1; min-height: 0;` → goes to Finder's root (`data-slot="finder"`, Finder.svelte:840), only inside the Jump frame (`.jump-pop` is the frame's class).

## Cross-file hooks (delta O2)
- cross-file hook: apps/dashboard/src/lib/cawco/find/Finder.svelte:840 .finder → [data-slot="finder"]; selected by apps/dashboard/src/lib/cawco/find/FinderCard.svelte:174 (`:global(.jump-pop .finder)`)
- cross-file hook: apps/dashboard/src/lib/cawco/find/Finder.svelte:840 .finder → [data-slot="finder"]; selected by apps/dashboard/src/routes/dev/finder/+page.svelte:324 (`.sheet > :global(.finder)`)
- The one in-lane retarget: ArtifactMenu.svelte's focus-heir query `.artifact-row[data-artifact=…]` → `[data-artifact-row][data-artifact=…]` (the kit's DropdownMenu.Item owns its data-slot, so the existing `data-artifact-row` hook is used).
- PinCard.svelte's `querySelector(".thread")` → `[data-slot="thread"]` (own file, new data-slot on the `<ol>`).
- PreviewPane.svelte: `.modes` → `[data-slot="modes"]`; `.pin-room` → `[data-slot="pin-room"]`; `.cover` → `[data-slot="cover"]` (own residual selectors).
- PreviewPane.svelte keeps `preview-pane` and `mode-comment` / `mode-draw` in the class string it passes SideSurface: its residual foreign-dom rules select `.preview-pane … .side-well` (SideSurface.svelte:128 renders `.side-well`; the element has `data-slot="side-well"`). Integration decides whether SideSurface takes a data attribute for the mode.

## shadcn/no-restyle hits (15)
- ArtifactMenu.svelte:202 DropdownMenuTrigger: `min-w-0`, `text-ink-strong`, `type-label`
- ArtifactMenu.svelte:213 DropdownMenuContent: `w-64` (already there before the cutover)
- ArtifactMenu.svelte:231 DropdownMenuItem: `aria-current:text-ink-strong`, `aria-busy:opacity-50`
- PinCard.svelte:446 Textarea: `group-data-sheet/pin:text-(length:--field-fs)` (was `.sheet :global(.field) { font-size: 16px }`)
- PlacePick.svelte:87 SelectTrigger: `text-ink-strong` (already there before the cutover)
- PlacePick.svelte:110 Input: `font-mono` (already there before the cutover)
- PlacePick.svelte:133 Button: `pressable` (already there before the cutover)
- SheetInspector.svelte:233 NativeSelect: `min-w-0` (was `.story :global(.story-pick) { flex: 1; min-inline-size: 0 }`)
- PreviewPane.svelte:1526 PopoverContent: `p-space-2`, `gap-0` (was `:global(.pin-list-pop) { padding: var(--space-2); gap: 0 }`)
- PreviewPane.svelte:1629 Button: `px-0` (already there before the cutover)
- PreviewPane.svelte:1818 Button: `px-0` (already there before the cutover)

## shadcn variant lines (delta N)
- shadcn variant: apps/dashboard/src/lib/cawco/find/Finder.svelte:661 data-open rotate (the fold chevron: `data-open={open || undefined}` + `data-open:rotate-90`)

## Behaviour notes for integration's compare
- `font: inherit`, `color: inherit`, `background: none`, `border: 0` on buttons: the first two are not written (preflight's button reset says them); `border-0` and `bg-transparent` are.
- `.sr-only` in Finder is now Tailwind's `sr-only` (the local one had `clip-path: inset(50%)` and no margin/padding reset).
- `line-clamp-N` (the map's all-three rule) sets `overflow: hidden`; FindRow's phone title (was `overflow: clip` + `-webkit-box` clamp) now computes `hidden`.
- `type-title` on PlacePick's heading adds the role's `letter-spacing` that the `font` shorthand did not carry.
- FindPeek / FindRow / Finder / MentionMenu / PinCard etc.: a `phone` / `sheet` / `squeezed` prop that was a state class is now a `data-phone` / `data-sheet` / `data-whole` attribute (Tailwind's bare `data-*:` variant); descendants read it through `group-data-phone/<name>:`.
- PinCard: `.pin-card:not(.sheet)[style*="left"]` (right: auto) is `data-placed`; the inline `left`, `top`, `max-width` are `--card-left`, `--card-top`, `--card-maxw`. `var(--pop-rise, 8px)` in the keyframes is `var(--pop-rise)` (the root token is 8px).
- PreviewPane: the iframe's inline `width` is `data-panel-inspector` + `--frame-w`; `class:ready` is the existing `data-ready`; the Comments popover's sizes are two more custom properties on its existing `style` string (`--pin-list-w`, `--pin-list-h`).
- Specificity: Svelte-scoped rules in files outside this lane (Turn.svelte's `.turn`, SideSurface's head buttons) are unlayered and outrank these utilities until those lanes land: PinCard's `group-first/entry:mt-0` on Turn and PreviewPane's `data-dimmed:opacity-50` / `aria-*:bg-surface-fill` on head buttons are the places to look in the compare.

## Delta R lines
R2 fixed: apps/dashboard/src/lib/cawco/find/FindPeek.svelte:89, :122
R2 fixed: apps/dashboard/src/lib/cawco/find/FindRow.svelte:61, :146
R2 fixed: apps/dashboard/src/lib/cawco/find/Finder.svelte:464, :484, :520, :532, :621, :643, :670, :721, :740, :769, :810, :882
R2 fixed: apps/dashboard/src/lib/cawco/find/MentionMenu.svelte:113
R2 fixed: apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:267
R2 fixed: apps/dashboard/src/lib/cawco/preview/PinList.svelte:76, :165
R2 fixed: apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:1648
R2 kept as border-0: apps/dashboard/src/lib/cawco/find/Finder.svelte:726 (the `<hr>`: `border: 0; border-block-start: 1px solid`; `border-none` would make `border-t`'s style none through `--tw-border-style`, so the top line would vanish)
R3 fixed: apps/dashboard/src/lib/cawco/preview/PinCard.svelte:329 (the source span; the `<code>` at :427 keeps font-mono)
R3 not mine: apps/dashboard/src/lib/cawco/preview/PlacePick.svelte:110 `font-mono` on the kit Input was already there before the cutover
R1: no element of mine takes box-shadow from both a residual and a utility; no `shadow kept residual` lines
