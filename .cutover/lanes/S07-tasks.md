# Lane S07-tasks

## Per-file table
file · rules moved · residual (1/2/3/4/5) · literals preserved · breakpoint edges · STOPs

| file | rules moved (approx.) | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOP |
|---|---|---|---|---|---|
| tasks/TaskNeedsFor.svelte | 1 | 0/0/0/0/0 | none | none | none |
| tasks/stage/ArtifactStage.svelte | 1 | 0/0/0/0/0 | 42% (block width) | none | none |
| tasks/TextSection.svelte | 6 | 0/0/0/0/0 | none | none | none |
| tasks/TodoList.svelte | 15 | 0/0/0/0/0 | none | none | none |
| tasks/TaskRelations.svelte | 13 | 0/0/0/0/0 | `6rem minmax(0, 1fr)`, 14rem, 20rem (popover width) | none | none |
| tasks/TaskOutput.svelte | 22 | 0/0/0/0/1 | 6rem, 20rem, 24rem | `(hover:hover) and (pointer:fine)` mapped to `hover:` | none |
| tasks/TaskNeeds.svelte | 19 | 0/0/0/0/1 | 12rem | `(pointer: coarse)` to `coarse:` | none |
| tasks/TaskReview.svelte | 40 | 0/0/0/0/0 | 44px, grid templates, safe-area max() | `@container task-frame (min-width: 56rem)` to `@task-frame/task-frame:`; `(pointer: coarse)` | none |
| tasks/TaskTable.svelte | 35 | 0/0/3/0/0 | col widths 6.5/12/14/6/7rem, calc(1rem + 2 * space-3), grid templates | `(max-width: 639px)` to `max-phone:`; `@container (width < 900px)` to `@max-decisions-900px:` (exact 900) | none |
| tasks/TaskPane.svelte | 24 | 0/0/0/0/0 | 6rem, 0.5rem | none | none |

Residual sum: kind 1: 0, kind 2: 0, kind 3: 3 (TaskTable `[data-slot="title"]::after`: position, inset, content), kind 4: 0, kind 5: 2.

## Kind-5 declarations, verbatim
- TaskOutput.svelte: `figure[data-compact] [data-slot="markdown"] { mask-image: linear-gradient(to bottom, var(--mask-opaque) calc(100% - var(--space-6)), transparent) }`
- TaskNeeds.svelte: `[data-slot="needs"] { --needs-ground: color-mix(in oklab, var(--status-attn-bg) 45%, var(--surface-raised)) }` (a custom property holding a colour mix of two tokens; eslint refuses it in `style:`, so it lives in the residual, read by `bg-(--needs-ground)`)

## needs variant
- data-task-table-col (values pick/id/title/stage/labels/todos/created/updated): no named variant exists. TaskTable.svelte picks per-column classes by a ternary of full static class strings instead.

## needs transition token
none

## needs colour token (delta O1)
- needs colour token: --mask-opaque: black (apps/dashboard/src/lib/cawco/tasks/TaskOutput.svelte:216)

## cross-file hook (delta O2)
- cross-file hook: tasks/TaskNeedsFor.svelte:75 .needs-for -> [data-slot="task-needs-for-needs-for"]; selected by lib/cawco/ThreadPane.svelte:1242 (`.thread-task > :global(.needs-for)`)
- cross-file hook: tasks/TaskNeeds.svelte:121 .needs-stack -> [data-slot="task-needs-needs-stack"]; selected by lib/cawco/ThreadPane.svelte:1247 (`.thread-task:has(:global(.needs-stack))`)

## important kept (delta P3)
none (no source `!important`)

## Notes on equivalences (not value changes)
- TaskReview.svelte: `grid-template-areas`/`grid-area` has no utility. The three bands sit in DOM order, so one-column auto-placement gives the same cells; the wide layout adds `col-span-full` on the decision band. Same layout, the `grid-area` values are not declared.
- TaskReview / TaskTable / TaskNeeds: a descendant rule `.x .y` sits on `y` through `group/<name>` + `group-data-*:`; the `.compact` class on the review became `data-compact`, `.open` on the words `data-more`, `.framed` on the stage `data-framed`, `.fail` on `ended` `data-fail`, `.words-staged` `data-words-staged`, and a wide-and-not-compact state `data-roomy` on the output body.
- TaskPane.svelte: `.task-frame > :global(.alert)` matched nothing (kit Alert has no `alert` class), so it is not carried over; the skeleton keeps its inline margin. `class="task-card"` on `SideSurface` was dropped (no rule, no cross-file selector for it; eslint flagged it unknown).
- TaskRelations.svelte: popover `w-80` (unknown here) is `w-(--popover-w)` with `style="--popover-w: 20rem"`.
- TextSection / TodoList: the global `kit-section-head` class stays on its h3; its scoped override rules moved onto that element (min-h/m/px).
- `font: var(--type-meta)` + `font-family: mono` pairs use `text-meta font-mono liga-none` (text-meta carries no family, so no two utilities set one property; its size, line-height 1.35 and weight 400 equal type-meta).

## shadcn/no-restyle hits (117; file:line:col, class, component)
- tasks/TaskNeeds.svelte:214:22 "border-transparent" on <Button>
- tasks/TaskNeeds.svelte:214:22 "bg-status-fail-bg" on <Button>
- tasks/TaskNeeds.svelte:214:22 "text-status-fail-ink" on <Button>
- tasks/TaskNeeds.svelte:214:22 "hover:bg-status-fail-bg" on <Button>
- tasks/TaskNeeds.svelte:214:22 "hover:text-status-fail-ink" on <Button>
- tasks/TaskNeeds.svelte:226:22 "border-transparent" on <Button>
- tasks/TaskNeeds.svelte:226:22 "bg-status-done-bg" on <Button>
- tasks/TaskNeeds.svelte:226:22 "text-status-done-ink" on <Button>
- tasks/TaskNeeds.svelte:226:22 "hover:bg-status-done-bg" on <Button>
- tasks/TaskNeeds.svelte:226:22 "hover:text-status-done-ink" on <Button>
- tasks/TaskPane.svelte:465:20 "text-title" on <Input>
- tasks/TaskPane.svelte:542:18 "rounded-md" on <Skeleton>
- tasks/TaskTable.svelte:212:12 "border-spacing-(--cell-gap)" on <Table>
- tasks/TaskTable.svelte:217:27 "border-0" on <TableRow>
- tasks/TaskTable.svelte:217:27 "bg-surface-band" on <TableRow>
- tasks/TaskTable.svelte:227:19 "px-space-3" on <TableHead>
- tasks/TaskTable.svelte:227:19 "type-label" on <TableHead>
- tasks/TaskTable.svelte:227:19 "tracking-caps" on <TableHead>
- tasks/TaskTable.svelte:227:19 "uppercase" on <TableHead>
- tasks/TaskTable.svelte:227:19 "text-ink-muted" on <TableHead>
- tasks/TaskTable.svelte:229:21 "px-space-3" on <TableHead>
- tasks/TaskTable.svelte:229:21 "type-label" on <TableHead>
- tasks/TaskTable.svelte:229:21 "tracking-caps" on <TableHead>
- tasks/TaskTable.svelte:229:21 "uppercase" on <TableHead>
- tasks/TaskTable.svelte:229:21 "text-ink-muted" on <TableHead>
- tasks/TaskTable.svelte:230:21 "px-space-3" on <TableHead>
- tasks/TaskTable.svelte:230:21 "type-label" on <TableHead>
- tasks/TaskTable.svelte:230:21 "tracking-caps" on <TableHead>
- tasks/TaskTable.svelte:230:21 "uppercase" on <TableHead>
- tasks/TaskTable.svelte:230:21 "text-ink-muted" on <TableHead>
- tasks/TaskTable.svelte:293:18 "border-b-0" on <TableRow>
- tasks/TaskTable.svelte:293:18 "data-picked:max-phone:bg-selected-bg" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:gap-x-space-2" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:gap-y-space-1" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:py-space-2" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:px-space-3" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:border-b" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:border-border-hairline" on <TableRow>
- tasks/TaskTable.svelte:293:18 "max-phone:last:border-b-0" on <TableRow>
- tasks/TaskTable.svelte:300:19 "py-0" on <TableCell>
- tasks/TaskTable.svelte:300:19 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:300:19 "border-b" on <TableCell>
- tasks/TaskTable.svelte:300:19 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:300:19 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:300:19 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:300:19 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:300:19 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:300:19 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:300:19 "max-phone:min-w-0" on <TableCell>
- tasks/TaskTable.svelte:300:19 "max-phone:p-0" on <TableCell>
- tasks/TaskTable.svelte:300:19 "max-phone:border-0" on <TableCell>
- tasks/TaskTable.svelte:302:21 "py-0" on <TableCell>
- tasks/TaskTable.svelte:302:21 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:302:21 "border-b" on <TableCell>
- tasks/TaskTable.svelte:302:21 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:302:21 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:302:21 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:302:21 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:302:21 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:302:21 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:302:21 "max-phone:min-w-0" on <TableCell>
- tasks/TaskTable.svelte:302:21 "max-phone:p-0" on <TableCell>
- tasks/TaskTable.svelte:302:21 "max-phone:border-0" on <TableCell>
- tasks/TaskTable.svelte:304:23 "py-0" on <TableCell>
- tasks/TaskTable.svelte:304:23 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:304:23 "border-b" on <TableCell>
- tasks/TaskTable.svelte:304:23 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:304:23 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:304:23 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:304:23 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:304:23 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:304:23 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:306:25 "py-0" on <TableCell>
- tasks/TaskTable.svelte:306:25 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:306:25 "border-b" on <TableCell>
- tasks/TaskTable.svelte:306:25 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:306:25 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:306:25 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:306:25 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:306:25 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:306:25 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:308:27 "py-0" on <TableCell>
- tasks/TaskTable.svelte:308:27 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:308:27 "border-b" on <TableCell>
- tasks/TaskTable.svelte:308:27 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:308:27 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:308:27 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:308:27 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:308:27 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:308:27 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:308:27 "max-phone:min-w-0" on <TableCell>
- tasks/TaskTable.svelte:308:27 "max-phone:p-0" on <TableCell>
- tasks/TaskTable.svelte:308:27 "max-phone:border-0" on <TableCell>
- tasks/TaskTable.svelte:309:27 "py-0" on <TableCell>
- tasks/TaskTable.svelte:309:27 "px-space-3" on <TableCell>
- tasks/TaskTable.svelte:309:27 "border-b" on <TableCell>
- tasks/TaskTable.svelte:309:27 "border-border-hairline" on <TableCell>
- tasks/TaskTable.svelte:309:27 "type-meta" on <TableCell>
- tasks/TaskTable.svelte:309:27 "text-ink-muted" on <TableCell>
- tasks/TaskTable.svelte:309:27 "group-last/row:border-b-0" on <TableCell>
- tasks/TaskTable.svelte:309:27 "group-data-picked/row:bg-selected-bg" on <TableCell>
- tasks/TaskTable.svelte:309:27 "group-data-picked/row:max-phone:bg-transparent" on <TableCell>
- tasks/TaskTable.svelte:309:27 "max-phone:min-w-0" on <TableCell>
- tasks/TaskTable.svelte:309:27 "max-phone:p-0" on <TableCell>
- tasks/TaskTable.svelte:309:27 "max-phone:border-0" on <TableCell>
- tasks/TextSection.svelte:54:16 "count" on <Button>
- tasks/TextSection.svelte:67:16 "font-mono" on <Textarea>
- tasks/TextSection.svelte:67:16 "text-label" on <Textarea>
- tasks/TodoList.svelte:125:14 "text-label" on <Input>
- tasks/TodoList.svelte:197:24 "text-label" on <Input>
- tasks/TodoList.svelte:238:22 "text-ink-muted" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:opacity-0" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:transition-[opacity]" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:dur-control" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:ease-out" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:group-hover:opacity-100" on <Button>
- tasks/TodoList.svelte:238:22 "can-hover:focus-visible:opacity-100" on <Button>

## shadcn variant (delta N)
none

## Contracts
contract: apps/dashboard/src/lib/cawco/tasks/TaskNeeds.svelte:214 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskNeeds.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskNeeds.svelte:226 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskNeeds.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:465 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:542 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:212 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:217 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:227 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:229 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:230 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:293 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:300 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:302 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:304 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:306 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:308 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:309 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TextSection.svelte:54 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TextSection.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TextSection.svelte:67 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TextSection.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TodoList.svelte:125 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TodoList.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TodoList.svelte:197 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TodoList.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
contract: apps/dashboard/src/lib/cawco/tasks/TodoList.svelte:238 shadcn/no-restyle | apps/dashboard/src/lib/cawco/tasks/TodoList.svelte kit component (see no-restyle list above) | the kit component needs a variant or a parent wrapper for this treatment
