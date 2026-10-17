# Lane S14-project (15 files, all done)

## Per file: rules moved · residual by kind (1/2/3/4/5) · literals · breakpoint edges
| file | style rules moved | residual 1/2/3/4/5 | literals preserved | breakpoint edges |
|---|---|---|---|---|
| CardFace | all but 1 | 0/2/0/0/0 | 26px | |
| CawLeadSwitch | all | 0/0/0/0/0 | | |
| CawPanel | all | 0/0/0/0/0 | 22rem | |
| CawSeat | all | 0/0/0/0/0 | | |
| CawStarters | all | 0/0/0/0/0 | | |
| CawThread | all | 0/0/0/0/0 | 416px, 24px, 760px | |
| FolderFile | all but 1 | 0/2/0/0/0 | | |
| FolderFiles | all | 0/0/0/0/0 | 30px, 2px | |
| NeedsYouChip | all | 0/0/0/0/0 | | |
| ProjectDetails | all but 3 | 2/2/0/0/1 | 32rem, 6.5rem, 10rem, 30px, 14px | (max-width: 899px) -> max-desk: (<901px, 1px wider) |
| ProjectHead | all but 2 | 0/2/0/0/1 | 18rem, 3px, 24px, 12px | (max-width: 899px) -> max-desk: (1px wider); (max-width: 639px) -> max-phone: |
| StarterCards | all | 0/0/0/0/0 | | @container (min-width: 30rem) -> @details: |
| TemplateCards | all | 0/0/0/0/0 | | |
| UpstreamMenu | all | 0/0/0/0/0 | | |
| ViewBar | all but 3 | 0/10/0/0/2 | 10px | (min-width: 640px) -> phone: |

Totals: kind 1: 2, kind 2: 18, kind 3: 0, kind 4: 0, kind 5: 4. (ProjectDetails/ProjectHead/ViewBar keep their shape; CawLeadSwitch gained `data-slot="lead-switch"` for the ProjectDetails residual.)

## Kind-5 declarations, verbatim
- ViewBar.svelte: `--hit-gap-x: var(--space-2);` (on `[data-slot="view-bar"]`; a custom property that has to change under `(pointer: coarse)`, which no utility sets)
- ViewBar.svelte: `--hit-gap-x: var(--coarse-gap);` (inside `@media (pointer: coarse)`; `--coarse-gap` is `style:--coarse-gap="10px"`)
- ProjectDetails.svelte: `direction: rtl;`
- ProjectHead.svelte: `font: inherit;` (on `[data-slot="name"], [data-place-line], [data-places-line]`)

## needs variant
none

## needs transition token
none

## needs colour token
none

## shadcn variant
none

## cross-file hook
- cross-file hook: apps/dashboard/src/lib/cawco/project/CawSeat.svelte:49 .caw-seat → [data-slot="caw-seat"]; selected by apps/dashboard/src/lib/cawco/project/CawFloat.svelte:45 (`target.closest(".caw-seat, [data-caw-asks]")`)
- Retargeted in-lane: ProjectDetails.svelte's `:global(.lead-switch)` → `[data-slot="lead-switch"]` (CawLeadSwitch, same lane).
- Kept as hook for a residual: FolderFile.svelte's `class="folder-file"` on SideSurface (the `:global(.folder-file > .side-head .title)` rule styles SideSurface's own DOM).

## shadcn/no-restyle hits (file:line, component, class)
- CawThread.svelte:292 Button `pressable`; :305 Button `pressable`; :353 PopoverContent `p-0`
- ProjectDetails.svelte:414 Input `text-label`
- ProjectHead.svelte:483 Button `pressable`; :495 Button `pressable`; :555 Button `pressable`; :502 PopoverContent `w-80`; :520 Input `text-label`; :586 DropdownMenuContent `w-52`; :687 DrawerContent `pb-(--safe-bottom)`; :697 PopoverContent `p-space-2`
- UpstreamMenu.svelte:51 DropdownMenuSubContent `w-72`
- ViewBar.svelte:147 SelectTrigger `group-data-bar:min-w-0`, `group-data-bar:rounded-(--bar-control-radius)`

(`pressable`, `w-80`, `w-52`, `w-72`, `text-label` were on the component before; the rest are new from moving `:global(.kit-pop.caw-lead-card)`, `.caw-settings-pop`, `.caw-sheet`, `.view-pill`.)

## Notes for integration
- ViewBar/NeedsYouChip: `.view-bar > :global(.needs)` and `.view-pill` sized the controls over their own defaults by specificity. Now `group` + `data-bar` on the bar and `group-data-bar:` utilities on the chip and trigger (specificity (0,2,0) beats the plain utility). Compare these.
- ProjectHead `.acts` flex shorthand is written as grow/shrink/basis longhands so max-desk/max-phone order by property.
- StarterCards `.cards` first column `minmax(0,1fr)` is `grid-cols-1` (`repeat(1, minmax(0,1fr))`), same track list.
- ProjectHead `.name`: `background: none` is `bg-transparent`; `color: inherit` is `text-inherit`; `:read-only` stands for `[readonly]`.
- ProjectDetails/ProjectHead use `has-data-field:` for `.txt:has(.field)` (input already carries `data-field`).

## Contracts
none

## Delta R
R2 fixed: apps/dashboard/src/lib/cawco/project/CawSeat.svelte:49
R2 fixed: apps/dashboard/src/lib/cawco/project/CawThread.svelte:264
R2 fixed: apps/dashboard/src/lib/cawco/project/CawThread.svelte:279
R2 fixed: apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:280
R2 fixed: apps/dashboard/src/lib/cawco/project/ProjectHead.svelte:442
R2 fixed: apps/dashboard/src/lib/cawco/project/ProjectHead.svelte:463
R2 fixed: apps/dashboard/src/lib/cawco/project/StarterCards.svelte:98
R3 fixed: apps/dashboard/src/lib/cawco/project/FolderFiles.svelte:37
(FolderFile.svelte:90 is a `<pre>`: `font-mono` stays. No box-shadow state mixes a residual with a utility.)

## Fix after first report
ViewBar.svelte: `style:--list-max` on `Select.Content` is invalid on a component; now `style="--list-max: …"` (commit 99ed8a700).
