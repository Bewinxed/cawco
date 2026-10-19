# Lane L22-cawco-preview-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-layout rules followed: logical properties (start/end, w/h tokens), `min-w-0` + `truncate` on flex text, `flex-1 min-h-0 overflow-auto` body between `flex-none` head/foot, `overscroll-contain` on the list scroller, `max-h` as a fraction not a fixed height. better-ui rules followed: `shadow-tile` plus `inset-ring` for the chosen edge (same layers every state), hover only through `hover:` (fine-pointer guard), no `transition-all`, animation under `motion-safe:`, concentric radii kept on tokens (card lg, view md, chip pill).
ui-observer: Not verified (no browser render of these screens in the workspace).

5 of 5 files done, every `<style>` deleted.

## Per-file table
file · rules moved · residual 1/2/3/4/5 · literals preserved · breakpoint edges · STOPs

| file | moved | 1 | 2 | 3 | 4 | 5 | literals preserved | edges |
|---|---|---|---|---|---|---|---|---|
| preview/SheetInspector.svelte | 3 style vars off (`--insp-rows`, `--sheet-max`, `--skeleton-w`), literal marker deleted | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/map/CanvasMap.svelte | 14 rules, style deleted | 0 | 0 | 0 | 0 | 0 | none | `@container (width < 640px)` → `@max-phone:` (container width < 640px) |
| preview/map/MapCard.svelte | 11 rules, style deleted, 3 inline styles → custom properties | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/map/MapNode.svelte | 1 rule → theme component, style deleted | 0 | 0 | 0 | 0 | 0 | none | none |
| preview/map/MapThumb.svelte | 8 rules, style deleted | 0 | 0 | 0 | 0 | 0 | none | none |

Needs variant: none. Needs transition token: none. Needs colour token: none. Kind-5 declarations: none.

## Theme additions

theme: animate wait-reveal
```css
@theme {
  --animate-wait-reveal: kit-fade-in 1ms var(--dur-wait-grace) both;
}
```

theme: animate wait-reveal-motion
```css
@theme {
  --animate-wait-reveal-motion: kit-fade-in var(--dur-fade) var(--ease-out) var(--dur-wait-grace) both;
}
```

theme: component map-handle
```css
@layer components {
  [data-slot="map-node"] .svelte-flow__handle {
    width: 1px;
    height: 1px;
    min-width: 0;
    min-height: 0;
    border: 0;
    background: transparent;
    pointer-events: none;
  }
}
```

## Kit swaps
none. (SheetInspector's two `kit-skeleton` spans are now the kit `Skeleton`: see Removed.)

## Contracts
none.

## Removed
- removed: apps/dashboard/src/lib/cawco/preview/map/MapCard.svelte:135 `.choose:focus-visible { outline: … }` — app.css's base `:focus-visible` rule draws this exact outline and offset on every element; the local rule was a duplicate.
- removed: apps/dashboard/src/lib/cawco/preview/map/MapCard.svelte:185 `.view > :global([data-slot="map-thumb"]) { box-sizing: border-box; padding }` — a rule into a child's root. MapThumb (same lane) now carries `p-space-2` on its own root, and `box-border` is Preflight's.
- removed: apps/dashboard/src/lib/cawco/preview/map/CanvasMap.svelte:469 `.map-list > :global([data-slot="map-card"]) { inline-size: auto }` — a rule into a child's root. MapCard takes a `class` prop and CanvasMap's list passes `w-auto`.
- removed: apps/dashboard/src/lib/cawco/preview/map/CanvasMap.svelte:413 `.map-graph :global(.svelte-flow__edge-path) { stroke; stroke-width }` — xyflow reads `--xy-edge-stroke` and `--xy-edge-stroke-width`; the graph's div sets them, so no rule into the library's DOM is needed.
- removed: apps/dashboard/src/lib/cawco/preview/SheetInspector.svelte:237 `kit-skeleton` spans — the kit `Skeleton` is the one placeholder (same recipe), with `radius="text"` / `radius="tile"` for the xs / md corners.
- removed: apps/dashboard/src/lib/cawco/preview/SheetInspector.svelte:194 `<!-- literal: auto 1fr auto, 60%, 40% -->` and its `--insp-rows`, `--sheet-max`, `--skeleton-w` custom properties — head, body and foot are a flex column (`flex-none`, `flex-1 min-h-0`, `flex-none`), which is what `auto 1fr auto` drew; 60% is `max-h-3/5`, 40% is `w-2/5`.
- removed: apps/dashboard/src/lib/cawco/preview/map/MapThumb.svelte:64 `rect { vector-effect }` and `rect[data-state="empty"] { stroke-dasharray }` — SVG presentation attributes on the `<rect>` (`vector-effect`, and `stroke-dasharray` only while empty), so no `@utility` is needed for either.
- removed: apps/dashboard/src/lib/cawco/preview/map/MapCard.svelte:107 `box-shadow: inset 0 0 0 1px var(--brand-solid), var(--shadow-tile)` on chosen — `inset-ring-1 inset-ring-brand-solid` over the same `shadow-tile`; every state's shadow is now from utilities (delta R1).

## Tokens
none.

## Gaps
- gap: apps/dashboard/src/lib/cawco/preview/map/MapNode.svelte:16 xyflow's `style.css` is imported unlayered (CanvasMap.svelte:25), so it outranks every `@layer components` rule on its DOM (`.svelte-flow__handle`'s 6px size and border beat `theme: component map-handle`) — import it with `layer(...)` below `components` in app.css, which also fixes DecisionNode, TaskNode and the Workflow nodes' handle rules; until then the map's handles draw as xyflow's default dot. — DESIGN.md's one-cascade rule (a state is an attribute, a class is a style; no unlayered sheet beats the utilities).

## fixed
- fixed: apps/dashboard/src/lib/cawco/preview/SheetInspector.svelte:198 aside's rows were a grid template held in a custom property; head, body and foot are a flex column now — Layout (the sheet recipe: head and foot take their own height, the body scrolls).
- fixed: apps/dashboard/src/lib/cawco/preview/map/MapCard.svelte:81 the live frame's inline `block-size` / `inline-size` / `scale` are custom properties read by `h-` / `w-` / `scale-` utilities — styling through classes, dynamic values through custom properties.

## Interface-craft critique (Design Critique, from markup and classes, against DESIGN.md)
- fixed: MapCard's name, file and counts keep their roles (`type-label` ink-strong, `type-meta` ink-muted), the file and name truncate with `min-w-0`, and the counts carry `num`.
- fixed: MapCard's chosen edge, the press target (button stretched by `after:`), the hover (`enabled:aria-pressed-false:hover:`) and the disabled cursor are attributes and variants, none a class.
- fixed: the map's "wait" line shows nothing until `--dur-wait-grace`, then fades in over `--dur-fade` under `motion-safe:`, as the Real Wait Rule asks; under reduced motion it appears at once after the grace.

## cross-file hook
none (MapCard, MapNode and MapThumb keep their existing `data-slot`s; no class another file selects was removed).

## Behaviour notes for integration's compare
- `.narrow-sense` reads `@max-phone:` (container width < 640px), the same line the head uses.
- `max-h-3/5`, `w-2/5`: Tailwind's fractions are percentages of the containing block, as the 60% and 40% were.
- MapCard's root now ends with `cn(…, className)`: tailwind-merge drops `w-c-map-node-w` where the list passes `w-auto`.
