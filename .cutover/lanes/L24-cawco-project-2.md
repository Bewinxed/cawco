# Lane L24-cawco-project-2: FolderFiles, ProjectDetails, ProjectHead, StarterCards, ViewBar

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. (No transition/keyframes authored, so emil-design-eng and transitions-dev were not loaded.)
better-ui rules followed: hover only under the hover variant; transition only the named property; breath gated by prefers-reduced-motion. better-layout rules followed: logical properties (pe/ps), min-w-0 on flex children, container-query columns, tokens for spacing.
Design critique and ui-observer: no browser run; Not verified.

After-merge lane on the merged tree `f5c5024ab`. Deltas A to T applied; S and T win.

## Per file

| file | rules moved | `<style>` left | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| project/FolderFiles.svelte | 1 literal (chip height 30 → `min-h-c-btn-h-sm`), the 2px focus offset → `--focus-ring-offset` | none | none | none | none |
| project/ProjectDetails.svelte | the LFS row and its form, the GitHub Project pick and Status map, every `class="note"`, the whole `<style>` (28 rules) | none (deleted) | none | `max-[900px]:` → `max-desk:` (900 → width < 901 vs ≤ 900) | none |
| project/ProjectHead.svelte | 3px offset → token, 24px/12px → `--space-7`/`--space-3`, 18rem → token, `max-[900px]:` ×11 → `max-desk:`, `pr/pl` → `pe/ps` | none (deleted) | none | `max-[900px]:` → `max-desk:` | none |
| project/StarterCards.svelte | literal comment, `hover-hover:[&:hover]:` → `hover:`, border compensation | none | none | none | none |
| project/ViewBar.svelte | 10px coarse gap → `space-3`, the `<style>` (2 foreign-dom rules) → theme components | none (deleted) | none | none | none |

## Theme additions

theme: component view-bar-trigger-word
```css
@layer components {
  [data-slot="view-bar"] > [data-slot="select-trigger"] > .mark-text {
    position: relative;
    min-inline-size: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
```

theme: component view-bar-filter-trigger
```css
@layer components {
  [data-slot="view-bar"] > [data-filter-trigger] {
    flex: none;
    min-inline-size: var(--c-composer-field);
    inline-size: auto;
    block-size: var(--c-composer-field);
    border-radius: var(--bar-control-radius);
  }
}
```

theme: component details-asked-thumb
```css
@layer components {
  [data-project-details] [data-slot="toggle-group"][data-pending] .kit-thumb {
    @media (prefers-reduced-motion: no-preference) {
      animation: breath var(--breath) var(--ease-in-out) infinite;
    }
  }
}
```
(The two ToggleGroups in ProjectDetails set `data-pending` while the hub answers; the old rule's `.kit-segmented.lands`/`.trackers` selectors matched nothing once the classes left the markup, so the breath was already lost on the merged tree.)

theme: utility tray-indent-*
```css
@utility tray-indent-* {
  --ask-indent: --value(--spacing-*);
  --fault-indent: --value(--spacing-*);
}
```
(ProjectHead passes `tray-indent-space-7` to ForgetProjectTray, replacing `:global(.head-forget)`.)

## Tokens

token: --c-head-who-basis 18rem — the project head's name column: the width it holds before its actions wrap under it; no ladder step
token: --c-project-details-measure 32rem — the details tray's content measure; no ladder step
token: --c-project-details-label-w 6.5rem — the details rows' label column (104px); no ladder step
token: --c-project-details-select-w 10rem — the machine/connection select column of the tray's add forms; no ladder step

## Removed

removed: StarterCards.svelte:118 `--row-px`/`--row-py` `calc(var(--space-N) - 1px)` — compensated the row border's 1px against the card padding; rows take `px-space-3 py-space-2`
removed: ProjectDetails.svelte `<style>` `.path`, `.kept`, `.add*`, `.lfs-*`, `.bind*`, `.status-*`, `.bound*`, `.gate-*`, `.switch-line`, `.foot`, `.kit-segmented.*`, `.bound :global(svg)` — dead: no element in the file wears those classes any more
removed: ProjectDetails.svelte `.status-map` `margin:0; padding:0; border:0` and `.status-map > legend` padding-top/inline — Preflight already resets fieldset and legend
removed: ProjectDetails.svelte `style:--field-h="30px"` — nothing reads `--field-h`; the Input carries its own `h-(--c-btn-h-sm)`
removed: ProjectDetails.svelte `style:--chev`, ProjectHead.svelte `style:--underline-offset="3px"`, FolderFiles.svelte `style:--focus-offset` — `--underline-offset` and `--focus-ring-offset` are tokens already
removed: ProjectDetails.svelte `style:--bind-cols` `minmax(0, 1fr) minmax(0, 1fr)` — is `grid-cols-2`
removed: ProjectDetails.svelte `.add-path`, `.add-machine`, `.bind-project`, `.status-pick`, `.status-stage` class names — their rules moved onto the elements

## Kit swaps

None.

## Contracts

None.

## Gaps

gap: ProjectDetails.svelte:727 `-mx-space-1` + `px-space-1` hit bleed, and ProjectHead.svelte name/place buttons — an inline hit area that outsets its words so their edge stays on the column; kept as DESIGN.md's text-aligned hit area, not scar tissue
gap: ProjectHead.svelte:491 `--more-bleed: calc((var(--c-btn-h) - var(--icon-md)) / -2)` — a negative margin cancelling the icon button's own padding so `⋯` sits at the page edge; the padding it cancels is in the kit's Button, so a kit variant (an icon button flush to the edge) clears it
gap: ViewBar.svelte:164 and ProjectHead.svelte:612 `calc(100vw - …)` widths — use `dvw`/a container unit once the popover recipe names one

## fixed

fixed: ProjectDetails.svelte:900 the Large files row had no layout (its `row`, `label`, `value`, `add*` classes matched no rule): it takes the same grid, label and value recipe as every other row — the details tray's row recipe
fixed: ProjectDetails.svelte:840,964 `text-label` on `<Input>` (a no-restyle hit) — the Input's own `text="label"` prop
fixed: ProjectDetails.svelte:1318 `hover-hover:[&:hover]:underline …-offset-4` — `hover:` with the `--underline-offset` token (3px)

## needs colour token

None.
