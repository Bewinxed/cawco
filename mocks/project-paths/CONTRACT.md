# Mockup fragment contract

You are building small, animated UI mockups that go inside a research page for CawCo, a self-hosted control plane for AI coding agents (it runs Claude Code, OpenCode and pi sessions across the operator's machines). The page already exists and has its own design system. Your fragments will be pasted into it. The reader is a very visual person: the mockup must explain the idea at a glance, with almost no text.

## Files
- Write each mockup to `mockups/<id>.html` in this folder.
- A fragment contains exactly, in this order:
  1. one `<style>` block — every selector starts with `.mk-<id>` (no bare element selectors, no `:root`, no `body`);
  2. one root element `<div class="mk mk-<id>" ...>...</div>`;
  3. optionally one `<script>` holding a single IIFE that finds its root with `document.querySelector('.mk-<id>')`, returns if it is missing, and declares no globals.
- No external resources at all: no fonts, images, scripts or URLs, except the Caw stills listed below.

## Design system (use these, nothing else)
Colour tokens (already defined for light and dark): `--bg` page, `--raised` card, `--recess` inset, `--line`, `--line-strong`, `--ink` text, `--muted` secondary text, `--coral` (action / you / selected), `--coral-ink` (coral text), `--coral-wash` (coral background tint), status pairs `--ok-ink/--ok-wash`, `--warn-ink/--warn-wash`, `--err-ink/--err-wash`.
- Never write a literal colour. Status colours mean status only (done = ok, waiting on you = warn or coral, failed = err). Coral means "you" or "the thing you act on". No other hues.
- Fonts: `var(--f-body)` (Figtree), `var(--f-mono)` (JetBrains Mono, for ids, paths, times, numbers). Radii: `var(--r-card)` 12px, `var(--r-tray)` 18px. Base text is 15px; inside mockups use 11–13.5px.
- Shared classes you may use (already in base.css): `.mkf` (window frame) > `.mkf-bar` (32px title bar; put `<b>Title</b>` and muted context in it; `.sp` is a flex spacer) + `.mkf-body` (12px padding, column gap 8px); `.mkphone` > `.mkphone-screen` (phone frame); `.mkchip` with modifiers `.code` (dashed = done by code), `.model` (solid ink border = done by a model), `.you` (coral), `.ok`, `.warn`, `.err`; `.mkdot` (+ `.live`, `.you`); `.btn` (a button).
- The page's diagram key, which your mockups should echo where relevant: dashed border = code, solid ink border = a model, coral = you.
- Caw (the mascot, a small round fluffy crow) stills, relative paths that work on the page: `caw/light-<s>.webp` and `caw/dark-<s>.webp` for s in `ready, working, needs-you, done, trying, idle`. Always render them as a pair: `<img class="caw-l" src="caw/light-ready.webp" alt="" width="24" height="24"><img class="caw-d" src="caw/dark-ready.webp" alt="" width="24" height="24">` (the page shows the right one per theme). Caw is the project lead's avatar.

## Layout rules
- Fluid width: fills its container (100%), must look right from 300px to 560px wide. No horizontal scrolling of the page; if something is wide, it wraps or scrolls inside its own `overflow-x:auto` box. Give flex/grid children that hold text `min-width:0`.
- Height: aim for 220–420px at 560px wide. Small is good.
- Real-looking content, never lorem ipsum: repo `github.com/you/site`, projects `site` and `launch-q4`, machines `obelisk` and `macbook`, harnesses Claude Code / OpenCode / pi, delegate types `medium` and `deep`, workspace ids like `ws-4f2a`, task ids like `tsk-142`, GitHub issue numbers like `#142`, times like `08:55`.
- Copy: calm, short, sentence case, no exclamation marks, no emoji, no jokes. Buttons are verb + object ("Approve", "Open PR", "Run now").

## Motion rules (important)
- The page adds the class `is-live` to your root while it is on screen and removes it when it scrolls away, and dispatches `mk:live` / `mk:idle` events on the root. Run animations only under `.mk-<id>.is-live ...`. JS timers must start on `mk:live` and stop on `mk:idle` (also start immediately if the root already has `is-live`).
- The resting state (no `is-live`) must be complete and meaningful: everything readable, nothing at opacity 0 waiting to appear. Animate FROM a visible state (e.g. a highlight that travels, a card that slides between columns and back, a counter that ticks, a row that pulses in on a loop).
- Loops of 4–10 seconds, eased (`ease-in-out` / `cubic-bezier(.2,.8,.2,1)`), subtle. One clear motion per mockup that demonstrates the idea, not decoration.
- `@media (prefers-reduced-motion: reduce)` inside your style block: no movement at all (static resting state; fades allowed).
- No `setInterval` that runs while idle. No layout thrash.
- Accessibility: if the mockup is purely illustrative, give the root `role="img"` and an `aria-label` that states the idea in one sentence, and mark inner controls `aria-hidden="true"` / `tabindex="-1"`. If it is genuinely interactive (tabs, toggles), use real buttons with visible focus (`outline:2px solid var(--coral)`), and no `role="img"`.

## Check your work
Run `bun mocks/project-paths/preview.mjs <id>`. It renders the fragment inside the page's real CSS at 1000px light and 360px dark, writes PNG screenshots next to the fragment, and prints overflow and script errors. Look at both screenshots with the Read tool. Fix what is broken, then run it once more with `--reduced` to confirm the still state is complete. Do not loop more than twice per mockup.

## Report
When done, reply with: the list of files written, one line per mockup describing what it shows and what animates, and anything you could not do.

## Class names (added after the first round)
The host page styles many bare class names globally (`.row`, `.box`, `.node`, `.edge`, `.col`, `.loop`, `.state`, `.tag`, `.cap`, `.pane`, `.show`, `.hero`, `.ring`, `.gl`, `.n`, `.ph`, `.note`, `.chip`, `.tile`, `.opt`, `.dec`, `.st`, `.ac`, `.who`, `.grp` and more). Prefix every inner class with a two-letter prefix unique to your mockup (e.g. `xs-row`, `xs-card`), so nothing on the page restyles your mockup.
