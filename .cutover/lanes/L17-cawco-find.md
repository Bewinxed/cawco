# Lane L17-cawco-find

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer, emil-design-eng, transitions-dev (the files carry `transition:`/`in:`/`out:` and keyframes). Motion check: the tip's entry is 140ms (`--dur-menu`) on `--ease-out`, scale from `--press-scale` (never 0), reduced motion keeps the opacity fade only; the breath is the shared `breath` keyframes; no keyboard action animates here.
better-ui rules followed: transition only named properties; press scale via `--press-scale`; hover only under the `hover:` variant (fine pointers); overscroll contain on scrollers; motion gated by `motion-safe:`.
better-layout rules followed: min-height not height where text grows; `min-w-0` on flex text; logical properties (`ps-`/`pe-`); phone targets 44px; no fixed widths on text.

6 files, all done. Residual `<style>` blocks kept: 0.

## Per-file table
file · rules moved · residual · literals · breakpoint edges
- FindField · 9 (scoped `<style>` gone: root, glyph, input, clear, phone) · none · none (44→`c-row-h`, 36/44→`c-btn-h`/`c-btn-h-lg`, 52→token) · none
- FindPeek · 0 rules, 4 literals · none · `20px`→`leading-icon-lg`, `28px`→`leading-c-row-lead`, `44px`→`c-btn-h-lg`, `0.35em`→`px-space-1` · none
- FindRow · 10 literals, dead `.breathes` rule · none · line boxes→`icon-lg`/`icon-md`/`space-5`, floors→tokens, pads→`space-2`/`space-3` · none
- Finder · whole dead `<style>` (≈355 lines, every selector matched nothing) + 24 literals · none · see Tokens · none
- MentionField · 3 scoped rule groups, 9 literals · none · see Tokens, Theme additions · none
- MentionMenu · 5 literals · none · `6px`→`p-space-2`, `36px`→`h-c-btn-h`, `8px`→`my-space-2` · none

## Kind-5 declarations
none
## needs variant
none
## needs transition token
none
## needs colour token
none
## cross-file hook
none
## shadcn/no-restyle hits
none
## shadcn variant
- shadcn variant: apps/dashboard/src/lib/cawco/find/Finder.svelte:653 data-open rotate
- shadcn variant: apps/dashboard/src/lib/cawco/find/FindPeek.svelte:110 group-data-active opacity
important kept: none
shadow kept residual: none

R2 fixed: apps/dashboard/src/lib/cawco/find/FindField.svelte:45
R2 fixed: apps/dashboard/src/lib/cawco/find/FindField.svelte:51

## Contracts
- Composer.svelte:3493-3495 (another lane) sets `--mention-chip-pad-end`, `--mention-chip-size`, `--mention-chip-leading` on the field box with literals. Nothing reads them now: the chip takes `type-label` and `space-1`/`space-2` from the `mention-chip` component rule, in the editor and in the autosize twin alike. Composer's lane or integration deletes those three lines (their literals are relics there).

## Removed
removed: FindField.svelte (old `.field.phone input`) phone input `font-size: 16px` — The 16px Field Rule is the base layer's `max(16px, 1em) !important` (app.css:407).
removed: Finder.svelte:969-1325 the whole scoped `<style>` — every selector (`.finder`, `.chip`, `.list`, …) matches nothing in the converted markup; main's merge re-added the old text.
removed: Finder.svelte (script-less vars) `--field-h-phone`, `--field-fs-phone`, `--hints-h`, … — read by no class.
removed: Finder.svelte phone chip/row text sizes 15px and 16px — Typography: "the three dense roles keep one size at every width".
removed: FindRow.svelte phone title `16px` — same rule.
removed: MentionMenu.svelte phone paragraph `16px`/`24px` — same rule.
removed: MentionField.svelte editor `font-size: 16px` and chip `15px`/`22px` — same rule; the chip is the label role.
removed: FindRow.svelte `.breathes` rule and its `<style>` — dead (nothing set the class); replaced by `animate-breath`.

## Tokens
token: --c-find-row-h 52px — a finder row's floor, two lines (DESIGN.md Find rows); no ladder step or c-* holds it
token: --c-find-row-h-phone 56px — the same row's floor on a phone
token: --c-find-line-h 40px — a one-line finder row (Waiting for you, a folded kind)
token: --c-find-phone-h 52px — a phone's find field and one-line row
token: --c-find-head-h 28px — a finder group head and its coverage line
token: --c-find-skeleton-tall 54px — the skeleton standing for a row with its reason (70px less its 2×7px padding)
token: --c-mention-field-max-h 200px — the mention field's growth cap (Composer overrides it)
token: --c-tip-max-w 320px — the chip tooltip's measure (the kit tooltip's max-w-80 is the same value)

## Theme additions
theme: animate breath
```css
@theme inline { --animate-breath: breath var(--breath) var(--ease-in-out) infinite; }
```
theme: animate kit-tip-fade
```css
@theme inline { --animate-kit-tip-fade: kit-tip-fade var(--dur-menu) var(--ease-out); }
```
theme: animate mention-tip-in
```css
@theme inline {
  --animate-mention-tip-in: mention-tip-in var(--dur-menu) var(--ease-out);
  @keyframes mention-tip-in {
    from {
      opacity: 0;
      scale: var(--press-scale);
    }
  }
}
```
theme: utility content-placeholder
```css
@utility content-placeholder {
  content: attr(data-placeholder);
}
```
theme: component mention-chip
```css
@layer components {
  [data-editor] [data-mention-chip] {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    max-inline-size: 100%;
    margin-inline: 1px;
    padding: 0 var(--space-2) 0 var(--space-1);
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
    font: var(--type-label);
    color: var(--ink-strong);
    vertical-align: baseline;
    white-space: nowrap;
    cursor: default;
    user-select: all;
  }
  [data-editor] .mention-glyph {
    display: inline-grid;
    place-items: center;
    color: var(--status-idle-glyph);
  }
  [data-editor] .mention-glyph svg {
    inline-size: var(--icon-md);
    block-size: var(--icon-md);
  }
  [data-editor] [data-mention-chip][data-tone="live"] .mention-glyph {
    color: var(--status-live-glyph);
  }
  [data-editor] [data-mention-chip][data-tone="attn"] .mention-glyph {
    color: var(--status-attn-glyph);
  }
  [data-editor] [data-mention-chip][data-tone="fail"] .mention-glyph {
    color: var(--status-fail-glyph);
  }
}
```

## Kit swaps
none (see gap lines)

## Fixed
fixed: FindRow.svelte:77 the working glyph breathes again — Live work breathes (DESIGN.md Motion): the converted markup set `data-breathes` but nothing animated it.
fixed: FindField.svelte:34 the focus ring is the kit's `field-shell` — The One Ring Rule, in place of a scoped `:has()` rule.
fixed: MentionField.svelte (chip) the chip is the label role, so it sits inside the editor's body line — Typography Role Not Size.
fixed: FindPeek.svelte:59 the peek's start pad is `ps-`, matching its `border-s` — logical properties.

## Gaps
gap: Finder.svelte:488 the who-said chips are hand-rolled aria-pressed pills — kit Toggle/ToggleGroup exist; not a straight swap (pill shape, removable word chips alongside).
gap: Finder.svelte:721, FindPeek.svelte:127, MentionMenu.svelte:116 "Retry" is a hand-rolled text button — the kit Button has a link look; same text/handler swap left to the kit lane.
gap: Finder.svelte:952 hint keys are bare `<kbd>` — the kit has Kbd; swapping changes the hint line's look.

## Critique (interface-craft, from markup)
- Hierarchy: row = glyph / title (label) / age (meta); meta and reason under it: holds. fixed: phone sizes now the roles'.
- Touch: phone clear, disclose and rows are ≥44px (`c-btn-h-lg`, `c-find-phone-h`); desk pills 24px (`c-pill-h`).
- Defensive: titles truncate or clamp in inner spans; lists `min-h-0 overflow-y-auto overscroll-contain`; tooltip `max-w`.
- Not verified: rendered layout (ui-observer) — no stories or bench renders these files in this workspace, and the new tokens are undefined until integration.
