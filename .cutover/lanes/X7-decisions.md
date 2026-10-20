# X7-decisions: decision pages on the design system

start: 61138f3b4 (X1's shared option on cawco/cutover-wave3-base 0f64468e1).

## Pipeline
- fixed: the host's sheet is `apps/dashboard/src/lib/cawco/decisions/host/host.css`: `@import "tailwindcss" source(none)`, the shared design layer (`apps/dashboard/src/design.css`, factored out of app.css; app.css imports it) and one `@source` per part the host imports. core `decision-host.ts` compiles it with `@tailwindcss/postcss` 4.3.3 (pinned with `tailwindcss` 4.3.3 and `postcss` 8.5.30 in packages/core) before Lightning CSS, and serves it as `/__cawco/decision/host.css`. host.ts injects the faces only, never page.css or the kit's tokens.css.
- fixed: one guard, core `css-layers.ts` `unlayeredRules`, holds the dashboard's assets (vite.config.ts) and host.css; the host build prints `css layers: host.css, 0 unlayered rules`.
- fixed: bits-ui's own component sheets, reached through the kit's checkbox, go into the `vendor` layer of host.css, as the dashboard's build puts them; DialKit's dials.css is served in `@layer vendor`.
- fixed: the kit's icons in the host build: unplugin-icons 24.0.0's own runes component compiled to JS (its custom `compiler`), its Svelte imports resolved to the host's runtime, its Bun adapter's catch-all `onResolve`/`onLoad` narrowed to `~icons/` ids (Bun 1.4.3 panicked, "index out of bounds: the len is 0 but the index is 0", once that `onLoad` met a `.webp` loaded as a file). Vite's `?raw` (lib/utils.ts) read by Bun's text loader.
- fixed: the standalone binary leaves postcss, @tailwindcss/postcss and unplugin-icons external (build-binary.ts): it carries the host prebuilt.
- fixed: page.css keeps only the HTML route's rules; every rule only the program host used is deleted (pick, flight, Continue, coral/quiet, slot, body, option cell, live region), each selector's grep across page.html, page.js, RECIPES.md and CONTRACT.md 0.
- fixed: role-order.ts reads the house's `@utility` blocks from design.css (126; font shorthands `font-inherit, font-mono-meta`); style-residual-check.ts no longer skips the host; eslint.config.mjs's host override is gone but for Canvas's and Preview's measured `block-size`/`inline-size`.

## The design, item by item (reads: decision-embed, decision-pick, decision-pages)
- fixed: 1 frame: one centred column 920 (`c-decision-page-w`), 21 in at a desk and 14 under a finger, groups 18 apart, on `surface-recess`; read at all four legs (decision-embed "the page is one centred column").
- fixed: 2 hero: the page head, Caw at 40 in a mark cell beside the title in the title role, nothing else.
- fixed: 3 offline notice: the kit Alert, warning, with its glyph, under the hero.
- fixed: 4 card: raised, `--radius-panel` 16, the tile shadow, no border, 18/14 in, 11 decided; read (radius 16px, border 0px, fill = surface-raised, shadow = shadow-tile's layers).
- fixed: 5 head: the question in the title role, balanced, alone while open; decided, the chosen chip and Change (ghost sm) beside it, centred on its line, wrapping to a row of its own under a finger.
- fixed: 6 why: body, muted, `c-measure` 72ch, pretty.
- fixed: 7 media: equal columns at `@media-split` (640, the card body's container), else one column; 640 kept: the artifact panel is 320px to 45% of the page (545px beside a 228px rail at 1440, one column there); two columns stand from a 718px page, each well 314px and more.
- fixed: 8 options: X1's ui/option-group, each cell a 4-row subgrid (chip and badges, line as body, "Cost:" in meta muted, media), chips 30 with their tops and lines on one line across columns (read ≤0.5px), the line and cost labels of their chip.
- fixed: 9 decided line: the chosen chip carried whole by the flight (motion/share), on the fold's one clock (scrubbed 0/½/1 in decision-pick).
- fixed: 10 foot: sticky at the window's foot over `--page-inset-bottom`, panel material, the count in meta `.num` with a 120×4 bar (`brand-solid` on `surface-recess-deep`), Send the kit primary 36 / lg 44, its pending ending on its check; no "Sent." line.
- fixed: 11 note: behind "Add <note>" (ghost sm), folding into the kit Textarea with its "Note" label and Done, and back.
- fixed: 12 wells: `surface-well`, `border-well`, `rounded-well` 7, 11 in, the piece centred (read ≤0.5px); Pele drawn as written (`autoDirection: false`), scaled to the room and the 80vb cap, never under 10px words, past that sideways under the edge fade; Pele's variables and roles on `[data-slot=diagram]` (node raised, control edge, 8px, label 13/500 strong; edge 1px muted, its words 12px; cluster recess with a hairline, its title 13/500 muted), read in both themes; Canvas sized from its drawing's box; gone lines meta muted.
- fixed: 13 Row/Column 11 apart; 14 section heading label role, muted, no glyph, 25 above and 11 below.
- fixed: 15 Dials: inline in a well (dials.js `cawcoDialsIn`, DialKit's `mountControlRenderer`), DialKit's variables set to tokens in host.css, its sheet in `@layer vendor`; no floating panel.
- fixed: 16 the pick flow: B1's and round 2's motion as main has it; a keyboard's turn lands in one frame (the card's `data-instant` holds every transition under it).

## Findings (audit 682ede287)
- ask: views-decision-page (390, blocking: the project's bottom bar covers "Add a note…" and "I'm done picking") is DecisionPage.svelte's composer, X4's file. The host's own foot stands clear of a docked composer: sticky at `bottom: var(--page-inset-bottom)` (preview-overlay page.ts sets it), the page padded by the same.
- ask: decisions-page, decisions-rest, decisions-graph, views-decisions are DecisionsView/RecordCard/the graph, X4's.

## kit-swap
- kit-swap: apps/dashboard/src/lib/cawco/decisions/host/Decision.svelte (Continue) and Decisions.svelte (Send): `<Kbd>` inside a primary Button needs a keycap look on the coral (`on-action` at 20% over the fill, `on-action` ink, as the old page drew it), ui/kbd `look: "on-action"`.
- kit-swap: apps/dashboard/src/lib/cawco/decisions/host/Decisions.svelte (Send) and Decision.svelte (Continue) switch the kit Button between `outline` and `default` (one coral action at a time): its fill, edge and ink cross on the kit's 120ms, but its top highlight is `bg-action-surface`, a gradient image, which swaps at once. ui/button: the highlight on a layer of its own (`::before`) whose opacity crosses with the fill, as the old page drew it.
- kit-swap: the kit Textarea under a coarse pointer draws 41px for one line; The 44 Touch Rule wants its area 44px (`coarse:min-h-c-btn-h-lg`), ui/textarea. The note's own control a finger meets first ("Add a note") reaches 44 through touch-hit.

## corrected
- corrected: the decision card, DESIGN.md Cards ("the tile shadow … no border"): main drew `shadow-raised` and a hairline border → the tile shadow, no border.
- corrected: the page's ground, The Frame Recesses Rule: main drew `surface-page` → `surface-recess`.
- corrected: the decided card's "Not picked"/"Picked" state line, Text is Earned (rule 15): main drew a state word on every open card → an open card's head is its question alone.
- corrected: the "Sent." line, Buttons, Pending (L731): main wrote "Sent. Change anything and send again." beside Send → Send's own pending and check.
- corrected: Pele's coral accent, The Coral Is Where You Act Rule: main set `--pele-accent: --brand-solid` → `ink-strong`; its bold weights (700) → 500, The 500 Ceiling Rule.
- corrected: Dials floated over the page's foot (covering Send at 1440) → in a well under the media they tune.
- corrected: a wide `flowchart LR` was re-laid by Pele to 216×894 (`mount()`'s width as `maxWidth`, `autoDirection` below 640px) → drawn as written (`autoDirection: false`) and scaled to fit.
