# After-M lanes: inventory

357 files in 53 lanes; kit 43; after-M only 10; relic/lint/dead only (consumers) 222.

Relics on the merge: bang 12, important 37, literal 719, style-reason 165, style-var 1001.

## Lanes

- L00-kit-sheets: 5
- L01-kit-ui-1: 8
- L02-kit-ui-2: 8
- L03-kit-ui-3: 8
- L04-kit-ui-4: 8
- L05-kit-ui-5: 6
- L06-cawco-accounts-1: 6
- L07-cawco-accounts-2: 6
- L08-cawco-accounts-3: 5
- L09-cawco-blocks: 7
- L10-cawco-config-1: 8
- L11-cawco-config-2: 8
- L12-cawco-config-3: 7
- L13-cawco-decisions-1: 7
- L14-cawco-decisions-2: 7
- L15-cawco-decisions-3: 7
- L16-cawco-files: 7
- L17-cawco-find: 6
- L18-cawco-home-1: 6
- L19-cawco-home-2: 5
- L20-cawco-lightbox: 7
- L21-cawco-preview-1: 6
- L22-cawco-preview-2: 5
- L23-cawco-project-1: 5
- L24-cawco-project-2: 5
- L25-cawco-relay: 6
- L26-cawco-spawn-1: 8
- L27-cawco-spawn-2: 7
- L28-cawco-tasks-1: 8
- L29-cawco-tasks-2: 8
- L30-cawco-top-1: 8
- L31-cawco-top-2: 8
- L32-cawco-top-3: 8
- L33-cawco-top-4: 8
- L34-cawco-top-5: 8
- L35-cawco-transcript-1: 7
- L36-cawco-transcript-2: 7
- L37-cawco-transcript-3: 7
- L38-cawco-transcript-4: 7
- L39-cawco-transcript-5: 5
- L40-cawco-turn: 6
- L41-cawco-usage-1: 7
- L42-cawco-usage-2: 6
- L43-cawco-views-1: 5
- L44-cawco-views-2: 4
- L45-cawco-workspace: 7
- L46-lib-components-1: 7
- L47-lib-components-2: 7
- L48-lib-components-3: 5
- L49-routes-config-1: 7
- L50-routes-config-2: 7
- L51-routes-motion-1: 8
- L52-routes-motion-2: 8

## shadcn/no-restyle sites by kit part (72)

Each wants a kit variant (the kit lane) and a `kit-swap:` at its site (the consumer lane).

### Button (24)

- apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:370  "ctl" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/FilesList.svelte:701  "files-show" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:823  "deny" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:840  "approve" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:908  "deny" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:921  "approve" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:945  "deny" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/home/NeedsCard.svelte:958  "approve" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:723  "-ms-3" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:835  "-me-3" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:986  "@max-md:-ms-3" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:678  "min-w-0" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:678  "!text-[var(--ink-strong)]" is not allowed on <Button>: <Button> owns its color. Use a variant: default, outline, secondary, ghost, destructive, grant, link. Add a new variant in src/lib/components/ui/button/button.svelte only if the design explicitly calls for a treatment none of these provides. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:678  "min-w-0" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:678  "!text-[var(--ink-strong)]" is not allowed on <Button>: <Button> owns its color. Use a variant: default, outline, secondary, ghost, destructive, grant, link. Add a new variant in src/lib/components/ui/button/button.svelte only if the design explicitly calls for a treatment none of these provides. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:679  "approve" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:680  "deny" is not allowed on <Button>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:778  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:905  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:938  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:946  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:981  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:992  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1002  "pressable" is not allowed on <Button>: your CSS declares it, and the grammar cannot tell what it changes. Use a variant, or put it on a parent element. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Input (9)

- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:835  "add-path" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:835  "text-label" is not allowed on <Input>: <Input> owns its typography. Add a variant in src/lib/components/ui/command/command-input.svelte only if the design explicitly calls for this treatment. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:939  "add-path" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:939  "text-label" is not allowed on <Input>: <Input> owns its typography. Add a variant in src/lib/components/ui/command/command-input.svelte only if the design explicitly calls for this treatment. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/relay/RelayJourney.svelte:519  "max-w-sm" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:872  "other" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:872  "h-9" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:872  "min-w-0" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/routes/(app)/config/memory/+page.svelte:102  "max-w-64" is not allowed on <Input>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### TableHead (8)

- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:104  "col-mark" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:108  "col-action" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:112  "col-status" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:116  "col-when" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:167  "col-when" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:171  "col-outcome" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:175  "col-took" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:179  "col-result" is not allowed on <TableHead>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Skeleton (5)

- apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:170  "ghost-well" is not allowed on <Skeleton>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/ArtifactCards.svelte:171  "ghost-name" is not allowed on <Skeleton>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/FilesList.svelte:627  "ghost-glyph" is not allowed on <Skeleton>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/FilesList.svelte:630  "ghost-name" is not allowed on <Skeleton>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/FilesList.svelte:633  "ghost-age" is not allowed on <Skeleton>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### TableRow (4)

- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:102  "band" is not allowed on <TableRow>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/ActionsTable.svelte:102  "border-0" is not allowed on <TableRow>: <TableRow> owns its shape. Use a variant: band, unruled, stacks, stacks-ruled, picks-stacks. Add a new variant in src/lib/components/ui/table/table-row.svelte only if the design explicitly calls for a treatment none of these provides. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:165  "band" is not allowed on <TableRow>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/routines/RoutineDetail.svelte:165  "border-0" is not allowed on <TableRow>: <TableRow> owns its shape. Use a variant: band, unruled, stacks, stacks-ruled, picks-stacks. Add a new variant in src/lib/components/ui/table/table-row.svelte only if the design explicitly calls for a treatment none of these provides. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Spinner (3)

- apps/dashboard/src/lib/cawco/MachineInventory.svelte:166  "size-4" is not allowed on <Spinner>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:685  "size-4" is not allowed on <Spinner>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/config/editors/MemoryEditor.svelte:881  "size-4" is not allowed on <Spinner>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### DropdownMenuContent (3)

- apps/dashboard/src/lib/cawco/preview/CanvasView.svelte:107  "w-52" is not allowed on <DropdownMenuContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/preview/PreviewPane.svelte:2278  "w-48" is not allowed on <DropdownMenuContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/side/SideSurface.svelte:414  "w-56" is not allowed on <DropdownMenuContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### NativeSelect (3)

- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:611  "bind-project" is not allowed on <NativeSelect>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:642  "status-pick" is not allowed on <NativeSelect>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/project/ProjectDetails.svelte:925  "add-machine" is not allowed on <NativeSelect>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### TabsContent (2)

- apps/dashboard/src/lib/cawco/files/FilesList.svelte:461  "files-pane" is not allowed on <TabsContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/files/FilesList.svelte:468  "files-pane" is not allowed on <TabsContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### DropdownMenuTrigger (2)

- apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:223  "artifact-trigger" is not allowed on <DropdownMenuTrigger>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/side/SideSurface.svelte:406  "more" is not allowed on <DropdownMenuTrigger>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Table (2)

- apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:911  "routines" is not allowed on <Table>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.
- apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:959  "quiet" is not allowed on <Table>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Textarea (1)

- apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:354  "note" is not allowed on <Textarea>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### EmptyState (1)

- apps/dashboard/src/lib/cawco/files/FilesList.svelte:396  "files-empty" is not allowed on <EmptyState>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### Tabs (1)

- apps/dashboard/src/lib/cawco/files/FilesList.svelte:438  "files-tabs" is not allowed on <Tabs>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### TabsList (1)

- apps/dashboard/src/lib/cawco/files/FilesList.svelte:441  "files-segments" is not allowed on <TabsList>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### DrawerContent (1)

- apps/dashboard/src/lib/cawco/files/FilesSheet.svelte:87  "files-drawer" is not allowed on <DrawerContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### DropdownMenuLabel (1)

- apps/dashboard/src/lib/cawco/preview/ArtifactMenu.svelte:241  "menu-line" is not allowed on <DropdownMenuLabel>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

### DropdownMenuSubContent (1)

- apps/dashboard/src/lib/cawco/preview/CanvasView.svelte:94  "w-52" is not allowed on <DropdownMenuSubContent>: the grammar does not recognize it. Fix the spelling, or use a class Tailwind generates. DESIGN.md is law; theme keys are src/lib/tokens/theme.css.

## Kit carve-outs

- ns-theme.css K1: the kit's Button, CopyButton, InputGroup.Button and Collapsible trigger take the surface's font, ink and transition inside `.ns-theme` (`@layer utilities`).
- ns-theme.css K2: the kit Input's placeholder in the subtle ink inside `.ns-theme`.
- ns-theme.css K3: every button in an `.ns-pop` popover 44px tall on a phone.
- eslint.config.mjs: `shadcn/no-restyle` allows `layout` and the HOUSE classes (num, touch-hit, pointer-hit, mark-line, focus-inset, press-tint) on every kit part, and a wide allow-list on the kit triggers and paneforge's Pane.
- theme.css is generated (`bun run tokens` from design/tokens/cawco.tokens.json): the kit lane changes it through the token JSON's `token:` lines, which integration adds in one commit with `bun run tokens`.
