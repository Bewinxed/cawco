# Shared sheets: `ns-theme.css` and `workflows.css` as Tailwind utilities

Spec for the contracts phase. It runs on the merged tree once the 31 lanes have
landed, and changes each sheet and its consumers together.

**Invariant.** A class is a style, a state is an attribute, a hook is
`data-slot`. Nothing the owner sees changes: on every surface, every computed
style is the one the frozen base `6001f5afa` gives.

Sheets:
- `apps/dashboard/src/lib/cawco/spawn/ns-theme.css` (394 lines; the new-session dialog, SessionDetails, the account popovers).
- `apps/dashboard/src/lib/components/features/workflows/workflows.css` (200 lines; the workflow pages, every flow canvas).

All paths below are under `apps/dashboard/src/`. Consumer line numbers are the
foundation tree (`cawco/33d9b8b1`, fe99827eb) and point at the element's opening tag.
Sheet line numbers are today's sheet.

---

## 0. The base facts the cascade turns on

Each fact here was measured, not assumed. The table in §3 rests on them.

1. **Svelte 5 adds exactly (0,1,0) to a scoped selector.** The first compound
   takes `.svelte-h` and every later one takes `:where(.svelte-h)`. Base build,
   `2.0x8z8WL1.css`: `.stepped.svelte-okkvo1 .prompt-sec:where(.svelte-okkvo1)>.fai-comb:where(.svelte-okkvo1)`.
   A `:global(...)` part adds only its own weight.
2. **Base load order.** This is the client preload order in the base build's
   `entry/app.*.js` (`__vite__mapDeps`). On a tie, the later stylesheet wins.
   - Node 2 (the app layout, present on every route) has 54 stylesheets. `ns-theme.C2JzPDb7.css` is at 36.
     `SessionDetails.Bze6YUkt.css` is at 42; it holds ModelSection, ToolChips, SessionDetails, AccountSwitch, AccountChip and PermissionSection.
     `2.0x8z8WL1.css` is at 53; it holds NewSessionDialog, TriggerMenu, LocationSection, MachinesChip, ProjectChip, LifetimeChip, SessionFooter and PromptEditor.
     **Every ns consumer loads after the sheet, so a tie goes to the component.**
   - `workflows.C-dXqIgg.css` is the last stylesheet of node 51 (42 of 43), node 55 (5 of 6) and node 56 (7 of 8).
     The workflow components' CSS (`56.q0qPNXlE.css`, `55.CzIRvBZA.css`, `WorkflowCanvasTools.*.css`, `51.*.css`) and @xyflow's `style.css` load before it.
     **On a fresh load of a workflow route, a tie goes to the sheet.**
     The order depends on navigation: a `<link>` keeps its place once inserted.
     So after the project page (node 51, `project/[id]`), `/workflows/[id]` (node 56) appends `56.css` after the sheet, and ties go to the component.
     Nodes, from the base build's `generated/build/client-optimized/nodes/*.js`: 2 is `(app)/+layout.svelte`, 51 is `(app)/project/[id]`, 55 is `(app)/workflows`, 56 is `(app)/workflows/[id]`.
     The base recorded here is the fresh load, which is what a snapshot that opens the URL captures.
3. **What the lanes write.** Plain (0,1,0) utilities. Evidence: S19's SchemaBuilder `.alt` became `col-start-1 row-start-1 flex flex-col gap-space-4 min-w-0`.
   A variant adds its own weight: `hover:` is `.x:hover` (0,2,0) inside `(hover: hover) and (pointer: fine)` (variants.css:7).
4. **Tailwind 4.3.3 sorts generated utilities by property order**, then by declaration count (more come first), then by name. This was probed with `compile()`.
   Source order does not settle a tie between a sheet utility and a lane utility.
   **No winner below rests on such a tie**: each one is settled by layer or by specificity.
5. **Joining app.css moves a sheet before everything.** `app.css` loads in node 0, ahead of every component and library stylesheet.
   After the lanes, the only CSS still unlayered is @xyflow's `style.css`:
   `.svelte-flow__attribution{font-size:10px;…}` and `.svelte-flow__attribution a{color:#999}`.
6. **The house `hover:` variant is not the sheets' hover.** The house variant is `(hover: hover) and (pointer: fine)`; both sheets write `@media (hover: hover)`.
   So a sheet hover stays a media block inside its utility, written as it is today, never `hover:`.
7. **Tailwind syntax (probed):**
   - `@utility x { :where(.ctx &) {…} }` emits `:where(.ctx .x)`.
   - Without `&`, a nested selector becomes a descendant of the utility: `:where(.ctx .x)` without `&` comes out as `.x :where(.ctx .x)`.
   - `.ns-theme&` emits `.ns-theme.ns-pop`.
   - Media blocks and nested rules keep their written order.
   - An `@import` placed after other rules is inlined at its own place.
   - Hand-written `@layer utilities {}` and `@layer components {}` blocks land after the generated ones in their layer.

## 1. The design

The base cascades of the two sheets are opposite (fact 2), so they get opposite treatment.

**ns-theme.css: the sheet that always lost.** Every scoped rule beat it, by
specificity or by load order. As utilities, its rules therefore sit at **zero
specificity**: each nested selector is wrapped whole in `:where()`. Every lane
utility then beats them, as every scoped rule did. Among themselves they still
resolve as at base, because each utility lists its rules in base precedence:
base specificity ascending, then source order. With every rule at zero, source
order inside one `@utility` decides, and no two ns utilities on one element
share a property (checked in §3).

Two declarations keep weight, because at base they beat something other than
the sheet:
- **E1:** the drawer card's font and colour.
- **E2:** the static chip's cursor.

The element and library rules go to `@layer components` (below every utility,
where the scoped rules used to beat them), plus three carve-outs in hand-written
`@layer utilities`:
- **K1:** kit controls' font, colour and transition.
- **K2:** the kit Input's placeholder.
- **K3:** the phone popover's 44px buttons.

**workflows.css: the sheet that won its ties.** It loaded after its consumers,
so its shared utilities **keep base specificity**: a lane's (0,1,0) loses to the
sheet's (0,2,0), as the scoped rule lost the tie. Three declarations go to zero
or to a state, where a scoped rule out-specified the sheet:
- **W1:** the wf-btn's display.
- **W4:** the wf-btn's min-height.
- **W2:** a new `quiet` state.

The element rules stay **plain unlayered CSS**, because at base they beat every
kit utility, variants included. Two exclusions stop them from beating the
shared utilities that used to win (**X1**, **X2**). The attribution rules gain
`.svelte-flow ` (**X3**) to keep beating @xyflow now that they load first.

**Joining the entry graph.**
- In `app.css`, right after the `shimmer` block's closing `@media (prefers-reduced-motion: reduce) { .shimmer … }` (today app.css:2295-2301), add:
  `@import "./lib/cawco/spawn/ns-theme.css";` and `@import "./lib/components/features/workflows/workflows.css";`
  The imports go below `app.css:1297-1728`, so those lines do not move.
- Delete the seven consumer import lines:
  - `lib/cawco/spawn/NewSessionDialog.svelte:125`
  - `lib/cawco/workspace/SessionDetails.svelte:49`
  - `lib/cawco/accounts/AccountMachines.svelte:25`
  - `lib/cawco/decisions/graph/DecisionGraph.svelte:21`
  - `lib/cawco/views/ViewCanvas.svelte:26`
  - `routes/(app)/workflows/+page.svelte:25`
  - `routes/(app)/workflows/[id]/+page.svelte:4`
- Both sheets were already global once loaded. ns-theme.css loaded with node 2 on every route. Every flow canvas (DecisionGraph, ViewCanvas, WorkflowCanvas on the workflow pages) imported workflows.css.
  So loading them from the start reaches no element they did not already reach.
- `@keyframes` stay in the sheet as written: `ns-in`, `ns-check`, `ns-panel`, `ns-pop-out`, `ns-pop-in`.
  Components name `ns-in` and `ns-panel` by name (LifetimeChip.svelte:101, ProjectChip.svelte:259, NewSessionDialog.svelte:2188,2251).

**Modifier classes become attributes.** Attribute and class weigh the same
(0,1,0), so a modifier state keeps the specificity its class had. No named
variant is needed: the states are read inside the utilities, and no consumer
writes `size-sm:` and the like. `bun run variants` generates one from any
`[data-x="y"]` in a `.svelte` selector if a later change needs one.

| today | becomes | variant name, if markup ever needs one |
|---|---|---|
| `.ns-btn.sm` | `[data-size="sm"]` | `size-sm:` (next to the existing `size-small`, `size-compact`) |
| `.ns-btn.xs` | `[data-size="xs"]` | `size-xs:` |
| `.ns-btn.primary` | `[data-variant="primary"]` | `variant-primary:` (exists) |
| `.ns-tile.dashed` | `[data-variant="dashed"]` | `variant-dashed:` |
| `.ns-tile.ink` | `[data-variant="ink"]` | `variant-ink:` |
| `.ns-chip-btn.static` | `[data-variant="static"]` | `variant-static:` |
| `.ns-chip-btn > svg.chevron` (a part) | `> svg[data-slot="chevron"]` | hook |
| `.ns-chip-btn .chip-label` (a part) | `[data-slot="chip-label"]` | hook |
| `.perms.embedded` inside `:has()` | `[data-slot="perms"][data-embedded="true"]` | hook + `embedded-true:` |
| (new, W2) run filter | `.wf-btn[data-variant="quiet"]` | `variant-quiet:` (exists) |

`static` cannot stay a class under the same name: Tailwind's `static` is
`position: static`. `full-send` (ToolChips) is ToolChips' own state, and
`data-variant="static"` leaves `data-tone` free for it.

---

## 2. Part 1: every rule of both sheets, classified

Key:
- **U** = into `@utility <name>`.
- **U0** = the same at zero specificity: the whole selector wrapped in `:where()`, with `&` for the class.
- **F/c** = foreign-dom in `@layer components`.
- **F/u** = foreign-dom in hand-written `@layer utilities`.
- **F/–** = foreign-dom, plain and unlayered.

Every foreign rule carries the comment `/* foreign-dom */` on the line above it.

### ns-theme.css (today's lines)

| lines | selector (spec) | becomes | written as |
|---|---|---|---|
| 8-19 | `.ns-theme` (0,1,0): `--ns-*`, font, color | U0 `ns-theme` | `:where(&) {…}` |
| (E1) | the same font and color on the drawer card | U `ns-theme`, kept weight | `&[data-slot="drawer-content"] { font: var(--type-body); color: var(--ink-strong) }` (0,2,0) |
| 21-25 | `.ns-theme *, ::before, ::after` box-sizing | F/c | as is |
| 26-35 | `.ns-theme button` font, color, transition (+no-pref) | F/c | as is |
| (K1) | the same declarations on kit controls | F/u | `.ns-theme button:where([data-slot="button"], [data-slot="collapsible-trigger"]) { font: inherit; color: inherit; transition: …; @media (prefers-reduced-motion: no-preference) { transition: … } }` (0,1,1) |
| 38-42 | `.ns-theme button:not(.press-tint, :disabled, [aria-busy="true"]):active` [no-pref] | F/c | as is (`.press-tint` is app.css's class) |
| 43-46 | `.ns-theme input`, `.ns-theme [contenteditable]` font-family | F/c | as is |
| 47-49 | `.ns-theme input::placeholder` | F/c | as is |
| (K2) | the same on the kit Input | F/u | `.ns-theme input:where([data-slot="input"], [data-slot="input-group-control"])::placeholder { color: var(--ink-subtle) }` (0,1,2) |
| 50-59 | `.ns-theme .fai-comb` | U0 `fai-comb` | `:where(.ns-theme &)` |
| 60-63 | `.ns-theme .fai-scroll` | U0 `fai-scroll` | `:where(.ns-theme &)` |
| 64-76 | `.fai-scroll::-webkit-scrollbar`, `-thumb`, `-track` | U0 `fai-scroll` | `:where(.ns-theme &)::-webkit-scrollbar` etc. (a pseudo-element stays outside `:where`) |
| 79-90 | `.ns-theme .ns-tile` | U0 `ns-tile` | `:where(.ns-theme &)` |
| 91-93 | `.ns-theme .ns-tile svg` | F/c | as is |
| 94-98 | `.ns-tile.dashed` | U0 `ns-tile` | `:where(.ns-theme &[data-variant="dashed"])` |
| 99-103 | `.ns-tile.ink` | U0 `ns-tile` | `:where(.ns-theme &[data-variant="ink"])` |
| 107-136 | `@keyframes ns-in, ns-check, ns-panel` | kept | as is |
| 137-142 | `.ns-theme .ns-in` [no-pref] | U0 `ns-in` | `@media (prefers-reduced-motion: no-preference) { :where(.ns-theme &) {…} }` |
| 143-147 | `.ns-theme .ns-check` [no-pref] | U0 `ns-check` | as above |
| 148-152 | `.ns-theme .ns-panel` [no-pref] | U0 `ns-panel` | as above |
| 155-173 | `.ns-theme .ns-btn` | U0 `ns-btn` | order inside `ns-btn`: this rule; `[data-size="sm"]` (174); `[data-variant="primary"]` (182); `:disabled` (188); `[data-size="xs"]` (265); hover (193); primary hover (196). That is base precedence: (0,2,0), then (0,3,0) in source order, then (0,4,0), then (0,5,0). |
| 174-181 | `.ns-btn.sm` | U0 `ns-btn` | `:where(.ns-theme &[data-size="sm"])` |
| 182-186 | `.ns-btn.primary` | U0 `ns-btn` | `:where(.ns-theme &[data-variant="primary"])` |
| 188-191 | `.ns-btn:disabled` | U0 `ns-btn` | `:where(.ns-theme &:disabled)` |
| 192-199 | `@media (hover: hover)` `.ns-btn:not(:disabled):hover`, `.ns-btn.primary:not(:disabled):hover` | U0 `ns-btn` | the media kept; `:where(.ns-theme &:not(:disabled):hover)`, `:where(.ns-theme &[data-variant="primary"]:not(:disabled):hover)` |
| 265-271 | `.ns-btn.xs` | U0 `ns-btn` | `:where(.ns-theme &[data-size="xs"])` |
| 202-227 | `.ns-theme .ns-chip-btn` (+no-pref transition) | U0 `ns-chip-btn` | order: this rule; hover (243); `[data-variant="static"]` (254); static hover (259). Parts follow. |
| 228-232 | `.ns-chip-btn > svg` | F/c | as is |
| 233-237 | `.ns-chip-btn > svg.chevron` | U0 `ns-chip-btn` | `:where(.ns-theme & > svg[data-slot="chevron"])` |
| 238-242 | `.ns-chip-btn .chip-label` | U0 `ns-chip-btn` | `:where(.ns-theme & [data-slot="chip-label"])` |
| 243-247 | `@media (hover: hover)` `.ns-chip-btn:hover` | U0 `ns-chip-btn` | the media kept |
| 254-258 | `.ns-chip-btn.static` | U0 `ns-chip-btn`, and **E2** | `:where(.ns-theme &[data-variant="static"]) { background; border-color }`, then `.ns-theme &[data-variant="static"] { cursor: default }` at its base (0,3,0) |
| 259-263 | `@media (hover: hover)` `.ns-chip-btn.static:hover` | U0 `ns-chip-btn` | the media kept |
| 274-302 | `.ns-theme.ns-pop` (+no-pref transition) | U0 `ns-pop` | `:where(.ns-theme&)`. Order inside `ns-pop`: this rule; the phone block (382-390); `[data-state="closed"]` (305); `[data-state="open"]` (320); `[data-morph]` (351); `:has(perms)` (339). That is (0,2,0) in source order, then (0,3,0), then (0,4,0), so the phone width still yields to `:has(perms)`. |
| 305-309 | `.ns-pop[data-state="closed"]` [no-pref] | U0 `ns-pop` | `:where(.ns-theme&[data-state="closed"])` |
| 310-315, 325-331 | `@keyframes ns-pop-out`, `ns-pop-in` | kept | as is |
| 320-324 | `.ns-pop[data-state="open"]` [no-pref] | U0 `ns-pop` | as above |
| 339-342 | `.ns-theme.ns-pop:has(.perms.embedded)` | U0 `ns-pop` | `:where(.ns-theme&:has([data-slot="perms"][data-embedded="true"]))` |
| 345-350 | `.ns-panel-set` (0,1,0) | U0 `ns-panel-set` | `:where(&)` |
| 351-360 | `.ns-theme.ns-pop[data-morph]` (+no-pref) | U0 `ns-pop` | `:where(.ns-theme&[data-morph])` |
| 364-370 | `.ns-pop .ns-morph` (+no-pref) | U0 `ns-morph` | `:where(.ns-pop &)` |
| 371-375 | `[data-bits-floating-content-wrapper]:has(> .ns-pop[data-morph])` [no-pref] | F/c | as is |
| 382-390 | `@media (max-width: 640px)` `.ns-theme.ns-pop` | U0 `ns-pop` | the media kept, placed second in `ns-pop` |
| 391-393 | `@media (max-width: 640px)` `.ns-theme.ns-pop button` | **K3**, F/u | `.ns-theme.ns-pop button { min-height: 44px }` at (0,2,1) |

That is **12 shared utilities**: `ns-theme`, `fai-comb`, `fai-scroll`, `ns-tile`,
`ns-in`, `ns-check`, `ns-panel`, `ns-btn`, `ns-chip-btn`, `ns-pop`,
`ns-panel-set`, `ns-morph`.

It leaves **9 foreign-dom rules**: box-sizing, button, button:active, input and
contenteditable, placeholder, tile svg, chip svg, bits wrapper, and phone
button (K3). It adds **2 kit carve-outs** (K1, K2) and keeps **5 keyframes**.

### workflows.css (today's lines)

| lines | selector (spec) | becomes | written as |
|---|---|---|---|
| 1-6 | `.wf` (0,1,0) | U `wf` | `& {…}` |
| 7-21 | `.wf h1`, `.wf h2`, `.wf h3` | F/– | as is |
| 22-29 | `.wf label` | F/–, split (**X1**) | `.wf label { color; font-size; font-weight }` and `.wf label:where(:not(.wf-check)) { display: flex; flex-direction: column; gap: var(--space-2) }`. Both stay (0,1,1). |
| 30-42 | `.wf input:not([type="checkbox"]), .wf select, .wf textarea` | F/–, split (**X2**) | the group without `font`, then `.wf input:not([type="checkbox"]), .wf select, .wf textarea:where(:not(.wf-mono)) { font: inherit }` |
| 46-48 | `.wf select` height | F/– | as is |
| 49-52 | `.wf textarea` resize, min-height | F/– | as is |
| 53-57 | `.wf input[type="checkbox"]` | F/– | as is |
| 63-67 | `.svelte-flow__attribution` | F/–, **X3** | `.svelte-flow .svelte-flow__attribution` (0,2,0) |
| 68-73 | `.svelte-flow__attribution a` | F/–, X3 | `.svelte-flow .svelte-flow__attribution a` (0,2,1) |
| 74-76 | `.svelte-flow__attribution a:focus-visible` | F/–, X3 | `.svelte-flow .svelte-flow__attribution a:focus-visible` |
| 77-95 | `.wf .wf-btn` | U `wf-btn`, with **W1** and **W4** | `:where(.wf) :where(&) { display: inline-flex; min-height: 36px }`, then `.wf & {` the rest `}` (0,2,0) |
| 97-101 | `@media (prefers-reduced-motion: no-preference)` `.wf .wf-btn:active:not(…)` | U `wf-btn` | `.wf &:active:not(:disabled, [aria-busy="true"])` |
| 115-119 | `.wf .wf-btn[aria-pressed="true"]` | U `wf-btn` | `.wf &[aria-pressed="true"]` (0,3,0) |
| (W2) | the run filters' look | U `wf-btn`, after the pressed rule | `.wf &[data-variant="quiet"] { background: transparent; filter: none }` (0,3,0) |
| 178-182 | `@media (hover: hover)` `.wf .wf-btn:hover:not(:disabled)` | U `wf-btn` | `.wf &:hover:not(:disabled)` (0,4,0) |
| 187-190 | `@media (max-width: 1023px), (pointer: coarse)` `.wf .wf-btn` | U `wf-btn`, W4 | `:where(.wf) :where(&) { min-height: 44px }` and `.wf & { min-width: 44px }` |
| 102-106 | `.wf .wf-primary` | U `wf-primary` | `.wf &` |
| 107-111 | `@media (hover: hover)` `.wf .wf-primary:not(:disabled):hover` | U `wf-primary` | `.wf &:not(:disabled):hover` |
| 120-123 | `.wf button:disabled` | F/– | as is (0,2,1) |
| 124-129 | `.wf .wf-row` | U `wf-row` | `.wf &` |
| 130-132 | `.wf .wf-spread` | U `wf-spread` | `.wf &` |
| 133-138 | `.wf .wf-stack` | U `wf-stack` | `.wf &` |
| 139-146 | `.wf .wf-well` | U `wf-well` | `.wf &` |
| 147-153 | `.wf .wf-error` | U `wf-error` | `.wf &` |
| 154-158 | `.wf .wf-muted` | U `wf-muted` | `.wf &` |
| 159-165 | `.wf .wf-mono, .wf pre` | split: U `wf-mono` (`.wf &`); `.wf pre` F/– | same declarations in both |
| 166-172 | `.wf .wf-check` | U `wf-check` | `.wf &` |
| 173-177 | `.wf .wf-fields` | U `wf-fields` | `.wf &` |
| 184-186 | phone and coarse `.wf .wf-fields` | U `wf-fields` | the media kept |
| 191-199 | phone and coarse `.wf input…, select, textarea`, `.wf select` | F/–, X2 | `font-size: 16px` moves to `.wf input:not([type="checkbox"]), .wf select, .wf textarea:where(:not(.wf-mono))`; `min-height` and `select { height }` as is |

That is **12 shared utilities**: `wf`, `wf-btn`, `wf-primary`, `wf-row`,
`wf-spread`, `wf-stack`, `wf-well`, `wf-error`, `wf-muted`, `wf-mono`,
`wf-check`, `wf-fields`. It leaves **11 foreign-dom rules**: h1, h2, h3,
label (split in two), fields (split in two), select, textarea, checkbox,
button:disabled, pre, the phone fields, and the attribution ×3.

Across the two sheets that is **24 classes as utilities** and **9 modifier
classes and parts as attributes**.

---

## 3. Part 3: the cascade table

Each row reads element (file:line) · property · winner before (base `6001f5afa`,
unlayered sheet, fact 2's load order) · winner after · what keeps it. "lane"
means the utility a lane writes in place of a scoped rule (fact 3). A row with
"same value" changes nothing whichever side wins.

### ns side (base: the sheet loads before every consumer)

| # | element | property | before | after | kept by |
|---|---|---|---|---|---|
| 1 | TriggerMenu.svelte:55 tile `ns-tile tile` | border-radius | TriggerMenu `.tile` (0,2,0) ties `.ns-theme .ns-tile` (0,2,0); 2.css loads later → `--radius-xs` | lane `rounded-xs` (0,1,0) beats U0 | U0 |
| 2 | TriggerMenu popover `#trigger-menu-popover.ns-pop` (NsPopover.svelte:152) | padding | `:global(#trigger-menu-popover.ns-pop)` (1,1,0) → 4px | S13's rule or utility (≥0,1,0) beats U0 | U0 |
| 3 | ToolChips' chips inside ModelSection's tools row (ModelSection.svelte:466-468) | height; background at rest, hover, static, static hover | `.tools :global(.ns-chip-btn.tool)` (0,4,0) beats `.ns-chip-btn` (0,2,0), hover (0,3,0) and static (0,3,0); ties static hover (0,4,0), SessionDetails.css loads later → 28px, `--surface-raised` in every state | lane beats U0 | U0 |
| 4 | ToolChips.svelte:117 `ns-chip-btn tool off` | cursor | `.off` (0,2,0) ties `.ns-chip-btn` (0,2,0), loads later → not-allowed | lane `cursor-not-allowed` beats U0 | U0 |
| 5 | ToolChips.svelte:117 `off` while readonly (`static`) | cursor | `.ns-chip-btn.static` (0,3,0) beats `.off` (0,2,0) → default | `.ns-theme .ns-chip-btn[data-variant="static"]` (0,3,0) beats lane (0,1,0) | **E2** |
| 6 | ToolChips.svelte:117 off chip | background on hover | `.tool-chips .off:hover` (0,4,0) beats hover (0,3,0) and ties static hover (0,4,0), loads later; `.off.static:hover` (0,5,0) → raised (recess while static) | lane hover beats U0 | U0 |
| 7 | ToolChips.svelte:148,191 full-send chips | background, border-color, color; hover background; chevron color | `.tool-chips :global(.ns-chip-btn.tool.full-send…)` (0,5,0)/(0,6,0)/(0,6,1) beat the sheet → attn colours | lane beats U0 | U0 |
| 8 | SessionDetails.svelte:643,685 and AccountSwitch.svelte:60,112 chips in `.settings` | gap, height; under 640px: height, padding-inline | `.settings :global(.ns-chip-btn)` (0,3,0) beats (0,2,0) → 4px gap, 28px (44px on a phone) | lane beats U0 | U0 |
| 9 | SessionDetails model popover (`.ns-pop:has(> .model-pop)`) | width, min-width, max-width, max-height, overflow | `:global(.ns-theme.ns-pop:has(> .model-pop))` (0,3,0) beats `.ns-theme.ns-pop` and its phone block (0,2,0) | lane or kept global beats U0 | U0 |
| 10 | SessionDetails.svelte:774 `ns-btn primary xs` | height under 640px | `.footer .ns-btn` (0,3,0) ties `.ns-btn.xs` (0,3,0), loads later → 44px (the file's own comment at :1078) | lane beats U0 | U0 |
| 11 | LocationSection.svelte:335 `ns-btn sm primary` | white-space | `.use .ns-btn` (0,3,0) → nowrap | lane → nowrap | same value |
| 12 | LocationSection.svelte:233 `browse ns-in` | animation while disabled | `.browse:disabled` (0,3,0) beats `.ns-in` (0,2,0) → none | lane `disabled:` (0,2,0) beats U0 | U0 |
| 13 | AccountSwitch chips (`account-chip`) | max-width / max-inline-size | `.ns-chip-btn` (0,2,0) beats `:global(.account-chip)` (0,1,0) → 100% | lane → 100% | same value |
| 14 | NewSessionDialog.svelte:1755 DrawerContent `session-card ns-theme` | font (every longhand), color | `.ns-theme` unlayered beats the kit's `text-foreground text-label` (drawer-content.svelte:75) → `--type-body`, `--ink-strong` | `.ns-theme[data-slot="drawer-content"]` (0,2,0) beats the kit (0,1,0) | **E1** |
| 15 | SessionDetails.svelte:574 `session-details ns-theme` | font-size, font-weight, color; font-family and line-height | `.session-details` (0,2,0) beats `.ns-theme` (0,1,0) for size, weight and colour; family and line-height come from `.ns-theme`'s `font` | lane beats U0 for size, weight and colour; family and line-height still from U0 | U0. Lane check: Tailwind's `text-body` also sets line-height when the theme gives `--text-body--line-height`; the base took line-height from `--type-body`. |
| 16 | buttons with a scoped rule in the dialog and popovers: LocationSection override, browse, crumb, folder; Lifetime, Permission, Machines, Project and TriggerMenu rows; ModelSection rows and clear; Rail `.rail-item`; Segmented `.tab`; AttachButton `.att-btn`; AttachmentChips; CopyBox `.copy`; AccountChip and AccountSwitch `.option` | font, color, transition | the scoped rule (≥0,2,0) beats `.ns-theme button` (0,1,1); where it sets no transition (Lifetime, Permission, TriggerMenu and ModelSection rows), `.ns-theme button` supplies one | lane beats `.ns-theme button` in `@layer components`; the transition stays where no lane sets one | F/c |
| 17 | kit `<Button>`, `<CopyButton>` and `<InputGroup.Button>` (all render the kit Button, `data-slot="button"`) in the account popovers: DevicePanel.svelte:96,99,109; KeyPanel.svelte:138,192; SigninPanel.svelte:39,49,81 | font, color, transition | `.ns-theme button` unlayered beats the kit's `font-medium text-body leading-none`, `text-[var(--on-action)]` and `[transition:…]` → inherited font and colour. A default (primary) kit Button shows `--ink-strong` on the action surface. | K1 (0,1,1) beats the kit (0,1,0); no kit variant sets these properties | **K1** |
| 18 | MoveAsk.svelte:22 `Collapsible.Trigger.move-details-trigger` (the dialog's move step) | font, color; colour on hover | `.ns-theme button` (0,1,1) beats `:global(.move-details-trigger)` (0,1,0) → inherited; `:global(.move-details-trigger:hover)` (0,2,0) beats it → `--ink-strong` on hover | K1 (0,1,1) beats lane `type-label text-ink-muted` (0,1,0); lane `hover:text-ink-strong` (0,2,0) beats K1 | **K1** at (0,1,1), deliberately under (0,2,0) |
| 19 | SigninPanel.svelte:70 kit `<Input>` (`data-slot="input"`); KeyPanel.svelte:128 `<InputGroup.Input>` (`data-slot="input-group-control"`) | `::placeholder` color | `.ns-theme input::placeholder` (0,1,2) unlayered beats `placeholder:text-muted-foreground` (0,1,1) → `--ink-subtle` | K2 (0,1,2) beats the kit | **K2** |
| 20 | AccountChip and AccountSwitch `.option` in their popovers | min-height under 640px | `.ns-theme.ns-pop button` (0,2,1) beats `.option { min-block-size: 40px }` (0,2,0); the logical and physical forms cascade together → 44px | K3 (0,2,1) in utilities beats lane (0,1,0) | **K3** |
| 21 | CopyBox.svelte:29 `.copy` (MachinesChip popover); every other button in a popover | min-height under 640px | `.ns-theme.ns-pop button` → 44px; no scoped rule sets min-height except `.crumb` and `.use .ns-btn` (both 44px) | K3 | K3 |
| 22 | the sheet against itself: `ns-btn` and `ns-chip-btn` buttons | font, color | `.ns-theme .ns-btn` and `.ns-chip-btn` (0,2,0) beat `.ns-theme button` (0,1,1) | utilities beat components | layers |
| 23 | SessionFooter.svelte:37,45; MachinesChip:100; ProjectChip:155,164; LocationSection:335; SessionDetails:774 (`ns-btn`) | transition | only `.ns-theme button` sets it | F/c, nothing above it | F/c |
| 24 | the sheet against itself: chip icons | width, height | `> svg.chevron` (0,3,1) beats `> svg` (0,2,1) → 12px | chevron U0 (utilities) beats `> svg` (components) | layers |
| 25 | the sheet against itself: the perms popover on a phone (`:has(perms embedded)`) | width | `:has(.perms.embedded)` (0,4,0) beats the phone block (0,2,0) → max-content | same `@utility`, zero weight, written last | order in `ns-pop` |
| 26 | the sheet against itself: the primary ns-btn | background on hover | `.ns-btn:not(:disabled):hover` (0,4,0) beats primary (0,3,0); primary hover (0,5,0) beats both → `--action-surface-hover` | ordered as base precedence in `ns-btn` | order in `ns-btn` |
| 27 | the sheet against itself: static chips | background on hover | `.static` (0,3,0, line 254) is later than `:hover` (0,3,0, line 244); static hover (0,4,0) → recess | ordered: hover, static, static hover | order in `ns-chip-btn` |
| 28 | `ns-in`, `ns-check`, `ns-panel`, `ns-tile`, `ns-morph`, `ns-panel-set`, `fai-comb`, `fai-scroll` everywhere else | — | no scoped rule or utility shares a property (rows: position, flex, colour; tiles: width and height; check svgs: size and colour; `.pair`/`.form`: grid; `.list`/`.body`/`.editor`: overflow; `kit-sheet-scroll`: scroll-timeline only) | — | none needed |
| 29 | `.ns-theme` and `.ns-pop` on one element; `.ns-tile` with `.tile`; `.ns-in` with `.row` | — | no two sheet utilities on one element share a property | — | none needed |

### wf side (base: the sheet loads after its consumers on a fresh load)

| # | element | property | before | after | kept by |
|---|---|---|---|---|---|
| W-a | WorkflowEditor.svelte:626,634 `wf-btn narrow-only` | display | `.wf-btn.narrow-only` (0,3,0) beats `.wf .wf-btn` (0,2,0) → none (inline-flex under 1024px) | lane `hidden max-wide:inline-flex` beats the zero-weight display | **W1** |
| W-b | WorkflowEditor.svelte:742 run filters (its `wf-btn` at :751) | background at rest and pressed; filter at rest | `.filters :global(.wf-btn)` (0,3,0) beats `.wf .wf-btn`; `.filters :global(.wf-btn[aria-pressed="true"])` (0,4,0) beats `[aria-pressed]` (0,3,0) → transparent. Hover filter (0,4,0) beats the unpressed rule (0,3,0) and ties the pressed one, the sheet loading later → `brightness(0.96)` on hover in both. | `[data-variant="quiet"]` (0,3,0) after `[aria-pressed]` (0,3,0) → transparent; the hover filter (0,4,0) still wins | **W2**. The contracts phase deletes S19's replacement for `.filters :global(.wf-btn…)`. |
| W-c | WorkflowLaunch.svelte:248,257 (inside `wf-launch`) | min-height | `.wf-launch :global(button)` (0,2,1) beats `.wf .wf-btn` (0,2,0) → 44px | whatever S19 writes for it ((0,1,0) on the button, or (0,1,1) as `[&_button]:` on the wrapper) beats the zero-weight min-height | **W4** |
| W-d | WorkflowProgram.svelte:50 `problems wf-stack` | gap | `.problems` (0,2,0) ties `.wf .wf-stack` (0,2,0); the sheet loads later → `--space-4` | `.wf .wf-stack` (0,2,0) beats lane `gap-space-2` (0,1,0) | U at base weight. S19 must not "correct" this to `--space-2`. |
| W-e | routes/(app)/workflows/+page.svelte:206 `wf-btn desktop` | display under 760px | `!important` → none | lane `!` utility | important |
| W-f | WorkflowEditor breadcrumb input (`.breadcrumb input`) | border-color, font-size, font-weight | `.breadcrumb input` (0,2,1) ties `.wf input:not([type="checkbox"])` (0,2,1); the sheet loads later → control border, inherited font | unlayered foreign beats lane | F/– (fact 2's navigation caveat applies) |
| W-g | kit controls under `.wf`: WorkflowRunView Button, Input, Textarea, Label; WorkflowLaunch Dialog.Title and Description | font, colour, border, label layout | unlayered foreign rules beat kit utilities, variants included (`aria-invalid:border-destructive` (0,2,0) loses to `.wf textarea` border) | unchanged: still unlayered | F/– |
| W-h | `label.wf-check`: SchemaBuilder.svelte:106; WorkflowInspector.svelte:374,468,697,1068 | flex-direction (display and gap are equal) | `.wf .wf-check` (0,2,0) beats `.wf label` (0,1,1) → row | `.wf label:where(:not(.wf-check))` leaves it to `wf-check` | **X1** |
| W-i | `textarea.wf-mono`: JsonField.svelte:35, TemplateInput.svelte:112 | font-family, font-size (and 16px under 1024px) | `.wf .wf-mono` (0,2,0) beats `.wf textarea` (0,1,1) → mono, `--text-label`; the other longhands inherit | `.wf textarea:where(:not(.wf-mono))` leaves family and size to `wf-mono`; preflight's `font: inherit` gives the rest, as `.wf textarea` did | **X2** |
| W-j | `input.wf-mono`: TemplateInput.svelte:124, WorkflowInspector.svelte:209,743, WorkflowLaunch.svelte:219 | font-family, font-size | `.wf input:not([type="checkbox"])` (0,2,1) beats `.wf .wf-mono` → inherited, not mono; `white-space` and `overflow-wrap` still from wf-mono | unlayered foreign beats U | F/–, unchanged |
| W-k | every disabled `wf-btn` | cursor | `.wf button:disabled` (0,2,1) beats `.wf .wf-btn` → not-allowed | unlayered foreign beats U | F/– |
| W-l | WorkflowInspector.svelte:228 harness toggles (`wf-btn`, `aria-pressed`, `class:wf-primary`) | background, border-color, color | `[aria-pressed="true"]` (0,3,0) beats `.wf .wf-primary` (0,2,0) → `--surface-fill`, `--ink-strong` | same weights in utilities | U at base weight. This is why the wf side cannot go to zero. |
| W-m | the attribution on every flow canvas | font-size; link colour | workflows.css after @xyflow's `style.css`; ties (0,1,0)/(0,1,1) → `--text-meta`, `--ink-subtle` | `.svelte-flow ` prefix (0,2,0)/(0,2,1) beats @xyflow, which now loads after | **X3** |
| W-n | `.wf` roots: WorkflowCanvasTools.svelte:73, WorkflowEditor.svelte:564,814, WorkflowInspector.svelte:188, WorkflowLaunch.svelte:146, workflows/+page.svelte:107 | — | `.tools`, `.editor`, `.inspector`, `.wf-launch` and `.list-page` share no property with `.wf` | — | none needed |

**Not settled by this spec.** A rule a lane leaves in `<style>` is still
unlayered. It beats every layered sheet rule, and since app.css now loads first,
it also wins every tie with the unlayered wf rules. Before the contracts phase
writes the sheets, it lists every rule the landed lanes kept in `<style>` that
matches an element above, and rechecks that element's row.

---

## 4. Part 2: every consumer site

Shared classes stay as written. Only modifiers, parts and hook reads change. Lane-owned classes on the same elements (`tool`, `off`, `full-send`, `row`, `tile`, `swap`…) are the lanes' and are gone by the time this runs.

| file:line | element | today | becomes |
|---|---|---|---|
| lib/cawco/spawn/NewSessionDialog.svelte:125 | script | `import "./ns-theme.css";` | deleted |
| lib/cawco/workspace/SessionDetails.svelte:49 | script | `import "../spawn/ns-theme.css";` | deleted |
| lib/cawco/accounts/AccountMachines.svelte:25 | script | `import "../spawn/ns-theme.css";` | deleted |
| lib/cawco/decisions/graph/DecisionGraph.svelte:21 | script | `import "#lib/…/workflows.css";` | deleted |
| lib/cawco/views/ViewCanvas.svelte:26 | script | the same | deleted |
| routes/(app)/workflows/+page.svelte:25 | script | the same | deleted |
| routes/(app)/workflows/[id]/+page.svelte:4 | script | the same | deleted |
| app.css (after the shimmer block) | — | — | the two `@import` lines (§1) |
| lib/cawco/spawn/NewSessionDialog.svelte:1755 | DrawerContent | `session-card ns-theme` | unchanged (E1 reads the kit's `data-slot="drawer-content"`) |
| NewSessionDialog.svelte:1788 | Overlay | `session-scrim ns-theme` | unchanged |
| NewSessionDialog.svelte:1793 | Content | `session-card ns-theme` | unchanged |
| NewSessionDialog.svelte:1860 | body | `fai-scroll` | unchanged |
| NewSessionDialog.svelte:1884, 2016 | div | `fai-comb` | unchanged |
| NewSessionDialog.svelte:1911 | span | `ns-chip-btn static` | `ns-chip-btn` + `data-variant="static"` |
| NewSessionDialog.svelte:1917 | span | `class="chip-label"` (has `data-slot="chip-label"`) | class dropped |
| lib/cawco/workspace/SessionDetails.svelte:574 | div | `session-details ns-theme` | unchanged |
| SessionDetails.svelte:527 | span | `class="chip-label"` | class dropped (has the slot) |
| SessionDetails.svelte:643 | NsPopover | `triggerClass="ns-chip-btn tool model-chip"` | unchanged |
| SessionDetails.svelte:657 | `<Down class="chevron" />` | — | `<Down data-slot="chevron" />` |
| SessionDetails.svelte:685 | span | `ns-chip-btn tool static model-chip` | `static` → `data-variant="static"` |
| SessionDetails.svelte:774 | button | `ns-btn primary xs` | `ns-btn` + `data-variant="primary" data-size="xs"` |
| lib/cawco/accounts/AccountSwitch.svelte:54 | span | `class="chip-label"` | class dropped |
| AccountSwitch.svelte:60 | NsPopover | `triggerClass="ns-chip-btn tool account-chip"` | unchanged |
| AccountSwitch.svelte:74 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| AccountSwitch.svelte:112 | span | `ns-chip-btn tool static account-chip` | `static` → `data-variant="static"` |
| lib/cawco/spawn/AccountChip.svelte:68 | NsPopover | `triggerClass="ns-chip-btn tool"` | unchanged |
| AccountChip.svelte:82 | span | `class="chip-label"` | class dropped |
| AccountChip.svelte:85 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| lib/cawco/spawn/LifetimeChip.svelte:45 | NsPopover | `triggerClass="ns-chip-btn"` | unchanged |
| LifetimeChip.svelte:60 | span | `class="chip-label"` | class dropped |
| LifetimeChip.svelte:63 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| LifetimeChip.svelte:68 | button | `row ns-in press-tint` | unchanged |
| LifetimeChip.svelte:81 | span | `ns-tile tile` | unchanged |
| LifetimeChip.svelte:89 | Check | `check ns-check` | unchanged |
| lib/cawco/spawn/LocationChip.svelte:66 | NsPopover | `triggerClass="ns-chip-btn"` | unchanged |
| LocationChip.svelte:84-85 | span | `class="chip-label"` | class dropped |
| LocationChip.svelte:89 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| lib/cawco/spawn/LocationSection.svelte:223 | span | `badge ns-in mark-line` | unchanged |
| LocationSection.svelte:224, 233 | button | `override ns-in`, `browse ns-in` | unchanged |
| LocationSection.svelte:261, 285 | div | `ancestors fai-scroll`, `folders fai-scroll` | unchanged |
| LocationSection.svelte:335 | button | `ns-btn sm primary touch-hit` | `ns-btn touch-hit` + `data-size="sm" data-variant="primary"` |
| lib/cawco/spawn/MachinesChip.svelte:70 | NsPopover | `triggerClass="ns-chip-btn"` | unchanged |
| MachinesChip.svelte:83 | span | `class="chip-label"` | class dropped |
| MachinesChip.svelte:84 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| MachinesChip.svelte:87 | div | `ns-panel pair` | unchanged |
| MachinesChip.svelte:100 | button | `ns-btn sm touch-hit` | `ns-btn touch-hit` + `data-size="sm"` |
| MachinesChip.svelte:115, 141, 144 | button, div | `row ns-in …`, `none ns-in`, `row add ns-in …` | unchanged |
| MachinesChip.svelte:153 | span | `ns-tile tile dashed` | `dashed` → `data-variant="dashed"` |
| lib/cawco/spawn/ModelSection.svelte:304 | Rail | `itemClass="harness-tab ns-in touch-hit press-tint"` | unchanged |
| ModelSection.svelte:378 | div | `list fai-scroll` | unchanged |
| ModelSection.svelte:421 | span | `ns-tile tile ink` | `ink` → `data-variant="ink"` |
| ModelSection.svelte:482 | span | `ns-tile tile vendor` | unchanged |
| lib/cawco/spawn/NsPopover.svelte:121, 138 | trigger | `class="touch-hit {triggerClass}"` | unchanged |
| NsPopover.svelte:152 | Content | `ns-theme ns-pop` (+ `data-ns-pop`) | unchanged |
| lib/cawco/spawn/NsPopoverGroup.svelte:98 | Content | `ns-theme ns-pop` (+ `data-ns-pop`) | unchanged |
| NsPopoverGroup.svelte:113 | script | `focused.closest(".ns-pop")` | `focused.closest("[data-ns-pop]")` (a hook, not a style) |
| NsPopoverGroup.svelte:157, 163 | div | `ns-morph`, `ns-panel-set` | unchanged |
| lib/cawco/spawn/PermissionSection.svelte:77 | root div | `class={["perms", { embedded }]}` | + `data-slot="perms" data-embedded={embedded ? "true" : undefined}` (read by `ns-pop`'s `:has()`) |
| PermissionSection.svelte:94, 109, 120 | row, tile, Check | `row ns-in press-tint`, `ns-tile tile`, `check ns-check` | unchanged |
| lib/cawco/spawn/ProjectChip.svelte:83 | NsPopover | `triggerClass="ns-chip-btn"` | unchanged |
| ProjectChip.svelte:96 | span | `data-slot="swap" data-chip-label class="chip-label swap"` | `data-slot="chip-label"`; `data-chip-label` and `chip-label` dropped (nothing reads `data-chip-label` or `[data-slot="swap"]`) |
| ProjectChip.svelte:102 | span | `clear ns-check` | unchanged |
| ProjectChip.svelte:121 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| ProjectChip.svelte:125 | div | `ns-panel form` | unchanged |
| ProjectChip.svelte:155 | button | `ns-btn sm touch-hit` | `ns-btn touch-hit` + `data-size="sm"` |
| ProjectChip.svelte:164 | button | `ns-btn sm primary touch-hit` | `ns-btn touch-hit` + `data-size="sm" data-variant="primary"` |
| ProjectChip.svelte:185, 195, 203, 208 | rows, tile, Check | `ns-in`, `ns-tile`, `ns-check` | unchanged |
| ProjectChip.svelte:219 | span | `ns-tile tile dashed` | `dashed` → `data-variant="dashed"` |
| lib/cawco/spawn/PromptEditor.svelte:314 | div | `editor fai-scroll` | unchanged |
| lib/cawco/spawn/SessionFooter.svelte:37 | button | `ns-btn touch-hit` | unchanged |
| SessionFooter.svelte:45 | button | `ns-btn primary touch-hit` | `ns-btn touch-hit` + `data-variant="primary"` |
| lib/cawco/spawn/ToolChips.svelte:110, 125, 138 | span | `class="chip-label …"` | `chip-label` dropped (slots present) |
| ToolChips.svelte:117 | span | `["ns-chip-btn tool off", readonly && "static"]` | `ns-chip-btn` + `data-variant={readonly ? "static" : undefined}` |
| ToolChips.svelte:129 | span | `ns-chip-btn tool static` | `data-variant="static"` |
| ToolChips.svelte:148 | span | `["ns-chip-btn tool static", fullSend && "full-send"]` | `data-variant="static"` (full-send is ToolChips' state) |
| ToolChips.svelte:163, 191 | NsPopover | `triggerClass="ns-chip-btn tool…"` | unchanged |
| ToolChips.svelte:176, 204 | `<Down class="chevron" />` | — | `data-slot="chevron"` |
| lib/cawco/spawn/TriggerMenu.svelte:55 | span | `ns-tile tile` | unchanged |
| lib/components/features/workflows/WorkflowEditor.svelte:745 | script | `highlight({ rows: ".wf-btn", … })` | `rows: '[data-slot="run-filter"]'`, with `data-slot="run-filter"` on the filter buttons (a hook read; `.wf-btn` still works if left) |
| WorkflowEditor.svelte:751 | filter buttons | `class="wf-btn"` | + `data-variant="quiet"` (W2) |
| WorkflowEditor.svelte:626, 634 | button | `wf-btn narrow-only` | unchanged (W1 sits in the sheet) |
| every other wf site (126 in all, listed by the same walk; `wf`, `wf-btn`, `wf-primary` incl. `class:wf-primary` at WorkflowInspector.svelte:228, `wf-row`, `wf-spread`, `wf-stack`, `wf-well`, `wf-error`, `wf-muted`, `wf-mono`, `wf-check`, `wf-fields`) in JsonField, SchemaBuilder, TemplateInput, WorkflowCanvasTools, WorkflowEditor, WorkflowInspector, WorkflowLaunch, WorkflowProgram and routes/(app)/workflows/+page.svelte | — | as written | unchanged: they are shared utilities under the same names |

The lanes' own rules that name a sheet part re-point to the hooks:
- `ToolChips` `.tool-chips :global(.ns-chip-btn.tool.full-send > svg.chevron)` → `> [data-slot="chevron"]`.
- `SessionDetails` `.settings :global(.ns-chip-btn:not(.account-chip) > svg.chevron)` → `> [data-slot="chevron"]`.

`wf-primary` stays a class: it is a full style of its own, toggled by
`class:`. `press-tint` and `touch-hit` are app.css's classes and are outside
this contract.

---

## 5. Part 4: PRESERVE.md references to update

`lib/cawco/spawn/PRESERVE.md` cites `ns-theme.css` by line. Several citations
are already wrong today: every popover citation points about ten lines above
its rule. The contracts phase rewrites each citation to the rule's line in the
new sheet.

| PRESERVE.md line | cites | means | that rule in today's sheet |
|---|---|---|---|
| 11 | `ns-theme.css:264-292` | popovers at z-index 90 (`.ns-theme.ns-pop`) | 274-302 |
| 66 | `ns-theme.css:264-292` | the surface's width and height caps and its `minmax(0, 1fr)` column | 274-302 |
| 66 | `ns-theme.css:333-362` | the measured block, `[data-morph]` and `.ns-morph` | 351-370 |
| 67 | `ns-theme.css:363-381` | phones: `calc(100vw - 24px)` by `min(420px, 55dvh, …)`, 44px buttons | 382-394 (now `ns-pop`'s phone block and K3) |
| 85 | `ns-theme.css:8-19` | the dialog's `--ns-*-ms` names | 8-19 (now `@utility ns-theme`) |
| 88 | `ns-theme.css:127-136` | `@keyframes ns-panel` | 127-136 |
| 90 | `ns-theme.css:107-116` | `@keyframes ns-in` | 107-116 |
| 92 | `ns-theme.css:264-321,338-362` | popover enter, exit and glide | 274-331, 351-375 |
| 101 | `ns-theme.css:137-152` | `.ns-in`, `.ns-check`, `.ns-panel` under no-preference | 137-152 |
| 101 | `ns-theme.css:286-321,354-362` | the popover's entrance, exit and glide under no-preference | 296-331, 353-375 |
| 149 | `ns-theme.css` (no line) | the file keeps the `--ns-*-ms` names | unchanged |
| 160 | `ns-theme.css:264-381` | the shared surface, its caps and measured tweens | 274-394 |
| 161 | `ns-theme.css:363-381` | the anchored phone popovers | 382-394 |
| 165 | `ns-theme.css:8-19,107-152,264-362` | the tuned motion values | 8-19, 107-152, 274-375 |
| 165 | `app.css:1297-1321,1697-1728` | the list-swap timings and highlight glides | Stale at the base and at the foundation: those lines are the tab-hang card and the drawer placement. My own reading of what they meant: the list-swap keyframes at app.css:2319-2354 and the highlight properties at app.css:149-167. Recheck them in the same pass; the imports added below them move neither. |

---

## 6. Checks for the contracts phase

- `cd apps/dashboard && bunx eslint -f json` on every consumer file in §4 gives no `shadcn/no-unknown-classes` message that names a class beginning `ns-`, `wf` or `fai-`, or any of `sm`, `xs`, `primary`, `dashed`, `ink`, `static`, `chevron`, `chip-label`.
- `flock /home/bewinxed/.cawco/workspace-cache/xdg/tailwind-landing-build.lock bunx vite build` in apps/dashboard exits 0. In the built CSS:
  - each rule in §2 appears with its declarations unchanged and the selector form §2 gives;
  - `:where(.ns-theme .ns-btn)` and `.wf .wf-btn` are present;
  - no `.ns-btn :where(` (the missing-`&` form, fact 7).
- `bun run typecheck` under the same lock: 0 errors.
- Integration's style-snapshot compare covers the new-session and workflow surfaces. It should also open:
  - an account's machines popover (rows 17, 19, 20);
  - the dialog's move step (row 18);
  - the run filters and a pressed harness toggle (W-b, W-l);
  - a flow canvas's attribution (W-m);
  - the phone width of the perms popover (row 25).
- For the wf rows, the snapshot loads `/workflows/[id]` fresh (fact 2).

**STOP** if a landed lane changed a value this table records as the base winner
(for example W-d's `--space-4` gap), or kept a rule in `<style>` that matches an
element above. Bring the row to the owner instead of choosing.
