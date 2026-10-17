# Lane S18-misc

13 files. Rules moved = `<style>` rules moved onto classes. Residual counts are kinds 1/2/3/4/5.

## Per-file table

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges | STOPs |
|---|---|---|---|---|---|
| join/AddMachineLink.svelte | 3 (+hover, focus-visible) | 0/0/0/0/1 | 3px underline offset | none | none |
| join/CheckInStatus.svelte | 3 | 0/0/0/0/0 | 8px, 6px | none | none |
| join/CopyBox.svelte | 4 (+hover, svg child) | 0/0/0/0/0 | 8px, 5px, 10px, 1.4, 5px, 26px, 8px, 13px, 1px (--hit-edge) | none | none |
| join/JoinedRow.svelte | 7 | 0/1/0/0/0 | 10px | none | none |
| lightbox/Lightbox.svelte | 5 (doc sheet, head, name, body, view) | 1/65/0/0/0 | min(100%, 60rem), min(86dvh, 100%) | none | none |
| motion/Rail.svelte | 9 | 1/0/0/0/1 | calc(100% + 6px), 6px, 10px | none | none |
| routines/ActionsTable.svelte | 11 | 0/0/0/0/1 | 6rem | none | none |
| routines/RoutineDetail.svelte | 16 | 0/1/0/0/2 | 1lh, 72ch, 6rem, 4.5rem, 11rem, 8rem, 5rem, 3px | `@container routines-ledger (min-width: 400px)` to `@routines-ledger-400px/routines-ledger:`; `(max-width: 399px)` to `@max-routines-ledger-399px/routines-ledger:` (width < 399px, 1px edge) | none |
| routines/RunStatus.svelte | 9 | 0/0/0/0/0 | none | none | none |
| updates/ChannelCards.svelte | 21 | 2/0/0/5/2 | 8px, 50% 56.84% | none | none |
| updates/ReleaseNotes.svelte | 6 | 0/11/1/0/0 | 6px | none | none |
| updates/UpdateCell.svelte | 6 | 5/0/0/0/0 | 10rem | none | none |
| updates/UpdateTable.svelte | 6 | 0/0/0/0/0 | `inset 0 0 0 1px var(--border-hairline)`, `minmax(0, 1fr) auto` | `(max-width: 639px)` to `max-phone:` | none |

Lane sums (residual check): keyframes 9, foreign-dom 78, pseudo 1, svg-paint 5, unmapped 7.

## Kind-5 declarations (verbatim)

- join/AddMachineLink.svelte: `button { font: inherit; }`
- motion/Rail.svelte: `@media (prefers-reduced-motion: no-preference) { [data-slot="tip"] { transition: transform var(--dur-morph) var(--ease-in-out), width var(--dur-morph) var(--ease-in-out), opacity var(--dur-control) var(--ease-out); } }`
- routines/ActionsTable.svelte: `[data-slot="actions-ledger"] :global([data-actions]) { border-spacing: 0; }`
- routines/RoutineDetail.svelte: `[data-slot="runs-ledger"] :global([data-runs]) { border-spacing: 0; }`
- routines/RoutineDetail.svelte: `[data-slot="instruction"][data-clamped] { mask-image: linear-gradient(to bottom, var(--mask-opaque) var(--fade-from), transparent); }`
- updates/ChannelCards.svelte: `[data-slot="frame"][data-dir="end"] { transition: inset-inline-end var(--dur-fade) var(--ease-in-out) 0ms, inset-inline-start var(--dur-fade) var(--ease-in-out) var(--dur-ghost); }`
- updates/ChannelCards.svelte: `[data-slot="frame"][data-dir="start"] { transition: inset-inline-start var(--dur-fade) var(--ease-in-out) 0ms, inset-inline-end var(--dur-fade) var(--ease-in-out) var(--dur-ghost); }`

## needs variant

none

## needs transition token

- needs transition token: transform var(--dur-morph) var(--ease-in-out), width var(--dur-morph) var(--ease-in-out), opacity var(--dur-control) var(--ease-out) (motion/Rail.svelte, the tip)
- needs transition token: inset-inline-end var(--dur-fade) var(--ease-in-out) 0ms, inset-inline-start var(--dur-fade) var(--ease-in-out) var(--dur-ghost) and its mirror (updates/ChannelCards.svelte, the frame; a different delay per property)

## needs colour token

needs colour token: --mask-opaque: #000 (apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:297)

## important kept

none

## shadcn variant

none

## cross-file hook

cross-file hook: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:102 .col-status → [data-slot="actions-table-col-status"]; selected by apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1113
cross-file hook: apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:108 .col-when → [data-slot="actions-table-col-when"]; selected by apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1116
cross-file hook: apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:184 .col-when → [data-slot="routine-detail-col-when"]; selected by apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:1116

## Contracts

contract: apps/dashboard/src/lib/cawco/motion/Rail.svelte:218 shadcn/no-inline-styles | apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:308 | Rail's `itemStyle` prop is a style string the caller builds (`--delay:${i * 30}ms`); both sides change together (the caller passes a number, Rail sets `style:--delay`).

## Notes for integration

- motion/Rail.svelte: the tip's `color: var(--neutral-2, #fff)` is `text-neutral-2`; the `#fff` fallback was never reachable (`--neutral-2` is a token) and is dropped with the literal.
- lightbox/Lightbox.svelte, PhotoSwipe block: `44px`, `20px`, `-22px`, `42px` could not stay as literals in a residual, so they read `var(--c-top-bar-h)` (44px), `var(--icon-lg)` (20px), `calc(var(--c-top-bar-h) / -2)` and `calc(var(--c-top-bar-h) - 2px)`. The values are equal; the token name is the one that holds 44px. The pointer-events inline style on the dialog content is `data-pressable` plus `data-pressable:pointer-events-auto` (base `pointer-events-none`); the scrim's state class `lightbox-leaving` is `data-lightbox-leaving`.
- routines/ActionsTable.svelte, RoutineDetail.svelte: the first-row hairline (`tr.action + tr.action > td`) is `group-not-first/row:border-t` on each cell; the hover on a failed run's link keeps the failed ink as the source did (`hover:group-outcome-failed/run:text-status-fail-ink`).
- updates/ChannelCards.svelte: `.ccard:active` then `:hover` in the source means hover wins while pressed; written as `hover:active:bg-surface-hover` after `active:bg-surface-fill`.
- routines/RunStatus.svelte: the glyph colour per status is `group-status-*/time:` on the Glyph and Spinner.
- ViewRoutines.svelte's `.ledger th.col-when` also reached RoutineDetail's heads (inside `.ledger`); the hook above preserves that for integration to retarget.

## shadcn/no-restyle hits (file:line component class)

apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:90 TableRow border-0
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:90 TableRow bg-surface-band
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead pe-0
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead type-label
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:93 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:98 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:98 TableHead type-label
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:98 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:98 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:98 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead type-label
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:110 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:110 TableHead type-label
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:110 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:110 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:110 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell py-space-2
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell pe-0
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell group-not-first/row:border-t
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:125 TableCell group-not-first/row:border-border-hairline
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell py-space-2
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell group-not-first/row:border-t
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:136 TableCell group-not-first/row:border-border-hairline
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell py-space-2
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell group-not-first/row:border-t
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:152 TableCell group-not-first/row:border-border-hairline
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell py-space-2
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell group-not-first/row:border-t
apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:158 TableCell group-not-first/row:border-border-hairline
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:182 TableRow border-0
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:182 TableRow bg-surface-band
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:186 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:186 TableHead type-label
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:186 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:186 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:186 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:191 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:191 TableHead type-label
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:191 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:191 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:191 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:196 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:196 TableHead type-label
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:196 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:196 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:196 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:201 TableHead px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:201 TableHead type-label
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:201 TableHead tracking-caps
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:201 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:201 TableHead uppercase
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell border-t
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell border-border-hairline
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell py-0
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:217 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell border-t
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell border-border-hairline
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell py-0
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:228 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell border-t
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell border-border-hairline
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell py-0
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:234 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell border-t
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell border-border-hairline
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell px-space-3
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell py-0
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell type-meta
apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:240 TableCell text-ink-muted
apps/dashboard/src/lib/cawco/routines/RunStatus.svelte:56 Spinner group-status-running/time:text-status-live-glyph
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:34 Badge min-h-6
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:34 Badge gap-1.5
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:34 Badge px-2
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:34 Badge py-space-1
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:48 Spinner text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:74 Button text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:83 Button text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateCell.svelte:93 Button text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:50 TableRow max-phone:border-b
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:50 TableRow max-phone:border-border-hairline
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:50 TableRow max-phone:last:border-b-0
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:54 TableHead px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:54 TableHead py-space-3
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:54 TableHead text-meta
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:54 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead border-l
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead border-border
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead py-space-3
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead text-meta
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:58 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead min-w-56
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead border-l
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead border-border
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead py-space-3
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead text-meta
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:62 TableHead text-ink-muted
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:73 TableRow max-phone:border-b
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:73 TableRow max-phone:border-border-hairline
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:73 TableRow max-phone:last:border-b-0
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:75 TableRow opacity-50
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:80 TableHead bg-surface-raised
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:80 TableHead px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:80 TableHead py-space-2
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:107 TableCell border-l
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:107 TableCell border-border
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:107 TableCell px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:107 TableCell py-space-2
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:107 TableCell max-phone:border-l-0
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell border-l
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell border-border
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell px-space-4
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell py-space-2
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell max-phone:border-l-0
apps/dashboard/src/lib/cawco/updates/UpdateTable.svelte:119 TableCell max-phone:pt-0
