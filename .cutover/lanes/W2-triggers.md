# W2-triggers: the kit triggers (Collapsible, CollapsibleTrigger, PopoverTrigger, DropdownMenuTrigger, ContextMenuTrigger, DrawerTrigger, SheetTrigger, DialogTrigger, AlertDialogTrigger)

Base: 682ede2877621d672bb0b38815e7d56370494dec. Paths from apps/dashboard unless they say otherwise.

## Skills
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions.dev (the sites carry colour and press transitions); interface-craft (Design Critique) and ui-observer before the report.

## Rules followed
- better-ui: transition only what changes (every variant names its properties: `transition-[color]`, `transition-[background-color]`, `transition-chip-settle`, `transition-control-press`; no `transition-all`). Press: compact controls scale (chip, state chip, count chip, Attach: `pressed:scale-(--press-scale)` under `motion-safe`), wide ones tint (`press-tint` on the heads, the folds and the usage strip), as DESIGN.md's Press Rule says. Hover only where it exists (Tailwind 4's `hover:` is under `(hover: hover)`).
- better-layout: one spacing step per gap from the ladder (`gap-space-1`, `gap-space-2`, `px-space-2`), never a hand-kept number; a trigger's placement (its margin, its share of a flex row, its width cap) stays on the site, its look moves into the part.
- Tailwind v4.3.3: states are attributes (`data-fail`, `data-warn`, `data-critical`, `data-compacting`, `aria-expanded`) read by native `data-*:`/`aria-*:` variants and `not-*`; no `!`, no arbitrary colours.
- A trigger that wears a kit look is that kit part: the overlays bench's triggers render the kit Button through bits-ui's `child` snippet (`{#snippet child({ props })}<Button {...props} …>`; bits-ui 2.19.5 `collapsible-trigger.svelte`: `{#if child}{@render child({ props: mergedProps })}`), and the dropdown's through its own `variant`/`size`.

## Variants (variant → role → DESIGN.md line → sites)
| Part | Variant | Role | DESIGN.md | Sites |
| --- | --- | --- | --- | --- |
| CollapsibleTrigger | `look="head"` | a disclosure head, 26px, 44px on a coarse pointer; tints on press | 863 "Subagent: a disclosure head (26px, 44px on a coarse pointer)"; 736 The Press Rule ("card heads … tints") | transcript/Subagent.svelte:81, transcript/Delegate.svelte:428, components/features/tool-cards/MemoryBody.svelte:231 |
| CollapsibleTrigger | `look="note"` | a rail note's fold, inline on the rail's edges in the note's ink, a woke-Caw note's included | 643 Transcript columns; 627 The Mark Line Rule ("rail lines") | transcript/SystemLine.svelte:207, transcript/SystemLine.svelte:490 |
| CollapsibleTrigger | `look="fold"` | a fold's toggle: words and turning chevron, muted, strong under the pointer | 712 "A fold's toggle shows it is open by its words and its flipped chevron" | move/MoveAsk.svelte:27, tasks/TaskActivity.svelte:316, components/features/DirectoryPicker.svelte:181 |
| CollapsibleTrigger | `look="chevron"` | a row's trailing chevron alone | 863 ("a chevron that rotates 90° over 120ms") | transcript/Peer.svelte:188 |
| CollapsibleTrigger | `look="opener"` | a list row's name that opens it, its press covering the row | 929 The One Ring Rule (rows carry the ring inset) | views/ViewRoutines.svelte:735 |
| PopoverTrigger | `look="chip"` | a setting chip, the option chip's recipe (`kit-chip`) | 913 "Setting chips are 30px with an 8px radius"; 907 option chips | config/PickerChip.svelte:47 |
| PopoverTrigger | `look="state"` | a state chip that opens what it reports; `data-fail` takes the fail pair | 751 "Badges and state chips" | config/RolloutChip.svelte:116 |
| PopoverTrigger | `look="count"` (with `badge`) | a count drawn on the Badge, opening what it counts | 722 The Earned Count Rule; 752 Badge | usage/SessionsChip.svelte:174 |
| PopoverTrigger, DrawerTrigger | `look="strip"` / `"strip-home"` | the usage strip, one height whatever it says, its own ground under the pointer or open | 736 The Press Rule ("the usage meter"); 771 Usage popover | UsageMeter.svelte:1104 (Drawer), UsageMeter.svelte:1123 (Popover) |
| PopoverTrigger | `look="meter"` | the composer's context meter, glyph and figure; `data-warn`/`data-critical`/`data-compacting` take their inks | 815 "its context meter" | ContextMeter.svelte:99 |
| DropdownMenuTrigger | `look="attach"` | the composer's Attach | 868 "34px Attach (raised, control edge) … concentric 5px radius. They scale to 0.97 on press" | transcript/AttachButton.svelte:56 |
| DropdownMenuTrigger | `face="title"` (now with `mark-line min-w-0`) | a pane head's title, glyph and chevron on its words' line | 627 The Mark Line Rule; The Role, Not Size Rule | preview/ArtifactMenu.svelte:220 |
| DropdownMenuTrigger | `face="count"` | a glyph and the count it holds, on one line (a pane head's More) | 627 The Mark Line Rule | side/SideSurface.svelte:418 |
| DropdownMenuTrigger | `variant="outline" size="sm"` (existing) | the kit Button | 726-727 Buttons: `sm` 30px, Outline | routes/(app)/motion/overlays/+page.svelte:162 |
| ContextMenuTrigger | `box="none"` | a menu over what it wraps: the trigger draws no box (`display: contents`) | 815 "the head is a context menu"; 918 "the row is the session menu's trigger" | FolderMenu.svelte:84, MachineMenu.svelte:130, PeekPane.svelte:274, workspace/PaneTabs.svelte:1623 |
| Sheet/Dialog/AlertDialog/Drawer/PopoverTrigger | kit Button via `child` | the kit Button, outline `sm` | 726-727 Buttons | routes/(app)/motion/overlays/+page.svelte:82, :102, :120, :142, :177 |

PopoverTrigger's `motion` variant (`press`, `settle`) is deleted: its two users (PickerChip, RolloutChip) now take `chip` and `state`, which carry their transitions.

## Kit swaps
kit-swap: src/lib/cawco/move/MoveAsk.svelte:27 CollapsibleTrigger fold — done
kit-swap: src/lib/cawco/tasks/TaskActivity.svelte:316 CollapsibleTrigger fold — done
kit-swap: src/lib/cawco/transcript/Delegate.svelte:428 CollapsibleTrigger head — done
kit-swap: src/lib/cawco/transcript/Peer.svelte:188 CollapsibleTrigger chevron — done
kit-swap: src/lib/cawco/transcript/Subagent.svelte:81 CollapsibleTrigger head — done
kit-swap: src/lib/cawco/transcript/SystemLine.svelte:207 CollapsibleTrigger note — done
kit-swap: src/lib/cawco/transcript/SystemLine.svelte:490 CollapsibleTrigger note — done
kit-swap: src/lib/cawco/views/ViewRoutines.svelte:735 CollapsibleTrigger opener — done
kit-swap: src/lib/components/features/DirectoryPicker.svelte:181 CollapsibleTrigger fold — done
kit-swap: src/lib/components/features/tool-cards/MemoryBody.svelte:231 CollapsibleTrigger head — done
kit-swap: src/lib/components/features/DirectoryPicker.svelte:180 Collapsible (root) default — done
kit-swap: src/lib/cawco/ContextMeter.svelte:99 PopoverTrigger meter — done (the four tone classes at the old :105-:109 are its data-warn/data-critical/data-compacting states)
kit-swap: src/lib/cawco/UsageMeter.svelte:1123 PopoverTrigger strip/strip-home — done
kit-swap: src/lib/cawco/config/PickerChip.svelte:47 PopoverTrigger chip — done
kit-swap: src/lib/cawco/config/RolloutChip.svelte:116 PopoverTrigger state — done
kit-swap: src/lib/cawco/usage/SessionsChip.svelte:174 PopoverTrigger count — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:177 PopoverTrigger kit Button (child) — done
kit-swap: src/lib/cawco/blocks/BlockPage.svelte:326 DropdownMenuTrigger ghost sm (existing) — done
kit-swap: src/lib/cawco/preview/ArtifactMenu.svelte:220 DropdownMenuTrigger face title — done
kit-swap: src/lib/cawco/side/SideSurface.svelte:418 DropdownMenuTrigger face count — done
kit-swap: src/lib/cawco/transcript/AttachButton.svelte:56 DropdownMenuTrigger attach — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:162 DropdownMenuTrigger outline sm — done
kit-swap: src/lib/cawco/FolderMenu.svelte:84 ContextMenuTrigger box none — done
kit-swap: src/lib/cawco/MachineMenu.svelte:130 ContextMenuTrigger box none — done
kit-swap: src/lib/cawco/PeekPane.svelte:274 ContextMenuTrigger box none — done
kit-swap: src/lib/cawco/workspace/PaneTabs.svelte:1623 ContextMenuTrigger box none — done
kit-swap: src/lib/cawco/UsageMeter.svelte:1104 DrawerTrigger strip/strip-home — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:142 DrawerTrigger kit Button (child) — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:82 SheetTrigger kit Button (child) — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:102 DialogTrigger kit Button (child) — done
kit-swap: src/routes/(app)/motion/overlays/+page.svelte:120 AlertDialogTrigger kit Button (child) — done

34 of 34 sites in W2-triggers-sites.md (the five ContextMeter lines are one trigger).

## Removed
removed: every site above `bg-transparent border-none border-current p-0 px-0 py-0 text-inherit` — Tailwind 4.3 Preflight already gives a button `background-color: transparent`, `border: 0 solid`, `padding: 0` and `color: inherit`; the same declaration twice.
removed: src/lib/cawco/transcript/SystemLine.svelte:207 and :490 `text-ink-muted text-size-label font-medium` on the trigger — the note's own div sets all three and the button inherits them (Preflight `font: inherit; color: inherit`).
removed: src/lib/cawco/transcript/SystemLine.svelte:484-490 and :536-542 the woke-Caw note's 1px dashed control-edge box (the trigger's `edge="code"` variant, deleted from collapsible-trigger.svelte, and the plain span's `group-data-code/note:px-space-2 …border-dashed…rounded-xs` at the old :558), its `group/note` and `data-code` markers, its `rail-place` switch and its comments at the old :193-194 and :485-487 — nothing backs it: it came in with c23399e8d ("Caw threads in the rail and as session tabs", an agent's commit) citing "design §1, SystemLine", which neither DESIGN.md nor the Projects PRD contains (grepped for dashed/woke/code); the owner: "There were many gaps in the old system layout and style wise / So I hope ur not bringing over scar tissue". A woke-Caw note is now a rail note as every other SystemLine note is (`rail-row`, `look="note"`; DESIGN.md 643, Transcript columns). The span at :542 also drops `text-size-label font-medium text-ink-muted`, which its note div sets.
removed: src/lib/cawco/transcript/Delegate.svelte:428 `coarse:min-h-c-row-h` — a disclosure head is 44px on a coarse pointer by the button's token (`c-btn-h-lg`, Subagent's), the same 44px; one head, one recipe (DESIGN.md 863).
removed: src/lib/cawco/move/MoveAsk.svelte:27 `min-h-space-7` — a fold's height comes from its words and `py-space-1`, not a ladder step used as a height.
removed: src/lib/cawco/tasks/TaskActivity.svelte:316 `rounded-sm` → the fold's `rounded-xs`, one corner for every fold (DESIGN.md 679, 5px for marks).
removed: src/lib/components/features/DirectoryPicker.svelte:180 `flex flex-col` on the Collapsible root and `self-start` on its trigger — a block root lays the inline-flex trigger at its start and the content under it already; `text-meta` and `gap-1.5` (off the ladder) → the fold's label type and `gap-space-1`; `transition-colors` → `transition-[color]` (better-ui: transition only what changes).
removed: src/lib/cawco/ContextMeter.svelte:99 `hover:bg-neutral-2` → `hover:bg-surface-hover` (DESIGN.md 727, every control's hover is `surface-hover`; a raw ramp step is not a role); `h-7` → `h-c-bar-item` (28px, the compact control token); `gap-1.5`/`px-1.5` (6px, off the ladder) → `gap-space-2`/`px-space-2` (7px, the nearest step); the class-list ternary of inks → data attributes.
removed: src/lib/cawco/UsageMeter.svelte:1104, :1123 `state-open:bg-surface-hover state-open:ring-ground-surface-hover` — duplicates of `aria-expanded:` (bits-ui's Popover and Dialog triggers set both together); `group-variant-home/strip:*` → the role's own `strip-home` value, set from `variant` (the group stays for UsageMeter.svelte:493).
removed: src/lib/cawco/config/PickerChip.svelte:47 `max-w-full` — `kit-chip` sets `max-inline-size: 100%` itself; `motion-safe:active:scale-(--press-scale)` → `pressed:` (the house variant, `:active` or `[data-pressed]`).
removed: src/lib/cawco/config/RolloutChip.svelte:116 `transition-[background-color,color] dur-panel ease-out` plus `motion="settle"` — one declaration, `transition-chip-settle` (the token's own role: "a rollout's state chip").
removed: src/lib/cawco/blocks/BlockPage.svelte:326 `mark-line touch-hit` — both are in the trigger's base and in `buttonVariants`' base.
removed: src/lib/components/ui/context-menu/context-menu-trigger.svelte `"select-none"` literal → the recipe's `base`.
removed: src/lib/components/ui/popover/popover-trigger.svelte `motion` variant (`press`, `settle`) — no caller left.

## Tokens
None.

## Theme additions
None.

## Compiled check
No theme addition, so no `compile()` block of mine. The new variant classes were built with the repo's `@tailwindcss/node` 4.3.3 `compile()` over src/app.css, `build([...])`; each one emits, e.g.
`.data-warn\:not-data-critical\:not-data-compacting\:text-warning-9[data-warn]:not([data-critical]):not([data-compacting]) { color: var(--warning-9); }`,
`.data-critical\:not-data-compacting\:text-error-9[data-critical]:not([data-compacting]) { color: var(--error-9); }`,
`.data-compacting\:text-ink-strong[data-compacting] { color: var(--ink-strong); }` (the three are exclusive by their `:not()`s, so no order decides between them),
`.motion-safe\:pressed\:scale-\(--press-scale\):is(:active, [data-pressed]) { scale: var(--press-scale); }`,
`.h-c-bar-item { height: var(--c-bar-item); }`, `.min-h-c-mark { min-height: var(--c-mark); }`, `.coarse\:min-h-c-btn-h-lg { min-height: var(--c-btn-h-lg); }`,
`.aria-expanded\:ring-ground-surface-hover[aria-expanded="true"] { --ring-ground: var(--surface-hover); }`, `.after\:inset-0::after { content: var(--tw-content); inset: 0px; }`, `.contents { display: contents; }`,
`.group-inert\/ctrls\:not-aria-invalid\:border-border-button-outline:is(:where(.group\/ctrls):is([inert], [inert] *) *):not([aria-invalid="true"]) { border-color: var(--border-button-outline); }`. Scratch folder deleted.

## Rendered check
`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev --port 5391`, one playwright-core session (cached Chromium 1248), `waitUntil: "domcontentloaded"`, 1440×900 and 390×844.
- /motion/overlays, the six triggers (Sheet, Dialog, Alert dialog, Drawer, Dropdown menu, Popover) at both widths: the kit Button outline `sm`, `height: 30px`, `padding-inline-start: 11px`, `border-radius: 10px`, `border-top: 1px solid` (`border-button-outline`), `font-size: 13px`, `font-weight: 500`, raised fill: DESIGN.md 726 ("`sm` is 30px at the label size with 11px padding", 10px radius). Keyboard (1440): focus + Enter opened every one: `{"expanded":"true","state":"open","controls":"bits-c35"}` (sheet), `bits-c37` (dialog), `bits-c39` (alert dialog), `vaul-svelte-2` (drawer), `bits-c42` (dropdown), `bits-c43` (popover); Escape closed each. Tab focus: `outline-style: solid; outline-width: 2px; outline-offset: 2px; :focus-visible true` (The One Ring Rule).
- /motion/usage-relay, the usage strip: 1440 `look="strip"` `44 × 211`, `border-radius: 8px`, `padding-inline-start: 11px`, `cursor: pointer`; 390 `look="strip-home"` `56 × 368`, `border-radius: 10px`, `padding-inline-start: 14px`. Keyboard Enter opened it: `aria-expanded="true"`, `data-state="open"`.
- Not rendered by any bench or route in this list (no hub behind the dev server): the transcript heads (Subagent, Delegate, SystemLine, Peer, MemoryBody: a session page's transcript, `/s/<id>`), ContextMeter and AttachButton (the composer on a session page), PickerChip and RolloutChip (the configure pages), SessionsChip (the usage page, `/usage`), ArtifactMenu and SideSurface's More (the preview pane beside a session), ViewRoutines (the routines view), the four context-menu wrappers (the rail's folder and machine rows, the peek's head, a session tab), MoveAsk, TaskActivity and DirectoryPicker. /motion/delegate-tray and /motion/side-head render without `[data-bhead]`, `[data-slot="more"]` or `[data-artifact-trigger]`. Each of these is covered by build, typecheck, svelte-check and eslint, not by a live read.

- ui-observer (`observer.browser.js` `__uiObserver`, same session, after a fresh server start): /motion/overlays `[data-slot="openers"]` 7 observations at each width: `sibling-padding-differs` (every trigger `[0,11,0,11]`; the odd one out is the Select trigger, not this part), `sibling-gaps-differ` (`[7,7.1,7,7,6.9,7,7]` at 1440 = `space-2`; at 390 `-30` entries are wrapped rows), `near-miss-alignment` ×4 all inside `#bits-c20`/`#bits-c10` (the Select trigger's trimmed words against its 16px glyph, The Mark Line Rule's x-height centring). /motion/usage-relay `[data-slot="strip"]`: 14 (1440) and 26 (390) `near-miss-alignment`, all inside the strip's face rows (`span.h-c-usage-strip-row`), none on the trigger's own box. No overflow, no clipped text, no small tap target on any trigger of this part.

## Design critique (interface-craft) and findings
fixed: src/lib/cawco/ContextMeter.svelte:99 the meter's hover drew `neutral-2`, a ramp step no other control uses — now `surface-hover`, as every control's (DESIGN.md 727).
fixed: src/lib/components/features/tool-cards/MemoryBody.svelte:231 a doc row that opens its body gave no press feedback — the head's `press-tint` (DESIGN.md 736, rows tint); its strong ink moved onto its path's own span (:236), the date and chevron keep theirs.
fixed: src/lib/components/features/DirectoryPicker.svelte:181 Browse was a meta-size fold among label-size folds — one fold recipe, label type (DESIGN.md 712).
fixed: src/lib/cawco/UsageMeter.svelte:1104 the strip's open state was written twice (`aria-expanded:` and `state-open:`) — once.
fixed: src/lib/cawco/transcript/Delegate.svelte:428 and Subagent.svelte:81 two disclosure heads with two coarse heights tokens — one head.
fixed: src/lib/cawco/UsageMeter.svelte:1104, :1123 no defect: the strip's `transition-property: none` read in the first check was the theme flip's own suppression, `:root[data-theme-flip], :root[data-theme-flip] * { transition: none }` (app.css:466-469, layer `overrides`, matched by CDP `CSS.getMatchedStylesForNode` with `data-theme-flip` set; theme.svelte.ts:81 sets the attribute while the theme applies and :78 removes it). Sampled every 50ms from load: 1440 `0ms flip=true tp=none | 51ms flip=false tp=background-color`; 390 `0ms flip=true tp=none | 100ms flip=false tp=background-color`. Without the flip the only transition rules matched are `.transition-\[background-color\]` (`transition-property: background-color`), `.dur-control` and `.ease-out`, all in `utilities`. The recipe holds; nothing changed.
removed: apps/dashboard/src/app.css:4411-4416 `@utility rail-place` and its comment ("A row's place in the transcript's stack…") — its last user was the woke-Caw note's `rail-place` switch in SystemLine.svelte, which this lane removed; dead code goes with the change that killed it (`git grep -n "rail-place" -- apps/dashboard/src` returns nothing).

The relic gate's app.css overrides (Streamdown, virtua) are sanctioned in scripts/relics-check.ts, and the replaced gates read only present files under apps/dashboard/src, so neither is a gap. The Button's cursor is the parent's, for the owner.

Counts: kit-swap 31 lines (34 sites), removed 16, fixed 6, gap 0, token 0, theme 0.
