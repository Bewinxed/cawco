# Lane S03-transcript (11 files)

Residual kinds are 1/2/3/4/5 (keyframes / foreign-dom / pseudo / svg-paint / unmapped).

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| AttachButton.svelte | 5 rules (+ svg) | 0/0/0/0/0 | `--hit-edge: 1px`; radius calc `--att-radius` | none | none |
| Behind.svelte | 3 | 0/0/0/0/0 | none | none | none |
| CatchUp.svelte | 2 | 2/0/0/0/0 | 6px dot, 50% radius (`--dot`, `--dot-r`) | none | none |
| DesignOfferActions.svelte | 3 | 0/0/0/0/0 | none | none | none |
| DocThumb.svelte | 14 | 0/0/0/2/0 | 48px (`--doc-h`), `min(100%, 16rem)` (`--doc-max`), 24px (`--glyph`) | none | none |
| InlineTranscript.svelte | 4 | 0/2/0/0/0 | none | none | none |
| ProjectOffer.svelte | 5 | 3/0/0/0/0 | 8px (`--settle`), `1 1 24ch` (`--line-flex`), 44px (`--btn-h-coarse`) | none | none |
| RoutineMadeActions.svelte | 3 | 0/0/0/0/0 | none | none | none |
| RunBlock.svelte | 6 | 0/0/0/0/0 | 26px (`--head-min`), 44px (`--head-min-coarse`), 68ch (`--measure`) | `(pointer: coarse)` → `coarse:` | none |
| Shot.svelte | 13 | 0/0/0/0/0 | 240px (`--cap`), 48px (`--thumb`) | none | none |
| Thinking.svelte | 5 | 0/0/0/0/1 | 70ch (`--measure`) | none | none (colour literal handled by delta O1) |

Sums: kind 1 = 5, kind 2 = 2, kind 3 = 0, kind 4 = 2, kind 5 = 1.

## Kind-5 declarations (verbatim)
- Thinking.svelte:255 `mask-image: linear-gradient(to right, transparent, var(--mask-opaque) 30%);` (on `[data-slot="tail"]`)

## needs colour token
- needs colour token: --mask-opaque: oklch(0% 0 0) (Thinking.svelte:255)

## needs variant / needs transition token
- none

## cross-file hook
- cross-file hook: AttachButton.svelte:50,69 `.att-btn` → `[data-slot="att-btn"]` on the plain button (the dropdown trigger carries `data-att-btn`, its `data-slot` is the kit's `dropdown-menu-trigger`; the selector needs `[data-slot="att-btn"], [data-att-btn]`); selected by Composer.svelte:4004
- cross-file hook: RunBlock.svelte:~99 `.run-block` → `[data-slot="rail-row"]`; selected by components/features/workflows/WorkflowRunView.svelte:474
- cross-file hook: RunBlock.svelte `.words` → `[data-slot="words"]`, `.mark` → `[data-slot="mark"]`; queried by transcript/DelegateTray.svelte:461 (`querySelectorAll(".mark, .words, .note, .slot")`; only if a RunBlock sits inside that node)
- cross-file hook: Shot.svelte `.box` → `[data-slot="shot-box"]` (added); selected by transcript/ToolGroup.svelte:688 (`& :global(.box)`)
- in-file selector retarget: RunBlock `glyph=".mark"` passed to RunSteps → `glyph={`[data-slot="mark"]`}`

## Other notes
- `data-sized`, `data-loaded`, `data-cached` replace Shot's `sized`, `loaded`, `cached` state classes; `data-thumb` (already a hook) carries `thumb`.
- DocThumb transition/duration/ease sit under `motion-safe:` (originally only under no-preference).
- Shot unsized frame/skeleton radius: `border-radius: inherit` → `rounded-sm` (parent box is always `--radius-sm`; computed value identical).
- RunBlock link hover: `group/words` on the `a` + `group-hover/words:` on the name.
- Thinking `.rail-indicator`/`.thinking-header` :global rules became classes/style passed to the child components (ThinkingIndicator, ThinkingStepsHeader); integration's compare should check specificity against the kit's own rules.
- Classes removed with no rule left in this file and no cross-file selector: Thinking `think`, `rail-indicator`; RunBlock `run-block`, `head`, `words`, `name`, `progress`, `failure`.

## shadcn/no-restyle hits (33)
- AttachButton.svelte:50 <DropdownMenuTrigger>: rounded-(--att-radius), border, border-border-control, bg-surface-raised, text-ink-muted, transition-[background-color,color], dur-control, ease-out, motion-safe:transition-[background-color,color,transform], hover:bg-surface-hover, hover:text-ink-strong (11)
- ProjectOffer.svelte:88 <Button>: coarse:h-(--btn-h-coarse) not flagged; gap-(--btn-gap), rounded-sm, px-space-3, text-label, font-medium
- ProjectOffer.svelte:95 <Button>: same five
- ProjectOffer.svelte:121 <Button>: same five
- ProjectOffer.svelte:130 <Button>: same five
- Thinking.svelte:218 <ThinkingIndicator>: p-0, gap-(--indicator-gap)

## shadcn variant lines
- none
