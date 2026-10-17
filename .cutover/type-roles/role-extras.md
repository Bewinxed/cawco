# Role extras against the 577 `font: var(--type-X)` sites at ac7b79de8

An extra stays in a role only if every site of that role set it on the same element in the same state.
Read from each source rule at T and the element's markup. Head lines are at this branch's head.

| role        | sites | extra before                          | set it | didn't | result |
|-------------|------:|---------------------------------------|-------:|-------:|--------|
| type-meta   |   284 | none                                  | — | — | the shorthand alone |
| type-label  |   183 | none                                  | — | — | the shorthand alone |
| type-body   |    63 | none                                  | — | — | the shorthand alone |
| type-code   |    21 | font-variant-ligatures: none          | 7 | 14 | out of the role; those 7 rules' elements carry `liga-none` |
| type-title  |    20 | letter-spacing: var(--track-title)    | 9 | 11 | out of the role; those 9 rules' elements carry `tracking-title` |
| type-kpi    |     4 | font-variant-numeric: tabular-nums    | 4 (`num`, `!important` at T, on every element) | 0 | kept in the role |
| type-caps   |     2 | none                                  | — | — | the shorthand alone |
| type-prose  |     0 | none                                  | — | — | — |
| type-button |     0 | none                                  | — | — | — |
| total       |   577 | | | | |

## type-kpi: every site set tabular figures (kept)
- lib/cawco/PairingScreen.svelte:137 `.code` → head PairingScreen.svelte:82 (`num type-kpi font-(family-name:--font-mono)`)
- lib/cawco/StatTile.svelte:80 `.st-value` → head StatTile.svelte:42 (`num … type-kpi … max-desk:type-title`)
- lib/cawco/UsageMeter.svelte:1133 `.kpi` → head carries `kpi num` (UsageMeter.svelte:760 at T)
- lib/cawco/usage/LimitsBlock.svelte:342 `.kpi` → head carries `num` (LimitsBlock.svelte:202 at T)

## type-code: the 7 rules that set ligatures off → `liga-none` (8 elements)
| T rule (ligatures at) | head element |
|---|---|
| accounts/DevicePanel.svelte:162 (:163) | accounts/DevicePanel.svelte:97 |
| tasks/TaskColumn.svelte:266 (:267) | tasks/TaskColumn.svelte:115 |
| tasks/TaskFields.svelte:186 (:187) | tasks/TaskFields.svelte:78 `<dt>` |
| tasks/TaskTable.svelte:459 (:460) | tasks/TaskTable.svelte:343 |
| usage/ProjectSpend.svelte:675 (:676) | usage/ProjectSpend.svelte:601 |
| views/ViewPipeline.svelte:131 (:132) | views/ViewPipeline.svelte:68 |
| views/ViewRoutines.svelte:1187 (:1188) | views/ViewRoutines.svelte:1011 and :1058 |

The 14 that didn't (ligatures computed `normal`: the unlayered shorthand reset the base layer's
`code, pre, .font-mono`, even on `<code>`/`<pre>`; `class="… mono"` in MoveWait matched no rule):
find/MentionField.svelte:844, home/NeedsCard.svelte:1034, move/MoveAsk.svelte:87,
move/MoveWait.svelte:670, :701, :734, plan/PlanPane.svelte:385, preview/PreviewPane.svelte:2069, :2084,
preview/SheetInspector.svelte:607, tasks/TaskFields.svelte:247, updates/UpdateCell.svelte:147,
routes/(app)/config/devices/+page.svelte:380, routes/dev/finder/+page.svelte:244.

## type-title: the 9 rules that set the title tracking → `tracking-title` (17 elements)
| T rule (letter-spacing at) | head elements |
|---|---|
| MachinesEmpty.svelte:150 (:151) | MachinesEmpty.svelte:81, :123 |
| PairingScreen.svelte:117 (:118) | PairingScreen.svelte:67, :98, :114, :129, :141 |
| accounts/AccountSetup.svelte:907 (:908) | accounts/AccountSetup.svelte:499, :513, :663, :881, :943 |
| accounts/RoutingEditor.svelte:213 (:214) | accounts/RoutingEditor.svelte:151 |
| config/SectionFrame.svelte:216 (:217) | config/SectionFrame.svelte:117 |
| tasks/TaskPane.svelte:798 (:799) | tasks/TaskPane.svelte:479 |
| config/TitleInput.svelte:63 (`-0.01em` :64, --track-title's value) | config/TitleInput.svelte:41 |
| config/editors/MemoryEditor.svelte:841 (`-0.01em` :843) | config/editors/MemoryEditor.svelte:517 (already had it) |
| spawn/NewSessionDialog.svelte:2232 (`-0.01em` :2233) | spawn/NewSessionDialog.svelte:1856 |

The 11 that didn't (letter-spacing inherited, as now): StatTile.svelte:107,
config/editors/SubagentEditor.svelte:197, preview/PlacePick.svelte:166, project/ProjectHead.svelte:749,
usage/LimitsBlock.svelte:447, views/ViewCalendar.svelte:169, views/openui/ViewBoard.svelte:26,
views/openui/ViewText.svelte:23, routes/(app)/motion/caw-notices/+page.svelte:447,
routes/(app)/motion/updates/+page.svelte:373, routes/(app)/project/new/+page.svelte:259.
