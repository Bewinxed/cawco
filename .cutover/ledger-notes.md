## Main changes to carry

- **272e8db16** (series d7dbe4bc8, b5287a4ba, 3d4aeeba0, 272e8db16), the preview-hang fix, landed on main after this branch's base. d7dbe4bc8 adds `onScreen={visible}` to the desk `<PreviewPane>` in `src/lib/cawco/side/SideSplit.svelte` (at its line 235 on main). Nothing to do in 1a. When the integration branch is rebased onto main (phase 2), keep main's `onScreen={visible}` on that PreviewPane beside this branch's changes to SideSplit (the `mainClass` prop and `data-split-main-class` are gone here). The series is part of the base of record the style-snapshot compare runs against.

## DESIGN-law fixes the cutover exposed (the orchestrator's ruling)

Words on a mark line that truncate must clip (`overflow: clip`; DESIGN.md, The Mark Line Rule: Gecko does not trim a scroll container). These five broke it at the foundation, in `<style>` where `mark-line-check.ts` cannot read; the lanes' exact `truncate` exposed them. Each is now `overflow-clip text-ellipsis whitespace-nowrap`. Phase 2 applies the same five changes, in `<style>` form (`overflow: hidden` → `overflow: clip`), to the base of record, so the compare shows no difference from them.

| site now | the foundation's rule |
|---|---|
| `src/lib/cawco/AddMachineDialog.svelte:374` (a done step's label) | `AddMachineDialog.svelte:618` `.steps li span { min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis }` (:620) |
| `src/lib/cawco/AddMachineDialog.svelte:383` ("Connecting over SSH") | the same rule, `:620` |
| `src/lib/cawco/Sidebar.svelte:894` (the search button's label) | `Sidebar.svelte:1276` `.search span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap }` (:1277) |
| `src/lib/cawco/accounts/AccountName.svelte:34` (`<b>`, the name) | `AccountName.svelte:54` `b, small { overflow: hidden; white-space: nowrap; text-overflow: ellipsis }` (:56) |
| `src/lib/cawco/accounts/AccountName.svelte:41` (`<small>`, the email) | the same rule, `:56` |

## Transforms: a source `transform:` back on `transform` (the orchestrator's ruling)

The lanes wrote these `transform: <function>` declarations as Tailwind's `scale-*`/`rotate-*`, which set the separate `scale` and `rotate` properties. Each is `transform-(--x)` again, the function in a custom property on the element (the names O3–O6 already used: `--tpress`, `--chev-turn`, `--chev-flip`).

| site | was | now | the source |
|---|---|---|---|
| `src/lib/cawco/tasks/TaskActivity.svelte:295` | `transition-[rotate]` `group-state-open:rotate-90` | `transition-[transform]` `group-state-open:transform-(--chev-turn)`, `--chev-turn: rotate(90deg)` | `.part :global(.fold-head[data-state="open"] .chev) { transform: rotate(90deg) }`, its transition `transform` |
| `src/lib/cawco/move/MoveAsk.svelte:33` | `motion-safe:transition-[rotate]` `data-open:rotate-90` | `motion-safe:transition-[transform]` `data-open:transform-(--chev-turn)` | `&.open { transform: rotate(90deg) }`, its transition `transform` |
| `src/lib/cawco/home/MovedLogins.svelte:137` | `group-aria-expanded/button:-scale-y-100` | `group-aria-expanded/button:transform-(--chev-flip)`, `--chev-flip: scaleY(-1)` | `transform: scaleY(-1)` |
| `src/lib/cawco/home/NoticeRow.svelte:85` | `motion-safe:active:scale-(--press-scale)` | `motion-safe:active:transform-(--tpress)`, `--tpress: scale(var(--press-scale))` | `.x:active { transform: scale(var(--press-scale)) }` |
| `src/lib/cawco/config/RolloutChip.svelte:121` | `motion-safe:active:scale-(--press-scale)` | `motion-safe:active:transform-(--tpress)` | `.rollout-chip:active { transform: scale(var(--press-scale)) }` |
| `src/lib/cawco/config/RolloutChip.svelte:215` | `motion-safe:active:enabled:not-aria-busy:scale-(--press-scale)` | `…:transform-(--tpress)` | `.sync:active:not(:disabled, [aria-busy="true"]) { transform: scale(…) }` |
| `src/lib/cawco/config/RolloutChip.svelte:320`, `:326` (residual) | transitions naming `scale` | naming `transform` | the source's transitions |
| `src/lib/cawco/config/PickerChip.svelte:50` | `motion-safe:active:scale-(--press-scale)` | `motion-safe:active:transform-(--tpress)` | `.picker-chip:active { transform: scale(…) }` |
| `src/lib/cawco/accounts/Swatches.svelte:23` | `motion-safe:transition-[box-shadow,scale]` `motion-safe:active:scale-(--press-scale)` | `motion-safe:transition-[box-shadow,transform]` `motion-safe:active:transform-(--tpress)` | `.swatch:active { transform: scale(…) }`, its transition `box-shadow, transform` |
| `src/lib/cawco/accounts/StrategyPicker.svelte:129` | `motion-safe:active:scale-(--card-press)`, `--card-press: 0.995` | `motion-safe:active:transform-(--card-press)`, `--card-press: scale(0.995)` | `.card:active { transform: scale(0.995) }` |
| `src/lib/cawco/accounts/StrategyPicker.svelte:226` (residual) | transition naming `scale` | naming `transform` | the source's `.card` transition |
| `src/lib/cawco/transcript/AttachButton.svelte:50`, `:71` | `motion-safe:active:scale-(--press-scale)` | `motion-safe:active:transform-(--tpress)` | `.att-btn:active { transform: scale(…) }` |
| `src/lib/components/features/tool-cards/MemoryBody.svelte:266` | `group-state-open:rotate-90` | `group-state-open:transform-(--chev-turn)` | `transform: rotate(90deg)`, its transition `transform` |
| `src/lib/components/ui/thinking-steps/thinking-steps-header.svelte:31` | `motion-safe:transition-[rotate]` `group-state-open/header:rotate-90` | `motion-safe:transition-[transform]` `…:transform-(--chev-turn)` | `transform: rotate(90deg)`, its transition `transform` |

Tokens with them: `transition-pick-card` names `transform`; `transition-tint-scale` is `transition-chip-settle` (`transform`); `transition-control-scale` is deleted (RolloutChip's sync is `transition-control-press`).

## Kit duplicate insets (the five `data-inset` paddings)

Each kit part carried two inset paddings for the same state. The one the page shows is kept; the losing one is deleted, so the computed `padding-left` stays what it is today.

| file | before | kept | deleted | why that one shows today |
|---|---|---|---|---|
| `src/lib/components/ui/dropdown-menu/dropdown-menu-item.svelte` | `data-[inset]:pl-space-8` … `data-inset:pl-9.5` | `data-inset:pl-space-8` (32px) | `data-inset:pl-9.5` (38px) | same selector `[data-inset]`, same property; Tailwind writes `pl-9.5` before `pl-space-8`, so `pl-space-8` wins; tailwind-merge keeps both (`data-[inset]:` and `data-inset:` are different modifiers to it) |
| `src/lib/components/ui/dropdown-menu/dropdown-menu-label.svelte` | `data-[inset]:pl-space-8` … `data-inset:pl-9.5` | `data-inset:pl-space-8` (32px) | `data-inset:pl-9.5` | as the item |
| `src/lib/components/ui/dropdown-menu/dropdown-menu-sub-trigger.svelte` | `data-[inset]:pl-space-8` … `data-inset:pl-9.5` | `data-inset:pl-space-8` (32px) | `data-inset:pl-9.5` | as the item (the parent's ruling) |
| `src/lib/components/ui/context-menu/context-menu-label.svelte` | `data-inset:pl-9.5` … `data-inset:pl-space-8` | `data-inset:pl-space-8` (32px) | `data-inset:pl-9.5` | same modifier: tailwind-merge keeps the later class in the string, `pl-space-8`, and the stylesheet order agrees |
| `src/lib/components/ui/context-menu/context-menu-sub-trigger.svelte` | `data-inset:ps-space-8` … `data-inset:pl-9.5` | `data-inset:pl-9.5` (38px) | `data-inset:ps-space-8` (32px) | `padding-left` is written after `padding-inline-start`, so `pl-9.5` wins (the parent's ruling) |
