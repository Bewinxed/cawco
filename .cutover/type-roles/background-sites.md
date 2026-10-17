654 background sites; 159 listed (every site not rendered, and every site with a difference)

- lib/cawco/MessageBody.svelte:120  `.msg :global(:not(pre) > code)`  `background: var(--code-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/MessageBody.svelte:135  `.msg :global(.prose > pre)`  `background: var(--surface-recess)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/MessageBody.svelte:141  `.msg :global(.prose > pre code)`  `background: none`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/ScreenEdges.svelte:102  `:global(body)`  `background: var(--edge-bottom-background)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/ScreenEdges.svelte:98  `:global(:root)`  `background: var(--edge-top-background)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/SessionRow.svelte:610  `.item[data-current] .row-action`  `background: var(--selected-bg)`
    head: lib/cawco/SessionRow.svelte:499 <button>, lib/cawco/SessionRow.svelte:527 <button>
    rest: same
    note: ancestor-state: state on an ancestor: .item[data-current]
- lib/cawco/Shell.svelte:1331  `.top`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1343  `.top.hosting`  `background: linear-gradient(var(--border-hairline), var(--border-hairline)) bottom / 100% 1px no-repeat, var(--surface-shelf)`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1519  `.top.hosting`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1559  `.tools::before`  `background: var(--material-panel)`
    note: css: pseudo-element: stays a residual
- lib/cawco/Shell.svelte:1569  `.tools::before`  `background: var(--surface-raised)`
    note: css: pseudo-element: stays a residual
- lib/cawco/Shell.svelte:1618  `.join::before`  `background: var(--surface-raised)`
    note: css: pseudo-element: stays a residual
- lib/cawco/Shell.svelte:1655  `.tools :global(.bar-item)`  `background: none`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1671  `.tools :global(.bar-item:hover)`  `background: var(--surface-hover)`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1810  `.top.floating`  `background: none`
    note: css: the declaration is still CSS here
- lib/cawco/Shell.svelte:1892  `.content.floating`  `background: linear-gradient(var(--surface-shelf), var(--surface-shelf)) top / 100% var(--c-top-bar-h) no-repeat`
    note: css: the declaration is still CSS here
- lib/cawco/Sidebar.svelte:1308  `:global(.rail-configure[aria-current="page"])`  `background: var(--selected-bg)`
    note: css: the declaration is still CSS here
- lib/cawco/ThreadPane.svelte:1141  `.off :global(.off-line)`  `background: var(--surface-raised)`
    head: lib/cawco/ThreadPane.svelte:1084 <Alert>
    rest: same
    note: component <Alert>: its own classes not included
- lib/cawco/TreeMark.svelte:239  `.tree-mark[data-bare] .tile`  `background: none`
    head: lib/cawco/TreeMark.svelte:187 <span>, lib/cawco/TreeMark.svelte:279 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .tree-mark[data-bare]
- lib/cawco/TreeMark.svelte:353  `.card::after, .skin::after`  `background: var(--mark-deck-shade)`
    note: css: pseudo-element: stays a residual
- lib/cawco/TreeMark.svelte:365  `.card::before, .skin::before`  `background: linear-gradient(var(--mark-deck-cast), transparent)`
    note: css: pseudo-element: stays a residual
- lib/cawco/UsageMeter.svelte:1278  `.cell-d.limit`  `background: var(--meter-wash-over)`
    note: css: the declaration is still CSS here
- lib/cawco/UsageMeter.svelte:1282  `.cell-d.lit`  `background: var(--surface-hover)`
    note: css: the declaration is still CSS here
- lib/cawco/UsageMeter.svelte:955  `:global(.strip-hit)`  `background: transparent`
    head: lib/cawco/UsageMeter.svelte:1140 <Drawer.Trigger>, lib/cawco/UsageMeter.svelte:1157 <Popover.Trigger>
    rest: same
    note: component <Drawer.Trigger>: its own classes not included; component <Popover.Trigger>: its own classes not included
- lib/cawco/UsageMeter.svelte:963  `:global(.strip-hit):hover`  `background: var(--surface-hover)`
    head: lib/cawco/UsageMeter.svelte:1140 <Drawer.Trigger>, lib/cawco/UsageMeter.svelte:1157 <Popover.Trigger>
    rest: same
    own: same
    note: component <Drawer.Trigger>: its own classes not included; component <Popover.Trigger>: its own classes not included
- lib/cawco/UsageMeter.svelte:969  `:global(.strip-hit)[aria-expanded="true"], :global(.strip-hit)[data-state="open"]`  `background: var(--surface-hover)`
    head: lib/cawco/UsageMeter.svelte:1140 <Drawer.Trigger>, lib/cawco/UsageMeter.svelte:1157 <Popover.Trigger>
    rest: same
    own: same
    note: component <Drawer.Trigger>: its own classes not included; component <Popover.Trigger>: its own classes not included
- lib/cawco/accounts/AccountSetup.svelte:860  `.dot::after`  `background: var(--neutral-8)`
    note: css: pseudo-element: stays a residual
- lib/cawco/accounts/AccountSetup.svelte:868  `.step.cur .dot::after`  `background: var(--selected-icon)`
    note: css: pseudo-element: stays a residual
- lib/cawco/accounts/AccountTile.svelte:35  `.tile`  `background: color-mix(in oklab, var(--c) 18%, transparent)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:142  `.stage`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:177  `.stage :global(.ln-lbl .dot)`  `background: var(--c)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:196  `.stage :global(.clkw)`  `background: color-mix(in oklab, var(--c) 26%, transparent)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:217  `.stage :global(.bar)`  `background: var(--surface-fill)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:220  `.stage :global(.hr)`  `background: color-mix(in oklab, var(--c) 42%, transparent)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:224  `.stage :global(.fl)`  `background: var(--c)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:229  `.stage :global(.gh)`  `background: color-mix(in oklab, var(--c) 22%, transparent)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:236  `.stage :global(.chip)`  `background: var(--c)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:243  `.stage :global(.chip.child)`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyFigure.svelte:251  `.stage :global(.tag)`  `background: var(--surface-fill)`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyPicker.svelte:252  `.card[aria-checked="true"]`  `background: color-mix( in oklab, var(--selected-bg) 45%, var(--surface-raised) )`
    note: css: the declaration is still CSS here
- lib/cawco/accounts/StrategyPicker.svelte:288  `.radio::after`  `background: var(--selected-icon)`
    note: css: pseudo-element: stays a residual
- lib/cawco/blocks/Block.svelte:312  `.drop`  `background: var(--brand-solid)`
    note: css: the declaration is still CSS here
- lib/cawco/blocks/Block.svelte:320  `.drop::before`  `background: var(--brand-solid)`
    note: css: pseudo-element: stays a residual
- lib/cawco/config/PickerChip.svelte:109  `:global(.picker-chip)`  `background: var(--surface-raised)`
    head: lib/cawco/config/PickerChip.svelte:47 <Popover.Trigger>
    rest: same
    note: component <Popover.Trigger>: its own classes not included
- lib/cawco/config/PickerChip.svelte:125  `:global(.picker-chip:hover)`  `background: var(--surface-hover)`
    head: lib/cawco/config/PickerChip.svelte:47 <Popover.Trigger>
    rest: same
    own: same
    note: component <Popover.Trigger>: its own classes not included
- lib/cawco/config/RolloutChip.svelte:262  `:global(.rollout-chip)`  `background: var(--surface-recess)`
    head: lib/cawco/config/RolloutChip.svelte:117 <Popover.Trigger>
    rest: same
    note: component <Popover.Trigger>: its own classes not included
- lib/cawco/config/RolloutChip.svelte:282  `:global(.rollout-chip:hover)`  `background: var(--surface-hover)`
    head: lib/cawco/config/RolloutChip.svelte:117 <Popover.Trigger>
    rest: same
    own: same
    note: component <Popover.Trigger>: its own classes not included
- lib/cawco/config/RolloutChip.svelte:285  `:global(.rollout-chip[data-fail])`  `background: var(--status-fail-bg)`
    head: lib/cawco/config/RolloutChip.svelte:117 <Popover.Trigger>
    rest: same
    own: same
    note: component <Popover.Trigger>: its own classes not included
- lib/cawco/config/SectionRow.svelte:249  `.controls :global( .bg-transparent.border-transparent:not(.text-link):hover:not(:disabled) )`  `background: light-dark(var(--surface-fill-strong), var(--surface-hover))`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/decisions/DecisionPage.svelte:475  `.cin :global(.note)`  `background: transparent`
    head: lib/cawco/decisions/DecisionPage.svelte:349 <Textarea>
    rest: same
    note: component <Textarea>: its own classes not included
- lib/cawco/decisions/graph/DecisionNode.svelte:82  `.decision-node[data-picked] .ring`  `background: var(--status-done-glyph)`
    head: lib/cawco/decisions/graph/DecisionNode.svelte:40 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .decision-node[data-picked]
- lib/cawco/decisions/graph/DecisionNode.svelte:90  `.decision-node :global(.svelte-flow__handle)`  `background: transparent`
    note: css: the declaration is still CSS here
- lib/cawco/find/MentionField.svelte:785  `.editor :global(.mention-chip)`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/cawco/home/Home.svelte:222  `.home.page`  `background: var(--surface-recess)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/home/Home.svelte:289  `.dock`  `background: linear-gradient( transparent, var(--surface-recess) var(--space-4) )`
    note: css: the declaration is still CSS here
- lib/cawco/home/NeedsCard.svelte:737  `.row:has(.cover:hover)`  `background: var(--surface-hover)`
    note: css: the declaration is still CSS here
- lib/cawco/home/NeedsCard.svelte:953  `.peers > :global(.deny), .peers > :global(.deny:hover)`  `background: var(--status-fail-bg)`
    head: lib/cawco/home/NeedsCard.svelte:710 <Button>, lib/cawco/home/NeedsCard.svelte:791 <Button>, lib/cawco/home/NeedsCard.svelte:827 <Button>
    rest: same
    note: component <Button>: its own classes not included
- lib/cawco/home/NeedsCard.svelte:958  `.peers > :global(.approve), .peers > :global(.approve:hover)`  `background: var(--status-done-bg)`
    head: lib/cawco/home/NeedsCard.svelte:725 <Button>, lib/cawco/home/NeedsCard.svelte:804 <Button>, lib/cawco/home/NeedsCard.svelte:840 <Button>
    rest: same
    note: component <Button>: its own classes not included
- lib/cawco/home/UpdateCard.svelte:458  `.actions::before`  `background: linear-gradient(to bottom, transparent, var(--surface-raised))`
    note: css: pseudo-element: stays a residual
- lib/cawco/home/WorkTabs.svelte:1025  `.count`  `background: color-mix( in oklab, var(--wash) calc(var(--pick) * 100%), transparent )`
    note: css: the declaration is still CSS here
- lib/cawco/home/WorkTabs.svelte:956  `:global(.work-tabs[data-slot="tabs"])`  `background: none`
    head: lib/cawco/home/WorkTabs.svelte:775 <Tabs>
    rest: same
    own: same
    note: component <Tabs>: its own classes not included
- lib/cawco/lightbox/Lightbox.svelte:378  `:global .cawco-pswp .pswp__button`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/lightbox/Lightbox.svelte:388  `:global .cawco-pswp .pswp__button:hover`  `background: var(--surface-hover)`
    note: css: the declaration is still CSS here
- lib/cawco/lightbox/Lightbox.svelte:411  `:global .cawco-pswp .pswp__counter`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/lightbox/Lightbox.svelte:432  `:global .cawco-pswp .pswp__description`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/cawco/move/MoveAsk.svelte:58  `:global(.move-details-trigger)`  `background: none`
    head: lib/cawco/move/MoveAsk.svelte:28 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/preview/PreviewPane.svelte:2002  `iframe`  `background: Canvas`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/project/CawFloat.svelte:127  `:global([data-slot="drawer-content"].caw-float-sheet)::before`  `background: var(--material-panel)`
    note: css: pseudo-element: stays a residual
- lib/cawco/project/CawFloat.svelte:135  `:global([data-slot="drawer-content"].caw-float-sheet)::before`  `background: var(--surface-raised)`
    note: css: pseudo-element: stays a residual
- lib/cawco/routines/ActionsTable.svelte:143  `.actions-ledger :global(tr.band)`  `background: var(--surface-band)`
    head: lib/cawco/routines/ActionsTable.svelte:90 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included
- lib/cawco/routines/RoutineDetail.svelte:281  `.runs-ledger :global(tr.band)`  `background: var(--surface-band)`
    head: lib/cawco/routines/RoutineDetail.svelte:182 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included
- lib/cawco/side/SideSheet.svelte:435  `:global(.preview-sheet .preview-grab[data-vaul-handle])`  `background: var(--border-control)`
    note: css: the declaration is still CSS here
- lib/cawco/side/SideSurface.svelte:208  `.side-head :global(:is(button, a):not([role="tab"]))`  `background: transparent`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/side/SideSurface.svelte:241  `.side-head :global(:is(button, a):not([role="tab"]):hover)`  `background: var(--surface-hover)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/side/Split.svelte:482  `.side-split :global(.side-divider)`  `background: var(--border-hairline)`
    head: lib/cawco/side/Split.svelte:365 <Resizable.Handle>
    rest: same
    note: component <Resizable.Handle>: its own classes not included
- lib/cawco/side/Split.svelte:501  `.side-split :global(.side-divider[data-active])`  `background: var(--ink-muted)`
    head: lib/cawco/side/Split.svelte:365 <Resizable.Handle>
    rest: same
    own: same
    note: component <Resizable.Handle>: its own classes not included
- lib/cawco/side/Split.svelte:505  `.side-split :global(.side-divider:hover)`  `background: var(--border-control)`
    head: lib/cawco/side/Split.svelte:365 <Resizable.Handle>
    rest: same
    own: same
    note: component <Resizable.Handle>: its own classes not included
- lib/cawco/spawn/ModelSection.svelte:548  `:global(.harness-rail)`  `background: var(--surface-recess)`
    head: lib/cawco/spawn/ModelSection.svelte:318 <Rail>
    rest: same
    note: component <Rail>: its own classes not included
- lib/cawco/spawn/ModelSection.svelte:689  `.tools :global(.ns-chip-btn.tool)`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/spawn/NewSessionDialog.svelte:2165  `:global(.session-scrim)`  `background: var(--scrim)`
    head: lib/cawco/spawn/NewSessionDialog.svelte:1791 <DialogPrimitive.Overlay>
    rest: same
    note: component <DialogPrimitive.Overlay>: its own classes not included
- lib/cawco/spawn/NewSessionDialog.svelte:2177  `:global(.session-card:not([data-vaul-drawer]))`  `background: var(--surface-recess)`
    head: lib/cawco/spawn/NewSessionDialog.svelte:1757 <DrawerContent>, lib/cawco/spawn/NewSessionDialog.svelte:1804 <DialogPrimitive.Content>
    rest: same
    note: component <DrawerContent>: its own classes not included; component <DialogPrimitive.Content>: its own classes not included
- lib/cawco/spawn/PromptEditor.svelte:419  `.editor :global(.ns-chip)`  `background: var(--surface-fill)`
    note: css: the declaration is still CSS here
- lib/cawco/tasks/PostCard.svelte:175  `.card + .card::before`  `background: var(--border-control)`
    note: css: pseudo-element: stays a residual
- lib/cawco/tasks/TaskActivity.svelte:417  `.part :global(.fold-head)`  `background: none`
    head: lib/cawco/tasks/TaskActivity.svelte:288 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/tasks/TaskColumn.svelte:201  `li[data-picked] > :global(.task-card)`  `background: var(--selected-bg)`
    note: css: the declaration is still CSS here
- lib/cawco/tasks/TaskNeeds.svelte:369  `.peers > :global(.deny), .peers > :global(.deny:hover)`  `background: var(--status-fail-bg)`
    head: lib/cawco/tasks/TaskNeeds.svelte:211 <Button>
    rest: same
    note: component <Button>: its own classes not included
- lib/cawco/tasks/TaskNeeds.svelte:374  `.peers > :global(.approve), .peers > :global(.approve:hover)`  `background: var(--status-done-bg)`
    head: lib/cawco/tasks/TaskNeeds.svelte:223 <Button>
    rest: same
    note: component <Button>: its own classes not included
- lib/cawco/tasks/TaskTable.svelte:360  `.ledger :global(tr.band)`  `background: var(--surface-band)`
    head: lib/cawco/tasks/TaskTable.svelte:225 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included
- lib/cawco/tasks/TaskTable.svelte:396  `.ledger :global(tr.row[data-picked] td)`  `background: var(--selected-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/tasks/TaskTable.svelte:552  `.ledger[data-pickable] :global(tr.row[data-picked])`  `background: var(--selected-bg)`
    head: lib/cawco/tasks/TaskTable.svelte:303 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included; ancestor-state: state on an ancestor: .ledger[data-pickable]; unrendered: T :258 state own: the state is on an ancestor (.ledger[data-pickable])
- lib/cawco/tasks/TaskTable.svelte:555  `.ledger[data-pickable] :global(tr.row[data-picked] td)`  `background: none`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/AttachButton.svelte:111  `.att-btn:hover`  `background: var(--surface-hover)`
    head: lib/cawco/transcript/AttachButton.svelte:47 <DropdownMenu.Trigger>, lib/cawco/transcript/AttachButton.svelte:68 <button>
    rest: same
    own: same
    note: component <DropdownMenu.Trigger>: its own classes not included
- lib/cawco/transcript/AttachButton.svelte:93  `.att-btn`  `background: var(--surface-raised)`
    head: lib/cawco/transcript/AttachButton.svelte:47 <DropdownMenu.Trigger>, lib/cawco/transcript/AttachButton.svelte:68 <button>
    rest: same
    note: component <DropdownMenu.Trigger>: its own classes not included
- lib/cawco/transcript/CompactionDivider.svelte:372  `.fail`  `background: linear-gradient(var(--status-fail-ink), var(--status-fail-ink)) left top / 2px 100% no-repeat`
    note: css: the declaration is still CSS here
- lib/cawco/transcript/Composer.svelte:3764  `.field > :global(.editor)`  `background: transparent`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Composer.svelte:3918  `.menu :global([data-slot="command"])`  `background: transparent`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Composer.svelte:4237  `.what::before`  `background: var(--selected-icon)`
    note: css: pseudo-element: stays a residual
- lib/cawco/transcript/Delegate.svelte:558  `.delegate :global(.bhead)`  `background: none`
    head: lib/cawco/transcript/Delegate.svelte:429 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/transcript/Delegate.svelte:686  `.pill.live`  `background: var(--status-live-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Delegate.svelte:698  `.pill.attn`  `background: var(--status-attn-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Delegate.svelte:702  `.pill.done`  `background: var(--status-done-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Delegate.svelte:706  `.pill.fail`  `background: var(--status-fail-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Peer.svelte:216  `.label :global(.peer-toggle)`  `background: none`
    head: lib/cawco/transcript/Peer.svelte:191 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/transcript/Row.svelte:487  `.row[data-marked]::before`  `background: var(--selection)`
    note: css: pseudo-element: stays a residual
- lib/cawco/transcript/Subagent.svelte:183  `.branch :global(.bhead)`  `background: none`
    head: lib/cawco/transcript/Subagent.svelte:83 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/transcript/Subagent.svelte:299  `.pill.running`  `background: var(--status-live-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Subagent.svelte:303  `.pill.done`  `background: var(--status-done-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/Subagent.svelte:307  `.pill.failed`  `background: var(--status-fail-bg)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/transcript/SuggestionChips.svelte:367  `.chip`  `background: color-mix( in srgb, var(--action-solid) var(--tint), var(--surface-raised) )`
    note: css: the declaration is still CSS here
- lib/cawco/transcript/SuggestionChips.svelte:392  `.chip:hover`  `background: color-mix( in srgb, var(--action-solid) calc(var(--tint) + 6%), var(--surface-raised) )`
    note: css: the declaration is still CSS here
- lib/cawco/transcript/SystemLine.svelte:450  `.note :global(.ftrig)`  `background: none`
    head: lib/cawco/transcript/SystemLine.svelte:205 <Collapsible.Trigger>, lib/cawco/transcript/SystemLine.svelte:482 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/transcript/SystemLine.svelte:492  `.note[data-code]`  `background: none`
    note: css: the declaration is still CSS here
- lib/cawco/transcript/ToolGroup.svelte:671  `.mark`  `background: var(--mark-overlay), var(--mark-6)`
    note: css: the declaration is still CSS here
- lib/cawco/turn/Well.svelte:104  `.well :global(.msg code)`  `background: var(--surface-raised)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/turn/Well.svelte:68  `.well::before`  `background: var(--surface-recess-deep)`
    note: css: pseudo-element: stays a residual
- lib/cawco/turn/Well.svelte:89  `.well::after`  `background: var(--seam)`
    note: css: pseudo-element: stays a residual
- lib/cawco/updates/ChannelCards.svelte:183  `.chooser :global(.ccard)`  `background: none`
    head: lib/cawco/updates/ChannelCards.svelte:112 <RadioGroup.Item>
    rest: same
    note: component <RadioGroup.Item>: its own classes not included
- lib/cawco/updates/ChannelCards.svelte:195  `.chooser :global(.ccard:active)`  `background: var(--surface-fill)`
    head: lib/cawco/updates/ChannelCards.svelte:112 <RadioGroup.Item>
    rest: same
    own: same
    note: component <RadioGroup.Item>: its own classes not included
- lib/cawco/updates/ChannelCards.svelte:199  `.chooser :global(.ccard:hover)`  `background: var(--surface-hover)`
    head: lib/cawco/updates/ChannelCards.svelte:112 <RadioGroup.Item>
    rest: same
    own: same
    note: component <RadioGroup.Item>: its own classes not included
- lib/cawco/usage/History.svelte:512  `.slot:hover .bar`  `background: var(--ink-strong)`
    head: lib/cawco/usage/History.svelte:368 <span>, lib/cawco/usage/History.svelte:387 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .slot:hover
- lib/cawco/usage/ProjectSpend.svelte:625  `.ledger :global(tr.band)`  `background: var(--surface-band)`
    head: lib/cawco/usage/ProjectSpend.svelte:474 <Table.Row>, lib/cawco/usage/ProjectSpend.svelte:562 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included
- lib/cawco/usage/Relay.svelte:303  `.blank`  `background: repeating-linear-gradient( -45deg, var(--border-control) 0 1px, var(--ring-ground, var(--surface-raised)) 1px var(--space-1) )`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewCalendar.svelte:188  `.view-calendar :global(.ec-main)`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewCalendar.svelte:226  `.view-calendar :global(.ec-event.chip-set)`  `background: var(--surface-raised)`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewCalendar.svelte:231  `.view-calendar :global(.ec-event.chip-done)`  `background: var(--status-done-bg)`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewCalendar.svelte:235  `.view-calendar :global(.ec-event.chip-attn)`  `background: var(--status-attn-bg)`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewPipeline.svelte:164  `.row[data-kind="you"] .bar`  `background: var(--brand-solid)`
    head: lib/cawco/views/ViewPipeline.svelte:81 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .row[data-kind="you"]
- lib/cawco/views/ViewPipeline.svelte:167  `.row[data-kind="done"] .bar`  `background: var(--status-done-bg)`
    head: lib/cawco/views/ViewPipeline.svelte:81 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .row[data-kind="done"]
- lib/cawco/views/ViewPipeline.svelte:176  `.row[data-kind="dropped"] .bar`  `background: transparent`
    head: lib/cawco/views/ViewPipeline.svelte:81 <span>
    rest: same
    note: ancestor-state: state on an ancestor: .row[data-kind="dropped"]
- lib/cawco/views/ViewRoutines.svelte:1071  `.ledger :global(table > thead th)`  `background: var(--surface-band)`
    head: lib/cawco/views/ViewRoutines.svelte:923 <th>, lib/cawco/views/ViewRoutines.svelte:927 <th>, lib/cawco/views/ViewRoutines.svelte:975 <th>, lib/cawco/views/ViewRoutines.svelte:979 <th>, lib/cawco/views/ViewRoutines.svelte:981 <th>
    rest: same
    note: unmapped: T :888 has no element now; unmapped: T :892 has no element now; unmapped: T :894 has no element now
- lib/cawco/views/ViewRoutines.svelte:1079  `.ledger :global(tr.band)`  `background: var(--surface-band)`
    note: css: the declaration is still CSS here
- lib/cawco/views/ViewRoutines.svelte:1150  `.ledger :global(.opener)`  `background: none`
    head: lib/cawco/views/ViewRoutines.svelte:739 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/cawco/views/ViewRoutines.svelte:1213  `.ledger :global(tbody.routine[data-state="open"] > tr > td)`  `background: var(--surface-well)`
    head: lib/cawco/views/ViewRoutines.svelte:812 <td>, lib/cawco/views/ViewRoutines.svelte:842 <td>
    rest: same
    note: ancestor-state: state on an ancestor: .ledger tbody.routine[data-state="open"] tr
- lib/cawco/views/canvas/TaskNode.svelte:87  `.task-node :global(.svelte-flow__handle)`  `background: transparent`
    note: css: the declaration is still CSS here
- lib/cawco/views/openui/ViewTable.svelte:100  `.ledger :global(tr.band)`  `background: var(--surface-band)`
    head: lib/cawco/views/openui/ViewTable.svelte:63 <Table.Row>
    rest: same
    note: component <Table.Row>: its own classes not included
- lib/cawco/workspace/PaneGrid.svelte:228  `:global(.grid-group [data-pane-resizer])`  `background: var(--border-hairline)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/workspace/PaneGrid.svelte:233  `:global(.grid-group [data-pane-resizer]:hover)`  `background: var(--border-control)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/workspace/PaneGrid.svelte:238  `:global(.grid-group [data-pane-resizer][data-active="pointer"]), :global(.grid-group [data-pane-resizer][data-active="keyboard"])`  `background: var(--ink-muted)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/cawco/workspace/PaneTabs.svelte:2016  `:global(.session-tabs)`  `background: var(--surface-shelf)`
    note: css: the declaration is still CSS here
- lib/cawco/workspace/PaneTabs.svelte:2029  `:global(.session-tabs.hosted)`  `background: none`
    note: css: the declaration is still CSS here
- lib/cawco/workspace/PaneTabs.svelte:2168  `.tab.drop-before::before, .tab.drop-after::after`  `background: var(--ink-strong)`
    note: css: pseudo-element: stays a residual
- lib/cawco/workspace/SessionDetails.svelte:947  `.model-pop :global(.picker)`  `background: transparent`
    note: css: the declaration is still CSS here
- lib/components/features/MarkdownEditor.svelte:162  `.crepe-host :global(.milkdown)`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/components/features/MarkdownEditor.svelte:250  `.crepe-host :global(.milkdown .milkdown-code-block)`  `background: var(--surface-recess)`
    note: css: the declaration is still CSS here
- lib/components/features/MarkdownEditor.svelte:255  `.crepe-host :global(.milkdown :is(.cm-editor, .cm-gutters))`  `background: var(--surface-recess)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/components/features/MarkdownEditor.svelte:275  `.crepe-host :global(.milkdown :is(button, [role="button"]):active)`  `background: var(--surface-fill)`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- lib/components/features/MarkdownEditor.svelte:283  `.crepe-host :global(.milkdown .milkdown-block-handle .operation-item.active)`  `background: light-dark(var(--surface-fill-strong), var(--surface-fill))`
    note: css: the declaration is still CSS here
- lib/components/features/tool-cards/MemoryBody.svelte:286  `.docs :global(.doc)`  `background: none`
    head: lib/components/features/tool-cards/MemoryBody.svelte:244 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- lib/components/features/workflows/WorkflowCanvas.svelte:264  `.canvas :global(.svelte-flow__handle)`  `background: var(--neutral-8)`
    note: css: the declaration is still CSS here
- lib/components/features/workflows/WorkflowCanvas.svelte:271  `.canvas :global(.svelte-flow__handle:active)`  `background: var(--brand-solid)`
    note: css: the declaration is still CSS here
- lib/components/features/workflows/WorkflowNodeCard.svelte:255  `.port.near :global(.svelte-flow__handle)`  `background: var(--brand-solid)`
    note: css: the declaration is still CSS here
- lib/components/ui/fluid-tabs/TabsList.svelte:1242  `:global([data-variant="folder"]) .ff-tabs-list`  `background: none`
    head: lib/components/ui/fluid-tabs/TabsList.svelte:1104 <div>
    rest: same
    note: ancestor-state: state on an ancestor: [data-variant="folder"]
- lib/components/ui/thinking-steps/thinking-step.svelte:255  `.shimmer`  `background: linear-gradient( 90deg, var(--ink-muted) 0% 35%, var(--ink-strong) 50%, var(--ink-muted) 65% 100% )`
    head: lib/components/ui/thinking-steps/thinking-step.svelte:139 <span>, lib/components/ui/thinking-steps/thinking-step.svelte:157 <span>
    rest: same
    own: backgroundPosition: 82.4989% 0px → 0% 0%
- lib/components/ui/thinking-steps/thinking-steps-header.svelte:43  `:global(.thinking-header)`  `background: none`
    head: lib/components/ui/thinking-steps/thinking-steps-header.svelte:18 <Collapsible.Trigger>
    rest: same
    note: component <Collapsible.Trigger>: its own classes not included
- routes/(app)/config/models/+page.svelte:638  `[data-tone="ok"] .dot`  `background: var(--status-live-glyph)`
    head: routes/(app)/config/models/+page.svelte:362 <span>, routes/(app)/config/models/+page.svelte:394 <span>, routes/(app)/config/models/+page.svelte:464 <span>, routes/(app)/config/models/+page.svelte:526 <span>
    rest: same
    note: ancestor-state: state on an ancestor: [data-tone="ok"]
- routes/(app)/config/phone/+page.svelte:252  `[data-tone="ok"] .dot`  `background: var(--status-live-glyph)`
    head: routes/(app)/config/phone/+page.svelte:168 <span>
    rest: same
    note: ancestor-state: state on an ancestor: [data-tone="ok"]
- routes/(app)/config/phone/+page.svelte:256  `[data-tone="bad"] .dot`  `background: var(--status-attn-glyph)`
    head: routes/(app)/config/phone/+page.svelte:168 <span>
    rest: same
    note: ancestor-state: state on an ancestor: [data-tone="bad"]
- routes/(app)/project/[id]/+page.svelte:2259  `:global(.kit-pop.view-ask-pop)`  `background: none`
    note: unmapped: no element in this file carries the selector (a child component's DOM, or :global)
- routes/(app)/usage/+page.svelte:272  `.top :global(.project-chip[data-on])`  `background: var(--selected-bg)`
    head: routes/(app)/usage/+page.svelte:172 <Select.Trigger>
    rest: same
    own: same
    note: component <Select.Trigger>: its own classes not included
