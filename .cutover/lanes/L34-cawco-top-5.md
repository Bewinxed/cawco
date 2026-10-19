# Lane L34-cawco-top-5

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions.dev, interface-craft, ui-observer.

better-ui rules followed: outer radius = inner + padding (marks stay `rounded-xs`, the dial button `rounded-pill`); transitions name their properties (none added, existing `transition-[…]` lists kept); motion stays behind `motion-safe:` / `motion-reduce:` (the filed-task entrance is `motion-safe:` rise, `motion-reduce:` fade); hover only through the `hover:` variant; no `transition-all`.
better-layout rules followed: logical properties (`ms-`/`pe-`/`inset-x`); `min-height` not `height` on text boxes (workflow rows `min-h-`, touch floor `min-h-c-btn-h-lg`); full-height panes on `h-dvh` / `min-h-dvh`, not `100vh`; grid tracks `minmax(var(--token), 1fr)`; text beside actions can shrink (`min-w-0` kept); touch floor is the 44px `c-btn-h-lg`.

Files: 8 of 8 done.

## Per-file table
file · rules moved · residual counts (1/2/3/4/5) · literals removed · breakpoint edges · STOPs

- lib/cawco/StopTray.svelte · 0 (no `<style>`) · 0/0/0/0/0 · 16px→`--icon-md`, 18px fallback→`--space-5`, 13ch/3ch→tokens · none · none
- lib/cawco/ThreadPane.svelte · 7 (whole `<style>`: foreign-dom ×3, filed-task ×3, keyframes ×1) · 0/0/0/0/0 · 14rem→token, 74ch→`c-measure`, 60ch→`c-measure-short` · none · none
- lib/cawco/TreeMark.svelte · 1 (pseudo, `::before`/`::after` → `before:`/`after:`) · 0/0/0/0/0 · 0.25px/2ch→tokens, 1lh→`h-lh`, 5px→`--space-1` · none · none
- lib/cawco/UsageMeter.svelte · 0 (no `<style>`) · 0/0/0/0/0 · 34/3/6/14/16/15/50%/4ch/12/10/8/40/44/56px, em glyph → ladder steps, `rounded-xs/pill`, tokens · none · none
- routes/artifact/[id]/+page.svelte · 0 · 0/0/0/0/0 · 100dvh→`h-dvh`, 42%→`w-5/12` · none · none
- routes/dev/finder/+page.svelte · 1 (foreign-dom → `class="flex-1"` on Finder) · 0/0/0/0/0 · 100dvh→`h-dvh`, 34px→`c-btn-h`, 36/5px→`space-8`/`space-1` · none · none
- routes/project/[id]/view/[name]/+page.svelte · 0 · 0/0/0/0/0 · 100dvh→`min-h-dvh` · none · none
- routes/(app)/workflows/+page.svelte · 0 · 0/0/0/0/0 · 24/44/64px, grid columns → tokens, ladder · `workflow-cards:` (760px, named query) kept · none

Residual totals over the lane: none. Every `<style>` is gone.

needs variant: none beyond `has-needs-stack` (below). needs transition token: none. needs colour token: none.
cross-file hook: none (`data-slot="thread-hero"` added to ThreadPane's hero; nothing selects it outside the file).
important kept: none. shadcn variant: none. shadow kept residual: none.

## Contracts
(none declared)

## Theme additions

theme: animate filed-fade
```css
@theme {
  --animate-filed-fade: filed-fade var(--dur-pop) var(--ease-out) backwards;
  @keyframes filed-fade {
    from {
      opacity: 0;
    }
  }
}
```

theme: animate filed-rise
```css
@theme {
  --animate-filed-rise: filed-rise var(--dur-pop) var(--ease-out) backwards;
  @keyframes filed-rise {
    from {
      opacity: 0;
      translate: 0 var(--pop-rise);
    }
  }
}
```

theme: utility arrive-delay
```css
/* Each filed task's own start in its reply's cascade (ThreadPane sets --arrive-delay per card). */
@utility arrive-delay {
  animation-delay: var(--arrive-delay);
}
```

theme: utility fault-ink-muted
```css
/* A RowFault whose reason is muted: nothing failed (a not-woken note). */
@utility fault-ink-muted {
  --fault-ink: var(--ink-muted);
}
```

theme: utility clip-margin-echo
```css
/* A clipped list (overflow-x: clip) lets what grows past its edge show for one
   space-2: the working marks' echo (StopTray's sessions list). */
@utility clip-margin-echo {
  overflow-clip-margin: var(--space-2);
}
```

theme: variant has-needs-stack
```css
/* A filed task that needs you: its TaskNeedsFor stack stands inside it. */
@custom-variant has-needs-stack (&:has([data-slot="task-needs-needs-stack"]));
```

theme: component thread-pane-columns
```css
/* A thread has no tool rail: its rows are messages and event lines, so the
   transcript's rail column is the rows' own edge (the narrow-screen value of
   .tx-columns). The Transcript takes no class. */
@layer components {
  [data-slot="thread-pane-state"] .tx-columns {
    --x-rail: 0px;
  }
}
```

theme: component thread-hero-action
```css
/* The hero's starters fill the column (EmptyState's action cell takes no class). */
@layer components {
  [data-slot="thread-hero"] .kit-empty-action {
    align-self: stretch;
  }
}
```

theme: component filed-task-steps
```css
/* A task's card and what it needs of you, each a step above the next
   (TaskCard and TaskNeedsFor take no class). */
@layer components {
  [data-slot="filed-task"] > [data-task-card],
  [data-slot="filed-task"] > [data-slot="task-needs-for-needs-for"] {
    margin-block-end: var(--space-2);
  }
}
```

## Tokens
token: --c-stop-tray-status-w 13ch — the stop tray's status word column (one word plus its glyph), no ladder step is a character measure
token: --c-stop-tray-trail-w 3ch — the stop tray's trail column (`12s`, `1m`), a character measure
token: --c-tree-mark-hole-edge 0.25px — the anti-aliasing width of the status dot's cut in a tree mark's tile, a sub-pixel measure
token: --c-tree-mark-num-w 2ch — a tree mark's count box, two figures wide
token: --c-usage-cap-lh 15px — the usage strip's caption line, the second line of its fixed strip row
token: --c-usage-strip-row calc(var(--icon-md) + var(--space-1) + var(--c-usage-cap-lh)) — the usage strip's one row of cells (first line, gap, caption)
token: --c-usage-strip-home-h 56px — the usage strip's hit height on the home card (the rail's is c-btn-h-lg); no ladder step is near
token: --c-usage-pct-w 4ch — the week share's column, as wide as "100%" in the figure face
token: --c-filed-task-w 14rem — a filed task card's minimum track in a reply
token: --c-workflow-name-col 180px — the workflow list's name column minimum
token: --c-workflow-when-col 110px — the workflow list's last-run and started columns
token: --c-workflow-count-col 60px — the workflow list's run count column
token: --c-workflow-actions-col 70px — the workflow list's actions column
token: --c-workflow-row-h 64px — the workflow list's row minimum, the height its loading rows stand at so nothing moves when they swap

note: the 74ch needs-row measure is `max-w-c-measure` (72ch) and the 60ch read-failure line `max-w-c-measure-short`, per renames.md.

## Removed
removed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:149 trailing `!` on `workflow-cards:hidden` (header row) — a `workflow-cards:` variant outranks the base `grid` by Tailwind's variant order; the `!` fought nothing
removed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:211 trailing `!` on `workflow-cards:hidden` (header row) — same
removed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:254 trailing `!` on the Run button's `workflow-cards:hidden` — the shared sheet sets `.wf-btn` display at zero weight (workflows.css W1), so the variant wins
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1109 inline `--strip-hit-h` custom property switched in script on `variant` — the strip already carries `data-variant`; the triggers read it with `group-variant-home/strip:`
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1079 the `--foot-touch` inline style on the sheet's Open usage button — a class (`h-c-btn-h-lg`)
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:939 `--fade-len: 40px` on the accounts scroller (:939) — `.kit-edge-fade-block` sets the same 40px
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:538 `leading-(--more-lh)` 16px on the "+N" slot — the slot is a 16px grid centring its text; the line-height set no box
removed: apps/dashboard/src/routes/artifact/[id]/+page.svelte:91 `--tab-h: 100dvh` custom property — `h-dvh`
removed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:270 `--summary-min` custom property — the 44px touch floor is `c-btn-h-lg`

removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1003 `mx-(--seam-pull)` and `--seam-pull: calc(-1 * var(--space-3))` on the provider hairline — a negative margin cancelling the group's px-space-3
removed: apps/dashboard/src/lib/cawco/StopTray.svelte:944 `mx-(--pull-x) my-(--pull-y)`, `--pull-x`, `--pull-y` and the list's `px-space-2 py-space-1` — negative margins cancelling the list's own padding
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:969 `--org-gap` and the sibling-selector arbitrary variant on the wall — see the `fixed:` line at :981
removed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:507 `[&_svg]:size-full` on the three Claude mark wrappers (:507, :881, :1040)

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1109 DrawerTrigger press-tint flex h-c-btn-h-lg … hover:bg-surface-hover … — a bare-row trigger variant ("strip": the whole row is the button, hover/open wash on the ground it stands on)
kit-swap: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1127 PopoverTrigger press-tint flex h-c-btn-h-lg … hover:bg-surface-hover … — the same "strip" trigger variant
kit-swap: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1079 Button h-c-btn-h-lg w-full — a full-width touch-floor Button size/variant (`size="lg"` fill)
kit-swap: apps/dashboard/src/lib/cawco/StopTray.svelte:847 Spinner size-icon-md — a Spinner size (`md`)
kit-swap: apps/dashboard/src/lib/cawco/ThreadPane.svelte:1123 Alert items-center — an Alert variant that centres its row (the action beside a one-line description)
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:89 DropdownMenu.PendingItem min-h-c-top-bar-h flex-wrap — a PendingItem `look="titled"` that wraps its description under the label
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:101 DropdownMenu.PendingItem min-h-c-top-bar-h flex-wrap — the same `titled` look
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:171 Skeleton h-icon-md — Skeleton `height="line"` (loading rows)
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:173 Skeleton h-icon-lg — Skeleton `height` for a status chip
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:175 Skeleton h-icon-md — Skeleton `height="line"`
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:178 Skeleton h-icon-md — Skeleton `height="line"`
kit-swap: apps/dashboard/src/routes/(app)/workflows/+page.svelte:181 Skeleton h-space-8 — Skeleton `height` for a button

shadcn/no-restyle: the same sites, by file:line and component: StopTray.svelte:847 Spinner size-icon-md; ThreadPane.svelte:1123 Alert items-center; UsageMeter.svelte:1079 Button h-c-btn-h-lg; UsageMeter.svelte:1109 DrawerTrigger and :1129 PopoverTrigger (the strip classes above); workflows/+page.svelte:89, :101 DropdownMenu.PendingItem; :171, :173, :175, :178, :181 Skeleton.

## Fixed
fixed: apps/dashboard/src/routes/dev/finder/+page.svelte:101 `bg-(--background)` → `bg-surface-page` — DESIGN.md: the page ground is the role token, not the raw `--background`
fixed: apps/dashboard/src/lib/cawco/ThreadPane.svelte:865 the filed-task cascade is one set of utilities (`motion-safe:` rise, `motion-reduce:` fade, per-card delay through `--arrive-delay`) instead of a scoped `[data-arrive]` rule — DESIGN.md Motion: movement only under motion-safe
fixed: apps/dashboard/src/lib/cawco/TreeMark.svelte:167 deck cards' shade and cast are `after:`/`before:` utilities on the card (no scoped `<style>`) — Tailwind `before:`/`after:` variants
fixed: apps/dashboard/src/routes/(app)/workflows/+page.svelte:143 grid columns read named `--c-workflow-*` tokens — DESIGN.md Layout: no hand-kept magic numbers
fixed: apps/dashboard/src/routes/dev/finder/+page.svelte:179 Finder takes `class="flex-1"` from its sheet (the `:global` rule is gone) — a child component given its class, not styled from outside

fixed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1003 the provider hairline runs edge to edge as a `before:` rule on the `hr`, positioned against the now-`relative` scroller (UsageMeter.svelte:934), instead of a negative inline margin cancelling the group's padding — DESIGN.md Layout: no padding cancelled by margin
fixed: apps/dashboard/src/lib/cawco/StopTray.svelte:944 the sessions list clips its inline overflow with `overflow-clip-margin` (theme utility `clip-margin-echo`), so the echo leaves the list without padding that negative margins cancel — DESIGN.md Layout
fixed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:981 an org head after the first block spaces itself with `group-not-first/block:mt-space-2` on the head, replacing the sibling selector `[&>[data-slot=block]+[data-slot=block]>h4]:mt-(--org-gap)` — one rule per element
fixed: apps/dashboard/src/lib/cawco/UsageMeter.svelte:507 the Claude mark wrappers (also :881, :1040) pass `class="size-full"` to ClaudeIcon instead of `[&_svg]:size-full`

## Gaps
gap: apps/dashboard/src/lib/cawco/UsageMeter.svelte:590 `[&_svg]:size-full` on the OpenCode mark wrapper (and :806, the Go cell's) — OpenCodeLogo.svelte:8 (`<svg>`) takes no `class`; it should accept one, so the wrapper passes `class="size-full"` as the Claude marks now do (DESIGN.md: a class is a style)
gap: apps/dashboard/src/lib/cawco/UsageMeter.svelte:1066 `[&_svg]:size-full` on a provider note's mark wrapper — the marks come from `notes` (each a different icon component, built where the note is made, UsageMeter.svelte:412 and the other providers' icon modules), so passing `class="size-full"` needs those icon components to take a class: OpenCodeLogo.svelte:8 is one

## Notes
- UsageMeter.svelte:493 the strip's row is a fixed `c-usage-strip-row` with a clipped wrap row by design (the face comment: opencode's cell wraps onto a second row the strip does not show, rather than Claude's answer being cut); not scar tissue, so no gap.
- `overflow-clip-margin` (clip-margin-echo) is unsupported where the engine lacks it; there the echo is clipped at the list edge. Not verified in a browser.
- StopTray.svelte, UsageMeter.svelte: the 18px `--mark-size` fallback is `--space-5` (TreeMark's own default); the 12px/10px wall tracks are `--icon-sm`.
- ThreadPane.svelte: `row-start-(--task-span)` with `span 2` is `row-span-2`; the `.not-woken` class was only styled by the removed rule (the `data-not-woken` hook stays).
- UsageMeter.svelte: the popover's `--usage-pop-w` stays a `style` prop on `Popover.Content` (a kit component with no width prop); its 16px margin is `2 * var(--space-2)`.

## Design critique (interface-craft, from markup and classes; no bench renders these files in the workspace, so ui-observer is Not verified)
- Hierarchy and grouping: the usage popover and strip now sit on the spacing ladder (space-2/3/4), so its groups read at one rhythm; no finding beyond the gaps above.
- Touch floor: the workflow rows and the usage strip triggers use `c-btn-h-lg` (44px) at `coarse:`/rest; the workflow name link is `space-7` under a fine pointer and 44px under `coarse:`.
- Motion: the filed-task cascade moves only under `motion-safe:` and fades under `motion-reduce:`; no `transition-all`; the existing `transition-[…]` lists name their properties.
- Not verified: rendered layout of every file (no browser run); the 4px/3px→ladder moves in the usage strip (cell gap 3→4, mark radius 3→5, mark 14 = space-4) change the strip by at most 2px.
