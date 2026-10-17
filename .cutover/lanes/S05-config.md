# Lane S05-config

All 14 files done. Residual counts (kind): keyframes 2, foreign-dom 7, pseudo 6, svg-paint 0, unmapped 10.

## Per-file table
file · rules moved · residual (1/2/3/4/5) · literals preserved · breakpoint edges
- config/RolloutChip.svelte · 18 · 0/3/0/0/3 · 5px 26px 8px 360px calc(100vw - 2rem) 10px 6px 4px 12px · none
- config/RowList.svelte · 1 · 0 · -8px · none
- config/RowMenu.svelte · 0 (data-ghost added, delta J) · 0 · none · none
- config/SectionFrame.svelte · 11 · 0 · 980px 12px 8px · none
- config/SectionRow.svelte · 22 · 2/4/6/0/5 · 44px 56px 10px 8px 6px 26px 1px 14px 36px 44px calc(100% - 36px) · `@media (max-width: 640px)` → `max-phone:` (640px itself no longer matches)
- config/SkeletonRows.svelte · 2 · 0 · none · none
- config/SwitchField.svelte · 4 · 0 · 10px 72ch · none
- config/TitleInput.svelte · 3 · 0 · none · none
- editors/DelegateTypeEditor.svelte · 2 · 0 · 72ch · none
- editors/HookEditor.svelte · 13 · 0/0/0/0/1 · 32ch 72ch 8px 12px 10px 6rem 6px · `@media (min-width: 640px)` kept as written in residual
- editors/McpEditor.svelte · 4 · 0 · 72ch 8px · none
- editors/MemoryEditor.svelte · 24 · 0 · 72ch 8px 12px 10px 320px 3px 6rem 6px · none
- editors/RuleEditor.svelte · 7 · 0/0/0/0/1 · 72ch 8px · none
- editors/SubagentEditor.svelte · 6 · 0 · 72ch · none

## Kind-5 declarations (verbatim)
- RolloutChip: `transition: background-color var(--dur-panel) var(--ease-out), color var(--dur-panel) var(--ease-out), scale var(--dur-toggle) var(--ease-out)` (`:global(.rollout-chip)`, no-preference)
- RolloutChip: `transition: var(--transition-control), scale var(--dur-toggle) var(--ease-out)` (`[data-slot="sync"]`)
- RolloutChip: `animation-play-state: paused` (`[data-slot="glyph"]:not([data-glyph="busy"]) > [data-for="busy"]`)
- SectionRow: `background-color: var(--surface-fill)`; `--ink-muted: var(--ink-strong)`; `--ink-subtle: var(--ink-strong)`; `background-color: var(--surface-fill-strong)` (row `:has([data-link]:active)`, no `has-[…]` allowed); `--hit-gap-coarse: var(--hit-gap-wide)` (coarse)
- HookEditor: `grid-template-columns: 1fr 1fr` (min-width 640px; not repeat(2, minmax(0,1fr)))
- RuleEditor: `gap: inherit` (`[data-slot="fold"]`)

## Needs variant: none. Needs transition token
- background-color var(--dur-panel) var(--ease-out), color var(--dur-panel) var(--ease-out), scale var(--dur-toggle) var(--ease-out) (RolloutChip trigger)
- var(--transition-control), scale var(--dur-toggle) var(--ease-out) (RolloutChip sync button)
Note: the press became `scale-(--press-scale)`, which sets the `scale` property, so the transition lists name `scale`, not `transform`.

## Needs colour token: none. Important kept: none. Shadow kept residual: none. shadcn variant: none.

## R lines
R2 fixed: apps/dashboard/src/lib/cawco/config/TitleInput.svelte:41
R3 fixed: apps/dashboard/src/lib/cawco/config/TitleInput.svelte:41
R3 fixed: apps/dashboard/src/lib/cawco/config/SectionRow.svelte:147
R3 fixed: apps/dashboard/src/lib/cawco/config/editors/SubagentEditor.svelte:164
R3 fixed: apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:519
(`font-mono` left on kit Input/Textarea and on `<pre>`: source utility classes, not a family declaration.)

## Cross-file hooks: none (searched src for selectors on every class I removed).

## Notes for integration
- SectionRow.departInto selectors retargeted to `[data-slot="tile"]` / `[data-slot="section-row-label"]`; RowList's highlight rows to `[data-slot="row"]` (both own files).
- Delta J: RowMenu's trigger carries `data-ghost`; the hover rule is a foreign-dom residual. A ghost Button in a page's `trailing` snippet (routes/(app)/config/skills/+page.svelte ~586) matched the old `.bg-transparent.border-transparent` rule and no longer does until it gets `data-ghost`.
- Existing flags `data-fill` (SectionFrame, SkeletonRows) and `data-fail` (RolloutChip) are read directly as state (`data-fill:`, `data-fail:`).
- MemoryEditor: `class="note font-mono"` on the hash span was dead (the `.note` font shorthand overrode it); dropped, so computed style is unchanged.
- Spinner/icon `size-icon-sm` classes rely on the kit's twMerge to replace `size-icon-md`.

## Contracts
contract: apps/dashboard/src/lib/cawco/config/RolloutChip.svelte:121 shadcn/no-restyle | src/lib/components/ui kit component <PopoverTrigger> | kit component owns its look; classes `rollout-chip, gap-(--chip-gap), rounded-sm, bg-surface-recess, px-(--chip-px), type-meta, text-ink-muted, transition-[background-color,color], dur-panel, ease-out, hover:bg-surface-hover, data-fail:bg-status-fail-bg, data-fail:text-status-fail-ink, data-fail:hover:bg-status-fail-bg` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/RolloutChip.svelte:144 shadcn/no-restyle | src/lib/components/ui kit component <Spinner> | kit component owns its look; classes `opacity-0, group-glyph-busy:opacity-100, motion-safe:transition-opacity, motion-safe:dur-control, motion-safe:ease-out` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/RolloutChip.svelte:158 shadcn/no-restyle | src/lib/components/ui kit component <PopoverContent> | kit component owns its look; classes `gap-space-1` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/RowMenu.svelte:27 shadcn/require-static-classes | src/lib/components/ui kit component <DropdownMenuTrigger> | kit component owns its look; classes `Dynamically built className on <DropdownMenuTrigger> cannot ` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/RowMenu.svelte:32 shadcn/no-restyle | src/lib/components/ui kit component <DropdownMenuContent> | kit component owns its look; classes `min-w-44` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/SkeletonRows.svelte:19 shadcn/no-restyle | src/lib/components/ui kit component <Skeleton> | kit component owns its look; classes `h-14` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/SwitchField.svelte:25 shadcn/no-restyle | src/lib/components/ui kit component <Switch> | kit component owns its look; classes `mt-px` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/DelegateTypeEditor.svelte:276 shadcn/no-restyle | src/lib/components/ui kit component <Button> | kit component owns its look; classes `min-w-0, max-w-112` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/DelegateTypeEditor.svelte:313 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/DelegateTypeEditor.svelte:323 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:582 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:627 shadcn/no-restyle | src/lib/components/ui kit component <Textarea> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:641 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:686 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:708 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:722 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:755 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:779 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/HookEditor.svelte:801 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/McpEditor.svelte:340 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/McpEditor.svelte:355 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/McpEditor.svelte:371 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/McpEditor.svelte:385 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/McpEditor.svelte:401 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/RuleEditor.svelte:380 shadcn/no-restyle | src/lib/components/ui kit component <Input> | kit component owns its look; classes `font-mono` need a kit variant or wrapper (integration writes the per-component contract)
contract: apps/dashboard/src/lib/cawco/config/editors/SubagentEditor.svelte:206 shadcn/no-restyle | src/lib/components/ui kit component <Textarea> | kit component owns its look; classes `min-h-80, font-mono` need a kit variant or wrapper (integration writes the per-component contract)
