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
