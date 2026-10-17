# Lane S02-cawco-top

19 of 20 files done. **STOP on OpenCodeLogo.svelte** (below).

## Per-file table
file · rules moved · residual (1 keyframes/2 foreign-dom/3 pseudo/4 svg-paint/5 unmapped) · literals preserved · breakpoint edges

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| MachineMenu | 0 (no `<style>`) | 0/0/0/0/0 | | |
| ModelCombobox | 0 (no `<style>`) | 0/0/0/0/0 | | |
| OpenCodeLogo | 0 | STOP: 2 colour-literal rules left as found | | |
| PairingScreen | 8 | 0/0/0/0/0 | 100dvh, 80px, 34rem, 26rem | |
| PeekPane | 3 (+ arbitrary `w-[3px]`) | 0/0/0/0/1 | 3px | |
| ProjectMark | 1 | 0 | | |
| RegionBoundary | 1 | 0 | | |
| RowFault | 4 | 0 | | |
| RuleActivity | 9 | 0 | 8px, 10px, 72ch | |
| RuleTester | 2 | 0 | 12px | |
| RunSteps | 14 | 0 | 26px, 44px, 240px | `(pointer: coarse)` -> `coarse:`; `(hover: hover) and (pointer: fine)` -> `hover:` |
| SessionMark | 1 | 0 | | |
| SessionPane | 10 (+ arbitrary `max-w-[46ch]`) | 0/0/0/0/1 | 46ch | |
| SessionSurface | 10 | 0/0/0/0/1 | | |
| StatTile | 9 | 0 | 1lh | `(max-width: 900px)` -> `max-desk:` (exact: desk starts at 901) |
| StopTray | ~30 | 0 | 16px+13ch (calc), 3ch | `@container stop-tray (width < 420px)` -> `@max-stop-tray/stop-tray:` (key `--container-stop-tray: 420px`); `(hover: hover)` -> `hover:` |
| TaskPanel | 0 (`<style>`-less; arbitrary `max-w-[60ch]`) | 0 | 60ch | |
| TaskRing | 3 | 0/0/0/0/2 | | `(prefers-reduced-motion: reduce)` -> `motion-reduce:` |
| ToolMatrix | 1 | 0/0/0/0/1 | | |
| UnlockKeychain | 4 (+ arbitrary gaps/min-height) | 0 | | |

## STOP: OpenCodeLogo.svelte
`apps/dashboard/src/lib/cawco/OpenCodeLogo.svelte:21` `.core { fill: light-dark(#cfcecd, #4b4646); }` and `:24` `.frame { fill: light-dark(#211e1e, #f1ecec); }`. Colour literals (the brand's, not tokens). File left untouched. Needs a decision: brand-colour tokens in the token JSON, or an allowance.

## Kind-5 declarations (verbatim)
- PeekPane.svelte `[data-slot="cwd"] { direction: rtl; }` (was `[direction:rtl]`)
- SessionPane.svelte `[data-slot="transcript-slide"] { timeline-scope: --transcript-head; }`
- SessionSurface.svelte `[data-slot="board"][data-hidden] { content-visibility: hidden; }`
- TaskRing.svelte `.task-ring .arc { transform-box: view-box; }` and `.task-ring g { transform-box: fill-box; }`
- ToolMatrix.svelte `.matrix { box-shadow: inset 0 0 0 1px var(--border-hairline); }`

## needs variant
- StopTray.svelte: `data-stop-tray-tone` = working | attention | failed | quiet. The `.working .glyph` etc. colour rules are written as static class ternaries on `status.tone` (glyph: text-status-{live,attn,fail,idle}-glyph; word: text-status-fail-ink when failed) to stay under five kind-5 declarations. Integration may replace them with `group-<variant>:` once variants for those values exist.

## needs transition token
none.

## Declarations dropped as redundant (computed value unchanged, preflight carries it)
- RunSteps.svelte `.line { font: inherit }` (Tailwind preflight, `@import "tailwindcss"`, already sets `button { font: inherit }`; a div inherits). Kept as a utility it would have been overridden by the shorthand.
- `type-title` (StatTile `max-desk:`) and the other `type-*` utilities carry letter-spacing / tabular-nums where the old `font:` shorthand did not (`--track-title` for type-title). Taken as `lane-a.md` maps it.

## Other reports
- MachineMenu.svelte:211 `class="machine-ask"` on `<AskHere>`: flagged `no-unknown-classes`, left; MachinesList.svelte uses it as `.list :global(.machine-ask)` (cross-file, STOP rule E).
- PeekPane.svelte:279 `style={identityVar(cwd)}` flagged `no-inline-styles`: converting to `style:--identity-h={folderPrefs.hue(cwd)}` needs a script/import change; left.
- Moved onto utilities via a state attribute: `data-hidden` (SessionSurface board/groups), `data-over` (SessionSurface empty-detail), `data-err` (RunSteps line/result).
- Custom-property moves: `--nest-gap`, `--well-at` (RunSteps), `--fault-indent` / `--fault-end` set on the row's wrapper in StopTray instead of on RowFault's root (RowFault takes no `style:`; they inherit to it).
- No `shadcn variant:` lines (none of the eight shadcn variants was used).

## shadcn/no-restyle hits (file:line, component, class)
- MachineMenu.svelte:176 <ContextMenuSubTrigger> `gap-2.5`
- MachineMenu.svelte:181 <ContextMenuSubContent> `min-w-52`
- ModelCombobox.svelte:145 <Button> `gap-2`
- ModelCombobox.svelte:165 <PopoverContent> `w-80`
- ModelCombobox.svelte:165 <PopoverContent> `p-0`
- PeekPane.svelte:307 <Button> `-mr-1.5`
- PeekPane.svelte:434 <Button> `border-status-fail-ink`
- PeekPane.svelte:434 <Button> `bg-surface-recess`
- PeekPane.svelte:434 <Button> `text-ink-strong`
- PeekPane.svelte:434 <Button> `hover:border-status-fail-ink`
- PeekPane.svelte:434 <Button> `hover:bg-surface-recess`
- PeekPane.svelte:434 <Button> `hover:text-ink-strong`
- PeekPane.svelte:445 <Button> `border-status-done-ink`
- PeekPane.svelte:445 <Button> `bg-surface-recess`
- PeekPane.svelte:445 <Button> `text-ink-strong`
- PeekPane.svelte:445 <Button> `hover:border-status-done-ink`
- PeekPane.svelte:445 <Button> `hover:bg-surface-recess`
- PeekPane.svelte:445 <Button> `hover:text-ink-strong`
- RuleTester.svelte:82 <Textarea> `bg-surface-page`
- RuleTester.svelte:82 <Textarea> `font-mono`
- RuleTester.svelte:82 <Textarea> `text-label`
- SessionPane.svelte:130 <EmptyState> `px-space-6`
- SessionPane.svelte:130 <EmptyState> `px-space-6`
- SessionPane.svelte:130 <EmptyState> `px-space-6`
- TaskPanel.svelte:120 <CollapsibleTrigger> `gap-2`
- TaskPanel.svelte:121 <CollapsibleTrigger> `px-2`
- TaskPanel.svelte:121 <CollapsibleTrigger> `min-h-9`
- TaskPanel.svelte:121 <CollapsibleTrigger> `px-3`
- TaskPanel.svelte:122 <CollapsibleTrigger> `opacity-60`
- TaskPanel.svelte:131 <CollapsibleTrigger> `rounded-md`
- TaskPanel.svelte:131 <CollapsibleTrigger> `transition-colors`
- TaskPanel.svelte:131 <CollapsibleTrigger> `hover:bg-accent/40`
- ToolMatrix.svelte:40 <Badge> `min-h-6`
- ToolMatrix.svelte:40 <Badge> `gap-1.5`
- ToolMatrix.svelte:40 <Badge> `px-2`
- ToolMatrix.svelte:40 <Badge> `min-h-6`
- ToolMatrix.svelte:40 <Badge> `gap-1.5`
- ToolMatrix.svelte:40 <Badge> `px-2`
- ToolMatrix.svelte:40 <Badge> `min-h-6`
- ToolMatrix.svelte:40 <Badge> `gap-1.5`
- ToolMatrix.svelte:40 <Badge> `px-2`
- ToolMatrix.svelte:40 <Badge> `min-h-6`
- ToolMatrix.svelte:40 <Badge> `gap-1.5`
- ToolMatrix.svelte:40 <Badge> `px-2`
- ToolMatrix.svelte:40 <Badge> `min-h-6`
- ToolMatrix.svelte:40 <Badge> `gap-1.5`
- ToolMatrix.svelte:40 <Badge> `px-2`
- ToolMatrix.svelte:112 <Badge> `text-success-9`
- ToolMatrix.svelte:122 <Button> `text-ink-muted`
- ToolMatrix.svelte:135 <Badge> `text-ink-muted`
- ToolMatrix.svelte:171 <PopoverContent> `w-96`
- ToolMatrix.svelte:171 <PopoverContent> `rounded-lg`
- ToolMatrix.svelte:171 <PopoverContent> `p-0`
- ToolMatrix.svelte:171 <PopoverContent> `shadow-xl`
- ToolMatrix.svelte:206 <Button> `text-ink-muted`
- ToolMatrix.svelte:226 <Badge> `text-ink-muted`
- ToolMatrix.svelte:235 <PopoverContent> `w-80`
- ToolMatrix.svelte:235 <PopoverContent> `rounded-lg`
- ToolMatrix.svelte:235 <PopoverContent> `shadow-xl`
- ToolMatrix.svelte:249 <Badge> `text-ink-subtle`
- ToolMatrix.svelte:257 <Button> `text-ink-muted`
- ToolMatrix.svelte:302 <TableHead> `left-0`
- ToolMatrix.svelte:302 <TableHead> `bg-surface-raised`
- ToolMatrix.svelte:302 <TableHead> `px-space-4`
- ToolMatrix.svelte:302 <TableHead> `py-space-3`
- ToolMatrix.svelte:302 <TableHead> `text-meta`
- ToolMatrix.svelte:302 <TableHead> `text-ink-muted`
- ToolMatrix.svelte:310 <TableHead> `min-w-56`
- ToolMatrix.svelte:310 <TableHead> `border-l`
- ToolMatrix.svelte:310 <TableHead> `border-border`
- ToolMatrix.svelte:310 <TableHead> `px-space-4`
- ToolMatrix.svelte:310 <TableHead> `py-space-3`
- ToolMatrix.svelte:358 <TableRow> `opacity-50`
- ToolMatrix.svelte:361 <TableHead> `left-0`
- ToolMatrix.svelte:361 <TableHead> `bg-surface-raised`
- ToolMatrix.svelte:361 <TableHead> `px-space-4`
- ToolMatrix.svelte:361 <TableHead> `py-space-2`
- ToolMatrix.svelte:389 <TableCell> `border-l`
- ToolMatrix.svelte:389 <TableCell> `border-border`
- ToolMatrix.svelte:389 <TableCell> `px-space-4`
- ToolMatrix.svelte:389 <TableCell> `py-space-2`
