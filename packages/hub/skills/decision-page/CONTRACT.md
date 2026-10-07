# Mockup contract

A mockup is a small animated picture of one option, placed in a card with `{{MK:<id>}}`. The reader is visual: the mockup explains the idea at a glance with almost no text.

## The fragment

`mockups/<id>.html` holds exactly, in order:

1. one `<style>` block whose every selector starts with `.mk-<id>` (no bare element selectors, no `:root`, no `body`);
2. one root `<div class="mk mk-<id>">…</div>`;
3. optionally one `<script>` with a single IIFE that finds its root with `document.querySelector(".mk-<id>")`, returns when it is missing, and declares no globals.

Prefix every inner class with a two-letter prefix of the mockup's own (`ld-row`, `ld-card`): the page styles `dp-*` and its own names globally. No external resources: no fonts, scripts or URLs. Images are Caw stills, always as a light/dark pair: `<img class="caw-l" src="caw/light-ready.webp" alt="" width="24" height="24"><img class="caw-d" src="caw/dark-ready.webp" alt="" width="24" height="24">`, with `ready`, `working`, `needs-you`, `done`, `trying` or `idle`; or images in the work folder, which the hub inlines when it builds the page.

## Design

CawCo's tokens only (`kit/tokens.css`, from DESIGN.md): `--surface-page`, `--surface-raised`, `--surface-recess`, `--border-hairline`, `--border-control`, `--ink-strong`, `--ink-muted`; coral for "you" and the thing you act on: `--brand-solid`, `--brand-ink`, `--brand-wash`, `--selected-bg`; status pairs that mean status only: `--status-done-bg/-ink`, `--status-attn-bg/-ink`, `--status-fail-bg/-ink`. Type `--font-sans`, `--font-mono` (ids, paths, times, numbers), sizes `--text-meta`, `--text-label`, `--text-body`; radii `--radius-sm`, `--radius-md`, `--radius-lg`; spacing `--space-1` … `--space-8`; motion `--dur-control`, `--ease-out`. A value the tokens lack is a token to add to `design/tokens/cawco.tokens.json` first.

Content is real-looking: repo `github.com/you/site`, projects `site` and `launch-q4`, machines `obelisk` and `macbook`, task ids like `tsk-142`, times like `08:55`. Copy is calm, short and sentence case; buttons are verb + object.

## Layout

Fluid: fills its container and reads right from 300px to 560px wide, 220–420px tall at 560px. Nothing scrolls the page sideways; a wide piece wraps or scrolls inside its own `overflow-x: auto` box. Flex and grid children holding text get `min-width: 0`.

## Motion

The page adds `is-live` to the root while it is on screen and dispatches `mk:live` / `mk:idle` on it. Animate only under `.mk-<id>.is-live`; JS timers start on `mk:live` (or at once when the root already has `is-live`) and stop on `mk:idle`. The resting state is complete and readable: animate from a visible state (a highlight that travels, a card that slides and returns, a counter that ticks). One motion that shows the idea, a 4–10 second loop, eased with `--ease-out`. Under `prefers-reduced-motion: reduce`, nothing moves.

## Accessibility

A purely illustrative mockup: `role="img"` on the root with an `aria-label` stating the idea in one sentence, inner controls `aria-hidden="true"` and `tabindex="-1"`. An interactive one: real buttons with a visible focus ring (`outline: 2px solid var(--focus-ring)`), no `role="img"`.

## Check

`node <skill>/scripts/preview.mjs <work folder> <id>` renders the mockup in the kit's CSS, light at 1000px and dark at 360px, into `<work folder>/out/`, and prints overflow and script errors. Look at both images, fix, and run once more with `--reduced` for the still state; two rounds per mockup at most.
