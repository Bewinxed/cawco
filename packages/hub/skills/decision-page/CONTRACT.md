# Mockup contract

A mockup is a small, animated picture of how one option would look, shown on its decision card beside the words ("How it would look"). The reader is visual: a mockup explains the option at a glance, with almost no text. Every mockup follows these rules, so any of them can sit on any page and the page stays one design.

## Files
- One mockup per file: `mockups/<id>.html` in the page's folder (`<id>`: lowercase letters, digits, dashes). The template places it with `{{MK:<id>}}`.
- A fragment contains exactly, in this order:
  1. one `<style>` block, every selector starting with `.mk-<id>` (no bare element selectors, no `:root`, no `body`);
  2. one root element `<div class="mk mk-<id>" ...>...</div>`;
  3. optionally one `<script>` holding a single IIFE that finds its root with `document.querySelector('.mk-<id>')`, returns if it is missing, and declares no globals.
- No external resources: no fonts, images, scripts or URLs. Caw stills come in through `{{CAW:<still>}}` (below), which build.py turns into data URIs.

## Design system (these, nothing else)
Colour tokens, defined for light and dark in base.css: `--bg` page, `--raised` card, `--recess` inset, `--line`, `--line-strong`, `--ink` text, `--muted` secondary text, `--coral` (action, you, selected), `--coral-ink` (coral text), `--coral-wash` (coral background tint), status pairs `--ok-ink/--ok-wash`, `--warn-ink/--warn-wash`, `--err-ink/--err-wash`. They are CawCo's DESIGN.md values.
- Never write a literal colour. Status colours mean status only (done = ok, waiting on you = warn, failed = err). Coral means "you" or "the thing you act on". No other hues.
- Fonts: `var(--f-body)` (Figtree), `var(--f-mono)` (JetBrains Mono: ids, paths, times, numbers). Radii: `var(--r-card)` 12px, `var(--r-tray)` 18px. Inside mockups use 11 to 13.5px text. Weights 400 and 500 only.
- Shared classes in base.css: `.mkf` (window frame) > `.mkf-bar` (32px title bar; `<b>Title</b>` and muted context; `.sp` is a spacer) + `.mkf-body`; `.mkphone` > `.mkphone-screen` (phone frame); `.mkchip` with `.code` (dashed: done by code), `.model` (solid ink: done by a model), `.you` (coral), `.ok`, `.warn`, `.err`; `.mkdot` (+ `.live`, `.you`); `.btn`.
- Caw, CawCo's mascot and the project lead's avatar, always as a light and dark pair: `<img class="caw-l" src="{{CAW:light-ready}}" alt="" width="24" height="24"><img class="caw-d" src="{{CAW:dark-ready}}" alt="" width="24" height="24">`, stills `ready, working, needs-you, done, trying, idle`.

## Class names
base.css styles many bare names (`.row`, `.box`, `.node`, `.edge`, `.col`, `.state`, `.tag`, `.cap`, `.pane`, `.show`, `.note`, `.chip`, `.tile`, `.opt`, `.dec`, `.st`, `.who` and more). Prefix every inner class with two letters unique to the mockup (`ex-row`, `ex-card`) so nothing on the page restyles it.

## Layout
- Fluid width, right from 300px to 560px. No horizontal page scroll: wide things wrap or scroll inside their own `overflow-x:auto` box. Flex and grid children holding text get `min-width:0`.
- Height 220 to 420px at 560px wide. Small is good.
- Real-looking content from the project itself, never lorem ipsum.
- Copy: calm, short, sentence case, no exclamation marks, no emoji, no jokes. Buttons are verb + object ("Approve", "Open PR").

## Motion
- The page adds `is-live` to the root while it is on screen and dispatches `mk:live` / `mk:idle` on it. Animate only under `.mk-<id>.is-live`. Timers start on `mk:live` (or at once if `is-live` is already there) and stop on `mk:idle`.
- The resting state (no `is-live`) is complete: everything readable, nothing at opacity 0 waiting to appear. Animate from a visible state.
- Loops of 4 to 10 seconds, eased (`cubic-bezier(.2,.8,.2,1)` or ease-in-out), subtle. One motion per mockup, the one that shows the idea.
- `@media (prefers-reduced-motion: reduce)` in the style block: no movement (fades allowed).
- No `setInterval` running while idle; no layout thrash.

## Accessibility
- An illustration: root `role="img"` with an `aria-label` stating the idea in one sentence; inner controls `aria-hidden="true"` / `tabindex="-1"`.
- Genuinely interactive (tabs, toggles): real buttons with a visible focus ring (`outline:2px solid var(--coral)`), and no `role="img"`.
- A mockup is never a choice itself: choices are the card's `.opt` buttons (RECIPES.md).

## Check
`node <skill>/preview.mjs <page folder> <id>` renders the fragment in base.css at 1000px light and 360px dark, writes PNGs to `<page folder>/out/`, and prints overflow and script errors. Look at both; fix what is broken; run once more with `--reduced` to see the still state. Twice per mockup at most.
