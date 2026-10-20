# W8-app-recipes

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report: interface-craft (Design Critique), ui-observer.

Base: 682ede2877621d672bb0b38815e7d56370494dec (cawco/cutover-integration). Tailwind 4.3.3 (`@tailwindcss/node` 4.3.3).

better-ui rules followed:
- Transition only what changes: every recipe names its properties (`transition-[border-color,background-color]` on the option chip, `transition-[color]` / `[color,transform]` on the tray chip and `before:transition-[background-color]` on its layer); nothing is `all`.
- Hover only on hover-capable pointers: the tray chip's and Send's hover sit under `can-hover:`; the option chip's under Tailwind's `hover:` (`@media (hover: hover)`), which the old rule's bare `:hover` was not.
- Press scales to the house `--press-scale` and a disabled control never scales: Send takes `pressable`, the tray chip `motion-safe:active:`; the option chip's hover is `enabled:` only, so a disabled chip no longer hovers.
- Gate motion behind reduced motion: every movement is `motion-safe:`; colour transitions run always.
- Shadows for elevation, borders for structure: the tray chip keeps its hairline edge under `shadow-tile`, the dock shell its control edge under `shadow-tile`.

better-layout rules followed:
- Hold structure until it breaks; breakpoints come from the content: the icon-card grid is `repeat(auto-fit, minmax(min(100%, c-icon-card-min), 1fr))`, so no viewport breakpoint outside DESIGN.md's 640/900/1024 is left (the old 399px one went).
- Plan for growth: chips keep `max-w-full` and wrap line by line; chip rows wrap (`flex-wrap`); the card grid's `min(100%, …)` never overflows a narrow grid.
- Logical properties: `ms-auto` for a section head's count, `ps-`/`pe-` on the editor chip.
- Group with space: chip rows 7px apart, 14px under a finger so each 44px `touch-hit` meets its neighbour's at the midpoint (`coarse:gap-y-space-4 coarse:hit-gap-y-(--space-4)`).

## Variant table (variant → role → DESIGN.md line → sites)

| recipe / variant | role | DESIGN.md | sites |
| --- | --- | --- | --- |
| `ui/chip` `chipVariants({ variant: "option" })` | an option / choice chip | Permission gate: "A question card answers with option chips (30px, 8px radius, keycap digits). A picked option takes the coral edge (`brand-solid`), a recessed fill and a keycap filled vermillion" | QuestionCard 320, 331; Prompt 863, 1025, 1041; RecordCard 91, 221; ViewRoutines 878; project/new 231; TaskLabels 99 |
| `ui/chip` `chipVariants({ variant: "tray" })` | a chip on the tray row on the composer | Typography, Label: "chips"; The Press Rule: "a chip … scales to 0.97" | DelegateTray 1198, 1537, 1568; Composer 3065; PlanRing 31 |
| `ui/chip` `chipsVariants()` | a row of option chips | The 44 Touch Rule: "Where neighbours sit closer, `--hit-gap-x` and `--hit-gap-y` stop each area at the midpoint" | QuestionCard 313; Prompt 858, 1068, 1086; ViewRoutines 868; project/new 219 |
| `ui/menu-item` `menuItemVariants()` | a row in a floating surface | Shapes: "8px for items inside a surface"; The 44 Touch Rule: "Menu items and nav rows are 44px tall on touch" | kit: context-menu-item 20, -sub-trigger 36, -checkbox-item 24, -radio-item 19; dropdown-menu-item 44, -checkbox-item 22, -radio-item 16, -sub-trigger 20; select-item 19; command-item 17. app: FilesList 762, 779, 791; TaskRelations 152; StagesControl 173; BulkBar 233; FetchSkillPopover 221; PickerChip 90; connections 1059 |
| `ui/section-header` `sectionHeadVariants({ inset: "list" })` | a list section's head | Layout, Density: "a 32px header band"; Borders are graded: "`border-hairline` separates rows and regions" | HomeRecent 97 |
| `ui/section-header` `sectionHeadVariants({ inset: "flush" })` | a section head flush with the column it heads | as above | TodoList 160; TaskFields 70; TaskRelations 119; TaskPane 677, 705; TextSection 49; TaskActivity 281 |
| `ui/dock-shell` `dockShellVariants()` | what docks at a page's foot | Composer, Shell: "a 12px pill in the panel material (composer glass) with a 1px control edge and the tile shadow" | Composer 3367; DecisionPage 340; ViewBar 133 |
| `ui/button` `sendVariants()` | Send / Stop / Ask Caw | Composer, Controls: "Send/Stop (coral action), each at the concentric 5px radius. They scale to 0.97 on press" | Composer 3648; ViewBar 204 |
| `ui/icon-card` `iconCardVariants()` / `iconCardsVariants()` | a pickable card led by an icon tile, and its grid | Channel cards (selection frame); The Press Rule ("cards … tint"); The One Ring Rule (inset ring) | MachinesEmpty 94, 105; TemplateCards 151, 168 |

## Sheet classes

sheet: kit-chip → kit part (ui/chip `variant: "option"`) — a multi-property look applied by name in 6 components; its pick is the element's state (`aria-pressed`, `aria-checked`, `data-chosen`).
sheet: kit-chips → kit part (ui/chip `chipsVariants`) — the chip row's layout and hit-gaps, applied by name in 4 components.
sheet: kit-chip-chosen → state as attribute (`data-chosen`) — "a record of what was picked", a state written as a class.
sheet: kit-tray-chip → kit part (ui/chip `variant: "tray"`) — a look applied by name in 3 components; SideSheet's script hook moved to `data-tray-chip`.
sheet: kit-item → kit part (ui/menu-item) — a look applied by name in 10 kit and 7 app files. As a utility it outranked its callers' own utilities (compiled: `.kit-item` sorts after `.min-h-c-artifact-row-h`, so FilesList's 44px row would have taken 32px); as a recipe it merges through tailwind-merge as the components layer lost to them. The highlight's rows hook moved to `data-menu-item`.
sheet: kit-section-head → kit part (ui/section-header `sectionHeadVariants`) — a look in 8 components; its `> .count` child styles moved onto the counts themselves (`num ms-auto type-meta text-ink-subtle`) and the Button's `head: count` variant (`ms-auto tabular-nums`).
sheet: kit-edge-fade → one behaviour used across the app (`@utility kit-edge-fade`, same name, users unchanged) — the scroll-driven edge fade; its overridable defaults (the inline mask, `--fade-len`) sit at no weight in `@layer components`, because PaneTabs' phone strip (app.css `[data-session-tabs]… .ff-tabs-list[data-scrollable]`) and `fade-len-*` override them and a utility-layer default would outrank both.
sheet: kit-edge-fade-block → one behaviour used across the app (`@utility kit-edge-fade-block`) — as above, down the page.
sheet: kit-send → kit part (ui/button `sendVariants`) — Send's look in 2 components; it carries `pressable`, which already decided its transition at both sites.
sheet: kit-dock-shell → kit part (ui/dock-shell) — the composer glass shell in 3 components.
sheet: kit-seam → one user's own utilities (WorkTabs 896: `mx-(--seam-inset) h-px border-0 bg-seam`) — applied by name in one component, so a recipe would be a part with one site.
sheet: kit-nest → one behaviour used across the app (`@utility kit-nest`, same name, users unchanged) — the nesting line drawn by `::before`/`::after` with the fold's cuts; the fold script (motion/branch) now finds its lists by `data-nest`, never by the utility's name.
sheet: icon-card → kit part (ui/icon-card `iconCardVariants`) — 2 components; highlight rows hook `data-slot="icon-card"`.
sheet: icon-cards → kit part (ui/icon-card `iconCardsVariants`) + foreign DOM for the highlight's pill (`[data-slot="icon-cards"] :is(.kit-pill, .kit-pill-trail)`: components/ui/highlight draws those elements into the grid, they carry no class from its markup).
sheet: mention-glyph → the script's own utilities (MentionField 501: `glyph.className = "inline-grid … [[data-tone=live]>&]:text-status-live-glyph …"`) — MentionField builds the glyph and can give it classes; hook `data-mention-glyph`.
sheet: ns-chip → the script's own utilities (PromptEditor 155) — PromptEditor builds the chip.
sheet: ns-chip-icon → the script's own utilities (PromptEditor 158).

ns-theme.css verdicts (this lane's part):
sheet: ns-in, ns-check, ns-panel → true `@utility` (a one-shot entrance), their keyframes on the theme as `@theme inline { --animate-ns-* }`, read with `--theme(--animate-ns-* inline)`.
sheet: ns-pop's open/close keyframes → `@theme inline { --animate-ns-pop-in / -out }`.
sheet: fai-comb, fai-scroll → true `@utility` (a repeating-gradient comb; a scrollbar's paint), CSS features Tailwind has no utility for.
sheet: ns-theme → true `@utility` (the dialog's timing scope and body face on its roots).
sheet: `.ns-theme *` box-sizing → removed (see Removed).
Pending the parent's answer (handoff sent): ns-btn, ns-chip-btn, ns-tile, ns-pop, ns-panel-set, ns-morph and the `.ns-theme button` / `input` / `::placeholder` descendant rules are looks whose consumers are not on this list.

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
kit-swap: apps/dashboard/src/routes/(app)/project/new/+page.svelte:219 Chip chipsVariants — done
kit-swap: apps/dashboard/src/routes/(app)/project/new/+page.svelte:231 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/tasks/TaskLabels.svelte:99 Chip option — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1198 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1537 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte:1568 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/transcript/Composer.svelte:3065 Chip tray — done
kit-swap: apps/dashboard/src/lib/cawco/plan/PlanRing.svelte:31 Chip tray — done
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
kit-swap: apps/dashboard/src/routes/(app)/config/connections/+page.svelte:1059 MenuItem — done

Hooks moved off class names (a hook is an attribute):
fixed: apps/dashboard/src/lib/cawco/transcript/QuestionCard.svelte:132 `.kit-chip` query → `:scope > span` (the row's children are its chips) and :146 `[data-slot="qopts"] > [data-key=…]`.
fixed: apps/dashboard/src/lib/cawco/side/SideSheet.svelte:58 `[data-slot="lift"] .kit-tray-chip` → `[data-slot="lift"] [data-tray-chip]`; every tray chip carries `data-tray-chip`.
fixed: the six kit floating surfaces' highlight `rows: ".kit-item"` → `rows: "[data-menu-item]"` (command-list 15, context-menu-content 31, context-menu-sub-content 60, dropdown-menu-content 53, dropdown-menu-sub-content 57, select-content 32); every row carries `data-menu-item`.
fixed: apps/dashboard/src/app.css:1239 `:where(.kit-item) .kit-tick` → `:where([data-menu-item]) .kit-tick`.
fixed: apps/dashboard/src/lib/cawco/motion/branch.svelte.ts `.kit-nest` queries (`closest`, `querySelectorAll`, `classList.contains`) → `[data-nest]` (`NEST`, line 343); every nesting list carries `data-nest` (RunSteps 172, WorkTabs 701, SessionTree 95, Sidebar 740 and 1113, AskItems 73, StopTray 871, PlanTree 104 when nested).
fixed: apps/dashboard/src/lib/cawco/MachinesEmpty.svelte and TemplateCards.svelte highlight `rows: ".icon-card"` → `[data-slot="icon-card"]`.
fixed: apps/dashboard/src/lib/cawco/find/MentionField.svelte:257 `.mention-glyph` → `[data-mention-glyph]` (its own attribute, as the chip's `data-mention-chip` is).
fixed: apps/dashboard/src/app.css:570 the mark-line list drops `.kit-chip`, `.kit-tray-chip`, `.kit-item`, `.kit-section-head`: each recipe carries `mark-line` itself.

## Removed

removed: apps/dashboard/src/lib/cawco/tasks/TaskLabels.svelte:99 the add chip's `h-c-badge-h px-space-1 gap-space-row text-ink-muted mark-line inline-flex items-center type-label` — a restyle of the option chip DESIGN.md does not name (Permission gate: "option chips (30px, 8px radius …)"); `h-c-badge-h` was dead already (the chip's 30px min-height won). It takes the chip's default.
removed: apps/dashboard/src/lib/cawco/decisions/RecordCard.svelte:91 `cursor-default` — dead: a span has the default cursor; the chip's pointer is `enabled:` only.
removed: apps/dashboard/src/lib/cawco/project/ViewBar.svelte:200 `style:--kit-send-press="var(--dur-toggle)"` — dead: `pressable` (utilities layer) set Send's transition at both sites, so `--kit-send-press` reached nothing.
removed: Send's disabled `opacity: 0.55` → 50% — DESIGN.md, Buttons: "Disabled: 50% opacity; the colour pair is kept."
removed: the icon-card grid's `@media (max-width: 639px)` and `(max-width: 399px)` column counts — breakpoints outside DESIGN.md's (Layout: "Breakpoints. 640px … 900px … 1024px"); the grid is content-driven now (at 390px: two 175.5px columns where one 362px column stood).
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css `.ns-theme *, *::before, *::after { box-sizing: border-box }` — a duplicate of Tailwind's Preflight (`*, ::after, ::before, ::backdrop, ::file-selector-button { box-sizing: border-box }`).
removed: the kit-keycap rule's nested `.kit-chip:is(…) &` (app.css) — the chip recipe paints its keycap (`aria-pressed:[&_.kit-keycap]:bg-chip-chosen-bg` …), so the nested rule matched nothing.
removed: the option chip's `box-sizing: border-box` and the tray chip's `background: none` / `border: 0` duplicates of Preflight.

## Tokens

token: --c-edge-fade-len-phone 16px — the house edge fade's length under 640px; between the ladder's 14 and 18, so its own token.
token: --c-menu-item-h 32px (44px in cawco.coarse.tokens.json) — a floating surface's row; one token with a coarse mode, so a caller's `min-h-*` replaces it in one tailwind-merge group.
token: --c-icon-card-min 160px — an icon card's track floor.

## Theme additions

theme: utility kit-edge-fade
```css
@utility kit-edge-fade {
  isolation: isolate;
  animation-name: kit-edge-fade-start, kit-edge-fade-end;
  animation-duration: auto;
  animation-timing-function: linear;
  animation-fill-mode: both;
  animation-range: 0% 6%, 94% 100%;
  animation-timeline: scroll(self inline);
}
```
theme: utility kit-edge-fade-block (the same, `mask-image` to bottom with `--fade-inset-end`, `animation-timeline: scroll(self block)`)
theme: utility kit-nest (the nesting line: `& > li::before/::after`, and `[data-branch-draw]&` / `[data-branch-hold] &` cuts)
theme: component kit-edge-fade defaults (`:where(.kit-edge-fade, .kit-edge-fade-block) { --fade-len: var(--c-edge-fade-len); @variant max-phone { --fade-len: var(--c-edge-fade-len-phone) } }`, `:where(.kit-edge-fade) { mask-image: … }`)
theme: component icon-cards pill (`[data-slot="icon-cards"] :is(.kit-pill, .kit-pill-trail) { z-index: 1; box-sizing: border-box; border: 1px solid var(--brand-solid); background: var(--surface-recess) }`)
theme: animate ns-in, ns-check, ns-panel, ns-pop-in, ns-pop-out (ns-theme.css `@theme inline`)

All in app.css's one block `/* wave 2: W8-app-recipes */` (and ns-theme.css's `@theme inline`).

## Compiled check

`@tailwindcss/node` 4.3.3, `compile()` over `apps/dashboard/src/app.css`, `build([...])`:
- `.kit-edge-fade-block { isolation: isolate; mask-image: linear-gradient( to bottom, …` and `.kit-edge-fade { isolation: isolate; animation-name: kit-edge-fade-start, kit-edge-fade-end; …` in the utilities layer; the defaults `:where(.kit-edge-fade, .kit-edge-fade-block) { --fade-len: var(--c-edge-fade-len); @media (width < 640px) { --fade-len: var(--c-edge-fade-len-phone); }` in components. Winner: `.fade-len-c-edge-fade-len { --fade-len: var(--c-edge-fade-len); }` (utilities) over the default at every width, and PaneTabs' strip rule (components, specificity above 0) over the default `:where()` mask: both as before.
- Sort order: `.kit-nest`, `.kit-edge-fade-block`, `.kit-edge-fade` sort before `.h-auto`, `.min-h-c-artifact-row-h`, `.rounded-sm`, `.fade-len-c-edge-fade-len`, `.transition-control`, so a caller's single utility wins. `.kit-item` sorted after `.min-h-c-artifact-row-h`, which is why it became a recipe instead.
- `[data-branch-draw]& > li::before, … [data-branch-draw] & > li::after { clip-path: inset(-9999px var(--nest-cut-r) var(--nest-cut-b) -9999px) }` and `[data-branch-hold]& > li::before, … { --nest-cut-b: 9999px }` nest under `.kit-nest`.
- `:where(.ns-theme .ns-in) { animation: ns-in var(--ns-row-ms) var(--ease-out) backwards; animation-delay: var(--delay, 0ms); }`; `:where(.ns-theme.ns-pop[data-state="open"]) { animation: ns-pop-in var(--dur-pop) var(--ease-drawer) both; }`; `@keyframes ns-in`, `ns-check`, `ns-panel`, `ns-pop-out`, `ns-pop-in`, `kit-edge-fade-start`, `kit-edge-fade-end` all emitted (the inline theme writes each value where it is read, so `--ns-row-ms` resolves on `.ns-theme`, not `:root`).
- Tray chip: `.before\:bg-\(color\:--tray-chip-fill\)::before { background-color: var(--tray-chip-fill); }`, `.can-hover\:hover\:\[--tray-chip-fill\:var\(--surface-hover\)\]:hover { --tray-chip-fill: var(--surface-hover); }`, `.status-needs\:before\:bg-status-attn-bg[data-status="needs"]::before { background-color: var(--status-attn-bg); }`: the hover moves only the resting fill, so any tint a caller writes on the layer wins whatever the rule order (the old components-layer hover lost to every site utility the same way).
- `--c-menu-item-h: 32px;` and, under `@media (pointer: coarse)`, `--c-menu-item-h: 44px;`.

## Rendered check

`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev` (port 5291), one playwright-core session (cached Chromium 1248), `waitUntil: "domcontentloaded"`, 1440×900 and 390×844 (the phone as a coarse pointer: `hasTouch`, `isMobile`). The start sha ran the same way on port 5292 from a scratch checkout of 682ede287; every element's full computed style and `::before` was diffed.

| element (page) | 1440×900 | 390×844 coarse |
| --- | --- | --- |
| tray chip (/motion/delegate-tray, /motion/chosen-hover PlanRing pressed and unpressed) | rect equal [991.9,801,88.1,28]; 28px, r 8px, px 7px, gap 6px; `::before` raised fill, 1px hairline, z −1, tile shadow; pressed `::before` `oklch(0.854 0.014 82)` (surface-pressed) | rect equal, 34px (c-tray-chip's coarse mode) |
| dock shell (/motion/recall) | rect equal [474,850,720,50]; r 12px, 1px control edge, `blur(20px) saturate(1.6)`, fill at 72% | rect equal [11,794,368,50] |
| Send, disabled (/motion/recall) | rect equal 34×34, r 5px (12 − 7); opacity 0.55 → 0.5 (DESIGN.md) | same |
| menu item (/motion/overlays, dropdown opened) | rect equal [570,154,178,32], min-height 32px; the hover ghost lands on the row: ghost rect [570,154,178,32], opacity 1 (the highlight finds rows by `data-menu-item`) | rect equal [25,228,178,44], min-height 44px |
| option chips row + chip (/project/new) | rect equal; chip 30px, r 8px, px 11px, py 4px, gap 7px, label 13px/500 | rect equal; rows 14px apart (`--hit-gap-y: 14px` where the start computed `calc(7px * 2)`) |
| icon cards + card (/project/new) | rect equal [279,495,1110,296.1]; six 175.8px columns; card r 10px, padding 25/14/14 | two 175.5px columns where one 362px column stood (the content-driven grid; see Removed) |

Differences left on equal rects, each the same rendering: `border-0` leaves `border-style: solid` at width 0 where `border: 0` wrote `none`; a single `transition-duration` where the old rule listed one per property; Tailwind's composite `box-shadow` starts with four transparent layers before the same tile shadow (`oklch(0.295 0.01 70 / 0.07) 0px 1px 2px 0px, oklch(0.295 0.01 70 / 0.035) 0px 0px 0px 1px` at both).
Not rendered by any bench: /motion/lift (none of its parts mount without a hub), the section heads (task pane, home Recent need a hub), the nesting line (needs a tree), the mention and editor chips (need an editor with a mention), the edge fades (need overflow). Their recipes were proven by the compiled check above; their routes are the task pane (`/project/<id>` with a task open), the home (`/`), the rail, Find (⌘K) and the new-session dialog.

ui-observer (observer.browser.js, every page above, both sizes): no horizontal overflow (`scrollWidth` equals the viewport on every page); observations: /motion/overlays 1440 `sibling-padding-differs` 1 and `sibling-gaps-differ` 1, both the highlight's own absolutely placed `span.kit-ghost` measured as a row; /motion/delegate-tray 390 `near-miss-alignment` 36, transcript rows marked `not-data-shown:invisible` 1px off the sheet's edge, not this lane's parts; /motion/overlays 390 `near-miss-alignment` 1 (the bits popover at 18px vs its content at 19px).

## Design critique (interface-craft, against DESIGN.md)

- fixed: the option chip's hover now only reaches an enabled button under a hover-capable pointer: a disabled chip and a record span no longer hover, and a finger's tap no longer leaves a hover fill latched.
- fixed: the tray chip's hover can no longer paint over a status tint (needs you, failed, pressed): the hover moves the resting fill only, so "selection is not a warning" and the status pair hold at every pointer state.
- fixed: Send disabled at DESIGN.md's 50%.
- fixed: the icon-card grid holds its columns by its own width, so the cards never collapse to a single 362px column on a 390px phone while two 175px cards fit.
- fixed: the "add label" chip is the house option chip now, the same 11px inset and strong ink as every other chip beside the labels, instead of a one-off 4px-inset muted chip.

## Gaps

None left in this lane's files besides the ns-theme.css items pending the parent's answer (Sheet classes, above).
