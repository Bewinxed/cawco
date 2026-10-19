# Lane L23-cawco-project-1

## Files
| file | rules moved | residual kinds (1/2/3/4/5) | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| apps/dashboard/src/lib/cawco/project/CardFace.svelte | 1 `<style>` rule (foreign-dom → theme component), 3 literal sites → `c-mark` | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/cawco/project/CawFloat.svelte | literal 85dvh ×2 → token | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/cawco/project/CawPanel.svelte | literal 22rem → `--c-panel-w` | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/cawco/project/CawThread.svelte | literals 416px, 24px, 760px, 85dvh → tokens/ladder | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/cawco/project/FolderFile.svelte | 1 `<style>` rule (foreign-dom → theme component) | 0/0/0/0/0 | 0 | none | none |

No "needs variant", no "needs transition token", no kind-5 declarations, no `shadcn/no-restyle` hits, no `shadcn variant:` lines, no `important kept`, no `shadow kept residual`, no R2/R3 sites.

## Contracts
contract: apps/dashboard/src/lib/cawco/project/FolderFile.svelte:121 shadcn/no-unknown-classes | apps/dashboard/src/lib/cawco/side/SideSurface.svelte:329 | SideSurface takes only `class` and has no prop for a mono title, so `folder-file` is the anchor of the theme component below; SideSurface needs a title-face prop (or the title's mono face as a variant) so FolderFile passes it and the class goes

## Theme additions
theme: component card-face-tile-glyph
```css
@layer components {
  [data-slot="tile"] > svg {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
}
```

theme: component folder-file-title
```css
@layer components {
  .folder-file > [data-slot="side-head"] [data-slot="title"] {
    font-family: var(--font-mono);
    font-size: var(--text-code);
  }
}
```

## Kit swaps
(none)

## Tokens
token: --c-sheet-max-h 85dvh — the phone bottom sheet's height and its drawer cap (CawFloat, CawThread's available-height fallback); no ladder step, a viewport fraction
token: --c-lead-card-w 416px — the session card hung from Caw's seat (DESIGN.md: "The card is 416px wide")
token: --c-lead-card-max-h 760px — that card's height cap; a real component dimension with no ladder step

## Removed
removed: CardFace.svelte:35,41 duplicate `style:--tile="26px"` ×2 and its `<!-- literal: 26px -->` marker — 26px is `--c-mark` (DESIGN.md identity-mark size)
removed: CawFloat.svelte:68 `--sheet-h` custom property and the `<!-- literal: 85dvh -->` marker — the class reads the token directly
removed: CawPanel.svelte:34, CawThread.svelte:359 literal markers — values moved to tokens

## Gaps
(none)

## Fixed
fixed: CawPanel.svelte:38 panel width 22rem → `--c-panel-w` (380px) — DESIGN.md names Caw's panel the user of that token
fixed: CawThread.svelte:~366 card's viewport margin 24px → `--space-7` (25px) — the nearest ladder step

## Other
needs colour token: (none)
cross-file hook: (none)
