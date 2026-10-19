# Lane L35-cawco-transcript-1 (7 files)

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. (No animation skills `emil-design-eng` / `transitions-dev`: no file here adds a transition design; the animations moved are existing keyframes.)
better-ui rules followed: transitions only on named properties (`transition-[rotate]`, `[scale]`, `[color]`, never `all`); press scales to `--press-scale` (the house token) under `motion-safe:`; motion gated by `motion-safe:` / `motion-reduce:` with an opacity-only still variant for the glyph swap; interactive state through transitions (rotate, scale, grid-rows), keyframes only for the sequences that run once or loop (wave draw, breath, icon swap); nested radii by the concentric rule (Attach `rounded-xs` = `radius-lg` − `space-2`); hover only through `hover:` (the guarded variant); dots are `rounded-pill`.
better-layout rules followed: flow-relative utilities (`ps-`/`pe-`/`border-s-2`); a flex row with `flex-1 min-w-0` arms replaces the custom-property grid track; `min-h-` never fixed heights; `max-w-(--c-measure)` text measure; overscroll and scroll behaviour untouched; hit areas by `touch-hit` + a named `hit-edge`; descendant states by `group-*` on the owner instead of selectors from the parent's `<style>`.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| AccountMoveDivider.svelte | grid track → flex arms, dot, fold rows, brief | 0 (`<style>` deleted) | none | `@phone:` container edge unchanged | none |
| AttachButton.svelte | radius, hit edge, press scale, deck state | 0 | none | none | none |
| AttachmentChips.svelte | max height, coarse pad pair, hover, hit edge, dock states (were Composer's rules) | 0 | none | none | none |
| CatchUp.svelte | dot, breath | 0 (`<style>` deleted) | none | none | none |
| CompactionDivider.svelte | grid → flex, wave dash/animations, fail rail, flip, brief | 0 (`<style>` deleted) | none | none | none |
| Composer.svelte | whole `<style>` (hint, chips, menu heading, grown shape, lift copy, holding, flight, swap), custom-property literals | 0 (`<style>` deleted) | none | none | none |
| Delegate.svelte | whole `<style>` (all dead but one), 12 literal sites | 0 (`<style>` deleted) | none | `max-desk:hidden` unchanged | none |

## Kind-5 declarations (verbatim)
none

## needs variant / needs transition token / needs colour token
none

## cross-file hook
cross-file hook: Composer.svelte `[data-slot="dock"]`, `data-asking`, `data-drawing` stay as the state the group variants read; selected now by AttachmentChips.svelte (same lane).

## shadcn variant
shadcn variant: AccountMoveDivider.svelte:136 data-open rotate
shadcn variant: AccountMoveDivider.svelte:145 data-open grid-template-rows
shadcn variant: AccountMoveDivider.svelte:145 data-open opacity

## shadcn/no-restyle hits
AttachButton.svelte:59 DropdownMenuTrigger: size-c-composer-field grid place-items-center cursor-pointer rounded-xs border border-border-control hit-edge bg-surface-raised text-ink-muted transition-[...] dur-control ease-out hover:bg-surface-hover hover:text-ink-strong motion-safe:pressed:scale-(--press-scale) group-inert/ctrls:border-border-button-outline group-inert/ctrls:shadow-xs
Delegate.svelte:429 CollapsibleTrigger: rail-line press-tint min-h-c-mark coarse:min-h-c-row-h min-w-0 text-size-label font-medium bg-transparent border-none border-current rounded-xs p-0 text-inherit cursor-pointer text-start transition-[color] dur-control ease-out

## Contracts
none declared. (Another lane's file is needed in three places; each is a `gap:` below, not an ESLint site.)

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachButton.svelte:59 DropdownMenuTrigger the square composer control classes above — variant `look="composer-control"`: the field's box (`c-composer-field`), the concentric `rounded-xs`, the control edge with its hit edge, the raised fill, muted ink, the press scale, and the inert-deck card (`border-button-outline`, `shadow-xs`)
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachButton.svelte:79 Button hand-rolled `<button>` with the same look — the same `look="composer-control"` on the kit Button
kit-swap: apps/dashboard/src/lib/cawco/transcript/Delegate.svelte:429 CollapsibleTrigger the head classes above — variant `look="rail-head"`: a disclosure that is a rail line, quiet, inheriting ink, with the tint press

## Theme additions

theme: utility hit-edge
```css
@utility hit-edge {
  --hit-edge: 1px;
}
```

theme: utility grid-rows-fold-shut
```css
@utility grid-rows-fold-shut {
  grid-template-rows: 0fr;
}
```

theme: utility grid-rows-fold-open
```css
@utility grid-rows-fold-open {
  grid-template-rows: 1fr;
}
```

theme: animate breath
```css
/* @theme: the keyframes stay where app.css has them (@keyframes breath). */
--animate-breath: breath var(--breath) var(--ease-in-out) infinite;
```

theme: utility wave-dash
```css
@utility wave-dash {
  stroke-linecap: round;
  stroke-dasharray: var(--run) calc(var(--run) * 2);
}
```

theme: animate wave-arrive
```css
--animate-wave-arrive: wave-draw var(--dur-pop) var(--ease-out) calc(var(--dur-rail) + var(--lead)) backwards;
@keyframes wave-draw {
  from {
    stroke-dashoffset: var(--run);
  }
}
```

theme: animate wave-draw
```css
--animate-wave-draw: wave-draw var(--dur-pop) var(--ease-out) backwards;
```

theme: animate wave-breathe
```css
/* While it compacts the line breathes, two breaths a loop: it draws out
   over the first, then fades where it stands over the second. */
--animate-wave-breathe: wave-breath-draw calc(var(--breath) * 2) var(--ease-out) infinite, wave-breath-fade calc(var(--breath) * 2) var(--ease-in-out) infinite;
@keyframes wave-breath-draw {
  0% {
    stroke-dashoffset: var(--run);
  }
  50%,
  100% {
    stroke-dashoffset: 0;
  }
}
@keyframes wave-breath-fade {
  0%,
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}
```

theme: utility content-rest
```css
@utility content-rest {
  content: attr(data-rest);
}
```

theme: animate icon-swap
```css
--animate-icon-swap: icon-swap var(--dur-control) var(--ease-out) both;
@keyframes icon-swap {
  from {
    opacity: 0;
    transform: scale(0.25);
    filter: blur(var(--space-1));
  }
  to {
    opacity: 1;
    transform: scale(1);
    filter: blur(0);
  }
}
```

theme: animate icon-swap-still
```css
--animate-icon-swap-still: icon-swap-still var(--dur-control) var(--ease-out) both;
@keyframes icon-swap-still {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
```

theme: component transcript-brief
```css
/* MessageBody's message and its prose take no class; a divider's summary
   reads in the muted ink of a note, not a turn's. */
@layer components {
  [data-slot="transcript-brief"] {
    [data-slot="msg"],
    [data-slot="msg"] .prose,
    [data-slot="msg"] .prose :is(h1, h2, h3, h4, h5, h6) {
      color: var(--ink-muted);
    }
    [data-slot="msg"] .prose {
      --tw-prose-body: var(--ink-muted);
      --tw-prose-headings: var(--ink-muted);
      --tw-prose-bold: var(--ink-muted);
    }
  }
}
```

theme: component delegate-nested-head
```css
/* A subagent card inside a delegate's transcript (InlineTranscript) took
   the delegate head's flex and floor from the old rule; Subagent.svelte's
   head carries neither. */
@layer components {
  [data-slot="rail-row"] [data-slot="rail-row"] [data-bhead] {
    flex: 1 1 auto;
    min-inline-size: 0;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    background: none;
    border: 0;
    border-radius: var(--radius-xs);
    padding: 0;
    color: inherit;
    cursor: pointer;
    text-align: start;
    transition: color var(--dur-control) var(--ease-out);
  }
}
```

theme: component composer-mention-chips
```css
/* The chips MentionField's script makes: clear while another draft's words
   fly in, hidden while an ask's card stands over the field. */
@layer components {
  [data-slot="composer-field"] > [data-editor][data-flying] [data-mention-chip] {
    opacity: 0;
  }
  [data-asking] [data-slot="composer-field"] > [data-editor] [data-mention-chip] {
    visibility: hidden;
  }
}
```

theme: component composer-menu-heading
```css
/* The group's heading, which bits-ui renders. */
@layer components {
  [data-slot="menu"] [data-slot="command-group"] [data-command-group-heading] {
    padding: var(--space-1) var(--space-2) var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    letter-spacing: var(--track-caps);
    text-transform: uppercase;
    color: var(--ink-muted);
  }
}
```

theme: component composer-grown-shape
```css
/* The grown shape (grown.ts), made as it grows, behind the pill. Not
   standing, the drop is not drawn at all. While the wheel is up the halo's
   margins take a press and never pan the page. */
@layer components {
  [data-slot="shell"] :is(.grown-halo, .grown-drop) {
    position: absolute;
    z-index: 1;
    inset-inline: 0;
    bottom: 0;
    pointer-events: none;
    & svg {
      display: block;
      inline-size: 100%;
      block-size: 100%;
      overflow: visible;
    }
  }
  [data-slot="shell"] .grown-drop {
    opacity: 0;
    visibility: hidden;
    transform-origin: 50% 100%;
  }
  [data-slot="shell"] .grown-drop.settled {
    opacity: 1;
    visibility: visible;
    transition:
      opacity var(--dur-fade) var(--ease-out),
      visibility 0s;
  }
  [data-slot="shell"][data-rolling] .grown-halo {
    pointer-events: auto;
    touch-action: none;
  }
}
```

theme: component lift-copy
```css
/* The words in flight between a queued bubble and the field
   (lift.svelte.ts makes them): fixed over the page, cut to each end's box. */
@layer components {
  .lift-copy {
    position: fixed;
    z-index: 50;
    overflow: hidden;
    pointer-events: none;
    color: var(--ink-strong);
  }
}
```

theme: component composer-holding
```css
/* While a press is held on the composer and while the wheel is up, nothing
   on the page selects (Composer toggles the class on <html>). */
@layer components {
  html.composer-holding,
  html.composer-holding * {
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
}
```

## Tokens
token: --c-atts-max-h 180px — the attachments row's height ceiling before it scrolls; a component dimension, no ladder step
token: --c-compaction-word-bleed 0.5em — how far the settle's text clip reaches past the word's box so ascenders and descenders survive; follows the font, no ladder step
token: --c-elapsed-w 7ch — a ticking clock's reserved width (seven digit-widths holds "59m 59s"); a text measure
token: --c-composer-more-w 4.5rem — the room the folded field's "+N lines" stands in; a component dimension
(Merged names used per renames.md: `max-w-c-measure` for the 68ch measures, `c-textarea-max-h` for the composer field's 200px ceiling, `--text-field-floor` for its 16px type size; `c-atts-max-h`, `c-elapsed-w`, `c-composer-more-w`, `c-composer-menu-max-h` are written as theme-key utilities `max-h-c-…`, `min-w-c-…`, `w-c-…`.)
token: --roll-reach 100vmax — how far the recall roll's clip reaches past the field on the sides it does not cut; larger than any screen
token: --c-composer-menu-max-h 320px — the `/` and `@` menu's height ceiling before its list scrolls
token: --optical-nudge 0.5px — the send plane's optical centring (up and right), the glyph's mass sitting low-left of its box
token: --c-mention-chip-pad-end 6px — MentionField's chip end padding, set here for the autosize twin; must equal MentionField's own value
token: --c-mention-chip-size 15px — MentionField's chip type size, same reason
token: --c-mention-chip-leading 22px — MentionField's chip line height, same reason

## Removed
removed: Delegate.svelte:(end) ~300 lines of `<style>` — `.chev .mark .tk .kind .meta .may .pill .elapsed .jump .brief .now .status .beat .asks .ask .dot .astate .ashort .report` and the narrow/coarse media rules matched no element (svelte pruned them; the markup already carries utilities)
removed: Delegate.svelte:(rail-cell spans) `style:--beat`, `style:--beat-r`, `style:--dot`, `style:--dot-r` — custom properties nothing read
removed: CompactionDivider.svelte:(wave paths) `--dash-gap: 9999px` — a magic gap; the dash gap is now twice the run (`wave-dash`)
removed: Composer.svelte:(send glyphs) three per-glyph `transform-(--send-nudge)` classes — the nudge sits once on the swap carrier's `translate`, which also clears the Spinner `no-restyle`
removed: Composer.svelte:(composer-field) `--hint-ink`, `--hint-track`, `--hint-fade` indirection — the field's hint states are variants on the field
removed: AttachmentChips.svelte:(buttons) `[&:hover]:` arbitrary variants — `hover:`
removed: CompactionDivider.svelte, AccountMoveDivider.svelte: `--cols` grid track custom property — a `flex-1 min-w-0` row

## fixed
fixed: AttachmentChips.svelte:46 the row's dock states (pointer, drawing stack, asking fade) live on the row itself, read from the dock group; Composer's `<style>` no longer reaches into another component's root
fixed: AttachButton.svelte:59 the recall deck's card edge is `group-inert/ctrls:` on Attach itself, not a selector from Composer
fixed: Delegate.svelte:565 the live beat breathes as `animate-breath` under `motion-safe:` (DESIGN.md, Live work breathes) instead of the global `.breathe` class
fixed: CompactionDivider.svelte:300 the failure line's rail is `border-s-2 border-status-fail-ink` (logical, one element) in place of a gradient background painted with a physical left position
fixed: Delegate.svelte:429 head floors are the tokens `min-h-c-mark` and `coarse:min-h-c-row-h` (26px/44px literals before)

## Gaps
gap: Subagent.svelte:84 its `[data-bhead]` carries no flex/floor/typography utilities, so Delegate keeps `delegate-nested-head`; once it does, delete that component — DESIGN.md Components: one head recipe
gap: MentionField.svelte:751 its chip sizes are literals (6px/15px/22px) mirrored by Composer for the autosize twin; both read the three `--c-mention-chip-*` tokens after integration
gap: lift.svelte.ts and grown.ts build elements with class names (`lift-copy`, `grown-halo`, `grown-drop`); their looks are theme components until those scripts put utilities on them
gap: components/ui/command/command-item.svelte, command-list.svelte, command-group.svelte (needs a `menu="composer"` variant) — Composer.svelte:3399 styles those parts through `[&_[data-slot=command-…]]:` descendant variants
gap: components/ui/button/button.svelte (needs a `reveal="coarse"` variant) — Composer.svelte:3266 reaches the Keep-it Button through `[&_[data-keep]]:`
gap: find/MentionField.svelte (its root needs `min-h`/`max-h`/`text`/`py` through its own props) — Composer.svelte:3468 sets them through `[&>[data-editor]]:`
gap: components/ui (no Chip/Badge variant for picture + name + remove) — AttachmentChips.svelte:112 hand-rolls the chip
note: AttachmentChips.svelte:53 `coarse:p-space-3 coarse:-m-space-2` is not a cancelled offset: the row is a scroller (`overflow-y-auto`) and clips the remove buttons' touch areas, so on a finger it takes one ladder step of padding into an equal margin; layout-neutral by construction

## Design Critique (interface-craft, from markup against DESIGN.md)
- Hierarchy: dividers read as hairline + one meta-role line; unchanged, the flex arms keep the word centred when the arms are equal (`flex-1` on a zero basis).
- Dot sizes follow the ladder: 8→7, 6→7 (space-2), 5→4 (space-1). fixed: they are marks on the scale, not hand-kept numbers; the 5→4 beat dot is the smallest and breathes, so it keeps its cue by motion plus hue.
- Touch: `touch-hit` on the delegate head and jump link replaces nothing; the coarse floor is `c-row-h`, so a finger gets the same 44px row as before.
- ui-observer: Not verified — no `/motion` bench or story renders these components in this workspace, and the lane's rules forbid probes; layout facts (flex arms, border-s rail, calc paddings) are from the markup only.
