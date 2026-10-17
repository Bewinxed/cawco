# Integration 1a: what was resolved, and how

Every ledger line (`.cutover/ledger.md`) that 1a resolved, one line each. Sites
are relative to `apps/dashboard/`.

## Tokens (DESIGN.md: the JSON entry first; `bun run tokens`, `--check` clean)

Colour (`design/tokens/cawco.tokens.json`, dark values in `cawco.dark.tokens.json`):
- `--mask-opaque` `#000000`: an alpha mask's opaque stop (O1 Composer, O2 DelegateTail, O4 PaneTabs, O5 TreeMark and OlderRows, O6 CawPanel, S03 Thinking, S07 TaskOutput, S16 PlanPane, S18 RoutineDetail, S21 thinking-indicator). One token for `#000`, `black` and `oklch(0% 0 0)`: a mask reads alpha only.
- `--mask-opaque-a10/-a15/-a50/-a60/-a90`: the phone tab strip's eased fade stops (PaneTabs deferred rule 5), plain sRGB values so they serialize as the source's `rgb(0 0 0 / a)`.
- `--surface-recess-clear` = `oklch(from {color.surface-recess} l c h / 0)`; the build settled its dark value (O1 FootFade, O3 SuggestionChips). `--surface-recess` has no override below `:root`, so the root token resolves as the element did.
- `--opencode-logo-core` `light-dark(#cfcecd, #4b4646)`, `--opencode-logo-frame` `light-dark(#211e1e, #f1ecec)` (S02). OpenCodeLogo.svelte now paints with `fill-opencode-logo-core` / `fill-opencode-logo-frame`; its svg-paint residual is gone.
- `--link-underline` (O3) is **not** a token: it holds `currentColor`, which no token can evaluate. Tailwind's `decoration-current/35` writes exactly `color-mix(in oklab, currentcolor 35%, transparent)` (compiled with the dashboard's Tailwind 4.3.3); Peer.svelte:161 and SystemLine.svelte:347 use it. Before this, nothing defined `--link-underline`, so the underline drew in full `currentcolor`.

Size:
- `--c-tray-chip-min` 120px and `--c-tray-chip-max` 224px (O2's `--tray-chip-min/-max`, named in the house's `c-*` family beside `c-tray-chip`, `c-pin-list-min/-max`; `c-*` sizes get spacing keys, so `min-w-c-tray-chip-min` exists). DelegateTray.svelte's residual reads them; its interim `calc(var(--space-1) * N)` fallbacks are deleted.

Motion:
- `--dur-pick-up` = `calc({motion.dur-panel} * 0.6)` (O4 PaneDeck): PaneDeck's lift uses `dur-pick-up`; its `style:--pick-up` is deleted.
- S11 ViewPipeline's 260ms bar: `dur-pop` is 260ms already, so the bar takes `motion-safe:dur-pop`; its `style:--bar-dur` and literal note are deleted.
- 20 transition tokens, one per distinct multi-duration transition in the tree whose every value is a token (no `--dur-*`/`--ease-*` is overridden below `:root`, so `transition: var(--transition-x)` computes as the element-level shorthand did). Each recipe is the source's text; one that composed `var(--transition-control)` spells its three items out (the same substituted list):
  - `transition-fade-show` `opacity dur-fade ease-out, visibility 0s` (Composer `--step-aside`, AttachmentChips)
  - `transition-fade-hide` `… visibility 0s linear dur-fade` (Composer:3711)
  - `transition-exit-show`, `transition-exit-hide` (Composer:3719, :3724)
  - `transition-fade-slide` `opacity dur-fade ease-out, translate dur-panel ease-drawer` (Composer:4072/4088, Prompt:1156)
  - `transition-tint-press` (TreeCount:62, NeedsCard:922, NoticeRow:101)
  - `transition-control-press` (PickerChip:102, RolloutChip:326), `transition-control-slide` (SessionRow:623), `transition-control-ring` (EffortPips:317)
  - `transition-chip-settle` (RolloutChip:320), `transition-pick-card` (StrategyPicker:226). The lanes had written these three presses as `scale`; their sources say `transform`, so the tokens do (see Transforms below), and RolloutChip's sync button needs no token of its own.
  - `transition-frame-end-first`, `transition-frame-start-first` (ChannelCards:203, :208)
  - `transition-split-surface` (Split:449), `transition-ring-arc` (Rings:217), `transition-rail-tip` (Rail:263)
  - `transition-panel-travel` (LocationSection:562), `transition-panel-resize` (ModelSection:637)
  - `transition-suggest-chip` (SuggestionChips:364), `transition-segment` (TabsList:1337)

## Variants (`bun run variants`)

- The pairs the lanes named are generated from the residual selectors: `kind-ask`, `kind-asked`, `kind-fail` (O2), `status-needs`, `status-starting`, `status-asked`, `status-cancelled` (O2), `session-hover-tone-needs/-done/-failed` (O4).
- `hover-none` (O6 Relay's `(hover: none)`): a house variant in build-variants.ts.
- `workflow-cards` (S24, `(max-width: 760px)`): a house variant, exact at 760px, kept off the phone/desk/wide ladder (DESIGN.md names three breakpoints; this is the workflow list's own).
- `data-on` (S24): Tailwind's own bare `data-on:` already exists (`data-*` is reserved for it); the usage page's residual is a kit restyle (SelectTrigger), cleared with the no-restyle work.
- build-variants.ts also reads `src/routes/**/*.svelte` (the routes' residual selectors) and leaves `src/lib/tokens/` out; `bun run variants` then `--check` clean.

## Cross-file hooks (the 86 `cross-file hook:` lines, and the sweep)

Each class a lane removed that another file (a stylesheet, a script, a probe) still selected now reads a hook the element carries: a `data-slot`, a `data-*` state, or a class that is still put on.
- app.css: `.tree-mark`, `.tree-mark-deck`, `.tree-mark-echo-box` → `[data-slot="tree-mark…"]`.
- Selectors in scripts: ViewBar `[data-filter-trigger]`; PreviewPane `[data-slot="preview-tool"]`; canvas/stage `[data-preview-sheet]`; lift.svelte.ts actions/reason/msg; SideSheet `hasAttribute("data-asking")` and its `COMPOSER_PARTS` list; tab-drag `el.dataset.slot === "tab"`; AccountSetup `hasAttribute("data-picker")`; GlassCard's focus list `a[data-slot="cover"], button, [data-slot="caw-panel-empty"]`; NsPopoverGroup `closest("[data-ns-pop]")`; RunSteps `STEP_GLYPH`; thinking-step `data-slot="thinking-step-icon"` (and MoveWait).
- Component `:global()` rules: PreviewPane (side-well, tab label), ThreadPane (side-card, task-needs), SideSheet (leaf, dock, lift), DelegateTray `[data-slot="dock"]`, Composer leaf, MessageRow (turn, well, who, `data-you`, `data-ghost`), RunBlock `data-run-block` (and WorkflowRunView), AccountMoveDivider / CompactionDivider / Well `[data-slot="msg"]`, RoutineDetail `[data-slot="md"]`, FolderFile, SessionDetails' model popover (picker, search, list, row), ToolGroup `shot-box`, SigninPanel, KeyPanel, SuggestionChips `track`, ViewRoutines' column heads, connections `[data-slot="controls"]`, Shell `:global([data-bar-item])` (and `bar-item` dropped from Shell and MachinesButton).
- WorkTabs and HomeRecent draw the tree recipe as utilities on their own lists; SessionTree's style block is gone.
- Probe specs and benches: ios-accounts, probe-ios-queued (listing, shell banner, `layer[data-behind]`), design-approve (pin card, `[data-artifact-trigger]`), strip-layout (TAB/HIT/LABEL), two-pane-perf, keychain-unlock (`section[data-slot="unlock"]`, row), probe-landing-race (chip), dev/finder, folder-proof and head-tint benches.
- Sweep (`bun .cutover/sweep.ts`, against the foundation with `--root`): after this, no class a stylesheet, script or probe selects is missing that was put on at the foundation. The four names it still prints that the foundation did not are not misses: token names in tokens.ts, `.svelte-flow` (put on by @xyflow/svelte), `.rail-item` (put on by `packages/agent/src/canvas-host/rail.tsx`, inside the canvas frame), and `.err` (a file extension in a `readdir` filter).

## Contracts (the 163 `contract:` lines)

124 of them name a kit part a consumer restyles (`shadcn/no-restyle`, "kit owns this treatment"). Those are no-restyle hits: `.cutover/clearance.md` lists every one by kit part and set (sets K1 and K2 make the variants). The other 39, one line each:

- `hang-card.svelte:376`, `:379` (O4:201–202, no-inline-styles): the wrapper's and content's `style:pointer-events` override bits-ui's run-time inline `pointer-events: auto` while closing, which no class can; the kit block of eslint.config.mjs allows `pointer-events` for `shadcn/no-inline-styles`, and the nine file-level disables are deleted.
- `Split.svelte:77` (O4:203, require-static-classes) and `SideSplit.svelte:325` (O4:204, no-unknown-classes): Split's `mainClass` prop and its `data-split-main-class` hook are gone; SideSplit and the project page no longer pass a class through it.
- `SessionTree.svelte:68`, `:119` (O5:68–69), `WorkTabs.svelte:621`, `:675`, `:676`, `:696`, `:935`, `:953` (O6:47–52, no-inline-styles): WorkTabs' `enterAnim`/`leaveAnim`/`headAnim` return animation values, not style strings; the elements carry `animate-(--swap-anim)` with `style:--swap-anim`, the leaving line `style:--leave` (read by `.kit-nest`), the header `(group, anim, unseen)`; SessionTree takes `motionOf`, OlderRows `motion`.
- `ContextMeter.svelte:113` (S01:73, require-static-classes): the trigger's tone is a conditional between complete class strings in the markup; the TEXT/KIND_TONE maps are deleted.
- `GlassCard.svelte:410` (S01:74): hang-card takes `frame?: "caw" | "machines" | "jump"` (its FRAMES map, with `style:--frame-w`, `--frame-w-narrow`, `--frame-h`); GlassCard passes `frame={shown}`.
- `HookTester.svelte:57` (S01:75): conditional complete class strings for all/exact/regex; the map is deleted.
- `MachinesButton.svelte:79` (S01:76): Shell selects `:global([data-bar-item])`; `bar-item` is dropped from both.
- `PeekPane.svelte:279` (S02:285): `style="--identity-h: {folderPrefs.hue(cwd)}"`; `identityVar` is deleted from folder-prefs.
- `RowMenu.svelte:27` (S05:58), `Block.svelte:161`, `BlockPage.svelte:326` (S10:67–68), project page `:1624` (S24:53): the kit's `DropdownMenu.Trigger` takes `variant` and `size` and draws itself with `buttonVariants` inside the kit.
- `AccountSwitch.svelte:72` (S08:58): NsPopover takes `triggerData` (spread on its trigger); the account chip carries `data-account-chip`, the static chip `ns-chip-btn` again (S08 had dropped it) with `data-variant="static"`.
- `AccountChip.svelte:75` (S13:94), `ToolChips.svelte:125`, `:136`, `:163`, `:188` (S13:99–102): `tool` and `off` are `data-tool` and `data-variant` on the chip (`triggerData={{ "data-tool": true }}` through NsPopover); ModelSection's rule reads `[data-tool]`.
- `LocationSection.svelte:293`, `:461` (S13:95–96): the `panel` class is gone; the `folds` attachment takes its PANEL config, so nothing selects a class.
- `NsPopover.svelte:183` (S13:97): `ns-pop-shell` is gone (nothing selected it); NsPopover's `fit` prop puts `data-fit` on the content, which `ns-pop` reads.
- `NsPopoverGroup.svelte:163` (S13:98): `ns-measure` is gone; its height is read by `bind:offsetHeight`.
- `SessionsChip.svelte:179` (S15:368): the kit's `Popover.Trigger` takes a `badge` prop and draws itself with `badgeVariants`.
- `motion/Rail.svelte:218` (S18:64): Rail takes `stagger?: number` and sets `style:--delay`; ModelSection passes `stagger={30}`.
- `WorkflowEdge.svelte:48`, `WorkflowNodeCard.svelte:175` (S20:53–54): eslint.config.mjs allows `nodrag` and `nopan` in `shadcn/no-unknown-classes`, cited (svelteflow.dev, Utility classes: the library reads them by `closest()`).
- project page `:1908` (S24:59): `view-pane-side` went with Split's `mainClass`.
- project page `:1987`, `:1988` (S24:60, 62): the skeleton is `h-(--card-h)` with `style:--card-h="54px"` on its parent.
- workflows page `:184` (S24:74): the empty state is `max-w-(--empty-max)` with the literal on the element.

## Deferred files (the 7 `deferred-file:` lines)

- `SessionDetails.svelte` (O4:206): its model popover rule is ns-pop's `[data-fit]` (NsPopover `fit`); the model chip's `data-model-chip` rides `triggerData`; the chevron rule reads `.ns-chip-btn:not([data-account-chip]) > svg[data-slot="chevron"]`.
- `fluid-tabs/TabsList.svelte` (O4:217): its three-rule ladder moved verbatim into app.css `@layer components` (`.ff-tabs-list`, `[data-size="compact"] .ff-tabs-list`, `[data-variant="folder"] .ff-tabs-list`), after `.kit-edge-fade`.
- `PaneTabs.svelte` (O4:221): the strip's numbers are custom properties on the Tabs root; the tab menu's HangCard carries `data-tab-menu` and `--menu-min`, the details HangCard `--details-w`, `--details-max-h`, `--details-max-h-phone`; its rules are foreign-dom on those, with the mask tokens.
- `home/CawPanel.svelte` (O6:28): its deferred block is gone; the hang-card `frame="caw"` draws the frame.
- `find/FinderCard.svelte` (S17:32): its deferred block is gone; Finder takes `class`, FinderCard passes `max-desk:flex-1`; the frame is `jump`.
- `routes/(app)/workflows/+page.svelte` (S24:47): the 760px block is `workflow-cards:` utilities; the style block is gone.
- `routes/(app)/project/[id]/+page.svelte` (S24:49): the ask popover is `<Popover.Content bare class="w-(--ask-w)" style="--ask-w: …">` (popover-content's `bare` prop: `border-none border-current bg-transparent bg-none p-0 shadow-none`); its residual is gone.

## Shared sheets (`.cutover/shared-sheets.md`, as written)

- `spawn/ns-theme.css` and `features/workflows/workflows.css` are utilities (zero specificity inside `:where()`, the two weighted exceptions E1 and E2, foreign DOM in `@layer components`, the kit carve-outs K1–K3, keyframes kept), imported once by app.css after the shimmer block; the seven consumer imports are deleted.
- Consumers' modifiers are attributes: `data-variant`, `data-size`, `data-slot="chevron"`, `data-slot="chip-label"`; WorkflowEditor's run filters `data-slot="run-filter"` `data-variant="quiet"`; the workflows page's 760px block is `workflow-cards:` utilities.
- `spawn/PRESERVE.md` cites the new sheet's lines (§5's table), and the app.css lines its list-swap and highlight citations meant (`app.css:2449-2484`, `:1924-1945`, `:1953-1961`; both were stale at the base).

## ESLint (`apps/dashboard/eslint.config.mjs`)

- D10 as written: `shadcn/no-restyle` with `allow: ["layout", "num", "touch-hit", "pointer-hit", "mark-line", "focus-inset", "press-tint"]` and the house allow list; `contracts` for the kit triggers that render the consumer's own element (`CollapsibleTrigger`, `PopoverTrigger`, `DrawerTrigger`, `DropdownMenuTrigger`, `SheetTrigger`, `DialogTrigger`, `AlertDialogTrigger`, `Pane`); off inside `src/lib/components/ui/**`.
- `no-unknown-classes` allows `nodrag`, `nopan` (above); the kit block allows `pointer-events` for `no-inline-styles`.
- Now: 0 messages for every rule but `shadcn/no-restyle` (1129 in 111 files, 1b's).

## Small items

- The five duplicate kit insets: the losing utility deleted in each, the shown padding kept (`.cutover/ledger.md`, "Kit duplicate insets").
- S05 skills page: the ghost Button carries `data-ghost`.
- `pressable` on a Button: Button has `press="pressable"` (its `.pressable` sorts after Button's own transition, as the class did); 20 sites use it.
- `icons/CloseBack.svelte` had no importer: deleted (and its style-snapshot-coverage entry).

## Delta R, across the tree

- R1: no element takes one box-shadow state from a residual rule and another from a utility. The residual `box-shadow` rules left (EffortPips' knob, LocationSection's browse, Composer's attach in the recall deck, UsageMeter's carrying cell, Shell's tools `::before`, ToolMatrix's matrix) sit on elements with no shadow utility; SideSheet's and ThreadPane's `box-shadow: none` for a side card in a sheet or in place carry no layers, so the shadow-drawer list interpolates to them as to `shadow-none`.
- R2: every lane `border-0` whose source was `border: 0` is `border-none border-current` (22 files, the `data-embedded:` and `max-phone:` forms too). Finder's rule and MachinesList's add row had `border: 0` plus a side; those are below.
- R3: `font-mono` is off every lane element that is not `code` or `pre` where the source set the family without ligatures off (19 sites: ModelSection, ProjectChip, LocationChip, LocationSection, RecordCard, MachineInventory, FetchSkillPopover); the rest are `code`/`pre`, or carry `liga-none`.
- R4 (found here): a source `border-bottom: 1px solid X` paints one side; `border-b border-X` paints X on all four, where the base `* { border-color: var(--border) }` stood, and the snapshot reads all four colours. 105 lane sites in 43 files take the side's colour (`border-b border-b-X`); devices and phone rows (`.row + .row`) are `not-first:border-t not-first:border-t-…`.
- R5 (found here): a source `border-bottom: 0` takes the side's style and colour back too (`none`, currentcolor); Tailwind's `border-b-0` zeroes only the width and has no per-side style. app.css gains `border-t-none`, `border-b-none`, `border-l-none`, `border-r-none`, `border-s-none` (each the shorthand itself, sorting after every border utility in its variant), and `border-t-dashed` for ViewPipeline's one dashed side; tailwind-merge knows each as its own group. Used at TaskTable, ViewRoutines, UpdateTable, TaskReview, SheetInspector, Finder, WorkflowEditor, the finder bench, and the two `border: 0` + one-side elements.
- `transition: none` has no Tailwind utility (`transition-none` sets the property only; Chromium then still reports the element's other durations): app.css gains `transition-off`, for 1b.
- Transition lists (the orchestrator's ruling): `transition-[a,b] dur-X ease-Y` stays. Chromium reports the source shorthand's longhands per property (`0.2s, 0.2s`) and the utilities' once (`0.2s`); CSS repeats a short list to the property count (MDN, Using CSS transitions: "its values are repeated to make them match"), so the compare expands each list to the length of `transition-property` before comparing. That rule goes to the determinism item.

## Transforms (the orchestrator's ruling)

A source `transform: <function>(…)` stays on `transform`: `transform-(--x)` with the function in a custom property on the element. `scale-*`, `translate-*` and `rotate-*` write the separate `scale`, `translate` and `rotate` properties, which a transition naming `transform` does not animate and the snapshot reads apart. Every lane utility whose source was a `transform:` declaration is converted (13 sites in 11 files, listed in the ledger's "Transforms" note), the transition lists the lanes renamed are `transform` again (TaskActivity, MoveAsk, Swatches, thinking-steps header; RolloutChip's and StrategyPicker's residuals), and the tokens above with them. A press that the lanes wrote as `scale-(--press-scale)` had not animated at all, since its transition named `transform`; it does again. Utilities whose source wrote the property itself (`scale:`, `translate:`, `rotate:`: Finder's chip press, CompactionDivider, TreeMark, TaskRing, the chevrons that turn by `rotate`) are exact and stay. Every foundation `transform:` declaration is now a residual or `transform-(--…)`.

## The merge of current main (the orchestrator's scope addition)

`origin/main` (ac7b79de8) is merged once into the branch: T = `1bd709672`, the base of record (`.cutover/ledger.md`, "Base of record" and "Main's changes, carried in T": every file, how it merged, what main's change became). Five files conflicted and were resolved by hand; the other 17 merged on their own and were each checked against main's diff. Main's changes added two residual declarations: one kind 5 (SessionRow's `font: inherit`), one foreign-dom (Shell's `display: none`).

## `bun run lint`, step by step

Every step but the two 1b clears, and one that is red at the foundation and on main:
- `case-clash-check`, `lib-import-check`, `spacing-ratchet`, `build-tokens --check`, `token-contrast-check`, `page-imports-check`: pass, as at the foundation.
- `css-scope-check`: 25 failures at the merge of the lanes, 30 after the hook retargets, now none. Each rule into a data hook is explained above it (`/* css-scope: why */`) or its class declared (`.preview-pane`, `.strip-hit`, which another file names); Prompt's HTML comment that held the text `<style>` (the checker then read the template as CSS) says "the style block".
- `mark-line-check`: 8 at the merge, now none: three rows whose `<!-- mark-line: … -->` a literal note had pushed off the row have it back on the row, and the five truncating words clip (above, "DESIGN-law fixes").
- `fmt.ts --check`: the lanes left 216 files unformatted; `bun fmt` formatted them (whitespace only). The pinned canary then wrapped 33 long quoted `style:--x="…"` values onto two lines, which svelte-check reads as unterminated strings (281 errors; Vite still built). Prettier's Svelte plugin never splits an attribute value, and Bun's docs call any difference from it a bug; the newest canary (1.4.4, 2026-10-16) wraps them too. Those 33 values are written `style:--x={"…"}` (the same at run time; the formatter leaves a string literal whole), and the 1b rules say to write long ones so.
- Root `bun run typecheck`: `typecheck:coverage` found the `.cutover` scripts in no project (TypeScript's `**` skips dot-directories); the root project names `.cutover/*.ts`, and they type-check clean.
- `ultracite check` (Biome): 52 errors at the merge (4 at the foundation, in packages/cli, gone on main), 72 with this branch's scripts, now none. `biome-ignore` comments a literal note had displaced sit on their elements again; the table heads whose `scope` the formatter moved off the head's first line take Biome's range form (`biome-ignore-start`/`-end`), as TaskTable's already did; nested ternaries are class arrays of whole strings (ContextMeter, HookTester, StopTray, TaskTable) or lookups (hang-card's frame sizes, sheet-content's away transform, TaskEdgeLine's strokes); six class strings are in Biome's order (no two classes in any of them set the same thing, so `cn()` keeps the same ones); FindRow's negated condition is turned round; Composer's three rules that Biome reads as descending specificity set disjoint properties and keep the source's order, each saying so; app.css's two sheet imports keep their place (Tailwind inlines them there; the shared-sheets order), saying so; the `.cutover` scripts are refactored (sweep.ts in small functions, its output byte-identical before and after).
- `style-greps`: five filter transitions at the merge, now none: the folds' and pending content's are the tokens `transition-fold-fade` and `transition-morph-fade`, each the source's own value and each case driven on WebKit by `scripts/probe-kit/specs/web/safari-blurs.ts`.
- `eslint`: `shadcn/no-restyle` only (1b).
- `style-residual-check`: kind 5 only (1b).
- `states-lint` (switch exhaustiveness in TypeScript logic): 98 at the foundation, 99 on main (main's new switch in `packages/core/src/accounts.ts`), 99 here; the set is main's exactly. It is product logic the cutover does not touch.

## Pre-existing defects (proposals, not changed)

- StopTray's departure flight never runs: `:scope > [data-slot="rin"] .tile` matches nothing, at the foundation too (no `.tile` under the rin). Proposal: point it at the element it means.
- `scripts/probe-landing-race.ts`'s `.row.fail .text` matched nothing at the foundation either. Proposal: retarget it with the rest of that probe's selectors.
