# Lane L28-cawco-tasks-1

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding (no file in the lane has a transition directive or `@keyframes`; emil-design-eng and transitions-dev not needed), then interface-craft and ui-observer before the report.

better-layout rules followed: logical properties for anything that mirrors (`ml-auto` → `ms-auto`, `start-`/`pe-`); a column grid track is `minmax` of tokens with `min-width: 0` kept; text containers size by `max-h`/`min-h`, never a fixed height; the board's breakpoint is a content breakpoint (`max-phone:`) and its scroll edge keeps its cue (`kit-edge-fade`).
better-ui rules followed: outer radius from role (card `rounded-md`, media `rounded-sm`, mark `rounded-pill`); shadows from the vocabulary (`shadow-tile`); motion gated by `motion-safe:` (the live dot's breath); hover only through the guarded `hover:`; transitions name their properties (`transition-[background-color,opacity]`).

## Files
| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOP |
|---|---|---|---|---|---|
| tasks/BulkBar.svelte | 0 `<style>`; 1 literal → token | 0/0/0/0/0 | 0 | none | none |
| tasks/PostCard.svelte | 20 (the merge left `.parts .count .over .fact dt dd .name .sentence` and the thread joint unconverted) | 0/0/0/0/0 | 0 | none | none |
| tasks/StagesControl.svelte | 2 (foreign-dom → theme component) | 0/0/0/0/0 | 0 | none | none |
| tasks/TaskBoard.svelte | 1 (foreign-dom → utility on TaskColumn's root); 2 literals → tokens | 0/0/0/0/0 | 0 | `(max-width: 639px)` → `max-phone:` | none |
| tasks/TaskCard.svelte | dead `.dot.live` rule → `motion-safe:animate-breath`; literal 6px → `space-2` | 0/0/0/0/0 | 0 | none | none |
| tasks/TaskColumn.svelte | 4 (3 → group variants on TaskCard, 1 `row-fault` + 1 `foot` button → theme component); literal 1rem → `--icon-md` | 0/0/0/0/0 | 0 | none | none |
| tasks/TaskFields.svelte | 2 literals → tokens | 0/0/0/0/0 | 0 | none | none |
| tasks/TaskFilterPopover.svelte | 2 literals → one token | 0/0/0/0/0 | 0 | none | none |

needs variant: none · needs transition token: none · kind-5 declarations: none.

## Contracts
(none)

cross-file hook: none new. Hooks added on elements this lane renders, selected only by this lane's own theme components: `data-stages-fault` (existing), `data-stages-list` (StagesControl.svelte), `data-task-column-fault`, `data-task-column-foot` (TaskColumn.svelte).

shadcn/no-restyle hits: none.
shadcn variant: none.
important kept: none.

## Theme additions
theme: animate breath
```css
@theme {
  --animate-breath: breath var(--breath) var(--ease-in-out) infinite;
}
```
(`@keyframes breath` is the shared one in app.css; the animation is the one DESIGN.md gives every live-work breather.)

theme: component stages-control-insets
```css
@layer components {
  [data-stages-fault] {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);
  }
  [data-stages-list] > li > [data-ask] {
    --ask-indent: var(--space-2);
    --ask-end: var(--space-2);
  }
}
```

theme: component task-column-insets
```css
@layer components {
  [data-task-column-fault] {
    --fault-indent: var(--space-2);
    --fault-end: var(--space-2);
  }
  [data-task-column-foot] > [data-slot="button"] {
    inline-size: 100%;
  }
}
```

## Kit swaps
(none)

## Tokens
token: --c-bulk-labels-max-h 14rem — the Label popover's list of the project's labels scrolls past this height; a real dimension, no ladder step is near.
token: --c-post-media-max-h 16rem — the tallest a post's picture or video stands under its card; a real dimension.
token: --c-task-column-min 15rem — a board column's narrowest width.
token: --c-task-column-max 22rem — a board column's widest width, and the open Archived column's cap.
token: --c-task-key-w 6rem — the key column of a task's Fields, matching the Relations' column so the two parts' values stand on one line; also the new field's name basis.
token: --c-filter-label-w 3.5rem — the Filter popover's name column (Label, Type).

## Removed
removed: PostCard.svelte (thread joint) the `+ 11px` and the hand-set 24px mark — the joint's x is now `space-4 + c-mark / 2 - space-row / 2`, derived from the mark it joins, so the two cannot drift.
removed: TaskCard.svelte (live dot) the `.dot.live` `<style>` rule — it matched no element, so the dot did not breathe; the dot now takes `animate-breath`.
removed: TaskColumn.svelte `li > :first-child`, `[data-task-card] [data-task-head]` and `[data-task-card]` residuals — they reached into TaskCard's DOM from outside; TaskCard now reads the column's state through `group/task`.
removed: BulkBar.svelte `style:--off-bottom-phone={"…"}` string-in-braces → plain attribute.

## Fixed
fixed: PostCard.svelte:77 `.parts`, `.count`, `.over`, `.fact`, `dt`, `dd`, `.name`, `.sentence` had markup from main and no rules after the merge — restored as utilities (`over` is now `data-over`); the DESIGN.md Role Not Size Rule roles kept (community = label, plan = body).
fixed: TaskCard.svelte:182 the live dot breathes again — DESIGN.md "Live work breathes" names a task card's live dot.
fixed: TaskColumn.svelte `max-phone:snap-start` on the column's own root instead of a `:global` rule on the board.
fixed: StagesControl.svelte `ml-auto` → `ms-auto`.

## Gaps
gap: StagesControl.svelte:158, TaskColumn.svelte RowFault/AskHere take their insets only as `--fault-indent`/`--fault-end`/`--ask-indent`/`--ask-end` and no prop — a utility cannot set a custom property, so the lane declares theme components; RowFault and AskHere want `indent`/`end` props — DESIGN.md "Every row stands on one grid".
gap: PostCard.svelte mark is `c-mark` (26px, DESIGN.md Identity marks) where the old was 24px; TaskCard's live dot is `space-2` (7px) where the old was 6px — ladder steps per delta S2.
