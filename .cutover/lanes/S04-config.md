# Lane S04-config

15 files done of 15. Residuals by kind (1/2/3/4/5): 0 / 4 / 0 / 0 / 1.

| file | rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| Choice | 1 (:global(.choice-group) → class passed to ToggleGroup.Root) | 0/0/0/0/0 | none | none |
| ConfigRail | 14 | 0/2/0/0/0 | 232px, 48px, 22px, 6px, 50%, 5px, 18px, 3ch | none |
| EditorFooter | 9 | 0/0/0/0/0 | 10px, 12px, 8px, 980px, 96px | max-width 900 → max-desk:, 640 → max-phone: |
| EditorFrame | 12 | 0/2/0/0/0 | 980px, 8px, 26px | 640 → max-phone: |
| EditorRoute | 2 | 0 | none | none |
| EditorSection | 1 | 0 | 8px | none |
| EditorSkeleton | 0 (lint only) | 0 | 29px (style prop) | none |
| FetchSkillPopover | 5 | 0 | 12px, 13rem, 10px, 380px, calc(100vw - 2rem) | none |
| Field | 5 | 0 | 6px, 72ch | none |
| LinkMarketplacePopover | 2 | 0 | 12px, 380px, calc(100vw - 2rem) | none |
| McpSignIn | 1 | 0 | none | none |
| NewMemoryPopover | 2 | 0 | 12px, 360px, calc(100vw - 2rem) | none |
| PickerChip | 11 | 0/0/0/0/1 | 6px, 32px, 10px, 8px | none |
| PreviousVersions | 9 | 0 | 72ch, 8px, 10px | none |
| ReadingWell | 1 | 0 | 72ch, 12px | none |

## Kind-5 declarations (verbatim)
- PickerChip.svelte, under `@media (prefers-reduced-motion: no-preference)` on `:global([data-picker-chip])`:
  `transition: var(--transition-control), transform var(--dur-toggle) var(--ease-out);`
  needs transition token: `var(--transition-control), transform var(--dur-toggle) var(--ease-out)`

## Kind-2 (foreign-dom)
- ConfigRail.svelte, EditorFrame.svelte: `[data-slot="tile"] :global(svg)` sizing (icon is typed `Component`, takes no class).

## needs variant
none

## shadcn variant
none

## Judgement calls
- EditorFrame: `class:fill` → `data-is-fill` (delta M: `data-fill` hook already on the element, kept); `class:veiled` → `data-veiled`.
- Dead classes with no rules anywhere removed: `footer-btn` (EditorFooter), `sign-in-fault` (McpSignIn).
- `.picker-chip` trigger: utilities on Popover.Trigger, literals via `style="--x: …"` string prop (components cannot take `style:`). Same for Popover.Content widths and EditorSkeleton's Skeleton.
- `ConfigRail` row `.row` selector for highlight → `[data-slot="row"]`; PickerChip `.item` → `[data-slot="item"]`.
- Specificity risk (not verifiable here): Popover/Button utilities now sit in the utilities layer where scoped rules used to win; integration's compare should check PickerChip trigger, EditorFooter Delete colour, PickerChip `.kit-item` options.

## shadcn/no-restyle hits (file:line, component, class)
- EditorFooter.svelte:129 Button text-ink-muted
- EditorFrame.svelte:193 DropdownMenu.Content min-w-44 (pre-existing)
- FetchSkillPopover.svelte:128 Popover.Content gap-3, p-3 (pre-existing); :160, :188 Input font-mono (pre-existing)
- LinkMarketplacePopover.svelte:150 Popover.Content gap-3, p-3; :169, :193 Input font-mono
- NewMemoryPopover.svelte:100 Popover.Content gap-3, p-3; :121 Input font-mono
- PickerChip.svelte:50 Popover.Trigger gap-(--chip-gap), px-(--chip-pad), border, border-border-control, rounded-md, bg-surface-raised, type-label, text-ink-strong, transition-control, hover:bg-surface-hover; :57 Popover.Content max-h-80, w-64, gap-0
EditorFrame trigger: the dropdown trigger now renders through `child` snippet as Button variant=ghost size=icon (same button, same classes) so its class is static; the require-static-classes hit is gone.
