# V: variant order

Invariant: on every element, when two of its utilities set the same CSS property to different values under state variants that can hold at the same time, the winner is the one the source of record made win. Tailwind's own sort order never decides it.

## The rule

`house/variant-order`, in `apps/dashboard/eslint-plugin-house.mjs`, registered in `apps/dashboard/eslint.config.mjs` for `src/**/*.svelte` and `src/**/*.ts` (the kit included), so `bun run lint` gates it.

- **Theme.** Tailwind's own design system over `src/app.css` (`__unstable__loadDesignSystem` from `@tailwindcss/node` 4.3.3, the loader @shadcn/lint's oracle uses), loaded once when the config loads.
- **Classes.** @shadcn/lint exports none of its readers, so the rule reads the same nodes itself. One list per element: `class="…"` plus every `class:x` directive. Each other `*class*` attribute is its own list, and so is every outermost `cn`/`clsx`/`cx`/`twMerge`/`twJoin`/`classNames`/`tv`/`cva` call outside markup. Strings, templates, arrays, object keys, same-file `const`s and `$derived(…)` are followed. The two sides of a ternary or `||`, two values of one recipe variant and two recipe slots never stand together.
- **Per pair.** Each class's rules come from `candidatesToAst`. Each variant is compiled alone to get its condition, and `getClassOrder` gives the winner. Shorthands are expanded to physical longhands, so logical and physical forms of one side overlap. A pair is flagged when: both carry a variant; their declarations land on the same element (`*:`, `[&>svg]:` and `before:` move the subject); they write one longhand with different values; neither is `!important` alone; they have equal specificity; neither chain's states contain the other's; and no state of one excludes a state of the other.
- **Exclusive** means: one attribute at the same place with different values; `x` and `not-x` (including `group-not-`, `peer-not-`, `has-not-` and `not-hover`'s two rules); queries that cannot both match (`not (…)`, a discrete feature such as `hover`/`pointer`/`prefers-reduced-motion` with two values, disjoint width ranges, so `min-[900px]`/`max-[900px]`, `desk`/`max-desk`, `coarse`/`fine`, `hover`/`no-hover`/`hover-none`, `motion-safe`/`motion-reduce`); and variants.css's named complements `data-open`/`data-closed`, `data-checked`/`data-unchecked`, `dark`/`light`.
- **Not seen:** class strings in a `.ts` file outside a helper call, a constant imported from another file, and a class prop passed to a component (the sweep below covers that).

## The source of record

T is main at **ac7b79de8**: `git show ac7b79de8:<path>`. Not 1bd709672, which is 1a's merge and already converted. Two cascade steps settle a winner there:
- **Layer first.** A component's scoped `<style>` rules are unlayered, and Tailwind's utilities sat in `@layer utilities` (app.css at T: `@layer theme, base, components, utilities;`). "Any declaration not assigned to an explicit layer is added to an implicit final layer", and "for normal rules the declaration whose cascade layer is latest in the layer order wins" (https://drafts.csswg.org/css-cascade-5/#cascade-layering). So a converted `<style>` rule beat any utility at T, whatever their specificity.
- **Within one `<style>` block: specificity, then order.** "The last declaration in document order wins" (https://drafts.csswg.org/css-cascade-5/#cascade-order).

## Pairs fixed

Every flagged pair in files outside sets 1–9 and the kit: 7 pairs in 5 files. In all of them both classes come from one converted `<style>` block at T, and the two source rules have equal specificity, so the later rule wins. Each loser takes the winner's negation. No single state changes: the negation only removes the loser where the winner wins anyway, and no other utility on these elements sets the same property between the loser's old and new specificity.

| file:line | A | B | source winner, from the rules at ac7b79de8 | Tailwind's pick | fix |
|---|---|---|---|---|---|
| `apps/dashboard/src/lib/cawco/find/Finder.svelte:487` | `hover:bg-surface-hover` | `active:bg-surface-fill` | `active`: `.clear { @media (hover: hover) { &:hover } }` then `.clear { &:active }`, both (0,2,0); `:active` is later (Finder.svelte:941–948 at T) | the same | `not-active:hover:bg-surface-hover` |
| `apps/dashboard/src/lib/cawco/preview/PinList.svelte:76` | `hover:bg-surface-hover` | `active:bg-surface-fill` | `active`: `.pin-row:hover` then `.pin-row:active, .pin-row[aria-current="true"]`, all (0,2,0) (PinList.svelte:243–249 at T) | the same | `not-active:not-aria-current:hover:bg-surface-hover` |
| `apps/dashboard/src/lib/cawco/preview/PinList.svelte:76` | `hover:bg-surface-hover` | `aria-current:bg-surface-fill` | `aria-current`: the same two rules | the same | (the same class) |
| `apps/dashboard/src/lib/cawco/join/JoinedRow.svelte:107` | `data-attn:text-status-attn-ink` | `data-done:text-status-done-ink` | **`attn`**: `.glyph.done` then `.glyph.attn`, both (0,2,0); `.attn` is later (JoinedRow.svelte:157–161 at T) | `data-done:`, reversed | `not-data-attn:data-done:text-status-done-ink` |
| `apps/dashboard/src/lib/cawco/turn/Well.svelte:40` | `data-grouped:pbs-space-2` | `data-lifted:py-0` | `lifted`: `.well.grouped` then `.well.lifted`, both (0,2,0) (Well.svelte:117–137 at T) | the same | `not-data-lifted:data-grouped:pbs-space-2` |
| `apps/dashboard/src/lib/cawco/turn/Well.svelte:40` | `data-grouped:pbs-space-2` | `data-lifted:pbs-0` | `lifted`: the same | the same | (the same class) |
| `apps/dashboard/src/lib/cawco/turn/Who.svelte:108` | `data-u:text-on-action` | `data-a:text-on-brand` | **`a`**: `.dot { &.u }` then `.dot { &.a }`, both (0,2,0); `.a` is later (Who.svelte:162–178 at T) | `data-u:`, reversed | `not-data-a:data-u:text-on-action` |

In JoinedRow and Who the two states come from one value (`line.hue`, and `you`/`!you`), so they never hold together at run time. The fix makes the order the source's anyway.

## Cross-file sweep: a class prop on a component root's state variants

Every `<Component class=…>` whose classes carry a variant (184 site × root pairs) was joined with the classes on the root element that takes the component's `class` prop, then run through the rule. 14 cross pairs at 5 sites came back. Every consumer is in a set file and every root in the kit, so none is fixed here; the fix goes on the loser, in whichever file its owner holds.

At ac7b79de8 every consumer class here came from the consumer's own scoped `<style>` (unlayered), and every root class was a utility in the kit's `cn(…)` (`@layer utilities`). By the layer step above, **the source winner in all 14 is the consumer's class**, whatever the specificity. Tailwind today picks the root's class in 13 of them.

| consumer site | consumer's source rule at T | root (kit) | consumer class (source winner) | root class | property | Tailwind's pick |
|---|---|---|---|---|---|---|
| `src/lib/cawco/tasks/TaskColumn.svelte:150` (set 3) `<Checkbox>` | `li:focus-within > :global(.pick)`, `li[data-picked] …`, `.column[data-picking] li …`, `li:hover > …` → `opacity: 1` (TaskColumn.svelte:184–193) | `ui/checkbox/checkbox.svelte:16` | `group-focus-within/card:opacity-100`, `group-data-picked/card:opacity-100`, `group-data-picking/col:opacity-100`, `group-hover/card:opacity-100` | `disabled:opacity-50`, `group-data-[disabled=true]/field:opacity-50` | opacity (8 pairs) | the root's, reversed |
| `src/lib/cawco/tasks/TaskTable.svelte:305` (set 3) `<Table.Row>` | `.ledger[data-pickable] :global(tr.row[data-picked]) { background: var(--selected-bg) }` (TaskTable.svelte:551) | `ui/table/table-row.svelte:14` (`data-[state=selected]:bg-muted` at T) | `data-picked:max-phone:bg-selected-bg` | `data-[state=selected]:bg-neutral-2` | background-color | the consumer's, as the source |
| `src/lib/cawco/side/Split.svelte:368` (set 5) `<Resizable.Handle>` | `.expanded :global(.side-divider::after)` (Split.svelte:492) | `ui/resizable/resizable-handle.svelte:16` | `group-data-split-expanded/split:after:left-space-1`, `…:after:w-(--divider-hit)` | `data-[direction=vertical]:after:left-0`, `…:after:w-full` | left, width | the root's, reversed |
| `src/lib/cawco/project/ViewBar.svelte:147` (set 5) `<Select.Trigger>` | `block-size: var(--c-composer-field)` in ViewBar's `<style>` (ViewBar.svelte:218–247) | `ui/select/select-trigger.svelte:26` | `group-data-bar:h-c-composer-field` | `data-[size=default]:h-9`, `data-[size=sm]:h-[30px]` | height | the root's, reversed |
| `src/lib/cawco/preview/ArtifactMenu.svelte:233` (set 5) `<DropdownMenu.Item>` | `:global(.artifact-list .artifact-row[aria-current="true"]) { color: var(--ink-strong) }` (ArtifactMenu.svelte:306) | `ui/dropdown-menu/dropdown-menu-item.svelte:18` (`data-[variant=destructive]:text-destructive` at T) | `aria-current:text-ink-strong` | `data-[variant=destructive]:text-error-9` | color | the root's, reversed |

## Left in set and kit files

48 flagged pairs remain, 33 in set files and 15 in the kit. The sets and K1/K2 fix their own when they merge this branch. The table names Tailwind's pick, not the source winner: each owner reads that at ac7b79de8. Where one class of a pair came from a converted `<style>` and the other was already a utility in the markup at T, the converted one won, by the layer step. Two kinds of kit flag hold by selector, though the states are never meant to meet:
- `field-description`'s `nth-last-2:`/`last:` cannot both match. The rule does not treat structural pseudo-classes as exclusive.
- `switch`'s `data-unchecked:` against `data-[state=checked]:` is not exclusive by selector, because `data-unchecked` also matches a bare `[data-unchecked]`.

| owner | file | pairs |
|---|---|---|
| set 1 | `src/lib/cawco/transcript/ToolGroup.svelte` | 1 |
| set 2 | `src/lib/cawco/usage/Relay.svelte` | 2 |
| set 2 | `src/lib/cawco/usage/Rings.svelte` | 1 |
| set 3 | `src/lib/cawco/tasks/TaskColumn.svelte` | 1 |
| set 3 | `src/lib/cawco/tasks/TaskOutput.svelte` | 2 |
| set 3 | `src/lib/cawco/tasks/TaskTable.svelte` | 4 |
| set 4 | `src/lib/cawco/routines/RoutineDetail.svelte` | 1 |
| set 5 | `src/lib/cawco/home/MovedLogins.svelte` | 2 |
| set 5 | `src/lib/cawco/home/UpdateCard.svelte` | 2 |
| set 5 | `src/lib/cawco/preview/PinCard.svelte` | 1 |
| set 5 | `src/lib/cawco/project/ProjectHead.svelte` | 3 |
| set 5 | `src/lib/cawco/workspace/PaneGrid.svelte` | 2 |
| set 5 | `src/lib/cawco/workspace/PaneTabs.svelte` | 1 |
| set 8 | `src/lib/cawco/accounts/AccountSetup.svelte` | 1 |
| set 8 | `src/lib/cawco/accounts/StrategyPicker.svelte` | 1 |
| set 8 | `src/lib/cawco/config/RolloutChip.svelte` | 1 |
| set 8 | `src/lib/cawco/spawn/PromptEditor.svelte` | 1 |
| set 8 | `src/lib/cawco/updates/ChannelCards.svelte` | 1 |
| set 9 | `src/lib/cawco/blocks/Block.svelte` | 1 |
| set 9 | `src/lib/cawco/decisions/DecisionsView.svelte` | 1 |
| set 9 | `src/lib/cawco/decisions/RecordCard.svelte` | 2 |
| set 9 | `src/lib/components/features/workflows/WorkflowEdge.svelte` | 1 |
| K1/K2 (kit) | `src/lib/components/ui/checkbox/checkbox.svelte` | 1 |
| K1/K2 (kit) | `src/lib/components/ui/field/field-description.svelte` | 3 |
| K1/K2 (kit) | `src/lib/components/ui/input-group/input-group-addon.svelte` | 2 |
| K1/K2 (kit) | `src/lib/components/ui/machine-row/machine-row.svelte` | 1 |
| K1/K2 (kit) | `src/lib/components/ui/switch/switch.svelte` | 4 |
| K1/K2 (kit) | `src/lib/components/ui/toggle/toggle.svelte` | 2 |
| K2 (kit) | `src/lib/components/ui/fluid-tabs/TabItem.svelte` | 1 |
| K2 (kit) | `src/lib/components/ui/thinking-steps/thinking-step.svelte` | 1 |

Each pair (line, A, B, shared property, Tailwind's winner today):

| file:line | A | B | property | Tailwind's winner |
|---|---|---|---|---|
| `src/lib/cawco/accounts/AccountSetup.svelte:442` | `data-account-setup-done:text-ink-row` | `data-cur:text-selected-ink` | color | `data-cur:text-selected-ink` |
| `src/lib/cawco/accounts/StrategyPicker.svelte:140` | `hover:border-border-control` | `aria-checked:border-focus-ring` | border-top-color | `aria-checked:border-focus-ring` |
| `src/lib/cawco/blocks/Block.svelte:217` | `group-body-capped/block:phone:overflow-y-auto` | `data-card:overflow-hidden` | overflow-y | `group-body-capped/block:phone:overflow-y-auto` |
| `src/lib/cawco/config/RolloutChip.svelte:121` | `hover:bg-surface-hover` | `data-fail:bg-status-fail-bg` | background-color | `data-fail:bg-status-fail-bg` |
| `src/lib/cawco/decisions/DecisionsView.svelte:325` | `@decisions-520px/decisions:grid-cols-2` | `@decisions-900px/decisions:grid-cols-4` | grid-template-columns | `@decisions-900px/decisions:grid-cols-4` |
| `src/lib/cawco/decisions/RecordCard.svelte:214` | `group-data-open/fold:dur-panel` | `motion-reduce:transition-[opacity]` | transition-duration | `motion-reduce:transition-[opacity]` |
| `src/lib/cawco/decisions/RecordCard.svelte:214` | `group-data-open/fold:dur-panel` | `motion-reduce:dur-fade` | transition-duration | `motion-reduce:dur-fade` |
| `src/lib/cawco/home/MovedLogins.svelte:153` | `group-data-open:dur-panel` | `motion-reduce:transition-[opacity]` | transition-duration | `motion-reduce:transition-[opacity]` |
| `src/lib/cawco/home/MovedLogins.svelte:153` | `group-data-open:dur-panel` | `motion-reduce:dur-fade` | transition-duration | `motion-reduce:dur-fade` |
| `src/lib/cawco/home/UpdateCard.svelte:329` | `group-data-open/fold:dur-panel` | `motion-reduce:transition-[opacity]` | transition-duration | `motion-reduce:transition-[opacity]` |
| `src/lib/cawco/home/UpdateCard.svelte:329` | `group-data-open/fold:dur-panel` | `motion-reduce:dur-fade` | transition-duration | `motion-reduce:dur-fade` |
| `src/lib/cawco/preview/PinCard.svelte:297` | `data-placed:left-(--card-left)` | `data-sheet:inset-x-0` | left | `data-sheet:inset-x-0` |
| `src/lib/cawco/project/ProjectHead.svelte:482` | `max-[900px]:shrink` | `max-phone:shrink-0` | flex-shrink | `max-phone:shrink-0` |
| `src/lib/cawco/project/ProjectHead.svelte:482` | `max-[900px]:grow` | `max-phone:grow-0` | flex-grow | `max-phone:grow-0` |
| `src/lib/cawco/project/ProjectHead.svelte:482` | `max-[900px]:basis-full` | `max-phone:basis-auto` | flex-basis | `max-phone:basis-auto` |
| `src/lib/cawco/routines/RoutineDetail.svelte:245` | `group-outcome-failed/run:text-status-fail-ink` | `hover:text-link-ink` | color | `hover:text-link-ink` |
| `src/lib/cawco/spawn/PromptEditor.svelte:325` | `max-phone:transition-none` | `motion-safe:transition-[height]` | transition-property | `max-phone:transition-none` |
| `src/lib/cawco/tasks/TaskColumn.svelte:85` | `data-over:bg-surface-hover` | `kind-you:bg-brand-wash` | background-color | `kind-you:bg-brand-wash` |
| `src/lib/cawco/tasks/TaskOutput.svelte:148` | `group-data-compact:p-space-2` | `data-roomy:px-space-4` | padding-right | `data-roomy:px-space-4` |
| `src/lib/cawco/tasks/TaskOutput.svelte:148` | `group-data-compact:p-space-2` | `data-roomy:pb-space-4` | padding-bottom | `data-roomy:pb-space-4` |
| `src/lib/cawco/tasks/TaskTable.svelte:313` | `max-phone:block` | `@max-decisions-900px:hidden` | display | `@max-decisions-900px:hidden` |
| `src/lib/cawco/tasks/TaskTable.svelte:315` | `max-phone:block` | `@max-decisions-900px:hidden` | display | `@max-decisions-900px:hidden` |
| `src/lib/cawco/tasks/TaskTable.svelte:321` | `@max-decisions-900px:hidden` | `max-phone:block` | display | `@max-decisions-900px:hidden` |
| `src/lib/cawco/tasks/TaskTable.svelte:323` | `@max-decisions-900px:hidden` | `max-phone:block` | display | `@max-decisions-900px:hidden` |
| `src/lib/cawco/transcript/ToolGroup.svelte:357` | `data-add:text-data-ok` | `data-del:text-data-bad` | color | `data-del:text-data-bad` |
| `src/lib/cawco/updates/ChannelCards.svelte:113` | `hover:bg-surface-hover` | `active:bg-surface-fill` | background-color | `active:bg-surface-fill` |
| `src/lib/cawco/usage/Relay.svelte:257` | `data-start:translate-none` | `data-end:-translate-x-full` | translate | `data-start:translate-none` |
| `src/lib/cawco/usage/Relay.svelte:257` | `data-start:items-start` | `data-end:items-end` | align-items | `data-start:items-start` |
| `src/lib/cawco/usage/Rings.svelte:164` | `group-data-stale/rings:opacity-(--account-stale-opacity)` | `data-off:opacity-0` | opacity | `data-off:opacity-0` |
| `src/lib/cawco/workspace/PaneGrid.svelte:205` | `hover:bg-border-control` | `active-keyboard:bg-ink-muted` | background-color | `active-keyboard:bg-ink-muted` |
| `src/lib/cawco/workspace/PaneGrid.svelte:205` | `hover:bg-border-control` | `active-pointer:bg-ink-muted` | background-color | `active-pointer:bg-ink-muted` |
| `src/lib/cawco/workspace/PaneTabs.svelte:1791` | `hover:text-ink-strong` | `data-refused:text-status-fail-glyph` | color | `data-refused:text-status-fail-glyph` |
| `src/lib/components/features/workflows/WorkflowEdge.svelte:59` | `motion-safe:scale-(--pop-scale)` | `coarse:scale-100` | scale | `coarse:scale-100` |
| `src/lib/components/ui/checkbox/checkbox.svelte:25` | `data-checked:bg-action-solid` | `dark:bg-input/30` | background-color | `data-checked:bg-action-solid` |
| `src/lib/components/ui/field/field-description.svelte:18` | `[[data-variant=legend]+&]:-mt-1.5` | `nth-last-2:-mt-space-1` | margin-top | `[[data-variant=legend]+&]:-mt-1.5` |
| `src/lib/components/ui/field/field-description.svelte:18` | `[[data-variant=legend]+&]:-mt-1.5` | `last:mt-0` | margin-top | `[[data-variant=legend]+&]:-mt-1.5` |
| `src/lib/components/ui/field/field-description.svelte:18` | `nth-last-2:-mt-space-1` | `last:mt-0` | margin-top | `nth-last-2:-mt-space-1` |
| `src/lib/components/ui/fluid-tabs/TabItem.svelte:288` | `can-hover:data-ghosted:text-ink-strong` | `in-variant-folder:data-tab-item-selected:text-ink-muted` | color | `can-hover:data-ghosted:text-ink-strong` |
| `src/lib/components/ui/input-group/input-group-addon.svelte:9` | `has-[>button]:-ml-space-1` | `has-[>kbd]:ml-[-0.15rem]` | margin-left | `has-[>kbd]:ml-[-0.15rem]` |
| `src/lib/components/ui/input-group/input-group-addon.svelte:11` | `has-[>button]:-mr-space-1` | `has-[>kbd]:mr-[-0.15rem]` | margin-right | `has-[>kbd]:mr-[-0.15rem]` |
| `src/lib/components/ui/machine-row/machine-row.svelte:52` | `data-is-away:bg-hue-orange-500` | `data-is-online:bg-hue-green-500` | background-color | `data-is-online:bg-hue-green-500` |
| `src/lib/components/ui/switch/switch.svelte:38` | `group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)]` | `rtl:data-[state=checked]:translate-x-[calc(-100%)]` | --tw-translate-x | `group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)]` |
| `src/lib/components/ui/switch/switch.svelte:38` | `group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)]` | `rtl:data-[state=checked]:translate-x-[calc(-100%)]` | --tw-translate-x | `group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)]` |
| `src/lib/components/ui/switch/switch.svelte:38` | `group-data-[size=default]/switch:data-unchecked:translate-x-0` | `rtl:data-[state=checked]:translate-x-[calc(-100%)]` | --tw-translate-x | `group-data-[size=default]/switch:data-unchecked:translate-x-0` |
| `src/lib/components/ui/switch/switch.svelte:38` | `group-data-[size=sm]/switch:data-unchecked:translate-x-0` | `rtl:data-[state=checked]:translate-x-[calc(-100%)]` | --tw-translate-x | `group-data-[size=sm]/switch:data-unchecked:translate-x-0` |
| `src/lib/components/ui/thinking-steps/thinking-step.svelte:128` | `status-ahead:text-ink-muted` | `motion-safe:data-shimmer:text-transparent` | color | `status-ahead:text-ink-muted` |
| `src/lib/components/ui/toggle/toggle.svelte:6` | `hover:bg-[var(--surface-hover)]` | `aria-pressed:bg-[light-dark(var(--surface-fill-strong),var(--surface-fill))]` | background-color | `aria-pressed:bg-[light-dark(var(--surface-fill-strong),var(--surface-fill))]` |
| `src/lib/components/ui/toggle/toggle.svelte:6` | `hover:bg-[var(--surface-hover)]` | `data-[state=on]:bg-[light-dark(var(--surface-fill-strong),var(--surface-fill))]` | background-color | `data-[state=on]:bg-[light-dark(var(--surface-fill-strong),var(--surface-fill))]` |

## Pruned style rules: `svelte-unused-css`

Invariant: no style rule the cutover keeps is pruned by Svelte without anyone knowing.

**Upstream.** svelte 5.57.1 is installed, and `npm view svelte version` gives 5.57.2. 5.57.2's changelog (https://raw.githubusercontent.com/sveltejs/svelte/main/packages/svelte/CHANGELOG.md) has no CSS-pruning change: its entries are runtime, hydration, `migrate` and parser fixes, plus one a11y warning. A bump would not change this.
- The parent's shape (a nested `.tab:global([data-lifted]) > & > :is(.s, .e)` inside `.shade`, with `data-lifted` set only from script) compiles in 5.57.1 with `dev: true` as follows. When an element with class `tab` holds the shade, directly, through a snippet, through `class={["tab", …]}` or through `<svelte:element>`, it is kept, scoped as `.tab:where(.svelte-…)[data-lifted] > & > …`, with no warning. When no element it can see carries `tab` (the tab is `data-slot="tab"`, or `class="tab"` goes to a child component), it is written as `/* (unused) … */` **and** `css_unused_selector` fires.
- In every variant tried, the prune and the warning come together. Both read one flag in Svelte's source: `css-warn.js` warns on each `ComplexSelector` without `metadata.used`, and the transform comments out a rule when no selector of it has `metadata.used`.
- svelte-check reports that warning too: the scratch file under `src/` gave `src/vo-scratch/Repro.svelte:22:5 warning: Unused CSS selector ".nope > &"`, and the count rose to 4 warnings. But `bun run typecheck` passes on warnings (its proof is `0 ERRORS`), so a prune passes as one more warning beside Shot's.
- At main the rule is not pruned. b8b16770b keeps `class="tab"` on the tab ("The tab's own class keeps Svelte from pruning a selector on an attribute only tab-drag sets"), and the compiled stylesheet has it scoped with no warning.

**The gate.** `apps/dashboard/scripts/svelte-unused-css.ts` compiles every `src/**/*.svelte` through the project's preprocess and compiler options as vite.config.ts gives them to `sveltekit()` (`vitePreprocess()`, `experimental.async`; the project has no svelte.config), with `dev: true` and `css: "external"`. It lists each `/* (unused) */` rule with file and line and exits 1 on any. It runs in root `lint` and `lint:changed`, after `lib-import-check`. In `lint:changed` it is part of the hub's gate; in `lint` it runs before `eslint src`, which still fails on 1a. On the scratch files it lists all five prunes and exits 1.

**Inventory.**
- ac7b79de8: `svelte-unused-css: 611 file(s), no style rule pruned`.
- This branch (1a plus V): `svelte-unused-css: 610 file(s), no style rule pruned`.

So no declaration the cutover kept is pruned on this branch, and nothing was already pruned at ac7b79de8. There is nothing to fix and nothing to list per owner. A set's merge that drops the class a kept rule names now fails `lint:changed`.

## Guards that need their group: `house/group-not-needs-ancestor`

`group-not-x/name:` compiles to `:is(:where(.group/name):not(x) *)`: it holds only inside a `group/name` element whose x is off, so with no such ancestor it never matches. `not-group-x/name:` compiles to `:not(:is(:where(.group/name)x *))`, which also holds where there is no ancestor. The same goes for `peer-not-` against a preceding `peer/name`.

**house/variant-order and the `not-` forms.** `not-group-…` against `group-…` and `not-peer-…` against `peer-…` were already read as exclusive. `not-in-…` against `in-…` was not, because `in-x:` compiles to `x &` and `not-in-x:` to `&:not(x *)`. The rule now writes `x &` as `&:is(x *)` before comparing, so all three pass. The scratch file holding the seven pairs (`group-data-[disabled=true]/field`, `group-data-picked/card`, `peer-checked`, `peer-data-open/x`, `in-data-open`, `in-data-[state=open]` and `group-hover/card`, each with its `not-` form) gives `exit 0`. The 48 variant-order pairs above are unchanged.

**The check.** The rule is in `eslint-plugin-house.mjs`, on the same files as variant-order. It flags a `group-not-*/name:` (or a bare `group-not-*:`) whose `group/name` (`group`) is not on an ancestor element, and a `peer-not-*` whose `peer/name` is not on a preceding sibling, in DOM order through `{#if}`/`{#each}`. The class must be in the same file. A `{#snippet}` stands at each of its `{@render}` sites, and the check flags when any render site lacks the group or peer. A class string no markup in the file carries (a `tv`/`cva` recipe, a helper call in a `.ts` module) stands on no element there, so it is flagged. The message says to write `not-group-…` (`not-peer-…`) if the condition should not require the group (peer).

**On this branch: 0 hits.** All 17 `group-not-` uses (AccountSetup ×4, ActionsTable ×8, RecallWheel ×1, SessionRow ×4) stand under their group in the file. SessionRow's title is in `{#snippet inner()}`, rendered only inside the `group/session-row` item. There is nothing to fix or list per owner. Set 3's kit look comes with its own work, and the check flags it there.
