# Lane S21-ui-icons

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| icons/CloseBack.svelte | stroke, origin, translate/rotate (per state), transition | 0/0/0/6/1 | 12px, 15px, 9px | none | none |
| ui/button/pending-content.svelte | ring arc, arrivals, text, words, label, reason | 0/0/0/0/2 | 32ch | none | none |
| ui/machine-row/machine-row.svelte | tile, text, name, meta, line, dot | no style | 26px, 6px (gap), 6px (dot) | none | none |
| ui/markdown/markdown.svelte | `.md` display | 0/3/0/0/0 | none | none | none |
| ui/morph-text/morph-text.svelte | wrap, letters box, said | 0/4/0/0/1 | -100vw | none | none |
| ui/section-header/section-header.svelte | head, left, svg, label | no style | 8px (x2) | none | none |
| ui/sheet/sheet-content.svelte | pointer-events, `--sheet-away` | 8/2/0/0/0 | none | none | none |
| ui/sonner/sonner.svelte | toast-home, toast-layer | 0/26/0/0/0 | 12px | `(max-width: 640px)` residual kept as written | none |
| ui/thinking-indicator/thinking-indicator.svelte | indicator, mark, svg, labels, word, shimmer | 22/0/0/0/2 | 16px, 20px, 300% | none | none |
| ui/thinking-steps/thinking-step.svelte | step, icon column, icon, glyph, dot, connector, copy, label, description | 5/10/0/0/4 | 15px, 16px | none | none |
| ui/thinking-steps/thinking-steps-content.svelte | none (dead class dropped) | no style | none | none | none |
| ui/thinking-steps/thinking-steps-header.svelte | header, chevron | 0/0/4/0/1 | 26px, -9px | `(pointer: coarse)` kept | see below |
| ui/thinking-steps/thinking-steps.svelte | root | 0/0/0/0/1 | none | none | none |

Totals: keyframes 35, foreign-dom 45, pseudo 4, svg-paint 6, unmapped 12.

## Kind-5 declarations (verbatim)
- CloseBack: `transform-box: view-box`
- pending-content: `transform-box: view-box`; `filter: blur(2px)`
- morph-text: `clip-path: inset(50%)`
- thinking-indicator: `font-family: inherit`; `mask-image: linear-gradient(90deg, transparent 35%, var(--mask-opaque) 50%, transparent 65%)`
- thinking-step: `border-radius: 50%`; `background: linear-gradient(90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100%)`; `background-size: 300% 100%`; `background-clip: text`
- thinking-steps-header: `font: inherit`
- thinking-steps: `font-family: inherit`

## Needs variant / needs transition token
none.

## shadcn/no-restyle hits
none (rule off under ui/**; icons/CloseBack has none).

## shadcn variant lines
none.

## Decisions to review
- thinking-indicator.svelte: the sheen mask's `#000` is now `var(--mask-opaque)` (delta O1).
- CloseBack.svelte: transform became individual `translate`/`rotate` (same matrix); its transition list names `translate` instead of `transform`.
- thinking-steps-header.svelte: `style="--header-min: 26px; --hit-reach: -9px"` is on the bits-ui component (style: directives do not work on components).
- sheet-content.svelte: `style:pointer-events` became `data-is-shut` + `pointer-events-auto data-is-shut:pointer-events-none`; per-side `--sheet-away` is now `style:--sheet-away` on the drawn div.
- Sheet/CloseBack/thinking-step selectors that were component-local classes now use `data-*` / `data-slot` hooks (`data-shimmer`, `data-enters`, `data-mark`, `data-slot="word|sheen|sheen-word|ring-arc|words|letters|said|dot|toast-layer"`).

## Delta O lines
- cross-file hook: thinking-steps-header.svelte:20 .thinking-header → [data-slot="thinking-steps-header"]; selected by transcript/Thinking.svelte:239
- needs colour token: --mask-opaque: #000 (thinking-indicator.svelte:141)

## Delta R lines
R2 fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:20
(R1: machine-row's tile takes every box-shadow state from utilities; sonner's box-shadow is one residual state. R3: the only mono family, thinking-step's, is on `<code>` inside a residual.)

## Contracts
(none)
