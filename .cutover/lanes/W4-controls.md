# W4-controls: the kit controls (Button, Input, Textarea, SelectTrigger, Kbd, Badge, ToggleGroup) and ProviderLogo

Start: 682ede2877621d672bb0b38815e7d56370494dec. Paths from apps/dashboard unless they start with `apps/`, `scripts/` or `design/`.

## Skills and rules

Skills loaded: defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, interface-craft (Design Critique), ui-observer. No part or site here carries a transition or keyframes the lane writes anew (the tick, switch and keycap transitions moved as they were), so emil-design-eng and transitions-dev were not needed.

Rules followed:
- better-ui: transition only what changes (the switch names `background-color, transform`, the tick `opacity` and `stroke-dashoffset`, the keycap `background-color, color`); no `transition-all`; motion behind `motion-safe:` with the fade kept for reduced motion (the tick); hover through the kit's own `hover:` (fine pointer only); icons sized by role (ProviderLogo 12/16/20), never a px prop.
- better-layout: no fixed offsets to re-centre (FilesList's `top-1/2 -translate-y-1/2` went for a grid cell's `self-center`); logical properties (`me-`, `ms-`, `text-start`); rows of a variable count wrap (`flex-wrap` on every ToggleGroup); text boxes grow by `min-height`, not `height` (Badge `cell-tall`).
- defensive-css: a flex row holding a variable number of items wraps (ToggleGroup); a box holding content grows (`h-auto min-h-6` on the wrapping cell chip); a hover-only reveal is shown under a finger (`can-hover:` gating on `row-reach`).
- Tailwind 4.3.3 (installed): `in-*`, `data-*`, `not-*`, `motion-safe:` and arbitrary variants compiled and checked below; tokens by theme key (`h-c-composer-field`, `w-c-number-field-w`, `h-space-5`).

## Variants

| Part · variant | Role | DESIGN.md | Sites |
| --- | --- | --- | --- |
| Button `size="composer"` / `"icon-composer"` (button.svelte:52, :58) | a control standing in a composer shell | Composer: "34px Attach … and Send/Stop … each at the concentric 5px radius" | DecisionPage.svelte:368, :383 |
| Button `align="row"` / `"trigger"` (button.svelte:132) | words from the start (a list row), or words at the start and the mark at the end (a select-like trigger) | Inputs and fields: "Select trigger: the input's look with a sort-vertical glyph" | NewTaskForm.svelte:136, DirectoryPicker.svelte:234 (row); ModelCombobox.svelte:128 (trigger) |
| Button `layout="wide"` (button.svelte:136) | drawn only above the phone breakpoint | Layout, Breakpoints: "640px (phone …)" | EditorFooter.svelte:126, ProjectHead.svelte:463, :470, routes/(app)/project/[id]/+page.svelte:1540, :1558 |
| Button `reveal="row-reach"` (button.svelte:123, now keyed on `group/row`) | shown on its row's hover and focus, always under a finger | Files, Attachments: "Show in conversation … shown on the row's hover and focus and always under a finger" | FilesList.svelte:803 |
| Button `figures="tabular"` (existing) | a label with a changing figure | The Tabular Figure Rule | FleetFault.svelte:448 |
| Button `size="lg"` (existing) | 44px, the touch floor in the usage sheet | Buttons: "`lg` is 44px"; The 44 Touch Rule | UsageMeter.svelte:1079 |
| Input `field="number"` (input.svelte:19) | a short figure's field: number-field width, tight pads, centred tabular figure | The Tabular Figure Rule; token `c-number-field-w` | AccountEditor.svelte:211, AtLimitBlock.svelte:73, :94 |
| Input `size="sm"` (existing) | the 30px small control beside an `sm` button | Buttons: "`sm` is 30px" | KeyValueRows.svelte:47, :60; AccountEditor.svelte:211; AccountSetup.svelte:859; AtLimitBlock.svelte:73, :94; SigninPanel.svelte:78; ProjectDetails.svelte:841, :965; TodoList.svelte:126, :199; DelegateTray.svelte:1407, :1685 |
| Textarea `resize="block"` (textarea.svelte:21) | an editor's field the reader may also stretch | Inputs and fields, Textarea (grows a line at a time; this adds the reader's own corner) | RuleTester.svelte:83, DelegateTypeEditor.svelte:226, HookEditor.svelte:623, :747, RuleEditor.svelte:352, :434, SubagentEditor.svelte:186 |
| SelectTrigger `size` in its tv (`default` h-c-input-h, `sm` h-c-btn-h-sm, `composer` h-c-composer-field; select-trigger.svelte:14) | its height by role | Inputs and fields: "Select trigger: the input's look"; Composer 34px | ViewBar.svelte:150 (`composer`) |
| SelectTrigger `look="in-bar"` gains `group-data-bar:overflow-clip` (select-trigger.svelte:22) | clips the name it morphs in a view's bar | Composer (the bar is a composer shell) | ViewBar.svelte:150 |
| Kbd `look="keycap"` (kbd.svelte:22) | an option chip's keycap digit | Permission gate: "option chips (30px, 8px radius, keycap digits)"; Typography, Code: "keycaps"; Colors, Chosen option | RecordCard.svelte:92, :222; Prompt.svelte:997, :1009; QuestionCard.svelte:321, :333 |
| Kbd `look="key"` (default; kbd.svelte:21) | a key named in a hint, taking a tooltip's ink inside one | Tooltip | every other Kbd |
| Kbd `figures="tabular"` (kbd.svelte:26) | a changing figure | The Tabular Figure Rule | Prompt.svelte:783 |
| Kbd `reach="keyboard"` (kbd.svelte:29) | a key hint, absent under a finger | Hover only where it exists / a touch screen has no keyboard | SuggestionChips.svelte:295 |
| Badge `figures="tabular"` (badge.svelte:44) | a changing count | The Tabular Figure Rule | TaskCard.svelte:238 |
| Badge `size="count"` gains `tabular-nums pointer-events-none` (badge.svelte:41) | a tab's count: meta numeral, tabular, a press on it is its tab's | Badges, Work tab count: "its numeral in the meta role, in tabular figures" | WorkTabs.svelte:810 |
| Badge `size="cell-tall"` gains `h-auto whitespace-normal text-start` (badge.svelte:39) | an update cell's chip whose words wrap and grow it | Badges (defensive: content grows) | UpdateCell.svelte:51 |
| Badge base `[&[aria-haspopup]]:cursor-pointer` (badge.svelte:8) | a badge that opens a popover | (the trigger's state as its attribute) | ToolMatrix.svelte:158, :224 |
| Badge `variant="note-new" / "note-improved" / "note-fixed"` and `as="h3"` (badge.svelte:24) | a release note's section label | Update notice: "New in `note-new-*` …, Improved in `note-improved-*` …, Fixed in `note-fixed-*`" | none in this list: gap below (ReleaseNotes.svelte) |
| ToggleGroup root `flex-wrap` (toggle-group.svelte:34) | every segmented toggle group wraps whole segments onto the next line | defensive-css (a variable row wraps); Segmented | Choice.svelte:24, ProjectDetails.svelte:1049, :1179, connections/+page.svelte:684, motion/caw-notices/+page.svelte:394, :413 |
| ProviderLogo `size="meta" / "control" / "nav"` (ProviderLogo.svelte:12; default `control`) | the mark's size by where it stands | Icons, Sizes: "12px beside meta text, 16px in controls and rows (the default for any unsized icon), 20px in nav and headers" | ProjectDetails.svelte:1341 (`control`), ActionsTable.svelte:128, ModelSection.svelte:318, :540, SessionDetails.svelte:520 (`control`); TaskPane.svelte:523 (`meta`) |
| Markdown `class` through cn() (markdown.svelte:19, :263) | the prose root's own utilities | Typography (prose inherits a surface's type) | none in this list: gap below (ReleaseNotes.svelte) |
| Checkbox root `pointer-hit` (checkbox.svelte:69) | a 16px control reaches 24px under a fine pointer | The 24 Pointer Rule | every kit Checkbox |

## Kit swaps

kit-swap: src/lib/cawco/FleetFault.svelte:448 Button figures="tabular" (was `num`) — done
kit-swap: src/lib/cawco/KeyValueRows.svelte:47 Input size="sm" (was `h-space-8`) — done
kit-swap: src/lib/cawco/KeyValueRows.svelte:60 Input size="sm" (was `h-space-8`) — done
kit-swap: src/lib/cawco/ModelCombobox.svelte:128 Button align="trigger" (was `justify-between`) — done
kit-swap: src/lib/cawco/RuleTester.svelte:83 Textarea resize="block" (was `resize-y`) — done
kit-swap: src/lib/cawco/ToolMatrix.svelte:110 Badge size="cell" (dead `h-auto` removed) — done
kit-swap: src/lib/cawco/ToolMatrix.svelte:133 Badge size="cell" (dead `h-auto` removed) — done
kit-swap: src/lib/cawco/ToolMatrix.svelte:158 Badge size="cell", cursor from the base's `aria-haspopup` (was `h-auto cursor-pointer`) — done
kit-swap: src/lib/cawco/ToolMatrix.svelte:224 Badge size="cell", cursor from the base's `aria-haspopup` (was `h-auto cursor-pointer`) — done
kit-swap: src/lib/cawco/ToolMatrix.svelte:245 Badge size="cell" (dead `h-auto` removed) — done
kit-swap: src/lib/cawco/UsageMeter.svelte:1079 Button size="lg" in the sheet (was `sm` + `h-c-btn-h-lg`) — done
kit-swap: src/lib/cawco/accounts/AccountEditor.svelte:211 Input field="number" size="sm" (was `num h-c-btn-h-sm w-c-number-field-w text-center` + `pad="tight"`) — done
kit-swap: src/lib/cawco/accounts/AccountSetup.svelte:859 Input size="sm" (was `h-c-btn-h-sm`) — done
kit-swap: src/lib/cawco/accounts/AtLimitBlock.svelte:73 Input field="number" size="sm" — done
kit-swap: src/lib/cawco/accounts/AtLimitBlock.svelte:94 Input field="number" size="sm" — done
kit-swap: src/lib/cawco/accounts/SigninPanel.svelte:78 Input size="sm" (was `h-c-btn-h-sm`) — done
kit-swap: src/lib/cawco/config/Choice.svelte:24 ToggleGroup (wraps by default; `flex-wrap` removed) — done
kit-swap: src/lib/cawco/config/EditorFooter.svelte:126 Button layout="wide" (was `max-phone:hidden`) — done
kit-swap: src/lib/cawco/config/editors/DelegateTypeEditor.svelte:226 Textarea resize="block" — done
kit-swap: src/lib/cawco/config/editors/HookEditor.svelte:623 Textarea resize="block" — done
kit-swap: src/lib/cawco/config/editors/HookEditor.svelte:747 Textarea resize="block" — done
kit-swap: src/lib/cawco/config/editors/RuleEditor.svelte:352 Textarea resize="block" — done
kit-swap: src/lib/cawco/config/editors/RuleEditor.svelte:434 Textarea resize="block" — done
kit-swap: src/lib/cawco/config/editors/SubagentEditor.svelte:186 Textarea resize="block" — done
kit-swap: src/lib/cawco/decisions/DecisionPage.svelte:347 Textarea look="note" (duplicated `max-h-c-textarea-max-h min-h-c-composer-field` removed) — done
kit-swap: src/lib/cawco/decisions/DecisionPage.svelte:368 Button size="icon-composer" (was `size-c-composer-field` over `size="icon"`) — done
kit-swap: src/lib/cawco/decisions/DecisionPage.svelte:383 Button size="composer" (was `h-c-composer-field`) — done
kit-swap: src/lib/cawco/files/FilesList.svelte:803 Button reveal="row-reach" tone="muted", placed by its row's grid cell (was `absolute end-space-1 top-1/2 -translate-y-1/2 text-ink-muted opacity-0 transition-[opacity] dur-control ease-out group-*/row:opacity-100 coarse:opacity-100`) — done
kit-swap: src/lib/cawco/home/WorkTabs.svelte:810 Badge size="count" (was `num pointer-events-none`) — done
kit-swap: src/lib/cawco/project/ProjectDetails.svelte:841 Input size="sm" — done
kit-swap: src/lib/cawco/project/ProjectDetails.svelte:965 Input size="sm" — done
kit-swap: src/lib/cawco/project/ProjectDetails.svelte:1049 ToggleGroup (Work lands; flex-wrap removed) — done
kit-swap: src/lib/cawco/project/ProjectDetails.svelte:1179 ToggleGroup (Tasks; flex-wrap removed) — done
kit-swap: src/lib/cawco/project/ProjectDetails.svelte:1341 ProviderLogo size="control" (dead `size-icon-sm` removed) — done
kit-swap: src/lib/cawco/project/ProjectHead.svelte:463 Button layout="wide" — done
kit-swap: src/lib/cawco/project/ProjectHead.svelte:470 Button layout="wide" — done
kit-swap: src/lib/cawco/project/ViewBar.svelte:150 SelectTrigger size="composer", look="in-bar" clips (was `group-data-bar:overflow-clip group-data-bar:not-size-sm:h-c-composer-field group-data-bar:size-sm:h-c-composer-field`) — done
kit-swap: src/lib/cawco/routines/ActionsTable.svelte:128 ProviderLogo size="control" (was `size-icon-md`) — done
kit-swap: src/lib/cawco/spawn/ModelSection.svelte:318 ProviderLogo size="control" (was `size-icon-md` + `size={16}`) — done
kit-swap: src/lib/cawco/spawn/ModelSection.svelte:540 ProviderLogo size="control" (was `size-icon-md` + `size={16}`) — done
kit-swap: src/lib/cawco/tasks/NewTaskForm.svelte:136 Button align="row" (was `justify-start`) — done
kit-swap: src/lib/cawco/tasks/TaskCard.svelte:238 Badge figures="tabular" (was `num`) — done
kit-swap: src/lib/cawco/tasks/TaskPane.svelte:523 ProviderLogo size="meta" (was `size-icon-sm`, dead under the inline 16px) — done
kit-swap: src/lib/cawco/tasks/TodoList.svelte:126 Input size="sm" — done
kit-swap: src/lib/cawco/tasks/TodoList.svelte:199 Input size="sm" — done
kit-swap: src/lib/cawco/transcript/DelegateTray.svelte:1407 Input size="sm" (the reason field) — done
kit-swap: src/lib/cawco/transcript/DelegateTray.svelte:1685 Input size="sm" — done
kit-swap: src/lib/cawco/transcript/MessageRow.svelte:761 Badge kind="meta" (`h-auto` removed) — done
kit-swap: src/lib/cawco/transcript/Prompt.svelte:783 Kbd figures="tabular" (was `num`) — done
kit-swap: src/lib/cawco/transcript/SuggestionChips.svelte:295 Kbd reach="keyboard" (was `coarse:hidden`) — done
kit-swap: src/lib/cawco/transcript/ToolGroup.svelte:391 Badge kind="meta" (`h-auto` removed) — done
kit-swap: src/lib/cawco/updates/UpdateCell.svelte:51 Badge size="cell-tall" (the `CHIP` const `h-auto whitespace-normal text-start` removed) — done
kit-swap: src/lib/components/features/DirectoryPicker.svelte:234 Button align="row" (was `justify-start`) — done
kit-swap: src/routes/(app)/config/connections/+page.svelte:684 ToggleGroup (flex-wrap removed) — done
kit-swap: src/routes/(app)/motion/caw-notices/+page.svelte:394 ToggleGroup (flex-wrap removed) — done
kit-swap: src/routes/(app)/motion/caw-notices/+page.svelte:413 ToggleGroup (flex-wrap removed) — done
kit-swap: src/routes/(app)/project/[id]/+page.svelte:1540 Button layout="wide" — done
kit-swap: src/routes/(app)/project/[id]/+page.svelte:1558 Button layout="wide" — done
kit-swap: src/lib/cawco/workspace/SessionDetails.svelte:520 ProviderLogo size="control" (was `size={15}`; the parent authorised this one line) — done

58 of 58 sites from W4-controls-sites.md swapped, plus SessionDetails.svelte:520 and the keycaps.

## Sheet classes

sheet: kit-slot → kit recipe — used only by the kit Button's slot (button/pending-content.svelte): its declarations are utilities on the slot span (`w-(--btn-icon) flex-none [--icon-swap-dur:var(--dur-morph)] data-over:-me-(--btn-gap) data-over:w-0 data-over:items-center data-over:justify-items-start`), hook `data-slot="btn-slot"`; `.kit-slot` dropped from app.css's `.icon-swap > [data-active="false"] *` and the mark-line exclusion (the span keeps `.icon-swap`, which both rules already name).
sheet: kit-tick → kit recipe — used only by kit parts (checkbox, the context and dropdown menu checkbox items, select item, the button's slot): `tickVariants` in checkbox.svelte's module, with `clock: menu | morph` for the two context rules (`:where(.kit-item) .kit-tick`, `.kit-slot .kit-tick`), which are deleted; the button's tick has `data-slot="tick"`.
sheet: kit-switch → kit recipe — used only by switch.svelte: `[transition:background-color_…,transform_…]` and `motion-safe:active:not-data-[disabled]:[transform:scale(var(--press-scale))]` on its root.
sheet: kit-switch-thumb → kit recipe — used only by switch.svelte's thumb: `motion-safe:[transition:translate_var(--dur-toggle)_var(--ease-in-out)]`.
sheet: kit-keycap → an existing part's variant — a multi-property look applied by name in RecordCard, Prompt and QuestionCard: Kbd `look="keycap"`; the six spans are `<Kbd data-box look="keycap">`. The chosen-chip context (`.kit-chip:is([aria-pressed=true],[aria-checked=true],.kit-chip-chosen) .kit-keycap`) is `in-[…]:bg-chip-chosen-bg` / `in-[…]:text-chip-chosen-ink` on the variant.

Descendant rules traced (parent's addition): `.kit-slot .kit-tick` (→ tick clock `morph`), `:where(.kit-item) .kit-tick` (→ clock `menu`), `.kit-tick path` (→ `[&_path]:` on the tick), `:where(.kit-switch) .kit-switch-thumb` (→ thumb utilities), `.kit-chip:is(…) .kit-keycap` (→ `in-[…]`), `:is(.icon-swap, .kit-slot) > [data-active=false] *` (→ `.icon-swap` alone). None reaches a component outside the list; no file was added for them.

Gone from the sheets: `grep -rn "kit-slot\|kit-tick\|kit-switch\|kit-keycap" apps/dashboard/src` prints nothing; the names remain only in scripts/ (gaps below).

## Removed

removed: src/lib/cawco/KeyValueRows.svelte:47, :60 `h-space-8` (32px) — no Input height of 32 in DESIGN.md (Inputs: 36px; Buttons: "`sm` is 30px"); the row's Remove is an `icon-sm` 30px button, so the fields take `size="sm"`, level with it.
removed: src/lib/cawco/decisions/DecisionPage.svelte:347 `max-h-c-textarea-max-h min-h-c-composer-field` — the same two classes the Textarea's `look="note"` already holds (textarea.svelte, `note`).
removed: src/lib/cawco/ToolMatrix.svelte:110, :133, :158, :224, :245 `h-auto` — dead: `size="cell"`'s `min-h-6` (24px) already outweighs the base's 20px and the chip never wraps (`whitespace-nowrap`).
removed: src/lib/cawco/transcript/MessageRow.svelte:761 and ToolGroup.svelte:391 `h-auto` — DESIGN.md Badges: "Badge: 20px"; a tool row is 26px (Transcript, Tool rows), so the 20px badge stands in it.
removed: src/lib/cawco/files/FilesList.svelte `top-1/2 -translate-y-1/2` — a translate re-centring an absolutely placed button; the row is a one-cell grid and the button stands in it `self-center justify-self-end` (S3 magic offset).
removed: src/lib/cawco/UsageMeter.svelte:1079 `h-c-btn-h-lg` over `size="sm"` — a height propping a size; the sheet's button is the 44px `lg` DESIGN.md names.
removed: src/lib/components/features/ProviderLogo.svelte the px `size` prop, its inline `width/height` style, the `style` prop and the width/height attributes — a pixel number crossing a prop; it made every caller's `size-icon-*` class dead (inline style won), so ProjectDetails' and TaskPane's `size-icon-sm` never applied.
removed: src/lib/components/ui/input/input.svelte `pad: { tight }` — its three users were the number fields; folded into `field="number"`.
removed: src/lib/components/ui/select/select-trigger.svelte `data-[size=default]:h-9 data-[size=sm]:h-[30px]` — attribute-weighted heights that ViewBar had to out-weigh with `group-data-bar:size-sm:` pairs; the heights are the tv `size` variant now.
removed: src/lib/cawco/updates/UpdateCell.svelte:33 the `CHIP` const — the look is `size="cell-tall"`.

## Fixed

fixed: src/lib/components/ui/kbd/kbd.svelte:22 the keycap is 18px (`h-space-5 min-w-space-5`), was 17px — delta S2: an off-scale size takes the ladder step (DESIGN.md Layout: "4, 7, 11, 14, 18 …"); the chip's 30px box (4px pads, 1px border) still holds it on one line.
fixed: src/lib/components/ui/toggle-group/toggle-group.svelte:34 every toggle group wraps — defensive-css "A flex row holding a variable number of items wraps"; the thumb follows a wrapped segment (tabs/thumb.ts reads offsetLeft and offsetTop).
fixed: src/lib/cawco/tasks/TaskPane.svelte:523 the issue's provider mark is 12px beside its meta line — DESIGN.md Icons: "12px beside meta text" (it drew 16px because the inline size beat its class).
fixed: src/lib/components/ui/checkbox/checkbox.svelte:69 `pointer-hit` on the root — DESIGN.md The 24 Pointer Rule: "On a fine pointer, a control drawn smaller than 24×24 reaches 24px through `.pointer-hit`". Kit controls in this part drawn under 24px on a fine pointer: Checkbox 16×16 (fixed here); Switch 32×18.4 and sm 24×14 (already `touch-hit pointer-hit`, switch.svelte:39); Button `xs` 24px tall and `icon-xs` 24×24 (meet it); Badge 20px tall, whose trigger uses are `size="cell"` (24px, meets it); Kbd is not a control.
fixed: src/lib/cawco/workspace/SessionDetails.svelte:520 the model chip's mark is 16px (`control`), was 15px — DESIGN.md Session card: "the four settings (model, effort, permission, account) as one group of equal chips"; Icons: "16px in controls and rows". Before: `width:15px;height:15px` inline (ProviderLogo's old `box`, from the code); after: `size-icon-md`, 16px. The card needs a live session, so the after value is read from the class, not rendered (no bench draws it).

## Tokens

None. Every value is an existing token or ladder step.

## Theme additions

None. No `@utility`, `@custom-variant` or theme key was added; app.css changed only by deleting the five sheet rules and their references.

## Compiled check

`@tailwindcss/node` 4.3.3 `compile()` over src/app.css, `build([...])` of the new classes; each emitted:
- `in-[.kit-chip:is([aria-pressed=true],[aria-checked=true],.kit-chip-chosen)]:bg-chip-chosen-bg` → `:where(:is(.kit-chip:is([aria-pressed=true], [aria-checked=true], .kit-chip-chosen))) .in-\[…\]:bg-chip-chosen-bg { background-color: var(--chip-chosen-bg); }`. It wins over the base `bg-[var(--surface-recess)]` at equal weight (0,1,0) because a variant utility sorts after the bare one.
- `motion-safe:data-[on=true]:[&_path]:[stroke-dashoffset:0]` → `.…[data-on="true"] path { stroke-dashoffset: 0; }` inside the motion media query; it outweighs `motion-safe:[&_path]:[stroke-dashoffset:22]` (`.… path`) by the attribute.
- `motion-safe:[&_path]:[stroke-dasharray:20_30]` → `@media (prefers-reduced-motion: no-preference) { .… path { stroke-dasharray: 20 30; } }`
- `[--tick-dur:var(--dur-control)]` → `{ --tick-dur: var(--dur-control); }` (tailwind-merge keeps the later of the base's and the clock's).
- `data-over:justify-items-start` → `.…[data-over] { justify-items: start; }` (utilities layer over `.icon-swap`'s components-layer `place-items`).
- `motion-safe:active:not-data-[disabled]:[transform:scale(var(--press-scale))]` → `@media (prefers-reduced-motion: no-preference) { .…:active:not([data-disabled]) { transform: scale(var(--press-scale)); } }`, the deleted rule's selector.
- `[&[aria-haspopup]]:cursor-pointer` → `.…[aria-haspopup] { cursor: pointer; }`
- `can-hover:group-hover/row:not-disabled:opacity-100` → `@media (hover: hover) and (pointer: fine) { .…:is(:where(.group\/row):hover *):not(:disabled) { opacity: 100%; } }`
- `h-c-composer-field` → `height: var(--c-composer-field)`; `size-c-composer-field` → width and height; `h-space-5`, `min-w-space-5`, `w-c-number-field-w`; `max-phone:hidden` → `@media (width < 640px) { display: none }`; `coarse:hidden` → `@media (pointer: coarse) { display: none }`.
Scratch folder deleted.

## Rendered check

`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev` for this lane (5391) and for 682ede287 (5392, a scratch worktree, removed after), one playwright-core session with the cached Chromium headless shell, `waitUntil: "domcontentloaded"`, at 1440×900 and 390×844. Computed values, start sha vs lane:

| Bench · element | 1440 | 390 |
| --- | --- | --- |
| button-pending · the slot (`.kit-slot` → `[data-slot=btn-slot]`): width 0px, flex 0 0 auto, margin-inline-end −7px / −8px, justify-items start, align-items center, --icon-swap-dur 180ms | EQUAL | EQUAL |
| button-pending · the slot's tick path: stroke-dasharray 20px 30px, stroke-dashoffset 22px, transition-duration 0.18s | EQUAL | EQUAL |
| button-pending · the slot's tick svg: opacity 1, transition-property none; transition-duration 0.18s → 0s | DIFF (inert: no property transitions) | DIFF (same) |
| updates · the cell chip (`cell-tall`): 350×24 / 245×24 at 1440, 316×34 (wrapped) / 245×24 at 390, white-space normal, text-align start | EQUAL | EQUAL |
| signin-problem · the code field: 30px, radius 10px | EQUAL | EQUAL |
| prompt-head · the place Kbd: 39×20, tabular-nums, Figtree 12px | EQUAL | EQUAL |
| caw-notices · the two toggle groups: 327×36 and 233×36, flex-wrap wrap | EQUAL | EQUAL |
| overlays · the select trigger: 87×36, radius 8px | EQUAL | EQUAL |
| chosen-hover · ModelSection's provider mark: 16×16 | EQUAL | EQUAL |
| usage-relay · Open usage: 92.7×30 at 13px (1440); 330×44 at 13px → 14px (390, the sheet's `lg`, body type per Buttons) | EQUAL | DIFF (intended) |

ui-observer (observer.browser.js, the same benches, both servers): `horizontal-overflow`, `text-clipped` and `escapes-viewport` counts are identical on the start sha and the lane on every bench at both widths (e.g. updates 1440: 47 / 0 / 0 both; 390: 50 / 0 / 59 both; button-pending 390: 40 / 38 / 0 both; signin-problem: 1 / 1 / 0 both), so none is this lane's. They sit in the bench fixtures and the button's pending-label cell.

Checkbox hit area on a fine pointer: no route draws a kit Checkbox without a hub (Configure › Connections and the task pane's to-dos need one), so the probe used an element carrying the Checkbox's hit recipe (`touch-hit pointer-hit size-icon-md border`, `--hit-edge:1px`) on the rendered page's own stylesheet. `matchMedia("(pointer: fine)")` true; box 16×16; `::after` content "" inset −5px on every side (24px from the 14px padding box). `elementsFromPoint` lands on it 4px outside left and top and 3.5px outside right and bottom, and not 5px outside. ui-observer still lists `small-tap-target` there: its rule measures the element's own box only (observer.browser.js:103–105, `const w = round(r.width), h = round(r.height); if (w < 24 || h < 24)`), never a `::after` hit area, so it reports any 16px control whatever its hit area.

Not rendered by any bench: Kbd `keycap` (a question or decision with options: a session's question card, a project's decisions), Switch (Configure pages with a hub), Badge `note-*`/`as` (no user yet), Button `composer` sizes (a decision page), `layout="wide"` (project head and page), Input `field="number"` (an account's editor).

## Critique (interface-craft, Design Critique, against DESIGN.md)

- fixed: ProviderLogo sized by a px prop and inline style: a second, unowned sizing path that killed every caller's class. Now one role prop on the Icons scale.
- fixed: the composer's controls were 34px only because DecisionPage overrode a 36px button from outside. The Composer's 34px is now the kit's `composer` size, so the next composer-shell control can't drift.
- fixed: the Files row's Show button re-centred itself with a translate; it now stands in its row's grid cell, centred by the cell.
- fixed: the keycap's 17px was off every scale; it now takes the ladder's 18px.
- gap: the Badge `note-*`/`as="h3"` variants and Markdown's `class` have no user until ReleaseNotes.svelte swaps (below).

## Gaps

gap: apps/dashboard/src/lib/cawco/updates/ReleaseNotes.svelte:64 the hand-built section label (`h3` with `tone-*:bg-note-*`) should be `<Badge as="h3" variant="note-new|note-improved|note-fixed">`, and :80's prose reset `class` on `<Markdown>` — the file is outside this lane's list. DESIGN.md Update notice.
gap: scripts/probe-kit/specs/web/button-pending.ts:33, :218 select `.kit-slot` and :55 `.kit-tick`; scripts/probe-kit/specs/web/browser-ask-card.ts:669 selects `.kit-tick` — they should select `[data-slot="btn-slot"]` and `svg[data-slot="tick"]` (a hook is `data-slot`).
gap: apps/dashboard/scripts/mark-line-check.ts:95, :98 still list `kit-keycap|kit-slot` as box classes; no element carries them now (the keycaps are `data-box`, the slot is `.icon-swap`), so the names are dead there.
