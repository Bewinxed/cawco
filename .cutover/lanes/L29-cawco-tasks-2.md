# Lane L29-cawco-tasks-2

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft, ui-observer. No file in the list has a transition, animation or keyframes, so emil-design-eng and transitions-dev were not loaded.

better-ui rules followed: hover only through the house `hover:` variant (already compiled under the hover query); the kit's own radius tokens kept (rounded-sm on the output frame and its media, rounded-xs on the label field), no `transition-all`, no new motion; image outline and shadow vocabulary untouched. better-layout rules followed: widths and caps through named tokens, never fixed `width`/`height` on text boxes (`max-h` caps only, `min-h` on chips); `grid-cols-1` and `minmax(0, 1fr)` tracks keep children from overflowing; coarse pointers take the 44px touch floor through `c-btn-h-lg`; logical properties kept.

## Per-file table

| file | what moved | `<style>` left | literals left |
|---|---|---|---|
| TaskLabels.svelte | field width 8rem → `w-(--c-task-label-field-w)` | none | 0 |
| TaskNeeds.svelte | args cap 12rem → `max-h-(--c-task-args-max-h)` | none | 0 |
| TaskOutput.svelte | caps 6rem / 20rem / 24rem → three tokens; dead `glyph` and `image` classes (rules lost in the merge) → `size-icon-sm` and `block p-0 rounded-sm cursor-zoom-in` | none | 0 |
| TaskPane.svelte | stage skeleton width 6rem → token; Retry gap 0.5rem → `mt-space-2`; skeleton gap 0.5rem → `mt-space-2`; body skeleton 6rem → Skeleton `height="plot"` (96px) | none | 0 |
| TaskRelations.svelte | edge label column 6rem → token; popover 20rem → `width="wide"`; candidates cap 14rem → token | none | 0 |
| TaskReview.svelte | 44px `--hit` → `c-btn-h-lg`; `--review-cols-one` → `grid-cols-1`; literal markers removed | none | 0 |
| TaskTable.svelte | column widths in `COL_W` → tokens; `Table layout="ledger"` (replaces `border-separate table-fixed` and `--cell-gap`); `TableHead variant="band"` (replaces `caps` plus `h-c-toolbar-ctl`); `--pick-row` → `row-start-1 row-span-2`; the `<style>` pseudo → `after:absolute after:inset-0` | removed | 0 |
| stage/ArtifactStage.svelte | bar 42% → `w-2/5` | none | 0 |

8 of 8 files done.

## Kit swaps
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskRelations.svelte:129 Popover.Content w-(--popover-w) → width="wide" (320px, the 20rem it held) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:227 Table border-separate table-fixed --cell-gap → layout="ledger" — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:243 TableHead variant="caps" h-c-toolbar-ctl → variant="band" — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:601 Skeleton h-(--skeleton-h) (96px) → height="plot" (h-24) — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskOutput.svelte:163 Skeleton h-space-4 (×3; also TaskPane.svelte:602-604) — Skeleton height="line-text" (14px, a text line's bar)
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:469 Skeleton h-c-btn-h-sm — Skeleton height="control-sm" (30px, a small control's placeholder)
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:601 Skeleton h-icon-md w-1/3 — Skeleton height="glyph" (16px)
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:524 ProviderLogo size-icon-sm — ProviderLogo size="sm"
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskTable.svelte:231 TableHeader max-phone:hidden; :227 Table and :298 TableBody max-phone:block; :304 TableRow max-phone:grid max-phone:grid-cols-(--row-cols) group-data-pickable/ledger:max-phone:grid-cols-(--row-cols-pick) max-phone:items-center; TableHead/TableCell h-c-btn-h-lg text-end @max-decisions-900px:hidden max-phone:block max-phone:h-auto max-phone:hidden (lines 243, 244, 312-323) — TableRow variant="cards-on-phone" and TableCell variant for the task ledger's two-line phone card

## shadcn/no-restyle hits (final, file:line component class)
TaskOutput.svelte:163,164,165 Skeleton h-space-4
TaskPane.svelte:469 Skeleton h-c-btn-h-sm; :524 ProviderLogo size-icon-sm; :601 Skeleton h-icon-md; :602,603,604 Skeleton h-space-4
TaskTable.svelte:227 Table max-phone:block; :231 TableHeader max-phone:hidden; :243 TableHead @max-decisions-900px:hidden text-end; :244 TableHead text-end; :298 TableBody max-phone:block; :304 TableRow max-phone:grid, max-phone:grid-cols-(--row-cols), group-data-pickable/ledger:max-phone:grid-cols-(--row-cols-pick), max-phone:items-center; :312-323 TableCell h-c-btn-h-lg, text-end, max-phone:block, max-phone:h-auto, max-phone:hidden, @max-decisions-900px:hidden

## Contracts
None declared. No `deferred-file:` lines.

## Theme additions
None.

## Tokens
token: --c-task-label-field-w 128px — the new-label field's width in a task's label row (TaskLabels); a component dimension, no ladder step
token: --c-task-args-max-h 192px — an approved action's argument block caps here and scrolls (TaskNeeds); component dimension
token: --c-task-output-compact-h 96px — a compact output's body cap (markdown and image, the Made list); component dimension
token: --c-task-output-image-h 320px — an output image's height cap (TaskOutput); component dimension
token: --c-task-output-video-h 384px — an output video's height cap (TaskOutput); component dimension
token: --c-task-stage-skeleton-w 96px — the stage control's placeholder width while the task reads (TaskPane); component dimension
token: --c-task-edge-label-w 96px — the relation name column ("Found in", "Waited on by") in TaskRelations; component dimension
token: --c-task-candidates-max-h 224px — the link picker's candidate list cap (TaskRelations); component dimension
token: --c-task-col-id-w 104px — the task ledger's Id column (TaskTable COL_W); a table column width
token: --c-task-col-stage-w 192px — the task ledger's Stage column; a table column width
token: --c-task-col-labels-w 224px — the task ledger's Labels column; a table column width
token: --c-task-col-todos-w 96px — the task ledger's To-dos column; a table column width
token: --c-task-col-time-w 112px — the task ledger's Created and Updated columns; a table column width

## Removed
removed: TaskTable.svelte:420 `[data-slot="title"]::after` residual — `after:absolute after:inset-0` on the link; Tailwind adds the empty content itself
removed: TaskOutput.svelte:142,182 `glyph` and `image` classes — no rule selects them since the merge dropped main's `<style>`; the styles they carried are now utilities
removed: TaskTable.svelte `--cell-gap`, `--pick-row`, `border-separate table-fixed` — the kit's `layout="ledger"` and `row-start-1 row-span-2` say the same
removed: TaskReview.svelte `--review-cols-one`, `--hit` — `grid-cols-1` and `c-btn-h-lg`
removed: TaskPane.svelte, TaskRelations.svelte inline `style="--x: …"` strings and the `<!-- literal -->` markers in all eight files

## Gaps
gap: TaskReview.svelte:277,295 attachment chips hold a 24px box and a 44px coarse floor with calc margins (`my-(--attach-my)`, `-mx-space-1`) — DESIGN.md, Focus and hit areas: the house recipe is a `touch-hit` chip, which adds the hit area without moving layout
gap: TaskPane.svelte:601 the review placeholder borrows Skeleton `height="plot"` only for its 96px; it is not a plot — the kit needs a role-named height
gap: TaskTable.svelte:304 the phone card layout (grid rows and `--row-cols` templates) is a table recipe written on the consumer — DESIGN.md, Fleet board: "under 640px each row becomes a two-line card"; belongs in the kit Table
gap: ArtifactStage.svelte:73 a hand-rolled `kit-skeleton` span stands where the kit's Skeleton goes; it keeps its own `data-slot="block"` hook, and the swap needs `height` outside Skeleton's contract
gap: TaskOutput.svelte:129 `--markdown-fade` builds a mask gradient through a custom property; the theme has no mask-fade utility

## fixed lines
fixed: TaskTable.svelte:224 head cells take the band's own height (`variant="band"`) instead of a repeated `h-c-toolbar-ctl` — DESIGN.md, Density: "a 32px header band"
fixed: ArtifactStage.svelte:75 skeleton bar 42% → `w-2/5` — the width fractions the Skeleton calls already use
fixed: TaskPane.svelte:588, :597 0.5rem → `space-2` (the nearest ladder step, 7px) — DESIGN.md, Layout: spacing ladder

## Design critique (interface-craft, from markup; no bench renders these panes in this workspace, so ui-observer measurements are Not verified)
fixed: the output frame, its row, body and media stay on tokens (rounded-sm, border-well, surface-well); the image button now carries its own radius and a zoom cursor, where the merge had dropped them
fixed: the ledger's head and cells share one column-width token per column, so head and cell can no longer drift
gap: the review pane, task table and output frame were not rendered; layout at 320px and 200% zoom is Not verified
