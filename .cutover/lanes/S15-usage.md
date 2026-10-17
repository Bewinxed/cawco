# Lane S15-usage

Files: 10 of 10 done.

## Per-file table
file · rules moved · residual counts (1/2/3/4/5) · literals preserved · breakpoint edges · STOPs

- AccountDot.svelte · 2 rules · 0/0/0/0/0 · 6px, 50% · none · none
- History.svelte · ~20 rules · 0/0/0/0/0 · 96px bars height · max-width 639px → max-phone: (card, pair) · none
- LimitBar.svelte · 6 rules · 0/0/0/0/0 · -1px tick nudge · none · none
- LimitsBlock.svelte · ~30 rules · 0/2/0/0/0 · 6px, 8px, 10px, 3px, 5px, 7px→space-2, 15.5rem, 60ch, 0.25em, -0.1em, 0.8em, -0.02em, 50% · max-width 639px → max-phone: (card padding) · none
- ProjectSpend.svelte · ~35 rules · 0/0/3/0/1 · 8rem, 6rem, 9.5rem, 1fr auto auto · max-width 639px → max-phone: (ledger rows) · none
- ProviderLimit.svelte · 4 rules · 0/0/0/0/0 · 64px · none · none
- RingsKey.svelte · 7 rules · 0/0/0/0/0 · 10px 52px 84px, 3px · none · none
- SessionsChip.svelte · 10 rules · 0/0/0/0/0 · 40px, 44px (item height) · (hover: none),(pointer: coarse),(max-width: 640px) → no-hover: + max-phone: (640 edge: max-phone is 639.98px) · none
- WhereItGoes.svelte · ~30 rules · 0/0/0/0/0 · minmax(0,2fr) minmax(0,3fr), 28px, 5.5rem, 8px · max-width 639px → max-phone: · none
- Words.svelte · 3 rules · 0/0/0/0/0 · 6px, 50% · none · none

Residual totals over the lane: keyframes 0, foreign-dom 2, pseudo 3, svg-paint 0, unmapped 1.

## Residuals
- LimitsBlock.svelte: foreign-dom `[data-slot="glyph"] :global(svg)` (OpenCodeLogo takes no class; not in the lane list).
- ProjectSpend.svelte: pseudo `a[data-slot="name"]::after` (the row-wide link target).
- ProjectSpend.svelte kind 5, verbatim: `@media (max-width: 639px) { [data-slot="ledger"] :global(tr[data-project-spend-row]) { border-block-end: 1px solid var(--border-hairline); } }`. The kit TableBody's `[&_tr:last-child]:border-0` outranks a single utility, so the phone border on the last row stays a rule.

## Notes
- needs variant: none. needs transition token: none. needs colour token: none. cross-file hook: none. important kept: none.
- Selector strings switched to data-slot (WhereItGoes.svelte): `[data-slot="group"]`, `[data-slot="more-slot"]` (added `data-slot="more-slot"` to the more-slot div).
- WhereItGoes.svelte script: enterAnim/leaveAnim/headStyle now return the animation value only (headAnim, headHidden), applied as `--swap-anim` + `animate-(--swap-anim)` and `--head-opacity`; History.svelte `style="animation:…"` likewise (delta E).
- ProjectSpend.svelte: the dead `.ledger tr.total td` rule is dropped; `tr.row td` (same specificity, later) beat it on every property (border, colour, `font:` resets weight).
- ProjectSpend.svelte: the ledger's `col-*` widths read custom properties set once on Table.Root (`--col-count`, `--col-usd`, `--col-last`, `--row-cols`, `--none`).
- flex: 1 1 0 on History `.slot` is written as flex-1 (1 1 0%).
- shadcn variant: none.

## Delta R
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:452
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:460
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:464
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:467
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:474
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:479
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:480
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:483
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:504
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:516
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:522
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:525
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:535
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:540
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:541
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:544
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:552
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553
R2 fixed: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:556
R3 fixed: none (no mono family in the lane). shadow kept residual: none.

## no-restyle hits
shadcn/no-restyle: usage/History.svelte:299 Skeleton h-24
shadcn/no-restyle: usage/LimitsBlock.svelte:220 Skeleton h-7
shadcn/no-restyle: usage/LimitsBlock.svelte:220 Skeleton w-24
shadcn/no-restyle: usage/LimitsBlock.svelte:229 Skeleton h-48
shadcn/no-restyle: usage/ProjectSpend.svelte:223 Skeleton rounded-md
shadcn/no-restyle: usage/ProjectSpend.svelte:226 Skeleton h-48
shadcn/no-restyle: usage/ProjectSpend.svelte:226 Skeleton rounded-lg
shadcn/no-restyle: usage/ProjectSpend.svelte:264 PopoverContent w-80
shadcn/no-restyle: usage/ProjectSpend.svelte:368 PopoverContent w-72
shadcn/no-restyle: usage/ProjectSpend.svelte:433 Table border-spacing-(--none)
shadcn/no-restyle: usage/ProjectSpend.svelte:438 TableRow border-0
shadcn/no-restyle: usage/ProjectSpend.svelte:438 TableRow bg-surface-band
shadcn/no-restyle: usage/ProjectSpend.svelte:440 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:440 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:440 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:440 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:440 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:441 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:441 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:441 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:441 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:441 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:442 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:442 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:442 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:442 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:442 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:443 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:443 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:443 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:443 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:443 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:451 TableRow max-phone:gap-x-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:451 TableRow max-phone:gap-y-space-1
shadcn/no-restyle: usage/ProjectSpend.svelte:451 TableRow max-phone:px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:451 TableRow max-phone:py-space-2
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:452 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:460 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:464 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:467 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:473 TableRow max-phone:gap-x-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:473 TableRow max-phone:gap-y-space-1
shadcn/no-restyle: usage/ProjectSpend.svelte:473 TableRow max-phone:px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:473 TableRow max-phone:py-space-2
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:474 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:479 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:480 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:483 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:490 TableRow border-0
shadcn/no-restyle: usage/ProjectSpend.svelte:490 TableRow bg-surface-band
shadcn/no-restyle: usage/ProjectSpend.svelte:492 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:492 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:492 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:492 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:492 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:493 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:493 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:493 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:493 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:493 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:494 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:494 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:494 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:494 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:494 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:495 TableHead px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:495 TableHead type-label
shadcn/no-restyle: usage/ProjectSpend.svelte:495 TableHead tracking-caps
shadcn/no-restyle: usage/ProjectSpend.svelte:495 TableHead text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:495 TableHead uppercase
shadcn/no-restyle: usage/ProjectSpend.svelte:503 TableRow max-phone:gap-x-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:503 TableRow max-phone:gap-y-space-1
shadcn/no-restyle: usage/ProjectSpend.svelte:503 TableRow max-phone:px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:503 TableRow max-phone:py-space-2
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:504 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:516 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:522 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:525 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:534 TableRow max-phone:gap-x-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:534 TableRow max-phone:gap-y-space-1
shadcn/no-restyle: usage/ProjectSpend.svelte:534 TableRow max-phone:px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:534 TableRow max-phone:py-space-2
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:535 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:540 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:541 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:544 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:547 TableRow max-phone:gap-x-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:547 TableRow max-phone:gap-y-space-1
shadcn/no-restyle: usage/ProjectSpend.svelte:547 TableRow max-phone:px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:547 TableRow max-phone:py-space-2
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:548 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:552 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:553 TableCell max-phone:p-0
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell border-b
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell border-border-hairline
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell px-space-3
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell py-0
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell type-meta
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell text-ink-muted
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell max-phone:border-current
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell max-phone:border-none
shadcn/no-restyle: usage/ProjectSpend.svelte:556 TableCell max-phone:p-0
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger pressable
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger px-space-1
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger font-body
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger text-ink-row
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger text-meta
shadcn/no-restyle: usage/SessionsChip.svelte:180 PopoverTrigger leading-none
shadcn/no-restyle: usage/SessionsChip.svelte:197 PopoverContent gap-0
shadcn/no-restyle: usage/SessionsChip.svelte:197 PopoverContent p-0
shadcn/no-restyle: usage/SessionsChip.svelte:197 PopoverContent shadow-raised
shadcn/no-restyle: usage/WhereItGoes.svelte:552 Skeleton h-6

## Contracts
contract: apps/dashboard/src/lib/cawco/usage/History.svelte:299 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:220 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/LimitsBlock.svelte:229 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:223 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:226 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:264 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:368 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:433 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:438 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:440 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:441 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:442 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:443 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:451 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:452 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:460 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:464 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:467 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:473 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:474 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:479 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:480 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:483 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:490 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:492 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:493 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:494 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:495 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:503 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:504 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:516 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:522 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:525 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:534 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:535 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:540 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:541 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:544 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:547 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:548 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:552 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:553 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/ProjectSpend.svelte:556 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:179 shadcn/require-static-classes | apps/dashboard/src/lib/components/ui/badge/badge.svelte:5 | badgeVariants() class string made static in one change
contract: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:180 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/SessionsChip.svelte:197 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
contract: apps/dashboard/src/lib/cawco/usage/WhereItGoes.svelte:552 shadcn/no-restyle | ui kit component (apps/dashboard/src/lib/components/ui) | a per-component contract for the classes passed (plan D10)
