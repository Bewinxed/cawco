# L00-kit-sheets

Skills loaded (Skill tool): defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev; before the report: interface-craft, ui-observer.

better-ui rules followed: transition only what changes (wf-btn names `background-color, transform`, never `all`); hover only on hover-capable pointers (every hover in both sheets under `@variant can-hover`); gate motion behind the reduced-motion preference (every motion rule under `@variant motion-safe`); disabled never scales (`:not(:disabled, [aria-busy])` kept on both presses).
better-layout rules followed: logical sizing kept on tokens (no fixed literal widths: popover caps, margins and floors are named tokens); hold structure until it breaks (breakpoints are the theme's `max-phone` / `max-wide` / `coarse`, never raw queries); plan for growth (the popover's `min(…, 100vw - margins)` caps kept, so a long row shrinks rather than overflows).

Base: f5c5024ab (cawco/cutover-merge). Files: 5 of 5 done (theme.css unchanged by design: generated).

| file | what changed | residuals | literals left | breakpoint edges | STOPs |
| --- | --- | --- | --- | --- | --- |
| apps/dashboard/eslint.config.mjs | no-restyle allow-lists cut to one placement-only list; the triggers/Pane contract deleted | n/a (not Svelte) | 0 | none | none |
| apps/dashboard/src/app.css | 9 `!important` declarations and 3 comments naming it gone; new last layer `overrides` | n/a | 0 | none (`max-phone` = `width < 640px`, as written) | none |
| apps/dashboard/src/lib/cawco/spawn/ns-theme.css | K1, K2 removed; K3 into `ns-pop`; px literals to tokens; every `@media` to a theme variant | n/a | 0 | `(max-width: 640px)` → `max-phone` (`width < 640px`): 640px itself now takes the desk popover | none |
| apps/dashboard/src/lib/components/features/workflows/workflows.css | element rules into `@layer components`; px literals to tokens; `@media` to variants; X1, X2, filter hover removed | n/a | 0 | `(max-width: 1023px)` → `max-wide` (`width < 1025px`, theme.css `--breakpoint-wide: 1025px`): 1023–1024px now take the touch sizes | none |
| apps/dashboard/src/lib/tokens/theme.css | unchanged (generated); every change goes through `token:` lines below | n/a | 0 | none | none |

The residual and ESLint lane gates are Svelte tools: they report "does not parse" / "File ignored because no matching configuration was supplied" for `.css` and `.mjs`, the same on the base commit. These files are proven by Prettier (`bun scripts/fmt.ts --check`), Biome, and the Tailwind compile (`vite build`), whose output was read (below).

## Allow-list (shadcn/no-restyle, every kit part, triggers and Pane included)

The one policy: `"shadcn/no-restyle": ["error", { allow: PLACEMENT }]`. `layout` is dropped: in @shadcn/lint 0.2.1 it is every class group with no category (`categoryOf(group) ?? "layout"`, dist/index.js 3595), which holds display, overflow, cursor, whitespace, transforms, appearance, select, text alignment, all of which change a part's look.

- `m`, `mx`, `my`, `ms`, `me`, `mbs`, `mbe`, `mt`, `mr`, `mb`, `ml`: margin, its distance from the parts beside it.
- `basis`, `grow`, `shrink`, `flex-1`, `flex-auto`, `flex-none`, `flex-initial`: its share of a flex row (exact classes, not the `flex` group, which would also admit `display: flex`).
- `order`: its place in a flex or grid track.
- `align-self`, `justify-self`, `place-self`, `self-box-*`, `justify-self-box-*`: its own alignment in its parent's track (app.css's exact-keyword self alignments included).
- `col-start-end`, `col-start`, `col-end`, `row-start-end`, `row-start`, `row-end`: its grid placement.
- `position`, `inset`, `inset-x`, `inset-y`, `start`, `end`, `inset-bs`, `inset-be`, `top`, `right`, `bottom`, `left`: its position and inset in its container.
- `z`: its stacking.
- `w`, `min-w`, `max-w`, `inline-size`, `min-inline-size`, `max-inline-size`: its width constraints.
- `group`, `peer`: markers a descendant or sibling reads; they style nothing (`peer` is no class group, so shadcn/lint warns once that it matches by name, `peer` and `peer/<name>`; it covers 8 sites, NeedsCard's answer Buttons and Prompt's Kbd).
- `touch-hit`, `pointer-hit`: the hit areas, a transparent `::after` round the part that draws nothing (DESIGN.md, The 44 Touch Rule, The 24 Pointer Rule).

Dropped from the old HOUSE list, each a look: `num` (figures), `mark-line` (draws a line), `focus-inset` (the ring's offset), `press-tint` (the press). Dropped from the triggers' list: every category (`color`, `typography`, `spacing`, `shape`, `effects`, `motion`), `pressable`, `rail-line`, `transition-control`, `type-*`, `dur-*`, `p-*`, `px-*`, `py-*`, `gap-*`, `h-*`, `min-h-*`, `items-box-*`, `content-box-*`. `min-w-*` stays as the `min-w` group.

ESLint over the dashboard (`cd apps/dashboard && bunx eslint .`): 258 problems before (no-restyle 72, no-unknown-classes 136, no-arbitrary-values 28, no-inline-styles 18, require-static-classes 2, variant-order 2); 1038 after (no-restyle 852, the rest unchanged). +780 no-restyle across 117 files, most on TableCell 148, CollapsibleTrigger 133, PopoverTrigger 88, Skeleton 59, Button 54, TableHead 51. The no-restyle rise is the work integration owes: each new site is a look on a kit part that becomes that part's variant (L01–L05) and a `kit-swap:` at its site.

## Variants

variant: apps/dashboard/src/lib/components/ui/drawer/drawer-content.svelte:147 DrawerContent closing pointer-events — while its `data-state` is `closed`, the kit writes `pointer-events: none` on the content node itself (vaul/bits-ui write `pointer-events: auto` inline on it, which no stylesheet rule outranks without `!important`; the existing `mirror` effect on `data-state` is where it goes), so a closing sheet lets presses through. Replaces app.css's removed `[data-slot="drawer-content"][data-state="closed"] { pointer-events: none !important }`.
variant: apps/dashboard/src/lib/components/ui/drawer/drawer-overlay.svelte:20 DrawerOverlay closing pointer-events — the same for the scrim (this file is on no lane's list: integration's).

No variant for K1, K2 or K3: each contradicted DESIGN.md's recipe for the part it restyled (Removed, below).

## Removed

removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:97 K1 `.ns-theme button:where([data-slot="button"], [data-slot="collapsible-trigger"]) { font: inherit; color: inherit; transition }` — the kit Button's own recipe is the target (DESIGN.md, Buttons: `sm` at the label size, outline in strong ink, primary in `on-action`); K1 put a primary Button (SigninPanel:81, KeyPanel:225 when primary) in the surface's ink on coral and every `sm` Button in the body role. Its transition was the kit's own `press: scale` transition. No collapsible trigger renders in an ns surface.
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:113 K2 `.ns-theme input:where([data-slot="input"], [data-slot="input-group-control"])::placeholder { color: var(--ink-subtle) }` — DESIGN.md, Inputs and fields: "muted placeholder", which the kit Input draws (`placeholder:text-ink-muted`).
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:121 K3 `@media (max-width: 640px) { .ns-theme.ns-pop button { min-height: 44px } }` as a carve-out — moved into the `ns-pop` utility and keyed to the touch rule (fixed, below).
removed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:349 `ns-chip-btn`'s static hover rule `&[data-variant="static"]:hover { background: var(--surface-recess) }` — it existed only to cancel the chip hover; the hover now excludes a static chip (DESIGN.md, New-session dialog: a static chip has "no hover").
removed: apps/dashboard/src/app.css:407 `font-size: max(16px, 1em) !important` — fought every utility and kit recipe on a field; now a normal declaration in the last layer, `overrides`, which outranks every utility by layer.
removed: apps/dashboard/src/app.css:910 `animation-play-state: paused !important` — fought the loops' own animation utilities (a shorthand resets play-state); `overrides` outranks them. Inline `animation` strings (list swaps) are one-shots, not loops.
removed: apps/dashboard/src/app.css:1808 `pointer-events: none !important` on a closing drawer's content and overlay — fought vaul/bits-ui's inline `pointer-events: auto`, which only the kit's own inline value replaces (Variants, above).
removed: apps/dashboard/src/app.css:1820 `body[data-drawer~="closed"] { pointer-events: auto !important }` — fought bits-ui's inline body lock; now `:where(body[data-drawer~="closed"]) > * { pointer-events: auto }`: `pointer-events` is inherited and an `auto` descendant is hit under a `none` ancestor, so the page takes presses again with no override of the inline style.
removed: apps/dashboard/src/app.css:1944 `animation: none !important` on a hidden swap slot's descendants — fought the spinner's animation utility; `overrides` outranks it.
removed: apps/dashboard/src/app.css:2710 and :2712 `field-underline`'s `border-bottom-color` / `box-shadow` `!important` — the strip's border is now a utility (`border-b-border-hairline`, ModelSection:358), and `field-underline`'s `:has(…:focus-visible)` selector ((0,2,1)) outweighs it ((0,1,0)) in the same layer.
removed: apps/dashboard/src/app.css:2727 `num`'s `tabular-nums !important` — fought SideSurface's unlayered `font: inherit`; the shorthand's utility (`font-inherit`, `--tw-sort: vertical-align`) sorts before `num`, so `num` wins by order once that file's lane converts it (gap below).
removed: apps/dashboard/src/app.css:2988 `transition: none !important` under `.theme-flip` — fought every transition utility; `overrides` outranks them.
removed: apps/dashboard/src/app.css:399, :2132, :2270 comments naming `!important` reworded (the relic gate reads them).
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css:45 X1 `.wf label:where(:not(.wf-check))` exclusion — with the element rule in `@layer components`, the `wf-check` utility outranks it by layer.
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css:65 X2 `.wf textarea:where(:not(.wf-mono))` exclusion — the same, for `wf-mono`.
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css:139 and :140 `wf-btn[aria-pressed="true"]`'s `border-color` / `color` — the same values as the base rule (duplicates).
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css:145 W2 `filter: none` and :149 `filter: brightness(0.96)` hover — a filter standing in for the hover surface; the hover is now `surface-hover` (DESIGN.md, Buttons: "hover to `surface-hover`"; ghost "transparent until hovered").
removed: apps/dashboard/src/lib/components/features/workflows/workflows.css:269 the `.wf` fields' `font-size: 16px` under `(max-width: 1023px), (pointer: coarse)` — a second copy of app.css's field type floor (`overrides`, phone and coarse), which is where the floor lives.

## Tokens

token: --c-pop-w 320px — a new-session popover's width (NsPopover's `--ns-pop-width` fallback); a component dimension, no ladder step.
token: --c-pop-max-h 440px — a popover's height cap on a desk; component dimension.
token: --c-pop-max-h-phone 420px — a popover's height cap under 640px; component dimension.
token: --c-screen-margin 12px — the screen's margin a phone popover keeps each side (DESIGN.md, Breakpoints: "popovers widen to the viewport less 24px"; "the screen's 12px margin" throughout); `--c-bar-phone-edge` is the same value with another role.
token: --c-btn-gap 8px — a button's icon-to-label gap (DESIGN.md, Buttons: "an 8px gap"), named so ns-btn and the kit read one value; 8 is off the ladder by design.
token: --c-scrollbar-thin 8px — the thin WebKit scrollbar's thickness in a new-session scroller (`fai-scroll`); component dimension.
token: --c-comb-pitch 6px — the tick pitch of the effort comb (`fai-comb`), a drawn pattern, not spacing.
token: --c-wf-textarea-min 90px — a workflow form's textarea floor; component dimension.
token: --c-pointer-floor 24px — the 24 Pointer Rule's floor (DESIGN.md, Focus and hit areas): the workflow checkbox and Svelte Flow's attribution link.

## Theme additions

None. The sheets' keyframes (`ns-in`, `ns-check`, `ns-panel`, `ns-pop-in`, `ns-pop-out`) stay global in ns-theme.css: their utilities set per-element duration and delay variables (`--ns-row-ms`, `--delay`) that an `--animate-*` theme value cannot take per element, and the list swap's keyframes in app.css are named from script-built inline strings, which no `animate-*` utility emits.

## Kit swaps

None in these files (no kit part is rendered by a stylesheet).

## Contracts

None.

## fixed

fixed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:382 K3 is part of the `ns-pop` utility: under a coarse pointer every row button in a popover (not a kit Button) is `min-height: var(--c-nav-h)` (44px on touch) — DESIGN.md, The 44 Touch Rule ("Menu items and nav rows are 44px tall on touch"; a control's "drawn size and the layout stay the same", reaching 44 through `.touch-hit`, which the kit Button carries). It was keyed to a 640px width and hit kit Buttons too.
fixed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css ns-btn height 36px → `--c-btn-h`, sm 30px → `--c-btn-h-sm`, xs 28px → `--c-btn-h-sm` (DESIGN.md: xs is "a button at chip scale", chips are 30px), padding 14/11/8px → `--space-4`/`--space-3`/`--space-2`, gaps 7/6px → `--space-2`, `--btn-icon` 16px → `--icon-md`, letter-spacing −0.01em → `--track-title`, disabled opacity 0.55 → 0.5 (DESIGN.md, Buttons: "Disabled: 50% opacity").
fixed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css ns-chip-btn gap 6px and padding 8px → `--space-2`, height 30px → `--c-btn-h-sm`, chevron 12px → `--icon-sm`, its glyph 16px → `--icon-md` (DESIGN.md, New-session dialog: "30px … a 16px glyph and a 12px chevron").
fixed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css ns-pop padding 6px → `--space-2`, the desk margin 32px → `--space-8`; ns-morph's clip margin 4px → `--space-1`; fai-comb's height 14px → `--space-4` (DESIGN.md, Layout: the spacing ladder).
fixed: both sheets: every `@media (prefers-reduced-motion: no-preference)` → `@variant motion-safe`, `(hover: hover)` → `@variant can-hover` (the house's hover guard, `(hover: hover) and (pointer: fine)`), `(max-width: 640px)` → `@variant max-phone`, `(max-width: 1023px), (pointer: coarse)` → `@variant max-wide` plus `@variant coarse` (https://tailwindcss.com/docs/functions-and-directives#variant-directive).
fixed: apps/dashboard/src/lib/components/features/workflows/workflows.css wf fields, select and wf-btn 36px → `--c-input-h` / `--c-btn-h`, 44px → `--c-btn-h-lg`, wf-check 36px → `--c-input-h`, `--btn-icon` 16px → `--icon-md`.
fixed: apps/dashboard/src/lib/components/features/workflows/workflows.css wf-btn's transition names `background-color` with `transform` (the hover surface now changes on `--dur-control`, DESIGN.md, Buttons: "hover and colour changes take 120ms").
fixed: apps/dashboard/src/lib/components/features/workflows/workflows.css the element rules (headings, labels, fields, the disabled button, pre) sit in `@layer components`, so a kit control inside `.wf` draws its own recipe instead of the sheet's.
fixed: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:74 a raw input's placeholder in the dialog `--ink-subtle` → `--ink-muted` (DESIGN.md, Inputs and fields: "muted placeholder"), the same ink as the kit Input's.

## Measured (computed styles in a headless Chromium on `vite dev`, the nine `token:` values above injected at runtime as integration will define them)

Bench `/motion/signin-problem` (an `.ns-pop` holding SigninPanel's kit Buttons and Input), desk 1280 fine / phone 375 coarse:
- popover: width 340px (`--c-signin-pop-w`) / 351px (375 − 2 × `--c-screen-margin`); padding 7px both; max-height none on the desk (no bits-ui available-height outside a real popover, as before) / 420px.
- kit Buttons (K1 gone): font-size 13px (`--text-label`), weight 500, height 30px at both, so a coarse pointer keeps the drawn size; the outline one's colour `oklch(0.295 0.01 70)` = `--ink-strong`, the primary's `oklch(1 0 0)` = `--on-action` on its gradient.
- kit Input: placeholder `oklch(0.495 0.014 74)` = `--ink-muted` (K2 gone); font-size 14px / 16px (the `overrides` floor over the kit's text utility).
- `overrides`: an `animate-spin` under `data-at-rest` → `animation-play-state: paused`; a kit Button under `.theme-flip` → `transition-property: none`.

Injected into the bench (no bench renders these): a raw row button in the `.ns-pop` → min-height auto, 20px tall / min-height 44px, 44px tall (K3 in `ns-pop`); a `.wf` block → label `flex-direction: column`, `wf-check` row (X1 safe to drop), a `wf-mono` textarea in JetBrains Mono (X2 safe to drop), input and select 36px / 44px, textarea min-height 90px, checkbox 24px, `wf-btn` 36px / 44px tall and min-width 0 / 44px, radius 8px, `transition-property: background-color, transform`, quiet background transparent, disabled opacity 0.5.

## Gaps

gap: apps/dashboard/src/lib/cawco/spawn/ns-theme.css:217 `ns-btn` is a per-component re-implementation of the kit Button (its own comment: "DS Button (§5.1)") — DESIGN.md, Buttons; its sites in spawn/ should swap to `<Button>` with the matching variant and size, and the utility go.
gap: apps/dashboard/src/lib/components/features/workflows/workflows.css `wf-btn` / `wf-primary` re-implement the kit Button (outline, ghost via `data-variant="quiet"`, primary) — DESIGN.md, Buttons; sites should swap to `<Button>`.
gap: apps/dashboard/src/lib/components/features/workflows/workflows.css wf-btn and wf fields grow their drawn size to 44px under a finger — DESIGN.md, The 44 Touch Rule keeps the drawn size and reaches 44 through `.touch-hit`; resolving it is the Button swap above.
gap: apps/dashboard/src/lib/cawco/side/SideSurface.svelte:472 `.side-head`'s unlayered `font: inherit` resets `num` on PreviewPane's Comments button until that lane converts it to `font-inherit` (app.css:2727 `num` no longer `!important`).
gap: apps/dashboard/src/app.css `overrides` outranks every layer, not unlayered rules: a loop still in a Svelte `<style>` block (thinking-indicator, thinking-step, CompactionDivider, LiveDot and the `breath` users) is held by `data-at-rest` / `data-offscreen` / hidden swap slots only once its lane moves it to a utility (delta T2).

## Design Critique (interface-craft), from the sheets' rules against DESIGN.md

fixed: a primary kit Button in an account popover drew `ink-strong` on coral (K1) — now `on-action`, the primary recipe.
fixed: kit `sm` Buttons in popovers drew in the body role over their label size (K1) — now the `sm` recipe, so a popover's actions match the same Button everywhere.
fixed: a static setting chip carried a hover rule that cancelled itself — now it has none, as the recipe says.
fixed: popover rows were 44px only by window width, so an iPad (coarse, wide) got 32px rows under a finger — now 44px on every touch screen, and a narrow desktop window keeps its pointer density.
fixed: ns-btn's xs is the chip-shaped button its comment names ("a button at chip scale, for actions that sit among chips"): a chip's 30px height, 8px radius and `--space-2` padding (DESIGN.md, New-session dialog: "Setting chips are 30px with an 8px radius"), so it stands level with the chips beside it; sm is the kit's 30px Button shape (10px radius, `--space-3` padding). Same height by design, different shape.
