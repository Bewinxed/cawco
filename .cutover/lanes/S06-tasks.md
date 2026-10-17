# Lane S06-tasks

11 of 11 files done. All under `apps/dashboard/src/lib/cawco/tasks/`.

## Per-file table

file · rules moved · residual by kind (1/2/3/4/5) · literals preserved · breakpoint edges · STOPs

| file | rules | 1 | 2 | 3 | 4 | 5 | literals | breakpoint edges |
|---|---|---|---|---|---|---|---|---|
| BulkBar | 19 (+1 media) | 0 | 0 | 0 | 0 | 0 | 14rem | `max-width: 639px` → `max-phone:` |
| NewTaskForm | 3 | 0 | 0 | 0 | 0 | 0 | none | none |
| PostCard | 24 | 0 | 0 | 7 | 0 | 0 | 24px, 50%, 16rem (x2) | none |
| StagesControl | 8 | 0 | 4 | 0 | 0 | 0 | none | none |
| TaskActivity | 21 | 0 | 0 | 0 | 0 | 0 | none (`grid-cols` value `var(--icon-sm) minmax(0, 1fr) auto` via `--cols`) | none |
| TaskBoard | 12 (+2 media) | 0 | 1 | 0 | 0 | 2 | minmax(15rem, 22rem), min(22rem, 80%) | `max-width: 639px` → `max-phone:`; kept literal in the kind-2 residual |
| TaskCard | 15 | 1 | 0 | 0 | 0 | 0 | 6px | none |
| TaskColumn | 25 (+1 media) | 0 | 6 | 0 | 0 | 1 | 1rem (inside `calc()`) | `max-width: 639px` → `max-phone:` |
| TaskFields | 14 | 0 | 0 | 0 | 0 | 0 | 6rem minmax(0, 1fr), 6rem | none |
| TaskFilterPopover | 8 | 0 | 0 | 0 | 0 | 0 | 3.5rem (x2) | none |
| TaskLabels | 8 | 0 | 0 | 0 | 0 | 0 | 8rem | none |

Residual totals (declarations): kind 1: 1, kind 2: 11, kind 3: 7, kind 4: 0, kind 5: 3. STOPs: none.

## Kind-5 declarations (verbatim)

- TaskBoard.svelte: `[data-slot="archive-rail"] { box-shadow: inset 0 0 0 1px var(--border-hairline); }`
- TaskBoard.svelte: `[data-slot="rail-name"] { writing-mode: vertical-rl; }` (Tailwind 4.3.3 has no writing-mode utility)
- TaskColumn.svelte: `[data-slot="column"] { box-shadow: inset 0 0 0 1px var(--border-hairline); }`

The hairline ring: `--shadow-hairline` is `0 3px 7px -2px var(--shadow-tint-2)`, not the ring, so no shadow token carries it.

## Kind-2 declarations (foreign-dom, selector anchored to an element of the file, child root inside `:global`)

- TaskBoard.svelte: `@media (max-width: 639px) { [data-slot="board"] > :global([data-slot="column"]) { scroll-snap-align: start; } }` (TaskColumn takes no class)
- TaskColumn.svelte: `li[data-moving] > :global(:first-child) { opacity: 0.6; }`
- TaskColumn.svelte: `li[data-pickable] > :global([data-slot="task-card"] [data-slot="head"]) { padding-inline-end: calc(var(--space-4) + var(--space-2)); }`
- TaskColumn.svelte: `li[data-picked] > :global([data-slot="task-card"]) { background: var(--selected-bg); }`
- TaskColumn.svelte: `[data-slot="foot"] > :global([data-slot="button"]) { inline-size: 100%; }` (NewTaskForm's Button; its `add-task` class is deleted)
- TaskColumn.svelte: `li > :global([data-slot="row-fault"]) { --fault-indent: var(--space-2); --fault-end: var(--space-2); }`
- StagesControl.svelte: `:global([data-stages-fault]) { --fault-indent: var(--space-2); --fault-end: var(--space-2); }` (RowFault is a direct child of the popover's content, which is a component, so no element of the file anchors it; `data-stages-fault` is a new data attribute on it, the `stages-fault` class is deleted)
- StagesControl.svelte: `[data-slot="list"] > li > :global([data-ask]) { --ask-indent: var(--space-2); --ask-end: var(--space-2); }` (AskHere; its `stages-ask` class is deleted)

## Needs variant / needs transition token

None.

## shadcn variant lines (delta N)

- shadcn variant: TaskColumn.svelte:85 data-closed opacity (`data-closed:opacity-50`, from `.column[data-closed] { opacity: 0.5 }`)

## shadcn/no-restyle hits (file:line, component, class): 42

```
BulkBar.svelte:153 <Button> pressable
BulkBar.svelte:178 <DropdownMenuContent> min-w-40
BulkBar.svelte:194 <PopoverContent> w-64
BulkBar.svelte:262 <PopoverContent> w-80
NewTaskForm.svelte:126 <Button> pressable
NewTaskForm.svelte:136 <Button> text-ink-muted
StagesControl.svelte:144 <PopoverContent> w-80
StagesControl.svelte:144 <PopoverContent> gap-space-2
StagesControl.svelte:205 <Skeleton> w-24
TaskActivity.svelte:290 <CollapsibleTrigger> gap-space-1
TaskActivity.svelte:290 <CollapsibleTrigger> rounded-sm
TaskActivity.svelte:290 <CollapsibleTrigger> border-0
TaskActivity.svelte:290 <CollapsibleTrigger> bg-transparent
TaskActivity.svelte:290 <CollapsibleTrigger> px-0
TaskActivity.svelte:290 <CollapsibleTrigger> py-space-1
TaskActivity.svelte:290 <CollapsibleTrigger> type-label
TaskActivity.svelte:290 <CollapsibleTrigger> text-ink-muted
TaskColumn.svelte:154 <Checkbox> opacity-0
TaskColumn.svelte:154 <Checkbox> transition-[opacity]
TaskColumn.svelte:154 <Checkbox> dur-control
TaskColumn.svelte:154 <Checkbox> ease-out
TaskColumn.svelte:154 <Checkbox> group-focus-within/card:opacity-100
TaskColumn.svelte:154 <Checkbox> group-data-picked/card:opacity-100
TaskColumn.svelte:154 <Checkbox> group-data-picking/col:opacity-100
TaskColumn.svelte:154 <Checkbox> group-hover/card:opacity-100
TaskColumn.svelte:154 <Checkbox> coarse:opacity-100
TaskFields.svelte:115 <Button> opacity-0
TaskFields.svelte:115 <Button> group-hover/value:opacity-100
TaskFields.svelte:115 <Button> focus-visible:opacity-100
TaskFields.svelte:115 <Button> coarse:opacity-100
TaskFields.svelte:165 <Button> text-ink-muted
TaskFilterPopover.svelte:100 <Button> pressable
TaskFilterPopover.svelte:128 <PopoverContent> w-80
TaskFilterPopover.svelte:164 <SelectTrigger> min-w-0
TaskFilterPopover.svelte:164 <SelectTrigger> basis-0
TaskFilterPopover.svelte:191 <SelectTrigger> min-w-0
TaskFilterPopover.svelte:191 <SelectTrigger> basis-0
TaskFilterPopover.svelte:213 <SelectTrigger> min-w-0
TaskFilterPopover.svelte:213 <SelectTrigger> basis-0
TaskFilterPopover.svelte:232 <SelectTrigger> min-w-0
TaskFilterPopover.svelte:232 <SelectTrigger> basis-0
TaskLabels.svelte:53 <Badge> gap-space-row
```

`pressable`, `w-80`, `w-64`, `min-w-40`, `w-24`, `text-ink-muted` on Button and the `Skeleton` width were on the kit components before this lane; the rest are classes that came from a `<style>` rule aimed at a kit child (`.pick`, `.drop`, `.fold-head`, `.label`).

## Cross-file hooks (delta O2)

- cross-file hook: TaskCard.svelte:104 .task-card → [data-slot="task-card"]; selected by ThreadPane.svelte:1239 (the class is deleted; TaskColumn, in this lane, is already retargeted)
- cross-file hook: TaskFilterPopover.svelte:97 .filter-trigger → [data-filter-trigger]; selected by ViewBar.svelte:243 (the Button owns its `data-slot`, so the element's existing `data-filter-trigger` hook stands in)

## Needs colour token (delta O1)

None.

## Important kept (delta P3)

None; no `!important` in these files.

## Notes for integration (what the compare may show)

- TaskActivity: the chevron's `transform: rotate(90deg)` became `rotate-90`, which is the `rotate` property in Tailwind 4, so its transition is `transition-[rotate]` (was `transition: transform`). Computed `transform` is `none` in both states now.
- TaskActivity `.who`: `font: var(--type-label)` followed by `font-size: inherit` is written `font-body font-medium leading-label`; the size is inherited either way.
- TaskLabels: the remove button's reveal was under a plain `:global(.label:hover)`; `group-hover/label:` carries the (hover: hover) and (pointer: fine) guard, as the map says.
- TaskFilterPopover: `flex: 1 1 0` is written `grow shrink basis-0` (flex-basis `0px`, not `0%`).
- RowFault and AskHere type no `style` prop (svelte-check rejects it), so their `--fault-*` / `--ask-*` custom properties stay in kind-2 residual rules (above). TaskColumn's `--pick-top` goes on the Checkbox through `style="--pick-top: calc(…)"`, which that kit component accepts.
- TaskColumn: the pick checkbox's visibility groups are named (`group/card` on the `li`, `group/col` on the section) so `focus-within` on one card does not show every tick.
- PostCard: `calc(var(--space-4) + 11px)` is written `calc(var(--space-4) + var(--space-3))` (space-3 is 11px).
- TaskBoard: the rail name's `[data-slot="rail-name"]` hook is new on the span (the class it had is deleted).
