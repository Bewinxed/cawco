# Lane L38-cawco-transcript-4

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. (emil-design-eng / transitions-dev not loaded: no file adds a transition or keyframe; Row's existing fade moved onto `motion-safe:` utilities.)

better-ui rules followed: transitions name their property (`transition-opacity`, `transition-[rotate]`), no `transition-all`; hover styling only through the `hover:` variant (the suggestion chip's `[&:hover]` escape is gone, so a touch tap no longer latches a hover tint); motion gated behind `motion-safe:`; the disclosure chevron turns by `rotate-90` on `group-state-open`; one status-dot token for the live beat.
better-layout rules followed: a reading measure is one token (`c-measure`, 72ch) instead of 68ch/72ch copies; touch floors kept (`coarse:min-h-c-btn-h-lg` = 44px on the run head and the subagent head); nested wells reset the rail once on the well, not on every descendant; `min-h` not `h` on rows holding text.

## Files: 7 of 7

| file | work | residual 1/2/3/4/5 | breakpoint edges |
|---|---|---|---|
| QuestionCard.svelte | 3 × `72ch` marker + `--measure` → `max-w-c-measure`; hitl start's `1px` → `--border-width` | 0 | none |
| RecallWheel.svelte | `16px` ghost size → `--text-field-floor` through `text-(length:--ghost-size)`; chip `45%` → `max-w-9/20`; `calc(space-1 / 2)` → `py-space-row`; hairline ring → `inset-ring-1 inset-ring-border-hairline`; 2 markers + 4 style vars removed | 0 | none |
| Row.svelte | `<style>` (the `::before` mark) → `before:` utilities under `data-marked:` / `marked-off:`; `0px` → `0` | 0 (style deleted) | none |
| RunBlock.svelte | `26px`/`44px` head min → `min-h-c-mark coarse:min-h-c-btn-h-lg`; head wrapper's duplicate min-height removed; `68ch` → `max-w-c-measure` | 0 | none |
| Shot.svelte | `240px`/`48px` → the existing `--tx-shot` / `--tx-shot-thumb` tokens | 0 | none |
| Subagent.svelte | whole `<style>` deleted (dead rules + `.now`, `.beat`, rail reset); 8 literal markers/vars gone | 0 | `coarse:` kept |
| SuggestionChips.svelte | `has-[…]` → `data-filled`; `[&:hover]` → `hover:`; `9rem`/calc shimmer → token / `h-c-suggest-chip`; `1px` hit edge → `--border-width` | 0 | none |

No `<style>` kept. Literals preserved: none.

## Theme additions

(none)

## Tokens

token: --c-measure 72ch — running-text measure (renames.md; DESIGN.md Typography: "Running text measures 60 to 72ch"); replaces the 68ch copies in RunBlock and Subagent and the 72ch in QuestionCard.
token: --text-field-floor 16px — the composer field's size, which the recall wheel's ghost rows repeat so a ghost and the word it becomes share one size (renames.md: `text-input` → `text-field-floor`).
token: --c-suggest-shimmer-w 9rem — the width of the skeleton that holds a suggestion chip's place while an ask is slow; a chip's width, no ladder step.
token: --border-width 1px — the hairline border width; a bordered `.touch-hit` host sets `--hit-edge` to it (SuggestionChips) and the hitl card's content column subtracts it (QuestionCard).

## Removed

removed: apps/dashboard/src/lib/cawco/transcript/Subagent.svelte `<style>` `.branch :global(.bhead)`, `.chev`, `.mark`, `.mark.m2…m8`, `.tk`, `.arg`, `.model`, `.pill`(+states), `.say`, `.report`, `.fail`, `.inner` rules — dead: the markup already carries utilities and none of these classes is rendered.
removed: Subagent.svelte `[data-slot="rail-row"] :global(*)` reset on every descendant — now set once on the well (`style:--rail-head` / `--rail-gap` on `data-slot="inner"`), which is the only place nested rail rows render; descendants inherit it.
removed: Subagent.svelte:~97 `group-hover/bhead:text-ink-strong` on the type name — the same colour as its base `text-ink-strong`.
removed: RunBlock.svelte:~100 `min-h` on `data-slot="head"` — its two children already carry the same floor.
removed: SuggestionChips.svelte:~255 `[&:hover]:text-ink-strong` — same colour as the chip's base ink.
removed: SuggestionChips.svelte `style:--chip-block` — the token is a spacing key (`h-c-suggest-chip`).
removed: RecallWheel.svelte, QuestionCard.svelte, RunBlock.svelte, Shot.svelte, Subagent.svelte every `<!-- literal: … -->` marker and `style:--x="<number><unit>"`.

## Fixed

fixed: RunBlock.svelte:~138, Subagent.svelte:~150/164/171 failure and run-line measure 68ch → `c-measure` (72ch) — DESIGN.md Typography: "Running text measures 60 to 72ch"; one measure across the transcript.
fixed: Subagent.svelte:~97 sprite 11px and chevron box 13px → `size-icon-sm` (12) — DESIGN.md icon sizes 12/16/20.
fixed: Subagent.svelte beat dot 5px → `size-(--status-dot-size)` (6px) — DESIGN.md Status dot.
fixed: Subagent.svelte chevron turn uses `rotate-90` with `transition-[rotate]` (the turn property and the transitioned property now match).
fixed: SuggestionChips.svelte:~232 the lifted backdrop keyed on `:has(chip, shimmer, fail)` → `data-filled` set from the same condition that draws the track (a state as an attribute).
fixed: SuggestionChips.svelte:~255 chip hover through `hover:` (pointer-guarded) instead of `[&:hover]`, so a tap on a touch screen leaves no stuck tint (better-ui "Hover effects only on hover-capable pointers").
fixed: Row.svelte `::before` mark: `motion-safe:` carries the transition, so reduced motion needs no override.

## Gaps

gap: apps/dashboard/src/app.css:638 and :721 `.kit-chip.sel` is a state class; QuestionCard.svelte:~320 writes `class="kit-chip sel"` and cannot move to an attribute until the kit chip keys on `data-selected` / `aria-selected` — DESIGN.md Inputs and fields (a pick is an attribute, not a class).
gap: apps/dashboard/src/lib/tokens/tokens.css:1142 `--transition-suggest-chip` transitions `transform`, so SuggestionChips.svelte:~262 keeps `motion-safe:active:transform-(--chip-press)` (`scale(var(--press-scale))`) rather than `scale-(--press-scale)`; the token should transition `scale`.

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/transcript/Subagent.svelte:81 Collapsible.Trigger font-medium bg-transparent border-none border-current rounded-xs p-0 text-inherit cursor-pointer text-start transition-[color] dur-control ease-out text-size-label — a `branch-head` variant: full-width flat disclosure head at label size, no padding, the card's own radius, colour transition.
kit-swap: apps/dashboard/src/lib/cawco/transcript/SuggestionChips.svelte:296 Kbd coarse:hidden — a Kbd `desktop-only` variant (hidden under a finger).
kit-swap: apps/dashboard/src/lib/cawco/transcript/SuggestionChips.svelte:318 Skeleton size-full — a Skeleton `fill` variant.

## Contracts

(none)

## Other lists

needs variant: none · needs transition token: none · cross-file hook: none · important kept: none · shadow kept residual: none · R2 fixed: none · R3 fixed: none · shadcn variant: none
`shadcn/no-restyle` hits: Subagent.svelte:81 Collapsible.Trigger (font-medium, bg-transparent, border-none, border-current, rounded-xs, p-0, text-inherit, cursor-pointer, text-start, transition-[color], dur-control, ease-out); SuggestionChips.svelte:296 Kbd coarse:hidden; SuggestionChips.svelte:318 Skeleton size-full.
Class names `max-w-c-measure`, `w-c-suggest-shimmer-w` are written the integration way; they are unknown to this tree until the tokens commit lands.
Not verified: no stories or `/motion` bench renders these components in this workspace, so ui-observer's layout measure did not run; the design critique above is from markup and classes.
