# W8-app-recipes

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report: interface-craft (Design Critique), ui-observer.

Start: 682ede2877621d672bb0b38815e7d56370494dec (cawco/cutover-integration). Tailwind 4.3.3 (`@tailwindcss/node` 4.3.3). The file list is `.cutover/lanes/W8-app-recipes.files`; the gates are `.cutover/gates/` (origin/cawco-cutover/gates 7f53fb6a7).

better-ui rules followed:
- Press scales to 0.97 and a disabled control never scales; rows tint (DESIGN.md, The Press Rule): one press recipe (ui/button `pressVariants`) is the kit Button's `press` and the press of every compact control the kit draws no part for; rows, crumbs, tabs and segments take `press-tint`.
- Transition only what changes: every recipe names its properties; nothing is `all`.
- Hover only on hover-capable pointers: `can-hover:` or Tailwind's `hover:` (`@media (hover: hover)`), never a bare `:hover`.
- Gate motion behind reduced motion: every scale and slide is `motion-safe:`; colour transitions run always.
- Shadows for elevation, borders for structure: the tray chip keeps its hairline under `shadow-tile`, the dock shell its control edge under `shadow-tile`.

better-layout rules followed:
- Breakpoints come from the content: the icon-card grid is `repeat(auto-fit, minmax(min(100%, c-icon-card-min), 1fr))`; no breakpoint outside DESIGN.md's 640/900/1024 is left.
- Plan for growth: chips keep `max-w-full`, truncate inside `data-slot="chip-label"` and wrap whole (`flex-wrap`).
- Logical properties: `ms-auto` for a section head's count, `ps-`/`pe-` on the editor chip.
- Group with space: chip rows 7px apart, 14px under a finger so each 44px `touch-hit` meets its neighbour's at the midpoint.

## Variant table (variant → role → DESIGN.md line → sites)

| recipe / variant | role | DESIGN.md | sites |
| --- | --- | --- | --- |
| ui/chip `variant: "option"` | an option chip | Permission gate: "option chips (30px, 8px radius, keycap digits). A picked option takes the coral edge (`brand-solid`), a recessed fill and a keycap filled vermillion" | QuestionCard 320, 331; Prompt 863, 1025, 1041; RecordCard 91, 221; ViewRoutines 878; project/new 227; TaskLabels 99 |
| ui/chip `variant: "tray"` | a chip on the composer's tray row | The Press Rule: "a chip … scales to 0.97" | DelegateTray 1198, 1537, 1568; Composer 3065; PlanRing 31 |
| ui/chip `variant: "setting"` (`size`, `tone`) | a setting chip | New-session dialog: "Setting chips are 30px with an 8px radius, a 16px glyph and a 12px chevron. A setting that cannot be changed where it is shown is the same chip sunk into the surface"; Session card: "one group of equal chips `--space-1` apart"; The Consequential Grant Rule | LifetimeChip 54; MachinesChip 80 (`fail`); ProjectChip 90 (`muted`); LocationChip 75 (`muted`); AccountChip 76; ToolChips 137, 146, 177 (`grant`), 202, 232 (`grant`); AccountSwitch 78, 133; NewSessionDialog 2008 |
| ui/chip `chipsVariants` | a row of option chips | The 44 Touch Rule (midpoint hit-gaps) | QuestionCard 313; Prompt 858, 1068, 1086; ViewRoutines 868; project/new 220 |
| ui/menu-item | a row in a floating surface | Shapes: "8px for items inside a surface"; The 44 Touch Rule: "Menu items and nav rows are 44px tall on touch" | kit: context-menu-item 20, -sub-trigger 36, -checkbox-item 24, -radio-item 19; dropdown-menu-item 44, -checkbox-item 22, -radio-item 16, -sub-trigger 20; select-item 19; command-item 17. app: FilesList 762, 779, 791; TaskRelations 152; StagesControl 173; BulkBar 233; FetchSkillPopover 221; PickerChip 90; connections 1058 |
| ui/section-header `sectionHeadVariants` `list` / `flush` | a list section's head | Borders are graded: "`border-hairline` separates rows and regions" | list: HomeRecent 97. flush: TodoList 160; TaskFields 70; TaskRelations 119; TaskPane 677, 705; TextSection 49; TaskActivity 281 |
| ui/dock-shell | what docks at a page's foot | Composer, Shell: "a 12px pill in the panel material (composer glass) with a 1px control edge and the tile shadow" | Composer 3367; DecisionPage 340; ViewBar 133 |
| ui/button `sendVariants` | Send / Stop / Ask Caw | Composer, Controls: "Send/Stop (coral action), each at the concentric 5px radius. They scale to 0.97 on press" | Composer 3648; ViewBar 204 |
| ui/button `pressVariants({ press: "scale" })` | a compact control with no kit part | The Press Rule | AttachmentChips 79, 109, 138, 159, 182; NewSessionDialog 1916 (the sheet's close) |
| kit Button (`outline`, `sm`, `secondary`, `ghost tone quiet`, `pending`) | the dialog's buttons | Buttons | SessionFooter 33, 38; ProjectChip 170, 179; MachinesChip 106; LocationSection 236, 247, 377 |
| ui/icon-tile (`empty`, `data-ink`) | an icon tile | New-session dialog: "Icon tiles are raised 8px squares with the tile shadow, dashed for empty or inverted for chosen"; Identity marks and tiles: "Icon tile" | LifetimeChip 84; TriggerMenu 57; PermissionSection 113; MachinesChip 166 (`empty`); ProjectChip 202, 233 (`empty`); machine-row 34 |
| ui/glide-popover | the dialog's popover surface | New-session dialog: "Its popovers glide between sibling triggers, morphing width and height over 260ms on the drawer curve"; Breakpoints: "popovers widen to the viewport less 24px" | NsPopover 182; NsPopoverGroup 104; signin-problem bench 37 |
| ui/icon-card `iconCardVariants` / `iconCardsVariants` | a pickable card led by an icon tile, and its grid | Channel cards; The Press Rule (cards tint); The One Ring Rule | MachinesEmpty 94, 105; TemplateCards 151, 168 |

## Sheet classes

sheet: kit-chip → kit part (ui/chip `option`) — a multi-property look in 6 components; its pick is the element's state (`aria-pressed`, `aria-checked`, `data-chosen`).
sheet: kit-chips → kit part (ui/chip `chipsVariants`) — the chip row in 4 components.
sheet: kit-chip-chosen → state as attribute (`data-chosen`).
sheet: kit-tray-chip → kit part (ui/chip `tray`) — 3 components; SideSheet's hook moved to `data-tray-chip`.
sheet: kit-item → kit part (ui/menu-item) — 10 kit and 7 app files. As a utility it outranked its callers (compiled: `.kit-item` sorted after `.min-h-c-artifact-row-h`, so FilesList's 44px rows would have taken 32px); as a recipe it merges through tailwind-merge as the components layer lost to them. The highlight's rows hook moved to `data-menu-item`.
sheet: kit-section-head → kit part (ui/section-header `sectionHeadVariants`) — 8 components; its `> .count` child styles moved onto the counts (`num ms-auto type-meta text-ink-subtle`) and the Button's `head: count` (`ms-auto tabular-nums`).
sheet: kit-edge-fade → one behaviour used across the app (`@utility kit-edge-fade`, same name, users unchanged); its overridable defaults (inline mask, `--fade-len`) sit at no weight in `@layer components`, because PaneTabs' phone strip and `fade-len-*` override them.
sheet: kit-edge-fade-block → one behaviour used across the app (`@utility kit-edge-fade-block`).
sheet: kit-send → kit part (ui/button `sendVariants`) — 2 components; it carries `pressable`.
sheet: kit-dock-shell → kit part (ui/dock-shell) — 3 components.
sheet: kit-seam → its one user's own utilities (WorkTabs 896: `mx-(--seam-inset) h-px border-0 bg-seam`).
sheet: kit-nest → one behaviour used across the app (`@utility kit-nest`, same name); the fold script (motion/branch `NEST`, line 343) finds its lists by `data-nest`, never by the utility's name.
sheet: icon-card / icon-cards → kit part (ui/icon-card) + foreign DOM for the highlight's pill (`[data-slot="icon-cards"] :is(.kit-pill, .kit-pill-trail)`: components/ui/highlight draws those elements into the grid).
sheet: mention-glyph → the script's own utilities (MentionField 501), hook `data-mention-glyph`.
sheet: ns-chip, ns-chip-icon → the script's own utilities (PromptEditor 155, 158).
sheet: ns-chip-btn → kit part (ui/chip `setting`, `size`, `tone`); app.css's `session-details-chips` `.ns-chip-btn` host rules deleted (`size: "compact"` replaces them).
sheet: ns-btn → the kit Button's sizes.
sheet: ns-tile → kit part (ui/icon-tile), which ui/machine-row now draws too.
sheet: ns-pop → kit part (ui/glide-popover); ns-panel-set and ns-morph → their one element's own utilities in NsPopoverGroup (170, 178).
sheet: `.ns-theme button` / `button:active` / `input` / `[contenteditable]` / `input::placeholder` / `.ns-tile svg` / `.ns-chip-btn > svg` (labelled foreign-dom, but the dialog's own DOM) → deleted; each control the rule reached took its own press, transition or placeholder (Kit swaps, Fixed).
sheet: ns-in, ns-check, ns-panel → true `@utility`, their keyframes on the theme (`@theme inline { --animate-ns-* }`, read with `--theme(--animate-ns-* inline)`); ns-pop's open and close as `--animate-ns-pop-in / -out`.
sheet: fai-comb, fai-scroll → true `@utility` (a repeating-gradient comb; a scrollbar's paint).
sheet: ns-theme → true `@utility` (the dialog's timing scope and body face on its roots).

## Kit swaps

kit-swap: apps/dashboard/src/lib/cawco/transcript/QuestionCard.svelte:313 Chip chipsVariants — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/QuestionCard.svelte:320 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/QuestionCard.svelte:331 Chip option (data-chosen) — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:858 Chip chipsVariants — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:863 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:1025 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:1041 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:1068 Chip chipsVariants — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Prompt.svelte:1086 Chip chipsVariants — done
kit-swap: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:91 Chip option (data-chosen) — done
kit-swap: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:221 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:868 Chip chipsVariants — done
kit-swap: apps/dashboard/src/lib/cawco/views/ViewRoutines.svelte:878 Chip option — done
kit-swap: apps/dashboard/src/routes/(app)/project/new/+page.svelte:220 Chip chipsVariants — done
kit-swap: apps/dashboard/src/routes/(app)/project/new/+page.svelte:227 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskLabels.svelte:99 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1198 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1537 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1568 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Composer.svelte:3065 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/plan/PlanRing.svelte:31 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LifetimeChip.svelte:54 Chip setting — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/MachinesChip.svelte:80 Chip setting tone fail — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ProjectChip.svelte:90 Chip setting tone muted — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LocationChip.svelte:75 Chip setting tone muted — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/AccountChip.svelte:76 Chip setting — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:137 Chip setting (aria-disabled) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:146 Chip setting (static) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:177 Chip setting tone grant (static) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:202 Chip setting — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ToolChips.svelte:232 Chip setting tone grant — done
kit-swap: apps/dashboard/src/lib/cawco/accounts/AccountSwitch.svelte:78 Chip setting — done
kit-swap: apps/dashboard/src/lib/cawco/accounts/AccountSwitch.svelte:133 Chip setting (static) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:2008 Chip setting (static) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NewSessionDialog.svelte:1916 Button pressVariants scale (the sheet's close) — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachmentChips.svelte:79 Button pressVariants scale — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachmentChips.svelte:109 Button pressVariants scale — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachmentChips.svelte:138 Button pressVariants scale — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachmentChips.svelte:159 Button pressVariants scale — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/AttachmentChips.svelte:182 Button pressVariants scale — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/SessionFooter.svelte:33 Button outline — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/SessionFooter.svelte:38 Button default (label, pending, pendingLabel, failed) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ProjectChip.svelte:170 Button outline sm — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ProjectChip.svelte:179 Button default sm (label, pending) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/MachinesChip.svelte:106 Button outline sm — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LocationSection.svelte:236 Button ghost sm tone quiet — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LocationSection.svelte:247 Button secondary sm — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LocationSection.svelte:377 Button default sm — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/LifetimeChip.svelte:84 IconTile — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/TriggerMenu.svelte:57 IconTile — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/PermissionSection.svelte:113 IconTile — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/MachinesChip.svelte:166 IconTile empty — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ProjectChip.svelte:202 IconTile — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/ProjectChip.svelte:233 IconTile empty — done
kit-swap: apps/dashboard/src/lib/components/ui/machine-row/machine-row.svelte:34 IconTile (data-ink) — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NsPopover.svelte:182 GlidePopover pad — done
kit-swap: apps/dashboard/src/lib/cawco/spawn/NsPopoverGroup.svelte:104 GlidePopover — done
kit-swap: apps/dashboard/src/routes/(app)/motion/signin-problem/+page.svelte:37 GlidePopover — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Composer.svelte:3367 DockShell — done
kit-swap: apps/dashboard/src/lib/cawco/decisions/DecisionPage.svelte:340 DockShell — done
kit-swap: apps/dashboard/src/lib/cawco/project/ViewBar.svelte:133 DockShell — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Composer.svelte:3648 Button send — done
kit-swap: apps/dashboard/src/lib/cawco/project/ViewBar.svelte:204 Button send — done
kit-swap: apps/dashboard/src/lib/cawco/home/HomeRecent.svelte:97 SectionHeader list — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TodoList.svelte:160 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskFields.svelte:70 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskRelations.svelte:119 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:677 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskPane.svelte:705 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TextSection.svelte:49 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskActivity.svelte:281 SectionHeader flush — done
kit-swap: apps/dashboard/src/lib/cawco/MachinesEmpty.svelte:94 IconCard grid — done
kit-swap: apps/dashboard/src/lib/cawco/MachinesEmpty.svelte:105 IconCard — done
kit-swap: apps/dashboard/src/lib/cawco/project/TemplateCards.svelte:151 IconCard grid — done
kit-swap: apps/dashboard/src/lib/cawco/project/TemplateCards.svelte:168 IconCard — done
kit-swap: apps/dashboard/src/lib/components/ui/context-menu/context-menu-item.svelte:20 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/context-menu/context-menu-sub-trigger.svelte:36 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/context-menu/context-menu-checkbox-item.svelte:24 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/context-menu/context-menu-radio-item.svelte:19 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-item.svelte:44 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-checkbox-item.svelte:22 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-radio-item.svelte:16 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/dropdown-menu/dropdown-menu-sub-trigger.svelte:20 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/select/select-item.svelte:19 MenuItem — done
kit-swap: apps/dashboard/src/lib/components/ui/command/command-item.svelte:17 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:762 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:779 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/files/FilesList.svelte:791 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskRelations.svelte:152 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/StagesControl.svelte:173 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/BulkBar.svelte:233 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/config/FetchSkillPopover.svelte:221 MenuItem — done
kit-swap: apps/dashboard/src/lib/cawco/config/PickerChip.svelte:90 MenuItem — done
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1058 MenuItem — done

For integration (files of W4-controls and W5, not edited here; these classes no longer exist after this lane):
kit-swap: apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:449 `ns-tile size-c-mark` + `data-variant="ink"` → ui/icon-tile `iconTileVariants()` with `data-ink`
kit-swap: apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:541 `ns-tile size-c-mark overflow-hidden group-disabled:opacity-50` → `iconTileVariants({ class: "overflow-hidden group-disabled:opacity-50" })`
kit-swap: apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:383 the raw icon button (`size-space-6 … hover:text-ink-strong`) → `pressVariants({ press: "scale", class: … })` (it pressed by the deleted `.ns-theme button:active` rule)
kit-swap: apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:438 and :496 the `press-tint` rows → add `transition-control` (the deleted `.ns-theme button` rule eased their colours)
kit-swap: apps/dashboard/src/lib/cawco/spawn/ModelSection.svelte:358 the raw search input → add `placeholder:text-ink-muted` (the deleted `.ns-theme input::placeholder` rule)
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:709 `triggerClass="ns-chip-btn"` → `triggerClass={chipVariants({ variant: "setting", size: "compact" })}`
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:750 `data-slot="ns-chip-btn" … class="ns-chip-btn"` (static model chip) → `class={chipVariants({ variant: "setting", size: "compact" })}`, `data-slot` dropped (nothing reads it)
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:756 `<ToolChips …>` → `size="compact"`
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:778 `<AccountSwitch …>` → `size="compact"`
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:872 `ns-btn cursor-pointer max-phone:flex-1` `data-size="xs" data-variant="primary"` → `<Button size="sm" class="max-phone:flex-1">` (DESIGN.md, Buttons: `sm` is 30px; the "chip-scale" 7px inset and 8px radius are no button size)
kit-swap: apps/dashboard/src/lib/cawco/workspace/SessionDetails.svelte:652 the raw `cwd` text button → its press per The Press Rule (a text link dims to 72%), which the deleted rule's 0.97 scale stood in for

Hooks moved off class names (a hook is an attribute):
fixed: QuestionCard.svelte:133 `.kit-chip` query → `:scope > span`; :147 `[data-slot="qopts"] > [data-key=…]`.
fixed: SideSheet.svelte:58 `[data-slot="lift"] .kit-tray-chip` → `[data-tray-chip]`; scripts/probe-landing-race.ts:376 the same.
fixed: the six kit floating surfaces' highlight `rows: ".kit-item"` → `[data-menu-item]` (command-list, context-menu-content, context-menu-sub-content, dropdown-menu-content, dropdown-menu-sub-content, select-content); app.css `:where(.kit-item) .kit-tick` → `:where([data-menu-item]) .kit-tick`.
fixed: motion/branch.svelte.ts `.kit-nest` queries → `[data-nest]`; every nesting list carries `data-nest` (RunSteps 172, WorkTabs 701, SessionTree 95, Sidebar 740, 1113, AskItems 73, StopTray 871, PlanTree 104).
fixed: MachinesEmpty / TemplateCards highlight rows → `[data-slot="icon-card"]`; MentionField:257 → `[data-mention-glyph]`.
fixed: probe specs chosen-hover.ts and page-marks.ts `.ns-pop` → `[data-ns-pop]` (the surfaces' existing hook).
fixed: app.css mark-line list drops `.kit-chip`, `.kit-tray-chip`, `.kit-item`, `.kit-section-head`: each recipe carries `mark-line`.

Each control the `.ns-theme button` rule reached now owns its press:
fixed: LifetimeChip 73, TriggerMenu 48, PermissionSection 104, LocationSection 291, 303, 316, 343, Segmented 70: `press-tint` rows and segments take `transition-control`.
fixed: AccountChip 101, 119, AccountSwitch 98: listbox rows took the rule's 0.97 scale; rows tint (The Press Rule), so `press-tint transition-control`.
fixed: Rail 208: harness tabs in a strip took the rule's scale; tabs tint, so `press-tint`.
fixed: AttachmentChips 79, 109, 138, 159, 182: compact controls; `pressVariants({ press: "scale" })`, the same in the composer and the dialog.
fixed: transcript/AttachButton: the rule stacked a transform scale on its own `scale` (0.97 × 0.97) in the dialog; gone with the rule, no edit.
fixed: ProjectChip 136, 151, LocationSection 222, 411: raw inputs take `placeholder:text-ink-muted`.
fixed: MachinesChip 124, 141, 160 and ProjectChip 196, 225: `dur-toggle` on the base with `motion-safe:transition-[…]` let the later utility reset the duration to the default, so with motion the rows ran at 0.12s; `duration-(--dur-toggle)` sets `--tw-duration`, and they run at 0.16s (rendered: start sha `background-color, transform / 0.12s`, lane `/ 0.16s`). The same in ui/glide-popover and ui/icon-tile (`duration-(--dur-pop)`).

## Removed

removed: TaskLabels.svelte:99 the add chip's `h-c-badge-h px-space-1 gap-space-row text-ink-muted …` — a restyle of the option chip DESIGN.md does not name; `h-c-badge-h` was already dead (the chip's 30px min-height won).
removed: RecordCard.svelte:91 `cursor-default` — dead on a span.
removed: ViewBar.svelte `style:--kit-send-press` — dead: `pressable` set Send's transition at both sites.
removed: Send's disabled 0.55, ToolChips' unavailable chip 0.55, PermissionSection's and MachinesChip's disabled rows 0.55, AccountChip's 0.6, Rail's 0.45 → 50% — DESIGN.md, Buttons: "Disabled: 50% opacity".
removed: the icon-card grid's 639px and 399px column counts — breakpoints outside DESIGN.md's; the grid is content-driven.
removed: ns-theme.css `.ns-theme *` box-sizing — a duplicate of Preflight; `.ns-theme button { font: inherit; color: inherit }` and `.ns-theme input, [contenteditable] { font-family }` — duplicates of Preflight's `button, input, … { font: inherit; color: inherit }` and the scope's own body face.
removed: ns-theme.css `--ns-prompt-ms`, `--ns-chip-ms`, `--ns-thumb-ms`, `--ns-harness-thumb-ms` — no reader left.
removed: NsPopover `triggerTone` / `TONES` (the chip's `tone`) and `data-ns-popover-trigger-class` (nothing reads it); `data-slot="ns-chip-btn"` (ToolChips, AccountSwitch, NewSessionDialog) and `data-slot="primary"` on the swapped buttons (nothing reads them).
removed: ui/button's `skin: surface` and ui/collapsible-trigger's `skin` — written for the `.ns-theme` scope, no caller.
removed: the kit-keycap rule's nested `.kit-chip:is(…) &` — the chip recipe paints its keycap.

## Tokens

token: --c-edge-fade-len-phone 16px — the house edge fade under 640px; between the ladder's 14 and 18.
token: --c-menu-item-h 32px, 44px in cawco.coarse.tokens.json — a floating surface's row.
token: --c-icon-card-min 160px — an icon card's track floor.

## Theme additions

theme: utility kit-edge-fade
theme: utility kit-edge-fade-block
theme: utility kit-nest
theme: component kit-edge-fade defaults (`:where(.kit-edge-fade, .kit-edge-fade-block) { --fade-len … }`, `:where(.kit-edge-fade) { mask-image … }`)
theme: component icon-cards pill (`[data-slot="icon-cards"] :is(.kit-pill, .kit-pill-trail)`)
theme: animate ns-in, ns-check, ns-panel, ns-pop-in, ns-pop-out (ns-theme.css `@theme inline`)
All in app.css's block `/* wave 2: W8-app-recipes */` and ns-theme.css.

## Compiled check

`@tailwindcss/node` 4.3.3, `compile()` over `apps/dashboard/src/app.css`, `build([...])`:
- `.kit-edge-fade-block { isolation: isolate; mask-image: …` and `.kit-edge-fade { … animation-name: kit-edge-fade-start, kit-edge-fade-end; …` (utilities); `:where(.kit-edge-fade, .kit-edge-fade-block) { --fade-len: var(--c-edge-fade-len); @media (width < 640px) { --fade-len: var(--c-edge-fade-len-phone); }` (components). `.fade-len-c-edge-fade-len` (utilities) and PaneTabs' strip rule (components, specificity above 0) win over the defaults, as before.
- Sort order: `.kit-nest`, `.kit-edge-fade-block`, `.kit-edge-fade` sort before `.h-auto`, `.min-h-c-artifact-row-h`, `.rounded-sm`, `.fade-len-c-edge-fade-len`, `.transition-control`; `.kit-item` sorted after `.min-h-c-artifact-row-h`, which is why it became a recipe.
- `[data-branch-draw]& > li::before, … { clip-path: inset(-9999px var(--nest-cut-r) var(--nest-cut-b) -9999px) }`, `[data-branch-hold]& > li::before, … { --nest-cut-b: 9999px }` nest under `.kit-nest`.
- `:where(.ns-theme .ns-in) { animation: ns-in var(--ns-row-ms) var(--ease-out) backwards; animation-delay: var(--delay, 0ms); }`; `@keyframes ns-in, ns-check, ns-panel, ns-pop-out, ns-pop-in, kit-edge-fade-start, kit-edge-fade-end` emitted.
- `.before\:bg-\(color\:--tray-chip-fill\)::before { background-color: var(--tray-chip-fill) }`, `.can-hover\:hover\:\[--tray-chip-fill\:…\]:hover { --tray-chip-fill: var(--surface-hover) }`: the hover moves only the resting fill, so any tint a caller writes on the layer wins.
- `--c-menu-item-h: 32px;` and under `@media (pointer: coarse)` `--c-menu-item-h: 44px;`.
- The house `dur-*` sets only `transition-duration`, and a `transition-[…]` sorting after it (under `motion-safe:`) resets it through `var(--tw-duration, var(--default-transition-duration))`; the recipes pairing a non-default duration use `duration-(--dur-pop)`, which sets `--tw-duration`.

## Rendered check

`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev` (5291) and the start sha the same way from a scratch checkout (5292), one playwright-core session (Chromium 1248), `domcontentloaded`, every element's full computed style diffed, and controls pressed (mouse down, read, mouse up).

Equal rect and computed style to the start sha (the textual-only differences: `border-0` leaves `border-style: solid` at width 0; one `transition-duration` value repeated where the old shorthand listed one per property; Tailwind's composite `box-shadow` leads with four transparent layers before the same layers, e.g. `oklch(0.295 0.01 70 / 0.07) 0px 1px 2px 0px, oklch(0.295 0.01 70 / 0.035) 0px 0px 0px 1px` at both):
- 1440×900 and 390×844 (coarse): tray chip, PlanRing pressed and unpressed (pressed `::before` `oklch(0.854 0.014 82)`), dock shell (r 12px, `blur(20px) saturate(1.6)`), Send (34×34, r 5px), menu item (32px; 44px coarse; the hover ghost lands on the row, [570,154,178,32] opacity 1), option chips row and chip (30px, r 8px, px 11px), icon card (r 10px, padding 25/14/14).
- The dialog (/motion/new-session): the location setting chip, every read property equal, pressed `transform: matrix(0.97, 0, 0, 0.97, 0, 0)` at both; the popover surface `opacity, scale, translate / 0.26s / cubic-bezier(0.32, 0.72, 0, 1)` at both, 440×116; its morph `height / 0.26s / overflow clip / clip-margin 4px` at both; tiles `background-color, color / 0.26s`; the location popover's segment `background-color, border-color, color / 0.12s` (the start sha listed a dead `transform` too), pressed tint `oklch(0.854 0.014 82)` at both; the folder field's placeholder `oklch(0.495 0.014 74)` at both.
- AttachmentChips' remove: in the dialog `background-color, border-color, color, transform / 0.12s, 0.12s, 0.12s, 0.16s`, pressed `matrix(0.97, 0, 0, 0.97, 0, 0)` at both; in the composer the start sha had `all / 0s` and no press, the lane the same press as the dialog's.
- Attach in the dialog: pressed start `transform: matrix(0.97…)` with `scale: 0.97` (doubled), lane `transform: none`, `scale: 0.97`.

Differences that are corrections: Send disabled 0.55 → 0.5; icon cards at 390px two 175.5px columns where one 362px stood; Cancel's edge `border-button-outline` (DESIGN.md's outline 3:1) and Browse as DESIGN.md's secondary (10px radius, hairline edge); the sheet's close takes its own muted ink (the deleted rule's `color: inherit` had made it strong in the dialog only); Rail's disabled opacity 0.45 → 0.5; on /motion/chosen-hover the setting chips stand outside `.ns-theme` and were unstyled at the start sha (`border-top-width: 0px`, `font-size: 14px`), and are drawn as setting chips now (30px, r 8px, 13px/500).
Not rendered without a hub: an enabled Rail item (every harness tab is disabled), Finder's segments, the section heads, the nesting line, the editor chips, the session card's compact chips; their classes are proven by the compiled check.

ui-observer (observer.browser.js, both sizes): no horizontal overflow on any page (`scrollWidth` equals the viewport); flags: /motion/overlays `sibling-padding-differs` 1 and `sibling-gaps-differ` 1 (the highlight's own absolutely placed `span.kit-ghost`), /motion/delegate-tray at 390 `near-miss-alignment` 36 (transcript rows marked `not-data-shown:invisible`, not this lane's parts).

## Design critique (interface-craft, against DESIGN.md)

- fixed: one Press Rule across the dialog: rows, crumbs, tabs and segments tint and never scale; chips and compact controls scale once, never twice (Attach).
- fixed: the tray chip's hover can no longer paint over a status tint.
- fixed: the option chip hovers only as an enabled button under a hover-capable pointer.
- fixed: every disabled control at DESIGN.md's 50%.
- fixed: the icon-card grid holds its columns by its own width.
- fixed: the "add label" chip is the house option chip, not a 4px-inset muted one-off.
- fixed: the dialog's buttons are the kit's (outline edge at 3:1, the secondary recipe, the pending label and idle guard) instead of a parallel button sheet.

## Gaps

None left in this lane's files. The ModelSection and SessionDetails lines above are integration's, in W4-controls' and W5's files.
