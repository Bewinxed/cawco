# X1-controls — Kit controls

start: 0f64468e11d27314a553e5ed64d5df3b3734c4c8

## First item: the shared option (pushed as cawco-lanes/X1-option)

Sources followed:
- WAI-ARIA APG, Radio Group Pattern (https://www.w3.org/WAI/ARIA/apg/patterns/radio/): roles `radiogroup`/`radio`, `aria-checked`, one tab stop; the arrows follow APG's "Radio Group Contained in a Toolbar": "when navigating through a radio group in a toolbar with arrow keys, the button that is checked does not change"; "Enter (optional)" is not taken, per the owner's Continue decision.
- Base UI Radio Group (https://base-ui.com/react/components/radio-group): "Provides shared state to a series of radio buttons", `value`/`onValueChange` on the group; Checkbox Group for several (`group` of `checkbox`es).
- WCAG 2.1.4 Character Key Shortcuts: a digit is "active only when that component has focus".
- decision-page-research-spec.md B7, B8 and the owner's two decisions: arrows move, Space or a digit picks, Enter never picks, pressing the chosen option keeps it, the chosen keycap inverts (Typeform), keys stay visible on touch.

- fixed: shared option — new kit part `ui/option-group/` (Root, Item, state.svelte.ts). Root: `role="radiogroup"` (one pick) or `role="group"` (`multiple`), `layout` chips | list (chipsVariants; list = one full-width row per option). Item: `<button role="radio|checkbox" aria-checked>` on ui/chip `option` + `touch-hit` + `focus-inset`, roving tabindex (the option focus last stood on, else the first chosen, else the first), `digit` → `data-digit` + `aria-keyshortcuts`. Keys on the root: arrows/Home/End move focus only (wrapping, RTL flips ←/→); click, tap, Space or the option's digit picks (a digit is a press: `option.focus(); option.click()`, so an option's own onclick runs first and may prevent the pick, as "Other" does); Enter is prevented (never picks) and handed to the host's `onenter`; a modifier passes through (⌘/Ctrl+Enter reaches the host). Single pick: pressing the chosen option keeps it.
- fixed: chosen keycap — the keycap's chosen look moved from ui/chip's `**:data-[slot=kbd]` descendant rules onto ui/kbd's `keycap` look itself, read off the option it stands in (`group/option` on ui/chip `option`): `group-aria-checked/option:`, `group-aria-pressed/option:`, `group-data-chosen/option:` → `bg-chip-chosen-bg text-chip-chosen-ink` (DESIGN.md L910's tokens). Any density of option (X7's rich cell) that carries `group/option` and `aria-checked` gets it. DESIGN.md L910 holds as written; nothing added to it.
- fixed: question card (transcript/Prompt.svelte, moved to X1 by the parent) on ui/option-group: bits-ui ToggleGroup gone (questions and the browser ask's "Other"); the window-wide digit handler (`handleKeydown`, `claimants`, `ownsKeys`, `heard`, `OWNERS`, `MODAL`, `onButton`, `<svelte:window>`) deleted — a digit picks only while focus is in that question's group; `toggle`/`optionKey`/`otherChipKey`/`CROSS_STEPS` deleted; `setSingle` no longer clears on a re-pick; Enter = `enter()` → `submitQuestion()` once every question has an answer. The rail now marks the current question while focus is on the card's options (`choosing`).
- holds: transcript/QuestionCard.svelte (the settled record) stays on the chip: `data-chosen` spans, no input, so no group. Read: session-answered desk light keycap `oklch(0.55 0.17 33)` / ink `oklch(1 0 0)` = chip-chosen-bg / chip-chosen-ink, label 500; phone dark `oklch(0.54 0.165 33)` / `oklch(1 0 0)`, label 500.
- fixed: session-question "Other" option (X5's, moved with Prompt.svelte) — before: drawn 346x30, `::after` 344x44, hit at +3 down (Answer's area took the press: gap 11 = group foot 7 + card foot 4). After: on a coarse pointer the card's foot stands 7 (`coarse:pt-space-2`), so the gap is 14, the option rows' own coarse step (ui/chip chipsVariants `coarse:gap-y-space-4`, `hit-gap-y` 14). Read (390 dark, coarse): Other 756–786, Answer 800–830, midpoint 793; Other lands at 792.0, Answer from 792.1; Other reaches 7.5 up / 6 down, Answer 7.5 up / 6.5 down (computed `::after` ±7 each; the engine's hit test reads ~0.5–1px above layout on both).
- fixed: session-question Answer (disabled in the audit) — read enabled after a pick, same layout, 390 dark coarse: drawn 121.7x30, `::after` 44 tall (`top/bottom -8px` from the padding box, `--hit-edge` 1px), hit 44 = true, miss 45 = true.

Proof reads (scratch driver on the probe kit's tape, session-question, 1440 light fine/hover and 390 dark coarse/none):
- rest: one `radiogroup`, four `radio`s `aria-checked=false`, tab stop on 1, `aria-keyshortcuts` 1–4.
- "1" with focus on the body: nothing checked (both passes).
- ArrowRight from 1: focus on 2, nothing checked; ArrowDown then ArrowLeft: focus back on 2, nothing checked.
- Enter before a pick: nothing checked.
- Space on 2: 2 checked; its keycap `oklch(0.55 0.17 33)` light / `oklch(0.54 0.165 33)` dark = `--chip-chosen-bg`, ink `oklch(1 0 0)`; label weight 500 before and after.
- "3" inside the group: 3 checked, 2 unchecked, focus on 3.
- click on the chosen 3: 3 stays checked.
- Enter on the chosen option once answered: Answer `aria-busy="true"` (answering).

- fixed (second item): scripts/probe-kit/journeys/j4-caw-asks.ts, moved to X1 by the parent — the step "Move into the second's options, answer by its number key, then Enter" first focuses the second card's first option (its group's one tab stop while nothing is picked), then presses 2 and Enter.

Interface-craft critique (engine reads, no picture):
- fixed: L910 chosen option — keycap fill = chip-chosen-bg (light oklch(0.55 0.17 33), dark oklch(0.54 0.165 33)), digit chip-chosen-ink oklch(1 0 0); label weight 500 before and after the pick (no reflow); the chosen chip takes no hover (`enabled:not-aria-checked:hover`).
- fixed: L929 44 Touch Rule — session-question Other / Answer areas meet at the midpoint (read above).
- holds: L910 "option chips (30px …)" — the audit's "Other ~30 vs others ~43" is the list form's descriptions under the other labels; every option's min-height is c-btn-h-sm (30).
- lint: the five .cutover/gates/*.ts files as checked out from origin/cawco-cutover/gates failed `fmt --check` and biome (useTopLevelRegex, noNestedTernary, noIncrementDecrement, useConsistentTypeDefinitions, useSortedInterfaceMembers), failing `bun run lint` and the landing gate's `lint:changed`. Fixed in place with no change to what they check: formatted, regexes hoisted to top-level constants, nested ternary verdicts written as if/else, `++` as `+= 1`, `LaneList` as an interface. `bun run lint` and `bun run lint:changed` exit 0.

## Second item: the rest of the kit findings (pushed as cawco-lanes/X1-controls)

Reads: scratch drivers on the probe kit's tape (walk.ts passes; desk = 1440 fine/hover, phone = 390 coarse/none), before on 0f64468e1 + the first item, after on this head. "hit 44" = elementFromPoint lands 0.5px inside a 44px box centred on the drawn control and misses 0.5px beyond, up and down; "pair" = 0.5px inside each side of the midpoint lands on that side and not on the other.

### The hit test's half pixel (the parent's item 2)
- fixed: app.css `touch-hit` — the area's `::after` stands `translate: 0.5px 0.5px`. Which box decides: not the `::after`'s layout box but Blink's hit test, which takes a press half a pixel up/left of layout. Read with a 44px box laid at [100,144): elementFromPoint lands at 99.2 and 143.99, not at 99.01 or 144.01 (a 1px area at the point, floored to 1/64); a CDP mouse press the same; a CDP touch at 99.5 and 99.9 lands, at 99.2 and 143.9 does not (rounded to the pixel). So every area read 7.5 before and 6.5 after its control (base: sheet-inspect button `::after` -8px, reach up 7.5 / down 6.5 / left 7.5 / right 6.5), and of two areas meeting at a midpoint the later-painted took the earlier's last half pixel. After (390 dark): session-question Other 786 / Answer 800, midpoint 793: Other lands at 792.5 and not at 793.5, Answer lands at 793.5 and not at 792.5; Other hit 44 all four true, Answer hit 44 all four true (enabled after a pick). project-new chip rows 307.5 / 321.5, midpoint 314.5: pair all four true; chip 173x30 hit 44 all four true. Both areas keep `--hit-gap-y` 14 (the option rows' coarse step, and Answer's row 14 under them). `pointer-hit` unchanged (no finding on the fine pointer; main's pointer-hit spec reads it).

### Touch areas
- fixed: text fields have no area — ui/input: an `<input>` draws no `::after`, so Input stands in its own box, `<span data-slot="input-area" class="touch-hit inline-flex w-full min-w-0">`, which takes the caller's placement and the field's width looks (`box` slot: number field width, measure caps, code flex); the input fills it, drawn as before. A press on the area beside the field focuses the field. Before (390): config-hooks-editor inputs 304x36 and 280x36, config-memory-filtered filter 256x36, "Stop placing new work past" 64x30, sign-in Code 274.5x30, task-open "Add a to-do" 317x30: `::after` none, reach up 0.5 / down 0. After (390 dark): the same boxes (304x36, 280x36, 256x36, 64x30, 274.5x30, 317x30), each area `::after` 44px with translate 0.5px 0.5px, hit 44 all four true; a press 3px above config-memory-filtered's field lands on `input-area` and focuses the field (`focused true`; the same on task-open and config-accounts-second).
- fixed: ui/input-group — the frame is the field (Field shell), so it carries `touch-hit` (`--hit-edge` 1px) and a press on its area focuses its control; InputGroupInput draws no area of its own (`area={false}`).
- fixed: ui/textarea — the same as Input: `<span data-slot="textarea-area" class="touch-hit inline-flex w-full min-w-0">` takes the caller's placement and a press on it focuses the field; InputGroupTextarea draws none (`area={false}`). Before: config-hooks-editor textareas 304x64 and 304x41, views-decision-page note fields 156x36, no `::after`. After (390 dark, scrolled into view): the note 156x36, its area `::after` 44px, hit 44 all four true; the 304x64 field's area is its own box (`::after` 64px).
- fixed: ui/native-select (L931; not named in the list, a control under 44 on a finger) — the frame draws the field (`::before`: 1px border-control, surface-raised, 10px radius, shadow-xs) and takes the ring (field-shell); the select is transparent and under a finger stands 43.5px with -3.5px / -4px margins (`--select-reach`, stopping at a neighbour's `--hit-gap-y`; the top half a pixel lower, as touch-hit). Read 390 dark: config-spend-rest frame 304x36, select 304x43.5; workflows-launch frames 296x36, selects 296x43.5; centred on the drawn frame, hit 44 all four true on all three; desk: frame 384x36 / 450x36, select 384x36 / 450x36, margins 0. Frame read = `oklch(0.352 0.009 70)` edge / `oklch(0.248 0.006 70)` fill (dark) = `--border-control` / `--surface-raised`; ring on the frame `solid 2px off -2px`, select outline none.
- fixed: ui/chip — every look (`option`, `tray`, `setting`) carries `touch-hit` by recipe (`setting` with `hit-edge-hair`); ui/option-group's Item no longer adds its own.
- fixed-in-wave2 / site: config-accounts-rest "Routing" is a raw `<a>` (routes/(app)/config/accounts/+page.svelte:75, `mark-line type-label … text-link-ink`, 60x17, no `::after`): X3's to move onto the Button's link variant, which carries `touch-hit` (button.svelte base).
- ask: session-move-ask "Details" is ui/collapsible's trigger (`data-slot="collapsible-trigger"`, 56x25, no `::after`), a kit part not on X1's list: `touch-hit` belongs on its recipe.
- kit-swap: config-hooks-editor matcher chips are raw buttons (lib/cawco/HookTester.svelte:65, 50–98x23, desk `::after` from pointer-hit, phone none): X3's to move onto ui/chip `option`.
- kit-swap: config-accounts-second Looks swatches are raw `role="radio"` buttons in a `role="radiogroup"` div (lib/cawco/accounts/Swatches.svelte:12, `flex flex-wrap gap-space-3`, each `touch-hit`, no `--hit-gap-x`): not a kit group, so X3's site sets `hit-gap-x-space-3` (its gap) on the radiogroup, or moves it onto ui/option-group.
- holds (disabled): the six disabled buttons are read enabled by their area lanes; session-question Answer is read enabled above.

### Input height
- site-needs: Input `size="sm"` (30px) drops, so the field draws 36 (L252): lib/cawco/KeyValueRows.svelte:40, lib/cawco/KeyValueRows.svelte:52, lib/cawco/tasks/TodoList.svelte:123 (task-open "Add a to-do", read 317x30), lib/cawco/tasks/TodoList.svelte:200, lib/cawco/accounts/SigninPanel.svelte:70 (config-accounts-sign-in Code, read 274.5x30), lib/cawco/accounts/AtLimitBlock.svelte:69 (config-accounts-second "Stop placing new work past", read 64x30), lib/cawco/accounts/AtLimitBlock.svelte:90, lib/cawco/accounts/AccountSetup.svelte:854, lib/cawco/accounts/AccountEditor.svelte:204, lib/cawco/project/ProjectDetails.svelte:837, lib/cawco/project/ProjectDetails.svelte:961, lib/cawco/transcript/DelegateTray.svelte:1702 (12 attributes in 9 files, all `<Input … size="sm">`).

### Blue outside status
- fixed: app.css `@layer base` `:root { accent-color: var(--action-solid) }` (inherited). Before: bench-folder-proof-rest's three ranges `accent-color: auto` (the browser's blue). After: `oklch(0.555 0.17 33)` light / `oklch(0.54 0.165 33)` dark = `--action-solid` on all three.
- holds: the kit Checkbox draws `data-checked:bg-action-solid` (checkbox.svelte); no kit or native checkbox stands in config-models-rest or config-connections-rest's captured state (read: none of either).
- fixed-in-wave2: config-updates-rest channel card tick: `svg[data-slot=check]` in `ink-strong` (`oklch(0.295 0.01 70)` light), not blue. The remaining blue in a scan of every finding's page is the live status glyph (`status-live-glyph`, `oklch(0.5 0.15 252)`) and the identity tiles' hue (`oklch(0.7066 0.1331 226.72)`), both sanctioned.

### Native select
- holds: ui/native-select meets L742 — `appearance: none` (read), the house sort-vertical glyph (`IconUnfold`), the input's height (36, `sm` 30) and control edge (frame read above). No raw `<select>` is left in apps/dashboard/src (grep `<select` outside ui/native-select: none), so board label and the workflows selects are on the kit (fixed-in-wave2).

### Focus
- holds: every kit field's focus is the house ring, never an edge change. Read on config-memory-filtered's filter (and task-open, config-accounts-second): focused, `outline: solid 2px <focus-ring> off -2px` (light `oklch(0.55 0.165 33)`, dark `oklch(0.76 0.12 34)` = `--focus-ring`), `border-top-color` the same before and after (`oklch(0.89 0.013 82)` light / `oklch(0.352 0.009 70)` dark). The ring sits on the field's own border (L741's inset offset); NativeSelect's on its frame.

### Destructive
- holds: Button `destructive` = `border-error-9 bg-transparent text-error-11 hover:bg-error-3` (L729, L234–237). error-11 contrast (engine token reads, oklch → sRGB): light 11.25:1 on raised, 10.4 on page, 10.43 on recess, 8.35 on the error-3 hover; dark 10.23 on raised, 11.87 on page, 10.95 on recess, 8.97 on error-3.
- kit-swap: Remove account, Delete hook, Delete rule, Delete everywhere (the editors' footer delete): lib/cawco/config/EditorFooter.svelte:124 `variant="ghost" tone="muted"` → `variant="destructive"` (X3).
- kit-swap: Remove key: routes/(app)/config/models/+page.svelte:430 `variant="outline"` → `variant="destructive"` (X3).
- kit-swap: project-forget "Stop N and forget": lib/cawco/StopTray.svelte:965 (default variant, the coral fill; read `bg oklch(0.54 0.165 33)` phone dark) → `variant="destructive"` (X4).

### Copy and trash glyphs
- fixed-in-wave2: the copy glyph is duotone where the audit saw it solid. Read (path opacities): session-diff copy 0.5/1/1, project-caw-note copy 0.5/1/1, sheet-inspect 1/1/1/0.5, rail-row-menu "Copy path" and "Copy id" 1/0.5, session-tab-menu "Copy link" 1/0.5, each layer in its control's ink; ui/copy-button renders `IconCopy` (Solar bold-duotone) in the button's ink, unchanged.

### Work-tab count
- fixed: Badge `size: count` pads `px-[clamp(space-1, space-2 - --tight*1000, space-2)]`: `space-2` (7px) while the head's inherited `--tight` is 0, `space-1` (4px) once it is above 0. Read (a count-padded span in WorkTabs' head): desk 1440, head `--tight: clamp(0px, calc(280px - 100cqw - 14px), 33px)` → pad 4px; 390 → pad 7px; with `--tight` 0px 7px, 1px 4px. X5 measures it in WorkTabs.

### Segmented
- fixed (from X3 via the parent): ui/toggle-group drops `flex-wrap` and its groove holds every segment (`w-max`), L801 "one groove". Read config-delegate-types-editor: Harness 3 segments 1 row, Effort 6 segments 1 row (`flex-wrap: nowrap`), desk Effort 318 wide; at 390 the Effort groove is capped at 304 by its caller (`max-w-full`) where its segments need 316 (parent scrollWidth 316 / clientWidth 304).
- kit-swap: lib/cawco/config/Choice.svelte:24 and routes/(app)/config/connections/+page.svelte:686 `max-w-full` caps the groove: drop it and stand the group in an `overflow-x-auto` scroller; X3's `w-max` workaround goes (the kit's).
- kit-swap: the chip sites that added `touch-hit` themselves drop it (the recipe carries it): lib/cawco/tasks/TaskLabels.svelte:99, lib/cawco/views/ViewRoutines.svelte:874, routes/(app)/project/new/+page.svelte:230.

### DESIGN.md Buttons
- fixed: the section opens "Buttons: shadcn/ui button and Base UI; prominence per Apple HIG." holds: no Material Design citation stands in it (grep "Material Design": none); what it keeps is the house look (sizes, the variants' colours, pending and the Press Rule).
- holds: the kit Button's variant names map onto shadcn/ui's: default → default (the coral primary), secondary → secondary, outline → outline, ghost → ghost, link → link, destructive → destructive; `grant` is the house's own (The Consequential Grant Rule).

corrected: session-question's answer row stands 14 under the options on a finger (main: 11), L931.
corrected: native selects draw from their frame and are a finger's 44 under it (main: 36, no area), L931.
corrected: Effort and Harness segments stay one row (main: "max" wrapped to a second row), L801.

Interface-craft critique (engine reads):
- fixed: L931 every kit text field, chip, native select and the option rows reach 44 under a finger and meet at their midpoints (reads above).
- fixed: L463/L578 no native control draws the browser's blue (accent-color read).
- fixed: L801 a segmented group is one groove on one row.
- holds: L741/L969 focus is the ring over the field's own border; the edge colour never changes.
- holds: L729 destructive ink ≥ 8.35:1 everywhere it stands, both themes.
- gap: none known in the kit that X1 can fix; the site lines above are the area lanes'.

## Review of cawco-audit/X1-controls (fb078a4ef): answers

Reads: scratch drivers on the probe kit's tape at b1254aaa9 + these fixes (desk 1440 fine, phone 390 coarse).

- fixed: #1 primary 2px short (L733/L231/L245). Cause: the Button base clips its fill to the padding box (`bg-clip-padding`), and the primary's 1px border is transparent, so its fill painted 1px in from every edge while an outline's border paints its box. The boxes were already equal (Answer 122x30 beside Dismiss 67x30). Fix: the `default` variant fills to its border box (`bg-clip-border`, as the answer variants do). Read (`background-clip` and box): session-question and home-rest Answer 122x30 border-box beside Dismiss 67x30; config-accounts-account Save changes 116x36 border-box beside Cancel 73x36; views-decision-page Ask Caw 84x36 border-box beside Spin off 78x36; home-rest phone Start session 354x44 border-box; in desk light, desk dark and phone dark.
- holds (after integration): #3 the 30px inputs are Input `size="sm"` (site-needs above, plus lib/cawco/transcript/DelegateTray.svelte:1411, found by this pass).
- site-needs: #3 Select/NativeSelect `size="sm"` (30px) drops, so the field draws 36 (L749 the input's look, L252): lib/cawco/accounts/StrategyPicker.svelte:188 (config-accounts-routing Probe select, read NativeSelect 95x30 `data-size=sm`), lib/cawco/preview/SheetInspector.svelte:244 (sheet-inspect Calm, read 128x30 sm), lib/cawco/preview/SheetInspector.svelte:367 (sheet-inspect size, read 267x30 sm), lib/cawco/tasks/TaskPane.svelte:435 (task-open Ready, read Select trigger 87x30 sm), lib/cawco/tasks/NewTaskForm.svelte:101, lib/cawco/tasks/TaskFilterPopover.svelte:162, :189, :212, :232, lib/cawco/preview/PlacePick.svelte:108, routes/(app)/usage/+page.svelte:185, lib/cawco/project/ProjectDetails.svelte:611, :648, :825, :948, :1245, :1265.
- holds / route X3: #3 config-hooks-editor "Event" and config-skills-fetch "Scope" are not selects: each is the kit setting chip (`button[data-slot=popover-trigger]`, chip `setting`, 150x30 and 231x30) opening a popover, which DESIGN.md draws at 30 (New-session dialog: "Setting chips are 30px"). Whether a form field there is a setting or a select (36) is X3's: lib/cawco/config/PickerChip.svelte.
- note: a setting chip as a popover trigger reads `touch-hit` twice: ui/popover's trigger adds it to every trigger (popover-trigger.svelte:66) and the chip now carries it. The same area either way; ui/popover's owner may drop its own for chip triggers.
- fixed: #4 board-label's black ▼. It is the kit Input with a datalist (`input[list="bulk-labels-…"]`, 164x36), whose dropdown arrow Blink draws (`::-webkit-calendar-picker-indicator`). The Input now draws the house sort-vertical glyph where a field has a `list` (`IconUnfold`, 16x16 in `ink-muted`: read `oklch(0.495 0.014 74)` light, `oklch(0.778 0.012 78)` dark), the engine's arrow kept under it at opacity 0 so it still opens the list (the class is on the field, its rule in the utilities layer).
- route: #5 the sheet-inspect calm|loud groove (1144,203 100x28) is ui/fluid-tabs (`div[data-slot=ff-tabs-list][role=tablist]`), not ui/toggle-group: a kit part not on X1's list, to its owner (site lib/cawco/preview/SheetInspector.svelte).
- fixed: #6 the slider track at night. With `appearance: auto` the engine drew its own dark-scheme track (`color-scheme: dark` read on the range and the root). `@layer base` now draws every native range: `appearance: none`, a 4px track on `surface-recess-deep` (pill radius), a 16px thumb in `action-solid`, Gecko's progress in `action-solid`. Ink read at the track's unfilled end: dark rgb(20, 18, 17) = `oklch(0.184 0.004 70)` (`--surface-recess-deep` at night); light rgb(232, 228, 221) = `oklch(0.92 0.011 83)`; `appearance: none` on all three.
- route: #2 X3 — lib/cawco/config/EditorFooter.svelte:124 (Remove account, Delete rule, Delete everywhere: `variant="ghost" tone="muted"`) and routes/(app)/config/models/+page.svelte:430 (Remove key: `variant="outline"`) → `variant="destructive"`. project-forget's coral is lib/cawco/StopTray.svelte:965 (X5, routed).
- route: #7 X3 — the chosen-channel tick on config-updates-rest and bench-updates-rest (`svg[data-slot=check]`).
- route: notes — session-attached ✕ over ".txt": X5 (AttachmentChips); config-delegate-types-editor effort row past the card: X3 (Choice.svelte:24 `max-w-full`, already logged); bench-updates-rest frames: X3.
- fixed (from X0-coverage): ui/select's content stops at the room bits-ui measures (`max-h-(--bits-select-content-available-height)`). Read on usage-rest's Project select in a 1440x190 viewport: content y 102..190, `max-height: 88px`; its list scrolls 50/128 with the down button shown; after a wheel `scrollTop` 78 and the up button shown. (X0's `usage-project-pick-many` entry is not in this tree's catalogue; the short viewport makes the same overflow.)

### Unused kit parts (from X0-coverage)
deleted-file: apps/dashboard/src/lib/components/ui/field/index.ts
deleted-file: apps/dashboard/src/lib/components/ui/field/field.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-content.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-description.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-group.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-label.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-legend.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-separator.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-set.svelte
deleted-file: apps/dashboard/src/lib/components/ui/field/field-title.svelte
deleted-file: apps/dashboard/src/lib/components/ui/input-group/input-group-text.svelte
deleted-file: apps/dashboard/src/lib/components/ui/kbd/kbd-group.svelte
deleted-file: apps/dashboard/src/lib/components/ui/select/select-group.svelte
deleted-file: apps/dashboard/src/lib/components/ui/select/select-group-heading.svelte
deleted-file: apps/dashboard/src/lib/components/ui/select/select-label.svelte
deleted-file: apps/dashboard/src/lib/components/ui/select/select-separator.svelte

integration: delete Select size sm after the site swaps
integration: delete Input size sm after the site swaps
