# W9-behaviours: the app's behaviour classes, script-written classes, generic names and app.css's custom utilities

Start sha 682ede2877621d672bb0b38815e7d56370494dec. Tailwind 4.3.3 (`tailwindcss@4.3.3`, `@tailwindcss/node` from the repo).

## Skills
defensive-css, moderncss, tailwind-best-practices, interfaces:better-ui, interfaces:better-layout, impeccable, svelte-foundations:coding, emil-design-eng, transitions-dev (transitions, the shimmer, the icon swap), interface-craft (Design Critique, below), ui-observer (Rendered check, below).

## Rules followed
- better-ui: "Transition only what changes" (every converted transition names its properties; none is `all`); "Press scales to 0.96" is overridden by DESIGN.md's 0.97 (`--press-scale`), the project's own value ("Keep the project's component library, tokens and density"); "Gate motion behind the reduced-motion preference" (the shimmer's sweep, the press scale, the icon swap's shrink and the breath sit under `prefers-reduced-motion: no-preference`); "Hover effects only on hover-capable pointers" (no hover added).
- better-layout: "Logical properties for anything that mirrors" (the hit areas are `inset-inline`/`inset-block`); the strategy figure keeps physical `left`/`right` because its geometry is measured from physical client rects (figure.ts places every part inline in px from the stage's top-left).
- Tailwind v4: custom behaviours are `@utility` (tailwindcss.com/docs/adding-custom-styles#adding-custom-utilities); foreign DOM stays in `@layer components` (…#adding-component-classes); a state is an attribute and a variant (`data-settled:`, `in-data-rolling:`, `data-over:`).

## Variant table
W9 owns no kit part with variants: phase 2's `.cutover/no-restyle.txt` and the wave-1 `kit-swap:` lines give it 0 sites (W9-behaviours-sites.md). Its "variants" are one utility per behaviour:

| utility | role | DESIGN.md line | users |
| --- | --- | --- | --- |
| `touch-hit` | a control's 44px touch area | Focus and hit areas, The 44 Touch Rule | 59 files |
| `pointer-hit` | a small control's 24px pointer area | The 24 Pointer Rule | 9 files |
| `mark-line` / `mark-text` / `mark-cell` | words centred on their mark | Typography, The Mark Line Rule | 126 / 8 / 13 files |
| `rail-line` | a transcript rail row, a mark line by its class | Transcript, Rail; The Mark Line Rule | 11 files |
| `icon-swap` | two things in one slot cross-fading | Identity marks, Tree mark ("scale 0.25 to 1, blur 4px to 0") | 9 files |
| `pressable` / `press-tint` | a press: scale a compact control, tint a wide one | Do's: "a compact control scale to 0.97 on press and a wide or grouped one tint" | 33 / 56 files |
| `breathe` | live work's breath | Live work breathes | 2 files |
| `font-mono` | the mono face, never ligated | Typography (code: ligatures off) | everywhere `font-mono` is written |
| `num` | a changing figure, tabular | The Tabular Figure Rule ("carries `.num`") | 106 files |

## Sheet classes
- sheet: pressable → one behaviour used across the app: `@utility pressable` (app.css:4731), its press scale folded in from the `@layer utilities .pressable` rule; `--tw-sort: transition-property` keeps it after a consumer's `transition-colors` as before.
- sheet: press-tint → one behaviour: `@utility press-tint` (app.css:4751), from the unlayered `:is(.press-tint…, #\#)` rule and the `@layer utilities` light-ink rule. ns-theme.css only names it in a `:not()` exclusion (ns-theme.css:64), so there is one definition.
- sheet: touch-hit → one behaviour: `@utility touch-hit` (app.css:4593), from `@layer components`, at zero weight (`:where(&)`) so an element's own `after:` utilities still win.
- sheet: pointer-hit → one behaviour: `@utility pointer-hit` (app.css:4616), as touch-hit.
- sheet: mark-line → one behaviour: `@utility mark-line` (app.css:4662). The kit rows (`.kit-chip`, `.kit-tray-chip`, `.kit-item`, `.kit-segment`, `.kit-section-head`) keep the trim in `@layer components` by `@apply mark-line` (app.css:491), so the declarations exist once.
- sheet: mark-text → one behaviour: `@utility mark-text` (app.css:4651); mark-line applies it.
- sheet: mark-cell → one behaviour: `@utility mark-cell` (app.css:4682).
- sheet: rail-line → already `@utility rail-line`; it now applies `mark-line` (app.css:4061) instead of being listed in the components rule.
- sheet: breathe → one behaviour: `@utility breathe` (app.css:4767), from an unlayered `@media` rule; it takes `--theme(--animate-breath)`, the one breath.
- sheet: icon-swap → one behaviour: `@utility icon-swap` (app.css:4696), from `@layer components`; its 4px blur is `--space-1`.
- sheet: grown-halo → script-written markup, not foreign DOM (grown.ts builds it): utilities in its class string (grown.ts:102, :195); the rule goes. Its press while the wheel is up is `in-data-rolling:`.
- sheet: grown-drop → script-written: utilities in its class string (grown.ts:187); the rule goes.
- sheet: settled → a state written as a class: `data-settled` (grown.ts:227, :425, :497, :518, :557, :580) and the `data-settled:` variant (grown.ts:187).
- sheet: lift-copy → script-written: utilities in its class string (lift.svelte.ts:158); the rule goes.
- sheet: dg, e, ln-lbl, nm, dot, clk, clkw, blk, bar, hr, fl, gh, chip, child, tag, cap → script-written (figure.ts builds the strategy figure; no third party renders it): utilities in figure.ts's `PART` strings (figure.ts:270–300); the 16 `[data-slot="stage"] …` rules go. `.chip.child` (a modifier class) is its own part, `PART.fork`. The script's query for the captions was `.cap`; it is the `data-slot="figure-cap"` hook (figure.ts set at the caption, read in `buildFigure`). The unstyled names `dy`, `lane`, `bars` and `pu`'s share of the strip rule are utilities too (`PART.layer`, `PART.pulse`).
- sheet: active → foreign DOM: Milkdown Crepe writes it (`classList.add("active")`, @milkdown/crepe 7.22.3 lib/esm/feature/block-edit/index.js:1076) on its block handle's `.operation-item`; stays in `@layer components` under `[data-slot="crepe-host"]`.
- sheet: operation-item → foreign DOM, not dead: Crepe renders `class="operation-item"` (block-edit/index.js); stays under `[data-slot="crepe-host"]`. The brief's "no users in src" is true of src, but the user is Crepe.
- sheet: tab-group → foreign DOM, not dead: Crepe's slash menu renders `<nav class="tab-group">` (block-edit/index.js); stays under `[data-slot="crepe-host"]`.
- sheet: dark → stays: it is the theme flip's key (theme.svelte.ts:27 `classList.toggle("dark", …)`, variants.css:108 `@custom-variant dark`, app.css base `:root.dark`).
- sheet: font-mono → one behaviour: `@utility font-mono { font-variant-ligatures: none }` (app.css:4775), which Tailwind adds to its own `font-mono`; the base rule keeps `code, pre` (element defaults) and drops `.font-mono`.
- sheet: chip, dot, bar, child, cap, tag (the generic names) → applied only by the figure's markup; no class attribute or class-list call in src writes them anywhere else (checked by extracting every `class="…"` value and every `className`/`classList` call).

## Kit swaps
None: W9 has no `shadcn/no-restyle` sites. Eight no-restyle flags in W9's listed files name a W9 utility on another kit part, and each is that part's site in phase 2's report: `Delegate.svelte:430`, `Subagent.svelte:83` (`rail-line`, `press-tint` on CollapsibleTrigger, no-restyle.txt:111, :113), `Peer.svelte:190` (`press-tint` on CollapsibleTrigger, :112), `SystemLine.svelte:209`, `:501` (`rail-line` on CollapsibleTrigger, :114–115), `ErrorDialog.svelte:39` (`mark-line` on DialogTitle, :383). They clear when those parts take the variants.

## Removed
- removed: app.css (start 479–538) the `@layer components` touch-hit and pointer-hit rules — now `@utility` (Sheet classes).
- removed: app.css (start 569–603) `.mark-line`, `.rail-line`, `.mark-text` from the components rule and the `.mark-cell` rule — now utilities; the trim's two declarations exist once (`mark-text`).
- removed: app.css (start 1951–1975) the `.icon-swap` component rule — now `@utility`.
- removed: app.css (start 2113–2232) the 16 strategy-figure rules — figure.ts writes utilities.
- removed: app.css (start 2679–2719) the grown-shape and lift-copy rules — grown.ts and lift.svelte.ts write utilities.
- removed: app.css (start 3741–3750) `@utility material-panel` — no users (the theme's `bg-material-panel` is what Shell writes).
- removed: app.css (start 3766–3819) `@utility pressable` + `@layer utilities .pressable`, and the unlayered press-tint rule with its light-ink rule — one `@utility` each now.
- removed: app.css (start 3918–3920) the first of two `@utility gap-inherit` definitions — a duplicate (app.css:4300 stays).
- removed: app.css (start 3938–3940) `@utility hit-gap-coarse-*` and (start 3955–3957) `@utility join-radius-*` — no users; their tailwind-merge groups (utils.ts) go with them.
- removed: app.css (start 4779–4786) `@utility no-scrollbar` — a duplicate of theme.css's generated `no-scrollbar` (its extra `-ms-overflow-style` is IE's).
- removed: app.css (start 4794–4806, 4854–4860) the shimmer's three `@property` registrations, its five `var(--shimmer-*, …)` override hooks (no element sets any of them) and its unlayered reduced-motion `.shimmer` rule — the sweep sits under `no-preference` inside the utility.
- removed: app.css (start 4967–4973) the unlayered `.breathe` rule — now `@utility`.
- removed: app.css `.kit-slot[data-over] { place-items: center start }` — dead once `icon-swap` (on the one kit-slot, pending-content.svelte) is a utility; the site takes `data-over:justify-items-start` (pending-content.svelte:185).

## Tokens
- token: --c-touch-floor 44px — The 44 Touch Rule's floor, read by `touch-hit` (was a hand-kept 44px/22px); cawco.tokens.json:5332.
- token: --c-shimmer-reach 40px — how far past three characters the thinking line's band reaches (was a hand-kept 40px in `shimmer`); cawco.tokens.json:5340.
- `pointer-hit` reads the existing `--c-pointer-floor` (24px) for its hand-kept 24px/12px.

## Theme additions
All in app.css's `/* wave 2: W9-behaviours */` block (app.css:4577–4777), plus the edits to existing utilities below.
theme: utility touch-hit
theme: utility pointer-hit
theme: utility mark-text
theme: utility mark-line
theme: utility mark-cell
theme: utility icon-swap
theme: utility pressable
theme: utility press-tint
theme: utility breathe
theme: utility font-mono

```css
@utility touch-hit {
  @media (pointer: coarse) {
    :where(&) { position: relative; }
    :where(&)::after {
      content: "";
      position: absolute;
      inset-inline: max(min(0px, calc(50% - var(--c-touch-floor) / 2)), calc(var(--hit-gap-x, var(--c-touch-floor)) / -2 - var(--hit-edge, 0px)));
      inset-block: max(min(0px, calc(50% - var(--c-touch-floor) / 2)), calc(var(--hit-gap-y, var(--c-touch-floor)) / -2 - var(--hit-edge, 0px)));
    }
  }
}
@utility pointer-hit {
  @media (pointer: fine) {
    :where(&) { position: relative; }
    :where(&)::after {
      content: "";
      position: absolute;
      inset-inline: max(min(0px, calc(50% - var(--c-pointer-floor) / 2 / var(--hit-scale, 1))), calc(var(--hit-gap-x, var(--c-pointer-floor) / var(--hit-scale, 1)) / -2 - var(--hit-edge, 0px)));
      inset-block: max(min(0px, calc(50% - var(--c-pointer-floor) / 2 / var(--hit-scale, 1))), calc(var(--hit-gap-y, var(--c-pointer-floor) / var(--hit-scale, 1)) / -2 - var(--hit-edge, 0px)));
    }
  }
}
@utility mark-text {
  :where(&) { text-box: trim-both ex alphabetic; padding-block: calc((1lh - 1ex) / 2); }
}
@utility mark-line {
  :where(&) > :where(:not(svg, img, .rail-cell, .kit-keycap, .kit-slot, .icon-swap, .mark-cell, [data-box])) { @apply mark-text; }
}
@utility mark-cell {
  :where(&) { display: grid; flex: none; place-items: center; block-size: 1lh; }
}
@utility icon-swap {
  :where(&) { display: inline-grid; place-items: center; }
  :where(&) > * {
    display: inline-flex;
    grid-area: 1 / 1;
    opacity: calc(1 - var(--swap-away));
    filter: blur(calc(var(--space-1) * var(--swap-away)));
    transition: --swap-away var(--icon-swap-dur, var(--dur-pop)) var(--ease-out);
    @media (prefers-reduced-motion: no-preference) { scale: calc(1 - 0.75 * var(--swap-away)); }
  }
  :where(&) > :where([data-active="false"]) { --swap-away: 1; pointer-events: none; }
}
@utility pressable {
  --tw-sort: transition-property;
  transition: transform var(--dur-toggle) var(--ease-out), box-shadow var(--dur-control) var(--ease-out);
  @media (prefers-reduced-motion: no-preference) {
    &:is(:active, [data-pressed]) { transform: scale(var(--press-scale)); }
  }
}
@utility press-tint {
  &:is(:active, [data-pressed], #\#):not(:disabled, [aria-disabled="true"]) { background-color: var(--surface-pressed); }
  @variant light {
    &:is(:active, [data-pressed]):not(:disabled, [aria-disabled="true"]) {
      --ink-muted: var(--ink-strong); --text-muted: var(--ink-strong); --ink-subtle: var(--ink-strong); --selected-ink: var(--ink-strong);
    }
  }
}
@utility breathe {
  @media (prefers-reduced-motion: no-preference) { animation: --theme(--animate-breath); }
}
@utility font-mono { font-variant-ligatures: none; }
```

Existing utilities changed by the audit: `num` now `@apply tabular-nums` (app.css:4362); `rail-line` applies `mark-line` (app.css:4061); `shimmer` (app.css:4416) as Removed says, its loop on `--breath`, its reach on `--c-shimmer-reach`; `tail-fade`'s opaque stop is `--mask-opaque` (app.css:4368); `hatched`, `pane-tab-pads` and `field-underline`'s hairline 1px is `--border-width` (app.css:3991, :4203, :4345). The held-row tint (`[data-holding]`, utils/longpress.ts) is a plain `@layer utilities` rule (app.css:3448): an attribute any row takes, not a class.

## @utility audit (141 at the start)
Every `@utility` in app.css was counted against src (`.svelte`/`.ts`, the utility's name or functional prefix as a class token). Dead: `material-panel`, `hit-gap-coarse-*`, `join-radius-*` (0 users each) — deleted. Duplicates: `no-scrollbar` (theme.css generates it), the second `gap-inherit`, `num` (Tailwind's `tabular-nums`: kept by DESIGN.md's name, its value now the built-in). Checked against the installed 4.3.3's own output (`compile()` over stock `@import "tailwindcss"`) and not duplicates: `items-box-start` (`items-start` is `flex-start`), `justify-self-box-*`/`self-box-start`/`content-box-start` (the built-ins write `flex-start`), `outline-off` (`outline-none` sets only the style), `transition-off` (`transition-none` sets only the property), `line-clamp-undo` (`line-clamp-none` also sets overflow, display and orientation), `pointer-events-all` (Tailwind has no `all`), `container` (Crepe's foreign `class="container"`, the theme's breakpoints would cap it). Every other utility has users and no built-in twin. Literals not on a token were fixed as above; the remaining numbers are ratios and geometry (the icon swap's 0.75, the sheen's 300%/35%, a dot's 1px radius, the masonry's 1px row unit).

## Custom-property reads
Every `@utility` reading `var(--x)` with no fallback where `--x` is not a token (scratch scan over app.css against tokens.css and every setter in src): `--tint`, `--sheet`, `--pick`, `--flare`, `--arrive-delay`, `--run`, `--c`, `--px`, `--overlap` (each has a setter in src: a `--x:` declaration, an `[--x:…]` or `x-(…)` class, or a `style:--x`), `--x-rail`, `--x-glyph`, `--x-text`, `--w-glyph`, `--x-hang` (set by `tx-columns` on the transcript's root: Transcript, TranscriptSkeleton, WorkflowRunView), `--chev-dur`, `--chev-ease` (set by `divider-chevron` on CompactionDivider's row), `--animate-head-fade` (emitted by the theme, it is used). All are set by their user or an ancestor. `clip-join`/`clip-join-phone` read `--f`, `--h`, `--r`, which nothing sets since wave 1: W-bar-glass holds that fix in its BarGlass part (the parent's message), so this lane leaves those two utilities as they are.

## Compiled check
`@tailwindcss/node` 4.3.3 `compile()` over apps/dashboard/src/app.css, `build()` over every candidate the oxide Scanner finds in src (20079), and the production `vite build` CSS:
- `:where(.touch-hit)::after { … var(--c-touch-floor) … }` inside `@media (pointer: coarse)`, and `:where(.pointer-hit)::after` inside `@media (pointer: fine)`: zero weight, so an element's `after:` utilities (0,1,1, later in sort) win, as they did by layer.
- `:where(:where(.mark-line)>:where(:not(svg,img,…,[data-box]))),:where(.mark-text){text-box:trim-both ex alphabetic;padding-block:calc(.5lh - .5ex)}` — one rule for both (vite build); `@layer components{:where(:where(:where(.kit-chip,…,.kit-section-head))>:where(:not(…))){…}}` — the kit rows' trim stays in components.
- `.rail-line{…display:flex}` and `:where(:where(.rail-line)>:where(:not(…))){text-box:…}`.
- `.press-tint:is(:active,[data-pressed],#\#):not(:disabled,[aria-disabled=true]){background-color:var(--surface-pressed)}` — weighs (1,2,0), so it wins over any utility fill on the element, as the unlayered rule did.
- `.pressable` sorts after `.transition-colors` and before `.transition-tint-press` (start: `.transition-colors` < `[transition:…]` < `.pressable` < `.transition-tint-press`). The one consumer that moves: select-trigger.svelte:63's own `[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)]`, which `pressable` overrode at the start and which now applies (rendered: `transform 0.16s, box-shadow 0.12s` → `background-color 0.12s, border-color 0.12s, color 0.12s, transform 0.16s`). That is the trigger's own declared transition; the press scale's clock is unchanged.
- `.num,.tabular-nums{--tw-numeric-spacing:tabular-nums;font-variant-numeric:var(--tw-ordinal,) …}` — one rule; `.type-meta` still sorts before `.num`.
- `.font-mono{font-family:var(--font-mono)}` (Tailwind's) and `.font-mono{font-variant-ligatures:none}` (the addition).
- `@media (prefers-reduced-motion:no-preference){.breathe{animation:breath var(--breath) var(--ease-in-out) infinite}}`.
The scratch folder ($TMPDIR/scratch) was deleted after the checks.

## Rendered check
`CAWCO_DEV_HUB_URL=http://127.0.0.1:59999 bunx vite dev`, playwright-core with the cached Chromium 1248, `waitUntil: "domcontentloaded"`. Computed style of every element carrying a W9 class (and its children, `::before`, `::after`, and its `data-pressed` state) on 25 benches and /config/accounts at 1440×900 and 390×844, the start sha against this tree:
- 17117 element records: differences only in `justify-items` on the button slot (`icon-swap kit-slot`, fixed: pending-content.svelte:185), the select trigger's transition (above), and /config/accounts' rail rows, which differ between two runs of the same tree (rail order).
- Touch pointer (390×844, `hasTouch`): 9088 records; touch-hit `::after` insets equal. The start sha's run caught a theme-flip frame (`transition-property: none` on 237 elements); with transitions finished, `press-tint` under `data-pressed` is `oklch(0.854 0.014 82)` (`--surface-pressed`) on every pressed control, as at the start.
- Script-built markup (each strategy board, the grown shape at rest, rolling and settled, the lift copy), built through the dev server's own modules: 1216 records; every rect equal; differences only in the chips' `box-shadow`, now Tailwind's ring stack (the same 2px `surface-recess` ring plus transparent zero layers), and `offset-anchor`/`offset-rotate` on chips with no offset path, where they do nothing.
- ui-observer (observer.browser.js in the same session) on breath-floor, updates, button-pending, head-tint and usage-limits: touch-hit areas 44px at least on a coarse pointer (n 2, 31, 42, 7, 2), pointer-hit 24px at least on a fine one (n 10, 9), mark lines within 0.5px of their mark (119 rows, worst 0), `breathe` running `breath`, no horizontal overflow. Its `near-miss-alignment` observations at 390 (5, 8, 22, 1) are in layout this lane does not change (the start-sha diff has no geometry change there).
- The strategy figure renders on Configure → Accounts with an account list (`/config/accounts` with a hub); the grown shape renders on a session's composer with the recall wheel up; the lift copy flies while a queued message is edited. None renders without a hub, hence the module-built check above.

## Design Critique (interface-craft)
Behaviour utilities draw nothing new: the critique is whether each still says what DESIGN.md says.
- fixed: pending-content.svelte:185 the label-less button's slot stood its spinner at the label's start through `.kit-slot[data-over]`, which the utility now outranks — DESIGN.md Buttons, Pending: "A button with no rest icon has no slot of its own and never opens one: the spinner, and then the check, stand over the label's start".
- fixed: app.css:4416 the shimmer's sweep ran on a hand-kept 2s and its reduced-motion state was an unlayered override — DESIGN.md Thinking indicator ("once a breath"), motion opt-in.
- fixed: app.css:4593 the touch floor was a literal 44/22px pair — DESIGN.md The 44 Touch Rule, now `--c-touch-floor`.
- fixed: figure.ts:270 the figure's parts were a second, global recipe keyed on generic names (`.bar`, `.chip`, `.dot`) under any `data-slot="stage"` (TaskReview, TaskTable, ViewMade and the caw bench also carry that slot) — they are the figure's own utilities now.
- fixed: DESIGN.md:736, :757, :948 and .impeccable/design.json:2561, :2619 named the wide-control press tint `surface-fill`; each names `surface-pressed` with the repo's own reason (app.css at 682ede287:3792, "The kit Toggle's on step, `surface-pressed`: by day the hover step is surface-fill's own, so a press under the pointer is the step past it; night keeps surface-fill"; the token's description: "so it never reads as hovered"). A press in `surface-fill` would read as the hover.
- fixed: select-trigger.svelte:63 its own declared `[transition:var(--transition-control),transform_var(--dur-toggle)_var(--ease-out)]` now applies (pressable overrode it at the start sha): the trigger's colours transition with its press scale, the scale's clock unchanged.
- gap: DESIGN.md:511 still says "a mark takes it by the `.breathe` class": true, the class is a utility of the same name now. No text change made (the lane changes no copy).

## Files
The list ($TMPDIR/inputs/W9-behaviours.txt) as staged, plus `DESIGN.md` and `.impeccable/design.json` (the press tint's text), this lane file, `apps/dashboard/src/lib/utils.ts` (the dead groups) and the token outputs `bun run tokens` writes: `apps/dashboard/src/lib/tokens/tokens.ts`, `apps/apple/Packages/CawCoKit/Sources/CawCoDesign/Generated/Tokens.swift`, `packages/hub/skills/decision-page/kit/tokens.css`.
