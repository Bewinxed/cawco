# Lane L39-cawco-transcript-5

Skills loaded, in order: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. emil-design-eng and transitions-dev were not loaded: no file of the lane adds a transition or animation of its own (the chevron turns keep their existing `motion-safe:` transition and move it from `transform` to `rotate`). ui-observer measured nothing: no bench or stories file renders these files in this workspace, so layout is Not verified in a browser.

better-ui rules followed: transition only what changes (`transition-[rotate]`, named property); hover/press untouched and under the kit's `hover:`; reduced motion stays gated by `motion-safe:`; concentric radius on the preview card (`after:rounded-md` is the card's `rounded-md`); icons at the ladder (12/16). better-layout rules followed: logical properties (`ms-`, `ps-`, `pe-`, `max-w`); content-sized boxes (`min-h`, never a fixed height); the reading measure is the DESIGN.md measure token; 44px touch floor from `--tx-line-touch` / `c-btn-h-lg` under `coarse:`; bars in a flex column so their margins add instead of collapsing.

## Per-file table
file · what moved · residual · literals
- SystemLine.svelte · foreign-dom `svg` rules → classes on the icons (`size-icon-sm`, the clock `size-icon-md`); chevron turn `data-open:rotate-90`; underline offset; rail-head reset; `<style>` deleted · none · none
- Thinking.svelte · 70ch measure → `max-w-c-measure` · none · none
- ToolGroup.svelte · every literal on a token; `::after` card cover → `after:` utilities; chevron turn; shots row → theme component; `<style>` deleted · none · none
- Transcript.svelte · live tool row; virtua rules → theme components; `<style>` deleted · none · none
- TranscriptSkeleton.svelte · every literal; kit Skeleton variants; bars in a flex column · none · none

## Removed
removed: SystemLine.svelte `[data-slot="note"] :global(svg)` and `.unread .rail-cell :global(svg)` — foreign-dom rules sizing the row's own marks; the marks take their size as a class now. The same rule also forced the 12px size onto any svg MessageBody draws in a folded body; that override of another component's own size goes with it
removed: SystemLine.svelte `unread` class (line 417) — matched only the deleted `.unread` rule; `data-unread-note` already marks the row
removed: SystemLine.svelte:478,533 `data-code:bg-none data-code:bg-auto data-code:bg-repeat` — three resets of `.rail-row`'s background; `--rail-head` is the row's own handle for it (`style:--rail-head="none"`)
removed: SystemLine.svelte:345 `--name-offset: 0.2em` literal on the name's underline — `underline-offset-2`
removed: ToolGroup.svelte:508 `-mt-space-1` — a negative margin cancelling the card's `my-space-2`; the failure line sits the card's margin below it
removed: ToolGroup.svelte `mx-0` / `my-0 me-0` / `m-0` on `p` and `pre` — Preflight already zeroes them
removed: ToolGroup.svelte:473 `--mark-layers: var(--mark-overlay), none` — an empty second background layer; `bg-mark-overlay bg-mark-6`
removed: ToolGroup.svelte:493 `--path-leading: normal` and the loose `text-size-meta font-normal` — the place takes the `type-meta` role in mono
removed: TranscriptSkeleton.svelte `prose` class and `[.prose+&]:` / `[.prose>&]:` arbitrary variants — the class was only a hook for them; the `+` form matched nothing (the first paragraph of each block has no prose sibling before it); the `>` form is every bar, so the margin is unconditional
removed: TranscriptSkeleton.svelte `--ln-w: 52%` custom property — a width, written as one
removed: Transcript.svelte `[data-slot="livetool"] [data-slot="rail-cell"] :global(svg)` — the live tool's icon takes `size-icon-md` as a class

## Tokens
token: --c-measure 72ch — the running-text measure (DESIGN.md Typography: "Running text measures 60 to 72ch"), for a reasoning block, a skill's prose and the transcript skeleton's paragraphs; merged at integration as `c-measure`, written `max-w-c-measure`

## Gaps
gap: src/lib/tokens/theme.css (the theme components `transcript-drawn-item`, `transcript-scroll-lock` below) virtua writes `visibility` and `pointer-events` inline on its items and container, and no selector outranks an inline declaration, so those two rules need `!important`; they live in the theme file, not in this lane's files — Delta T
gap: apps/dashboard/src/lib/cawco/MessageBody.svelte:32 `--measure: 74ch` — the skeleton's paragraphs read `c-measure` (72ch), so they match the real ones only once MessageBody takes the same token — DESIGN.md Typography (Body measure)
gap: apps/dashboard/src/app.css:2121 `.rail-row`'s `padding-inline-start`, which SystemLine.svelte:478,533 `data-code:ps-0` undoes: a `.rail-row` without the rail belongs in app.css — DESIGN.md Layout
gap: apps/dashboard/src/app.css:2100–2140 `.tx-columns`, `.rail-row`, `.rail-line`, `.rail-cell`, `.rail-hang` are plain classes these five files write as styles; they become theme utilities where app.css lives — Delta T (class is a style)

## fixed
fixed: ToolGroup.svelte:353 favicon at `size-icon-md`, the width of the rail glyph cell it shares (it was 14px) — DESIGN.md Layout (icons 12/16/20)
fixed: ToolGroup.svelte:565 the diff frame reaches out by the header inset token plus its 1px border (`--tx-diff-head-inline`), and the refusal line takes the same inset — DESIGN.md Layout (one source for the inset)
fixed: ToolGroup.svelte:530,669 / Transcript.svelte:3991 / TranscriptSkeleton.svelte:125 tool rows are `--tx-line` tall and `--tx-line-touch` under a coarse pointer; the live tool and the skeleton rows now match the settled rows' 44px touch floor — DESIGN.md Focus and hit areas
fixed: ToolGroup.svelte:493 place line takes `type-meta` (the role's own leading) in place of `normal` — DESIGN.md Typography
fixed: ToolGroup.svelte:618 / Thinking.svelte:185 / TranscriptSkeleton.svelte:70,104,161 measure 70ch and 74ch → `c-measure` 72ch — DESIGN.md Typography (Body)
fixed: TranscriptSkeleton.svelte:70,104,161 paragraphs are flex columns, so each bar's block margins add and every bar holds the prose's one-line pitch; the block-flow form collapsed them — DESIGN.md Typography (line pitch)
fixed: TranscriptSkeleton.svelte:58,95,154 the speaker's name bar is the kit's `x-height` at `hair` corners in the label role, and every paragraph bar is `x-height` (it was 12px / 0.75em) — DESIGN.md Skeleton ("at exactly the size of what it stands for")
fixed: TranscriptSkeleton.svelte:66 the reader's well draws its edge as `inset-ring-1` (no layout width), so the padding is the turn's `--pad` itself and no `- 1px` offsets a border; the block padding mirrors Well.svelte's own `space-2 + 1px` — DESIGN.md Shapes (graded borders)
fixed: SystemLine.svelte:~152 `RESPONSE_GLYPHS` is typed `Component<{ class?: string }>` so the icons take their size as a class (a type-only change)
fixed: TranscriptSkeleton.svelte:127 the tool verb's bar is `space-8` (it was 40px) — DESIGN.md Layout (ladder)
fixed: SystemLine.svelte:225,498 / ToolGroup.svelte:540 chevron turns with `rotate-90` on the `rotate` property and `transition-[rotate]`, no `transform` composite

## Theme additions
theme: component transcript-drawn-item
```css
@layer components {
  /* virtua hides an item for the moment it takes to measure it, inline; a row
     already drawn keeps its visibility (Row's `data-drawn`). `inherit`, never
     `visible`, which paints through hidden ancestors. Inline wins over every
     selector, so the bang stays. */
  [data-slot="listing"] [data-item][data-drawn] {
    visibility: inherit !important;
  }
}
```
theme: component transcript-scroll-lock
```css
@layer components {
  /* virtua writes `pointer-events` on its container while it scrolls, and each
     write restyled every row under it. `inherit` outranks the inline write, so
     scrolling never changes the value. Never `auto`: a press would pass through
     a modal layer's lock on the body. */
  [data-slot="listing"] > :first-child {
    pointer-events: inherit !important;
  }
}
```
theme: component transcript-dock-buttons
```css
@layer components {
  /* The dock stands at zero height over the foot with `pointer-events: none`;
     the buttons its children draw (Behind, CatchUp, Latest) take the pointer back. */
  [data-slot="dock"] button {
    pointer-events: auto;
  }
}
```
theme: component transcript-shots
```css
@layer components {
  /* Each picture in a tool row's gallery is a Shot, whose root takes no class:
     it grows from the shot width and never overflows the row. */
  [data-slot="shots"] > * {
    flex: 1 1 var(--tx-shot);
    min-inline-size: 0;
    max-inline-size: 100%;
  }
}
```

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/transcript/SystemLine.svelte:208 CollapsibleTrigger `inline-flex bg-transparent border-none border-current p-0 text-ink-muted text-size-label font-medium cursor-pointer text-start rail-line` — a `ledger-line` variant: the bare ledger-line disclosure (no chrome, muted label type, the rail line's row)
kit-swap: apps/dashboard/src/lib/cawco/transcript/SystemLine.svelte:482 CollapsibleTrigger the same classes and `group-data-code/note:px-space-2 group-data-code/note:border group-data-code/note:border-dashed group-data-code/note:border-border-control group-data-code/note:rounded-xs` — the `ledger-line` variant with a `code` edge (dashed 1px control edge, space-2 inline pad, xs corners) for a line that stands in a code box
kit-swap: apps/dashboard/src/lib/cawco/transcript/ToolGroup.svelte:391 Badge `h-auto` — a `fit` size: the meta badge at its content's height
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:54 Skeleton `size-c-row-mark` — `cell="row-mark"`: the speaker's mark cell (18px)
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:91 Skeleton `size-c-row-mark` — `cell="row-mark"`
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:150 Skeleton `size-c-row-mark` — `cell="row-mark"`
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:127 Skeleton `h-space-3` — `height="bar"`: a tool row's argument bar (space-3)
kit-swap: apps/dashboard/src/lib/cawco/transcript/TranscriptSkeleton.svelte:132 Skeleton `h-space-3` — `height="bar"`

## shadcn/no-restyle hits (33)
- SystemLine.svelte:208 <CollapsibleTrigger>: inline-flex, bg-transparent, border-none, border-current, p-0, text-ink-muted, text-size-label, font-medium, cursor-pointer, text-start, rail-line (11)
- SystemLine.svelte:482 <CollapsibleTrigger>: the same plus group-data-code/note:px-space-2, :border, :border-dashed, :border-border-control, :rounded-xs (16)
- ToolGroup.svelte:391 <Badge>: h-auto
- TranscriptSkeleton.svelte:54, :91, :150 <Skeleton>: size-c-row-mark
- TranscriptSkeleton.svelte:127, :132 <Skeleton>: h-space-3

## shadcn variant lines
shadcn variant: apps/dashboard/src/lib/cawco/transcript/SystemLine.svelte:225 data-open rotate
shadcn variant: apps/dashboard/src/lib/cawco/transcript/SystemLine.svelte:498 data-open rotate

## Delta R
R3 fixed: apps/dashboard/src/lib/cawco/transcript/ToolGroup.svelte:493 `font-(family-name:--font-mono)` off `pre`/`code` (it stays on the place span)
R2: no `border: 0` / `border: none` source in this lane's files (the `border-none border-current` pairs were already in the converted form).
R1: no box-shadow state in this lane.

## Contracts
none

## Other
important kept: none
needs colour token: none
cross-file hook: none
Literals preserved: none. Breakpoint edges: `max-desk:` (900) on the skeleton's gutters, already converted.
