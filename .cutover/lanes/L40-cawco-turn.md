# L40-cawco-turn

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev, interface-craft, ui-observer.
better-ui rules followed: transition only what changes (`transition-[opacity]`, `transition-[padding-block]`, the well's three named properties in one theme utility, never `all`); gate motion behind the reduced-motion preference (the well's transitions and the check's draw are `motion-safe:`, the cell swap is `motion-safe:` scale-in with a `motion-reduce:` opacity cross-fade); outer radius from the token (`rounded-well-r`); hover only on hover-capable pointers (`group-hover/turn:` is the kit variant that carries the guard).
better-layout rules followed: logical properties for anything that mirrors (`text-start` for `text-left`, `inset-bs`, `border-bs`, `rounded-ss/se/es/ee`, Caw's `inset-inline-start` for `left`); plan for growth (error text `max-h` with `overflow-auto`, `wrap-anywhere`; chips wrap); align to shared edges (the well's pseudo surface and hairline share the one pixel row above a part).

Started from 9ec5a3111. The motion here is token-timed and only moved from `<style>` to theme animations; no new motion was designed (emil: no scale from 0, ease-out, under 300ms; transitions.dev: exact properties, no `all`).

| file | rules moved | residual counts (1/2/3/4/5) | literals | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| apps/dashboard/src/lib/cawco/turn/Well.svelte | 13 (::before 9 + ::after 4 states) to `before:`/`after:` utilities; 2 foreign-dom to a theme component | 0/0/0/0/0 (`<style>` deleted) | 0 (the `calc(space-2 + 1px)` padding var removed) | none | none |
| apps/dashboard/src/lib/cawco/turn/Who.svelte | 1 foreign-dom to a theme component | 0/0/0/0/0 (`<style>` deleted) | 0 (was 1 marker + `9ch` var) | none | none |
| apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte | 5 svg-paint to SVG attributes, 1 keyframes to a theme animation | 0/0/0/0/0 (`<style>` deleted) | 0 (was 2 markers) | none | none |
| apps/dashboard/src/lib/cawco/updates/ReleaseNotes.svelte | 5 foreign-dom + 1 pseudo to a theme component | 0/0/0/0/0 (`<style>` deleted) | 0 (was 1 marker) | none | none |
| apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte | 2 animations + 2 keyframes to theme animations | 0/0/0/0/0 (`<style>` deleted) | 0 (was 1 marker) | none | none |
| apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte | 0 (no `<style>`); 2 markers cleared | 0/0/0/0/0 | 0 (was 2 markers) | `max-phone:` (the 640px edge, unchanged) | none |

needs variant: none beyond the kit-swap lines below. needs transition token: none (the well's three-duration transition is the theme utility `transition-well-surface`).

## Theme additions

theme: utility transition-well-surface
```css
@utility transition-well-surface {
  transition:
    border-color var(--dur-pop) var(--ease-out),
    border-radius var(--dur-pop) var(--ease-out),
    opacity var(--dur-panel) var(--ease-drawer);
}
```

theme: variant theme-flip
```css
/* A theme switch is one cross-fade of the whole page (theme.svelte.ts); app.css stops element transitions under it and names pseudo-elements where they are styled. */
@custom-variant theme-flip (:root.theme-flip &);
```

theme: animate check-draw
```css
@theme {
  --animate-check-draw: check-draw var(--dur-toggle) var(--ease-out) var(--dur-ghost) both;
  @keyframes check-draw {
    from {
      stroke-dashoffset: 12;
    }
  }
}
```

theme: animate cell-swap
```css
@theme {
  --animate-cell-swap: cell-swap var(--dur-control) var(--ease-out);
  @keyframes cell-swap {
    from {
      opacity: 0;
      scale: var(--pop-scale);
    }
  }
}
```

theme: animate cell-fade
```css
@theme {
  --animate-cell-fade: cell-fade var(--dur-control) var(--ease-out);
  @keyframes cell-fade {
    from {
      opacity: 0;
    }
  }
}
```

theme: utility grid-cols-fill-auto
```css
@utility grid-cols-fill-auto {
  grid-template-columns: minmax(0, 1fr) auto;
}
```

theme: component well-msg
```css
@layer components {
  /* The words run to the well's edge, not the prose measure. */
  [data-slot="well"] [data-slot="msg"] {
    max-inline-size: none;
  }
  /* The well is the deepest step, so a code span lifts to the raised surface instead of vanishing into it. */
  [data-slot="well"] [data-slot="msg"] code {
    background: var(--surface-raised);
  }
}
```

theme: component turn-face
```css
@layer components {
  /* A pane's own face (a snippet Who does not render) sits in the mark's box at the icon step. */
  [data-slot="dot"][data-face] svg {
    display: block;
    inline-size: var(--icon-sm);
    block-size: var(--icon-sm);
  }
}
```

theme: component release-notes
```css
@layer components {
  /* Prose's own scale is for a document; notes sit inside a toast or a card and take that surface's type, so the prose inherits it and keeps only its structure. */
  [data-slot="release-notes"] .prose {
    font: inherit;
    color: inherit;
  }
  [data-slot="release-notes"] p {
    margin: 0;
  }
  [data-slot="release-notes"] ul {
    display: grid;
    gap: var(--space-row);
    margin: 0;
    padding-inline-start: var(--space-4);
    list-style: disc;
  }
  [data-slot="release-notes"] li {
    margin: 0;
    padding: 0;
    overflow-wrap: anywhere;
  }
  [data-slot="release-notes"] li::marker {
    color: var(--ink-muted);
  }
}
```

## Tokens

token: --c-turn-clock-w 9ch — the room a grouped turn's floated clock (or note) keeps at the end of its first line, so the line's wrap does not move when the clock shows; a `ch` measure, no ladder step; read as `data-grouped:min-w-c-turn-clock-w` (Who.svelte:79).
token: --c-update-said-h 10rem — the cap on a machine's whole update error unfolded under its cell; scrolls past it; a `rem` height so it follows the reader's text size, no ladder step; read as `max-h-c-update-said-h` (UpdateCell.svelte:116).

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:52 Badge `h-auto whitespace-normal text-start` (the `CHIP` const, line 33) — a `wrap` look for `size="cell-tall"`: a cell chip whose words wrap and start-align instead of holding one line at the icon height
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:47 Spinner `size-icon-md` — done (the kit's default is `size-icon-md`; dropped, `shrink-0` stays)
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:43 Table `border-collapse text-start max-phone:block` — a `layout="matrix"` that collapses borders, starts text at the inline start and is a block under 640px
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:44 TableHeader `max-phone:hidden` — a header hidden under 640px (the matrix layout above)
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:46 TableRow `align-top max-phone:grid max-phone:grid-cols-fill-auto max-phone:items-center` — `stacks-ruled` as a two-line phone card (grid of one flexible track then one auto track, centred), top-aligned at a desk
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:67 TableRow `max-phone:grid max-phone:grid-cols-fill-auto max-phone:items-center` — the same phone card for a body row
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:50 TableHead `h-auto` — the matrix heads take their content height (also :53, :56, :74)
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableBody `max-phone:block` — a block body under 640px (the matrix layout above)
kit-swap: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:113 TableCell `whitespace-normal max-phone:col-span-full` — `matrix-stacks-under` whose words wrap and which spans the card's row under 640px

## Removed

removed: apps/dashboard/src/lib/cawco/turn/Well.svelte:49 `--well-pad-block: calc(var(--space-2) + 1px)` and `not-data-lifted:data-grouped:pbs-space-2` — the +1px was a nudge compensating for the pseudo edge; the part's block padding is the ladder step `py-space-2` and a grouped part has the same padding, so the override was a duplicate
removed: apps/dashboard/src/lib/cawco/turn/Well.svelte (style block) `transition: none !important` for `:root.theme-flip` on the pseudo-elements — the `!important` fought the pseudo's own transition by specificity; the `theme-flip:` variant has the higher specificity without it
removed: apps/dashboard/src/lib/cawco/turn/Well.svelte (style block) `data-lifted:pbs-0` — duplicate of `data-lifted:py-0`
removed: apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:116 `mx-0 mb-0` on the error `<pre>` — Preflight already sets `pre { margin: 0 }`
removed: apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte (style block) `stroke-dashoffset: 0` as a CSS rule — kept as the SVG attribute only because the draw keyframe animates from 12 to it

## Fixed

fixed: apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte:189 Caw's picture origin `50% 56.84%` measured by hand is now `50% var(--caw-peek-rise)` (91px of the 160px box = 56.875%, the card's top edge) — DESIGN.md, Channel cards: his box stands on the card's top edge
fixed: apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte:183 Caw's `style:left` is `style:inset-inline-start` — under RTL the cards flip with the grid and a physical `left` put him over the wrong card (logical properties, DESIGN.md Layout)
fixed: apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte:135 the check's `gap-(--gap)` literal 8px is `gap-space-2` (ladder 7)
fixed: apps/dashboard/src/lib/cawco/updates/ReleaseNotes.svelte:66 the label's `6px` side padding is `px-space-2` (ladder 7), DESIGN.md Badges: the badge recipe on the ladder
fixed: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:89 the machine's presence dot was `size-2 rounded-full bg-success-9 | bg-ink-muted/40`; it is `size-(--status-dot-size) rounded-pill bg-presence-online | bg-presence-off` — DESIGN.md Machine row: a 6px presence dot, green online, neutral-8 off
fixed: apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:58 the failure dot `size-2 rounded-full` is `size-(--status-dot-size) rounded-pill` (6px dot, pill radius)
fixed: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:41 the matrix's `shadow-(--matrix-ring)` literal inset ring is Tailwind's `inset-ring inset-ring-border-hairline`
fixed: apps/dashboard/src/lib/cawco/turn/Who.svelte:130 `group-[:hover]/turn:` is `group-hover/turn:` (the hover variant carries the hover-capable guard; no arbitrary selector)
fixed: apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:43 `text-left` is `text-start` (mirrors under RTL)
fixed: apps/dashboard/src/lib/cawco/updates/ChannelCards.svelte:151 the check's `stroke-linecap`, `stroke-linejoin`, `stroke-width`, `stroke-dasharray` are SVG presentation attributes, not a `<style>` block

## Contracts

(none)

## Gaps

gap: apps/dashboard/src/lib/components/ui/badge/badge.svelte:6 needs a `note` tone (`note-new|improved|fixed` ink on fill) and an `as="h3"` element; ReleaseNotes.svelte:64 then swaps its hand-built heading label for it — DESIGN.md Badges and state chips
gap: apps/dashboard/src/lib/components/ui/markdown/markdown.svelte:249 takes no `class` for its root, so ReleaseNotes.svelte:80's prose reset lives in the `release-notes` theme component instead of utilities on the Markdown — DESIGN.md Typography (prose inherits the surface's type)
gap: apps/dashboard/src/app.css:2658 `--pad` is set there for the transcript turn, and Well.svelte:49 reads it (`px-(--pad)`, `after:inset-x-(--pad)`); the well's box depends on a custom property from another file — DESIGN.md Transcript columns

## Cross-file hooks and checks

cross-file hook: none.
shadcn/no-restyle hits: the kit-swap lines above (Badge UpdateCell.svelte:52; Table 43, TableHeader 44, TableRow 46/67, TableHead 50/53/56/74, TableBody 62, TableCell 114 in UpdateTable.svelte).
shadcn variant: none.
important kept: none.
shadow kept residual: none.
UI critique (interface-craft, from markup and classes against DESIGN.md): the well keeps one box for every part and paints only its edge (Shapes: Concentric Rule held by the token radius); the channel pair's frame and Caw ride the existing tokens; the update cell's swap keeps the Steady Swap Rule. ui-observer: Not verified (no bench or stories file renders these in this workspace; no browser was run).
