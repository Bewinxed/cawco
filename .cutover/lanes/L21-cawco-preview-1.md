Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.

# Lane L21-cawco-preview-1: ArtifactMenu, CanvasView, LiveDot, PinCard, PinList, PreviewPane

Started from the merge `f5c5024ab`. Deltas A to T applied (S and T win). Every `<style>` block in the six files is gone.

## Per file
| file | rules moved | `<style>` left | literals preserved | breakpoint edges |
| --- | --- | --- | --- | --- |
| ArtifactMenu.svelte | trigger, row remove margin | none (the rest of the sheet matched nothing) | none | none |
| CanvasView.svelte | Content width | none (it had none) | none | none |
| LiveDot.svelte | dot, loop | none | none | none |
| PinCard.svelte | entrance, source and file code type, sheet cap, field size | none | none | none |
| PinList.svelte | moved row, skeleton rows, empty states, scroller, fault indent | none | none | none |
| PreviewPane.svelte | head controls, cover, errors, down actions and details, well and mode hooks | none | none | none |

## Removed
- removed: ArtifactMenu.svelte `.artifact-list .artifact-row` min-block-size, `[aria-current="true"]` ink, `[aria-busy="true"]` opacity: they selected a class the markup no longer carries (`data-artifact-list`, `data-artifact-row` now), and the kit's `marks="current-busy"` item look already draws current and busy.
- removed: ArtifactMenu.svelte `.artifact-name`, `.row-text`, `.row-name`, `.row-promoted`, `.row-age`, `.row-remove` and its hover and coarse rules: dead twins of utilities the markup already carries.
- removed: ArtifactMenu.svelte `style:--remove-me="calc(-1 * var(--space-1))"`: `-me-space-1` says it.
- removed: ArtifactMenu.svelte `.menu-line` rule: it selected `.artifact-list .menu-line`, which never matched; the kit Label already sets muted meta ink. The Label keeps `wrap-anywhere`.
- removed: LiveDot.svelte `@keyframes live-dot`: the theme's own `animate-pulse` is the same loop (`--dur-loop`, `--ease-in-out`, a 50% dip); the dip is 0.5 where it was 0.4.
- removed: PinList.svelte `style:--live-dot="8px"` and its literal marker: nothing read it, LiveDot sizes itself.
- removed: PinList.svelte `.rows` margin, padding and list-style: Preflight already resets the list.
- removed: PinList.svelte `.moved-row` transition: nothing in the row changes.
- removed: PinCard.svelte `.head`, `.room`, `.foot`, `.anchor`, `.name`, `.source`, `.thread`, `.entry`, `.files`, `.sheet :global(.field)`, `.error`, `.actions`: dead twins of the utilities on the markup.
- removed: PinCard.svelte `style:--live-dot="8px"` and `style:--lh-normal="normal"`: unread; the code lines take `type-code`'s own leading.
- removed: PreviewPane.svelte `.preview-inset`, `.inset-well`, `.canvas-slot`, `.cover`, `.cover-state`, `.sheet-dim`, `.sheet-error*`, `.error`, `iframe`, `iframe.ready`, `.pin-room`, `.count`, `.menu-count` and `:global(.pin-list-pop)`: none matched the markup any more.
- removed: PreviewPane.svelte `.comments[aria-expanded]` and `.inspect[aria-pressed]` background: Comments takes `aria-expanded:bg-surface-pressed`; Inspect's is SideSurface's own `button[aria-pressed="true"]` rule.
- removed: PreviewPane.svelte `:global(.preview-pane [data-side-well])` reduced-motion twin: it repeated the base rule's transition.
- removed: PreviewPane.svelte `class="send"`, `class="other"`, `class="inspect"`, `class="comments"`, `class="pins-hidden"`, `class="count"` hooks: no sheet or other file selects them.
- removed: PreviewPane.svelte `mode-comment` / `mode-draw` state classes and the `preview-pane` class on SideSurface: the mode is `data-mode` on the pin room, and the head controls take `data-dimmed`.
- removed: PreviewPane.svelte `data-ready:[&_*]:animation-paused` (an arbitrary variant): `group/cover` and `group-data-ready/cover:animation-held` on the two children.
- removed: PreviewPane.svelte `style:--frame-bg="Canvas"`, `style:--err-max="60%"`, `style:--sk-h`, `style:--sk-w`.
- removed: PreviewPane.svelte `border-t-border-hairline`: `border-border-hairline` after `border-t`.

## Fixed
- fixed: PreviewPane.svelte:2409 the inset pane is a size container again (`@container`): `.preview-inset` held `container-type: inline-size` and went dead with its class, so the canvas map's and the head's width queries had nothing to key on — DESIGN.md Layout, a component answers to its own width.
- fixed: PreviewPane.svelte:2210 the mode switch is `data-slot="modes"` again: its label-hiding rule selected that hook and the markup no longer carried it, so the labels drew.
- fixed: PreviewPane.svelte:2540 the cover's skeleton and its stage line fade up after the wait's grace again (`animate-wait-grace-in`): `.cover > *` went dead with the class — DESIGN.md's Real Wait Rule.
- fixed: PreviewPane.svelte:2540 the skeleton line is `h-space-3 w-2/5`: 11px is `space-3`; 42% is the nearest plain fraction.
- fixed: PreviewPane.svelte:2571 the error card caps at `max-h-3/5` (60%).
- fixed: PinCard.svelte:298 the sheet cap is `data-sheet:max-h-7/10`; the card is `pointer-events-auto` on its own root, where the pin room's child selector put it.
- fixed: PinCard.svelte:298 the entrance scales from `--press-scale` (0.97) where the keyframe had 0.96: the house's nearest scale (transitions-dev dropdown open is 0.97).
- fixed: LiveDot.svelte the dot is `size-space-2` (7px) where it was 8px: the ladder's step for a dot.
- fixed: PreviewPane.svelte:2301 the menu's Comments and Send picks hide their words by `in-form-compact:hidden` inside the head item, where a descendant rule did.
- fixed: ArtifactMenu.svelte:242 the dropped line's Label keeps its own muted meta look; the old rule never drew.

- fixed: Design Critique (read from the markup, no live render): the head's icon-only mode switch keeps its accessible names and the Comments button its name; hooks `data-head-item`, `data-slot="more"` untouched.
- gap: Design Critique / ui-observer: layout not verified in a browser (no live session in this lane); the paired shells carry it.

## Tokens
- token: --text-input 16px — the phone field floor so iOS Safari does not zoom into the pin's reply field (read as `--field-fs` by the kit Textarea's `pin-field` look); no text step is 16px.
- token: --c-count-digit 1ch — a head control's count keeps one digit's width so a lone digit does not collapse its box (PreviewPane's Comments count; SideSurface's `.more-count` shares it); no ladder step is a character width.

needs colour token: --frame-ground: Canvas (apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:2498) — the system canvas colour behind a page in the well, which has none of its own; the frame's own `color-scheme` picks light or dark.

## Gaps
- gap: PinCard.svelte:211 `GAP = 12` and `EDGE = 8` (script) and `calc(100% - 16px)` in `--card-w` / `--card-max` are off the spacing ladder (11, 7); the placement maths and the cap move together, and the script is not a lane's.
- gap: ArtifactMenu.svelte:309 the row's Remove is a hand-built icon button inside a menu item; the kit Button's icon-sm ghost is not a straight swap (it stops the item's own press and keys).
- gap: PreviewPane.svelte:2322 the head's `other` controls dim by `data-dimmed` while the SideSurface head recipe (its `<style>`) draws their opacity: the two meet only once SideSurface's lane lands.
- gap: PreviewPane.svelte:2540 `kit-skeleton`'s sweep (app.css) has no pause of its own under a hidden ancestor; this file holds it with `animation-held`.

## Contracts
(none)

## Kit swaps
- kit-swap: CanvasView.svelte:94 `<DropdownMenu.SubContent>` `w-52` — a `width: "regular"` look on the sub content (the Content has it; the sub content has only `wide`).
- kit-swap: ArtifactMenu.svelte:223 `<DropdownMenu.Trigger>` `max-w-full min-w-0 type-label text-ink-strong` — an artifact-title look on the menu Trigger (a name in the label role, cut inside the head); eslint takes it, the look is the head's.
- kit-swap: PreviewPane.svelte:2216 `<TabItem>` ×3 (the mode switch) — an `icon-only` look that draws the glyph and keeps the label as the accessible name; until then `preview-modes-labels` below holds it.

## Theme additions
theme: animate pin-card-in
```css
@theme {
  --animate-pin-card-in: pin-card-in var(--dur-pop) var(--ease-out);
  @keyframes pin-card-in {
    from {
      opacity: 0;
      transform: translateY(var(--pop-rise)) scale(var(--press-scale));
    }
  }
}
```

theme: animate wait-grace-in
```css
@theme {
  --animate-wait-grace-in: kit-fade-in var(--dur-fade) var(--ease-out) var(--dur-wait-grace) both;
}
```

theme: utility animation-held
```css
@utility animation-held {
  animation-play-state: paused;
  &::after {
    animation-play-state: paused;
  }
}
```

theme: component preview-well
```css
@layer components {
  /* The preview's well (SideSurface draws it): Comment and Draw turn its own
     border the accent, 2px inside its box, never a second ring. Interact
     leaves it as the page's own. The ring eases except while the split
     slides, when the well's edges take the slide's transition. */
  [data-side-well]:has(> [data-slot="pin-room"]) {
    outline: var(--focus-ring-width) solid transparent;
    outline-offset: var(--focus-ring-inset);

    &:not(:where([data-split-sliding] *)) {
      transition: outline-color var(--dur-control) var(--ease-in-out);
    }
    &:has(> [data-slot="pin-room"][data-mode]) {
      outline-color: var(--accent);
      cursor: crosshair;
    }
  }
}
```

theme: component preview-modes-labels
```css
@layer components {
  /* The mode's segmented control keeps its segments to their glyphs: each
     name stays its accessible name and its title, never drawn. */
  [data-slot="modes"] [data-slot="ff-tab"] [data-slot="tab-item-label"] {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
```

## shadcn/no-restyle hits (before the kit swaps above)
- ArtifactMenu.svelte:223 `<DropdownMenuTrigger>` `artifact-trigger` (class, gone: its rule is utilities on the trigger now)
- ArtifactMenu.svelte:241 `<DropdownMenuLabel>` `menu-line` (class, gone with its dead rule)
- CanvasView.svelte:94 `<DropdownMenuSubContent>` `w-52` (kept; kit-swap above)
- CanvasView.svelte:107 `<DropdownMenuContent>` `w-52` → `width="regular"`
- PreviewPane.svelte:2278 `<DropdownMenuContent>` `w-48` → `width="compact"` (the kit's `min-w-48` holds 12rem as it was)

## Cross-file hooks
(none)

## Shadcn variants
(none)

## Counts
theme: 5 · kit-swap: 3 · token: 2 · removed: 21 · fixed: 11 · gap: 5
