# L05-kit-ui-5 (kit lane)

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before reporting, interface-craft and ui-observer.
better-ui rules followed: transitions, not keyframes, for interactive state (the chevron and the toggle transition; keyframes only for the once-per-breath loops); transition only what changes (`transition-[rotate]`, never `all`); gate motion behind reduced motion (every animation under `motion-safe:`); hover effects only on hover-capable pointers (the header's `[&:hover]` → the guarded `hover:`); press scale kept at the house 0.97 with a `:disabled` exclusion.
better-layout rules followed: a hit area never overlapping (the header's 44px target is the house touch-hit with its midpoint stops, none when disabled); plan for growth (the note's least height and ceiling, min-height not height); logical properties (`inset-inline`/`start-0`, `inline-size` in the theme utilities).

Started from f5c5024ab (cawco/cutover-merge). Six kit parts under
`apps/dashboard/src/lib/components/ui/`. No `<style>` is left in any of them.

| file | rules moved | residual counts (1/2/3/4/5) | literals | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| apps/dashboard/src/lib/components/ui/tabs/tabs.svelte | 0 (one arbitrary variant to the kit's `data-horizontal:`) | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/components/ui/textarea/textarea.svelte | 0 (arbitrary values to theme utilities; `note` look rebuilt on tokens) | 0/0/0/0/0 | 0 | none | none |
| apps/dashboard/src/lib/components/ui/thinking-indicator/thinking-indicator.svelte | 5 animation rules + 5 keyframes to theme animations; the sheen's width and mask to a theme utility | 0/0/0/0/0 (`<style>` deleted) | 0 (was 2 markers, 1 style-var) | none | none |
| apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte | 2 animation rules + 2 keyframes to theme animations; 9 foreign-dom rules to one theme utility | 0/0/0/0/0 (`<style>` deleted) | 0 (was 3 markers, 3 style-vars) | none | none |
| apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte | 1 pseudo rule to the house `touch-hit` | 0/0/0/0/0 (`<style>` deleted) | 0 (was 1 marker, inline style) | none | none |
| apps/dashboard/src/lib/components/ui/toggle/toggle.svelte | 0 (arbitrary values to theme utilities; 2 variant-order flags fixed) | 0/0/0/0/0 | 0 | none | none |

needs variant: none. needs transition token: none (the textarea's grow
transition is a theme utility below).

## Variants

The inventory's sites for this lane's parts: Tabs (1), Textarea (1). TabsList,
TabsContent and the rest are other lanes' parts.

variant: apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:354 Textarea look="note" — a note written straight into the docked composer, whose shell is the field (DESIGN.md Inputs and fields, Field shell): no edge, fill or shadow of its own, the composer field's least height, a 200px ceiling, space-2 block padding, ui leading, a one-line placeholder that truncates. Swap `class="note"` for `look="note"`; the site's `style:--note-max-h`, `style:--note-leading` and `style:--note-fs` (DecisionPage.svelte:347-349) then have no reader and go with it.
variant: apps/dashboard/src/lib/cawco/files/FilesList.svelte:438 Tabs none — placement only: `files-tabs` is `flex: 1; min-block-size: 0` (FilesList.svelte:811), a flex child filling the phone drawer. It stays the consumer's, as `flex-1 min-h-0` on the site; no variant.

K1/K2: this lane's list holds none of copy-button, input-group or
collapsible-trigger, so no carve-out variant falls here.
`thinking-steps-header` is bits-ui's Collapsible.Trigger directly, not the
kit's collapsible-trigger, and ns-theme.css's K1 does not select it.

## Variant-order flags fixed

fixed: apps/dashboard/src/lib/components/ui/toggle/toggle.svelte:6 `hover:bg-[var(--surface-hover)]` vs `aria-pressed:bg-[var(--surface-pressed)]` — the hover now yields: `not-aria-pressed:hover:bg-surface-hover`, so a pressed toggle keeps its pressed fill under the pointer (what the sort already picked, now stated).
fixed: apps/dashboard/src/lib/components/ui/toggle/toggle.svelte:6 `hover:` vs `data-[state=on]:bg-[var(--surface-pressed)]` — the `data-[state=on]` fill is removed (see Removed): bits-ui's Toggle sets `aria-pressed` and `data-state` from the same `pressed` (node_modules/bits-ui toggle.svelte.js:30-31), so one state, one utility.

shadcn variant: apps/dashboard/src/lib/components/ui/tabs/tabs.svelte:15 data-horizontal: flex-direction

## Theme additions

theme: utility transition-control-grow
```css
/* The textarea's control transition plus its height, which carries each new
   line (DESIGN.md Inputs and fields, Textarea: "a 120ms height transition"). */
@utility transition-control-grow {
  transition:
    var(--transition-control),
    height var(--dur-control) var(--ease-out);
}
```

theme: animate thinking-word
```css
/* Each of the indicator's four words holds for two breaths of an eight-breath
   cycle, rising 80% in and out (DESIGN.md Status displays, Thinking
   indicator). `--word-delay` is set per word by the indicator; `inline` so it
   resolves on the word, not on :root. */
@theme inline {
  --animate-thinking-word: thinking-word calc(var(--breath) * 8)
    var(--ease-out) var(--word-delay, 0s) infinite both;
  @keyframes thinking-word {
    0% {
      opacity: 0;
      transform: translateY(80%);
    }
    1.5%,
    25% {
      opacity: 1;
      transform: translateY(0);
    }
    26%,
    100% {
      opacity: 0;
      transform: translateY(-80%);
    }
  }
}
```

theme: animate thinking-circle
```css
/* The circle widens and flattens as it fades, twice a three-breath loop. */
@theme inline {
  --animate-thinking-circle: thinking-circle calc(var(--breath) * 3)
    var(--ease-in-out) infinite both;
  @keyframes thinking-circle {
    0%,
    50%,
    100% {
      opacity: 1;
      transform: none;
    }
    25%,
    75% {
      opacity: 0;
      transform: scale(1.15, 0.8);
    }
  }
}
```

theme: animate thinking-lemniscate
```css
/* The infinity settles out of a narrower, taller shape as it comes up. */
@theme inline {
  --animate-thinking-lemniscate: thinking-lemniscate calc(var(--breath) * 3)
    var(--ease-in-out) infinite both;
  @keyframes thinking-lemniscate {
    0%,
    50%,
    100% {
      opacity: 0;
      transform: scale(0.7, 1.1);
    }
    25%,
    75% {
      opacity: 1;
      transform: none;
    }
  }
}
```

theme: animate thinking-sheen
```css
/* The band of strong ink crosses a word once a breath: two words to the left. */
@theme inline {
  --animate-thinking-sheen: thinking-sheen var(--breath) var(--ease-in-out)
    infinite;
  @keyframes thinking-sheen {
    to {
      transform: translateX(-66.6667%);
    }
  }
}
```

theme: animate thinking-sheen-hold
```css
/* The word inside the band slides back two words on the same curve, so the
   letters stand still and only the light moves. */
@theme inline {
  --animate-thinking-sheen-hold: thinking-sheen-hold var(--breath)
    var(--ease-in-out) infinite;
  @keyframes thinking-sheen-hold {
    to {
      transform: translateX(200%);
    }
  }
}
```

theme: utility sheen-band
```css
/* The indicator's light: three words wide, ink-strong at its middle, fading
   to nothing 15% of its width either side. The 300% is the band's geometry,
   paired with thinking-sheen's -66.6667% and thinking-sheen-hold's 200%. */
@utility sheen-band {
  inline-size: 300%;
  mask-image: linear-gradient(
    90deg,
    transparent 35%,
    var(--mask-opaque) 50%,
    transparent 65%
  );
}
```

theme: animate thinking-step-in
```css
/* A new thinking step fades in (DESIGN.md Status displays, Thinking steps). */
@theme inline {
  --animate-thinking-step-in: thinking-step-in var(--dur-menu)
    var(--ease-out) backwards;
  @keyframes thinking-step-in {
    from {
      opacity: 0;
    }
  }
}
```

theme: animate step-shimmer
```css
/* An active step's words shimmer on --breath (DESIGN.md Thinking steps). */
@theme inline {
  --animate-step-shimmer: step-shimmer var(--breath) var(--ease-in-out)
    infinite;
  @keyframes step-shimmer {
    from {
      background-position: 0% 0;
    }
    to {
      background-position: 100% 0;
    }
  }
}
```

theme: utility step-shimmer
```css
/* The light over an active step's words: its muted ink, strong at the middle
   of a band three times the words' width, clipped to the text. The element
   sets its own ink transparent (text-transparent) beside it. */
@utility step-shimmer {
  background-image: linear-gradient(
    90deg,
    var(--ink-muted) 0% 35%,
    var(--ink-strong) 50%,
    var(--ink-muted) 65% 100%
  );
  background-size: 300% 100%;
  background-repeat: repeat;
  background-clip: text;
}
```

theme: utility markdown-plain
```css
/* Rendered markdown (ui/markdown, streamdown) that keeps the type of the text
   it stands in: prose-sm restates its own size and colour on its root, so
   they are handed back; block margins collapse, each block taking the gap
   above it and the first giving it back, so the block is exactly as tall as
   its text. A utility, not a components rule: @tailwindcss/typography writes
   `.prose` into the utilities layer (app.css:17, :2134), which a components
   rule cannot outrank; nested here each selector outranks the plugin's
   `:where()` rules by one class. Inline code's backticks are already off in
   PROSE (lib/prose.ts). */
@utility markdown-plain {
  & .prose {
    font-size: inherit;
    line-height: inherit;
    color: inherit;
  }
  & :is(p, ul, ol) {
    margin-block: 0;
  }
  & .prose > * {
    margin-block: var(--space-1) 0;
  }
  & .prose > :first-child {
    margin-block-start: 0;
  }
  & :is(ul, ol) {
    padding-inline-start: var(--space-5);
  }
  & strong {
    color: var(--ink-strong);
  }
  & code {
    font-family: var(--font-mono);
  }
}
```

Each block was compiled with the dashboard's Tailwind 4.3.3 (`@tailwindcss/node`
`compile` over app.css plus these blocks): every class this lane writes
generates, and the seven keyframes are emitted where their animation is used.

## Tokens

token: --c-note-max-h 200px — the docked composer note's grow ceiling (DecisionPage's note, main's `.cin .note { max-block-size: 200px }`); past it the textarea scrolls (DESIGN.md Inputs and fields, Textarea: "It scrolls past its ceiling"). A component dimension, far off the spacing ladder; no `--c-*` holds it. Read by textarea.svelte:20 as `max-h-(--c-note-max-h)`.

## Removed

removed: apps/dashboard/src/lib/components/ui/toggle/toggle.svelte:6 `data-[state=on]:bg-[var(--surface-pressed)]` — a duplicate of `aria-pressed:` on the same element: bits-ui sets both from one `pressed` value.
removed: apps/dashboard/src/lib/components/ui/textarea/textarea.svelte:20 `coarse:text-(length:--note-fs) max-phone:text-(length:--note-fs)` from the `note` look — dead: app.css's base layer floors every textarea at `max(16px, 1em) !important` under exactly `(width < 640px), (pointer: coarse)` (app.css:402-407), which no utility can beat; the look's own floor never applied.
removed: apps/dashboard/src/lib/components/ui/thinking-indicator/thinking-indicator.svelte:126 `shimmer` class on each word — on main it was the file's own scoped hook for the light; on the cutover tree it also matches app.css's global `@utility shimmer` (app.css:2802), which painted a second, 2s linear gradient band over the word and set `-webkit-text-fill-color: transparent`, inherited by the sheen's copy of the word. The light is the sheen alone (DESIGN.md: "Everything moves by transform and opacity on the compositor").
removed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte:132 and :149 `shimmer` class on an active label and description — the same collision: every background property and the animation the global utility set were overridden by this file's own data-shimmer rules, and its reduced-motion rule duplicated what `motion-safe:` already leaves plain.
removed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte (script) `const SHIMMER` and its `style:--step-shimmer` / `style:--step-shimmer-size="300% 100%"` on two spans — the gradient and its size live in the `step-shimmer` theme utility; the constant was only that style string.
removed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte (style) `code::before, code::after { content: none }` — a duplicate: PROSE (lib/prose.ts) already carries `[&_code]:before:content-none [&_code]:after:content-none`.
removed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:24 the coarse `::before` touch target (`inset-block: -9px; inset-inline: 0`) and `coarse:enabled:relative` — a per-component re-implementation of the house `.touch-hit` (app.css:430-447), which computes the same box for a 26px row (block `50% − 22px` = −9px, inline 0 past 44px wide) and sets the position itself. Its `:not(:disabled)` is kept as `disabled:after:content-none`.
removed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:34 `style:--chev-turn="rotate(90deg)"` and `transform-(--chev-turn)` — the chevron turns with `rotate-90` and transitions `rotate`.

## Fixed

fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte:95 icon column 15px → `basis-icon-md` (16px) — the column held the 16px icon cell (`w-icon-md`) and was 1px narrower than it; DESIGN.md Layout, Transcript columns: "a 16px glyph cell".
fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte:100 icon box least height `--icon-box: 16px` → `min-h-icon-md` (exact token).
fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte:112 the step dot's `50%` round → `rounded-pill` — DESIGN.md Shapes: a fully round shape for status dots.
fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:24 least height 26px → `min-h-(--tx-line)` (26px: "A transcript rail line's least height", tokens.css:884-885).
fixed: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:24 `[&:hover]:enabled:text-ink-strong` → `enabled:hover:text-ink-strong` — DESIGN.md Focus and hit areas, Hover only where it exists: the house `hover:` carries the `(hover: hover) and (pointer: fine)` guard, so a tap no longer leaves the header in the strong ink.
fixed: apps/dashboard/src/lib/components/ui/thinking-indicator/thinking-indicator.svelte:98 the mark's box `16px` / `20px` → `var(--icon-md)` / `var(--icon-lg)` (exact tokens; DESIGN.md: "two 20px marks").
fixed: apps/dashboard/src/lib/components/ui/textarea/textarea.svelte:20 the `note` look takes main's whole recipe on tokens: `min-h-c-composer-field` and `max-h-(--c-note-max-h)` (both were lost in the cutover, leaving the base 64px least height and no ceiling), `leading-ui` for the site's 1.25 (`--leading-ui: 1.25`).
fixed: apps/dashboard/src/lib/components/ui/textarea/textarea.svelte:50-53 `[transition:var(--transition-control)]`, `motion-safe:[transition:…height…]`, `border-[var(--border-control)]`, `bg-[var(--surface-raised)]`, `text-[var(--ink-strong)]` → `transition-control`, `motion-safe:transition-control-grow`, `border-border-control`, `bg-surface-raised`, `text-ink-strong` (same values).
fixed: apps/dashboard/src/lib/components/ui/toggle/toggle.svelte:6-18 `text-[var(--ink-strong)]`, `[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)]` (exactly `--transition-control-press`), `bg-[var(--surface-*)]`, `border-[var(--border-control)]`, `gap-1`, `size-4`, `h-9`/`h-6`/`h-[30px]`/`h-11` and their `min-w-*` → `text-ink-strong`, `transition-control-press`, `bg-surface-*`, `border-border-control`, `gap-space-1`, `size-icon-md`, `h-c-btn-h`/`-xs`/`-sm`/`-lg` (same values; DESIGN.md Buttons: 36, 24, 30, 44).
fixed: apps/dashboard/src/lib/components/ui/tabs/tabs.svelte:15 `data-[orientation=horizontal]:flex-col` → `data-horizontal:flex-col` (the kit's shadcn variant).

Kept as they are, by design: the toggle's press stays `[transform:scale(var(--press-scale))]`, as the Button's does, because `scale-(--press-scale)` writes the `scale` property, which `--transition-control-press` (a `transform` transition) would not ease. The kit's numeric paddings (`px-3`, `py-2`, `gap-2`, `pr-2.5` …) stay as written (delta C), so no part's default look moves.

## Gaps

gap: apps/dashboard/src/app.css:2783 the comment over `@utility shimmer` says it draws "the kit's thinking indicator's words and an active reasoning step's"; after this lane neither carries the class (SuggestionChips.svelte:318 is its one user). The comment, and whether the utility still belongs to the kit sheets, is the app.css owner's.
gap: apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:347-349 `style:--note-max-h="200px"`, `--note-leading="1.25"`, `--note-fs` — read by nothing once the site takes `look="note"`; the consumer lane or integration drops them with the swap (see Variants).
gap: apps/dashboard/src/lib/components/ui/thinking-steps/thinking-step.svelte:132 `transition-[color] dur-control ease-out` names one property; DESIGN.md's control transition is `transition-control` (background, border, colour). Only colour changes here, so it is left as written.

## Kit swaps

None in this lane's files: its parts render no kit part with a restyle.

## Contracts

None.

## Critique (interface-craft Design Critique, against DESIGN.md)

fixed: thinking indicator — one light, not two: the global shimmer band no longer paints over the sheen (see Removed), so the word is muted ink with one strong band crossing it on the compositor, as DESIGN.md Status displays says.
fixed: thinking step — the icon column matches its 16px cell, so the dot and glyph centre on the connector line instead of overhanging a 15px column by half a pixel each side.
fixed: thinking steps header — the chevron turns on `rotate` (compositor) over 120ms ease-out, under motion-safe; hover is pointer-only; the 44px finger target is the house one.
fixed: toggle — a pressed toggle holds its pressed fill under the pointer instead of the sort deciding it.
gap: no rendered check. Only `/motion/chosen-hover` renders one of these parts (Toggle, pressed and not); the thinking parts' animations exist only once integration adds the theme additions, so a render in this tree would not show them. ui-observer was not run, and the rendered layout is Not verified. The critique is from markup and classes, plus the compile of every class with the repo's Tailwind 4.3.3 (Theme additions). Integration's compare is the rendered check.
